import { config } from "../config.js";

/**
 * Fire-and-forget webhook on new applications (Slack-compatible shape via
 * `text`, full fields alongside for custom consumers). Failures are logged,
 * never surfaced to the candidate — notification is best-effort.
 */
export function notifyNewApplication(payload: {
  application_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  position_title: string;
  status: string;
  fit_score: number | null;
}): void {
  if (!config.applicationWebhookUrl) return;
  const text =
    `New application: ${payload.candidate_name ?? "(unnamed)"} -> ${payload.position_title} ` +
    `[${payload.status}]` +
    (payload.fit_score != null ? ` (self-assessed fit ${payload.fit_score}/100)` : "");
  fetch(config.applicationWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...payload }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => console.error("application webhook failed:", err?.message ?? err));
}
