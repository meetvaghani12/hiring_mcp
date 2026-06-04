# hiring-mcp

A self-hosted hiring funnel where candidates apply through their own AI agent
(Claude Code / Codex CLI) over the **Model Context Protocol** — plus the recruiter
console to review them. Real Postgres, S3-compatible storage, LinkedIn SSO, and a
Bearer-authed remote MCP endpoint.

## How it works

```
careers site ──"Apply now"──▶ /jobs/:slug/apply ──▶ LinkedIn SSO ──▶ /mcp (token, once)
                                                                        │
candidate's AI agent ══ Streamable HTTP + Bearer ══▶ POST /mcp/core (7 tools)
                                                                        │
        fills profile ▸ uploads resume ▸ compares resume↔JD ▸ records decision
                                                                        │
recruiter console (/recruiter) ──▶ pipeline: submitted → under_review → interviewing → hired/rejected
```

1. A candidate lands on `/jobs/:jobId/apply` from your careers page (`jobId` =
   `external_job_id` slug or internal uuid). The job survives the SSO round-trip.
2. They sign in with **LinkedIn (OIDC)**; a candidate account is found-or-created and a
   personal MCP Bearer token is shown **once** on `/mcp` (reissue anytime).
3. They connect their agent (`claude mcp add --transport http …`). The agent reads
   `get_my_profile` — which includes the **target position + full JD** — fills the
   profile, uploads the resume, then presents a resume↔JD fit comparison.
4. The candidate decides. `decision: "apply"` → application **submitted**;
   `decision: "decline"` → recorded as **declined** (the agent must tell the candidate
   a decline is still visible to the hiring team). One application per role, enforced
   by a DB constraint. Fit score/summary/gaps are stored as the candidate's
   **self-assessment** — labeled that way everywhere they're shown.
5. Recruiters work the pipeline in `/recruiter`: filterable application list with legal
   status transitions, full candidate review (profile, rendered resume, session logs),
   and positions management (create/close/reopen). Optional webhook
   (`APPLICATION_WEBHOOK_URL`) pings on every new application.

## The MCP tools (7, +2 behind a flag)

| Tool | Purpose |
|---|---|
| `get_my_profile` | Profile, resume, readiness + `missing[]`, and `target_position` with the full JD |
| `update_my_profile` | Patch profile fields. Email is identity: settable once, immutable after |
| `upload_resume` | Resume as markdown (≤25k chars, versioned history) |
| `browse_positions` / `view_position` | Open roles / full JD |
| `apply_to_position` | Record decision (`apply`/`decline`) + self-assessed fit — gated on readiness |
| `my_applications` | Status of the candidate's applications |
| `prepare_…` / `confirm_agent_session_log_upload` | Only when `REQUIRE_SESSION_LOG=true`: presigned PUT to S3, then verify (HEAD + full SHA-256 recompute) and promote |

**Gating:** `application_ready` = complete profile + resume (+ confirmed session log when
the flag is on). `transformative_books` requires a substantive (≥200 char) answer in the
candidate's own voice.

## Quick start

```bash
cp .env.example .env          # defaults match docker-compose (mock SSO on)
npm install
npm run infra:up              # Postgres + MinIO (+ bucket) via Docker
npm run db:migrate
npm run db:seed               # 3 sample positions
npm run dev                   # http://localhost:8787
```

Then either open `http://localhost:8787/jobs/ai-agent-engineer/apply` and walk the
candidate flow (mock SSO lets you sign in as any test identity), or run the full
end-to-end check from another terminal:

```bash
npm run smoke                 # mints a candidate, drives the whole MCP apply flow
npm test                      # unit tests (validation, sessions, SSO linking, pipeline, XSS guards)
```

Recruiter console: `http://localhost:8787/recruiter` — sign in with `ADMIN_TOKEN`.

### Connect an AI agent

```bash
claude mcp add --transport http hiring https://your-host/mcp/core \
  --header "Authorization: Bearer <candidate-token>"
```

## Architecture

- **Transport:** stateless Streamable HTTP at `POST /mcp/core`. Every request
  authenticates by Bearer token (SHA-256 hash stored, TTL-enforced), resolves the
  candidate, and gets a fresh per-candidate server instance — any compute node can
  serve any request.
- **Web:** zero-framework server-rendered HTML (candidate portal + recruiter console
  share one design system). Sessions are HMAC-signed cookies with server-side expiry.
- **DB:** Postgres via Drizzle (`src/db/schema.ts`). Application statuses:
  `submitted | declined | under_review | interviewing | rejected | hired`, with legal
  transitions enforced in `src/services/pipeline.ts`.
- **Storage:** S3-compatible (MinIO locally). Session-log uploads go **direct to S3**
  via presigned PUT and are verified by re-downloading and recomputing the SHA-256
  before promotion.

## Security posture

- Candidate tokens: 24-byte random, hash-at-rest, 90-day TTL, one-time reveal, self-service rotation.
- Mock SSO (`LINKEDIN_MOCK`) is an explicit opt-in and **refused in production**.
- SSO email-linking only on verified OIDC emails into rows with no existing LinkedIn
  identity; profile email is immutable once set (prevents email-squatting takeover).
- Production boot refuses default/weak `ADMIN_TOKEN` / `SESSION_SECRET`; admin compare
  is constant-time; rate limits on every credential-accepting route; security headers
  + CSP; candidate URLs scheme-checked at write and render (no `javascript:` hrefs).

## Surfaces

| Path | Who | What |
|---|---|---|
| `POST /mcp/core` | candidate's agent | MCP endpoint (Bearer) |
| `/login`, `/mcp`, `/wiki`, `/apply`, `/profile` | candidate | portal (cookie) |
| `/jobs/:jobId/apply`, `/positions/:id` | public | apply entry + shareable JD |
| `/recruiter/*` | recruiter | console (admin-token login → 12h cookie) |
| `/admin/*` | ops/scripts | JSON API (Bearer `ADMIN_TOKEN`) |

## Project layout

```
src/
  config.ts            env config + production safety checks
  auth.ts              token hashing, candidate lookup, mint, safeEqual
  validation.ts        resume / books rules, isUuid
  auth/linkedin.ts     OIDC flow + account-linking policy (planLink)
  db/                  schema, connection, migrate, seed
  services/            readiness (apply gate), pipeline (status transitions),
                       storage (S3 presign/verify), notify (webhook)
  mcp/                 per-candidate server + tools (profile, positions, sessionLog)
  web/                 candidate portal: routes, views, session, http hardening
  recruiter/           recruiter console: routes, views, session
  admin/routes.ts      JSON API for ops/scripts
  scripts/             mint-token, smoke (e2e)
test/                  unit tests (vitest)
```

## Production notes

- `NODE_ENV=production` activates the boot-time secret checks, secure cookies, and the
  mock-SSO refusal. Put TLS in front; `trust proxy` is already set to 1 hop.
- Container: `docker build -t hiring-mcp .` — runs migrations separately
  (`node dist/db/migrate.js`) before rollout, never at boot.
- The in-memory rate limiter is single-process by design; move to a shared store if
  you ever run multiple instances. See `DEPLOY.md` for the serverless blueprint
  (deliberately deferred until traffic justifies it).
- LinkedIn: create an app at developer.linkedin.com with *Sign In with LinkedIn using
  OpenID Connect*, redirect URI `<PUBLIC_BASE_URL>/auth/linkedin/callback`, then set
  `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` and `LINKEDIN_MOCK=false`.
