import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { CtrfReport, RunPlan, Task } from '@mc-qa/core';
import { ProgressWriter } from '@mc-qa/core';
import { writeMcpConfig } from './mcp-config.ts';
import { isSoftFail } from './severity.ts';
import { pingCdp, probeCdpPages, readKeeperManifest, type ResolvedKeeper } from './keeper.ts';
import {
  agentAllowedTools,
  AGENT_DISALLOWED_TOOLS,
  KEEPER_UNSAFE_TOOLS,
  systemPromptPath,
  writeAgentSettings,
  writeGuardConfig,
} from './agent-settings.ts';

const DEFAULT_MODEL = process.env.MC_QA_AGENT_MODEL || 'claude-sonnet-5';
// Playwright MCP's own browser (chrome-for-testing) can't download where the Playwright CDN
// is geo-blocked, so drive a system-installed browser via a channel. Windows always has Edge.
const DEFAULT_BROWSER = process.env.MC_QA_AGENT_BROWSER || (process.platform === 'win32' ? 'msedge' : 'chromium');

export interface AgentRunOptions {
  concurrency?: number; // parallel agents, default 3
  budgetUsd?: number; // overall run cap, default 120 (a full 37-task run averages ~$2.2/task ≈ $80)
  perTaskBudgetUsd?: number; // hard per-agent cap, default 4.0 (avg result is ~$2.2; caps a slow/over-exploring task)
  /** Preflight verdict: if explicitly false, auth-preconditioned tasks are blocked (not spent on). */
  sessionValid?: boolean;
  model?: string;
  taskId?: string; // run a single task
  force?: boolean; // re-run even if a valid result already exists
  dryRun?: boolean; // print the plan, spawn nothing
  vision?: boolean; // override Flutter-canvas detection
  /**
   * Injected by the runner (which owns the Playwright/login layer, unreachable from here without a
   * circular package dep): (re)start the Session Keeper and return an attachable endpoint, or null
   * if none can be brought up. Called to self-heal when the manifest's keeper is unreachable OR when
   * its context is poisoned. Pass `{ force: true }` to force a stop+respawn even if the manifest reads
   * running & healthy (the poisoned-context case, where a plain restart would early-out).
   */
  resolveKeeper?: (opts?: { force?: boolean }) => Promise<ResolvedKeeper | null>;
  /** Injected by the runner: reset the shared keeper context (close extra tabs, re-home to baseURL)
   * between serialized auth tasks for hygiene. Returns false when the context could not be reached /
   * re-homed (poisoned) — the caller then force-restarts the keeper before the next attach. */
  resetKeeper?: (cdpEndpoint: string) => Promise<boolean>;
}

export type AgentOutcome =
  | 'result'
  | 'no-result'
  | 'timeout'
  | 'guard-violation'
  | 'driver-error'
  | 'skipped-exists'
  | 'blocked-no-session'
  | 'blocked-keeper-down'
  | 'skipped-budget'
  | 'dry-run';

export interface AgentTaskResult {
  taskId: string;
  outcome: AgentOutcome;
  status?: 'passed' | 'failed';
  costUsd?: number;
  turns?: number;
  denials?: number;
  /** Shared-session (auth/CDP-attach) task that produced NO video — its verdict has no visual proof.
   * The report escalates a passed-but-noVideo task instead of showing a silent "—". */
  noVideo?: boolean;
}

export interface AgentRunSummary {
  results: AgentTaskResult[];
  /** Real measured API spend across all attempts — what the report shows. */
  spentUsd: number;
  /** Conservative surcharge reserved for timeouts that printed no cost — for the budget gate only,
   * NOT money actually spent. Absent on a dry run. */
  reservedUsd?: number;
}

