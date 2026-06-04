import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { bearerFromHeader, getCandidateByToken } from "./auth.js";
import { buildMcpServer } from "./mcp/server.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerWebRoutes } from "./web/routes.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "hiring-mcp", version: "0.1.0" });
});

// Admin REST surface (Bearer ADMIN_TOKEN).
registerAdminRoutes(app);

// Candidate-facing web UI (session-cookie auth).
registerWebRoutes(app);

/**
 * MCP endpoint. Stateless: each request authenticates via Bearer token,
 * resolves the candidate, and gets a fresh server + transport bound to them.
 */
app.post("/mcp/core", async (req: Request, res: Response) => {
  const token = bearerFromHeader(req.headers.authorization);
  if (!token) {
    res.status(401).json(jsonRpcError(-32001, "Missing Bearer token"));
    return;
  }
  const candidate = await getCandidateByToken(token);
  if (!candidate) {
    res.status(401).json(jsonRpcError(-32001, "Invalid Bearer token"));
    return;
  }

  const server = buildMcpServer({ candidateId: candidate.id });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) res.status(500).json(jsonRpcError(-32603, "Internal server error"));
  }
});

// GET/DELETE on the MCP endpoint are unsupported in stateless mode.
const methodNotAllowed = (_req: Request, res: Response) =>
  res.status(405).json(jsonRpcError(-32000, "Method not allowed (stateless server)"));
app.get("/mcp/core", methodNotAllowed);
app.delete("/mcp/core", methodNotAllowed);

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: "2.0", error: { code, message }, id: null };
}

app.listen(config.port, () => {
  console.log(`hiring-mcp listening on ${config.publicBaseUrl} (port ${config.port})`);
  console.log(`  MCP endpoint:  POST ${config.publicBaseUrl}/mcp/core`);
  console.log(`  Admin API:     ${config.publicBaseUrl}/admin/*`);
});
