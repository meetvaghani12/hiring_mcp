import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../db/index.js";
import { applications, positions } from "../../db/schema.js";
import { config } from "../../config.js";
import { computeReadiness } from "../../services/readiness.js";
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
          link: `${config.publicBaseUrl}/positions/${p.id}`,
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
        "Puts the candidate forward for a position. Requires a complete profile, an uploaded resume, and their " +
        "agent config (and a session log if required). If not application_ready, the response explains what's missing. " +
        "Never submit without the candidate's explicit go-ahead.",
      inputSchema: { posting_id: z.string().describe("The posting UUID from browse_positions") },
    },
    async ({ posting_id }) => {
      const r = await computeReadiness(ctx.candidateId);
      if (!r.applicationReady)
        return errorResult(
          `Not application_ready. Missing: ${r.missing.join(", ")}` +
            (r.profileMissingFields.length ? ` (profile fields: ${r.profileMissingFields.join(", ")})` : ""),
        );

      const [p] = await db.select().from(positions).where(eq(positions.id, posting_id)).limit(1);
      if (!p) return errorResult(`No position found with id ${posting_id}.`);
      if (p.status !== "open") return errorResult(`Position "${p.title}" is not open.`);

      const [existing] = await db
        .select()
        .from(applications)
        .where(and(eq(applications.candidateId, ctx.candidateId), eq(applications.positionId, posting_id)))
        .limit(1);
      if (existing)
        return jsonResult({ applied: true, already: true, application_id: existing.id, status: existing.status });

      const [app] = await db
        .insert(applications)
        .values({ candidateId: ctx.candidateId, positionId: posting_id })
        .returning();
      return jsonResult({
        applied: true,
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
