#!/usr/bin/env node
// mc-dashboard — render mc.html at the project root: a self-contained, CLI-styled,
// charted view of MASTER CLAUDE's team and its findings for THIS project. Dependency-free.
// Reads (all optional, degrades gracefully): .mc/team.md, .mc/qa/runs/<latest>/summary.json,
// .mc/qa/findings/*.md, .sentinel/findings/*.md + .sentinel/MAP.md, .security/findings/*.md.
// Writes ./mc.html. A local artifact — never published.
//
//   node .claude/skills/testing/mc-dashboard/mc-dashboard.mjs [--open]
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const OPEN = process.argv.includes('--open');

const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fm = (t, k) => { const m = t && t.match(new RegExp(`^${k}\\s*:\\s*(.+)$`, 'im')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };

// ---------- gather ----------
function teamRoster() {
  const t = readText(path.join(root, '.mc', 'team.md'));
  if (!t) return [];
  const rows = [];
  for (const line of t.split('\n')) {
    const l = line.trim();
    // accept "- **id** · role · why", "| id | role | why |", or "id · role · why"
    if (l.startsWith('#') || !l) continue;
    const cells = l.replace(/^[-*|]\s*/, '').split(/\s*[·|]\s*/).map((c) => c.replace(/\*\*/g, '').replace(/\|/g, '').trim()).filter(Boolean);
    if (cells.length >= 2 && !/^-+$/.test(cells[0])) rows.push({ id: cells[0], role: cells[1], why: cells.slice(2).join(' · ') });
  }
  return rows.slice(0, 40);
}

function latestRun() {
  const runsDir = path.join(root, '.mc', 'qa', 'runs');
  const runs = ls(runsDir).filter((r) => fs.existsSync(path.join(runsDir, r, 'summary.json'))).sort();
  if (!runs.length) return null;
  const s = readJSON(path.join(runsDir, runs[runs.length - 1], 'summary.json'));
  return s ? { ...s, _id: runs[runs.length - 1] } : null;
}

function gatherFindings() {
  const out = [];
  const scan = (dir, team) => {
    for (const f of ls(dir)) {
      if (!f.endsWith('.md') || /^(INDEX|MAP|README|REPORT|SURFACE)/i.test(f)) continue;
      const t = readText(path.join(dir, f)); if (!t) continue;
      out.push({
        team, id: f.replace(/\.md$/, ''),
        severity: (fm(t, 'severity') || 'info').toLowerCase(),
        area: fm(t, 'area') || fm(t, 'type') || fm(t, 'category') || '',
        title: (t.match(/^#\s+(.+)$/m) || [, fm(t, 'title') || f])[1],
        where: fm(t, 'evidence') || fm(t, 'location') || fm(t, 'path') || '',
      });
    }
  };
  scan(path.join(root, '.mc', 'qa', 'findings'), 'tester');
  scan(path.join(root, '.sentinel', 'findings'), 'sentinel');
  scan(path.join(root, '.security', 'findings'), 'security');
  const rank = { critical: 0, high: 1, major: 1, medium: 2, moderate: 2, low: 3, minor: 3, info: 4 };
  return out.sort((a, b) => (rank[a.severity] ?? 5) - (rank[b.severity] ?? 5));
}

// ---------- charts (inline SVG, theme via currentColor + CSS vars) ----------
function donut(counts) {
  const segs = [['passed', counts.passed || 0, 'var(--ok)'], ['failed', counts.failed || 0, 'var(--bad)'],
    ['skipped', counts.skipped || 0, 'var(--dim)'], ['pending', counts.pending || 0, 'var(--warn)'], ['refused', counts.refused || 0, 'var(--mut)']];
  const total = segs.reduce((s, x) => s + x[1], 0) || 1;
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const ring = segs.filter((s) => s[1] > 0).map(([, v, col]) => {
    const len = (v / total) * C; const el = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return el;
  }).join('');
  const pct = Math.round(((counts.passed || 0) / total) * 100);
  return `<svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="test results">${ring}
    <text x="70" y="66" text-anchor="middle" class="big">${pct}%</text><text x="70" y="86" text-anchor="middle" class="sub">pass</text></svg>`;
}
function bars(pairs, color = 'var(--accent)') {
  if (!pairs.length) return '<p class="muted">no data</p>';
  const max = Math.max(1, ...pairs.map((p) => p[1]));
  return `<div class="bars">${pairs.map(([k, v]) => `<div class="barrow"><span class="blabel">${esc(k)}</span><span class="btrack"><span class="bfill" style="width:${(v / max) * 100}%;background:${color}"></span></span><span class="bval">${v}</span></div>`).join('')}</div>`;
}

// ---------- render ----------
const roster = teamRoster();
const run = latestRun();
const findings = gatherFindings();
const counts = (run && run.counts) || {};
const verdict = (run && (run.verdict || (run.releaseVerdict))) || (findings.some((f) => ['critical', 'high'].includes(f.severity)) ? 'FAIL' : run ? 'PASS' : 'N/A');
const vClass = { PASS: 'ok', FAIL: 'bad', INCOMPLETE: 'warn' }[String(verdict).toUpperCase()] || 'mut';
const sevCounts = ['critical', 'high', 'medium', 'low', 'info'].map((s) => [s, findings.filter((f) => f.severity === s || (s === 'high' && f.severity === 'major') || (s === 'medium' && f.severity === 'moderate') || (s === 'low' && f.severity === 'minor')).length]).filter((x) => x[1] > 0);
const catCounts = Object.entries((run && run.taskCounts) || {}).map(([k, v]) => [k, typeof v === 'number' ? v : (v && v.total) || 0]).filter((x) => x[1] > 0).slice(0, 10);
const projectName = path.basename(root);
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const section = (title, body) => body ? `<section class="card"><h2>${esc(title)}</h2>${body}</section>` : '';

const rosterHtml = roster.length ? `<div class="roster">${roster.map((m) => `<div class="member"><span class="mid">${esc(m.id)}</span><span class="mrole">${esc(m.role)}</span><span class="mwhy">${esc(m.why)}</span></div>`).join('')}</div>` : '';
const findingsHtml = findings.length ? `<table class="find"><thead><tr><th>sev</th><th>team</th><th>area</th><th>finding</th><th>where</th></tr></thead><tbody>${findings.slice(0, 60).map((f) => `<tr><td><span class="pill ${f.severity}">${esc(f.severity)}</span></td><td class="muted">${esc(f.team)}</td><td class="muted">${esc(f.area)}</td><td>${esc(f.title)}</td><td class="mono muted">${esc(f.where)}</td></tr>`).join('')}</tbody></table>` : '';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>mc.html — ${esc(projectName)}</title><style>
:root{--bg:#0b0d10;--fg:#d7dde3;--dim:#8b95a1;--mut:#5b6570;--line:#1c2128;--card:#0f1318;--accent:#d97757;--ok:#3fb950;--bad:#f85149;--warn:#d29922;--muted:#7d8590}
@media(prefers-color-scheme:light){:root{--bg:#f6f7f9;--fg:#1c2128;--dim:#57606a;--mut:#8b949e;--line:#d0d7de;--card:#fff;--accent:#bc4c2e;--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700;--muted:#6e7781}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 ui-monospace,"JetBrains Mono",SFMono-Regular,Menlo,Consolas,monospace;padding:28px}
.wrap{max-width:1080px;margin:0 auto}a{color:var(--accent)}
.head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:22px}
.prompt{color:var(--ok)}.head h1{font-size:20px;margin:0;font-weight:600}.head .by{color:var(--dim)}.head .stamp{margin-left:auto;color:var(--mut);font-size:12px}
.badge{padding:3px 12px;border-radius:6px;font-weight:700;letter-spacing:.5px}.badge.ok{background:color-mix(in srgb,var(--ok) 20%,transparent);color:var(--ok)}.badge.bad{background:color-mix(in srgb,var(--bad) 20%,transparent);color:var(--bad)}.badge.warn{background:color-mix(in srgb,var(--warn) 22%,transparent);color:var(--warn)}.badge.mut{background:var(--line);color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.card h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin:0 0 12px}
.chartrow{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
svg .big{fill:var(--fg);font-size:26px;font-weight:700}svg .sub{fill:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:1px}
.legend{display:flex;flex-direction:column;gap:5px;font-size:12px}.legend b{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:7px;vertical-align:middle}
.bars{display:flex;flex-direction:column;gap:7px}.barrow{display:grid;grid-template-columns:120px 1fr 34px;gap:9px;align-items:center;font-size:12px}
.blabel{color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.btrack{background:var(--line);border-radius:5px;height:9px;overflow:hidden}.bfill{display:block;height:100%}.bval{text-align:right;color:var(--dim)}
.roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}
.member{border:1px solid var(--line);border-radius:7px;padding:9px 11px;display:flex;flex-direction:column;gap:2px}.mid{color:var(--accent);font-weight:600}.mrole{color:var(--fg);font-size:12px}.mwhy{color:var(--dim);font-size:11px}
table.find{width:100%;border-collapse:collapse;font-size:12px}table.find th{text-align:left;color:var(--dim);font-weight:500;border-bottom:1px solid var(--line);padding:6px 8px}table.find td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.pill{padding:1px 8px;border-radius:20px;font-size:11px;font-weight:600}.pill.critical,.pill.high,.pill.major{background:color-mix(in srgb,var(--bad) 20%,transparent);color:var(--bad)}.pill.medium,.pill.moderate{background:color-mix(in srgb,var(--warn) 22%,transparent);color:var(--warn)}.pill.low,.pill.minor,.pill.info{background:var(--line);color:var(--dim)}
.mono{font-family:inherit}.muted{color:var(--mut)}.stat{display:flex;gap:20px;flex-wrap:wrap}.stat div{display:flex;flex-direction:column}.stat .n{font-size:22px;font-weight:700}.stat .l{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:1px}
footer{color:var(--mut);font-size:11px;margin-top:22px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><div class="wrap">
<div class="head"><span class="prompt">$</span><h1>master-claude ~ ${esc(projectName)}</h1><span class="by">led by MASTER CLAUDE</span>
<span class="badge ${vClass}">${esc(String(verdict).toUpperCase())}</span><span class="stamp">${esc(stamp)}</span></div>
${run ? `<div class="grid">
  <section class="card"><h2>Test results${run.env ? ' · ' + esc(run.env) : ''}</h2><div class="chartrow">${donut(counts)}
    <div class="legend">${[['passed', 'ok'], ['failed', 'bad'], ['skipped', 'dim'], ['pending', 'warn'], ['refused', 'mut']].filter(([k]) => counts[k]).map(([k, c]) => `<span><b style="background:var(--${c})"></b>${k} · ${counts[k]}</span>`).join('')}</div></div></section>
  ${catCounts.length ? `<section class="card"><h2>By category</h2>${bars(catCounts)}</section>` : ''}
  ${sevCounts.length ? `<section class="card"><h2>Findings by severity</h2>${bars(sevCounts, 'var(--bad)')}</section>` : ''}
</div>` : (sevCounts.length ? `<div class="grid"><section class="card"><h2>Findings by severity</h2>${bars(sevCounts, 'var(--bad)')}</section></div>` : '')}
${section('Team on this project', rosterHtml)}
${section(`Findings (${findings.length})`, findingsHtml)}
${!run && !findings.length && !roster.length ? '<section class="card"><p class="muted">No MASTER CLAUDE state found yet. Run the tester team (<code>/master-claude:test</code>) or Sentinel first, then regenerate.</p></section>' : ''}
<footer>Generated by MASTER CLAUDE · mc-dashboard · local artifact (not published). Regenerate: <span class="mono">node .claude/skills/testing/mc-dashboard/mc-dashboard.mjs</span></footer>
</div></body></html>`;

const outPath = path.join(root, 'mc.html');
fs.writeFileSync(outPath, html);
console.log(`Wrote ${path.relative(root, outPath)} — ${roster.length} member(s), ${run ? (counts.passed || 0) + counts.failed || 0 : 0} result(s), ${findings.length} finding(s).`);
if (OPEN) console.log(`Open: file://${outPath.replace(/\\/g, '/')}`);
