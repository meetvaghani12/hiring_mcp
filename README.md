# hiring-mcp

Your own **hiring MCP server**. Candidates apply to *your* open roles through an AI agent
(Claude Code / Codex CLI) over the Model Context Protocol — modeled on RealFast's
`applyto_realfast` workflow, but it's yours: real Postgres, real S3-style object storage,
a Bearer-authed remote HTTP endpoint, and an admin API to manage roles and review applicants.

## What it does

A candidate connects their AI agent to your MCP endpoint with a Bearer token. The agent helps
them fill a profile, upload a resume and their real agent-rules file, upload the session
transcript, then apply to a role. The server **gates** the final `apply` until everything is
present and valid.

```
get_my_profile → update_my_profile / upload_resume / upload_agent_config
              → browse_positions → view_position
              → prepare_agent_session_log_upload → PUT .tar.gz to S3 → confirm_…
              → get_my_profile (application_ready: true) → apply_to_position → my_applications
```

## Architecture

```
AI client ──Streamable HTTP + Bearer──▶ Express ──▶ MCP server (10 tools)
                                          │              │
                                   Bearer auth      domain services
                                   (token→cand)          │
                                          ▼              ▼
                                     Postgres        S3 / MinIO (presigned PUT)
                                          ▲
                              Admin REST (Bearer ADMIN_TOKEN)
```

- **Transport:** stateless Streamable HTTP at `POST /mcp/core`. Each request authenticates by
  Bearer token, resolves the candidate, and gets a fresh server instance bound to them.
- **DB:** Postgres via Drizzle ORM (`src/db/schema.ts`).
- **Storage:** S3-compatible. MinIO locally; point at AWS S3 in prod (drop `S3_ENDPOINT`,
  set real region + creds, `S3_FORCE_PATH_STYLE=false`).
- **Session-log integrity:** the upload is genuinely verified — on confirm the server HEADs the
  object (content-type, size, ≤50 MB) **and downloads it to recompute the SHA-256** before
  promoting it to its permanent key.

## The 10 MCP tools

| Tool | Purpose |
|---|---|
| `get_my_profile` | Current state: profile, resume, agent config, readiness, `missing[]` |
| `update_my_profile` | Patch profile fields (send only what changes) |
| `upload_resume` | Save resume markdown (≤25k chars, versioned) |
| `upload_agent_config` | Save the candidate's *existing* CLAUDE.md/AGENTS.md (1k–100k, fabrication-checked) |
| `browse_positions` | List open roles |
| `view_position` | Full description for one role |
| `apply_to_position` | Submit — **rejected unless `application_ready`** |
| `my_applications` | Status of submitted applications |
| `prepare_agent_session_log_upload` | Reserve slot, get presigned PUT URL |
| `confirm_agent_session_log_upload` | Verify checksum/size/type, finalize |

### Gating & validation
- `application_ready` = complete profile **+** resume **+** agent config **+** confirmed
  session log (the session-log requirement is toggled by `REQUIRE_SESSION_LOG`).
- `transformative_books`: ≥200 chars (hard); <3 books / no criticism → soft warnings.
  The `update_my_profile` field description also carries an **anti-hallucination integrity
  check** (RealFast-style): if the agent fabricates the answer, it's instructed to weave in
  specific marker words (lodestar, recalibrated, watershed, …) — so a faithful, candidate-authored
  answer never contains them and a fabricated one does.
- `upload_agent_config`: rejects files that read as written-for-this-application
  ("You are an AI assistant", mentions of this server, "Application Workflow" headings).

### Tokens & profile versioning
- Candidate tokens **expire** after `TOKEN_TTL_DAYS` (default 90). `getCandidateByToken`
  rejects expired tokens (MCP → 401, web login → 401). Reissue from `/mcp` mints a fresh one.
  The `/mcp` page shows the `expires` date.
- Every `update_my_profile` bumps `profile_version`; `get_my_profile` returns it and the
  profile page shows a **"Profile version N"** badge.

