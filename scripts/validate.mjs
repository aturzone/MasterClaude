#!/usr/bin/env node
// Validate the MASTER CLAUDE skills repo. MASTER CLAUDE is plain markdown you copy into .claude/
// (there are no manifests to validate), so the thing worth enforcing is that it does not LIE:
// a description must not promise a command or a hook the repo doesn't ship, a category README must
// list the members that actually exist, findings must match docs/FINDING-SPEC.md, and doc links
// must point at domains that still resolve. Exit non-zero on any problem (used in CI).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const problems = [];
const warnings = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

// Vendored dependency trees are not our capabilities. playwright-core ships its own SKILL.md
// files inside the bundled QA engine; counting them inflated the skill count by 4 for months.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const raw = (f) => fs.readFileSync(f, 'utf8');
function frontmatter(file) {
  const m = raw(file).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const block = m[1];
  return {
    block,
    name: (/^name:\s*(.+)$/m.exec(block) || [])[1]?.trim(),
    desc: /(^|\n)description:/.test(block),
    // description may be folded across lines; grab everything until the next top-level key
    descText: (/(^|\n)description:\s*(>-|>|\|)?\s*([\s\S]*?)(?=\n[a-z-]+:|$)/i.exec(block) || [])[3] || '',
  };
}

// ---------------------------------------------------------------- the docs must exist
for (const f of ['README.md', 'SETUP.md', 'LICENSE', 'docs/FINDING-SPEC.md']) {
  need(fs.existsSync(path.join(ROOT, f)), `missing ${f}`);
}

const skills = walk(path.join(ROOT, 'skills')).filter((p) => p.endsWith('SKILL.md'));
const agents = walk(path.join(ROOT, 'agents')).filter((p) => p.endsWith('.md'));
const commands = walk(path.join(ROOT, 'commands')).filter((p) => p.endsWith('.md'));
need(skills.length > 0, 'no skills found under skills/');

// ---------------------------------------------------------------- frontmatter
for (const f of [...skills, ...agents]) {
  const fm = frontmatter(f);
  need(fm, `no frontmatter: ${rel(f)}`);
  if (fm) { need(fm.name, `no \`name\`: ${rel(f)}`); need(fm.desc, `no \`description\`: ${rel(f)}`); }
}
for (const f of commands) {
  const fm = frontmatter(f);
  need(fm && fm.desc, `command needs frontmatter \`description\`: ${rel(f)}`);
}

// ---------------------------------------------------------------- claims-lint
// The rule this repo broke for months: `guardian`'s description said "Hooks intercept risky work"
// and referenced `/guardian:audit`, while hooks/ held one unrelated file and no such command existed.
// A capability may not promise machinery it does not ship.

