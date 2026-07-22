import fs from 'node:fs';
import path from 'node:path';
import type { SelectorMap, StatusFile, Task, Taxonomy } from '@mc-qa/core';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function count<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]));
}

/** Static coverage dashboard derived purely from tasks/ + status/ + selector-memory/. */
export function renderDashboard(
  service: string,
  serviceDir: string,
  tasks: Task[],
  taxonomy: Taxonomy,
  outFile: string,
): string {
  const active = tasks.filter((t) => t.lifecycle.status === 'active');
  const byCategory = count(active, (t) => t.classification.category);
  const byExecutor = count(active, (t) => t.automation.executor);
  const byRisk = count(active, (t) => t.risk.class);
  const emptyCategories = Object.keys(taxonomy).filter((c) => !byCategory.has(c)).sort();

  const statusDir = path.join(serviceDir, 'status');
  const profiles: StatusFile[] = fs.existsSync(statusDir)
    ? fs.readdirSync(statusDir).filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(statusDir, f), 'utf8')) as StatusFile)
    : [];

  const selDir = path.join(serviceDir, 'selector-memory');
  const selectorRows: string[] = [];
  if (fs.existsSync(selDir)) {
    for (const f of fs.readdirSync(selDir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue;
      const map = JSON.parse(fs.readFileSync(path.join(selDir, f), 'utf8')) as SelectorMap;
      for (const [name, e] of Object.entries(map.entries)) {
        selectorRows.push(
          `<tr><td>${esc(map.page)}.${esc(name)}</td><td>${e.provenance}</td><td>${e.state ?? '—'}</td>` +
            `<td>${e.stability ?? '—'}</td><td>${e.lastVerified}</td></tr>`,
        );
      }
    }
  }

  const table = (m: Map<string, number>, h1: string) =>
    `<table><tr><th>${h1}</th><th>tasks</th></tr>` +
    [...m.entries()].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') +
    '</table>';

  const profileBlocks = profiles.map((p) => {
    const rows = Object.entries(p.tasks)
      .map(([id, r]) => `<tr><td>${esc(id)}</td><td class="s-${r.status}">${r.status}</td><td>${r.at.slice(0, 16)}</td></tr>`)
      .join('');
    const passed = Object.values(p.tasks).filter((r) => r.status === 'passed').length;
    return `<h3>${esc(p.envProfile)} — ${passed}/${Object.keys(p.tasks).length} passed</h3>
      <table><tr><th>task</th><th>status</th><th>at</th></tr>${rows}</table>`;
  }).join('');

  const html = `<!doctype html><meta charset="utf-8"><title>SKULL QA — ${esc(service)} coverage</title>
<style>
body{font:14px/1.5 system-ui;margin:24px;max-width:1100px}
table{border-collapse:collapse;margin:8px 0 20px}td,th{border:1px solid #ccc;padding:4px 10px;text-align:left}
h1,h2{margin:18px 0 6px}.warn{background:#fff3cd;padding:10px;border-radius:8px}
.s-passed{color:#15803d}.s-failed{color:#b91c1c}.s-skipped-needs-human{color:#b45309}
.grid{display:flex;gap:32px;flex-wrap:wrap}
</style>
<h1>SKULL QA coverage — ${esc(service)}</h1>
<p>${active.length} active tasks (${tasks.length} total). Generated ${new Date().toISOString().slice(0, 16)}.</p>
<div class="grid">
<div><h2>By category</h2>${table(byCategory, 'category')}</div>
<div><h2>By executor</h2>${table(byExecutor, 'executor')}</div>
<div><h2>By risk</h2>${table(byRisk, 'risk class')}</div>
</div>
<h2>Empty taxonomy categories (${emptyCategories.length})</h2>
<div class="warn">${emptyCategories.length === 0 ? 'None — every category has at least one task 🎉'
    : emptyCategories.map((c) => `<code>${esc(c)}</code> — ${esc(taxonomy[c].title)}`).join('<br>')}</div>
<h2>Latest status per env profile</h2>${profileBlocks || '<p>No runs recorded yet.</p>'}
<h2>Selector health (${selectorRows.length} entries)</h2>
<table><tr><th>key</th><th>provenance</th><th>state</th><th>stability</th><th>last verified</th></tr>${selectorRows.join('')}</table>
`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return outFile;
}
