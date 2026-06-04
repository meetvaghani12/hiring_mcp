import type { Express, Request, Response, NextFunction } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentConfigs, applications, candidates, positions, resumes, sessionLogUploads } from "../db/schema.js";
import { config } from "../config.js";
import { bearerFromHeader, createCandidate } from "../auth.js";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = bearerFromHeader(req.headers.authorization);
  if (token !== config.adminToken) {
    res.status(401).json({ error: "Invalid admin token" });
    return;
  }
  next();
}

// Wrap async handlers so rejections become 500s instead of crashing.
const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error("admin route error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    });
  };

export function registerAdminRoutes(app: Express) {
  // Mint a candidate + one-time token.
  app.post(
    "/admin/candidates",
    requireAdmin,
    h(async (req, res) => {
      const { name, email } = req.body ?? {};
      const { candidate, token } = await createCandidate({ name, email });
      res.json({ candidate_id: candidate.id, token, note: "Store this token now — it is not retrievable later." });
    }),
  );

  app.get(
    "/admin/candidates",
    requireAdmin,
    h(async (_req, res) => {
      const rows = await db
        .select({
          id: candidates.id,
          name: candidates.name,
          email: candidates.email,
          current_title: candidates.currentTitle,
          created_at: candidates.createdAt,
        })
        .from(candidates)
        .orderBy(desc(candidates.createdAt));
      res.json({ candidates: rows });
    }),
  );

  // Full artifact dump for one candidate (review surface).
  app.get(
    "/admin/candidates/:id/artifacts",
    requireAdmin,
    h(async (req, res) => {
      const id = req.params.id;
      const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
      if (!candidate) {
        res.status(404).json({ error: "Candidate not found" });
        return;
      }
      const [resume] = await db
        .select()
        .from(resumes)
        .where(eq(resumes.candidateId, id))
        .orderBy(desc(resumes.version))
        .limit(1);
      const [agentConfig] = await db
        .select()
        .from(agentConfigs)
        .where(eq(agentConfigs.candidateId, id))
        .orderBy(desc(agentConfigs.version))
        .limit(1);
      const logs = await db
        .select()
        .from(sessionLogUploads)
        .where(eq(sessionLogUploads.candidateId, id))
        .orderBy(desc(sessionLogUploads.createdAt));
      res.json({ candidate, resume: resume ?? null, agent_config: agentConfig ?? null, session_logs: logs });
    }),
  );

  // Positions management.
  app.post(
    "/admin/positions",
    requireAdmin,
    h(async (req, res) => {
      const { title, location, description } = req.body ?? {};
      if (!title || !description) {
        res.status(400).json({ error: "title and description are required" });
        return;
      }
      const [p] = await db.insert(positions).values({ title, location, description }).returning();
      res.json({ position: p });
    }),
  );

  app.get(
    "/admin/positions",
    requireAdmin,
    h(async (_req, res) => {
      const rows = await db.select().from(positions).orderBy(desc(positions.createdAt));
      res.json({ positions: rows });
    }),
  );

  app.post(
    "/admin/positions/:id/close",
    requireAdmin,
    h(async (req, res) => {
      const [p] = await db
        .update(positions)
        .set({ status: "closed" })
        .where(eq(positions.id, req.params.id))
        .returning();
      if (!p) {
        res.status(404).json({ error: "Position not found" });
        return;
      }
      res.json({ position: p });
    }),
  );

  // Applications across all candidates.
  app.get(
    "/admin/applications",
    requireAdmin,
    h(async (_req, res) => {
      const rows = await db
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
          position_id: positions.id,
          position_title: positions.title,
        })
        .from(applications)
        .innerJoin(candidates, eq(applications.candidateId, candidates.id))
        .innerJoin(positions, eq(applications.positionId, positions.id))
        .orderBy(desc(applications.createdAt));
      res.json({ applications: rows });
    }),
  );
}
