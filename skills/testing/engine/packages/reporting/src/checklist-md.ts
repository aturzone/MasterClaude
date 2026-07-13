import fs from 'node:fs';
import path from 'node:path';
import { pickLang, type Checklist, type StatusFile, type Task } from '@mc-qa/core';

const EMOJI: Record<string, string> = {
  passed: '✅',
  failed: '❌',
  blocked: '🚧',
  'skipped-risk-gate': '⛔',
  'skipped-needs-human': '🙋',
  'pending-review': '🕵️',
  quarantined: '🩹',
};

/** Regenerate apps/<svc>/checklist.md — the human-readable, never-hand-edited view. */
export function regenerateChecklistMd(
  serviceDir: string,
  checklist: Checklist,
  tasksById: Map<string, Task>,
): string {
  const statusDir = path.join(serviceDir, 'status');
  const profiles: StatusFile[] = [];
  if (fs.existsSync(statusDir)) {
    for (const f of fs.readdirSync(statusDir).sort()) {
      if (f.endsWith('.json')) {
        profiles.push(JSON.parse(fs.readFileSync(path.join(statusDir, f), 'utf8')) as StatusFile);
      }
    }
  }

  const lines: string[] = [
    `# ${pickLang(checklist.title, 'en')}`,
    '',
    '> GENERATED from tasks/ + status/ — do not edit by hand. Regenerate with `pnpm qa checklist --service ' +
      checklist.service +
      '`.',
    '',
  ];

  for (const section of checklist.sections) {
    const flags = [
      section.gate ? 'gate' : null,
      section.stopOnFail ? 'stop-on-fail' : null,
      section.humanSession ? 'human-session' : null,
    ].filter(Boolean);
    lines.push(`## ${section.id} — ${pickLang(section.title, 'en')}${flags.length ? ` _(${flags.join(', ')})_` : ''}`, '');
    const header = ['Task', 'Title', 'Risk', 'Exec', 'H', ...profiles.map((p) => p.envProfile)];
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`|${header.map(() => '---').join('|')}|`);
    for (const id of section.tasks) {
      const t = tasksById.get(id);
      const cells = [
        `\`${id}\``,
        t ? pickLang(t.title, 'en') : '⚠ unknown task',
        t?.risk.class ?? '?',
        t?.automation.executor ?? '?',
        String(t?.automation.humanInvolvement ?? '?'),
        ...profiles.map((p) => {
          const rec = p.tasks[id];
          if (!rec) return '—';
          return `${EMOJI[rec.status] ?? rec.status} ${rec.at.slice(0, 10)}`;
        }),
      ];
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  if (checklist.unscheduled?.length) {
    lines.push('## Unscheduled', '');
    for (const u of checklist.unscheduled) lines.push(`- \`${u.task}\` — ${u.reason}`);
    lines.push('');
  }

  const md = lines.join('\n');
  fs.writeFileSync(path.join(serviceDir, 'checklist.md'), md);
  return md;
}
