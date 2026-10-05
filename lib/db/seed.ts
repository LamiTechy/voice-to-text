import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { getDb } from "./index";
import { users } from "./schema";

/** Minimal .env loader so `npm run db:seed` works without extra dependencies. */
function loadEnvFiles(): void {
  const candidates = [".env.local", ".env"];
  for (const candidate of candidates) {
    const file = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles();

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set (see .env.example).");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters long.");
  }

  const db = getDb();
  const passwordHash = await bcrypt.hash(password, 12);
  const normalizedEmail = email.toLowerCase();

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ role: "admin", passwordHash })
      .where(eq(users.id, existing.id));
    console.log(`Updated existing user ${normalizedEmail} to admin.`);
    return;
  }

  await db.insert(users).values({
    name: "Administrator",
    email: normalizedEmail,
    passwordHash,
    role: "admin",
  });

  console.log(`Seeded admin user ${normalizedEmail}.`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`Seed failed: ${error.message}`);
  } else {
    console.error("Seed failed with an unknown error.");
  }
  process.exitCode = 1;
});
