import type { Checklist, StatusFile } from '@mc-qa/core';

export interface ReleaseVerdict {
  /**
   * `fail` — a gate section has a failed task (release-blocking, always wins).
   * `incomplete` — no gate failure, but planned tasks still owe a human sitting / review / are
   *   blocked. The run is not DONE yet — its final report must be withheld.
   * `pass` — no gate failure and nothing outstanding.
   */
  release: 'pass' | 'fail' | 'incomplete';
  /** Gate sections that contain at least one failed task. */
  failedGateSections: Array<{ section: string; tasks: string[] }>;
  /** Failures outside any gate section — reported, but not release-blocking. */
  nonGatingFailures: string[];
  /**
   * Planned tasks that make the run "not done yet". `needsHuman` = a queued/briefed interview,
   * `pendingReview` = an attended result awaiting sign-off, `blocked` = could not run.
   * `quarantined` and `skipped-risk-gate` are deliberate exclusions — never outstanding.
   */
  outstanding: { needsHuman: string[]; pendingReview: string[]; blocked: string[] };
}

/**
 * Executable "what DONE means". A release `fail`s (always wins) if any gate section has a failed
 * task — `stopOnFail` sections are gate sections, so their failures block too. Otherwise the run
 * is `incomplete` while any PLANNED task still awaits a human interview / review or is blocked
 * (interviews are part of the test — a run is not "green" until they land); only when nothing is
 * outstanding does it `pass`. Failures outside a gate section are surfaced but do not block.
 *
 * `opts.plannedTaskIds` scopes the completeness check to this run's tasks (e.g. a single-task run
 * isn't marked incomplete by unrelated needs-human tasks left in the status file). Absent, it
 * falls back to the whole checklist task set intersected with the status file.
 */
export function computeReleaseVerdict(
  checklist: Checklist,
  status: StatusFile,
  opts?: { plannedTaskIds?: string[] },
): ReleaseVerdict {
  const failedGateSections: ReleaseVerdict['failedGateSections'] = [];
  const gated = new Set<string>();
  for (const s of checklist.sections) {
    if (!s.gate) continue;
    const failed = s.tasks.filter((id) => status.tasks[id]?.status === 'failed');
    failed.forEach((id) => gated.add(id));
    if (failed.length > 0) failedGateSections.push({ section: s.id, tasks: failed });
  }
  const nonGatingFailures = Object.entries(status.tasks)
    .filter(([id, r]) => r.status === 'failed' && !gated.has(id))
    .map(([id]) => id);

  // Completeness is measured over the run's planned tasks (fall back to the checklist task set).
  // A planned task with no status record yet is not counted — it can't be classified.
  const scope = opts?.plannedTaskIds ?? checklist.sections.flatMap((s) => s.tasks);
  const needsHuman: string[] = [];
  const pendingReview: string[] = [];
  const blocked: string[] = [];
  const seen = new Set<string>();
  for (const id of scope) {
    if (seen.has(id)) continue;
    seen.add(id);
    // `queued`/`briefed` are live-board states that can appear in a status file mid-run; treat
    // them as needs-human too. `quarantined`/`skipped-risk-gate` are intentionally NOT outstanding.
    const st = status.tasks[id]?.status as string | undefined;
    if (st === 'skipped-needs-human' || st === 'queued' || st === 'briefed') needsHuman.push(id);
    else if (st === 'pending-review') pendingReview.push(id);
    else if (st === 'blocked') blocked.push(id);
  }
  const outstanding = { needsHuman, pendingReview, blocked };
  const anyOutstanding = needsHuman.length + pendingReview.length + blocked.length > 0;

  const release: ReleaseVerdict['release'] =
    failedGateSections.length > 0 ? 'fail' : anyOutstanding ? 'incomplete' : 'pass';

  return { release, failedGateSections, nonGatingFailures, outstanding };
}