function originsFor(plan: RunPlan): string[] {
  // Default agent origin allowlist derives from the target under test (set MC_QA_AGENT_ORIGIN,
  // or leave empty and let the plan's baseURL origin be added by the caller).
  const set = new Set<string>(process.env.MC_QA_AGENT_ORIGIN ? [process.env.MC_QA_AGENT_ORIGIN] : []);
  try {
    set.add(new URL(plan.baseURL).origin);
  } catch {
    /* baseURL always valid in a built plan */
  }
  return [...set];
}

function needsAuth(task: Task): boolean {
  return (task.procedure.preconditions ?? []).some(
    (p) => p.kind === 'account-state' && /logged.?in/i.test(p.value),
  );
}

/** Keeper-maintained snapshot fallback is only trusted when re-saved this recently by the health loop. */
const SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

type KeeperResolution =
  | { mode: 'cdp'; cdpEndpoint: string; userAgent?: string }
  | { mode: 'snapshot'; storageState: string; userAgent?: string }
  | { mode: 'blocked'; outcome: 'blocked-keeper-down' | 'blocked-no-session' };

/**
 * Resolve how an auth-preconditioned task gets its session, in priority order:
 *  1. Healthy Session Keeper  → ATTACH over CDP (the fix: never re-boots ⇒ never rotates the token away).
 *  2. Self-heal              → ask the runner to (re)start the keeper (a reopen often self-heals), re-ping.
 *  3. Fresh snapshot (<5 min)→ legacy isolated context off the keeper-maintained storageState, pinned UA.
 *  4. Nothing                → blocked-keeper-down (a session existed but is down → re-login) or,
 *                              if there is no evidence of any login at all, blocked-no-session.
 */
async function resolveKeeperForTask(plan: RunPlan, opts: AgentRunOptions): Promise<KeeperResolution> {
  const { serviceDir, envProfile } = plan;
  const sessionFile = path.join(serviceDir, '.session', `${envProfile}.json`);
  let manifest = readKeeperManifest(serviceDir, envProfile);

  // 1. Healthy keeper → CDP attach. `pingCdp` alone is NOT enough: /json/version answers while the
  //    browser has zero page targets (a destructive task killed the tab), and attaching into that
  //    context dies at turn 1. Require `probeCdpPages` too — an actually-attachable page must exist.
  if (manifest?.cdpEndpoint && !manifest.unhealthy && (await pingCdp(manifest.cdpEndpoint))) {
    if (await probeCdpPages(manifest.cdpEndpoint)) {
      return { mode: 'cdp', cdpEndpoint: manifest.cdpEndpoint, userAgent: manifest.userAgent };
    }
    // Reachable but poisoned (no page target). A plain restart would early-out on running&healthy —
    // force a stop+respawn on the same persistent profile, then re-probe.
    if (opts.resolveKeeper) {
      const forced = await opts.resolveKeeper({ force: true }).catch(() => null);
      if (forced?.cdpEndpoint && (await pingCdp(forced.cdpEndpoint)) && (await probeCdpPages(forced.cdpEndpoint))) {
        return { mode: 'cdp', cdpEndpoint: forced.cdpEndpoint, userAgent: forced.userAgent ?? manifest?.userAgent };
      }
      manifest = readKeeperManifest(serviceDir, envProfile) ?? manifest;
    }
  }

  // 2. Self-heal via the injected runner hook (reopen the keeper), then re-check (ping AND page probe).
  if (opts.resolveKeeper) {
    const healed = await opts.resolveKeeper().catch(() => null);
    if (healed?.cdpEndpoint && (await pingCdp(healed.cdpEndpoint)) && (await probeCdpPages(healed.cdpEndpoint))) {
      return { mode: 'cdp', cdpEndpoint: healed.cdpEndpoint, userAgent: healed.userAgent ?? manifest?.userAgent };
    }
    manifest = readKeeperManifest(serviceDir, envProfile) ?? manifest; // a restart may have refreshed the UA
  }

  // 3. Keeper-maintained snapshot, only if the health loop re-saved it very recently.
  if (opts.sessionValid !== false && fs.existsSync(sessionFile)) {
    const ageMs = Date.now() - fs.statSync(sessionFile).mtimeMs;
    if (ageMs < SNAPSHOT_MAX_AGE_MS) {
      return { mode: 'snapshot', storageState: sessionFile, userAgent: manifest?.userAgent };
    }
  }

  // 4. Nothing usable.
  const everLoggedIn = manifest != null || fs.existsSync(sessionFile);
  return { mode: 'blocked', outcome: everLoggedIn ? 'blocked-keeper-down' : 'blocked-no-session' };
}

