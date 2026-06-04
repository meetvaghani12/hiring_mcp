import type { Request, Response, NextFunction } from "express";

/** Minimal security headers — the useful subset of helmet, no dependency. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Pages are server-rendered with inline style/theme script; fonts come from
  // Google Fonts. No other script/connect sources are legitimate.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data: https:; frame-ancestors 'none'",
  );
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Tiny fixed-window in-memory rate limiter. Right-sized for a single-process
 * deployment; swap for a shared store if this ever runs multi-instance.
 */
export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const buckets = new Map<string, Bucket>();
  // Cap memory: drop expired buckets opportunistically.
  const sweep = (now: number) => {
    if (buckets.size < 10_000) return;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  };
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    sweep(now);
    const key = `${opts.name}:${req.ip ?? "unknown"}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
      res.status(429).send("Too many requests — try again shortly.");
      return;
    }
    next();
  };
}

/** One-line request log: method path status duration. Skips /health. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/health") {
    next();
    return;
  }
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
