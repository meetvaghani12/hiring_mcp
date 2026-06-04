import type { Express, Request, Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { applications, candidates, positions, resumes, sessionLogUploads } from "../db/schema.js";
import { config } from "../config.js";
import { safeEqual } from "../auth.js";
import { isUuid } from "../validation.js";
import { computeReadiness } from "../services/readiness.js";
import { canTransition, ALL_STATUSES, type ApplicationStatus } from "../services/pipeline.js";
import { clearRecruiterCookie, requireRecruiter, setRecruiterCookie } from "./session.js";
import {
  applicationsPage,
  candidateDetailPage,
  candidatesPage,
  positionsAdminPage,
  recruiterLoginPage,
} from "./views.js";

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error("recruiter route error:", err);
      if (!res.headersSent) res.status(500).send("Internal server error");
    });
  };

export function registerRecruiterRoutes(app: Express) {
  // ── Auth ──────────────────────────────────────────────
  app.get("/recruiter/login", (_req, res) => res.type("html").send(recruiterLoginPage()));

  app.post("/recruiter/login", (req, res) => {
    const token = String(req.body?.token ?? "");
    if (!token || !safeEqual(token, config.adminToken)) {
      res.status(401).type("html").send(recruiterLoginPage("That token wasn't recognized."));
      return;
    }
    setRecruiterCookie(res);
    res.redirect("/recruiter/applications");
  });

  app.get("/recruiter/logout", (_req, res) => {
    clearRecruiterCookie(res);
    res.redirect("/recruiter/login");
  });

  app.get("/recruiter", requireRecruiter, (_req, res) => res.redirect("/recruiter/applications"));

  // ── Applications pipeline ─────────────────────────────
  app.get(
    "/recruiter/applications",
    requireRecruiter,
    wrap(async (req, res) => {
      const filter = typeof req.query.status === "string" ? req.query.status : null;
      const base = db
        .select({
          application_id: applications.id,
          status: applications.status,
          decision: applications.decision,
          fit_score: applications.fitScore,
          fit_summary: applications.fitSummary,
          fit_gaps: applications.fitGaps,
          created_at: applications.createdAt,
          candidate_id: candidates.id,
          candidate_name: candidates.name,
          candidate_email: candidates.email,
          position_title: positions.title,
        })
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(positions, eq(applications.positionId, positions.id))
        .orderBy(desc(applications.createdAt));
      const rows =
        filter && (ALL_STATUSES as string[]).includes(filter)
          ? await base.where(eq(applications.status, filter as ApplicationStatus))
          : await base;
      res.type("html").send(applicationsPage(rows, filter));
    }),
  );

  app.post(
    "/recruiter/applications/:id/status",
    requireRecruiter,
    wrap(async (req, res) => {
      const id = req.params.id;
      const to = String(req.body?.status ?? "") as ApplicationStatus;
      if (!isUuid(id) || !(ALL_STATUSES as string[]).includes(to)) {
        res.status(400).send("Bad request");
        return;
      }
      const [app_] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
      if (!app_) {
        res.status(404).send("Application not found");
        return;
      }
      if (!canTransition(app_.status, to)) {
        res.status(409).send(`Cannot move ${app_.status} -> ${to}`);
        return;
      }
      await db.update(applications).set({ status: to, updatedAt: new Date() }).where(eq(applications.id, id));
      res.redirect("/recruiter/applications");
    }),
  );

  // ── Candidates ────────────────────────────────────────
  app.get(
    "/recruiter/candidates",
    requireRecruiter,
    wrap(async (_req, res) => {
      const rows = await db
        .select({
          id: candidates.id,
          name: candidates.name,
          email: candidates.email,
          current_title: candidates.currentTitle,
          created_at: candidates.createdAt,
          applications_count: sql<number>`(select count(*)::int from ${applications} where ${applications.candidateId} = ${candidates.id})`,
        })
        .from(candidates)
        .orderBy(desc(candidates.createdAt));
      res.type("html").send(candidatesPage(rows));
    }),
  );

  app.get(
    "/recruiter/candidates/:id",
    requireRecruiter,
    wrap(async (req, res) => {
      const id = req.params.id;
      if (!isUuid(id)) {
        res.status(404).send("Candidate not found");
        return;
      }
      const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
      if (!candidate) {
        res.status(404).send("Candidate not found");
        return;
      }
      const readiness = await computeReadiness(id);
      const [resume] = await db
        .select()
        .from(resumes)
        .where(eq(resumes.candidateId, id))
        .orderBy(desc(resumes.version))
        .limit(1);
      const sessionLogs = await db
        .select()
        .from(sessionLogUploads)
        .where(eq(sessionLogUploads.candidateId, id))
        .orderBy(desc(sessionLogUploads.createdAt));
      const apps = await db
        .select({
          id: applications.id,
          status: applications.status,
          position_title: positions.title,
          created_at: applications.createdAt,
        })
        .from(applications)
        .innerJoin(positions, eq(applications.positionId, positions.id))
        .where(eq(applications.candidateId, id))
        .orderBy(desc(applications.createdAt));
      res.type("html").send(
        candidateDetailPage({
          candidate,
          readiness,
          resume: resume?.content ?? null,
          sessionLogs,
          applications: apps,
        }),
      );
    }),
  );

  // ── Positions ─────────────────────────────────────────
  const positionsWithCounts = () =>
    db
      .select({
        id: positions.id,
        title: positions.title,
        location: positions.location,
        description: positions.description,
        status: positions.status,
        externalJobId: positions.externalJobId,
        createdAt: positions.createdAt,
        applications_count: sql<number>`(select count(*)::int from ${applications} where ${applications.positionId} = ${positions.id})`,
      })
      .from(positions)
      .orderBy(desc(positions.createdAt));

  app.get(
    "/recruiter/positions",
    requireRecruiter,
    wrap(async (_req, res) => {
      res.type("html").send(positionsAdminPage(await positionsWithCounts()));
    }),
  );

  app.post(
    "/recruiter/positions",
    requireRecruiter,
    wrap(async (req, res) => {
      const title = String(req.body?.title ?? "").trim();
      const description = String(req.body?.description ?? "").trim();
      const location = String(req.body?.location ?? "").trim() || null;
      const externalJobId = String(req.body?.external_job_id ?? "").trim() || null;
      if (!title || !description) {
        res
          .status(400)
          .type("html")
          .send(positionsAdminPage(await positionsWithCounts(), "Title and description are required."));
        return;
      }
      if (externalJobId && !/^[a-z0-9][a-z0-9-]*$/.test(externalJobId)) {
        res
          .status(400)
          .type("html")
          .send(positionsAdminPage(await positionsWithCounts(), "External job id must be a lowercase slug (a-z, 0-9, dashes)."));
        return;
      }
      await db
        .insert(positions)
        .values({ title, description, location, externalJobId })
        .onConflictDoNothing({ target: positions.externalJobId });
      res.redirect("/recruiter/positions");
    }),
  );

  const setPositionStatus = (status: "open" | "closed") =>
    wrap(async (req: Request, res: Response) => {
      if (!isUuid(req.params.id)) {
        res.status(404).send("Position not found");
        return;
      }
      await db.update(positions).set({ status }).where(eq(positions.id, req.params.id));
      res.redirect("/recruiter/positions");
    });

  app.post("/recruiter/positions/:id/close", requireRecruiter, setPositionStatus("closed"));
  app.post("/recruiter/positions/:id/reopen", requireRecruiter, setPositionStatus("open"));
}