/**
 * A Flutter/CanvasKit service paints to a <canvas> with no real DOM, so the agent must use
 * coordinate/vision tools (and keep screenshots in context). Detected from agent-context.md.
 */
function detectVision(serviceDir: string): boolean {
  try {
    const ctx = fs.readFileSync(path.join(serviceDir, 'agent-context.md'), 'utf8');
    return /flutter|canvaskit|paints to a canvas/i.test(ctx);
  } catch {
    return false;
  }
}

/** A result is valid if it parses and lists at least one test. */
function readResult(agentDir: string): CtrfReport | null {
  const file = path.join(agentDir, 'result.ctrf.json');
  if (!fs.existsSync(file)) return null;
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as CtrfReport;
    return Array.isArray(r.results?.tests) && r.results.tests.length > 0 ? r : null;
  } catch {
    return null;
  }
}

function countDenials(agentDir: string): number {
  const file = path.join(agentDir, 'guard-log.ndjson');
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
}

function scrubbedEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('MC_QA_')) continue; // never hand QA secrets to the agent process
    out[k] = v;
  }
  return out;
}

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  costUsd?: number;
  turns?: number;
}

function spawnClaudeOnce(
  agentDir: string,
  brief: string,
  args: string[],
  timeoutMs: number,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: agentDir,
      // scrubbedEnv() drops every MC_QA_ secret so the QA env never leaks to the agent process.
      env: scrubbedEnv(),
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // Kill the whole tree — the MCP server and Chromium are children. GRACEFUL first (no /F,
      // SIGTERM) so ffmpeg can flush a playable webm: a hard kill leaves a truncated recording that
      // "looks present" but proves nothing. Force-kill the tree after a short grace as a backstop.
      const pid = child.pid;
      if (process.platform === 'win32' && pid) {
        spawn('taskkill', ['/pid', String(pid), '/T']);
        setTimeout(() => { try { spawn('taskkill', ['/pid', String(pid), '/T', '/F']); } catch { /* gone */ } }, 2500);
      } else {
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
        setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 2500);
      }
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', () => { /* resolved on close */ });
    child.on('close', (code) => {
      clearTimeout(timer);
      let costUsd: number | undefined;
      let turns: number | undefined;
      // --output-format json prints a single JSON object; be lenient about surrounding lines.
      const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
      const parsed =
        tryParse(stdout.trim()) ??
        tryParse(stdout.trim().split('\n').filter(Boolean).at(-1) ?? '');
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.total_cost_usd === 'number') costUsd = parsed.total_cost_usd;
        if (typeof parsed.num_turns === 'number') turns = parsed.num_turns;
      }
      resolve({ code, stdout, stderr, timedOut, costUsd, turns });
    });
    // Feed the brief as the prompt on stdin (avoids the Windows command-line length limit).
    child.stdin?.write(brief);
    child.stdin?.end();
  });
}

