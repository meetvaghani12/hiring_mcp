import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

const COOKIE = "hm_recruiter";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h work session

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(`recruiter:${payload}`).digest("base64url");
}

export function makeRecruiterSession(now = Date.now()): string {
  return `${now}.${sign(String(now))}`;
}

export function verifyRecruiterSession(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const iat = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(iat));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return false;
  const issued = Number(iat);
  return Number.isFinite(issued) && now - issued < TTL_MS;
}

export function setRecruiterCookie(res: Response) {
  res.cookie(COOKIE, makeRecruiterSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/recruiter",
    maxAge: TTL_MS,
  });
}

export function clearRecruiterCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/recruiter" });
}

/** Require a valid, unexpired recruiter session; redirect to login otherwise. */
export function requireRecruiter(req: Request, res: Response, next: NextFunction) {
  if (!verifyRecruiterSession(req.cookies?.[COOKIE])) {
    res.redirect("/recruiter/login");
    return;
  }
  next();
}
