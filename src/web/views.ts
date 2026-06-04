import { config } from "../config.js";
import type { Readiness } from "../services/readiness.js";
import type { Candidate, Position } from "../db/schema.js";

// Rename these two to brand the portal as your own.
const BRAND = "join.hiring";
const MCP_NAME = "hiring";
const VERSION = "0.1.0";

export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Minimal, XSS-safe markdown renderer for resume content. Escapes everything
 * first (so any raw HTML becomes inert text), then applies a small subset:
 * headings, bullet lists, bold, and links. Good enough for resume markdown.
 */
export function renderMarkdown(md: string): string {
  const inline = (t: string) =>
    t
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

  const lines = escapeHtml(md).split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^#{4,6}\s+(.*)$/.exec(line))) {
      closeList();
      html += `<h4>${inline(m[1])}</h4>`;
    } else if ((m = /^###\s+(.*)$/.exec(line))) {
      closeList();
      html += `<h4>${inline(m[1])}</h4>`;
    } else if ((m = /^##\s+(.*)$/.exec(line))) {
      closeList();
      html += `<h3>${inline(m[1])}</h3>`;
    } else if ((m = /^#\s+(.*)$/.exec(line))) {
      closeList();
      html += `<h3>${inline(m[1])}</h3>`;
    } else if ((m = /^[-*]\s+(.*)$/.exec(line))) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${inline(m[1])}</li>`;
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

const CSS = `
:root{
  --bg:#0b0b0c; --fg:#cfcfd2; --bright:#f2f2f4; --muted:#71717a;
  --border:#1d1d21; --card:#111114; --accent:#3b6ef5; --accent-fg:#fff;
  --amber:#c8922b; --green:#3fb950; --quote:#d99a3a;
  --font-serif:'Lora',Georgia,'Times New Roman',serif;
  --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
:root[data-theme="light"]{
  --bg:#ffffff; --fg:#3a3a40; --bright:#16161a; --muted:#8a8a92;
  --border:#e6e6e9; --card:#f7f7f8; --accent:#3b6ef5; --accent-fg:#fff;
  --amber:#9a6c14; --green:#1a9d4b; --quote:#c07f1f;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font-family:var(--font-mono);font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:840px;margin:0 auto;padding:40px 28px 80px}
header.top{display:flex;align-items:center;gap:28px;margin-bottom:88px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--bright);font-size:18px}
.brand .glyph{display:inline-grid;grid-template-columns:1fr 1fr;gap:2px;width:22px;height:22px;transform:skewX(-12deg)}
.brand .glyph i{background:var(--accent);border-radius:1px}
.brand sup{color:var(--accent);font-size:11px;font-weight:600}
nav.menu{display:flex;gap:20px;flex:1;color:var(--muted);font-size:14px}
nav.menu a{color:var(--muted)}
nav.menu a.active{color:var(--bright)}
.toggle{background:var(--card);border:1px solid var(--border);color:var(--fg);width:46px;height:38px;border-radius:8px;cursor:pointer;font-size:15px}
.label{color:var(--muted);text-transform:uppercase;letter-spacing:.18em;font-size:12px;margin-bottom:18px}
h1{font-family:var(--font-serif);font-weight:700;color:var(--bright);font-size:44px;line-height:1.1;margin:0 0 28px}
h2{font-family:var(--font-serif);font-weight:600;color:var(--bright);font-size:26px;margin:48px 0 20px}
p{margin:0 0 16px;max-width:62ch}
.muted{color:var(--muted)}
.row{display:flex;gap:24px;margin:10px 0}
.row .k{color:var(--muted);width:90px;flex:none}
.dot{color:var(--green)}
.card{border:1px solid var(--border);background:var(--card);border-radius:12px;padding:22px 24px;margin:18px 0}
.box{border:1px solid var(--border);background:var(--card);border-radius:12px;padding:22px 24px;margin:28px 0}
.btn{display:inline-block;background:var(--accent);color:var(--accent-fg);border:none;border-radius:8px;padding:10px 18px;font-family:var(--font-mono);font-size:14px;cursor:pointer;text-decoration:none}
.btn:hover{opacity:.9;text-decoration:none}
.btn.linkedin{background:#0a66c2;color:#fff;display:inline-flex;align-items:center;gap:10px;padding:12px 20px;font-size:15px}
.btn.linkedin .in{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;background:#fff;color:#0a66c2;border-radius:3px;font-weight:700;font-size:12px}
details.fallback{margin-top:30px}
details.fallback summary{color:var(--muted);cursor:pointer;list-style:none}
details.fallback summary::-webkit-details-marker{display:none}
.badge{border:1px solid var(--border);border-radius:999px;padding:3px 12px;font-size:12px;color:var(--muted)}
.badge.closed{color:var(--amber);border-color:color-mix(in srgb,var(--amber) 45%,transparent)}
.pos{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
.pos .meta{color:var(--muted);font-size:13px;white-space:nowrap}
.pos h3{margin:0 0 10px;color:var(--bright);font-size:18px;display:flex;align-items:center;gap:12px}
.check{font-size:18px;margin:14px 0;color:var(--bright)}
.check .ok{color:var(--green)}
.check .no{color:var(--muted)}
.quote{border-left:3px solid var(--quote);padding:2px 0 2px 18px;color:var(--quote);font-style:italic;margin:8px 0 24px}
.codehead{display:flex;justify-content:space-between;align-items:center;color:var(--muted);text-transform:uppercase;letter-spacing:.16em;font-size:12px;margin:26px 0 10px}
.codehead button{background:none;border:none;color:var(--muted);cursor:pointer;font-family:inherit;font-size:12px;text-transform:uppercase;letter-spacing:.16em}
pre{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 22px;overflow:auto;margin:0;color:var(--fg);white-space:pre-wrap;word-break:break-word;font-size:13.5px}
.pre{white-space:pre-wrap;word-break:break-word}
.field{margin:30px 0}
.field .fl{color:var(--muted);text-transform:uppercase;letter-spacing:.16em;font-size:12px;margin-bottom:6px}
.hr{border:none;border-top:1px solid var(--border);margin:34px 0}
.resume h3{font-family:var(--font-serif);font-weight:600;color:var(--bright);font-size:20px;margin:28px 0 10px}
.resume h4{color:var(--bright);font-size:15px;margin:18px 0 6px;font-family:var(--font-mono);font-weight:700}
.resume p{margin:0 0 10px;max-width:none}
.resume ul{margin:8px 0 16px;padding-left:20px}
.resume li{margin:5px 0}
.input{width:100%;background:var(--card);border:1px solid var(--border);color:var(--fg);border-radius:8px;padding:12px 14px;font-family:var(--font-mono);font-size:14px}
.err{color:#e5534b;margin:12px 0}
.reveal{border-color:color-mix(in srgb,var(--green) 45%,transparent)}
footer{margin-top:64px;padding-top:22px;border-top:1px solid var(--border);color:var(--muted);font-size:13px}
`;

const THEME_SCRIPT = `
(function(){try{var t=localStorage.getItem('hm-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
function hmToggle(){var d=document.documentElement;var t=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',t);try{localStorage.setItem('hm-theme',t);}catch(e){}document.getElementById('themeIcon').textContent=t==='dark'?'\\u2600':'\\u263E';}
function hmCopy(id){var el=document.getElementById(id);navigator.clipboard.writeText(el.innerText);}
`;

function nav(active: string): string {
  const link = (href: string, label: string) =>
    `<a href="${href}" class="${active === label ? "active" : ""}">${label}</a>`;
  return `<nav class="menu">
    ${link("/mcp", "mcp")}
    ${link("/wiki", "wiki")}
    ${link("/apply", "apply")}
    ${link("/profile", "profile")}
    <a href="/logout">sign out</a>
  </nav>`;
}

export function layout(opts: { active: string; body: string; authed?: boolean }): string {
  return `<!doctype html><html lang="en" data-theme="dark"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BRAND}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script>${THEME_SCRIPT}</script>
</head><body><div class="wrap">
<header class="top">
  <div class="brand"><span class="glyph"><i></i><i></i><i></i><i></i></span>${BRAND}<sup>β</sup></div>
  ${opts.authed === false ? '<div style="flex:1"></div>' : nav(opts.active)}
  <button class="toggle" onclick="hmToggle()" aria-label="theme"><span id="themeIcon">&#9728;</span></button>
</header>
${opts.body}
<footer>&copy; ${BRAND} &middot; v${VERSION} &middot; this is beta software</footer>
</div></body></html>`;
}

export function loginPage(error?: string): string {
  const body = `
  <div class="label">candidate access</div>
  <h1>Sign in.</h1>
  <p class="muted">Sign in with LinkedIn to start your application. We'll set up your profile and issue the access token your AI agent uses to connect.</p>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
  <a class="btn linkedin" href="/auth/linkedin"><span class="in">in</span> Sign in with LinkedIn</a>
  <details class="fallback">
    <summary>Have an access token already?</summary>
    <form method="post" action="/login" class="box" style="margin-top:14px">
      <div class="field" style="margin:0 0 16px"><div class="fl">access token</div>
        <input class="input" type="password" name="token" placeholder="cand_…"></div>
      <button class="btn" type="submit">Continue</button>
    </form>
  </details>`;
  return layout({ active: "", body, authed: false });
}

/** Simple unauthenticated message page (friendly 404s etc.). */
export function messagePage(title: string, text: string): string {
  const body = `
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">${escapeHtml(text)}</p>
  <p><a class="btn" href="/wiki">View open positions</a></p>`;
  return layout({ active: "", body, authed: false });
}

/** Public, shareable job-description page. */
export function positionPage(p: Position, signedIn: boolean): string {
  const applyHref = `/jobs/${encodeURIComponent(p.externalJobId ?? p.id)}/apply`;
  const open = p.status === "open";
  const body = `
  <div class="label">open role</div>
  <h1>${escapeHtml(p.title)}${open ? "" : ' <span class="badge closed">CLOSED</span>'}</h1>
  <p class="muted">${escapeHtml(p.location ?? "Remote")} &middot; Full-time</p>
  ${open ? `<p><a class="btn" href="${applyHref}">Apply${signedIn ? "" : " — sign in with LinkedIn"}</a></p>` : ""}
  <hr class="hr">
  <div class="resume">${renderMarkdown(p.description)}</div>`;
  return layout({ active: "", body, authed: signedIn });
}

export function mockLinkedInPage(): string {
  const body = `
  <div class="label">mock linkedin · dev only</div>
  <h1>Mock sign-in.</h1>
  <p class="muted">LINKEDIN_MOCK is on, so no real LinkedIn app is needed. Enter an identity to simulate the OIDC userinfo response and run the full signup flow.</p>
  <form method="post" action="/auth/linkedin/mock" class="box">
    <div class="field" style="margin:0 0 16px"><div class="fl">name</div>
      <input class="input" name="name" placeholder="Ada Lovelace"></div>
    <div class="field" style="margin:0 0 16px"><div class="fl">email</div>
      <input class="input" name="email" placeholder="ada@example.com" required></div>
    <button class="btn linkedin" type="submit"><span class="in">in</span> Continue as this user</button>
  </form>`;
  return layout({ active: "", body, authed: false });
}

export function mcpPage(data: {
  tokenHint: string | null;
  freshToken?: string;
  tokenExpiresAt?: Date | null;
  targetTitle?: string | null;
}): string {
  const tokenDisplay = data.freshToken
    ? escapeHtml(data.freshToken)
    : data.tokenHint
      ? `cand_…${escapeHtml(data.tokenHint)}`
      : "cand_…";
  const tokenForCmd = data.freshToken ?? "YOUR_TOKEN";
  const url = `${config.publicBaseUrl}/mcp/core`;
  const claudeCmd = `claude mcp remove ${MCP_NAME}\nclaude mcp add --transport http ${MCP_NAME} \\\n  ${url} \\\n  --header "Authorization: Bearer ${tokenForCmd}"`;
  const codexCmd = `[mcp_servers.${MCP_NAME}]\nurl = "${url}"\nenabled = true\n\n[mcp_servers.${MCP_NAME}.http_headers]\n"Authorization" = "Bearer ${tokenForCmd}"`;

  const reveal = data.freshToken
    ? `<div class="box reveal"><div class="label" style="margin-bottom:8px;color:var(--green)">new token — copy it now, shown once</div><pre id="freshTok">${escapeHtml(data.freshToken)}</pre></div>`
    : "";

  const body = `
  <div class="label">mcp access token</div>
  <h1>Connect your agent.</h1>
  <p class="muted">Paste the command below into your terminal to connect. There's no sign-in step inside your agent — the token in the command handles it.</p>
  <p class="muted">Run it in your terminal, then <strong>start (or restart) your agent</strong> — MCP tools are loaded when the agent launches, so a fresh start picks them up automatically. This is a one-time setup.</p>
  <p class="muted">Setting this up comfortably is part of the initial screening.</p>
  <div class="row"><span class="k">status</span><span><span class="dot">&#9679;</span> connected</span></div>
  <div class="row"><span class="k">expires</span><span>${
    data.tokenExpiresAt
      ? escapeHtml(data.tokenExpiresAt.toISOString().slice(0, 16).replace("T", " ") + " UTC")
      : "no expiry"
  }</span></div>
  <div class="row"><span class="k">token</span><span>${tokenDisplay}</span></div>
  ${reveal}
  <div class="box"><div class="pos"><div>
    <p style="margin:0" class="muted">Confirm this matches your agent config. Reissue if you need the full value again.</p>
  </div><form method="post" action="/mcp/reissue"><button class="btn" type="submit">Reissue token</button></form></div></div>

  <div class="codehead">claude code <button onclick="hmCopy('claudeCmd')">copy</button></div>
  <pre id="claudeCmd">${escapeHtml(claudeCmd)}</pre>
  <div class="codehead">codex <button onclick="hmCopy('codexCmd')">copy</button></div>
  <pre id="codexCmd">${escapeHtml(codexCmd)}</pre>

  <h2>Once connected</h2>
  <ol class="muted" style="line-height:2">
    <li>Run the command above, then <strong>start your agent</strong> (a fresh start loads the tools).</li>
    <li>In your agent, say: <strong>"review my fit for ${
      data.targetTitle ? escapeHtml(`the ${data.targetTitle} role`) : "this role"
    } and apply"</strong>.</li>
    <li>It will fill your profile, read your resume, then <strong>compare you to the job description</strong> — showing strong matches, gaps, and a fit score.</li>
    <li>You decide whether to apply. Either way your details reach the hiring team.</li>
  </ol>`;
  return layout({ active: "mcp", body });
}

export function wikiPage(positions: Position[]): string {
  const cards = positions
    .map(
      (p) => `<div class="card"><div class="pos">
      <div>
        <h3>${escapeHtml(p.title)}${p.status === "closed" ? '<span class="badge closed">CLOSED</span>' : ""}</h3>
        <div class="muted pre">${escapeHtml(p.description)}</div>
      </div>
      <div class="meta">${escapeHtml(p.location ?? "Remote")} &middot; Full-time</div>
    </div></div>`,
    )
    .join("");
  const body = `
  <div class="label">candidate wiki</div>
  <h1>Hiring at ${BRAND}</h1>
  <p class="muted">Open roles, interview processes, and everything you need to know about joining us.</p>
  <h2>Positions</h2>
  ${cards || '<p class="muted">No positions posted yet.</p>'}`;
  return layout({ active: "wiki", body });
}

export interface CandidateApplication {
  title: string;
  status: string;
  decision: string;
  fit_score: number | null;
  fit_summary: string | null;
  fit_gaps: string[] | null;
  created_at: Date;
}

export function applyPage(
  r: Readiness,
  target: { title: string; description: string } | null,
  applications: CandidateApplication[] = [],
): string {
  const item = (ok: boolean, label: string) =>
    `<div class="check"><span class="${ok ? "ok" : "no"}">${ok ? "&#10003;" : "&#9711;"}</span> ${label}</div>`;
  const profileOk = r.profileMissingFields.length === 0;
  const ready = r.applicationReady;

  const targetBlock = target
    ? `<div class="label">applying to</div><h2 style="margin-top:0">${escapeHtml(target.title)}</h2>
       <details class="fallback" style="margin:0 0 30px"><summary>View job description</summary>
       <div class="resume" style="margin-top:12px">${renderMarkdown(target.description)}</div></details>`
    : `<p class="muted">No specific role selected — <a href="/wiki">browse positions</a> to pick one.</p>`;

  const msg = ready
    ? `You're ready. Connect your <a href="/mcp">agent</a>, then ask it to <strong>review your fit for this role and apply</strong> — it will compare your resume to the job description, show you the match and any gaps, and submit your decision.`
    : `Almost there — ask your <a href="/mcp">agent</a> to complete the items above. Missing: ${escapeHtml(r.missing.join(", "))}.`;

  const appCard = (a: CandidateApplication) => {
    const score = a.fit_score != null ? `<span class="badge">fit ${a.fit_score}/100</span>` : "";
    const gaps =
      a.fit_gaps && a.fit_gaps.length
        ? `<div class="fl" style="margin-top:14px">gaps to address</div><ul>${a.fit_gaps
            .map((g) => `<li>${escapeHtml(g)}</li>`)
            .join("")}</ul>`
        : "";
    return `<div class="card">
      <div class="pos"><h3 style="margin:0">${escapeHtml(a.title)}</h3>
        <span class="badge">${escapeHtml(a.status)}</span></div>
      <div style="margin-top:8px">${score}</div>
      ${a.fit_summary ? `<div class="fl" style="margin-top:14px">fit summary</div><div>${escapeHtml(a.fit_summary)}</div>` : ""}
      ${gaps}
    </div>`;
  };

  const appsBlock = applications.length
    ? `<h2>Your applications</h2>
       <p class="muted">The fit assessment your agent produced when you applied.</p>
       ${applications.map(appCard).join("")}`
    : "";

  const body = `
  <h1>Apply</h1>
  ${targetBlock}
  ${item(profileOk, "Profile")}
  ${item(r.hasResume, "Resume")}
  <p class="muted" style="margin-top:28px">${msg}</p>
  ${appsBlock}`;
  return layout({ active: "apply", body });
}

export function profilePage(data: {
  candidate: Candidate;
  readiness: Readiness;
  applicationsCount: number;
  agentConfigVersion: number | null;
  resumeMarkdown: string | null;
}): string {
  const c = data.candidate;
  const r = data.readiness;
  const versionBadge = `<span class="badge">Profile version ${c.profileVersion}</span>`;

  const field = (label: string, value: string | null | undefined, pre = false) =>
    value && String(value).trim()
      ? `<div class="field"><div class="fl">${label}</div><div class="${pre ? "pre" : ""}">${escapeHtml(value)}</div></div>`
      : "";

  const links = [
    c.linkedinUrl ? `<a href="${escapeHtml(c.linkedinUrl)}">LinkedIn</a>` : "",
    c.githubUrl ? `<a href="${escapeHtml(c.githubUrl)}">GitHub</a>` : "",
  ]
    .filter(Boolean)
    .join(" &middot; ");

  const body = `
  <div class="pos"><h1 style="margin-bottom:6px">${escapeHtml(c.name ?? "Your profile")}</h1>${versionBadge}</div>
  <div class="muted">${escapeHtml(c.currentTitle ?? "")}${c.currentCompany ? ` at ${escapeHtml(c.currentCompany)}` : ""}</div>
  <div class="muted">${escapeHtml(c.email ?? "")}</div>
  <div style="margin-top:10px"><span class="dot">&#9679;</span> ${
    data.applicationsCount > 0 ? "Your applications are being tracked" : "No applications yet"
  }</div>
  <hr class="hr">
  <div class="label">about your profile</div>
  <p class="muted">${
    r.applicationReady
      ? "Your profile is complete. Update anything anytime — just ask your <a href='/mcp'>agent</a>."
      : `Still needed: ${escapeHtml(r.missing.join(", "))}. Ask your <a href='/mcp'>agent</a> to finish up.`
  }</p>
  ${field("bio", c.summary)}
  ${field("skills", c.skills)}
  ${field("location", c.location)}
  ${c.yearsOfExperience != null ? field("experience", `${c.yearsOfExperience} years`) : ""}
  ${field("notice period", c.noticePeriod)}
  ${field("preferred working style", c.preferredWorkingStyle)}
  ${links ? `<div class="field"><div class="fl">links</div><div>${links}</div></div>` : ""}
  ${field("transformative books", c.transformativeBooks, true)}
  ${
    data.resumeMarkdown
      ? `<hr class="hr"><div class="label">résumé</div><div class="resume">${renderMarkdown(data.resumeMarkdown)}</div>`
      : ""
  }`;
  return layout({ active: "profile", body });
}
