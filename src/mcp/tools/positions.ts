import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { applications, positions } from "../../db/schema.js";
import { config } from "../../config.js";
import { computeReadiness } from "../../services/readiness.js";
import { isUuid } from "../../validation.js";
import { jsonResult, errorResult, type ToolContext } from "../context.js";

export function registerPositionTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    "browse_positions",
    {
      description:
        "Lists open positions — title, location, and a link. Use view_position for full details. " +
        "Compare against the candidate's profile to suggest roles that genuinely fit.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select()
        .from(positions)
        .where(eq(positions.status, "open"))
        .orderBy(desc(positions.createdAt));
      return jsonResult({
        positions: rows.map((p) => ({
          posting_id: p.id,
          title: p.title,
          location: p.location,
          link: `${config.publicBaseUrl}/positions/${p.externalJobId ?? p.id}`,
        })),
      });
    },
  );

  server.registerTool(
    "view_position",
    {
      description:
        "Returns the full job description for a position. Pass the posting_id from browse_positions. " +
        "Reason about fit against the candidate's profile.",
      inputSchema: { posting_id: z.string().describe("The posting UUID from browse_positions") },
    },
    async ({ posting_id }) => {
      if (!isUuid(posting_id)) return errorResult(`posting_id must be a UUID from browse_positions (got "${posting_id}").`);
      const [p] = await db.select().from(positions).where(eq(positions.id, posting_id)).limit(1);
      if (!p) return errorResult(`No position found with id ${posting_id}.`);
      return jsonResult({
        posting_id: p.id,
        title: p.title,
        location: p.location,
        status: p.status,
        description: p.description,
      });
    },
  );

  server.registerTool(
    "apply_to_position",
    {
      description:
        "Records the candidate's decision on a position AFTER you've shown them a JD↔resume fit comparison. " +
        "First compare their resume/profile against the job description, present the fit (strong matches + gaps) and a " +
        "0–100 fit_score, then ask whether they want to apply. Call this with their decision and your comparison. " +
        "`decision: 'apply'` submits the application; `decision: 'decline'` records a DECLINED entry that is still " +
        "visible to the hiring team — TELL the candidate this before recording a decline. The fit fields are stored " +
        "as the candidate's self-reported assessment. Requires a complete profile and a resume. A candidate may only " +
        "have ONE application per role. Never pass 'apply' without the candidate's explicit go-ahead.",
      inputSchema: {
        posting_id: z.string().describe("The posting UUID (from target_position or browse_positions)"),
        decision: z.enum(["apply", "decline"]).describe("Whether the candidate chose to apply"),
        fit_score: z.number().min(0).max(100).optional().describe("0–100 fit score from your JD↔resume comparison"),
        fit_summary: z.string().optional().describe("Short summary of how well the candidate fits the role"),
        fit_gaps: z.array(z.string()).optional().describe("Specific gaps / missing qualifications"),
      },
    },
    async ({ posting_id, decision, fit_score, fit_summary, fit_gaps }) => {
      if (!isUuid(posting_id)) return errorResult(`posting_id must be a UUID from browse_positions (got "${posting_id}").`);
      const r = await computeReadiness(ctx.candidateId);
      if (!r.applicationReady)
        return errorResult(
          `Not application_ready. Missing: ${r.missing.join(", ")}` +
            (r.profileMissingFields.length ? ` (profile fields: ${r.profileMissingFields.join(", ")})` : ""),
        );

      const [p] = await db.select().from(positions).where(eq(positions.id, posting_id)).limit(1);
      if (!p) return errorResult(`No position found with id ${posting_id}.`);
      if (p.status !== "open") return errorResult(`Position "${p.title}" is not open.`);

      const status = decision === "apply" ? ("submitted" as const) : ("declined" as const);

      // Atomic one-application-per-role: the unique constraint decides, so two
      // concurrent calls can't race a check-then-insert.
      const [app] = await db
        .insert(applications)
        .values({
          candidateId: ctx.candidateId,
          positionId: posting_id,
          decision,
          status,
          fitScore: fit_score,
          fitSummary: fit_summary,
          fitGaps: fit_gaps,
        })
        .onConflictDoNothing({ target: [applications.candidateId, applications.positionId] })
        .returning();
      if (!app) {
        const [existing] = await db
          .select()
          .from(applications)
          .where(and(eq(applications.candidateId, ctx.candidateId), eq(applications.positionId, posting_id)))
          .limit(1);
        return jsonResult({
          recorded: true,
          already: true,
          application_id: existing?.id,
          status: existing?.status,
          note: "You've already applied to this role — only one application per role is allowed.",
        });
      }

      return jsonResult({
        recorded: true,
        decision,
        application_id: app.id,
        position: { posting_id: p.id, title: p.title },
        status: app.status,
      });
    },
  );

  server.registerTool(
    "my_applications",
    {
      description:
        "Returns the candidate's applications and their current status — which positions they've been put forward " +
        "for, and what stage each is in.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({
          application_id: applications.id,
          status: applications.status,
          created_at: applications.createdAt,
          posting_id: positions.id,
          title: positions.title,
          location: positions.location,
        })
        .from(applications)
        .innerJoin(positions, eq(applications.positionId, positions.id))
        .where(eq(applications.candidateId, ctx.candidateId))
        .orderBy(desc(applications.createdAt));
      return jsonResult({ applications: rows });
    },
  );
}
