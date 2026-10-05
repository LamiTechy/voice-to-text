import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Set it in .env.local to enable accounts and history.");
    this.name = "DatabaseNotConfiguredError";
  }
}

let cached: Database | null = null;

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) return null;
  return url;
}

/**
 * Lazily creates the Drizzle client so that `next build` (and pages rendered
 * without a database) never crash while importing route modules.
 */
export function getDb(): Database {
  if (cached) return cached;
  const url = getDatabaseUrl();
  if (!url) throw new DatabaseNotConfiguredError();
  const client = neon(url);
  cached = drizzle({ client, schema });
  return cached;
}

export { schema };
