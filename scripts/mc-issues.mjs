#!/usr/bin/env node
// mc-issues — sync MASTER CLAUDE findings to GitHub Issues.
//
//   node scripts/mc-issues.mjs                  # sync: create/reopen/close to mirror local state
//   node scripts/mc-issues.mjs --dry-run        # say what would happen, do nothing
//   node scripts/mc-issues.mjs --include-security   # override the public-repo disclosure gate
//   node scripts/mc-issues.mjs --status         # one line: mode, counts, pending
//
// THE MODEL — local canon, issue surface:
//   Finding FILES (.sentinel/findings, .security/findings, .mc/qa/findings, .mc/design/findings)
//   remain the machine's source of truth: they are offline, deterministic, and carry the dedup
//   fingerprints. Issues are the HUMAN surface — assignable, closeable by "Fixes #N", visible where
//   the team already lives. Sync is one-way (local -> GitHub) with one write-back: the issue number
//   is stamped into the finding's frontmatter, so dedup costs zero API calls forever after.
//
// SAFETY — the disclosure gate:
//   A security finding posted to a PUBLIC repo's issues is a published vulnerability with file and
//   line. On public repos, S-* findings are HELD BACK by default and listed loudly, with two exits:
//   --include-security (explicit, per-run) or a private mirror (--repo owner/private-repo).
//
// NEVER runs from a hook. Hooks must stay fast and offline; this talks to a network. It runs at
// natural moments — the end of a sweep, /master-claude:issues, or by hand.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const STATUS_ONLY = args.includes('--status');
const INCLUDE_SECURITY = args.includes('--include-security');
const REPO_OVERRIDE = args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null;
const CREATE_CAP = 30; // rate-limit hygiene: a first sync on a big backlog goes in waves

const DIRS = [
  ['.sentinel/findings', 'sentinel'],
  ['.security/findings', 'security'],
  ['.mc/qa/findings', 'tester'],
  ['.mc/design/findings', 'designer'],
];
const STATE_FILE = path.join(ROOT, '.mc', 'issues.json');

// ---------------------------------------------------------------- plumbing
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fence = (t) => (t.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
const fm = (t, k) => ((new RegExp(`^${k}\\s*:\\s*(.+)$`, 'im').exec(fence(t))) || [])[1]?.trim().replace(/^["']|["']$/g, '') || '';

function loadFindings() {
  const out = [];
  for (const [dir, agent] of DIRS) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/^[A-Z]-\d+\.md$/.test(f)) continue;
      const file = path.join(d, f);
      const text = fs.readFileSync(file, 'utf8');
      out.push({
        file, agent, text,
        id: fm(text, 'id') || f.replace(/\.md$/, ''),
        severity: (fm(text, 'severity') || 'info').toLowerCase(),
        status: (fm(text, 'status') || 'open').toLowerCase(),
        title: fm(text, 'title') || (text.match(/^#\s+(.+)$/m) || [])[1] || f,
        pathField: fm(text, 'path'),
        theme: fm(text, 'theme'),
        fingerprint: fm(text, 'fingerprint'),
        issue: fm(text, 'issue'),
      });
    }
  }
  return out;
}

// Stamp `issue: N` into the finding's frontmatter (after `id:` — stable position, minimal diff).
function writeBack(finding, num) {
  const updated = finding.text.replace(/^(---\r?\n[\s\S]*?^id:[^\n]*\n)/m, `$1issue: ${num}\n`);
  if (updated === finding.text) throw new Error(`${finding.id}: could not stamp issue number (no id: line?)`);
  fs.writeFileSync(finding.file, updated);
}

function detectRepo() {
  try {
    const v = JSON.parse(gh('repo', 'view', ...(REPO_OVERRIDE ? [REPO_OVERRIDE] : []), '--json', 'nameWithOwner,visibility'));
    return { name: v.nameWithOwner, isPublic: String(v.visibility).toLowerCase() === 'public' };
  } catch { return null; }
}

function issueBody(f) {
  const machine = { id: f.id, agent: f.agent, fingerprint: f.fingerprint || null, path: f.pathField || null, severity: f.severity };
  const body = f.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''); // human part = the markdown after the frontmatter
  return `<!-- mc-finding ${JSON.stringify(machine)} -->\n\n${body.trim()}\n\n---\n*Filed by MASTER CLAUDE (\`${f.agent}\`) from \`${path.relative(ROOT, f.file).replace(/\\/g, '/')}\`. The local finding file is the canon; this issue is its tracking surface.*`;
}

// ---------------------------------------------------------------- main
const findings = loadFindings();
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};

let repo = null, mode = 'local';
try { gh('--version'); repo = detectRepo(); mode = repo ? 'github' : 'local'; } catch { mode = 'local'; }

