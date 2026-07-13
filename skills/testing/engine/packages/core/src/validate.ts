import fs from 'node:fs';
import path from 'node:path';
import type { Checklist, ServiceConfig, Task, Taxonomy } from './types.ts';
import { pickLang } from './i18n.ts';
import type { LoadedTask } from './task-loader.ts';

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const ID_RE = /^[a-z0-9]+(\.[a-z0-9]+){1,4}\.[a-z0-9]+(-[a-z0-9]+)*\.\d{3}$/;
const TEST_TYPES = new Set([
  'functional', 'visual', 'perf', 'a11y', 'security', 'seo', 'pwa', 'rtl-i18n',
  'network', 'console', 'fuzz', 'ux-judgment', 'content', 'resilience', 'data-sanity',
]);
const RISK_CLASSES = new Set(['a', 'b', 'c', 'd']);
const EXECUTORS = new Set(['script', 'agent', 'human', 'hybrid']);
const STATUSES = new Set(['draft', 'active', 'quarantined', 'deprecated']);

/** Split a task id into { service, category, slug, seq }. */
export function parseTaskId(id: string) {
  const parts = id.split('.');
  const seq = parts.at(-1)!;
  const slug = parts.at(-2)!;
  return { service: parts[0], category: parts.slice(1, -2).join('.'), slug, seq };
}

function envProfileNames(serviceDir: string): Set<string> {
  const dir = path.join(serviceDir, 'envs');
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
}

