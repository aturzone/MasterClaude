import fs from 'node:fs';
import path from 'node:path';
import type { Lane, RunTaskStatus } from './types.ts';

/**
 * Append-only run-progress event stream: results/<runId>/progress.ndjson.
 * The runner emits these; an orchestrator (and any watcher) tails the file to drive a
 * live CI-style status board without any IPC. Ground truth on completion is still
 * merged.ctrf.json + status/<profile>.json — a tail can never invent a green.
 */
export type ProgressPayload =
  | { event: 'run-start'; service: string; env: string; planned: string[]; refused: Array<{ taskId: string; reason: string }> }
  | { event: 'lane-start'; lane: Lane }
  | { event: 'lane-finish'; lane: Lane }
  | { event: 'task-start'; taskId: string; lane: Lane }
  | { event: 'task-finish'; taskId: string; status: RunTaskStatus; durationMs?: number; message?: string; verdictBy?: string; interim?: boolean }
  | { event: 'human-queued'; taskId: string }
  | { event: 'attended-start'; taskId: string }
  | { event: 'attended-finish'; taskId: string; exitReason: string; videoPath?: string }
  | { event: 'agent-briefed'; taskId: string; briefPath: string }
  | { event: 'agent-start'; taskId: string }
  | {
      event: 'agent-finish';
      taskId: string;
      outcome:
        | 'result'
        | 'no-result'
        | 'timeout'
        | 'guard-violation'
        | 'driver-error'
        | 'blocked-no-session'
        // The Session Keeper (shared logged-in browser) is down and no fresh snapshot is available —
        // distinct from blocked-no-session so the orchestrator tells the owner to re-login rather than "no session".
        | 'blocked-keeper-down'
        | 'skipped-exists'
        | 'skipped-budget';
      costUsd?: number;
      turns?: number;
    }
  | {
      event: 'verdict';
      release: 'pass' | 'fail' | 'incomplete';
      failedGateSections: Array<{ section: string; tasks: string[] }>;
      /** Outstanding-work counts (additive; absent on events from older runners — tolerate it). */
      outstanding?: { needsHuman: number; pendingReview: number; blocked: number };
    }
  | { event: 'run-finish'; summary: { passed: number; failed: number; skipped: number; pending: number } };

export type ProgressEvent = { v: 1; ts: string; runId: string } & ProgressPayload;

export class ProgressWriter {
  private file: string;
  constructor(private runId: string, runDir: string) {
    this.file = path.join(runDir, 'progress.ndjson');
    fs.mkdirSync(runDir, { recursive: true });
  }

  emit(e: ProgressPayload): void {
    const full = { v: 1 as const, ts: new Date().toISOString(), runId: this.runId, ...e } as ProgressEvent;
    try {
      fs.appendFileSync(this.file, JSON.stringify(full) + '\n');
    } catch {
      /* progress is best-effort; never fail a run because of it */
    }
  }
}

/** Read a progress stream (for an orchestrator / tests). */
export function readProgress(runDir: string): ProgressEvent[] {
  const file = path.join(runDir, 'progress.ndjson');
  if (!fs.existsSync(file)) return [];
  // Tolerate a torn read of a half-written last line — the runner appends concurrently while a
  // watcher polls; an unguarded JSON.parse throw here killed the live board AND skipped the report.
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try { return [JSON.parse(l) as ProgressEvent]; } catch { return []; }
    });
}
