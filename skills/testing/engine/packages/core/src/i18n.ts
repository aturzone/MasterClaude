/**
 * Tiny, dependency-free i18n for the SKULL QA run report.
 *
 * English (`en`) is the default and only built-in language. The catalog is typed
 * `satisfies Record<string, Record<Lang, string>>`, so a message entry that is missing a language
 * is a COMPILE error, and `t()` only accepts a known `MsgKey`, so a misspelled key is a COMPILE
 * error too. A project that needs extra locales can widen `Lang` and add the strings.
 *
 * SECURITY: `t()` returns TRUSTED template text (it may contain literal `<b>`/`<code>` for HTML
 * reports). It NEVER escapes the template. Every `{param}` value must already be `esc()`/`redact()`-ed
 * by the CALLER before it reaches `t()` — interpolation must not reopen the HTML-injection /
 * secret-redaction holes the call sites already close.
 */

export type Lang = 'en';

/** A human-facing string. A plain string is the common case; a `{ en, … }` object can carry extra
 * locales for a multi-language project. Backward-compatible: existing plain-string data stays valid. */
export type LocalizedText = string | { en: string };

/**
 * The message catalog for the run report. English-only by default; add locales here (and to `Lang`)
 * if a project needs them. The `satisfies` below fails the build if any entry drops a language.
 */
const messages = {
  // --- run report artifact (run-report.ts) ---
  'rr.title': { en: 'SKULL QA run report — {service}' },
  'rr.provisional': { en: '⏳ PROVISIONAL — incomplete ({n} outstanding)' },
  'rr.run': { en: 'Run' },
  'rr.envProfile': { en: 'Env profile' },
  'rr.baseURL': { en: 'Base URL' },
  'rr.generated': { en: 'Generated' },
  'rr.agentLane': { en: 'Agent lane' },
  'rr.releaseVerdict': { en: 'Release verdict' },
  'rr.env': { en: 'env' },
  'rr.failedGate': { en: 'failed gate section {section}: {tasks}' },
  'rr.failedGatePrefix': { en: 'failed gate section' },
  'rr.h.outstanding': { en: 'Outstanding work' },
  // Two-state at-a-glance split (the headline view).
  'rr.h.passed': { en: '✅ OK — tested, no problem' },
  'rr.h.needsFix': { en: '❌ Needs fixing' },
  'rr.col.video': { en: 'Video (proof)' },
  'rr.allGreen': { en: '_No passing tasks recorded in this run._' },
  'rr.passedNoVideoWarn': {
    en: '⚠️ {n} authenticated task(s) passed with NO video proof (unverified — marked ⚠️). Re-run them so they carry a recording.',
  },
  'rr.nothingToFix': { en: '_Nothing to fix — everything passed._ 🎉' },
  'rr.videoProofNote': {
    en: 'Each task\'s video is the proof its flow was actually exercised. Files live in `evidence/videos/`; documents in `evidence/documents/`.',
  },
  'rr.videoOnDisk': { en: '🎬 `evidence/videos/{taskId}.webm`' },
  'rr.videoMissing': { en: '—' },
  'rr.h.summary': { en: 'Summary' },
  'rr.h.refused': { en: 'Refused' },
  'rr.h.checklist': { en: 'Checklist sections' },
  'rr.h.agentVerdicts': { en: 'Agent verdicts' },
  'rr.h.agentOutcomes': { en: 'Agent lane outcomes' },
  'rr.h.humanInterviews': { en: 'Human interviews' },
  'rr.h.findings': { en: 'Findings' },
  'rr.h.videos': { en: 'Videos' },
  'rr.nothingOutstanding': { en: 'Nothing outstanding — the run is complete.' },
  'rr.noneRefused': { en: 'None refused.' },
  'rr.noChecklist': { en: 'No checklist.json for this service.' },
  'rr.noAgentResults': { en: 'No agent-lane results in this run.' },
  'rr.noAgentLane': { en: 'No agent lane in this run.' },
  'rr.noHumans': { en: 'No human interviews recorded in this run.' },
  'rr.noFindings': { en: 'No findings.' },
  'rr.noVideos': { en: 'No videos captured.' },
  'rr.awaits.interview': { en: '⏳ interview' },
  'rr.awaits.review': { en: '🕵️ review' },
  'rr.awaits.blocked': { en: '⚠️ blocked' },
  'rr.col.task': { en: 'task' },
  'rr.col.taskId': { en: 'taskId' },
  'rr.col.awaits': { en: 'awaits' },
  'rr.col.reason': { en: 'reason' },
  'rr.col.status': { en: 'status' },
  'rr.col.verdictBy': { en: 'verdictBy' },
  'rr.col.duration': { en: 'duration' },
  'rr.col.passed': { en: 'passed' },
  'rr.col.failed': { en: 'failed' },
  'rr.col.skipped': { en: 'skipped' },
  'rr.col.pending': { en: 'pending' },
  'rr.col.other': { en: 'other' },
  'rr.col.refused': { en: 'refused' },
  'rr.col.outcome': { en: 'outcome' },
  'rr.col.cost': { en: 'cost' },
  'rr.col.turns': { en: 'turns' },
  'rr.col.guardDenials': { en: 'guard denials' },
  'rr.col.q': { en: 'q' },
  'rr.col.prompt': { en: 'prompt' },
  'rr.col.answer': { en: 'answer' },
  'rr.col.verdict': { en: 'verdict' },
  'rr.col.notes': { en: 'notes' },
  'rr.col.lane': { en: 'lane' },
  'rr.col.part': { en: 'part' },
  'rr.col.file': { en: 'file' },
  'rr.col.mib': { en: 'MiB' },
  'rr.gate': { en: 'gate' },
  'rr.prior': { en: 'prior' },
  'rr.verdict.pass': { en: 'PASS' },
  'rr.verdict.fail': { en: 'FAIL' },
  'rr.verdict.incomplete': { en: 'INCOMPLETE' },
  'rr.verdict.na': { en: 'N/A' },
  'rr.verdict.pass.word': { en: 'pass' },
  'rr.verdict.fail.word': { en: 'fail' },
  'rr.verdict.manual.word': { en: 'manual' },
  'rr.evidenceInZip': { en: 'video in zip part `{part}`' },
  'rr.evidenceNone': { en: 'no video captured' },
  'rr.agentEvidence': { en: '📎 evidence: {video}; screenshots in `agent/{taskId}/`' },
  'rr.agentEvidenceHtml': { en: 'evidence: {video}; screenshots in <code>agent/{taskId}/</code>' },
  'rr.totalAgentSpend': { en: 'Total agent spend: **${amount}** across {n} task(s).' },
  'rr.totalAgentSpendHtml': { en: 'Total agent spend: <b>${amount}</b> across {n} task(s).' },
  'rr.diskOnly': { en: 'Disk-only (class-c — video may contain sensitive data, never shipped; copy from disk):' },
  'rr.oversize': { en: 'Oversize (not zipped — copy from disk):' },
  'rr.agentLaneLine': { en: 'agent lane: {tasks} task(s) · {timeouts} timed out · {blocked} blocked · ${spent} spent' },
  'rr.anonymous': { en: '(anonymous)' },
  'rr.unknownQuestion': { en: '(unknown question)' },
  'rr.phone': { en: 'phone {v}' },
  'rr.role': { en: 'role {v}' },
  'rr.via': { en: 'via {v}' },
  'rr.completed': { en: 'completed {v}' },
  'rr.evidence': { en: 'Evidence: {v}' },
  'rr.findingNotTied': { en: ' _(newest finding, not tied to this run)_' },
  'rr.findingNotTiedHtml': { en: ' <em>(newest finding, not tied to this run)</em>' },
} satisfies Record<string, Record<Lang, string>>;

