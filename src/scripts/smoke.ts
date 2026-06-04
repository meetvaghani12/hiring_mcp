/**
 * End-to-end smoke test for the job-link flow: mints a candidate, drives the
 * full MCP path (profile -> resume -> compare -> apply/decline) against a running
 * server (npm run dev). No session log / agent config required anymore.
 *
 *   Terminal 1:  npm run infra:up && npm run dev
 *   Terminal 2:  npm run smoke
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:8787";
const ADMIN = process.env.ADMIN_TOKEN ?? "change-me-admin-token";

function step(msg: string) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

async function main() {
  step("Minting candidate via admin API");
  const mintRes = await fetch(`${BASE}/admin/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ name: "Smoke Test", email: "smoke@example.com" }),
  });
  const mint = (await mintRes.json()) as { candidate_id: string; token: string };
  console.log("  candidate:", mint.candidate_id);

  step("Connecting MCP client");
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp/core`), {
    requestInit: { headers: { Authorization: `Bearer ${mint.token}` } },
  });
  const client = new Client({ name: "smoke", version: "1.0.0" });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r: any = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? "";
    if (r.isError) throw new Error(`${name} errored: ${text}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  console.log("  tools:", names.join(", "));

  step("get_my_profile (initial)");
  let profile = await call("get_my_profile");
  console.log("  application_ready:", profile.application_ready, "| missing:", profile.missing);

  step("update_my_profile");
  profile = await call("update_my_profile", {
    name: "Smoke Test",
    email: "smoke@example.com",
    phone: "+910000000000",
    current_title: "Platform Engineer",
    location: "Remote",
    years_of_experience: 5,
    skills: "TypeScript, Go, GCP, Terraform, Postgres",
    summary: "Platform engineer who likes boring, reliable infrastructure.",
    transformative_books:
      "Thinking in Systems\n\nChanged how I see feedback loops. Criticism: light on tooling.\n\n" +
      "The Pragmatic Programmer\n\nTreated craft as discipline. Criticism: pre-CI/CD advice.\n\n" +
      "Man's Search for Meaning\n\nReframed adversity and purpose. Criticism: drier second half.",
  });
  console.log("  missing now:", profile.missing);

  step("upload_resume -> should become application_ready WITHOUT a session log");
  await call("upload_resume", {
    content: "# Smoke Test\n\nPlatform engineer.\n\n## Experience\n- Built reliable infra on GCP and AWS.",
  });
  profile = await call("get_my_profile");
  console.log("  application_ready:", profile.application_ready, "| missing:", profile.missing);
  if (!profile.application_ready) throw new Error("Expected application_ready=true after profile+resume");

  step("browse_positions");
  const browse = await call("browse_positions");
  const [first, second] = browse.positions;
  console.log("  roles:", browse.positions.length);

  step("apply_to_position (decision=apply) -> submitted");
  const applied = await call("apply_to_position", {
    posting_id: first.posting_id,
    decision: "apply",
    fit_score: 82,
    fit_summary: "Strong cloud/IaC match; slightly light on the exact stack.",
    fit_gaps: ["No production Kubernetes operator experience"],
  });
  console.log("  recorded:", applied.recorded, "| status:", applied.status);
  if (applied.status !== "submitted") throw new Error("apply should map to submitted");

  step("apply_to_position (decision=decline) on another role -> declined");
  const declined = await call("apply_to_position", {
    posting_id: second.posting_id,
    decision: "decline",
    fit_score: 40,
    fit_summary: "Backend Go role; candidate is more infra-focused.",
    fit_gaps: ["Limited Go service ownership"],
  });
  console.log("  recorded:", declined.recorded, "| status:", declined.status);
  if (declined.status !== "declined") throw new Error("decline should map to declined");

  step("immutable email: changing a set email is rejected");
  const emailChange: any = await client.callTool({
    name: "update_my_profile",
    arguments: { email: "other@example.com" },
  });
  console.log("  rejected:", emailChange.isError === true);
  if (emailChange.isError !== true) throw new Error("expected email change to be rejected");

  step("one-application-per-role enforced");
  const again = await call("apply_to_position", { posting_id: first.posting_id, decision: "apply" });
  console.log("  already:", again.already === true);
  if (again.already !== true) throw new Error("expected duplicate application to be blocked");

  step("my_applications");
  const apps = await call("my_applications");
  console.log("  applications:", apps.applications.length, "(expect 2)");

  await client.close();
  console.log("\n\x1b[32m✓ SMOKE TEST PASSED\x1b[0m");
}

main().catch((err) => {
  console.error("\n\x1b[31m✗ SMOKE TEST FAILED\x1b[0m");
  console.error(err);
  process.exit(1);
});
