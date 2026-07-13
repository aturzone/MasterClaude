import fs from 'node:fs';
import path from 'node:path';
import { pickLang } from '@mc-qa/core';
import type { CtrfReport, CtrfTest, Task } from '@mc-qa/core';
import { makeReport } from './ctrf-merge.ts';

/**
 * LHCI `assert` writes .lighthouseci/assertion-results.json — fold it into one
 * CTRF test per task (budget gate pass/fail with the failing audits listed).
 */
export function lhciToCtrf(task: Task, lighthouseciDir: string): CtrfReport {
  const file = path.join(lighthouseciDir, 'assertion-results.json');
  let tests: CtrfTest[];
  if (!fs.existsSync(file)) {
    // LHCI produced no budget results (on Windows it commonly crashes on temp cleanup). This is a
    // host limitation, not a verdict awaiting a human — emit `skipped` so it resolves to `blocked`
    // (run this lane in Docker/CI), NOT `other` which parks the task as pending-review forever.
    tests = [{
      name: `${task.id} — ${pickLang(task.title, 'en')}`,
      status: 'skipped',
      duration: 0,
      message: `Lighthouse budgets not evaluated — no assertion-results.json (Docker/CI-only lane; the Windows host commonly crashes LHCI on temp cleanup)`,
      extra: { taskId: task.id, lane: 'cli', verdictBy: 'cli' },
    }];
  } else {
    const results = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{
      url: string; auditId?: string; name?: string; passed: boolean; level?: string;
      expected?: number; actual?: number;
    }>;
    const failures = results.filter((r) => !r.passed && r.level !== 'warn');
    tests = [{
      name: `${task.id} — ${pickLang(task.title, 'en')}`,
      status: failures.length === 0 ? 'passed' : 'failed',
      duration: 0,
      message: failures.length
        ? failures
            .map((f) => `${f.auditId ?? f.name} @ ${f.url}: expected ${f.expected}, got ${f.actual}`)
            .join('\n')
        : `all ${results.length} budget assertions passed`,
      extra: { taskId: task.id, lane: 'cli', verdictBy: 'cli', assertions: results.length },
    }];
  }
  return makeReport('lhci', tests);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * linkinator --format json → one CTRF test per task. Only INTERNAL broken links (same
 * registrable host as the crawl root) fail the task; external links that are unreachable
 * from the test network (blocked social sites, rate-limits) are reported but don't fail —
 * you don't break your build because YouTube throttled the crawler.
 */
export function linkinatorToCtrf(task: Task, jsonOutput: string, baseUrl?: string): CtrfReport {
  let status: CtrfTest['status'] = 'other';
  let message = 'could not parse linkinator output';
  let scanned = 0;
  const baseHost = baseUrl ? hostOf(baseUrl) : (task.automation.cliUrls?.[0] ? hostOf(task.automation.cliUrls[0]) : '');
  try {
    const data = JSON.parse(jsonOutput) as { links?: Array<{ url: string; state: string; status?: number; parent?: string }> };
    const links = data.links ?? [];
    scanned = links.length;
    const broken = links.filter((l) => l.state === 'BROKEN');
    const internal = broken.filter((b) => !baseHost || hostOf(b.url) === baseHost || hostOf(b.url).endsWith('.' + baseHost));
    const external = broken.filter((b) => !internal.includes(b));
    // Split internal breakage: a 5xx (after retries) is an availability signal under load,
    // NOT a dead link — it still FAILS the task (real user impact), but the message tells
    // triage which it is. If a 5xx persists across runs, quarantine + file a finding
    // (never allowlist a first-party error). 4xx/other are true dead links.
    const internal5xx = internal.filter((b) => (b.status ?? 0) >= 500);
    const internalDead = internal.filter((b) => (b.status ?? 0) < 500);
    status = internal.length === 0 ? 'passed' : 'failed';
    const fmt = (b: { url: string; status?: number; parent?: string }) => `${b.status ?? '?'} ${b.url} (on ${b.parent ?? '?'})`;
    const parts: string[] = [];
    if (internal.length === 0) parts.push(`${scanned} links checked, no internal broken links`);
    if (internalDead.length) parts.push(`internal dead links (4xx/other):\n${internalDead.map(fmt).join('\n')}`);
    if (internal5xx.length) {
      parts.push(
        `internal 5xx after retries (availability under load — if persistent, quarantine + file a finding, never allowlist):\n${internal5xx.map(fmt).join('\n')}`,
      );
    }
    if (external.length) {
      parts.push(`(${external.length} external link(s) unreachable from the test network — not failing: ${external.slice(0, 5).map((b) => b.url).join(', ')})`);
    }
    message = parts.join('\n');
  } catch (e) {
    message = String((e as Error).message);
  }
  return makeReport('linkinator', [{
    name: `${task.id} — ${pickLang(task.title, 'en')}`,
    status,
    duration: 0,
    message,
    extra: { taskId: task.id, lane: 'cli', verdictBy: 'cli', linksChecked: scanned },
  }]);
}

/**
 * k6 `--summary-export` JSON → one CTRF test. The task fails if k6 exited non-zero (any
 * threshold breached) or any metric threshold is marked ok:false. The message carries the
 * headline numbers (p95 latency, error rate, throughput) so triage is one glance.
 */
export function k6ToCtrf(task: Task, summaryPath: string, exitCode: number): CtrfReport {
  let status: CtrfTest['status'] = 'other';
  let message = 'k6 produced no summary (is k6 installed and the script present?)';
  const extra: Record<string, unknown> = { taskId: task.id, lane: 'cli', verdictBy: 'cli', tool: 'k6' };
  const name = `${task.id} — ${pickLang(task.title, 'en')}`;
  try {
    if (!fs.existsSync(summaryPath)) {
      return makeReport('k6', [{ name, status: 'skipped', duration: 0, message, extra }]);
    }
    const s = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
      metrics?: Record<string, { values?: Record<string, number>; thresholds?: Record<string, { ok?: boolean }> }>;
    };
    const m = s.metrics ?? {};
    const dur = m['http_req_duration']?.values ?? {};
    const p95 = dur['p(95)'] ?? dur['p95'];
    const errRate = m['http_req_failed']?.values?.['rate'];
    const rps = m['http_reqs']?.values?.['rate'];
    const thFails: string[] = [];
    for (const [metric, v] of Object.entries(m)) {
      for (const [th, r] of Object.entries(v.thresholds ?? {})) if (r && r.ok === false) thFails.push(`${metric}: ${th}`);
    }
    status = exitCode === 0 && thFails.length === 0 ? 'passed' : 'failed';
    message = [
      p95 !== undefined ? `p95 ${Math.round(p95)}ms` : '',
      errRate !== undefined ? `errors ${(errRate * 100).toFixed(2)}%` : '',
      rps !== undefined ? `${rps.toFixed(1)} req/s` : '',
      thFails.length ? `FAILED thresholds — ${thFails.join(', ')}` : 'all thresholds passed',
    ].filter(Boolean).join(' · ');
    extra.p95Ms = p95;
    extra.errorRate = errRate;
    extra.rps = rps;
  } catch (e) {
    message = String((e as Error).message);
  }
  return makeReport('k6', [{ name, status, duration: 0, message, extra }]);
}

