import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const uploadStatus = pgEnum("upload_status", ["pending", "confirmed"]);
export const positionStatus = pgEnum("position_status", ["open", "closed"]);
/**
 * Application pipeline. The candidate's decision sets the entry point —
 * `submitted` (chose to apply) or `declined` (saw the fit, chose not to).
 * Everything after `submitted` is recruiter-owned.
 */
export const applicationStatus = pgEnum("application_status", [
  "submitted",
  "declined",
  "under_review",
  "interviewing",
  "rejected",
  "hired",
]);
// Whether the candidate chose to apply after seeing the fit comparison.
export const applicationDecision = pgEnum("application_decision", ["apply", "decline"]);
export const sessionVendor = pgEnum("session_vendor", ["claude_code", "codex_cli"]);

/** A candidate is identified by the Bearer token they connect with. */
export const candidates = pgTable(
  "candidates",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  // sha-256 hash of the bearer token; the raw token is shown once at mint time.
  tokenHash: text("token_hash").notNull().unique(),
  // Last 4 chars of the token, for masked display on the web UI (e.g. "…aB3x").
  tokenHint: text("token_hint"),
  // When the current token stops working (null = never expires).
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  // Bumped on every update_my_profile; shown as "Profile version N".
  profileVersion: integer("profile_version").notNull().default(1),

  // LinkedIn SSO identity (OIDC `sub`); null for admin/CLI-minted candidates.
  linkedinSub: text("linkedin_sub").unique(),
  pictureUrl: text("picture_url"),
  emailVerified: boolean("email_verified").notNull().default(false),

  // The job the candidate arrived to apply for (from the company "Apply now" link).
  targetPositionId: uuid("target_position_id").references((): any => positions.id, {
    onDelete: "set null",
  }),

  // Profile fields (mirror the RealFast update_my_profile surface).
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  currentTitle: text("current_title"),
  currentCompany: text("current_company"),
  companyWebsite: text("company_website"),
  location: text("location"),
  yearsOfExperience: integer("years_of_experience"),
  preferredWorkingStyle: text("preferred_working_style"),
  noticePeriod: text("notice_period"),
  skills: text("skills"),
  summary: text("summary"),
  transformativeBooks: text("transformative_books"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Email is looked up on every SSO sign-in (account linking).
  (t) => ({ emailIdx: index("candidates_email_idx").on(t.email) }),
);

/** Resume markdown, versioned (history kept). Latest = highest version. */
export const resumes = pgTable("resumes", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  version: integer("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Session-log upload lifecycle: prepare (pending) -> confirm (confirmed). */
export const sessionLogUploads = pgTable("session_log_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  vendor: sessionVendor("vendor").notNull(),
  sha256B64: text("sha256_b64").notNull(),
  // Where the object lives while pending; promoted to a permanent key on confirm.
  s3Key: text("s3_key").notNull(),
  status: uploadStatus("status").notNull().default("pending"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  contentType: text("content_type"),
  filename: text("filename"),
  modelNames: jsonb("model_names").$type<string[]>(),
  sessionStartedAt: timestamp("session_started_at", { withTimezone: true }),
  sessionEndedAt: timestamp("session_ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

/** Open roles candidates can apply to. Managed via the admin API. */
export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  location: text("location"),
  description: text("description").notNull(),
  status: positionStatus("status").notNull().default("open"),
  // The id the company "Apply now" link carries (external/ATS id or slug).
  externalJobId: text("external_job_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A candidate's application to a position — one per (candidate, position). */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => positions.id, { onDelete: "cascade" }),
    status: applicationStatus("status").notNull().default("submitted"),
    decision: applicationDecision("decision").notNull().default("apply"),
    // JD ↔ resume fit comparison — SELF-REPORTED by the candidate's agent.
    // Display as candidate-provided context, never as an assessment.
    fitScore: integer("fit_score"),
    fitSummary: text("fit_summary"),
    fitGaps: jsonb("fit_gaps").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqCandidatePosition: unique("uniq_candidate_position").on(t.candidateId, t.positionId) }),
);

export type Candidate = typeof candidates.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type SessionLogUpload = typeof sessionLogUploads.$inferSelect;