async function runOne(
  plan: RunPlan,
  runDir: string,
  task: Task,
  opts: AgentRunOptions,
  vision: boolean,
  budgetRemainingUsd?: number,
): Promise<AgentTaskResult> {
  const agentDir = path.join(runDir, 'agent', task.id);
  const brief = fs.readFileSync(path.join(agentDir, 'brief.md'), 'utf8');

  // Auth-preconditioned tasks attach to the long-lived Session Keeper (a fresh boot would rotate the
  // one-time refresh token away — see keeper.ts). Resolve CDP-attach → self-heal → snapshot → blocked.
  let storageState: string | undefined;
  let cdpEndpoint: string | undefined;
  let userAgent: string | undefined;
  if (needsAuth(task)) {
    const resolved = await resolveKeeperForTask(plan, opts);
    if (resolved.mode === 'cdp') {
      cdpEndpoint = resolved.cdpEndpoint;
      userAgent = resolved.userAgent;
    } else if (resolved.mode === 'snapshot') {
      storageState = resolved.storageState;
      userAgent = resolved.userAgent;
    } else {
      return { taskId: task.id, outcome: resolved.outcome };
    }
  }
  const sharedSession = cdpEndpoint != null; // attached to the keeper's live context

  // Video evidence. The isolated lane films natively (recordVideo in the mcp-pw-config below); the
  // CDP-attach lane can't, so the agent drives browser_start_video/stop_video (DevTools screencast,
  // enabled via --caps devtools). Pre-create video/ (the workspace-relative filename isn't auto-mkdir'd)
  // and prepend a preamble telling the agent to start filming first and stop after writing its result.
  const videoDir = path.join(agentDir, 'video');
  const videoPreamble = sharedSession
    ? `## VIDEO EVIDENCE — MANDATORY, DO THIS FIRST\n` +
      `The video is the PROOF this test was actually performed. Before ANY other action, your VERY\n` +
      `FIRST tool call MUST be \`browser_start_video\` with filename \`video/${task.id}.webm\`. Do not\n` +
      `take a snapshot, navigate, or click before starting the video. Your VERY LAST tool call, AFTER\n` +
      `writing result.ctrf.json, MUST be \`browser_stop_video\`. A task finished without a video is an\n` +
      `unverifiable result and will be flagged — starting the recording is not optional.\n\n`
    : '';
  if (sharedSession) fs.mkdirSync(videoDir, { recursive: true });

  // Per-task harness files. In CDP-attach mode we skip video (Playwright's recordVideo only applies
  // to the isolated newContext path, not an attached context).
  writeMcpConfig(agentDir, {
    autonomous: true,
    browser: DEFAULT_BROWSER,
    outputDir: agentDir,
    storageState,
    cdpEndpoint,
    userAgent,
    vision,
    omitImageResponses: !vision, // DOM service: save tokens; canvas: keep the pixels
    proxyServer: process.env.MC_QA_AGENT_PROXY,
    recordVideoDir: sharedSession ? undefined : path.join(agentDir, 'video'), // full .webm evidence of every agent test
  });
  writeAgentSettings(agentDir);
  writeGuardConfig(agentDir, {
    allowedOrigins: originsFor(plan),
    forbidden: task.risk.forbiddenActions ?? [],
    riskClass: task.risk.class,
  });
  // Clean stale guard log so denial counts are per-run.
  try { fs.rmSync(path.join(agentDir, 'guard-log.ndjson')); } catch { /* none */ }

  // A destructive task (offline/tab-kill) on the shared keeper legitimately needs browser_tabs; it is
  // run LAST in the auth lane and the keeper is force-restarted right after (see runAgentLane). Only
  // browser_close stays hard-denied for it. Non-destructive shared tasks lose both close AND tabs.
  const destructive =
    plan.entries.find((e) => e.taskId === task.id)?.destructive === true ||
    task.automation.destructiveContext === true;
  const keeperUnsafe = destructive ? ['mcp__playwright__browser_close'] : KEEPER_UNSAFE_TOOLS;
  const args = [
    '-p',
    '--output-format', 'json',
    '--max-budget-usd', String(opts.perTaskBudgetUsd ?? 4.0),
    // Model precedence: per-task agentBrief.model (a cheap model for a structural check) → run
    // --model → MC_QA_AGENT_MODEL/default. Per-task wins so judgment tasks can keep the strong model.
    '--model', task.automation.agentBrief?.model ?? opts.model ?? DEFAULT_MODEL,
    '--mcp-config', 'mcp.json',
    '--strict-mcp-config',
    '--settings', 'agent-settings.json',
    '--append-system-prompt-file', systemPromptPath(),
    '--permission-mode', 'default',
    '--allowedTools', ...agentAllowedTools(vision, sharedSession, destructive),
    // In shared-session mode also HARD-deny the keeper-unsafe tools (close / tabs) so the agent can
    // never close the one live logged-in browser — belt-and-suspenders over the allowlist omission.
    '--disallowedTools', ...(sharedSession ? [...AGENT_DISALLOWED_TOOLS, ...keeperUnsafe] : AGENT_DISALLOWED_TOOLS),
  ];

  // Time budget: tighter than before so an over-exploring agent is cut sooner (less wasted spend
  // and wall-time). The per-task USD cap (--max-budget-usd) usually bites first; this is the
  // backstop. floor 4min · cap 20min · ~1.5× the task's declared timeoutSec.
  const timeoutMs = Math.min(1_200_000, Math.max(240_000, (task.schedule.timeoutSec ?? 120) * 1500));

  const attempts: Array<{ code: number | null; timedOut: boolean; costUsd?: number; turns?: number }> = [];
  const runAttempt = async () => {
    const r = await spawnClaudeOnce(agentDir, videoPreamble + brief, args, timeoutMs);
    attempts.push({ code: r.code, timedOut: r.timedOut, costUsd: r.costUsd, turns: r.turns });
    return r;
  };
  let res = await runAttempt();
  let report = readResult(agentDir);

  // Retry ONCE for a driver-level failure, or a timeout that left NO partial result — never to
  // re-roll a genuine failed verdict, and only if budget headroom remains.
  const driverFailed = !report && !res.timedOut && (res.code ?? 1) !== 0;
  const emptyTimeout = res.timedOut && !report; // timed out having written no incremental result
  const perTaskCap = opts.perTaskBudgetUsd ?? 4;
  const headroom = budgetRemainingUsd == null || budgetRemainingUsd >= perTaskCap;
  if ((driverFailed || emptyTimeout) && headroom) {
    // A keeper-attached task may have died on a poisoned/moved context — force-heal first (the port
    // is stable, so the mcp.json cdpEndpoint stays valid across the same-profile restart); if the
    // keeper can't be brought back, skip the retry rather than burn a doomed second attempt.
    let canRetry = true;
    if (sharedSession) {
      const healed = await opts.resolveKeeper?.({ force: true }).catch(() => null);
      canRetry = healed != null;
    }
    if (canRetry) {
      res = await runAttempt();
      report = readResult(agentDir);
    }
  }

  // Accounting: charge the SUM across attempts (the old code overwrote attempt 1's cost with the
  // retry's, silently dropping partial spend — e.g. a $1.85 first attempt read as $0). `cost` is a
  // number for driver-meta; the RESULT keeps costUsd UNDEFINED when no attempt reported a cost (a
  // hard-killed timeout prints none) so the lane reserves the per-task cap for it instead of $0.
  const cost = attempts.reduce((s, a) => s + (a.costUsd ?? 0), 0);
  const measuredCost = attempts.some((a) => a.costUsd != null) ? cost : undefined;
  fs.writeFileSync(
    path.join(agentDir, 'driver-meta.json'),
    JSON.stringify(
      { code: res.code, timedOut: res.timedOut, costUsd: cost, turns: res.turns, retried: attempts.length > 1, attempts, stderrTail: res.stderr.slice(-500) },
      null, 2,
    ),
  );

  // Sweep any stray .webm the agent left at the task-dir root (it omitted the filename, or the MCP
  // Context.dispose auto-finalized one) into video/ so the report's <taskId>/video/*.webm discovery
  // finds it. The isolated lane already writes straight into video/.
  if (sharedSession) {
    try {
      for (const f of fs.readdirSync(agentDir)) {
        if (f.toLowerCase().endsWith('.webm')) fs.renameSync(path.join(agentDir, f), path.join(videoDir, f));
      }
    } catch { /* best effort */ }
  }

  const denials = countDenials(agentDir);

  // PROOF INTEGRITY (C1): an authenticated (CDP-attach) task's ONLY video comes from the agent
  // calling browser_start_video. If it finished without one, the verdict has no visual proof — flag
  // it so a "passed" row can never silently claim "tested OK" with no evidence. Unauth tasks film
  // automatically (recordVideo), so this only guards the fragile shared-session lane.
  const hasVideo = fs.existsSync(videoDir) && fs.readdirSync(videoDir).some((f) => f.toLowerCase().endsWith('.webm'));
  const noVideo = sharedSession && !hasVideo;

  let result: AgentTaskResult;
  if (denials >= 4) {
    result = { taskId: task.id, outcome: 'guard-violation', status: 'failed', costUsd: measuredCost, turns: res.turns, denials, noVideo };
  } else if (report) {
    // Mirror ingest's severity model so the live board and the committed status agree: a
    // should-pass/informational `failed` is a soft warning, not a task failure. Only a HARD
    // (must-pass, or unresolved) failed flips the task to failed.
    const rubric = task.automation.agentBrief?.successRubric ?? [];
    const failed = report.results.tests.some((t) => t.status === 'failed' && !isSoftFail(t, rubric));
    result = { taskId: task.id, outcome: 'result', status: failed ? 'failed' : 'passed', costUsd: measuredCost, turns: res.turns, denials, noVideo };
  } else if (res.timedOut) {
    result = { taskId: task.id, outcome: 'timeout', costUsd: measuredCost, turns: res.turns, denials, noVideo };
  } else {
    result = { taskId: task.id, outcome: (res.code ?? 1) !== 0 ? 'driver-error' : 'no-result', costUsd: measuredCost, turns: res.turns, denials, noVideo };
  }
  return result;
}

