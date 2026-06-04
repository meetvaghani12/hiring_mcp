import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { candidates, resumes, sessionLogUploads, type Candidate } from "../db/schema.js";
import { config } from "../config.js";
import { validateTransformativeBooks } from "../validation.js";

/** Profile fields that must be present for the profile to count as complete. */
const REQUIRED_PROFILE_FIELDS: (keyof Candidate)[] = [
  "name",
  "email",
  "phone",
  "currentTitle",
  "location",
  "yearsOfExperience",
  "skills",
  "summary",
  "transformativeBooks",
];

// Map DB camelCase -> the snake_case names we expose to clients.
const FIELD_PUBLIC_NAME: Partial<Record<keyof Candidate, string>> = {
  currentTitle: "current_title",
  yearsOfExperience: "years_of_experience",
  transformativeBooks: "transformative_books",
};

function publicName(field: keyof Candidate): string {
  return FIELD_PUBLIC_NAME[field] ?? String(field);
}

export interface Readiness {
  candidate: Candidate;
  profileMissingFields: string[];
  hasResume: boolean;
  hasSessionLog: boolean;
  sessionLogRequired: boolean;
  missing: string[];
  applicationReady: boolean;
  latestResume: string | null;
}

/**
 * The apply gate: complete profile + resume, plus a confirmed session log
 * when REQUIRE_SESSION_LOG is on.
 */
export async function computeReadiness(candidateId: string): Promise<Readiness> {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  if (!candidate) throw new Error("Candidate not found");

  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId))
    .orderBy(desc(resumes.version))
    .limit(1);

  const sessionLogRequired = config.requireSessionLog;
  let hasSessionLog = false;
  if (sessionLogRequired) {
    const [confirmed] = await db
      .select({ id: sessionLogUploads.id })
      .from(sessionLogUploads)
      .where(and(eq(sessionLogUploads.candidateId, candidateId), eq(sessionLogUploads.status, "confirmed")))
      .limit(1);
    hasSessionLog = Boolean(confirmed);
  }

  const profileMissingFields: string[] = [];
  for (const field of REQUIRED_PROFILE_FIELDS) {
    const value = candidate[field];
    const empty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
    if (empty) {
      profileMissingFields.push(publicName(field));
      continue;
    }
    if (field === "transformativeBooks" && !validateTransformativeBooks(String(value)).ok) {
      profileMissingFields.push(publicName(field));
    }
  }

  const hasResume = Boolean(resume);

  const missing: string[] = [];
  if (profileMissingFields.length > 0) missing.push("profile");
  if (!hasResume) missing.push("resume");
  if (sessionLogRequired && !hasSessionLog) missing.push("session_log");

  return {
    candidate,
    profileMissingFields,
    hasResume,
    hasSessionLog,
    sessionLogRequired,
    missing,
    applicationReady: missing.length === 0,
    latestResume: resume?.content ?? null,
  };
}
