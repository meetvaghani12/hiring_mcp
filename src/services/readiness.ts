import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentConfigs, candidates, resumes, sessionLogUploads, type Candidate } from "../db/schema.js";
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
  hasAgentConfig: boolean;
  hasSessionLog: boolean;
  sessionLogRequired: boolean;
  missing: string[];
  applicationReady: boolean;
  latestResume: string | null;
  latestAgentConfig: { content: string; version: number } | null;
}

export async function computeReadiness(candidateId: string): Promise<Readiness> {
  const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  if (!candidate) throw new Error("Candidate not found");

  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.candidateId, candidateId))
    .orderBy(desc(resumes.version))
    .limit(1);

  const [agentConfig] = await db
    .select()
    .from(agentConfigs)
    .where(eq(agentConfigs.candidateId, candidateId))
    .orderBy(desc(agentConfigs.version))
    .limit(1);

  const [sessionLog] = await db
    .select()
    .from(sessionLogUploads)
    .where(and(eq(sessionLogUploads.candidateId, candidateId), eq(sessionLogUploads.status, "confirmed")))
    .limit(1);

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
  const hasAgentConfig = Boolean(agentConfig);
  const hasSessionLog = Boolean(sessionLog);
  const sessionLogRequired = config.requireSessionLog;

  // Apply gate is now just: complete profile + a resume.
  // (CLAUDE.md / session log are no longer required.)
  const missing: string[] = [];
  if (profileMissingFields.length > 0) missing.push("profile");
  if (!hasResume) missing.push("resume");

  return {
    candidate,
    profileMissingFields,
    hasResume,
    hasAgentConfig,
    hasSessionLog,
    sessionLogRequired,
    missing,
    applicationReady: missing.length === 0,
    latestResume: resume?.content ?? null,
    latestAgentConfig: agentConfig ? { content: agentConfig.content, version: agentConfig.version } : null,
  };
}
