import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  index,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const conversionTypeEnum = pgEnum("conversion_type", ["tts", "stt"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 80 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

export const conversions = pgTable(
  "conversions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: conversionTypeEnum("type").notNull(),
    inputText: text("input_text").notNull().default(""),
    outputText: text("output_text").notNull().default(""),
    audioUrl: text("audio_url"),
    language: varchar("language", { length: 32 }).notNull().default("en"),
    voice: varchar("voice", { length: 120 }),
    durationSeconds: integer("duration_seconds"),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversions_user_idx").on(table.userId),
    index("conversions_created_idx").on(table.createdAt),
    index("conversions_type_idx").on(table.type),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Conversion = typeof conversions.$inferSelect;
export type NewConversion = typeof conversions.$inferInsert;
