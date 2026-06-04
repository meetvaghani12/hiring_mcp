export const RESUME_MAX = 25_000;
export const AGENT_CONFIG_MIN = 1_000;
export const AGENT_CONFIG_MAX = 100_000;
export const BOOKS_MIN_CHARS = 200;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateResume(content: string): ValidationResult {
  const errors: string[] = [];
  if (!content.trim()) errors.push("Resume content is empty.");
  if (content.length > RESUME_MAX)
    errors.push(`Resume exceeds ${RESUME_MAX} characters (got ${content.length}).`);
  return { ok: errors.length === 0, errors, warnings: [] };
}

export function validateTransformativeBooks(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = text.trim();
  if (trimmed.length < BOOKS_MIN_CHARS)
    errors.push(`transformative_books must be at least ${BOOKS_MIN_CHARS} characters (got ${trimmed.length}).`);

  // Soft heuristic: count distinct entries (blank-line separated title blocks).
  const blocks = trimmed.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
  if (blocks.length < 3)
    warnings.push("Fewer than 3 distinct books detected — we ask for at least three.");
  if (!/criticism|disagree|weak|dated|outgrown/i.test(trimmed))
    warnings.push("No criticism detected — a genuine criticism per book is a strong signal (invited, not required).");

  return { ok: errors.length === 0, errors, warnings };
}

// Strong "this was written for the application" tells -> reject.
const FABRICATION_HARD = [
  /^\s*#{0,3}\s*you are an? (ai )?(assistant|agent)/im,
  /\bapplyto[_-]?realfast\b/i,
  /\bhiring[_-]?mcp\b/i,
  /^#{1,4}\s*(application workflow|complete the application|application-related actions)/im,
  /\bthis application\b/i,
];
// Weaker tells -> warn but accept.
const FABRICATION_SOFT = [/\byour role is to\b/i, /\bas an ai\b/i];

export function validateAgentConfig(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (content.length < AGENT_CONFIG_MIN)
    errors.push(`Agent config must be at least ${AGENT_CONFIG_MIN} characters (got ${content.length}).`);
  if (content.length > AGENT_CONFIG_MAX)
    errors.push(`Agent config exceeds ${AGENT_CONFIG_MAX} characters (got ${content.length}).`);

  for (const re of FABRICATION_HARD) {
    if (re.test(content)) {
      errors.push(
        "This reads like a file written for this application (a system prompt / application workflow), " +
          "not your real, reused agent rules file. Please upload the CLAUDE.md/AGENTS.md you already use across your repos.",
      );
      break;
    }
  }
  for (const re of FABRICATION_SOFT) {
    if (re.test(content)) {
      warnings.push("Phrasing looks assistant-directed; confirm this is your real reused rules file.");
      break;
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
