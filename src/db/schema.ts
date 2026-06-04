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
} from "drizzle-orm/pg-core";

export const uploadStatus = pgEnum("upload_status", ["pending", "confirmed"]);
export const positionStatus = pgEnum("position_status", ["open", "closed"]);
export const applicationStatus = pgEnum("application_status", [
  "submitted",
  "under_review",
  "interviewing",
  "rejected",
  "hired",
]);
export const sessionVendor = pgEnum("session_vendor", ["claude_code", "codex_cli"]);

/** A candidate is identified by the Bearer token they connect with. */
export const candidates = pgTable("candidates", {
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
});

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

/** Candidate's existing agent rules file (CLAUDE.md/AGENTS.md/...), versioned. */
export const agentConfigs = pgTable("agent_configs", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A candidate's application to a position. */
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  positionId: uuid("position_id")
    .notNull()
    .references(() => positions.id, { onDelete: "cascade" }),
  status: applicationStatus("status").notNull().default("submitted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Candidate = typeof candidates.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type SessionLogUpload = typeof sessionLogUploads.$inferSelect;
