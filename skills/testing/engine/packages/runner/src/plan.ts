import fs from 'node:fs';
import path from 'node:path';
import {
  gate,
  laneOf,
  loadChecklist,
  loadEnvProfile,
  loadServiceConfig,
  loadSelectorMaps,
  loadTasks,
  loadTaxonomy,
  makeRunId,
  resolveBaseURL,
  validateTasks,
  allSelectorKeys,
  resolveServiceDir,
  type RunPlan,
  type EnvProfile,
} from '@mc-qa/core';

export interface RunSelection {
  service: string;
  env?: string;
  section?: string;
  tags?: string[];
  risk?: string[];
  executor?: string[];
  taskId?: string;
  supervised: boolean;
  label?: string;
}

export interface BuiltPlan {
  plan: RunPlan;
  profile: EnvProfile;
  runDir: string;
}

export async function buildPlan(root: string, sel: RunSelection): Promise<BuiltPlan> {
  const serviceDir = await resolveServiceDir(root, sel.service);
  const serviceConfig = await loadServiceConfig(serviceDir);
  const envName = sel.env ?? serviceConfig.defaultEnv;
  const profile = loadEnvProfile(serviceDir, envName);
  const baseURL = resolveBaseURL(profile);

  // Validate everything before running anything — broken task files never execute.
  const loaded = loadTasks(serviceDir);
  const taxonomy = loadTaxonomy();
  const checklist = loadChecklist(serviceDir);
  const { errors } = validateTasks(serviceDir, serviceConfig, loaded, taxonomy, allSelectorKeys(serviceDir), checklist);
  if (errors.length > 0) {
    throw new Error(
      `Task validation failed (${errors.length} error${errors.length > 1 ? 's' : ''}):\n` +
        errors.map((e) => `  ${e.file}: ${e.message}`).join('\n'),
    );
  }

  // --- selection ---
  let candidates = loaded.map((l) => l.task);
  if (sel.taskId) {
    candidates = candidates.filter((t) => t.id === sel.taskId);
    if (candidates.length === 0) throw new Error(`No task with id "${sel.taskId}"`);
  } else if (sel.section) {
    const section = checklist?.sections.find((s) => s.id === sel.section);
    if (!section) {
      throw new Error(
        `Unknown checklist section "${sel.section}". Available: ${checklist?.sections.map((s) => s.id).join(', ') ?? '(no checklist)'}`,
      );
    }
    const order = new Map(section.tasks.map((id, i) => [id, i]));
    candidates = candidates
      .filter((t) => order.has(t.id))
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  } else if (checklist) {
    // full run = checklist order (sections in order), unscheduled excluded
    const order = new Map<string, number>();
    let i = 0;
    for (const s of checklist.sections) for (const id of s.tasks) order.set(id, i++);
    candidates = candidates.filter((t) => order.has(t.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  if (sel.tags?.length) {
    candidates = candidates.filter((t) => sel.tags!.some((tag) => t.classification.tags?.includes(tag)));
  }
  if (sel.risk?.length) candidates = candidates.filter((t) => sel.risk!.includes(t.risk.class));
  if (sel.executor?.length) candidates = candidates.filter((t) => sel.executor!.includes(t.automation.executor));

  // --- gate (layer 1) ---
  const ci = !!process.env.CI;
  const plan: RunPlan = {
    // Always key on the canonical service id (sel.service may be the folder name).
    runId: makeRunId(serviceConfig.id, envName, sel.label ?? sel.section ?? (sel.taskId ? 'single' : 'all')),
    service: serviceConfig.id,
    serviceDir,
    envProfile: envName,
    baseURL,
    allowedRiskClasses: [
      ...profile.unattendedRiskClasses,
      ...(sel.supervised ? profile.supervisedRiskClasses : []),
    ],
    createdAt: new Date().toISOString(),
    ci,
    filters: { ...sel },
    entries: [],
    refused: [],
    tasks: {},
    serviceConfig,
  };

  for (const task of candidates) {
    const decision = gate(task, profile, { supervised: sel.supervised, ci });
    if (decision.allow) {
      // A task that breaks its own browser context (offline/tab-kill) is flagged so the driver runs
      // it LAST in the serialized auth lane and force-restarts the keeper after. Explicit tag wins;
      // the resil.interrupt.* category is a belt-and-suspenders auto-detect.
      const destructive =
        task.automation.destructiveContext === true ||
        task.classification.category.startsWith('resil.interrupt');
      if (destructive && task.automation.destructiveContext !== true) {
        console.warn(
          `  warn  ${task.id}: category "${task.classification.category}" auto-detected as destructive — add "automation.destructiveContext": true to make the intent explicit`,
        );
      }
      plan.entries.push({
        taskId: task.id,
        lane: laneOf(task),
        cliKind: task.automation.cliKind,
        supervised: decision.supervised,
        ...(decision.attendedOnly ? { attendedOnly: true } : {}),
        ...(destructive ? { destructive: true } : {}),
      });
      plan.tasks[task.id] = task;
    } else {
      plan.refused.push({ taskId: task.id, reason: decision.reason });
      plan.tasks[task.id] = task;
    }
  }

  const runDir = path.join(root, 'results', plan.runId);
  fs.mkdirSync(path.join(runDir, 'ctrf'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2));
  return { plan, profile, runDir };
}