/**
 * Autonomous agent lane: drive each briefed agent task through a headless Claude Code
 * session (Playwright MCP), bounded by concurrency + per-task and overall USD budgets, and
 * write result.ctrf.json per task. The caller then runs the normal ingest + finalize so the
 * merged CTRF / status file stay the single source of truth.
 */
export async function runAgentLane(
  plan: RunPlan,
  runDir: string,
  opts: AgentRunOptions = {},
  progress?: ProgressWriter,
): Promise<AgentRunSummary> {
  const agentIds = plan.entries.filter((e) => e.lane === 'agent').map((e) => e.taskId);
  const targets = (opts.taskId ? agentIds.filter((id) => id === opts.taskId) : agentIds).filter(
    (id) => fs.existsSync(path.join(runDir, 'agent', id, 'brief.md')),
  );
  const vision = opts.vision ?? detectVision(plan.serviceDir);
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const budget = opts.budgetUsd ?? 120;
  const perTask = opts.perTaskBudgetUsd ?? 4;
  const results: AgentTaskResult[] = [];
  // Two distinct meanings of "spent", kept separate for honest reporting: `measuredUsd` is real API
  // spend (summed across attempts), `reservedUsd` is a conservative surcharge for timeouts that
  // printed no cost. The budget GATE uses the combined total (don't over-run); the report shows only
  // measuredUsd (a reserve isn't money actually spent) with the reserve noted alongside.
  let measuredUsd = 0;
  let reservedUsd = 0;

  if (opts.dryRun) {
    return { results: targets.map((id) => ({ taskId: id, outcome: 'dry-run' as const })), spentUsd: 0 };
  }

  const processOne = async (id: string): Promise<void> => {
    const task = plan.tasks[id];
    const agentDir = path.join(runDir, 'agent', id);
    if (!opts.force && readResult(agentDir)) { results.push({ taskId: id, outcome: 'skipped-exists' }); return; }
    if (measuredUsd + reservedUsd >= budget) { results.push({ taskId: id, outcome: 'skipped-budget' }); return; }

    progress?.emit({ event: 'agent-start', taskId: id });
    const r = await runOne(plan, runDir, task, opts, vision, budget - (measuredUsd + reservedUsd));
    // Charge measured cost where the process reported one; otherwise reserve the per-task cap for a
    // timeout (a killed process never prints its cost) so the budget gate stays conservative.
    if (r.costUsd != null) measuredUsd += r.costUsd;
    else if (r.outcome === 'timeout') reservedUsd += perTask;
    results.push(r);
    if (r.outcome !== 'dry-run') progress?.emit({ event: 'agent-finish', taskId: id, outcome: r.outcome, costUsd: r.costUsd, turns: r.turns });
    // `interim: true` — this live per-task verdict is re-emitted authoritatively after finalize
    // (cli.ts). The board dedupes by taskId, but any consumer that COUNTS events must ignore interim
    // ones or it double-counts (the source of the phantom "46/14" tally).
    if (r.status) progress?.emit({ event: 'task-finish', taskId: id, status: r.status, verdictBy: 'agent', interim: true });
  };

  // Partition the queue by auth. Auth tasks share ONE keeper context, so they must be SERIALIZED
  // (concurrency 1): parallel boots race the one-time refresh token, and two MCP clients on one
  // shared context stomp each other's tab list. Unauth tasks are independent isolated contexts and
  // keep the normal concurrency. The two lanes can overlap — unauth work never touches the keeper.
  const isDestructive = (id: string): boolean =>
    plan.entries.find((e) => e.taskId === id)?.destructive === true ||
    plan.tasks[id]?.automation.destructiveContext === true;

  const authTargets = targets.filter((id) => needsAuth(plan.tasks[id]));
  const unauthTargets = targets.filter((id) => !needsAuth(plan.tasks[id]));
  // Run destructive auth tasks (offline/tab-kill) LAST so they can't poison the shared keeper context
  // for the tasks queued behind them — the exact cause of the 6-task driver-error cascade.
  const authOrdered = [...authTargets.filter((id) => !isDestructive(id)), ...authTargets.filter(isDestructive)];

  let ui = 0;
  const unauthWorker = async () => {
    for (;;) {
      const i = ui++;
      if (i >= unauthTargets.length) break;
      await processOne(unauthTargets[i]);
    }
  };
  const unauthPool = Array.from({ length: Math.min(concurrency, unauthTargets.length) }, unauthWorker);

  const authSerial = (async () => {
    for (let i = 0; i < authOrdered.length; i++) {
      const id = authOrdered[i];
      await processOne(id);
      if (i >= authOrdered.length - 1) break; // nothing queued behind the last task
      if (isDestructive(id)) {
        // This task deliberately broke the shared context — force a keeper restart (same persistent
        // profile, token chain intact) before the next attach, instead of a doomed hygiene reset.
        await opts.resolveKeeper?.({ force: true }).catch(() => null);
      } else if (opts.resetKeeper) {
        // Hygiene: close extra tabs + re-home. If that reports the context is poisoned (returns
        // false), force-restart too rather than let the next task attach into a dead context.
        const m = readKeeperManifest(plan.serviceDir, plan.envProfile);
        const clean = m?.cdpEndpoint ? await opts.resetKeeper(m.cdpEndpoint).catch(() => false) : true;
        if (!clean) await opts.resolveKeeper?.({ force: true }).catch(() => null);
      }
    }
  })();

  await Promise.all([...unauthPool, authSerial]);
  // Persist per-task outcomes so the report can show timed-out/blocked/no-result tasks that
  // never produced a CTRF entry (otherwise they silently vanish from the report).
  try {
    fs.mkdirSync(path.join(runDir, 'agent'), { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'agent', 'summary.json'),
      JSON.stringify({ spentUsd: measuredUsd, timeoutReservedUsd: reservedUsd, results }, null, 2),
    );
  } catch { /* best effort */ }
  return { results, spentUsd: measuredUsd, reservedUsd };
}
