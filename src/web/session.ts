import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";

const COOKIE = "hm_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
  path: "/",
};

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

/** Verify `value.mac` and return `value`, or null. Constant-time MAC check. */
function verifySigned(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = raw.slice(0, dot);
  const mac = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(value));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return value;
}

/**
 * Session value is `candidateId.issuedAtMs` + MAC, so a leaked cookie value
 * expires server-side — the browser maxAge alone is not a security boundary.
 */
export function makeSessionValue(candidateId: string, now = Date.now()): string {
  const payload = `${candidateId}.${now}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(raw: string | undefined, now = Date.now()): string | null {
  const payload = verifySigned(raw);
  if (!payload) return null;
  const dot = payload.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = payload.slice(0, dot);
  const iat = Number(payload.slice(dot + 1));
  if (!Number.isFinite(iat) || now - iat > MAX_AGE_MS) return null;
  return id;
}

export function setSessionCookie(res: Response, candidateId: string) {
  res.cookie(COOKIE, makeSessionValue(candidateId), { ...cookieOpts, maxAge: MAX_AGE_MS });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

/** Read the current candidate id from the session cookie without redirecting. */
export function currentCandidateId(req: Request): string | null {
  return verifySession(req.cookies?.[COOKIE]);
}

// ── One-time flash for a freshly minted token (survives the SSO redirect) ──
const FLASH = "hm_flash";
export function setFlashToken(res: Response, token: string) {
  res.cookie(FLASH, `${token}.${sign(token)}`, { ...cookieOpts, maxAge: 120_000 });
}
export function takeFlashToken(req: Request, res: Response): string | null {
  const v = req.cookies?.[FLASH] as string | undefined;
  res.clearCookie(FLASH, { path: "/" });
  return verifySigned(v);
}

// ── Pending target job (survives the SSO redirect) ──
const PENDING = "hm_pending_job";
export function setPendingJob(res: Response, positionId: string) {
  res.cookie(PENDING, `${positionId}.${sign(positionId)}`, { ...cookieOpts, maxAge: 600_000 });
}
export function takePendingJob(req: Request, res: Response): string | null {
  const v = req.cookies?.[PENDING] as string | undefined;
  res.clearCookie(PENDING, { path: "/" });
  return verifySigned(v);
}

// ── OAuth CSRF state (double-submit cookie) ──
const STATE = "hm_oauth_state";
export function setOAuthState(res: Response, state: string) {
  res.cookie(STATE, state, { ...cookieOpts, maxAge: 600_000 });
}
export function checkOAuthState(req: Request, res: Response, state: string | undefined): boolean {
  const v = req.cookies?.[STATE] as string | undefined;
  res.clearCookie(STATE, { path: "/" });
  return Boolean(v && state && v === state);
}

/**
 * Express middleware: require a valid session AND a candidate that still
 * exists (the row may have been deleted since the cookie was issued). On any
 * failure, clear the cookie and redirect to /login.
 */
export function requireWebAuth(req: Request, res: Response, next: NextFunction) {
  const id = verifySession(req.cookies?.[COOKIE]);
  if (!id) {
    res.redirect("/login");
    return;
  }
  db.select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.id, id))
    .limit(1)
    .then((rows) => {
      if (rows.length === 0) {
        clearSessionCookie(res);
        res.redirect("/login");
        return;
      }
      (req as Request & { candidateId: string }).candidateId = id;
      next();
    })
    .catch(next);
}
