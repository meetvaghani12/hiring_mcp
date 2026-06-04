import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentConfigs, applications, candidates, positions } from "../db/schema.js";
import { getCandidateByToken, rotateToken } from "../auth.js";
import { buildAuthUrl, findOrCreateFromLinkedIn, userinfoFromCode } from "../auth/linkedin.js";
import { config } from "../config.js";
import { computeReadiness } from "../services/readiness.js";
import {
  checkOAuthState,
  clearSessionCookie,
  requireWebAuth,
  setFlashToken,
  setOAuthState,
  setSessionCookie,
  takeFlashToken,
} from "./session.js";
import { applyPage, loginPage, mcpPage, mockLinkedInPage, profilePage, wikiPage } from "./views.js";

type AuthedReq = Request & { candidateId: string };

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error("web route error:", err);
      if (!res.headersSent) res.status(500).send("Internal server error");
    });
  };

export function registerWebRoutes(app: Express) {
  app.get("/", (_req, res) => res.redirect("/profile"));

  // ── Auth ──────────────────────────────────────────────
  app.get("/login", (_req, res) => res.type("html").send(loginPage()));

  app.post(
    "/login",
    wrap(async (req, res) => {
      const token = String(req.body?.token ?? "").trim();
      const candidate = token ? await getCandidateByToken(token) : null;
      if (!candidate) {
        res.status(401).type("html").send(loginPage("That token wasn't recognized. Check it and try again."));
        return;
      }
      setSessionCookie(res, candidate.id);
      res.redirect("/profile");
    }),
  );

  app.get("/logout", (_req, res) => {
    clearSessionCookie(res);
    res.redirect("/login");
  });

  // ── LinkedIn SSO ──────────────────────────────────────
  app.get("/auth/linkedin", (_req, res) => {
    if (config.linkedin.mock) {
      res.type("html").send(mockLinkedInPage());
      return;
    }
    if (!config.linkedin.clientId) {
      res.status(500).type("html").send(loginPage("LinkedIn sign-in is not configured on this server."));
      return;
    }
    const state = randomBytes(16).toString("hex");
    setOAuthState(res, state);
    res.redirect(buildAuthUrl(state));
  });

  app.get(
    "/auth/linkedin/callback",
    wrap(async (req, res) => {
      if (req.query.error) {
        res.type("html").send(loginPage(`LinkedIn sign-in was cancelled (${String(req.query.error)}).`));
        return;
      }
      if (!checkOAuthState(req, res, req.query.state as string | undefined)) {
        res.status(400).type("html").send(loginPage("Sign-in expired or invalid. Please try again."));
        return;
      }
      const code = String(req.query.code ?? "");
      if (!code) {
        res.status(400).type("html").send(loginPage("LinkedIn did not return an authorization code."));
        return;
      }
      const user = await userinfoFromCode(code);
      const { candidate, freshToken } = await findOrCreateFromLinkedIn(user);
      setSessionCookie(res, candidate.id);
      if (freshToken) setFlashToken(res, freshToken);
      res.redirect("/mcp");
    }),
  );

  // Mock SSO: simulate the OIDC userinfo from a form (dev only).
  app.post(
    "/auth/linkedin/mock",
    wrap(async (req, res) => {
      if (!config.linkedin.mock) {
        res.status(404).send("Not found");
        return;
      }
      const email = String(req.body?.email ?? "").trim();
      const name = String(req.body?.name ?? "").trim();
      if (!email) {
        res.status(400).type("html").send(mockLinkedInPage());
        return;
      }
      const { candidate, freshToken } = await findOrCreateFromLinkedIn({
        sub: `mock:${email}`,
        email,
        email_verified: true,
        name: name || undefined,
      });
      setSessionCookie(res, candidate.id);
      if (freshToken) setFlashToken(res, freshToken);
      res.redirect("/mcp");
    }),
  );

  // ── MCP connect page ──────────────────────────────────
  app.get(
    "/mcp",
    requireWebAuth,
    wrap(async (req, res) => {
      const id = (req as AuthedReq).candidateId;
      const [c] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
      const fresh = takeFlashToken(req, res); // shown once right after SSO signup
      res.type("html").send(
        mcpPage({
          tokenHint: c?.tokenHint ?? null,
          tokenExpiresAt: c?.tokenExpiresAt ?? null,
          freshToken: fresh ?? undefined,
        }),
      );
    }),
  );

  app.post(
    "/mcp/reissue",
    requireWebAuth,
    wrap(async (req, res) => {
      const id = (req as AuthedReq).candidateId;
      const token = await rotateToken(id);
      const [c] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
      res.type("html").send(
        mcpPage({ tokenHint: c?.tokenHint ?? null, freshToken: token, tokenExpiresAt: c?.tokenExpiresAt ?? null }),
      );
    }),
  );

  // ── Wiki (positions) ──────────────────────────────────
  app.get(
    "/wiki",
    requireWebAuth,
    wrap(async (_req, res) => {
      const rows = await db.select().from(positions).orderBy(desc(positions.createdAt));
      res.type("html").send(wikiPage(rows));
    }),
  );

  // ── Apply (readiness checklist) ───────────────────────
  app.get(
    "/apply",
    requireWebAuth,
    wrap(async (req, res) => {
      const id = (req as AuthedReq).candidateId;
      const readiness = await computeReadiness(id);
      res.type("html").send(applyPage(readiness));
    }),
  );

  // ── Profile ───────────────────────────────────────────
  app.get(
    "/profile",
    requireWebAuth,
    wrap(async (req, res) => {
      const id = (req as AuthedReq).candidateId;
      const readiness = await computeReadiness(id);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(applications)
        .where(eq(applications.candidateId, id));
      const [ac] = await db
        .select({ version: agentConfigs.version })
        .from(agentConfigs)
        .where(eq(agentConfigs.candidateId, id))
        .orderBy(desc(agentConfigs.version))
        .limit(1);
      res.type("html").send(
        profilePage({
          candidate: readiness.candidate,
          readiness,
          applicationsCount: count,
          agentConfigVersion: ac?.version ?? null,
          resumeMarkdown: readiness.latestResume,
        }),
      );
    }),
  );
}
