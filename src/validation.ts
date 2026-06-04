const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cheap UUID shape check. Postgres throws on non-UUID input to a uuid column,
 * which turns user typos (and careers-site link typos) into 500s — guard first.
 */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export const RESUME_MAX = 25_000;
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
