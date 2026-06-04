import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { candidates } from "../db/schema.js";

const COOKIE = "hm_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(id: string): string {
  return createHmac("sha256", config.sessionSecret).update(id).digest("base64url");
}

export function makeSessionValue(candidateId: string): string {
  return `${candidateId}.${sign(candidateId)}`;
}

export function verifySession(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(id);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export function setSessionCookie(res: Response, candidateId: string) {
  res.cookie(COOKIE, makeSessionValue(candidateId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

// ── One-time flash for a freshly minted token (survives the SSO redirect) ──
const FLASH = "hm_flash";
export function setFlashToken(res: Response, token: string) {
  res.cookie(FLASH, `${token}.${sign(token)}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 120_000 });
}
export function takeFlashToken(req: Request, res: Response): string | null {
  const v = req.cookies?.[FLASH] as string | undefined;
  res.clearCookie(FLASH, { path: "/" });
  if (!v) return null;
  const dot = v.lastIndexOf(".");
  if (dot <= 0) return null;
  const val = v.slice(0, dot);
  const mac = Buffer.from(v.slice(dot + 1));
  const exp = Buffer.from(sign(val));
  return mac.length === exp.length && timingSafeEqual(mac, exp) ? val : null;
}

// ── OAuth CSRF state (double-submit cookie) ──
const STATE = "hm_oauth_state";
export function setOAuthState(res: Response, state: string) {
  res.cookie(STATE, state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600_000 });
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
