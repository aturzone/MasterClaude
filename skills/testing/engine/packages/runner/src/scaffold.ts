import fs from 'node:fs';
import path from 'node:path';
import { loadTaxonomy } from '@mc-qa/core';

/** `qa task new` — scaffold the next NNN task file in the right category folder. */
export function scaffoldTask(serviceDir: string, service: string, category: string, slug: string, owner: string): string {
  const taxonomy = loadTaxonomy();
  if (!taxonomy[category]) {
    throw new Error(
      `Category "${category}" is not in the taxonomy. Existing: ${Object.keys(taxonomy).sort().join(', ')}\n` +
        `(New categories are a deliberate PR to packages/core/src/schemas/taxonomy.json first.)`,
    );
  }
  const dir = path.join(serviceDir, 'tasks', ...category.split('.'));
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.startsWith(`${slug}.`) && f.endsWith('.task.json'))
    : [];
  const next = String(existing.length + 1).padStart(3, '0');
  const id = `${service}.${category}.${slug}.${next}`;
  const file = path.join(dir, `${slug}.${next}.task.json`);
  const depth = category.split('.').length + 2; // tasks/<...category>/
  const schemaRel = `${'../'.repeat(depth + 1)}packages/core/src/schemas/task.schema.json`;
  const node = taxonomy[category];
  const today = new Date().toISOString().slice(0, 10);

  const template = {
    $schema: schemaRel,
    schemaVersion: '1.0',
    id,
    title: `TODO: one-line behavior this protects (min 8 chars)`,
    goal: 'TODO: one paragraph — what user-visible behavior this protects and why it matters.',
    classification: { category, testTypes: ['functional'], tags: [] },
    importance: { priority: 'P2', severityIfBroken: 'major', businessImpact: 'TODO' },
    risk: {
      class: 'a',
      reason: 'TODO — when unsure between b and c, choose c (conservative)',
      allowedEnvs: ['production.test-account'],
      forbiddenActions: [],
    },
    automation: {
      level: 'full',
      executor: node.defaultExecutor,
      humanInvolvement: node.defaultHumanInvolvement,
    },
    procedure: {
      preconditions: [],
      steps: [{ n: 1, action: 'goto', target: '/' }],
      selectorKeys: [],
    },
    oracle: {
      expected: [{ id: 'e1', description: 'TODO expected result' }],
      evidence: { required: ['screenshot'] },
    },
    lifecycle: { status: 'draft', owner, createdAt: today, updatedAt: today },
    schedule: { frequency: ['nightly'], estimatedDurationSec: 30, timeoutSec: 120 },
  };
  fs.writeFileSync(file, JSON.stringify(template, null, 2) + '\n');
  return file;
}

/** `qa finding new` — scaffold a bug-finding markdown under apps/<svc>/findings/. */
export function scaffoldFinding(
  serviceDir: string,
  service: string,
  slug: string,
  opts: { taskId?: string; runId?: string; owner: string },
): string {
  const dir = path.join(serviceDir, 'findings');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.md`);
  if (fs.existsSync(file)) throw new Error(`finding ${file} already exists`);
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const seq = String(fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length + 1).padStart(3, '0');
  const id = `KIF${service.toUpperCase()}-${year}-${seq}`;
  const body = `# ${id} — TODO one-line title

- **Service:** ${service}
- **Found:** ${today} by ${opts.owner}
${opts.taskId ? `- **Task:** \`${opts.taskId}\`\n` : ''}${opts.runId ? `- **Run:** ${opts.runId}\n` : ''}- **Severity:** TODO (blocker | critical | major | minor | cosmetic)
- **Status:** open

## Summary
TODO — what is broken, from the end-user's perspective.

## Steps to reproduce
1. TODO

## Expected vs actual
- Expected: TODO
- Actual: TODO

## Evidence
- TODO (screenshot / HAR / console-log paths under results/<runId>/)

## Notes
TODO — root-cause hypothesis, scope (all users vs automation-only), owner.
`;
  fs.writeFileSync(file, body);
  return file;
}

/** `qa scaffold-service` — copy tools/templates/service into apps/<name> with replacements. */
export function scaffoldService(root: string, name: string, url: string): string {
  const templateDir = path.join(root, 'tools', 'templates', 'service');
  const target = path.join(root, 'apps', name);
  if (!fs.existsSync(templateDir)) throw new Error(`Missing template at ${templateDir}`);
  if (fs.existsSync(target)) throw new Error(`apps/${name} already exists`);

  const copy = (src: string, dst: string) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copy(s, d);
      else {
        const content = fs
          .readFileSync(s, 'utf8')
          .replaceAll('__SERVICE__', name)
          .replaceAll('__BASEURL__', url);
        fs.writeFileSync(d, content);
      }
    }
  };
  copy(templateDir, target);
  return target;
}
