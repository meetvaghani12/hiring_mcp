/**
 * End-to-end smoke test: mints a candidate, drives the full MCP apply flow
 * against a running server (npm run dev), including a real presigned S3 upload.
 *
 *   Terminal 1:  npm run infra:up && npm run dev
 *   Terminal 2:  npm run smoke
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.PUBLIC_BASE_URL ?? "http://localhost:8080";
const ADMIN = process.env.ADMIN_TOKEN ?? "change-me-admin-token";

const AGENT_CONFIG = `# Engineering Agent Guidelines

This is the rules file I reuse across my repos.

## Build, Test, Lint
- Build: \`make build\` (outputs to ./bin)
- Test all: \`go test ./...\`
- Test one package: \`go test ./internal/config/...\`
- Lint: \`golangci-lint run\`
- Format: \`gofmt -w .\`

## Project Layout
- cmd/      entrypoints
- internal/ private packages (config, database, auth)
- pkg/      shared libraries

## Conventions
- Wrap errors with %w; never swallow them.
- Structured logging via zap; pass ctx to all DB calls.
- Commit messages: imperative mood, < 72 char subject.
- Ask before introducing a new dependency.
- Write a table-driven test for every new branch of logic.

## Database
- Postgres via sqlc-generated queries; migrations live in db/migrations.
- Always run queries inside a transaction when writing more than one row.
- Never use SELECT *; list the columns you need.

## HTTP layer
- Handlers are thin: parse, validate, delegate to a service, render.
- Validate all input at the boundary; never trust client-supplied IDs.
- Return RFC 7807 problem+json for errors.

## Reviews & PRs
- Keep PRs under ~400 lines of diff where possible.
- Every PR description states what changed, why, and how it was tested.
- Rebase on main before merge; no merge commits on feature branches.

## When in doubt
- Prefer the boring, well-trodden solution over the clever one.
- If a change touches auth, storage, or money, ask for a second reviewer.
`;

function step(msg: string) {
  console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
}

async function main() {
  // 1. Mint a candidate via the admin API.
  step("Minting candidate via admin API");
  const mintRes = await fetch(`${BASE}/admin/candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ name: "Smoke Test", email: "smoke@example.com" }),
  });
  const mint = (await mintRes.json()) as { candidate_id: string; token: string };
  console.log("  candidate:", mint.candidate_id);

  // 2. Connect MCP client with the candidate's Bearer token.
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
  console.log("  tools:", tools.tools.map((t) => t.name).join(", "));
  const desc = (n: string) => tools.tools.find((t) => t.name === n)?.description ?? "";
  console.log("  upload_agent_config auto-find:", /DO THIS FOR THE CANDIDATE/.test(desc("upload_agent_config")));
  console.log(
    "  session_log auto-find:",
    /DO THIS FOR THE CANDIDATE AUTOMATICALLY/.test(desc("prepare_agent_session_log_upload")),
  );
  const upmp: any = tools.tools.find((t) => t.name === "update_my_profile");
  const booksDesc = upmp?.inputSchema?.properties?.transformative_books?.description ?? "";
  console.log("  books integrity trick present:", /lodestar/.test(booksDesc));

  // 3. Initial state.
  step("get_my_profile (initial)");
  let profile = await call("get_my_profile");
  console.log("  application_ready:", profile.application_ready, "| missing:", profile.missing);

  // 4. Fill profile.
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
      "Thinking in Systems\n\nChanged how I see feedback loops and leverage points in any org. " +
      "Criticism: light on concrete tooling.\n\nThe Pragmatic Programmer\n\nMade me treat my craft as a discipline. " +
      "Criticism: some advice predates modern CI/CD.\n\nMan's Search for Meaning\n\nReframed how I handle adversity and purpose. " +
      "Criticism: the clinical second half is drier than the memoir.",
  });
  console.log("  missing now:", profile.missing);
  const afterUpdate = await call("get_my_profile");
  console.log(
    "  profile_version:",
    afterUpdate.profile_version,
    "| token_expires_at:",
    afterUpdate.token_expires_at ? "set" : "none",
  );

  step("upload_resume");
  await call("upload_resume", { content: "# Smoke Test\n\nPlatform engineer.\n\n## Experience\n- Built things." });

  step("upload_agent_config");
  await call("upload_agent_config", { content: AGENT_CONFIG });

  // 5. Browse positions.
  step("browse_positions");
  const browse = await call("browse_positions");
  const posting = browse.positions[0];
  console.log("  first role:", posting.title, posting.posting_id);

  // 6. Session-log upload: build a real .tar.gz, presign, PUT, confirm.
  step("Building session-log .tar.gz");
  const dir = mkdtempSync(join(tmpdir(), "smoke-log-"));
  const logFile = join(dir, "session.jsonl");
  writeFileSync(logFile, JSON.stringify({ marker: "applyto_realfast", note: "fake transcript" }) + "\n");
  const archive = join(dir, "session-log.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", dir, "session.jsonl"]);
  const bytes = readFileSync(archive);
  const sha256_b64 = createHash("sha256").update(bytes).digest("base64");
  console.log("  archive bytes:", bytes.length, "| sha256_b64:", sha256_b64.slice(0, 12) + "…");

  step("prepare_agent_session_log_upload");
  const prep = await call("prepare_agent_session_log_upload", { vendor: "claude_code", sha256_b64 });
  console.log("  upload_id:", prep.upload_id);

  step("PUT archive to presigned URL");
  const put = await fetch(prep.upload_url, {
    method: "PUT",
    headers: prep.required_headers,
    body: bytes,
  });
  console.log("  PUT status:", put.status);
  if (!put.ok) throw new Error(`PUT failed: ${put.status} ${await put.text()}`);

  step("confirm_agent_session_log_upload");
  const confirm = await call("confirm_agent_session_log_upload", {
    upload_id: prep.upload_id,
    sha256_b64,
    filename: "session-log.tar.gz",
    model_names: ["claude-opus-4-8"],
    session_started_at: new Date(Date.now() - 600000).toISOString(),
    session_ended_at: new Date().toISOString(),
  });
  console.log("  confirmed:", confirm.confirmed);

  // 7. Ready?
  step("get_my_profile (final)");
  profile = await call("get_my_profile");
  console.log("  application_ready:", profile.application_ready, "| missing:", profile.missing);
  if (!profile.application_ready) throw new Error("Expected application_ready=true");

  // 8. Apply + verify.
  step("apply_to_position");
  const applied = await call("apply_to_position", { posting_id: posting.posting_id });
  console.log("  applied:", applied.applied, "| status:", applied.status);

  step("my_applications");
  const apps = await call("my_applications");
  console.log("  applications:", apps.applications.length);

  await client.close();
  rmSync(dir, { recursive: true, force: true });
  console.log("\n\x1b[32m✓ SMOKE TEST PASSED\x1b[0m");
}

main().catch((err) => {
  console.error("\n\x1b[31m✗ SMOKE TEST FAILED\x1b[0m");
  console.error(err);
  process.exit(1);
});
