import { escapeHtml, layout, renderMarkdown } from "../web/views.js";
import { nextStatuses, type ApplicationStatus } from "../services/pipeline.js";
import type { Candidate, Position, SessionLogUpload } from "../db/schema.js";
import type { Readiness } from "../services/readiness.js";

function recruiterNav(active: string): string {
  const link = (href: string, label: string) =>
    `<a href="${href}" class="${active === label ? "active" : ""}">${label}</a>`;
  return `<nav class="menu">
    ${link("/recruiter/applications", "applications")}
    ${link("/recruiter/candidates", "candidates")}
    ${link("/recruiter/positions", "positions")}
    <a href="/recruiter/logout">sign out</a>
  </nav>`;
}

function page(active: string, body: string): string {
  return layout({ active, body, navHtml: recruiterNav(active) });
}

export function recruiterLoginPage(error?: string): string {
  const body = `
  <div class="label">recruiter console</div>
  <h1>Sign in.</h1>
  <p class="muted">Enter the admin token to access candidates and applications.</p>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  <form method="post" action="/recruiter/login" class="box">
    <div class="field" style="margin:0 0 16px"><div class="fl">admin token</div>
      <input class="input" type="password" name="token" autocomplete="current-password"></div>
    <button class="btn" type="submit">Continue</button>
  </form>`;
  return layout({ active: "", body, navHtml: '<div style="flex:1"></div>' });
}

export function statusBadge(status: string): string {
  return `<span class="badge st-${escapeHtml(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>`;
}

/** Inline form buttons for every legal next status. */
function transitionButtons(applicationId: string, status: ApplicationStatus): string {
  const next = nextStatuses(status);
  if (next.length === 0) return '<span class="muted">—</span>';
  return next
    .map(
      (to) => `<form class="inline" method="post" action="/recruiter/applications/${applicationId}/status">
        <input type="hidden" name="status" value="${to}">
        <button class="btn sm" type="submit">${to.replace(/_/g, " ")}</button>
      </form>`,
    )
    .join("");
}

export interface RecruiterApplicationRow {
  application_id: string;
  status: ApplicationStatus;
  decision: string;
  fit_score: number | null;
  fit_summary: string | null;
  fit_gaps: string[] | null;
  created_at: Date;
  candidate_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  position_title: string;
}

export function applicationsPage(rows: RecruiterApplicationRow[], filter: string | null): string {
  const filters = ["all", "submitted", "under_review", "interviewing", "hired", "rejected", "declined"]
    .map((f) => {
      const href = f === "all" ? "/recruiter/applications" : `/recruiter/applications?status=${f}`;
      const activeStyle = (filter ?? "all") === f ? "color:var(--bright)" : "";
      return `<a href="${href}" style="${activeStyle}">${f.replace(/_/g, " ")}</a>`;
    })
    .join(" &middot; ");

  const tr = (a: RecruiterApplicationRow) => `
    <tr>
      <td><a href="/recruiter/candidates/${a.candidate_id}">${escapeHtml(a.candidate_name ?? "(unnamed)")}</a>
        <div class="muted">${escapeHtml(a.candidate_email ?? "")}</div></td>
      <td>${escapeHtml(a.position_title)}</td>
      <td>${statusBadge(a.status)}</td>
      <td>${a.fit_score != null ? `${a.fit_score}/100` : '<span class="muted">—</span>'}
        ${a.fit_summary ? `<div class="muted" style="max-width:32ch">${escapeHtml(a.fit_summary)}</div>` : ""}</td>
      <td class="muted">${a.created_at.toISOString().slice(0, 10)}</td>
      <td>${transitionButtons(a.application_id, a.status)}</td>
    </tr>`;

  const body = `
  <div class="label">recruiter console</div>
  <h1>Applications</h1>
  <p class="muted">${filters}</p>
  <p class="muted">Fit scores are <strong>self-assessed by the candidate's agent</strong> — context, not an evaluation.</p>
  ${
    rows.length
      ? `<table class="list"><tr><th>candidate</th><th>role</th><th>status</th><th>self-assessed fit</th><th>date</th><th>actions</th></tr>
        ${rows.map(tr).join("")}</table>`
      : '<p class="muted">No applications yet.</p>'
  }`;
  return page("applications", body);
}

export interface RecruiterCandidateRow {
  id: string;
  name: string | null;
  email: string | null;
  current_title: string | null;
  created_at: Date;
  applications_count: number;
}

export function candidatesPage(rows: RecruiterCandidateRow[]): string {
  const tr = (c: RecruiterCandidateRow) => `
    <tr>
      <td><a href="/recruiter/candidates/${c.id}">${escapeHtml(c.name ?? "(unnamed)")}</a></td>
      <td class="muted">${escapeHtml(c.email ?? "")}</td>
      <td class="muted">${escapeHtml(c.current_title ?? "")}</td>
      <td>${c.applications_count}</td>
      <td class="muted">${c.created_at.toISOString().slice(0, 10)}</td>
    </tr>`;
  const body = `
  <div class="label">recruiter console</div>
  <h1>Candidates</h1>
  ${
    rows.length
      ? `<table class="list"><tr><th>name</th><th>email</th><th>title</th><th>apps</th><th>joined</th></tr>
        ${rows.map(tr).join("")}</table>`
      : '<p class="muted">No candidates yet.</p>'
  }`;
  return page("candidates", body);
}

