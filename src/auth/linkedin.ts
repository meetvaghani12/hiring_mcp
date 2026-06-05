import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { candidates, type Candidate } from "../db/schema.js";
import { config } from "../config.js";
import { newToken } from "../auth.js";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

/** OIDC userinfo we care about. */
export interface LinkedInUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Build the LinkedIn authorization URL to redirect the candidate to. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.linkedin.clientId,
    redirect_uri: config.linkedin.redirectUri,
    scope: "openid profile email",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** Exchange the authorization code for an access token. */
async function exchangeCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.linkedin.redirectUri,
    client_id: config.linkedin.clientId,
    client_secret: config.linkedin.clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("LinkedIn token response missing access_token");
  return json.access_token;
}

/** Fetch the OIDC userinfo for an access token. */
async function fetchUserinfo(accessToken: string): Promise<LinkedInUser> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`LinkedIn userinfo failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as LinkedInUser;
}

/** Full server-side leg: code -> access token -> userinfo. */
export async function userinfoFromCode(code: string): Promise<LinkedInUser> {
  return fetchUserinfo(await exchangeCode(code));
}

export type LinkPlan = "use_sub_match" | "link_email_match" | "create_new";

/**
 * Decide how an incoming LinkedIn identity maps onto existing candidates.
 * Pure — all the security reasoning lives here, where it can be unit-tested.
 *
 * Email-match linking is only allowed when:
 *  - the OIDC claim says the email is verified (`email_verified === true`), AND
 *  - the existing row has never been linked to a LinkedIn identity.
 *
 * This is safe only because candidate email is an IDENTITY field: it is set
 * by the admin at mint time or by SSO, and `update_my_profile` refuses to
 * change a non-empty email. Without that invariant a candidate could set
 * their profile email to victim@example.com and capture the victim's account
 * on first SSO sign-in. If email ever becomes freely editable again, this
 * linking branch must be removed.
 */
export function planLink(
  bySub: Pick<Candidate, "id"> | undefined,
  byEmail: Pick<Candidate, "id" | "linkedinSub"> | undefined,
  user: LinkedInUser,
): LinkPlan {
  if (bySub) return "use_sub_match";
  if (byEmail && !byEmail.linkedinSub && user.email_verified === true) return "link_email_match";
  return "create_new";
}

/**
 * Find-or-create a candidate from a LinkedIn identity, returning the candidate
 * and a fresh raw token IF one was just minted (new account or the existing
 * token had expired). For returning users with a live token, freshToken is
 * null — they keep their current token and can reissue from /mcp.
 */
export async function findOrCreateFromLinkedIn(
  user: LinkedInUser,
): Promise<{ candidate: Candidate; freshToken: string | null }> {
  const [bySub] = await db.select().from(candidates).where(eq(candidates.linkedinSub, user.sub)).limit(1);
  const [byEmail] = user.email
    ? await db.select().from(candidates).where(eq(candidates.email, user.email)).limit(1)
    : [undefined];

  const plan = planLink(bySub, byEmail, user);

  let candidate: Candidate;
  if (plan === "use_sub_match") {
    candidate = bySub!;
  } else if (plan === "link_email_match") {
    [candidate] = await db
      .update(candidates)
      .set({
        linkedinSub: user.sub,
        pictureUrl: user.picture ?? byEmail!.pictureUrl,
        emailVerified: true,
        name: byEmail!.name ?? user.name,
      })
      .where(eq(candidates.id, byEmail!.id))
      .returning();
  } else {
    const t = newToken();
    [candidate] = await db
      .insert(candidates)
      .values({
        linkedinSub: user.sub,
        name: user.name,
        email: user.email,
        emailVerified: user.email_verified ?? false,
        pictureUrl: user.picture,
        tokenHash: t.tokenHash,
        tokenHint: t.tokenHint,
        tokenExpiresAt: t.tokenExpiresAt,
      })
      .returning();
    return { candidate, freshToken: t.token };
  }

  // Existing candidate: reissue only if their token has expired.
  const expired = candidate.tokenExpiresAt && candidate.tokenExpiresAt.getTime() < Date.now();
  if (expired) {
    const t = newToken();
    [candidate] = await db
      .update(candidates)
      .set({ tokenHash: t.tokenHash, tokenHint: t.tokenHint, tokenExpiresAt: t.tokenExpiresAt })
      .where(eq(candidates.id, candidate.id))
      .returning();
    return { candidate, freshToken: t.token };
  }

  return { candidate, freshToken: null };
}
