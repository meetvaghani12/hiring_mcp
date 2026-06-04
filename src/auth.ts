import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { candidates, type Candidate } from "./db/schema.js";
import { config } from "./config.js";

function tokenExpiry(): Date {
  return new Date(Date.now() + config.tokenTtlDays * 24 * 60 * 60 * 1000);
}

/** Generate a fresh token plus the values stored for it. Raw token is shown once. */
export function newToken(): { token: string; tokenHash: string; tokenHint: string; tokenExpiresAt: Date } {
  const token = `cand_${randomBytes(24).toString("base64url")}`;
  return { token, tokenHash: hashToken(token), tokenHint: token.slice(-4), tokenExpiresAt: tokenExpiry() };
}

/** Hash a raw bearer token for storage / lookup. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Extract a Bearer token from an Authorization header, or null. */
export function bearerFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/** Look up the candidate that owns a raw bearer token, rejecting expired tokens. */
export async function getCandidateByToken(raw: string): Promise<Candidate | null> {
  const tokenHash = hashToken(raw);
  const rows = await db.select().from(candidates).where(eq(candidates.tokenHash, tokenHash)).limit(1);
  const candidate = rows[0];
  if (!candidate) return null;
  if (candidate.tokenExpiresAt && candidate.tokenExpiresAt.getTime() < Date.now()) return null;
  return candidate;
}

/**
 * Create a new candidate and return the one-time raw token (never stored).
 * Used by the admin "mint token" endpoint and the CLI script.
 */
export async function createCandidate(input: {
  name?: string;
  email?: string;
}): Promise<{ candidate: Candidate; token: string }> {
  const token = `cand_${randomBytes(24).toString("base64url")}`;
  const rows = await db
    .insert(candidates)
    .values({
      tokenHash: hashToken(token),
      tokenHint: token.slice(-4),
      tokenExpiresAt: tokenExpiry(),
      name: input.name,
      email: input.email,
    })
    .returning();
  return { candidate: rows[0], token };
}

/** Rotate (reissue) a candidate's token. Returns the new one-time raw token. */
export async function rotateToken(candidateId: string): Promise<string> {
  const token = `cand_${randomBytes(24).toString("base64url")}`;
  await db
    .update(candidates)
    .set({ tokenHash: hashToken(token), tokenHint: token.slice(-4), tokenExpiresAt: tokenExpiry() })
    .where(eq(candidates.id, candidateId));
  return token;
}
