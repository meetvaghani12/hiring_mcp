import { describe, expect, it } from "vitest";
import { isUuid, validateResume, validateTransformativeBooks, RESUME_MAX } from "../src/validation.js";

describe("isUuid", () => {
  it("accepts canonical uuids", () => {
    expect(isUuid("1e38db74-4146-4978-b6b8-042e37a0e18b")).toBe(true);
    expect(isUuid("1E38DB74-4146-4978-B6B8-042E37A0E18B")).toBe(true);
  });
  it("rejects slugs, empties, and near-misses", () => {
    expect(isUuid("ai-agent-engineer")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("1e38db74-4146-4978-b6b8-042e37a0e18")).toBe(false); // short
    expect(isUuid("1e38db74414649786b8042e37a0e18bb")).toBe(false); // no dashes
  });
});

describe("validateResume", () => {
  it("rejects empty and oversized content", () => {
    expect(validateResume("   ").ok).toBe(false);
    expect(validateResume("x".repeat(RESUME_MAX + 1)).ok).toBe(false);
  });
  it("accepts normal markdown", () => {
    expect(validateResume("# Jane\n\nEngineer.").ok).toBe(true);
  });
});

describe("validateTransformativeBooks", () => {
  it("hard-fails under 200 chars", () => {
    const r = validateTransformativeBooks("n/a");
    expect(r.ok).toBe(false);
  });
  it("passes a substantive answer, warns when fewer than 3 books", () => {
    const r = validateTransformativeBooks(
      "Thinking in Systems changed how I see feedback loops everywhere in engineering and teams. " +
        "I disagree with its light treatment of tooling, though — the diagrams age poorly in practice. " +
        "It reshaped how I approach incident reviews and capacity planning over many years.",
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("Fewer than 3"))).toBe(true);
  });
});
