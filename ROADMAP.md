# hiring-mcp — Roadmap

Legend: `[x]` done · `[ ]` pending

## Shipped

**Candidate flow (job-link → SSO → compare → apply)**
- [x] `GET /jobs/:jobId/apply` entry (slug or uuid), job carried through SSO, friendly 404s
- [x] LinkedIn SSO (OIDC) with hardened account linking + immutable identity email
- [x] Dev mock SSO — explicit opt-in, refused in production
- [x] 7 MCP tools; gate = profile + resume; `REQUIRE_SESSION_LOG=true` adds the
      verified session-log upload tools + gate
- [x] Honest statuses: `apply → submitted`, `decline → declined` (agent must disclose);
      fit fields labeled self-assessed everywhere
- [x] One application per role (DB constraint, race-free insert)
- [x] Public shareable JD page `GET /positions/:id`

**Recruiter side**
- [x] Recruiter console `/recruiter`: pipeline with legal status transitions
      (`submitted → under_review → interviewing → hired/rejected`), candidate review
      (profile, rendered resume, session logs), positions create/close/reopen
- [x] New-application webhook (`APPLICATION_WEBHOOK_URL`)
- [x] JSON admin API kept for ops/scripts (`/admin/*`, Bearer)

**Security & reliability**
- [x] Hash-at-rest tokens with TTL + rotation; constant-time admin compare
- [x] Production boot checks (no weak secrets, no mock SSO)
- [x] Expiring signed sessions, secure cookies, rate limits, security headers, CSP
- [x] URL scheme guards (write + render); XSS-safe markdown rendering
- [x] Unit tests (31) + CI; e2e smoke script; Dockerfile

## Next

- [ ] Recruiter accounts (per-recruiter identity instead of one shared admin token);
      audit log of status changes
- [ ] Email verification / notification to candidates on status change
- [ ] S3 lifecycle rule (or sweeper) for orphaned `pending/` session-log uploads
- [ ] Pagination once lists pass ~1k rows
- [ ] Real LinkedIn app credentials in the deployed environment
- [ ] Deploy (see `DEPLOY.md`) — start with a single always-on container; the
      Lambda/Aurora scale-to-zero build-out is deferred until traffic justifies it
- [ ] Optional server-side AI layer: independent fit scoring (replaces reliance on the
      candidate's self-assessment), resume parsing → structured fields, session-log TL;DR

## Notes
- The candidate's AI agent provides all candidate-side intelligence; the server stays
  deterministic and steers behavior through tool descriptions.
- Restart-after-`mcp add` is a client constraint (Claude Code / Codex), not fixable server-side.