/**
 * testssl.sh --jsonfile output → one CTRF test. Fails on any HIGH/CRITICAL severity finding;
 * lower-severity findings are reported in the message. Passive, observational.
 */
export function testsslToCtrf(jsonOutput: string): CtrfReport {
  let status: CtrfTest['status'] = 'other';
  let message = 'could not parse testssl output';
  try {
    const findings = JSON.parse(jsonOutput) as Array<{ id: string; severity: string; finding: string }>;
    const bad = findings.filter((f) => ['HIGH', 'CRITICAL'].includes((f.severity ?? '').toUpperCase()));
    status = bad.length === 0 ? 'passed' : 'failed';
    message = bad.length === 0
      ? `TLS scan clean (${findings.length} checks, no HIGH/CRITICAL)`
      : bad.map((f) => `${f.severity} ${f.id}: ${f.finding}`).join('\n');
  } catch (e) {
    message = String((e as Error).message);
  }
  return makeReport('testssl', [{
    name: 'sec.tls.testssl — TLS/cipher/protocol audit',
    status, duration: 0, message,
    extra: { lane: 'cli', verdictBy: 'cli', tool: 'testssl.sh' },
  }]);
}

/**
 * MDN HTTP Observatory JSON → one CTRF test. Fails below a passing grade (default C).
 */
export function observatoryToCtrf(jsonOutput: string, minScore = 50): CtrfReport {
  let status: CtrfTest['status'] = 'other';
  let message = 'could not parse observatory output';
  try {
    const data = JSON.parse(jsonOutput) as { scan?: { score?: number; grade?: string }; grade?: string; score?: number };
    const score = data.scan?.score ?? data.score ?? 0;
    const grade = data.scan?.grade ?? data.grade ?? '?';
    status = score >= minScore ? 'passed' : 'failed';
    message = `HTTP security-headers grade ${grade} (score ${score}, threshold ${minScore})`;
  } catch (e) {
    message = String((e as Error).message);
  }
  return makeReport('observatory', [{
    name: 'sec.headers.observatory — HTTP security headers',
    status, duration: 0, message,
    extra: { lane: 'cli', verdictBy: 'cli', tool: 'mdn-http-observatory' },
  }]);
}

/** Redact payment-card / IBAN digits that a sensitive screen may surface into typed answers. This
 * scrubs TEXT only — a full-session video of a class-c/d task can still show the number on screen,
 * which is why those videos are kept disk-only (never bundled into the shippable report archive). */