if (STATUS_ONLY) {
  const open = findings.filter((f) => f.status === 'open');
  const synced = open.filter((f) => f.issue).length;
  console.log(`mode: ${mode}${repo ? ` (${repo.name}, ${repo.isPublic ? 'PUBLIC' : 'private'})` : ''} · findings: ${findings.length} (${open.length} open) · synced: ${synced} · pending: ${open.length - synced}`);
  process.exit(0);
}

if (mode === 'local') {
  // Everything still works — findings live locally; sync drains when a remote exists.
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ mode: 'local', lastAttempt: new Date().toISOString(), pending: findings.filter((f) => f.status === 'open' && !f.issue).length }, null, 2));
  console.log(`mode: local — no usable \`gh\`/remote. ${findings.filter((f) => f.status === 'open' && !f.issue).length} open finding(s) pending sync; nothing lost, run again when online.`);
  process.exit(0);
}

// The disclosure gate.
let toSync = findings;
const heldBack = [];
if (repo.isPublic && !INCLUDE_SECURITY) {
  toSync = findings.filter((f) => f.agent !== 'security');
  heldBack.push(...findings.filter((f) => f.agent === 'security' && f.status === 'open'));
}

const actions = { created: 0, reopened: 0, closed: 0, skipped: 0 };
const run = (desc, fn) => { if (DRY) { console.log(`[dry] ${desc}`); } else { fn(); } console.log(`  ${desc}`); };

for (const f of toSync) {
  // Fresh-clone fallback: no local issue number, but the fingerprint may already be filed.
  if (!f.issue && f.fingerprint) {
    try {
      const hits = JSON.parse(gh('issue', 'list', '--search', `"${f.fingerprint}" in:body`, '--state', 'all', '--json', 'number', '--limit', '1'));
      if (hits.length) { if (!DRY) writeBack(f, hits[0].number); f.issue = String(hits[0].number); console.log(`  relinked ${f.id} -> #${f.issue} (fingerprint match)`); }
    } catch { /* search is best-effort */ }
  }

  if (!f.issue) {
    if (f.status !== 'open') { actions.skipped++; continue; } // don't file history
    if (actions.created >= CREATE_CAP) { actions.skipped++; continue; }
    run(`create  #? ${f.id} [${f.severity}] ${f.title}`, () => {
      const labels = ['mc:finding', `mc:agent:${f.agent}`, `mc:sev:${f.severity}`, ...(f.theme ? [`mc:theme:${f.theme}`] : [])];
      for (const l of labels) { try { gh('label', 'create', l, '--force', '--color', 'ededed'); } catch { /* exists */ } }
      const num = gh('issue', 'create', '--title', `[${f.severity}] ${f.title}`, '--body', issueBody(f), '--label', labels.join(',')).match(/\/(\d+)$/)?.[1];
      if (!num) throw new Error('gh returned no issue number');
      writeBack(f, num);
    });
    actions.created++;
    continue;
  }

  // Mirror state: reopen-don't-remint on regression; close with the resolution on fix.
  try {
    const remote = JSON.parse(gh('issue', 'view', f.issue, '--json', 'state'));
    const remoteOpen = remote.state === 'OPEN';
    if (f.status === 'open' && !remoteOpen) {
      run(`reopen  #${f.issue} ${f.id} (regressed)`, () => gh('issue', 'reopen', f.issue, '--comment', `Regressed — the finding is open again locally (\`${f.id}\`).`));
      actions.reopened++;
    } else if (f.status !== 'open' && remoteOpen) {
      const why = { resolved: 'Resolved with positive evidence.', accepted: 'Accepted — deliberately not being fixed (see the finding for the reason).', 'false-positive': 'Closed as a false positive.', stale: 'The code this described is gone.' }[f.status] || f.status;
      run(`close   #${f.issue} ${f.id} (${f.status})`, () => gh('issue', 'close', f.issue, '--comment', `${why} (\`${f.id}\`)`));
      actions.closed++;
    }
  } catch { console.error(`  ! could not read #${f.issue} for ${f.id} — skipping`); }
}

fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
fs.writeFileSync(STATE_FILE, JSON.stringify({ mode, repo: repo.name, lastSync: new Date().toISOString(), heldBackSecurity: heldBack.length }, null, 2));

console.log(`\n${DRY ? '[dry-run] ' : ''}created ${actions.created} · reopened ${actions.reopened} · closed ${actions.closed} · skipped ${actions.skipped}`);
if (heldBack.length) {
  console.error(`\n⚠ ${heldBack.length} SECURITY finding(s) NOT synced — ${repo.name} is PUBLIC, and posting them would`);
  console.error(`  publish your vulnerability list with file and line. They remain tracked locally. To sync anyway:`);
  console.error(`    node scripts/mc-issues.mjs --include-security          # deliberate, per-run`);
  console.error(`    node scripts/mc-issues.mjs --repo owner/private-mirror # or route them to a private repo`);
}
if (actions.created >= CREATE_CAP) console.error(`\n(create cap ${CREATE_CAP}/run reached — run again to continue draining the backlog)`);
