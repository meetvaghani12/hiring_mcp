import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerPositionTools } from "./tools/positions.js";
// Session-log tools are not registered in the current flow (no session log required).
// import { registerSessionLogTools } from "./tools/sessionLog.js";

/** Build a fresh MCP server bound to one authenticated candidate. */
export function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer({
    name: "hiring-mcp",
    version: "0.1.0",
  });

  registerProfileTools(server, ctx);
  registerPositionTools(server, ctx);

  return server;
}