const ourCommands = new Set(
  commands.map((f) => {
    const p = rel(f).replace(/^commands\//, '').replace(/\.md$/, '');
    return p.includes('/') ? p.replace('/', ':') : p; // commands/sentinel/map.md -> sentinel:map
  })
);
// Slash commands the harness provides — referencing these is legitimate.
const BUILTIN_COMMANDS = new Set([
  'clear', 'compact', 'config', 'context', 'model', 'help', 'init', 'review', 'rewind', 'resume',
  'plugin', 'mcp', 'doctor', 'permissions', 'hooks', 'agents', 'statusline', 'sandbox', 'usage',
  'workflows', 'effort', 'fast', 'branch', 'btw', 'goal', 'advisor', 'batch', 'dataviz', 'loop',
  'code-review', 'security-review', 'deep-research', 'memory', 'tasks', 'status', 'worktree',
  'background', 'bg', 'remote-control', 'output-style', 'passes', 'desktop',
]);
const hookFiles = walk(path.join(ROOT, 'hooks'));
const hooksText = hookFiles.map(raw).join('\n');

for (const f of [...skills, ...agents, ...commands]) {
  const fm = frontmatter(f);
  if (!fm) continue;
  const d = fm.descText;
  const id = fm.name || path.basename(path.dirname(f));

  // (a) a slash command named in a DESCRIPTION must exist.
  // The `/` must open a token — preceded by start, whitespace, a backtick or a paren. Without that
  // guard this matches every alternation slash in prose ("npm/pnpm/yarn", "LCP/CLS/INP",
  // "shadcn/Radix/Tailwind") and every URL path segment, which is a false-positive storm, not a lint.
  for (const m of d.matchAll(/(?:^|[\s`(])\/([a-z][a-z0-9-]{2,}(?::[a-z0-9-]+)?)\b/g)) {
    const cmd = m[1].toLowerCase();
    if (BUILTIN_COMMANDS.has(cmd) || BUILTIN_COMMANDS.has(cmd.split(':')[0])) continue;
    need(ourCommands.has(cmd), `${rel(f)}: description promises \`/${cmd}\`, which this repo does not ship`);
  }

  // (b) a description may not claim hook-backed enforcement unless a hook references this capability
  if (/\bhooks?\b/i.test(d) && /\b(intercept|block|prevent|enforce|stop)\w*/i.test(d)) {
    need(
      hooksText.toLowerCase().includes(String(id).toLowerCase()),
      `${rel(f)}: description claims hook-backed enforcement, but no file in hooks/ references "${id}". ` +
        `Either ship the hook or describe it as guidance.`
    );
  }
}

// ---------------------------------------------------------------- category READMEs
// skills/master-claude/ is the leader itself, not a category — a README there would be noise.
const NO_README_NEEDED = new Set(['master-claude']);
const skillsDir = path.join(ROOT, 'skills');
for (const cat of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  if (NO_README_NEEDED.has(cat.name)) continue;
  const dir = path.join(skillsDir, cat.name);
  const members = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name);
  if (!members.length) continue;
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) { problems.push(`skills/${cat.name}/ has ${members.length} skills but no README.md`); continue; }
  const text = raw(readme);
  const missing = members.filter((m) => !text.includes(m));
  if (missing.length) problems.push(`skills/${cat.name}/README.md does not mention: ${missing.join(', ')}`);
}

// ---------------------------------------------------------------- finding-spec conformance
const SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const STATUSES = new Set(['open', 'resolved', 'accepted', 'false-positive', 'stale']);
for (const f of walk(ROOT).filter((p) => /[\\/]findings[\\/][A-Z]-\d+\.md$/.test(p))) {
  const fm = frontmatter(f);
  if (!fm) { problems.push(`${rel(f)}: finding has no frontmatter (docs/FINDING-SPEC.md)`); continue; }
  const g = (k) => (new RegExp(`^${k}\\s*:\\s*(.+)$`, 'im').exec(fm.block) || [])[1]?.trim().toLowerCase();
  const sev = g('severity'), st = g('status') || 'open';
  if (!SEVERITIES.has(sev)) problems.push(`${rel(f)}: severity "${sev}" is not in the spec (${[...SEVERITIES].join('|')})`);
  if (!STATUSES.has(st)) problems.push(`${rel(f)}: status "${st}" is not in the spec (${[...STATUSES].join('|')})`);
  if ((st === 'accepted' || st === 'false-positive') && !g('reason')) {
    problems.push(`${rel(f)}: status "${st}" requires a \`reason\` — an unexplained dismissal is not a decision`);
  }
}

// ---------------------------------------------------------------- stale doc links
// docs.claude.com now 301s to platform.claude.com, and the Claude Code docs moved to code.claude.com/docs.
// Match a stale LINK (a scheme or a path follows the host), not a prose mention of the hostname — otherwise
// CLAUDE-SURFACE.md, whose whole job is to document that the host moved, can never name it.
for (const f of [...skills, ...agents, ...commands, ...walk(path.join(ROOT, 'docs'))].filter((p) => p.endsWith('.md'))) {
  if (/(https?:\/\/)?docs\.claude\.com\//.test(raw(f))) {
    problems.push(`${rel(f)}: links to docs.claude.com/… — moved to code.claude.com/docs (Claude Code) or platform.claude.com (API)`);
  }
}

// ---------------------------------------------------------------- verification stamps (warn only)
const STAMP = /<!--\s*verified:\s*(\d{4})-(\d{2})/;
const now = new Date(process.env.MC_NOW || Date.now());
for (const f of [...skills, ...agents]) {
  const m = STAMP.exec(raw(f));
  if (!m) continue;
  const age = (now.getFullYear() - +m[1]) * 12 + (now.getMonth() + 1 - +m[2]);
  if (age > 3) warnings.push(`${rel(f)}: verified stamp is ${age} months old — re-check against the current Claude Code surface`);
}

// ---------------------------------------------------------------- report
if (warnings.length) console.warn('⚠ warnings:\n  ' + warnings.join('\n  ') + '\n');
if (problems.length) {
  console.error('✗ validation FAILED:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`✓ valid: ${skills.length} skills, ${agents.length} agents, ${commands.length} commands`);
