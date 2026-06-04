import { describe, expect, it } from "vitest";
import { makeSessionValue, verifySession } from "../src/web/session.js";
import { makeRecruiterSession, verifyRecruiterSession } from "../src/recruiter/session.js";

const ID = "1e38db74-4146-4978-b6b8-042e37a0e18b";
const DAY = 24 * 60 * 60 * 1000;

describe("candidate session", () => {
  it("round-trips a fresh session", () => {
    expect(verifySession(makeSessionValue(ID))).toBe(ID);
  });

  it("expires server-side after 30 days even if the cookie survives", () => {
    const issued = Date.now();
    const v = makeSessionValue(ID, issued);
    expect(verifySession(v, issued + 29 * DAY)).toBe(ID);
    expect(verifySession(v, issued + 31 * DAY)).toBeNull();
  });

  it("rejects tampered ids and MACs", () => {
    const v = makeSessionValue(ID);
    const otherId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    expect(verifySession(v.replace(ID, otherId))).toBeNull();
    expect(verifySession(v.slice(0, -2) + "xx")).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("no-dots-here")).toBeNull();
  });

  it("rejects a forged iat (signature covers it)", () => {
    const issued = Date.now() - 60 * DAY; // long expired
    const v = makeSessionValue(ID, issued);
    // attacker rewrites iat to now but can't re-sign
    const parts = v.split(".");
    const forged = `${parts[0]}.${Date.now()}.${parts[2]}`;
    expect(verifySession(forged)).toBeNull();
  });
});

describe("recruiter session", () => {
  it("round-trips and expires after 12h", () => {
    const now = Date.now();
    const v = makeRecruiterSession(now);
    expect(verifyRecruiterSession(v, now + 11 * 60 * 60 * 1000)).toBe(true);
    expect(verifyRecruiterSession(v, now + 13 * 60 * 60 * 1000)).toBe(false);
  });
  it("rejects tampering", () => {
    expect(verifyRecruiterSession(undefined)).toBe(false);
    expect(verifyRecruiterSession("123.deadbeef")).toBe(false);
  });
});