const CARD_IBAN_PATTERNS = [
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, // IBAN (ISO 13616: 2-letter country + 2 check digits + BBAN)
  /\b\d{16}\b/g, // 16-digit PAN
  /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g, // spaced/dashed PAN
];
export function redactCardIban(s: string): string {
  let out = s;
  for (const re of CARD_IBAN_PATTERNS) out = out.replace(re, '‹redacted-card/iban›');
  return out;
}

export interface AttendedMeta {
  mode: string;
  video?: string | null;
  videoSizeBytes?: number;
  marks?: Array<{ qid: string; at: string; videoOffsetMs: number; screenshot: string }>;
  exitReason?: string;
  crashes?: number;
  startUrl?: string;
  endUrl?: string;
}

export interface InterviewAnswerSet {
  taskId: string;
  answers: Array<{ id: string; value: unknown; notes?: string; evidence?: string[]; answeredAt?: string }>;
  answeredBy?: string;
  /** Structured identity of who tested this (from the orchestrator's user store; phone is masked). */
  tester?: {
    userId?: number;
    displayName: string;
    phoneMasked: string;
    role: 'tester' | 'developer' | 'manager' | 'owner';
    channel: 'chat' | 'terminal' | 'form';
  };
  startedAt?: string;
  completedAt?: string;
  /** Present when the task was done live in a recorded host browser (from attend-meta.json). */
  attended?: AttendedMeta;
  /** Mandatory reviewer sign-off — attended results are born `pending` until approved/rejected. */
  review?: {
    required?: boolean;
    state?: 'pending' | 'approved' | 'rejected';
    by?: string;
    userId?: number;
    at?: string;
    note?: string;
  };
  /** Dual-control approval for irreversible actions (phase 2 — not written in v1). */
  approval?: { approvedBy?: string; userId?: number; messageId?: number; text?: string; at?: string };
}

/** Compute a verdict from interview passWhen rules and emit one CTRF test. */
export function interviewToCtrf(task: Task, answerSet: InterviewAnswerSet): CtrfReport {
  const questions = task.humanInterview?.questions ?? [];
  const failures: string[] = [];
  let pendingReview = false;

  for (const q of questions) {
    const a = answerSet.answers.find((x) => x.id === q.id);
    if (!a) {
      failures.push(`${q.id}: unanswered`);
      continue;
    }
    const p = q.passWhen;
    let pass: boolean | null = null;
    if (p.manual) { pendingReview = true; pass = null; }
    else if ('equals' in p) pass = a.value === p.equals;
    else if (p.gte !== undefined) pass = Number(a.value) >= p.gte;
    else if (p.lte !== undefined) pass = Number(a.value) <= p.lte;
    // multi-choice: value is an array — every selected option must be allowed
    else if (p.in) pass = Array.isArray(a.value) ? a.value.every((v) => p.in!.includes(v)) : p.in.includes(a.value);
    else if (p.matches) pass = new RegExp(p.matches).test(String(a.value));
    else {
      // Unknown/typo'd operator must never be a silent pass on a safety-relevant check.
      failures.push(`${q.id}: passWhen has no recognized operator (${JSON.stringify(p)}) — cannot compute a verdict`);
      continue;
    }
    if (pass === false) failures.push(`${q.id} (${q.failSeverity ?? 'major'}): answered ${JSON.stringify(a.value)} — ${pickLang(q.prompt, 'en')}`);
  }

  // Sign-off gate: an attended result (review.required) is not green until a reviewer approves
  // it; an explicit rejection fails it with the reviewer's note; otherwise it stays `pending`
  // (→ pending-review 🕵️ on the board). Self-review is blocked by the orchestrator, not here.
  const review = answerSet.review;
  const rejected = review?.state === 'rejected';
  const approved = review?.state === 'approved';
  const needsReview = review?.required === true && !approved && !rejected;

  let status: CtrfTest['status'];
  if (rejected || failures.length > 0) status = 'failed';
  else if (needsReview || pendingReview) status = 'pending';
  else status = 'passed';

  const scrub = (s: string) => redactCardIban(s);
  const messageParts: string[] = [];
  if (rejected) messageParts.push(`rejected by ${review?.by ?? 'reviewer'}${review?.note ? `: ${scrub(review.note)}` : ''}`);
  if (failures.length) messageParts.push(failures.map(scrub).join('\n'));
  if (needsReview) messageParts.push('awaiting reviewer sign-off');
  else if (pendingReview && !approved) messageParts.push('manual review required');
  const message = messageParts.join('\n') || 'all interview checks passed';

  return makeReport('human-interview', [{
    name: `${task.id} — ${pickLang(task.title, 'en')}`,
    status,
    duration: (task.humanInterview?.estimatedMinutes ?? 0) * 60_000,
    message,
    extra: {
      taskId: task.id,
      lane: 'human',
      verdictBy: approved ? (review?.by ?? 'human') : 'human',
      answeredBy: answerSet.answeredBy,
      tester: answerSet.tester,
      evidence: answerSet.answers.flatMap((a) => a.evidence ?? []),
      attended: answerSet.attended,
      review: answerSet.review,
      reviewedBy: approved ? review?.by : undefined,
    },
  }]);
}