export function validateTasks(
  serviceDir: string,
  serviceConfig: ServiceConfig,
  loaded: LoadedTask[],
  taxonomy: Taxonomy,
  selectorKeys: Set<string>,
  checklist: Checklist | null,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (file: string, message: string) => errors.push({ file, message });
  const profiles = envProfileNames(serviceDir);
  const seenIds = new Map<string, string>();
  const tasksDir = path.join(serviceDir, 'tasks');

  // A Flutter/CanvasKit service paints to a <canvas> with no real DOM, so agents must explore by
  // sight — much costlier in steps. Detected the same way the agent driver detects vision.
  const visionService = (() => {
    try {
      const ctx = fs.readFileSync(path.join(serviceDir, 'agent-context.md'), 'utf8');
      return /flutter|canvaskit|paints to a canvas/i.test(ctx);
    } catch {
      return false;
    }
  })();
  const VISION_MIN_STEPS = 40;

  for (const { task: t, file } of loaded) {
    const rel = path.relative(serviceDir, file);

    // --- identity ---
    if (typeof t.id !== 'string' || !ID_RE.test(t.id)) {
      err(rel, `id "${t.id}" does not match <service>.<category>.<slug>.<NNN>`);
      continue;
    }
    const { service, category, slug, seq } = parseTaskId(t.id);
    if (seenIds.has(t.id)) err(rel, `duplicate id "${t.id}" (also in ${seenIds.get(t.id)})`);
    seenIds.set(t.id, rel);
    if (service !== serviceConfig.id) err(rel, `id service prefix "${service}" != service "${serviceConfig.id}"`);
    if (t.classification?.category !== category) {
      err(rel, `classification.category "${t.classification?.category}" != id category "${category}"`);
    }
    const expectedRel = path.join('tasks', ...category.split('.'), `${slug}.${seq}.task.json`);
    if (rel !== expectedRel) err(rel, `file must live at ${expectedRel} (id↔path convention)`);
    if (!taxonomy[category]) err(rel, `category "${category}" is not in taxonomy.json`);

    // --- required blocks ---
    if (t.schemaVersion !== '1.0') err(rel, `schemaVersion must be "1.0"`);
    // title is LocalizedText: a plain English string is the common case; a `{ en, … }` object
    // supplies each locale. pickLang resolves it; require the rendered title to be long enough.
    const title = pickLang(t.title, 'en');
    if (!title || title.length < 8) {
      err(rel, 'title missing or too short (min 8 chars)');
    }
    if (!t.goal || t.goal.length < 20) err(rel, 'goal missing or too short (min 20 chars) — say what user-visible behavior this protects');
    if (!Array.isArray(t.classification?.testTypes) || t.classification.testTypes.length === 0) {
      err(rel, 'classification.testTypes must be a non-empty array');
    } else {
      for (const tt of t.classification.testTypes) {
        if (!TEST_TYPES.has(tt)) err(rel, `unknown testType "${tt}"`);
      }
    }
    if (!['P0', 'P1', 'P2', 'P3'].includes(t.importance?.priority)) err(rel, 'importance.priority must be P0–P3');
    if (!t.lifecycle || !STATUSES.has(t.lifecycle.status)) err(rel, 'lifecycle.status invalid');
    if (!t.lifecycle?.owner) err(rel, 'lifecycle.owner required');
    if (!Array.isArray(t.schedule?.frequency) || !t.schedule?.estimatedDurationSec) {
      err(rel, 'schedule.frequency and schedule.estimatedDurationSec required');
    }
    if (!Array.isArray(t.oracle?.expected) || t.oracle.expected.length === 0) {
      err(rel, 'oracle.expected must list at least one expected result');
    }

    // --- risk ---
    if (!RISK_CLASSES.has(t.risk?.class)) err(rel, 'risk.class must be a|b|c|d');
    if (!Array.isArray(t.risk?.allowedEnvs) || t.risk.allowedEnvs.length === 0) {
      err(rel, 'risk.allowedEnvs must be non-empty');
    } else {
      for (const e of t.risk.allowedEnvs) {
        if (!profiles.has(e)) err(rel, `risk.allowedEnvs references unknown env profile "${e}"`);
      }
    }

    // --- automation cross-rules ---
    const a = t.automation;
    if (!a || !EXECUTORS.has(a.executor)) {
      err(rel, 'automation.executor must be script|agent|human|hybrid');
      continue;
    }
    const h = a.humanInvolvement;
    if (typeof h !== 'number' || h < 0 || h > 5) err(rel, 'automation.humanInvolvement must be 0–5');
    const hasAgentStep = (t.procedure?.steps ?? []).some((s) => s.executor === 'agent');
    if (a.executor === 'agent' && !a.agentBrief) {
      err(rel, 'executor "agent" requires automation.agentBrief');
    }
    if (a.executor === 'hybrid' && hasAgentStep && !a.agentBrief) {
      err(rel, 'hybrid task has an agent step but no automation.agentBrief');
    }
    if (a.executor === 'agent' && !['a', 'b'].includes(t.risk.class)) {
      err(rel, 'agent-executor tasks are capped at risk class b — risky exploration must be human or hybrid');
    }
    if (
      a.executor === 'agent' &&
      visionService &&
      typeof a.agentBrief?.maxSteps === 'number' &&
      a.agentBrief.maxSteps < VISION_MIN_STEPS
    ) {
      warnings.push({
        file: rel,
        message: `agentBrief.maxSteps ${a.agentBrief.maxSteps} is low for a vision/canvas service (Flutter exploration is step-costly) — consider >= ${VISION_MIN_STEPS}`,
      });
    }
    if (h >= 3 && !t.humanInterview) {
      err(rel, `humanInvolvement ${h} requires a humanInterview block`);
    }
    if (t.risk.class === 'd' && h < 3) {
      err(rel, 'risk class d (real money / irreversible) requires humanInvolvement >= 3');
    }
    if (a.cliKind && (!a.cliUrls || a.cliUrls.length === 0)) {
      err(rel, `cliKind "${a.cliKind}" requires automation.cliUrls`);
    }
    if (!a.cliKind && (!Array.isArray(t.procedure?.steps) || t.procedure.steps.length === 0)) {
      err(rel, 'procedure.steps must be non-empty (unless this is a cliKind task)');
    }

    // --- interview shape ---
    if (t.humanInterview) {
      const qids = new Set<string>();
      const OPS = new Set(['equals', 'gte', 'lte', 'in', 'matches', 'manual']);
      for (const q of t.humanInterview.questions ?? []) {
        if (qids.has(q.id)) err(rel, `duplicate interview question id "${q.id}"`);
        qids.add(q.id);
        const ops = Object.keys(q.passWhen ?? {});
        if (ops.length !== 1) err(rel, `interview question "${q.id}" passWhen must have exactly one operator`);
        else if (!OPS.has(ops[0])) {
          err(rel, `interview question "${q.id}" passWhen operator "${ops[0]}" is unknown (expected ${[...OPS].join('|')}) — a typo would silently pass the check`);
        }
      }
    }

    // --- selector keys ---
    const referenced = new Set<string>(t.procedure?.selectorKeys ?? []);
    for (const s of t.procedure?.steps ?? []) {
      if (s.locator) referenced.add(s.locator);
      for (const k of s.selectorKeys ?? []) referenced.add(k);
    }
    for (const k of referenced) {
      if (!selectorKeys.has(k)) err(rel, `selector key "${k}" not found in selector-memory/`);
    }

    // --- quarantine hygiene ---
    if (t.lifecycle.status === 'quarantined') {
      const until = t.lifecycle.flakiness?.quarantinedUntil;
      if (!until) warnings.push({ file: rel, message: 'quarantined without quarantinedUntil date' });
      else if (new Date(until) < new Date()) {
        warnings.push({ file: rel, message: `quarantinedUntil ${until} is past due — fix or deprecate` });
      }
    }
  }

  // --- checklist completeness ---
  if (checklist) {
    const placed = new Map<string, string>();
    for (const s of checklist.sections) {
      for (const id of s.tasks) {
        if (placed.has(id)) err('checklist.json', `task "${id}" appears in sections "${placed.get(id)}" and "${s.id}"`);
        placed.set(id, s.id);
        if (!seenIds.has(id)) err('checklist.json', `section "${s.id}" references unknown task "${id}"`);
      }
    }
    const unscheduled = new Set((checklist.unscheduled ?? []).map((u) => u.task));
    for (const { task: t, file } of loaded) {
      if (t.lifecycle?.status !== 'active') continue;
      if (!placed.has(t.id) && !unscheduled.has(t.id)) {
        err(path.relative(serviceDir, file), `active task "${t.id}" is neither in a checklist section nor in unscheduled (with a reason)`);
      }
    }
  } else {
    warnings.push({ file: 'checklist.json', message: 'no checklist.json for this service yet' });
  }

  if (!fs.existsSync(tasksDir)) warnings.push({ file: 'tasks/', message: 'no tasks directory' });
  return { errors, warnings };
}
