ALTER TABLE "candidates" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "profile_version" integer DEFAULT 1 NOT NULL;