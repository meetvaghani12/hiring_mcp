# hiring-mcp — Roadmap (RealFast parity & beyond)

Tracking the phased plan derived from comparing our MCP to RealFast's `applyto_realfast`.
Check items off as they ship.

Legend: `[x]` done · `[ ]` pending · `[~]` in progress

---

## Baseline — what already matches RealFast (done in initial build)
- [x] 10 MCP tools with identical names
- [x] `get_my_profile` response shape
- [x] Gating (`application_ready` + `missing[]`)
- [x] Connect/restart behavior (client-side; documented on `/mcp`)
- [x] Web pages: mcp / wiki / apply / profile + dark-light theme toggle
- [x] Token reissue from the web UI
- [x] Session-log integrity — **stronger than RealFast** (download + recompute SHA-256, not HEAD-only)
- [x] Auto-discovery descriptions (agent finds CLAUDE.md + session log itself, no asking)
- [x] Profile page renders the full uploaded résumé (not just skills)

Intentional differences (by design, "your own hiring MCP"):
- Positions come from our own DB + admin API, **not** Ashby ATS.

---

## P0 — Fidelity quick wins ✅ COMPLETE
- [x] **P0.1** `transformative_books` anti-hallucination integrity check
      (lodestar/recalibrated/watershed marker-word instruction in the field description)
- [x] **P0.2** Token expiry — `TOKEN_TTL_DAYS` (default 90), enforced in `getCandidateByToken`
      (MCP→401, web→401), shown as `expires …` on `/mcp`
- [x] **P0.3** Profile versioning — `profile_version` bumps on every `update_my_profile`,
      returned in `get_my_profile`, shown as "Profile version N" badge
- [x] **P0.4** Warmer "senior recruiter" persona in tool descriptions (esp. `get_my_profile`)

Verified: full smoke test passes; expiry valid→302 / expired→401; version 1→2 on update.
Migration: `drizzle/0002_*`.

---

## P1 — Recruiter side (the missing half)
- [ ] **P1.1** Recruiter web UI over the existing admin API
      - [ ] Candidate list
      - [ ] Application pipeline view
      - [ ] Artifact viewer (resume / agent config / session log)
      - [ ] "My Interviews"-style table (matches image 5)
- [ ] **P1.2** Application status transitions
      (`submitted → under_review → interviewing → hired/rejected`) with admin actions
- [ ] **P1.3** Recruiter auth (separate from candidate sessions; reuse `ADMIN_TOKEN` or accounts)

---

## P2 — Production
- [x] **P2.1** Real web auth — **LinkedIn SSO (OIDC)** self-service signup
      - [x] `/auth/linkedin` + `/auth/linkedin/callback` (code → token → userinfo)
      - [x] find-or-create by `linkedin_sub`, link existing by email, auto-mint token for new accounts
      - [x] fresh-token reveal once on `/mcp` after signup; CSRF `state`; profile pre-fill (name/email)
      - [x] **mock mode** (`LINKEDIN_MOCK`) to test the full flow with no LinkedIn app
      - [ ] real LinkedIn app credentials (manual: create app, add OIDC product, set redirect URI)
- [ ] **P2.2** Deploy: Lambda + Aurora Serverless v2 (Data API) + S3 + CloudFront — see `DEPLOY.md`
- [ ] **P2.3** Optional ATS sync (Ashby or similar) to import/refresh positions

---

## P3 — Optional AI layer (server-side, uses your Anthropic key)
- [ ] **P3.1** Candidate ↔ role fit scoring (shown in recruiter UI)
- [ ] **P3.2** Smarter fabrication detection (Claude classifier augmenting the regex heuristics)
- [ ] **P3.3** Resume parsing → auto-extract structured profile fields
- [ ] **P3.4** Session-log summary (recruiter-facing TL;DR)

---

## Notes
- The candidate's AI agent provides all candidate-side intelligence; server stays deterministic.
- Reference: `realfast-mcp-report.md` (parent dir) and the RealFast tool `tools/list` curl.
- Restart-after-`mcp add` is a client (Claude Code / Codex) constraint — not fixable server-side.