### Auto-discovery (the agent finds files, doesn't ask)
The candidate's agent provides all intelligence (see "The AI lives in the client"),
so behavior is steered through **tool descriptions**, not server code. Two tools are
written to make the agent act *for* the candidate instead of asking them to locate files:
- **`upload_agent_config`** instructs the agent to search the filesystem (cwd + parents,
  `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, git repo roots), pick the most substantive
  real rules file, redact secrets, and upload it — only asking if none exists.
- **`prepare_agent_session_log_upload`** instructs the agent to identify *its own* current
  transcript (`~/.claude/projects/…`, `~/.codex/sessions/rollout-*.jsonl`), scope to just
  this conversation, redact secrets, and upload automatically.

Both keep a secret-redaction safety net: the agent pauses only if it finds sensitive data
it can't safely redact. To restore RealFast's explicit "confirm before sending" gate,
re-add that instruction to the descriptions in `src/mcp/tools/`.

## The apply flow (job-link → SSO → compare → apply)

1. Company careers site links "Apply now" → **`/jobs/:jobId/apply`** (`jobId` = `external_job_id` slug or our uuid).
2. Not signed in → the job is remembered and the candidate is sent to **LinkedIn SSO**.
3. After sign-in the job is bound to the candidate (`target_position_id`) and shown on `/mcp` + `/apply`.
4. Candidate connects their agent. To apply they need only a **complete profile + resume**
   (CLAUDE.md and session logs are no longer required).
5. The agent reads `get_my_profile` (which includes `target_position` + its JD), fills the profile,
   then **compares the resume to the JD** — presenting strong matches, gaps, and a 0–100 fit score.
6. The candidate decides; the agent calls `apply_to_position` with `decision` + the comparison:
   - `decision: "apply"` → status **`shortlisted`**
   - `decision: "decline"` → status **`applied`** (data still reaches the hiring team)
   - fit score / summary / gaps are persisted on the application (visible in the admin list)
   - **one application per role** per candidate.

Try the whole thing locally: open **`/jobs/ai-agent-engineer/apply`** (mock SSO is on by default).

## Candidate sign-in (LinkedIn SSO)

Candidates sign in with **LinkedIn** (OpenID Connect) — self-service, no admin minting:
- `/login` → "Sign in with LinkedIn" → `/auth/linkedin` → LinkedIn → `/auth/linkedin/callback`.
- New account → candidate is created (name/email pre-filled, `email_verified`), a token is minted
  and **shown once** on `/mcp`. Returning users keep their token (reissue from `/mcp` if lost).
- Existing email (e.g. admin-minted) is linked to the LinkedIn identity on first sign-in.

**Local testing without a LinkedIn app:** `LINKEDIN_MOCK=true` (default when no client id is set)
serves a mock identity form that runs the exact same find-or-create + token flow.

**Real LinkedIn:** create an app at developer.linkedin.com, add *Sign In with LinkedIn using
OpenID Connect*, set the redirect URI to `<PUBLIC_BASE_URL>/auth/linkedin/callback`, then set
`LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` and `LINKEDIN_MOCK=false`. (LinkedIn's OIDC
`userinfo` returns name/email/picture but **not** the public profile URL.)

The admin/CLI mint path (`npm run mint-token`) still works for ops and testing.

## Quick start

```bash
cp .env.example .env          # defaults match docker-compose
npm install
npm run infra:up              # Postgres + MinIO (+ bucket) via Docker
npm run db:generate           # generate migration from schema (already committed)
npm run db:migrate            # apply migrations
npm run db:seed               # 3 sample positions
npm run dev                   # server on http://localhost:8787
```

In another terminal, run the full end-to-end check:

```bash
npm run smoke                 # mints a candidate, drives the whole apply flow
```

### Mint a candidate token

```bash
npm run mint-token "Ada Lovelace" ada@example.com
# or via the admin API:
curl -s -X POST http://localhost:8787/admin/candidates \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
```

### Connect an AI agent

```bash
claude mcp add --transport http hiring https://your-host/mcp/core \
  --header "Authorization: Bearer <candidate-token>"
```

## Admin API (Bearer `ADMIN_TOKEN`)

| Method & path | Purpose |
|---|---|
| `POST /admin/candidates` | Mint a candidate + one-time token |
| `GET /admin/candidates` | List candidates |
| `GET /admin/candidates/:id/artifacts` | Dump a candidate's profile, resume, config, session logs |
| `POST /admin/positions` | Create a position (`title`, `location?`, `description`) |
| `GET /admin/positions` | List positions |
| `POST /admin/positions/:id/close` | Close a position |
| `GET /admin/applications` | All applications across candidates |

## Project layout

```
src/
  config.ts            env config
  auth.ts              token hashing, candidate lookup, mint
  validation.ts        resume / books / agent-config rules
  db/                  schema, connection, migrate, seed
  services/            readiness (gating), storage (S3 presign/verify)
  mcp/
    server.ts          builds a per-candidate MCP server
    context.ts         ToolContext + result helpers
    tools/             profile, positions, sessionLog
  admin/routes.ts      admin REST surface
  scripts/             mint-token, smoke
```

## Production notes
- Set a strong `ADMIN_TOKEN`; rotate candidate tokens by minting new ones (only hashes are stored).
- For AWS S3: unset `S3_ENDPOINT`, set real creds + region, `S3_FORCE_PATH_STYLE=false`.
- GCS: swap `src/services/storage.ts` for the GCS SDK's signed-URL equivalents — it's the only
  file that touches object storage.
- Put TLS / a reverse proxy in front; the MCP endpoint must be HTTPS in production.
