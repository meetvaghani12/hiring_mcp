import { describe, expect, it } from "vitest";
import { planLink, type LinkedInUser } from "../src/auth/linkedin.js";

const user = (over: Partial<LinkedInUser> = {}): LinkedInUser => ({
  sub: "li:123",
  email: "jane@example.com",
  email_verified: true,
  name: "Jane",
  ...over,
});

describe("planLink — the SSO account-linking security matrix", () => {
  it("an existing sub match always wins", () => {
    expect(planLink({ id: "a" }, { id: "b", linkedinSub: null }, user())).toBe("use_sub_match");
  });

  it("links by email only when verified AND the row has no linkedin identity", () => {
    expect(planLink(undefined, { id: "b", linkedinSub: null }, user())).toBe("link_email_match");
  });

  it("refuses to link when the OIDC email is not verified (takeover guard)", () => {
    expect(planLink(undefined, { id: "b", linkedinSub: null }, user({ email_verified: false }))).toBe("create_new");
    expect(planLink(undefined, { id: "b", linkedinSub: null }, user({ email_verified: undefined }))).toBe("create_new");
  });

  it("refuses to link a row already owned by another LinkedIn identity", () => {
    expect(planLink(undefined, { id: "b", linkedinSub: "li:other" }, user())).toBe("create_new");
  });

  it("creates a new account when nothing matches", () => {
    expect(planLink(undefined, undefined, user())).toBe("create_new");
    expect(planLink(undefined, undefined, user({ email: undefined }))).toBe("create_new");
  });
});
