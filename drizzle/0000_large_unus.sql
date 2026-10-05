CREATE TYPE "public"."conversion_type" AS ENUM('tts', 'stt');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" "conversion_type" NOT NULL,
	"input_text" text DEFAULT '' NOT NULL,
	"output_text" text DEFAULT '' NOT NULL,
	"audio_url" text,
	"language" varchar(32) DEFAULT 'en' NOT NULL,
	"voice" varchar(120),
	"duration_seconds" integer,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversions_user_idx" ON "conversions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversions_created_idx" ON "conversions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversions_type_idx" ON "conversions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");