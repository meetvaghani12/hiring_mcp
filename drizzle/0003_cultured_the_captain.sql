ALTER TABLE "candidates" ADD COLUMN "linkedin_sub" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "picture_url" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_linkedin_sub_unique" UNIQUE("linkedin_sub");