export type MsgKey = keyof typeof messages;

/** Dev/test miss recorder: any lookup that had to fall back is appended here. In a healthy build
 * this stays EMPTY (the `satisfies` guarantees every catalog entry has every lang) — tests assert
 * length 0 after rendering. Cleared with `resetI18nMisses()`. */
export const i18nMisses: Array<{ key: string; lang: Lang }> = [];
export function resetI18nMisses(): void {
  i18nMisses.length = 0;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

/**
 * Look up `key` in `lang`, interpolate `{param}` placeholders, and return the result. Fallback
 * order: requested lang → English → the raw key. A missed lang (or unknown key that slipped past
 * the type via a cast) is recorded in `i18nMisses`.
 */
export function t(key: MsgKey, lang: Lang, params?: Record<string, string | number>): string {
  const entry = messages[key] as Record<Lang, string> | undefined;
  if (!entry) {
    i18nMisses.push({ key, lang });
    return interpolate(key, params);
  }
  let template = entry[lang];
  if (template === undefined) {
    i18nMisses.push({ key, lang });
    template = entry.en ?? key;
  }
  return interpolate(template, params);
}

/** Resolve a `LocalizedText` (plain string = ready to render) to a single language. Empty for undefined. */
export function pickLang(v: LocalizedText | undefined, lang: Lang): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.en ?? '';
}
