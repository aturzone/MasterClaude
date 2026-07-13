import type { AgentRubricItem, CtrfTest } from '@mc-qa/core';

/**
 * Agent criterion severity model. A rubric criterion carries a severity level; an UNMET
 * criterion maps to a CTRF status by that level:
 *   must-pass unmet     → failed (fails the task)
 *   should-pass unmet   → other  (a WARNING — a soft fail, NOT a task failure)
 *   informational unmet → other  (informational — not a task failure)
 * Agents are unreliable narrators, so both the driver (live board) and ingest (committed
 * status) resolve severity from the task's authored rubric rather than trusting the agent's
 * own status. This module is the single place that resolution lives.
 */
export type RubricLevel = AgentRubricItem['verdict'];

const LEVELS: ReadonlySet<string> = new Set(['must-pass', 'should-pass', 'informational']);

/** Lowercase, drop punctuation (unicode-aware so non-ASCII text survives), collapse whitespace. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The criterion portion of a CTRF test name is what follows the " — " the brief inserts. */
export function criterionText(test: CtrfTest): string {
  const name = test.name ?? '';
  const i = name.indexOf(' — ');
  return i >= 0 ? name.slice(i + 3) : name;
}

/**
 * Resolve a CTRF test's rubric severity level:
 *   1. prefer an explicit `extra.rubric` the agent stamped;
 *   2. otherwise match the criterion text (after " — ", or the message) against the task's
 *      authored successRubric — exact normalized match first, then substantial containment.
 * Returns null when nothing matches (leave the agent's own verdict untouched).
 */
export function resolveRubricLevel(test: CtrfTest, rubric: AgentRubricItem[]): RubricLevel | null {
  const explicit = test.extra?.rubric;
  if (typeof explicit === 'string' && LEVELS.has(explicit)) return explicit as RubricLevel;

  const candidates = [criterionText(test), test.message ?? ''].map(norm).filter(Boolean);
  if (candidates.length === 0) return null;

  for (const item of rubric) {
    if (candidates.includes(norm(item.criterion))) return item.verdict;
  }
  for (const item of rubric) {
    const c = norm(item.criterion);
    if (c.length < 12) continue; // too short to match safely by containment
    if (candidates.some((cand) => cand.length >= 12 && (cand.includes(c) || c.includes(cand)))) {
      return item.verdict;
    }
  }
  return null;
}

/**
 * A test is a SOFT fail when it is `failed` but its rubric level is should-pass or informational —
 * a warning that must not flip the whole task to failed.
 */
export function isSoftFail(test: CtrfTest, rubric: AgentRubricItem[]): boolean {
  if (test.status !== 'failed') return false;
  const level = resolveRubricLevel(test, rubric);
  return level === 'should-pass' || level === 'informational';
}