export interface CandidateDetail {
  candidate: Candidate;
  readiness: Readiness;
  resume: string | null;
  sessionLogs: SessionLogUpload[];
  applications: { id: string; status: ApplicationStatus; position_title: string; created_at: Date }[];
}

export function candidateDetailPage(d: CandidateDetail): string {
  const c = d.candidate;
  const field = (label: string, value: string | null | undefined, pre = false) =>
    value && String(value).trim()
      ? `<div class="field"><div class="fl">${label}</div><div class="${pre ? "pre" : ""}">${escapeHtml(value)}</div></div>`
      : "";

  const apps = d.applications.length
    ? `<table class="list"><tr><th>role</th><th>status</th><th>date</th></tr>${d.applications
        .map(
          (a) =>
            `<tr><td>${escapeHtml(a.position_title)}</td><td>${statusBadge(a.status)}</td><td class="muted">${a.created_at
              .toISOString()
              .slice(0, 10)}</td></tr>`,
        )
        .join("")}</table>`
    : '<p class="muted">No applications.</p>';

  const logs = d.sessionLogs.length
    ? `<table class="list"><tr><th>vendor</th><th>status</th><th>size</th><th>models</th><th>uploaded</th></tr>${d.sessionLogs
        .map(
          (l) =>
            `<tr><td>${escapeHtml(l.vendor)}</td><td>${escapeHtml(l.status)}</td><td class="muted">${
              l.sizeBytes ? `${Math.round(l.sizeBytes / 1024)} KB` : "—"
            }</td><td class="muted">${escapeHtml((l.modelNames ?? []).join(", "))}</td><td class="muted">${l.createdAt
              .toISOString()
              .slice(0, 16)
              .replace("T", " ")}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const body = `
  <div class="label">candidate</div>
  <div class="pos"><h1 style="margin-bottom:6px">${escapeHtml(c.name ?? "(unnamed)")}</h1>
    <span class="badge">profile v${c.profileVersion}</span></div>
  <div class="muted">${escapeHtml(c.currentTitle ?? "")}${c.currentCompany ? ` at ${escapeHtml(c.currentCompany)}` : ""}</div>
  <div class="muted">${escapeHtml(c.email ?? "")}${c.phone ? ` &middot; ${escapeHtml(c.phone)}` : ""}</div>
  <div class="muted" style="margin-top:6px">${
    d.readiness.applicationReady ? '<span class="dot">●</span> application-ready' : `incomplete: ${escapeHtml(d.readiness.missing.join(", "))}`
  }</div>

  <h2>Applications</h2>
  ${apps}

  <h2>Profile</h2>
  ${field("bio", c.summary)}
  ${field("skills", c.skills)}
  ${field("location", c.location)}
  ${c.yearsOfExperience != null ? field("experience", `${c.yearsOfExperience} years`) : ""}
  ${field("notice period", c.noticePeriod)}
  ${field("preferred working style", c.preferredWorkingStyle)}
  ${field("transformative books", c.transformativeBooks, true)}

  ${d.resume ? `<h2>Résumé</h2><div class="resume">${renderMarkdown(d.resume)}</div>` : '<p class="muted">No resume uploaded.</p>'}
  ${logs ? `<h2>Session logs</h2>${logs}` : ""}`;
  return page("candidates", body);
}

export function positionsAdminPage(rows: (Position & { applications_count: number })[], error?: string): string {
  const tr = (p: Position & { applications_count: number }) => `
    <tr>
      <td>${escapeHtml(p.title)}<div class="muted">${escapeHtml(p.externalJobId ?? "")}</div></td>
      <td class="muted">${escapeHtml(p.location ?? "Remote")}</td>
      <td>${p.status === "open" ? '<span class="badge st-submitted">open</span>' : '<span class="badge closed">closed</span>'}</td>
      <td>${p.applications_count}</td>
      <td>
        ${
          p.status === "open"
            ? `<form class="inline" method="post" action="/recruiter/positions/${p.id}/close"><button class="btn sm" type="submit">close</button></form>`
            : `<form class="inline" method="post" action="/recruiter/positions/${p.id}/reopen"><button class="btn sm" type="submit">reopen</button></form>`
        }
        <a class="btn sm" style="background:transparent;color:var(--accent);border:1px solid var(--border)" href="/positions/${
          p.externalJobId ?? p.id
        }">view</a>
      </td>
    </tr>`;

  const body = `
  <div class="label">recruiter console</div>
  <h1>Positions</h1>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  ${
    rows.length
      ? `<table class="list"><tr><th>title</th><th>location</th><th>status</th><th>apps</th><th>actions</th></tr>${rows
          .map(tr)
          .join("")}</table>`
      : '<p class="muted">No positions yet.</p>'
  }
  <h2>New position</h2>
  <form method="post" action="/recruiter/positions" class="box">
    <div class="field" style="margin:0 0 16px"><div class="fl">title</div>
      <input class="input" name="title" required></div>
    <div class="field" style="margin:0 0 16px"><div class="fl">location</div>
      <input class="input" name="location" placeholder="Remote"></div>
    <div class="field" style="margin:0 0 16px"><div class="fl">external job id (slug for the apply link)</div>
      <input class="input" name="external_job_id" placeholder="ai-agent-engineer"></div>
    <div class="field" style="margin:0 0 16px"><div class="fl">job description (markdown)</div>
      <textarea class="input" name="description" required></textarea></div>
    <button class="btn" type="submit">Create position</button>
  </form>`;
  return page("positions", body);
}
