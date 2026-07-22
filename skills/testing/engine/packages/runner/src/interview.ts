import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pickLang, type InterviewQuestion, type Task } from '@mc-qa/core';
import { interviewToCtrf, type InterviewAnswerSet } from '@mc-qa/reporting';

export function renderInterviewMd(task: Task): string {
  const iv = task.humanInterview!;
  const lines = [
    `# Human interview — ${task.id}`,
    '',
    `**${pickLang(task.title, 'en')}**`,
    '',
    pickLang(iv.intro, 'en'),
    '',
    `Estimated: ${iv.estimatedMinutes} min · Risk class: ${task.risk.class} · Severity if broken: ${task.importance.severityIfBroken}`,
    '',
  ];
  if (task.risk.forbiddenActions?.length) {
    lines.push('## ⛔ Forbidden actions', '', ...task.risk.forbiddenActions.map((f) => `- ${f}`), '');
  }
  if (iv.setupChecklist?.length) {
    lines.push('## Setup', '', ...iv.setupChecklist.map((s) => `- [ ] ${pickLang(s, 'en')}`), '');
  }
  lines.push('## Questions', '');
  for (const q of iv.questions) {
    lines.push(`### ${q.id} — ${pickLang(q.prompt, 'en')}`);
    if (q.observationHint) lines.push(`> 👁 ${pickLang(q.observationHint, 'en')}`);
    lines.push(`- kind: ${q.kind}${q.options ? ` (${q.options.join(' / ')})` : ''}`);
    if (q.evidencePrompt) lines.push(`- 📎 evidence: ${pickLang(q.evidencePrompt, 'en')}`);
    lines.push('');
  }
  if (iv.teardownChecklist?.length) {
    lines.push('## Teardown (mandatory)', '', ...iv.teardownChecklist.map((s) => `- [ ] ${pickLang(s, 'en')}`), '');
  }
  lines.push('---', 'Record answers in form.html (same folder) and save result.json next to it,', 'then run: `pnpm qa ingest --run <runId>`', '');
  return lines.join('\n');
}

/** Self-contained interview form: works from file://, downloads result.json. */
export function renderInterviewForm(task: Task): string {
  const iv = task.humanInterview!;
  // Resolve LocalizedText fields to plain strings BEFORE embedding in the client payload — the
  // browser has no pickLang, so an unresolved {fa,en} object would render as [object Object].
  const resolvedQuestions = iv.questions.map((q) => ({
    ...q,
    prompt: pickLang(q.prompt, 'en'),
    observationHint: q.observationHint ? pickLang(q.observationHint, 'en') : undefined,
    evidencePrompt: q.evidencePrompt ? pickLang(q.evidencePrompt, 'en') : undefined,
  }));
  const payload = JSON.stringify({ taskId: task.id, questions: resolvedQuestions });
  return `<!doctype html><meta charset="utf-8"><title>SKULL QA interview — ${task.id}</title>
<style>body{font:15px/1.6 system-ui;max-width:760px;margin:32px auto;padding:0 16px}
.q{border:1px solid #ddd;border-radius:10px;padding:12px 16px;margin:12px 0}
.hint{color:#666;font-size:13px}textarea,input,select{width:100%;box-sizing:border-box;margin-top:6px}
button{padding:10px 24px;font-size:16px;border-radius:8px;border:0;background:#2563eb;color:#fff;cursor:pointer}
.forbidden{background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:10px 16px}</style>
<h1>${task.id}</h1><p><b>${pickLang(task.title, 'en')}</b></p><p>${pickLang(iv.intro, 'en')}</p>
${task.risk.forbiddenActions?.length ? `<div class="forbidden"><b>⛔ Forbidden:</b><ul>${task.risk.forbiddenActions.map((f) => `<li>${f}</li>`).join('')}</ul></div>` : ''}
${iv.setupChecklist?.length ? `<h2>Setup</h2><ul>${iv.setupChecklist.map((s) => `<li>${pickLang(s, 'en')}</li>`).join('')}</ul>` : ''}
<h2>Questions</h2><div id="qs"></div>
<p><label>Your name/email: <input id="answeredBy" placeholder="tester@example.com"></label></p>
<button onclick="download()">Download result.json</button>
${iv.teardownChecklist?.length ? `<h2>Teardown (mandatory)</h2><ul>${iv.teardownChecklist.map((s) => `<li>${pickLang(s, 'en')}</li>`).join('')}</ul>` : ''}
<script>
const DATA = ${payload};
const qs = document.getElementById('qs');
for (const q of DATA.questions) {
  const div = document.createElement('div'); div.className = 'q';
  let input = '';
  if (q.kind === 'boolean') input = '<select data-q="' + q.id + '"><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>';
  else if (q.kind === 'scale-1-5') input = '<select data-q="' + q.id + '"><option value="">—</option>' + [1,2,3,4,5].map(n => '<option>' + n + '</option>').join('') + '</select>';
  else if (q.kind === 'number') input = '<input type="number" data-q="' + q.id + '">';
  else if (q.kind === 'single-choice') input = '<select data-q="' + q.id + '"><option value="">—</option>' + (q.options||[]).map(o => '<option>' + o + '</option>').join('') + '</select>';
  else input = '<textarea data-q="' + q.id + '"></textarea>';
  div.innerHTML = '<b>' + q.id + '</b> — ' + q.prompt +
    (q.observationHint ? '<div class="hint">👁 ' + q.observationHint + '</div>' : '') +
    (q.evidencePrompt ? '<div class="hint">📎 ' + q.evidencePrompt + '</div>' : '') + input +
    '<textarea placeholder="notes (optional)" data-notes="' + q.id + '"></textarea>';
  qs.appendChild(div);
}
function coerce(q, v) {
  if (v === '' || v == null) return null;
  if (q.kind === 'boolean') return v === 'true';
  if (q.kind === 'scale-1-5' || q.kind === 'number') return Number(v);
  return v;
}
function download() {
  const answers = DATA.questions.map(q => ({
    id: q.id,
    value: coerce(q, document.querySelector('[data-q="' + q.id + '"]').value),
    notes: document.querySelector('[data-notes="' + q.id + '"]').value || undefined,
  }));
  const missing = answers.filter(a => a.value === null);
  if (missing.length && !confirm('Unanswered: ' + missing.map(a => a.id).join(', ') + ' — download anyway?')) return;
  const blob = new Blob([JSON.stringify({ taskId: DATA.taskId, answeredBy: document.getElementById('answeredBy').value, answers }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'result.json'; a.click();
}
</script>`;
}

