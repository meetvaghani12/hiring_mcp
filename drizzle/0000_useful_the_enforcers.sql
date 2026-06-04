CREATE TYPE "public"."application_decision" AS ENUM('apply', 'decline');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('submitted', 'declined', 'under_review', 'interviewing', 'rejected', 'hired');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."session_vendor" AS ENUM('claude_code', 'codex_cli');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'submitted' NOT NULL,
	"decision" "application_decision" DEFAULT 'apply' NOT NULL,
	"fit_score" integer,
	"fit_summary" text,
	"fit_gaps" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_candidate_position" UNIQUE("candidate_id","position_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text,
	"token_expires_at" timestamp with time zone,
	"profile_version" integer DEFAULT 1 NOT NULL,
	"linkedin_sub" text,
	"picture_url" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"target_position_id" uuid,
	"name" text,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"github_url" text,
	"current_title" text,
	"current_company" text,
	"company_website" text,
	"location" text,
	"years_of_experience" integer,
	"preferred_working_style" text,
	"notice_period" text,
	"skills" text,
	"summary" text,
	"transformative_books" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "candidates_linkedin_sub_unique" UNIQUE("linkedin_sub")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"description" text NOT NULL,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"external_job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_external_job_id_unique" UNIQUE("external_job_id")
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_log_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"vendor" "session_vendor" NOT NULL,
	"sha256_b64" text NOT NULL,
	"s3_key" text NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"size_bytes" bigint,
	"content_type" text,
	"filename" text,
	"model_names" jsonb,
	"session_started_at" timestamp with time zone,
	"session_ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_target_position_id_positions_id_fk" FOREIGN KEY ("target_position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_log_uploads" ADD CONSTRAINT "session_log_uploads_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_email_idx" ON "candidates" USING btree ("email");