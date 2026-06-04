import { describe, expect, it } from "vitest";
import { ALL_STATUSES, canTransition, nextStatuses } from "../src/services/pipeline.js";

describe("application pipeline", () => {
  it("follows the happy path submitted -> under_review -> interviewing -> hired", () => {
    expect(canTransition("submitted", "under_review")).toBe(true);
    expect(canTransition("under_review", "interviewing")).toBe(true);
    expect(canTransition("interviewing", "hired")).toBe(true);
  });

  it("allows rejection from any active stage", () => {
    expect(canTransition("submitted", "rejected")).toBe(true);
    expect(canTransition("under_review", "rejected")).toBe(true);
    expect(canTransition("interviewing", "rejected")).toBe(true);
  });

  it("blocks skipping stages and resurrecting terminal states", () => {
    expect(canTransition("submitted", "hired")).toBe(false);
    expect(canTransition("submitted", "interviewing")).toBe(false);
    expect(canTransition("declined", "under_review")).toBe(false);
    expect(canTransition("rejected", "submitted")).toBe(false);
    expect(canTransition("hired", "rejected")).toBe(false);
  });

  it("terminal states have no exits", () => {
    for (const terminal of ["declined", "rejected", "hired"] as const) {
      expect(nextStatuses(terminal)).toEqual([]);
    }
  });

  it("covers every status", () => {
    expect(ALL_STATUSES.sort()).toEqual(
      ["declined", "hired", "interviewing", "rejected", "submitted", "under_review"].sort(),
    );
  });
});
