import type { Application } from "../db/schema.js";

export type ApplicationStatus = Application["status"];

/**
 * Recruiter-side pipeline. Candidates enter at `submitted` (or `declined`,
 * which is terminal — they chose not to apply). Everything else is a
 * recruiter decision.
 */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ["under_review", "rejected"],
  under_review: ["interviewing", "rejected"],
  interviewing: ["hired", "rejected"],
  declined: [],
  rejected: [],
  hired: [],
};

export function nextStatuses(from: ApplicationStatus): ApplicationStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return nextStatuses(from).includes(to);
}

export const ALL_STATUSES = Object.keys(TRANSITIONS) as ApplicationStatus[];