/** Attended terminal interview: walk the questions, compute the verdict, emit CTRF. */
export async function runInlineInterview(task: Task, humanDir: string, ctrfDir: string): Promise<'passed' | 'failed' | 'pending'> {
  const iv = task.humanInterview!;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n=== Interview: ${task.id} — ${pickLang(task.title, 'en')} ===\n${pickLang(iv.intro, 'en')}\n`);
  if (task.risk.forbiddenActions?.length) {
    console.log('⛔ FORBIDDEN:\n' + task.risk.forbiddenActions.map((f) => `  - ${f}`).join('\n') + '\n');
  }
  for (const s of iv.setupChecklist ?? []) {
    await rl.question(`SETUP: ${pickLang(s, 'en')}\n  ...press Enter when done `);
  }
  const answers: InterviewAnswerSet['answers'] = [];
  for (const q of iv.questions) {
    console.log(`\n${q.id}: ${pickLang(q.prompt, 'en')}`);
    if (q.observationHint) console.log(`  👁 ${pickLang(q.observationHint, 'en')}`);
    const raw = await rl.question(`  answer (${promptFor(q)}): `);
    const notes = await rl.question('  notes (optional): ');
    answers.push({ id: q.id, value: coerceAnswer(q, raw), notes: notes || undefined });
  }
  for (const s of iv.teardownChecklist ?? []) {
    await rl.question(`TEARDOWN (mandatory): ${pickLang(s, 'en')}\n  ...press Enter when done `);
  }
  const who = await rl.question('\nYour name/email: ');
  rl.close();

  const answerSet: InterviewAnswerSet = { taskId: task.id, answers, answeredBy: who || undefined };
  fs.mkdirSync(humanDir, { recursive: true });
  fs.writeFileSync(path.join(humanDir, 'result.json'), JSON.stringify(answerSet, null, 2));
  const report = interviewToCtrf(task, answerSet);
  fs.writeFileSync(path.join(ctrfDir, `human-${task.id}.json`), JSON.stringify(report, null, 2));
  const t = report.results.tests[0];
  console.log(`\nVerdict: ${t.status.toUpperCase()}${t.message ? `\n${t.message}` : ''}\n`);
  return t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'pending';
}

function promptFor(q: InterviewQuestion): string {
  switch (q.kind) {
    case 'boolean': return 'y/n';
    case 'scale-1-5': return '1-5';
    case 'number': return 'number';
    case 'single-choice':
    case 'multi-choice': return (q.options ?? []).join(' / ');
    default: return 'text';
  }
}

function coerceAnswer(q: InterviewQuestion, raw: string): unknown {
  const v = raw.trim();
  switch (q.kind) {
    case 'boolean': return /^(y|yes|true)$/i.test(v);
    case 'scale-1-5':
    case 'number': return Number(v);
    default: return v;
  }
}
