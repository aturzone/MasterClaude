import type { EnvProfile, Lane, Task } from './types.ts';

/** Which execution lane a task belongs to. Single source of truth — the gate and the planner
 * both use it, so a class-c "human" task can't be gated as one lane and dispatched as another. */
export function laneOf(task: Task): Lane {
  if (task.automation.cliKind) return 'cli';
  switch (task.automation.executor) {
    case 'agent':
      return 'agent';
    case 'human':
      return 'human';
    case 'hybrid':
      // A hybrid whose human involvement is high is driven by the interview, not run
      // unattended — queue it. Lightly-human hybrids run through the script spec.
      return task.automation.humanInvolvement >= 3 ? 'human' : 'script';
    default:
      return 'script';
  }
}

export type GateDecision =
  | { allow: true; supervised: boolean; attendedOnly?: boolean }
  | { allow: false; reason: string };

export interface GateContext {
  /** --supervised flag was passed AND the runner is attended (headed, not CI). */
  supervised: boolean;
  ci: boolean;
}

/**
 * The risk-class safety gate. Layer 1 of 3 (planner). Refusals are surfaced in plan.json,
 * never silently dropped. See docs/risk-and-safety.md.
 */
export function gate(task: Task, profile: EnvProfile, ctx: GateContext): GateDecision {
  if (!task.risk.allowedEnvs.includes(profile.name)) {
    return {
      allow: false,
      reason: `task allows envs [${task.risk.allowedEnvs.join(', ')}], not "${profile.name}"`,
    };
  }
  if (task.lifecycle.status !== 'active') {
    return { allow: false, reason: `task status is "${task.lifecycle.status}" (only "active" tasks run)` };
  }
  const cls = task.risk.class;

  if ((profile.unattendedRiskClasses as string[]).includes(cls)) {
    return { allow: true, supervised: false };
  }
  if (profile.supervisedRiskClasses.includes(cls)) {
    if (ctx.ci) return { allow: false, reason: `risk class "${cls}" is supervised-only and this is CI` };
    // Attended-human exception (class c only): a class-c task whose executor resolves to the
    // human lane may be QUEUED as an inspect-only attended interview even without --supervised.
    // Queuing executes nothing — a physically-present human performs it in a recorded browser,
    // bounded by the task's forbiddenActions (which stop short of the irreversible act) and a
    // mandatory review before it can count green. Unattended automation still cannot touch it (the agent
    // lane is capped at risk b), and class d is untouched (never eligible here). See
    // docs/risk-and-safety.md. --supervised still upgrades it to a real supervised execution.
    if (cls === 'c' && laneOf(task) === 'human') {
      return { allow: true, supervised: ctx.supervised, attendedOnly: !ctx.supervised };
    }
    if (!ctx.supervised) {
      return { allow: false, reason: `risk class "${cls}" requires an attended run with --supervised` };
    }
    return { allow: true, supervised: true };
  }
  return {
    allow: false,
    reason: `risk class "${cls}" is not allowed by env profile "${profile.name}"`,
  };
}
