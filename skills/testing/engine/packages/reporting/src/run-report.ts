import fs from 'node:fs';
import path from 'node:path';
import type {
  Checklist,
  CtrfReport,
  CtrfTest,
  InterviewQuestion,
  Lang,
  RunPlan,
  StatusFile,
} from '@mc-qa/core';
import { loadChecklist, loadEnvProfile, pickLang, resolveRedactions, t } from '@mc-qa/core';
import { computeReleaseVerdict } from './verdict.ts';
import type { InterviewAnswerSet } from './adapters.ts';
import { chunkBySize, writeStoreZip } from './zip-store.ts';
import { organizeEvidence } from './evidence.ts';

export interface ReportResult {
  reportDir: string;
  reportMd: string;
  reportHtml: string;
  summaryJson: string;
  zipParts: string[];
  /** Count of shippable (non-sensitive) videos found on disk — lets a caller warn when --no-videos
   * withheld existing recordings. */
  videosFound: number;
}

/** InterviewAnswerSet as it will exist on disk once the human lane gains richer metadata. */
type TesterInfo = { displayName?: string; phoneMasked?: string; role?: string; channel?: string };
type HumanResult = InterviewAnswerSet & {
  tester?: TesterInfo;
  evidence?: string[];
  startedAt?: string;
  completedAt?: string;
};

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function firstHeading(file: string): string {
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const h = lines.find((l) => /^#{1,6}\s+/.test(l));
    if (h) return h.replace(/^#{1,6}\s+/, '').trim();
    const nonEmpty = lines.find((l) => l.trim().length > 0);
    return nonEmpty?.trim() ?? '(empty)';
  } catch {
    return '(unreadable)';
  }
}

/** K-of-N label; zero-pad both numbers only when the run needs 10+ parts. */
function partLabel(k: number, n: number): string {
  const pad = (x: number) => (n >= 10 ? String(x).padStart(2, '0') : String(x));
  return `${pad(k)}of${pad(n)}`;
}

/** Mirror the adapter's passWhen evaluation. null = manual review / no verdict. */
function evalPass(q: InterviewQuestion, value: unknown): boolean | null {
  const p = q.passWhen;
  if (p.manual) return null;
  if ('equals' in p) return value === p.equals;
  if (p.gte !== undefined) return Number(value) >= p.gte;
  if (p.lte !== undefined) return Number(value) <= p.lte;
  if (p.in) return p.in.includes(value);
  if (p.matches) return new RegExp(p.matches).test(String(value));
  return null;
}

/**
 * Build the human-facing run report (Markdown + self-contained HTML + machine summary + a
 * store-only zip of agent videos) under <runDir>/report/. Robust to a run that has no videos,
 * no human sittings and no findings. Every dynamic string is passed through redact() so secret
 * values (from the env profile) never leak into an artifact that gets shared.
 *
 * The report is LOCALIZED via the i18n catalog (English by default; extra locales can be added and
 * selected via opts.lang / `qa report --lang`). Trusted heading/label text comes from `t()`; every
 * interpolated value is still esc()/redact()-ed by the caller before it reaches the template, so
 * localization does not reopen the redaction hole.
 */
export function generateRunReport(
  plan: RunPlan,
  runDir: string,
  opts?: { budgetMb?: number; videos?: boolean; lang?: Lang },
): ReportResult {
  const lang: Lang = opts?.lang ?? 'en';
  const reportDir = path.join(runDir, 'report');
  fs.mkdirSync(reportDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  // Organize raw artifacts into a clean, separated evidence/ tree (videos vs documents) BEFORE we
  // build the report, so the two-state section can link each task's on-disk video as proof.
  const evidence = organizeEvidence(runDir);

  // --- redaction ---------------------------------------------------------
  let secrets: string[] = [];
  try {
    secrets = resolveRedactions(loadEnvProfile(plan.serviceDir, plan.envProfile));
  } catch {
    secrets = [];
  }
  const redactables = secrets.filter((s) => typeof s === 'string' && s.length >= 6);
  const redact = (s: string): string => {
    if (!s) return s;
    let out = s;
    for (const secret of redactables) out = out.split(secret).join('[redacted]');
    return out;
  };
  const esc = (s: string): string =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const mdCell = (s: string): string => redact(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

  // --- inputs ------------------------------------------------------------
  const merged = readJson<CtrfReport>(path.join(runDir, 'merged.ctrf.json'));
  const tests: CtrfTest[] = merged?.results?.tests ?? [];
  const sum = merged?.results?.summary;
  const counts = {
    passed: sum?.passed ?? 0,
    failed: sum?.failed ?? 0,
    skipped: sum?.skipped ?? 0,
    pending: sum?.pending ?? 0,
    other: sum?.other ?? 0,
    refused: plan.refused.length,
  };

  const statusFile =
    readJson<StatusFile>(path.join(plan.serviceDir, 'status', `${plan.envProfile}.json`)) ??
    ({ envProfile: plan.envProfile, updatedAt: '', tasks: {} } as StatusFile);
  // AUTHORITATIVE tally: per-TASK verdicts resolved in THIS run (the single source of truth). The
  // `counts` above are per-CHECK CTRF counts (many checks per task) — a different, non-reconciling
  // number; both are surfaced but the anchor/verdict quote taskCounts to avoid the earlier confusion.
  const taskCounts: Record<string, number> = {};
  for (const e of plan.entries) {
    const rec = statusFile.tasks[e.taskId];
    if (rec && rec.runId === plan.runId) taskCounts[rec.status] = (taskCounts[rec.status] ?? 0) + 1;
  }
  const checklist: Checklist | null = loadChecklist(plan.serviceDir);
  const verdict = checklist
    ? computeReleaseVerdict(checklist, statusFile, { plannedTaskIds: plan.entries.map((e) => e.taskId) })
    : null;
  // Outstanding work for THIS run, one row per task with what it awaits. Built from the verdict's
  // buckets (which are scoped to the plan's tasks) so the not-yet-done human sittings render as
  // pending rows — not silently absent as they are when we only list human/<id>/result.json files.
  const outstandingRows: Array<{ taskId: string; awaits: string }> = verdict
    ? [
        ...verdict.outstanding.needsHuman.map((id) => ({ taskId: id, awaits: 'interview' })),
        ...verdict.outstanding.pendingReview.map((id) => ({ taskId: id, awaits: 'review' })),
        ...verdict.outstanding.blocked.map((id) => ({ taskId: id, awaits: 'blocked' })),
      ]
    : [];
  const outstandingTotal = outstandingRows.length;
  const awaitsLabel: Record<string, string> = {
    interview: t('rr.awaits.interview', lang),
    review: t('rr.awaits.review', lang),
    blocked: t('rr.awaits.blocked', lang),
  };

  const humanRoot = path.join(runDir, 'human');
  const humans: HumanResult[] = [];
  if (fs.existsSync(humanRoot)) {
    for (const d of fs.readdirSync(humanRoot)) {
      const r = readJson<HumanResult>(path.join(humanRoot, d, 'result.json'));
      if (r) humans.push({ ...r, taskId: r.taskId ?? d });
    }
  }

  // videos: {agent,human}/<taskId>/video/*.webm. class-c/d videos are "sensitive" — a state-mutating
  // or irreversible screen can display the tester's real personal/account data, so a full-session
  // recording may contain it; those stay DISK-ONLY (never shipped — the report links their path instead).
  const videos: Array<{ taskId: string; file: string; name: string; size: number; lane: 'agent' | 'human'; sensitive: boolean }> = [];
  for (const lane of ['agent', 'human'] as const) {
    const laneRoot = path.join(runDir, lane);
    if (!fs.existsSync(laneRoot)) continue;
    for (const taskId of fs.readdirSync(laneRoot)) {
      const vdir = path.join(laneRoot, taskId, 'video');
      if (!fs.existsSync(vdir)) continue;
      // Disk-only (never zipped/shipped): any class-c/d video, whose recording can capture real
      // personal/account data. The video still lives on disk in evidence/videos/ as proof — it is
      // just not bundled into the shippable report archive.
      const sensitive =
        plan.tasks[taskId]?.risk.class === 'c' || plan.tasks[taskId]?.risk.class === 'd';
      for (const f of fs.readdirSync(vdir)) {
        if (!f.endsWith('.webm')) continue;
        const file = path.join(vdir, f);
        let size = 0;
        try {
          size = fs.statSync(file).size;
        } catch {
          /* keep 0 */
        }
        videos.push({ taskId, file, name: f, size, lane, sensitive });
      }
    }
  }

  // findings: those quoting this runId, else the single newest (labelled not-tied).
  const findingsDir = path.join(plan.serviceDir, 'findings');
  const findings: Array<{ name: string; heading: string; tied: boolean }> = [];
  if (fs.existsSync(findingsDir)) {
    const all = fs
      .readdirSync(findingsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(findingsDir, f));
    const tied = all.filter((f) => {
      try {
        return fs.readFileSync(f, 'utf8').includes(plan.runId);
      } catch {
        return false;
      }
    });
    if (tied.length) {
      for (const f of tied) findings.push({ name: path.basename(f), heading: firstHeading(f), tied: true });
    } else if (all.length) {
      const newest = all
        .map((f) => ({ f, m: (() => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } })() }))
        .sort((a, b) => b.m - a.m)[0].f;
      findings.push({ name: path.basename(newest), heading: firstHeading(newest), tied: false });
    }
  }

  // --- zip agent videos --------------------------------------------------
  const budgetBytes = (opts?.budgetMb ?? 48) * 1024 * 1024;
  const zipParts: string[] = [];
  const videosIndex: Record<string, string> = {};
  const oversize: Array<{ taskId: string; file: string; size: number }> = [];
  // Sensitive (class-c/d) videos are never zipped/shipped — disk-only, linked by path.
  const diskOnly = videos.filter((v) => v.sensitive);
  for (const v of diskOnly) videosIndex[v.taskId] = 'disk-only';
  const zippable = videos.filter((v) => !v.sensitive);
  const zipping = opts?.videos !== false && zippable.length > 0;
  if (zipping) {
    const sizeBySource = new Map(zippable.map((v) => [v.file, v.size]));
    const entries = zippable.map((v) => ({
      nameInZip: `${v.taskId}/${path.basename(v.name, '.webm')}.webm`,
      sourcePath: v.file,
      size: v.size,
    }));
    const chunked = chunkBySize(entries, budgetBytes);
    const n = chunked.parts.length;
    chunked.parts.forEach((part, i) => {
      const label = partLabel(i + 1, n);
      const zipPath = path.join(reportDir, `${plan.runId}-videos-${label}.zip`);
      writeStoreZip(zipPath, part.map((e) => ({ nameInZip: e.nameInZip, sourcePath: e.sourcePath })));
      zipParts.push(zipPath);
      for (const e of part) videosIndex[e.nameInZip.split('/')[0]] = label;
    });
    for (const o of chunked.oversize) {
      const taskId = o.nameInZip.split('/')[0];
      videosIndex[taskId] = 'oversize';
      oversize.push({ taskId, file: o.sourcePath, size: sizeBySource.get(o.sourcePath) ?? 0 });
    }
  }
  const partOf = (taskId: string): string =>
    zipping ? videosIndex[taskId] ?? '—' : 'zipping disabled';

  // --- testers -----------------------------------------------------------
  const testerSet = new Set<string>();
  for (const h of humans) {
    const name = h.tester?.displayName ?? h.answeredBy;
    if (name) testerSet.add(redact(name));
  }
  const testers = [...testerSet];

  // --- markdown ----------------------------------------------------------
  const mdTable = (headers: string[], rows: string[][]): string => {
    const h = `| ${headers.join(' | ')} |`;
    const sep = `|${headers.map(() => '---').join('|')}|`;
    const body = rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n');
    return [h, sep, body].filter(Boolean).join('\n');
  };
  const md: string[] = [];
  const agentSummary = readJson<{
    spentUsd?: number;
    timeoutReservedUsd?: number;
    results?: Array<{ taskId: string; outcome: string; status?: string; costUsd?: number; turns?: number; denials?: number; noVideo?: boolean }>;
  }>(path.join(runDir, 'agent', 'summary.json'));
  const agentResults = agentSummary?.results ?? [];
  const agentSpent = agentSummary?.spentUsd ?? 0; // measured only (the reserve is not money spent)
  const agentReserved = agentSummary?.timeoutReservedUsd ?? 0;
  const agentTimeouts = agentResults.filter((r) => r.outcome === 'timeout').length;
  // Both no-session and keeper-down mean an auth task never got a session — count them together.
  const agentBlocked = agentResults.filter((r) => r.outcome === 'blocked-no-session' || r.outcome === 'blocked-keeper-down').length;
  const agentLine = agentResults.length
    ? t('rr.agentLaneLine', lang, { tasks: agentResults.length, timeouts: agentTimeouts, blocked: agentBlocked, spent: agentSpent.toFixed(2) })
    : '';

  const incomplete = verdict?.release === 'incomplete';
  const verdictWord = verdict ? t(`rr.verdict.${verdict.release}`, lang) : t('rr.verdict.na', lang);
  const verdictBadge = incomplete ? '⏳ ' : verdict?.release === 'fail' ? '❌ ' : verdict?.release === 'pass' ? '✅ ' : '';

  md.push(`# ${t('rr.title', lang, { service: mdCell(plan.service) })}`, '');
  // A report pulled while the run is still incomplete is PROVISIONAL — watermark it so an interim
  // pull (`qa report` on a run whose interviews/reviews are outstanding) isn't mistaken for final.
  if (incomplete) md.push(`> **${t('rr.provisional', lang, { n: outstandingTotal })}**`, '');
  md.push(`- **${t('rr.run', lang)}:** \`${mdCell(plan.runId)}\``);
  md.push(`- **${t('rr.envProfile', lang)}:** ${mdCell(plan.envProfile)}`);
  md.push(`- **${t('rr.baseURL', lang)}:** ${mdCell(plan.baseURL)}`);
  md.push(`- **${t('rr.generated', lang)}:** ${generatedAt}`);
  if (agentLine) md.push(`- **${t('rr.agentLane', lang)}:** ${agentLine}`);
  md.push(`- **${t('rr.releaseVerdict', lang)}:** **${verdictBadge}${verdictWord}**`);
  if (verdict && verdict.failedGateSections.length) {
    for (const g of verdict.failedGateSections) {
      md.push(`  - ${t('rr.failedGate', lang, { section: `\`${mdCell(g.section)}\``, tasks: g.tasks.map(mdCell).join(', ') })}`);
    }
  }
  md.push('');

  // --- TWO-STATE at-a-glance: needs-fixing vs OK (built from the authoritative per-TASK status of
  // THIS run), each row linking the task's video as proof it was actually exercised. -------------
  // Per-task verdict for THIS run derived from the merged CTRF (run-scoped) — robust when
  // re-reporting a non-latest run, unlike the status file which keeps only the latest verdict per
  // task (that would collapse both buckets to 0). A hard `failed` test wins; else a `passed`.
  const runVerdict = new Map<string, 'passed' | 'failed' | 'other'>();
  // Script/CLI tests carry no extra.taskId but prefix their name with `<taskId> — …`; fall back to
  // that so ALL lanes (not just agent) are counted in the two-state split.
  const taskIdOfName = (name: string): string => /^([a-z0-9.-]+\.\d{3})(?:\s|$)/.exec(name)?.[1] ?? '';
  for (const t2 of tests) {
    const id = String(t2.extra?.taskId ?? taskIdOfName(t2.name));
    if (!id) continue;
    const prev = runVerdict.get(id);
    if (t2.status === 'failed') runVerdict.set(id, 'failed');
    else if (t2.status === 'passed') { if (prev !== 'failed') runVerdict.set(id, 'passed'); }
    else if (!prev) runVerdict.set(id, 'other');
  }
  // A task awaiting review/interview/retry belongs in Outstanding, not "OK" — even if its checks
  // passed — so the two buckets don't double-count.
  const outstandingIds = new Set(outstandingRows.map((r) => r.taskId));
  const passedTasks = plan.entries.map((e) => e.taskId).filter((id) => runVerdict.get(id) === 'passed' && !outstandingIds.has(id));
  const failedTasks = plan.entries.map((e) => e.taskId).filter((id) => runVerdict.get(id) === 'failed');
  // Auth tasks the driver flagged as having NO video — their "passed" is unverified (no visual proof).
  const noVideoTasks = new Set(agentResults.filter((r) => r.noVideo).map((r) => r.taskId));
  const passedNoVideo = passedTasks.filter((id) => noVideoTasks.has(id));
  const failReason = new Map<string, string>();
  for (const t2 of tests) {
    if (t2.status !== 'failed') continue;
    const id = String(t2.extra?.taskId ?? '');
    if (id && !failReason.has(id) && t2.message) failReason.set(id, t2.message);
  }
  const titleOf = (id: string): string => {
    const ti = plan.tasks[id]?.title;
    return ti ? pickLang(ti, lang) : id;
  };
  const videoCell = (id: string): string =>
    fs.existsSync(path.join(runDir, 'evidence', 'videos', `${id}.webm`))
      ? t('rr.videoOnDisk', lang, { taskId: mdCell(id) })
      : videosIndex[id]
        ? t('rr.evidenceInZip', lang, { part: videosIndex[id] })
        : t('rr.videoMissing', lang);

  md.push(`## ${t('rr.h.needsFix', lang)} (${failedTasks.length})`, '');
  md.push(`_${t('rr.videoProofNote', lang)}_`, '');
  if (failedTasks.length === 0) {
    md.push(t('rr.nothingToFix', lang), '');
  } else {
    md.push(
      mdTable(
        [t('rr.col.task', lang), t('rr.col.reason', lang), t('rr.col.video', lang)],
        failedTasks.map((id) => [`${mdCell(titleOf(id))} (\`${mdCell(id)}\`)`, mdCell(failReason.get(id) ?? ''), videoCell(id)]),
      ),
      '',
    );
  }
  md.push(`## ${t('rr.h.passed', lang)} (${passedTasks.length})`, '');
  if (passedNoVideo.length > 0) md.push(`> **${t('rr.passedNoVideoWarn', lang, { n: passedNoVideo.length })}**`, '');
  if (passedTasks.length === 0) {
    md.push(t('rr.allGreen', lang), '');
  } else {
    md.push(
      mdTable(
        [t('rr.col.task', lang), t('rr.col.video', lang)],
        // A passed auth task with no recording is marked ⚠ — its verdict has no visual proof.
        passedTasks.map((id) => [`${noVideoTasks.has(id) ? '⚠️ ' : ''}${mdCell(titleOf(id))} (\`${mdCell(id)}\`)`, videoCell(id)]),
      ),
      '',
    );
  }

  md.push(`## ${t('rr.h.outstanding', lang)}`, '');
  if (outstandingRows.length === 0) {
    md.push(`_${t('rr.nothingOutstanding', lang)}_`, '');
  } else {
    md.push(
      mdTable(
        [t('rr.col.task', lang), t('rr.col.awaits', lang)],
        outstandingRows.map((r) => [r.taskId, awaitsLabel[r.awaits] ?? r.awaits]),
      ),
      '',
    );
  }

  md.push(`## ${t('rr.h.summary', lang)}`, '');
  md.push(
    mdTable(
      [t('rr.col.passed', lang), t('rr.col.failed', lang), t('rr.col.skipped', lang), t('rr.col.pending', lang), t('rr.col.other', lang), t('rr.col.refused', lang)],
      [[counts.passed, counts.failed, counts.skipped, counts.pending, counts.other, counts.refused].map(String)],
    ),
    '',
  );

  md.push(`## ${t('rr.h.refused', lang)}`, '');
  md.push(
    plan.refused.length
      ? mdTable([t('rr.col.taskId', lang), t('rr.col.reason', lang)], plan.refused.map((r) => [r.taskId, r.reason]))
      : `_${t('rr.noneRefused', lang)}_`,
    '',
  );

  md.push(`## ${t('rr.h.checklist', lang)}`, '');
  if (checklist) {
    for (const s of checklist.sections) {
      md.push(`### ${mdCell(pickLang(s.title, lang))} \`${mdCell(s.id)}\`${s.gate ? ` _(${t('rr.gate', lang)})_` : ''}`, '');
      const rows = s.tasks.map((id) => {
        const rec = statusFile.tasks[id];
        const status = rec
          ? rec.runId === plan.runId
            ? rec.status
            : `${rec.status} · ${t('rr.prior', lang)}`
          : '—';
        return [
          id,
          // WS3: soft-fail warnings decorate the cell (⚠N) without changing the status word.
          status + (rec?.flaky ? ' ⚑flaky' : '') + (rec?.softFails ? ` ⚠${rec.softFails} warn` : ''),
          rec?.verdictBy ?? '—',
          rec?.durationMs != null ? `${rec.durationMs} ms` : '—',
        ];
      });
      md.push(mdTable([t('rr.col.task', lang), t('rr.col.status', lang), t('rr.col.verdictBy', lang), t('rr.col.duration', lang)], rows), '');
    }
  } else {
    md.push(`_${t('rr.noChecklist', lang)}_`, '');
  }

  md.push(`## ${t('rr.h.agentVerdicts', lang)}`, '');
  const agentByTask = new Map<string, CtrfTest[]>();
  for (const t2 of tests.filter((t2) => t2.extra?.lane === 'agent')) {
    const id = String(t2.extra?.taskId ?? 'unknown');
    (agentByTask.get(id) ?? agentByTask.set(id, []).get(id)!).push(t2);
  }
  if (agentByTask.size === 0) {
    md.push(`_${t('rr.noAgentResults', lang)}_`, '');
  } else {
    for (const [taskId, group] of agentByTask) {
      md.push(`### \`${mdCell(taskId)}\``, '');
      for (const test of group) {
        const parts = test.name.split(' — ');
        const criterion = parts.length > 1 ? parts.slice(1).join(' — ') : test.name;
        const msg = test.message ? ` — ${mdCell(test.message)}` : '';
        md.push(`- **${test.status}** ${mdCell(criterion)}${msg}`);
      }
      const part = videosIndex[taskId];
      const video = part ? t('rr.evidenceInZip', lang, { part }) : t('rr.evidenceNone', lang);
      md.push(`- ${t('rr.agentEvidence', lang, { video, taskId: mdCell(taskId) })}`, '');
    }
  }

  md.push(`## ${t('rr.h.agentOutcomes', lang)}`, '');
  if (agentResults.length === 0) {
    md.push(`_${t('rr.noAgentLane', lang)}_`, '');
  } else {
    const rows = agentResults.map((r) => [
      r.taskId,
      r.outcome === 'result' ? (r.status ?? 'result') : r.outcome,
      r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : r.outcome === 'timeout' ? '~timeout' : '$0',
      String(r.turns ?? ''),
      String(r.denials ?? 0),
    ]);
    md.push(mdTable([t('rr.col.taskId', lang), t('rr.col.outcome', lang), t('rr.col.cost', lang), t('rr.col.turns', lang), t('rr.col.guardDenials', lang)], rows), '');
    md.push(t('rr.totalAgentSpend', lang, { amount: agentSpent.toFixed(2), n: agentResults.length }), '');
  }

  md.push(`## ${t('rr.h.humanInterviews', lang)}`, '');
  if (humans.length === 0) {
    md.push(`_${t('rr.noHumans', lang)}_`, '');
  } else {
    for (const h of humans) {
      const tester = h.tester;
      const who = tester?.displayName ?? h.answeredBy ?? t('rr.anonymous', lang);
      const bits = [
        tester?.phoneMasked ? t('rr.phone', lang, { v: tester.phoneMasked }) : null,
        tester?.role ? t('rr.role', lang, { v: tester.role }) : null,
        tester?.channel ? t('rr.via', lang, { v: tester.channel }) : null,
        h.completedAt ? t('rr.completed', lang, { v: h.completedAt }) : null,
      ].filter(Boolean) as string[];
      md.push(`### \`${mdCell(h.taskId)}\` — ${mdCell(who)}`);
      if (bits.length) md.push(`_${mdCell(bits.join(' · '))}_`);
      md.push('');
      const questions = plan.tasks[h.taskId]?.humanInterview?.questions ?? [];
      const rows = h.answers.map((a) => {
        const q = questions.find((x) => x.id === a.id);
        const prompt = q ? pickLang(q.prompt, lang) : t('rr.unknownQuestion', lang);
        const pass = q ? evalPass(q, a.value) : null;
        const verdictStr = pass === true ? t('rr.verdict.pass.word', lang) : pass === false ? t('rr.verdict.fail.word', lang) : t('rr.verdict.manual.word', lang);
        const value = typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
        return [a.id, prompt, value, verdictStr, a.notes ?? ''];
      });
      md.push(mdTable([t('rr.col.q', lang), t('rr.col.prompt', lang), t('rr.col.answer', lang), t('rr.col.verdict', lang), t('rr.col.notes', lang)], rows));
      if (h.evidence?.length) md.push('', t('rr.evidence', lang, { v: h.evidence.map(mdCell).join(', ') }));
      md.push('');
    }
  }

  md.push(`## ${t('rr.h.findings', lang)}`, '');
  if (findings.length === 0) {
    md.push(`_${t('rr.noFindings', lang)}_`, '');
  } else {
    for (const f of findings) {
      const tag = f.tied ? '' : t('rr.findingNotTied', lang);
      md.push(`- \`${mdCell(f.name)}\` — ${mdCell(f.heading)}${tag}`);
    }
    md.push('');
  }

  md.push(`## ${t('rr.h.videos', lang)}`, '');
  if (videos.length === 0) {
    md.push(`_${t('rr.noVideos', lang)}_`, '');
  } else {
    const locate = (v: { taskId: string; file: string }) => {
      const part = partOf(v.taskId);
      if (part === 'oversize' || part === 'disk-only') return v.file; // copy from disk
      return `${plan.runId}-videos-${part}.zip`;
    };
    const rows = videos.map((v) => [v.taskId, v.lane, partOf(v.taskId), locate(v), (v.size / (1024 * 1024)).toFixed(2)]);
    md.push(mdTable([t('rr.col.taskId', lang), t('rr.col.lane', lang), t('rr.col.part', lang), t('rr.col.file', lang), t('rr.col.mib', lang)], rows), '');
    if (diskOnly.length) {
      md.push(t('rr.diskOnly', lang), '');
      for (const v of diskOnly) md.push(`- \`${mdCell(v.taskId)}\` — ${mdCell(v.file)} (${(v.size / (1024 * 1024)).toFixed(2)} MiB)`);
      md.push('');
    }
    if (oversize.length) {
      md.push(t('rr.oversize', lang), '');
      for (const o of oversize) md.push(`- \`${mdCell(o.taskId)}\` — ${mdCell(o.file)} (${(o.size / (1024 * 1024)).toFixed(2)} MiB)`);
      md.push('');
    }
  }
  const reportMd = md.join('\n');

  // --- html (mirrors the markdown) --------------------------------------
  const htmlTable = (headers: string[], rows: string[][]): string =>
    `<table><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(redact(c))}</td>`).join('')}</tr>`).join('') +
    '</table>';
  const h: string[] = [];
  h.push(`<h1>${esc(t('rr.title', lang, { service: redact(plan.service) }))}</h1>`);
  // Provisional watermark banner for an interim (incomplete) pull — mirrors the markdown.
  if (incomplete) {
    h.push(`<p class="provisional">${esc(t('rr.provisional', lang, { n: outstandingTotal }))}</p>`);
  }
  h.push(
    `<p class="meta">${esc(t('rr.run', lang))} <code>${esc(redact(plan.runId))}</code> · ${esc(t('rr.env', lang))} ${esc(redact(plan.envProfile))} · ` +
      `<code>${esc(redact(plan.baseURL))}</code> · ${esc(t('rr.generated', lang))} ${esc(generatedAt)}</p>`,
  );
  h.push(
    `<p class="verdict ${verdict?.release ?? 'na'}">${esc(t('rr.releaseVerdict', lang))}: <b>${esc(verdictBadge)}${esc(verdictWord)}</b></p>`,
  );
  if (agentLine) h.push(`<p class="meta">${esc(agentLine)}</p>`);
  if (verdict?.failedGateSections.length) {
    h.push(
      '<ul>' +
        verdict.failedGateSections
          .map((g) => `<li>${esc(t('rr.failedGatePrefix', lang))} <code>${esc(redact(g.section))}</code>: ${esc(redact(g.tasks.join(', ')))}</li>`)
          .join('') +
        '</ul>',
    );
  }
  // Two-state at-a-glance (HTML mirror of the markdown) — needs-fixing vs OK, each with video proof.
  const videoPlain = (id: string): string =>
    fs.existsSync(path.join(runDir, 'evidence', 'videos', `${id}.webm`))
      ? `🎬 evidence/videos/${id}.webm`
      : videosIndex[id]
        ? t('rr.evidenceInZip', lang, { part: videosIndex[id] }).replace(/`/g, '')
        : '—';
  const taskCell = (id: string): string => `${titleOf(id)} (${id})`;
  h.push(`<h2>${esc(t('rr.h.needsFix', lang))} (${failedTasks.length})</h2>`);
  h.push(`<p class="meta">${esc(t('rr.videoProofNote', lang))}</p>`);
  if (failedTasks.length === 0) {
    h.push(`<p>${esc(t('rr.nothingToFix', lang))}</p>`);
  } else {
    h.push(htmlTable(
      [t('rr.col.task', lang), t('rr.col.reason', lang), t('rr.col.video', lang)],
      failedTasks.map((id) => [taskCell(id), failReason.get(id) ?? '', videoPlain(id)]),
    ));
  }
  h.push(`<h2>${esc(t('rr.h.passed', lang))} (${passedTasks.length})</h2>`);
  if (passedNoVideo.length > 0) h.push(`<p class="provisional">${esc(t('rr.passedNoVideoWarn', lang, { n: passedNoVideo.length }))}</p>`);
  if (passedTasks.length === 0) {
    h.push(`<p>${esc(t('rr.allGreen', lang))}</p>`);
  } else {
    h.push(htmlTable(
      [t('rr.col.task', lang), t('rr.col.video', lang)],
      passedTasks.map((id) => [`${noVideoTasks.has(id) ? '⚠️ ' : ''}${taskCell(id)}`, videoPlain(id)]),
    ));
  }

  h.push(`<h2>${esc(t('rr.h.outstanding', lang))}</h2>`);
  if (outstandingRows.length === 0) {
    h.push(`<p>${esc(t('rr.nothingOutstanding', lang))}</p>`);
  } else {
    h.push(htmlTable([t('rr.col.task', lang), t('rr.col.awaits', lang)], outstandingRows.map((r) => [r.taskId, awaitsLabel[r.awaits] ?? r.awaits])));
  }
  h.push(`<h2>${esc(t('rr.h.summary', lang))}</h2>`);
  h.push(
    htmlTable(
      [t('rr.col.passed', lang), t('rr.col.failed', lang), t('rr.col.skipped', lang), t('rr.col.pending', lang), t('rr.col.other', lang), t('rr.col.refused', lang)],
      [[counts.passed, counts.failed, counts.skipped, counts.pending, counts.other, counts.refused].map(String)],
    ),
  );
  h.push(`<h2>${esc(t('rr.h.refused', lang))}</h2>`);
  h.push(
    plan.refused.length
      ? htmlTable([t('rr.col.taskId', lang), t('rr.col.reason', lang)], plan.refused.map((r) => [r.taskId, r.reason]))
      : `<p>${esc(t('rr.noneRefused', lang))}</p>`,
  );
  h.push(`<h2>${esc(t('rr.h.checklist', lang))}</h2>`);
  if (checklist) {
    for (const s of checklist.sections) {
      h.push(`<h3>${esc(redact(pickLang(s.title, lang)))} <code>${esc(redact(s.id))}</code>${s.gate ? ` <span class="gate">${esc(t('rr.gate', lang))}</span>` : ''}</h3>`);
      const rows = s.tasks.map((id) => {
        const rec = statusFile.tasks[id];
        const status = rec ? (rec.runId === plan.runId ? rec.status : `${rec.status} · ${t('rr.prior', lang)}`) : '—';
        return [
          id,
          // WS3: soft-fail warnings decorate the cell (⚠N) without changing the status word.
          status + (rec?.flaky ? ' ⚑flaky' : '') + (rec?.softFails ? ` ⚠${rec.softFails} warn` : ''),
          rec?.verdictBy ?? '—',
          rec?.durationMs != null ? `${rec.durationMs} ms` : '—',
        ];
      });
      h.push(htmlTable([t('rr.col.task', lang), t('rr.col.status', lang), t('rr.col.verdictBy', lang), t('rr.col.duration', lang)], rows));
    }
  } else {
    h.push(`<p>${esc(t('rr.noChecklist', lang))}</p>`);
  }
  h.push(`<h2>${esc(t('rr.h.agentVerdicts', lang))}</h2>`);
  if (agentByTask.size === 0) {
    h.push(`<p>${esc(t('rr.noAgentResults', lang))}</p>`);
  } else {
    for (const [taskId, group] of agentByTask) {
      h.push(`<h3><code>${esc(redact(taskId))}</code></h3><ul>`);
      for (const test of group) {
        const parts = test.name.split(' — ');
        const criterion = parts.length > 1 ? parts.slice(1).join(' — ') : test.name;
        const msg = test.message ? ` — ${esc(redact(test.message))}` : '';
        h.push(`<li><span class="s-${test.status}">${esc(test.status)}</span> ${esc(redact(criterion))}${msg}</li>`);
      }
      const part = videosIndex[taskId];
      const video = part ? t('rr.evidenceInZip', lang, { part: esc(part) }) : t('rr.evidenceNone', lang);
      h.push(`<li>${t('rr.agentEvidenceHtml', lang, { video, taskId: esc(redact(taskId)) })}</li></ul>`);
    }
  }
  h.push(`<h2>${esc(t('rr.h.agentOutcomes', lang))}</h2>`);
  h.push(
    agentResults.length
      ? htmlTable(
          [t('rr.col.taskId', lang), t('rr.col.outcome', lang), t('rr.col.cost', lang), t('rr.col.turns', lang), t('rr.col.guardDenials', lang)],
          agentResults.map((r) => [
            r.taskId,
            r.outcome === 'result' ? (r.status ?? 'result') : r.outcome,
            r.costUsd != null ? `$${r.costUsd.toFixed(2)}` : r.outcome === 'timeout' ? '~timeout' : '$0',
            String(r.turns ?? ''),
            String(r.denials ?? 0),
          ]),
        ) + `<p>${t('rr.totalAgentSpendHtml', lang, { amount: agentSpent.toFixed(2), n: agentResults.length })}</p>`
      : `<p>${esc(t('rr.noAgentLane', lang))}</p>`,
  );
  h.push(`<h2>${esc(t('rr.h.humanInterviews', lang))}</h2>`);
  if (humans.length === 0) {
    h.push(`<p>${esc(t('rr.noHumans', lang))}</p>`);
  } else {
    for (const hr of humans) {
      const tester = hr.tester;
      const who = tester?.displayName ?? hr.answeredBy ?? t('rr.anonymous', lang);
      const bits = [
        tester?.phoneMasked ? t('rr.phone', lang, { v: tester.phoneMasked }) : null,
        tester?.role ? t('rr.role', lang, { v: tester.role }) : null,
        tester?.channel ? t('rr.via', lang, { v: tester.channel }) : null,
        hr.completedAt ? t('rr.completed', lang, { v: hr.completedAt }) : null,
      ].filter(Boolean) as string[];
      h.push(`<h3><code>${esc(redact(hr.taskId))}</code> — ${esc(redact(who))}</h3>`);
      if (bits.length) h.push(`<p class="meta">${esc(redact(bits.join(' · ')))}</p>`);
      const questions = plan.tasks[hr.taskId]?.humanInterview?.questions ?? [];
      const rows = hr.answers.map((a) => {
        const q = questions.find((x) => x.id === a.id);
        const pass = q ? evalPass(q, a.value) : null;
        const verdictStr = pass === true ? t('rr.verdict.pass.word', lang) : pass === false ? t('rr.verdict.fail.word', lang) : t('rr.verdict.manual.word', lang);
        const value = typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
        return [a.id, q ? pickLang(q.prompt, lang) : t('rr.unknownQuestion', lang), value, verdictStr, a.notes ?? ''];
      });
      h.push(htmlTable([t('rr.col.q', lang), t('rr.col.prompt', lang), t('rr.col.answer', lang), t('rr.col.verdict', lang), t('rr.col.notes', lang)], rows));
      if (hr.evidence?.length) h.push(`<p class="meta">${esc(redact(t('rr.evidence', lang, { v: hr.evidence.join(', ') })))}</p>`);
    }
  }
  h.push(`<h2>${esc(t('rr.h.findings', lang))}</h2>`);
  if (findings.length === 0) {
    h.push(`<p>${esc(t('rr.noFindings', lang))}</p>`);
  } else {
    h.push(
      '<ul>' +
        findings
          .map(
            (f) =>
              `<li><code>${esc(redact(f.name))}</code> — ${esc(redact(f.heading))}${f.tied ? '' : t('rr.findingNotTiedHtml', lang)}</li>`,
          )
          .join('') +
        '</ul>',
    );
  }
  h.push(`<h2>${esc(t('rr.h.videos', lang))}</h2>`);
  if (videos.length === 0) {
    h.push(`<p>${esc(t('rr.noVideos', lang))}</p>`);
  } else {
    const rows = videos.map((v) => [
      v.taskId,
      partOf(v.taskId),
      partOf(v.taskId) === 'oversize' ? v.file : `${plan.runId}-videos-${partOf(v.taskId)}.zip`,
      (v.size / (1024 * 1024)).toFixed(2),
    ]);
    h.push(htmlTable([t('rr.col.taskId', lang), t('rr.col.part', lang), t('rr.col.file', lang), t('rr.col.mib', lang)], rows));
    if (oversize.length) {
      h.push(
        `<p>${esc(t('rr.oversize', lang))}</p><ul>` +
          oversize
            .map((o) => `<li><code>${esc(redact(o.taskId))}</code> — ${esc(redact(o.file))} (${(o.size / (1024 * 1024)).toFixed(2)} MiB)</li>`)
            .join('') +
          '</ul>',
      );
    }
  }
  const style = `body{font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;margin:24px;max-width:1100px;color:#1a1a1a;background:#fff}
h1,h2,h3{margin:20px 0 8px;line-height:1.25}h2{border-bottom:1px solid #e5e7eb;padding-bottom:4px}
table{border-collapse:collapse;margin:8px 0 18px;font-size:13px}td,th{border:1px solid #d1d5db;padding:4px 10px;text-align:start;vertical-align:top}
th{background:#f3f4f6}code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:12px}
.meta{color:#6b7280}.verdict{font-size:16px;padding:8px 14px;border-radius:8px;display:inline-block}
.verdict.pass{background:#dcfce7;color:#15803d}.verdict.fail{background:#fee2e2;color:#b91c1c}.verdict.na{background:#f3f4f6;color:#374151}
.verdict.incomplete{background:#fef3c7;color:#92400e}
.provisional{background:#fef3c7;color:#92400e;font-weight:700;padding:8px 14px;border-radius:8px;border:1px solid #f59e0b;display:inline-block;margin:4px 0}
.gate{background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:6px;font-size:11px}
.s-passed{color:#15803d}.s-failed{color:#b91c1c}.s-pending{color:#b45309}.s-other{color:#6b7280}.s-skipped{color:#6b7280}
@media(prefers-color-scheme:dark){body{background:#0b0f14;color:#e5e7eb}th{background:#111827}code{background:#111827}
td,th{border-color:#374151}h2{border-color:#374151}.meta{color:#9ca3af}}`;
  const dir = 'ltr';
  const reportHtml =
    `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(t('rr.title', lang, { service: redact(plan.service) }))} — ${esc(redact(plan.runId))}</title>` +
    `<style>${style}</style></head><body>${h.join('\n')}</body></html>\n`;

  // --- write outputs -----------------------------------------------------
  const reportMdPath = path.join(reportDir, 'report.md');
  const reportHtmlPath = path.join(reportDir, 'report.html');
  const summaryJsonPath = path.join(reportDir, 'summary.json');
  const summary = {
    runId: plan.runId,
    service: plan.service,
    env: plan.envProfile,
    verdict: verdict ? verdict.release : 'n/a',
    outstanding: verdict
      ? {
          needsHuman: verdict.outstanding.needsHuman.length,
          pendingReview: verdict.outstanding.pendingReview.length,
          blocked: verdict.outstanding.blocked.length,
        }
      : { needsHuman: 0, pendingReview: 0, blocked: 0 },
    counts, // per-CHECK CTRF counts (many checks per task)
    taskCounts, // AUTHORITATIVE per-TASK verdicts for this run — the source of truth
    testers,
    agentSpentUsd: agentSpent, // measured API spend only
    agentReservedUsd: agentReserved, // conservative timeout reserve (not money spent)
    agentTimeouts,
    parts: zipParts.map((p) => path.basename(p)),
    // Videos on disk but NOT shipped because zipping was disabled (--no-videos) — so a caller can
    // tell "no videos existed" from "videos existed but were withheld" (the foot-gun that made a
    // full run look video-less). videosFound counts the zippable (non-sensitive) recordings.
    videosFound: zippable.length,
    ...(opts?.videos === false && zippable.length > 0 ? { videosOmitted: true } : {}),
    // Clean separated evidence tree: results/<runId>/evidence/{videos,documents}.
    evidence: { videos: evidence.videos, tasks: evidence.tasks },
  };
  fs.writeFileSync(reportMdPath, reportMd);
  fs.writeFileSync(reportHtmlPath, reportHtml);
  fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(reportDir, 'videos-index.json'), JSON.stringify(videosIndex, null, 2) + '\n');

  return { reportDir, reportMd: reportMdPath, reportHtml: reportHtmlPath, summaryJson: summaryJsonPath, zipParts, videosFound: zippable.length };
}
