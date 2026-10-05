-- ============================================================
--  VoiceBridge — Neon setup script
--  Run this ONCE in the Neon SQL Editor (or via psql).
--  It is idempotent: safe to re-run without breaking existing data.
--
--  1. Copy your connection string from Neon → .env.local → DATABASE_URL
--  2. Paste this file into the Neon SQL Editor and click "Run"
--  3. Start the app:  npm run dev
--  Login:  admin@voicebridge.local / ChangeMe123!
-- ============================================================

-- ---------- Enums ----------
DO $$
BEGIN
  CREATE TYPE "user_role" AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "conversion_type" AS ENUM ('tts', 'stt');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS "users" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"          varchar(80)  NOT NULL,
  "email"         varchar(255) NOT NULL,
  "password_hash" text         NOT NULL,
  "role"          "user_role"  DEFAULT 'user' NOT NULL,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE ("email")
);

-- ---------- conversions ----------
CREATE TABLE IF NOT EXISTS "conversions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"          uuid,
  "type"             "conversion_type" NOT NULL,
  "input_text"       text    DEFAULT '' NOT NULL,
  "output_text"      text    DEFAULT '' NOT NULL,
  "audio_url"        text,
  "language"         varchar(32) DEFAULT 'en' NOT NULL,
  "voice"            varchar(120),
  "duration_seconds" integer,
  "settings"         jsonb DEFAULT '{}'::jsonb,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "conversions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS "users_email_idx"         ON "users"       USING btree ("email");
CREATE INDEX IF NOT EXISTS "conversions_user_idx"    ON "conversions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "conversions_created_idx" ON "conversions" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "conversions_type_idx"    ON "conversions" USING btree ("type");

-- ---------- Seed admin account ----------
-- bcrypt (cost 12) hash of: ChangeMe123!
INSERT INTO "users" ("name", "email", "password_hash", "role")
VALUES (
  'Administrator',
  'admin@voicebridge.local',
  '$2b$12$BinOvkNlLdc8Lm1vwEtgcu/MdhDdS2ACo27jc0u/UoO7NTIv9rSQa',
  'admin'
)
ON CONFLICT ("email") DO UPDATE SET "role" = 'admin';

-- ---------- Verify ----------
SELECT id, name, email, role, created_at FROM "users" ORDER BY created_at;
