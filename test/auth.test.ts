import { describe, expect, it } from "vitest";
import { bearerFromHeader, hashToken, newToken, safeEqual } from "../src/auth.js";

describe("bearerFromHeader", () => {
  it("extracts tokens case-insensitively and trims", () => {
    expect(bearerFromHeader("Bearer abc123")).toBe("abc123");
    expect(bearerFromHeader("bearer abc123")).toBe("abc123");
    expect(bearerFromHeader("  Bearer   abc123  ")).toBe("abc123");
  });
  it("returns null for missing or malformed headers", () => {
    expect(bearerFromHeader(undefined)).toBeNull();
    expect(bearerFromHeader("")).toBeNull();
    expect(bearerFromHeader("Basic abc")).toBeNull();
    expect(bearerFromHeader("Bearer")).toBeNull();
  });
});

describe("newToken", () => {
  it("mints prefixed tokens with matching hash, hint, and future expiry", () => {
    const t = newToken();
    expect(t.token.startsWith("cand_")).toBe(true);
    expect(t.tokenHash).toBe(hashToken(t.token));
    expect(t.tokenHint).toBe(t.token.slice(-4));
    expect(t.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("never repeats", () => {
    expect(newToken().token).not.toBe(newToken().token);
  });
});

describe("safeEqual", () => {
  it("compares correctly regardless of length", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("short", "much-longer-value")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
