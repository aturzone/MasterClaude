#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  allSelectorKeys,
  loadChecklist,
  loadEnvProfile,
  loadServiceConfig,
  loadTasks,
  loadTaxonomy,
  missingEnvVars,
  resolveBaseURL,
  resolveServiceDir,
  validateTasks,
  ProgressWriter,
  type Lang,
  type RunPlan,
} from '@mc-qa/core';
import { verifySelectors } from '@mc-qa/selector-memory';
import { ingestAgentResults, runAgentLane, type AgentRunOptions } from '@mc-qa/agent-bridge';
import {
  computeReleaseVerdict,
  generateRunReport,
  interviewToCtrf,
  mergeRun,
  observatoryToCtrf,
  regenerateChecklistMd,
  renderDashboard,
  testsslToCtrf,
  updateStatus,
  type InterviewAnswerSet,
  type ReleaseVerdict,
} from '@mc-qa/reporting';
import { buildPlan } from './plan.ts';
import { dispatchScriptLane } from './dispatch-script.ts';
import { dispatchCliLane } from './dispatch-cli.ts';
import { dispatchAgentLane } from './dispatch-agent.ts';
import { dispatchHumanLane } from './dispatch-human.ts';
import { runInlineInterview } from './interview.ts';
import { scaffoldFinding, scaffoldService, scaffoldTask } from './scaffold.ts';
import { interactiveLogin, scriptedLogin, headedBotLogin } from './login.ts';
import { attendedHostSession } from './attend.ts';
import { preflightSession } from './session-preflight.ts';
import { keeperStatus, resetSharedContext, startKeeper, stopKeeper } from './session-keeper.ts';

const HELP = `SKULL QA — black-box QA runner (git-native task files, three executor lanes)

Usage: pnpm qa <command> [options]

Commands
  validate | lint   --service <s>                      validate all task files + checklist
  coverage          --service <s>                      show taxonomy categories with no tasks
  login             --service <s> [--env <profile>]     log in once (headed, you type creds) → save session
  session           start|status|stop --service <s> [--env <profile>]
                    manage the long-lived Session Keeper (logged-in browser agent tasks attach to)
  run               --service <s> [--env <profile>] [--section <id>] [--tags a,b]
                    [--risk a,b] [--executor script,agent] [--task <id>]
                    [--authenticated] [--headed] [--interactive] [--supervised] [--docker]
                    [--allow-host-visual] [--update-baselines] [--workers N]
                    [--agents]   also drive the agent lane autonomously (headless Claude)
  agent-run         --run <runId> [--task <id>] [--concurrency N] [--budget X]
                    [--per-task-budget X] [--model <m>] [--force] [--dry-run]
                    drive briefed agent tasks through headless Claude + Playwright MCP
  ingest            --service <s> --run <runId>        pull agent/human results into a run
  interview         --service <s> --run <runId> [--task <id>]   walk queued interviews now
  checklist         --service <s>                      regenerate checklist.md
  dashboard         --service <s>                      static coverage dashboard
  verify-selectors  --service <s> [--env <profile>]    nightly selector re-verification
  task new          --service <s> --category <cat> --slug <slug> [--owner <email>]
  finding new       --service <s> --slug <slug> [--task <id>] [--run <runId>]
  scaffold-service  <name> --url <baseURL>             new apps/<name> from the template

Safety: class-d (irreversible / real-world side effect) tasks never run unattended;
supervised runs require --supervised plus a typed CONFIRM per task, never in CI.
See docs/risk-and-safety.md.`;

function loadDotEnv(root: string): void {
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* older node — ignore */
    }
  }
}

async function main(): Promise<number> {
  const root = process.cwd();
  loadDotEnv(root);

  const { values: v, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      service: { type: 'string' },
      env: { type: 'string' },
      section: { type: 'string' },
      tags: { type: 'string' },
      risk: { type: 'string' },
      executor: { type: 'string' },
      task: { type: 'string' },
      run: { type: 'string' },
      category: { type: 'string' },
      slug: { type: 'string' },
      owner: { type: 'string' },
      url: { type: 'string' },
      'wait-signal': { type: 'string' },
      'signal-file': { type: 'string' },
      'marks-file': { type: 'string' },
      'timeout-min': { type: 'string' },
      'save-session': { type: 'boolean', default: false },
      'budget-mb': { type: 'string' },
      'no-videos': { type: 'boolean', default: false },
      lang: { type: 'string' },
      workers: { type: 'string' },
      concurrency: { type: 'string' },
      budget: { type: 'string' },
      'per-task-budget': { type: 'string' },
      model: { type: 'string' },
      supervised: { type: 'boolean', default: false },
      authenticated: { type: 'boolean', default: false },
      agents: { type: 'boolean', default: false },
      scripted: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      interactive: { type: 'boolean', default: false },
      docker: { type: 'boolean', default: false },
      'allow-host-visual': { type: 'boolean', default: false },
      'update-baselines': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  const command = positionals[0];
  if (v.help) {
    console.log(HELP);
    return 0;
  }
  if (!command) {
    console.log(HELP);
    return 1;
  }

  const needService = ['validate', 'lint', 'coverage', 'run', 'checklist', 'dashboard', 'verify-selectors', 'ingest', 'interview', 'preflight', 'session'];
  if (needService.includes(command) && !v.service) {
    console.error(`--service is required for "${command}"`);
    return 1;
  }
  const serviceDir = v.service ? await resolveServiceDir(root, v.service).catch((e: Error) => {
    console.error(e.message);
    return '';
  }) : '';
  if (v.service && !serviceDir) return 1;

  switch (command) {
    case 'lint':
    case 'validate': {
      const cfg = await loadServiceConfig(serviceDir);
      const result = validateTasks(
        serviceDir, cfg, loadTasks(serviceDir), loadTaxonomy(), allSelectorKeys(serviceDir), loadChecklist(serviceDir),
      );
      for (const w of result.warnings) console.warn(`  warn  ${w.file}: ${w.message}`);
      for (const e of result.errors) console.error(`  ERROR ${e.file}: ${e.message}`);
      console.log(
        `\n${result.errors.length} error(s), ${result.warnings.length} warning(s) across ${loadTasks(serviceDir).length} task file(s).`,
      );
      return result.errors.length > 0 ? 1 : 0;
    }

    case 'coverage': {
      const taxonomy = loadTaxonomy();
      const active = loadTasks(serviceDir).map((l) => l.task).filter((t) => t.lifecycle.status === 'active');
      const covered = new Set(active.map((t) => t.classification.category));
      const empty = Object.keys(taxonomy).filter((c) => !covered.has(c)).sort();
      console.log(`Active tasks: ${active.length} · categories covered: ${covered.size}/${Object.keys(taxonomy).length}\n`);
      if (empty.length === 0) console.log('Every taxonomy category has at least one active task 🎉');
      else {
        console.log('EMPTY categories (no active task yet):');
        for (const c of empty) console.log(`  ${c.padEnd(28)} ${taxonomy[c].title}`);
      }
      return 0;
    }

    case 'run': {
      if (v.docker) return runInDocker(root);
      const { plan, profile, runDir } = await buildPlan(root, {
        service: v.service!,
        env: v.env,
        section: v.section,
        tags: v.tags?.split(',').map((s) => s.trim()),
        risk: v.risk?.split(',').map((s) => s.trim()),
        executor: v.executor?.split(',').map((s) => s.trim()),
        taskId: v.task,
        supervised: v.supervised,
      });

      const progress = new ProgressWriter(plan.runId, runDir);
      progress.emit({
        event: 'run-start',
        service: plan.service,
        env: plan.envProfile,
        planned: plan.entries.map((e) => e.taskId),
        refused: plan.refused,
      });
      // Machine-stable line an orchestrator / watcher reads to attach to this run.
      console.log(`::runId::${plan.runId}`);

      console.log(`\nrun ${plan.runId}`);
      console.log(`  env ${plan.envProfile} → ${plan.baseURL}`);
      console.log(`  planned: ${plan.entries.length} task(s) — ` +
        (['script', 'cli', 'agent', 'human'] as const)
          .map((l) => `${l}:${plan.entries.filter((e) => e.lane === l).length}`)
          .join(' '));
      for (const r of plan.refused) console.log(`  ⛔ refused ${r.taskId} — ${r.reason}`);

      const missing = missingEnvVars(profile);
      if (missing.length > 0) {
        console.warn(`  ⚠ unset env vars for this profile: ${missing.join(', ')} — auth/secret-dependent tasks will fail (see .env.example)`);
      }

      if (profile.headedOnly && !v.headed) {
        console.error(`\nprofile "${profile.name}" is headedOnly — pass --headed`);
        return 1;
      }
      if (plan.ci && profile.ciAllowed === false) {
        console.error(`\nprofile "${profile.name}" is not allowed in CI`);
        return 1;
      }

      // Layer-1.5: typed confirmation per supervised task, supervisor stamped into the plan.
      const supervisedEntries = plan.entries.filter((e) => e.supervised);
      if (supervisedEntries.length > 0) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const who = spawnSync('git', ['config', 'user.email'], { encoding: 'utf8' }).stdout?.trim() || 'unknown';
        console.log(`\n⚠ SUPERVISED tasks (confirmed by ${who}):`);
        for (const e of supervisedEntries) {
          const t = plan.tasks[e.taskId];
          console.log(`  ${e.taskId} — risk ${t.risk.class}`);
          const answer = await rl.question(`  type "CONFIRM ${e.taskId}" to proceed (anything else aborts): `);
          if (answer.trim() !== `CONFIRM ${e.taskId}`) {
            rl.close();
            console.error('aborted — nothing was run');
            return 1;
          }
        }
        rl.close();
        (plan.filters as Record<string, unknown>).supervisor = who;
        fs.writeFileSync(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2));
      }

      // Brief the agent tasks first (fast — just writes brief.md/mcp.json per task).
      const briefed = dispatchAgentLane(plan, runDir);

      // Drive the autonomous agent lane FIRST — BEFORE the multi-minute script + CLI lanes —
      // so it uses the freshly-saved login session while the token is still alive. the target app's
      // auth token expires within minutes; running agents last (the old order) meant the token
      // was always dead by the time the preflight ran, so every authenticated agent task hit
      // blocked-no-session and got dumped into the human lane. Fresh token ⇒ they actually run.
      if (v.agents && briefed.length > 0) {
        console.log(`\n🤖 agent lane: driving ${briefed.length} briefed task(s) autonomously…`);
        const agentOpts = agentOptsFromArgs(v);
        attachKeeperHooks(agentOpts, plan);
        await ensureKeeperWarm(plan);
        const pf = await preflightSession(plan.serviceDir, plan.envProfile);
        agentOpts.sessionValid = pf.valid;
        console.log(`  🔐 session preflight: ${pf.valid ? '✅ authenticated' : '⚠️  ' + pf.reason + ' → authenticated tasks will be blocked (no spend)'}`);
        const sum = await runAgentLane(plan, runDir, agentOpts, progress);
        ingestAgentResults(plan, runDir);
        console.log(`  agent lane done — $${sum.spentUsd.toFixed(2)} across ${sum.results.length} task(s): ` +
          summarizeAgentOutcomes(sum.results));
      }

      // Then the script, CLI and human lanes (their order doesn't touch the auth session).
      let scriptExit = 0;
      if (plan.entries.some((e) => e.lane === 'script')) {
        scriptExit = dispatchScriptLane(root, plan, runDir, {
          headed: v.headed,
          allowHostVisual: v['allow-host-visual'],
          updateBaselines: v['update-baselines'],
          workers: v.workers ? Number(v.workers) : undefined,
          authenticated: v.authenticated,
        });
      }
      const cliFailures = dispatchCliLane(root, plan, runDir);
      const human = await dispatchHumanLane(plan, runDir, {
        interactive: v.interactive && !plan.ci && process.stdin.isTTY === true,
      });

      const merged = mergeRun(runDir);
      const statusFile = updateStatus(plan, merged);
      const checklist = loadChecklist(plan.serviceDir);
      if (checklist) {
        regenerateChecklistMd(plan.serviceDir, checklist, new Map(Object.entries(plan.tasks)));
      }
      const verdict = checklist
        ? computeReleaseVerdict(checklist, statusFile, { plannedTaskIds: plan.entries.map((e) => e.taskId) })
        : null;

      // Progress events for the live status board (per-task from the just-written status file).
      for (const id of briefed) progress.emit({ event: 'agent-briefed', taskId: id, briefPath: path.join(runDir, 'agent', id, 'brief.md') });
      for (const id of human.queued) progress.emit({ event: 'human-queued', taskId: id });
      for (const [taskId, rec] of Object.entries(statusFile.tasks)) {
        if (rec.runId !== plan.runId) continue;
        progress.emit({ event: 'task-finish', taskId, status: rec.status, durationMs: rec.durationMs, verdictBy: rec.verdictBy });
      }
      if (verdict) progress.emit({ event: 'verdict', release: verdict.release, failedGateSections: verdict.failedGateSections, outstanding: outstandingCounts(verdict) });
      progress.emit({
        event: 'run-finish',
        summary: {
          passed: merged.results.summary.passed,
          failed: merged.results.summary.failed,
          skipped: merged.results.summary.skipped,
          pending: merged.results.summary.pending,
        },
      });

      const s = merged.results.summary;
      console.log(`\n━━━ ${plan.runId} ━━━`);
      console.log(`  ${s.passed} passed · ${s.failed} failed · ${s.skipped} skipped · ${s.pending} pending · ${plan.refused.length} refused`);
      if (verdict) {
        const o = verdict.outstanding;
        const releaseLabel =
          verdict.release === 'pass'
            ? '✅ PASS'
            : verdict.release === 'fail'
              ? '❌ FAIL'
              : `⏳ INCOMPLETE — ${o.needsHuman.length} interview(s), ${o.pendingReview.length} review(s) outstanding` +
                (o.blocked.length ? `, ${o.blocked.length} blocked` : '');
        console.log(
          `  release gate: ${releaseLabel}` +
            (verdict.failedGateSections.length
              ? ` — blocking: ${verdict.failedGateSections.map((f) => `${f.section} (${f.tasks.join(', ')})`).join('; ')}`
              : '') +
            (verdict.nonGatingFailures.length ? ` · non-gating failures: ${verdict.nonGatingFailures.join(', ')}` : ''),
        );
      }
      if (briefed.length > 0) {
        console.log(`\n  🤖 agent briefs emitted — drive each with a Claude session, then \`pnpm qa ingest --service ${plan.service} --run ${plan.runId}\`:`);
        for (const id of briefed) console.log(`     ${path.join(runDir, 'agent', id, 'brief.md')}`);
      }
      if (human.queued.length > 0) {
        console.log(`\n  🙋 human tasks queued — open form.html per task or run \`pnpm qa interview --service ${plan.service} --run ${plan.runId}\`:`);
        for (const id of human.queued) console.log(`     ${path.join(runDir, 'human', id, 'interview.md')}`);
      }
      console.log(`\n  Playwright report: ${path.join(runDir, 'script', 'playwright-report', 'index.html')}`);
      console.log(`  merged CTRF:       ${path.join(runDir, 'merged.ctrf.json')}\n`);
      // Exit follows the release gate: a failed task in a gate section (any lane — script,
      // cli or human, all recorded in the status file) fails the run; non-gate failures are
      // surfaced but do not block. With no checklist, any failure fails the run.
      void cliFailures;
      void human.failures;
      const gateFailed = verdict ? verdict.release === 'fail' : s.failed > 0 || cliFailures > 0 || human.failures > 0;
      return gateFailed ? 1 : 0;
    }

    case 'ingest': {
      const { plan, runDir } = loadRun(root, v.run);
      const result = ingestAgentResults(plan, runDir);
      for (const p of result.problems) console.warn(`  warn ${p}`);
      console.log(`  agent results ingested: ${result.tasksIngested.join(', ') || '(none)'}`);
      if (result.selectorMerge) {
        console.log(`  selectors: +${result.selectorMerge.added.length} learned, ${result.selectorMerge.healed.length} healed, ${result.selectorMerge.skipped.length} skipped`);
      }
      // security sidecar outputs (Docker profiles) → CTRF. Look in the run dir and the
      // compose default (results/sidecars/).
      for (const base of [path.join(runDir, 'sidecars'), path.join(root, 'results', 'sidecars')]) {
        const tf = path.join(base, 'testssl.json');
        if (fs.existsSync(tf)) {
          fs.writeFileSync(path.join(runDir, 'ctrf', 'sidecar-testssl.json'), JSON.stringify(testsslToCtrf(fs.readFileSync(tf, 'utf8')), null, 2));
          console.log('  sidecar ingested: testssl');
        }
        const of = path.join(base, 'observatory.json');
        if (fs.existsSync(of)) {
          fs.writeFileSync(path.join(runDir, 'ctrf', 'sidecar-observatory.json'), JSON.stringify(observatoryToCtrf(fs.readFileSync(of, 'utf8')), null, 2));
          console.log('  sidecar ingested: observatory');
        }
      }

      // human results dropped as human/<taskId>/result.json
      const humanRoot = path.join(runDir, 'human');
      if (fs.existsSync(humanRoot)) {
        for (const taskId of fs.readdirSync(humanRoot)) {
          const file = path.join(humanRoot, taskId, 'result.json');
          if (!fs.existsSync(file) || !plan.tasks[taskId]) continue;
          const answers = JSON.parse(fs.readFileSync(file, 'utf8')) as InterviewAnswerSet;
          const report = interviewToCtrf(plan.tasks[taskId], answers);
          fs.writeFileSync(path.join(runDir, 'ctrf', `human-${taskId}.json`), JSON.stringify(report, null, 2));
          console.log(`  human result ingested: ${taskId} → ${report.results.tests[0].status}`);
        }
      }
      finalizeRun(plan, runDir);
      return 0;
    }

    case 'agent-run': {
      if (!v.run) { console.error('--run <runId> is required for agent-run'); return 1; }
      const { plan, runDir } = loadRun(root, v.run);
      const progress = new ProgressWriter(plan.runId, runDir);
      console.log(`agent-run ${plan.runId}${v.task ? ` · task ${v.task}` : ''}${v['dry-run'] ? ' · dry-run' : ''}`);
      const agentRunOpts = agentOptsFromArgs(v);
      if (!v['dry-run']) {
        attachKeeperHooks(agentRunOpts, plan);
        await ensureKeeperWarm(plan);
        const pf = await preflightSession(plan.serviceDir, plan.envProfile);
        agentRunOpts.sessionValid = pf.valid;
        console.log(`🔐 session preflight: ${pf.valid ? '✅ authenticated' : '⚠️  ' + pf.reason + ' → authenticated tasks blocked'}`);
      }
      const sum = await runAgentLane(plan, runDir, agentRunOpts, progress);
      if (v['dry-run']) {
        console.log(`  would drive ${sum.results.length} agent task(s):\n    ${sum.results.map((r) => r.taskId).join('\n    ')}`);
        return 0;
      }
      const ing = ingestAgentResults(plan, runDir);
      for (const p of ing.problems) console.warn(`  warn ${p}`);
      finalizeRun(plan, runDir);
      console.log(`\n━━━ agent-run ${plan.runId} ━━━`);
      console.log(`  $${sum.spentUsd.toFixed(2)} spent across ${sum.results.length} task(s): ${summarizeAgentOutcomes(sum.results)}`);
      console.log(`  ingested: ${ing.tasksIngested.length} · merged CTRF: ${path.join(runDir, 'merged.ctrf.json')}`);
      return sum.results.some((r) => r.status === 'failed' || r.outcome === 'guard-violation') ? 1 : 0;
    }

    case 'report': {
      if (!v.run) { console.error('--run <runId> is required for report'); return 1; }
      const { plan, runDir } = loadRun(root, v.run);
      // Report language: English is the built-in default. `--lang` / MC_QA_LANG are reserved for
      // projects that add extra locales to the i18n catalog.
      const lang: Lang = 'en';
      const r = generateRunReport(plan, runDir, {
        budgetMb: v['budget-mb'] ? Number(v['budget-mb']) : undefined,
        videos: !v['no-videos'],
        lang,
      });
      console.log(`\nreport → ${r.reportDir}`);
      console.log(`  report.md · report.html · summary.json`);
      if (r.zipParts.length) console.log(`  video zips: ${r.zipParts.length} part(s)`);
      // Loud foot-gun warning: recordings exist but --no-videos withheld them from the report.
      if (v['no-videos'] && r.videosFound > 0) {
        console.warn(`  ⚠ ${r.videosFound} video(s) found on disk but NOT shipped (--no-videos) — re-run 'pnpm qa report --run ${v.run}' to include them.`);
      }
      return 0;
    }

    case 'interview': {
      const { plan, runDir } = loadRun(root, v.run);
      const queueFile = path.join(runDir, 'human-queue.json');
      const queued: string[] = fs.existsSync(queueFile)
        ? (JSON.parse(fs.readFileSync(queueFile, 'utf8')) as { tasks: string[] }).tasks
        : plan.entries.filter((e) => e.lane === 'human').map((e) => e.taskId);
      const targets = v.task ? queued.filter((t) => t === v.task) : queued;
      if (targets.length === 0) {
        console.log('no queued human tasks in this run');
        return 0;
      }
      const total = targets.reduce((sum, id) => sum + (plan.tasks[id]?.humanInterview?.estimatedMinutes ?? 0), 0);
      console.log(`${targets.length} interview(s), ~${total} min total\n`);
      let failures = 0;
      for (const id of targets) {
        const verdict = await runInlineInterview(plan.tasks[id], path.join(runDir, 'human', id), path.join(runDir, 'ctrf'));
        if (verdict === 'failed') failures++;
      }
      finalizeRun(plan, runDir);
      return failures > 0 ? 1 : 0;
    }

    case 'checklist': {
      const checklist = loadChecklist(serviceDir);
      if (!checklist) {
        console.error('no checklist.json for this service');
        return 1;
      }
      const tasks = new Map(loadTasks(serviceDir).map((l) => [l.task.id, l.task]));
      regenerateChecklistMd(serviceDir, checklist, tasks);
      console.log(`regenerated ${path.join(serviceDir, 'checklist.md')}`);
      return 0;
    }

    case 'dashboard': {
      const tasks = loadTasks(serviceDir).map((l) => l.task);
      const out = path.join(root, 'results', 'dashboard', `${v.service}.html`);
      renderDashboard(v.service!, serviceDir, tasks, loadTaxonomy(), out);
      console.log(`dashboard: ${out}`);
      return 0;
    }

    case 'verify-selectors': {
      const cfg = await loadServiceConfig(serviceDir);
      const profile = loadEnvProfile(serviceDir, v.env ?? cfg.defaultEnv);
      const report = await verifySelectors(serviceDir, resolveBaseURL(profile));
      console.log(`verified: ${report.verified.length} · stale: ${report.stale.length} · low-stability(<0.6): ${report.lowStability.length} · pages skipped (auth/no path): ${report.skippedPages.join(', ') || 'none'}`);
      for (const k of report.stale) console.log(`  STALE ${k}`);
      for (const k of report.lowStability) console.log(`  LOW-STABILITY ${k}`);
      return report.stale.length > 0 ? 1 : 0;
    }

    case 'task': {
      if (positionals[1] !== 'new') {
        console.error('usage: pnpm qa task new --service <s> --category <cat> --slug <slug>');
        return 1;
      }
      if (!v.service || !v.category || !v.slug) {
        console.error('--service, --category and --slug are required');
        return 1;
      }
      const file = scaffoldTask(serviceDir, v.service, v.category, v.slug, v.owner ?? 'qa@example.com');
      console.log(`created ${file} (status: draft — fill the TODOs, then \`pnpm qa validate\`)`);
      return 0;
    }

    case 'login': {
      if (!v.service) {
        console.error('usage: pnpm qa login --service <s> [--env <profile>] [--scripted | --wait-signal <file>]');
        return 1;
      }
      if (v['wait-signal']) {
        // Bot-triggered manual login: headed browser, user logs in, saved when the signal file appears.
        const file = await headedBotLogin(root, v.service, v.env, { signalFile: v['wait-signal'] as string });
        console.log(`\nSaved authenticated session → ${file}`);
        return 0;
      }
      if (v.scripted) {
        // Non-interactive: phone+password from .env (2FA-off test account). Password never logged.
        const file = await scriptedLogin(root, v.service, v.env);
        console.log(`\nSaved authenticated session → ${file}`);
        return 0;
      }
      await interactiveLogin(root, v.service, v.env);
      return 0;
    }

    case 'preflight': {
      // Is the saved session ACTUALLY authenticated right now? (~10s, $0.) An orchestrator can spawn
      // this to decide whether to prompt a fresh login — an app's token can die in minutes, so file age lies.
      const cfg = await loadServiceConfig(serviceDir!);
      const envName = v.env ?? cfg.defaultEnv;
      const pf = await preflightSession(serviceDir!, envName);
      console.log(pf.valid ? '::preflight::valid' : `::preflight::invalid::${pf.reason}`);
      return pf.valid ? 0 : 1;
    }

    case 'session': {
      // Manage the long-lived Session Keeper: the ONE logged-in browser agent tasks attach to over
      // CDP (instead of booting fresh snapshot contexts, which rotate the target app's one-time refresh
      // token away). See packages/runner/src/session-keeper.ts.
      const sub = positionals[1];
      const cfg = await loadServiceConfig(serviceDir);
      const envName = v.env ?? cfg.defaultEnv;
      if (sub === 'start') {
        // Short-circuit when nobody has logged in via the persistent-profile flow — starting a keeper
        // on an empty profile would just launch a logged-OUT browser. Direct the owner to log in.
        const pre = await keeperStatus(serviceDir, envName);
        if (!pre.everStarted) {
          console.log(`no keeper: no login yet — run \`pnpm qa login --service ${v.service}\` first`);
          return 1;
        }
        const st = await startKeeper(serviceDir, envName);
        if (!st.running) {
          console.log('keeper failed to start — check the persistent profile is intact');
          return 1;
        }
        console.log(`keeper ${st.healthy ? 'healthy' : 'UP but session NOT authenticated — re-login'} → ${st.cdpEndpoint} (UA ${st.userAgent ? 'pinned' : 'native'})`);
        return st.healthy ? 0 : 1;
      }
      if (sub === 'status') {
        const st = await keeperStatus(serviceDir, envName);
        if (!st.running) {
          console.log(st.everStarted
            ? 'no keeper running (persistent profile exists — `pnpm qa session start`)'
            : 'no keeper (never logged in on this service+env)');
          return 1;
        }
        console.log(`keeper ${st.healthy ? 'healthy' : 'unhealthy (session dead — re-login)'} → ${st.cdpEndpoint} · last healthy ${st.lastHealthyAt ?? 'n/a'}`);
        return st.healthy ? 0 : 1;
      }
      if (sub === 'stop') {
        await stopKeeper(serviceDir, envName);
        console.log('keeper stopped');
        return 0;
      }
      console.error('usage: pnpm qa session start|status|stop --service <s> [--env <profile>]');
      return 1;
    }

    case 'attend': {
      // Orchestrator-triggered attended live human task: headed browser on the host at the task's
      // start page, video-recorded; the orchestrator walks the interview Q&A in parallel and writes
      // finish/cancel to --signal-file. A generalization of `login --wait-signal`.
      if (!v.run || !v.task) {
        console.error('usage: pnpm qa attend --run <runId> --task <id> --signal-file <f> [--marks-file <m>] [--timeout-min N] [--save-session]');
        return 1;
      }
      if (!v['signal-file']) { console.error('--signal-file <path> is required'); return 1; }
      const { plan } = loadRun(root, v.run);
      const entry = plan.entries.find((e) => e.taskId === v.task);
      if (!entry) { console.error(`task "${v.task}" is not in run ${v.run} (refused or absent)`); return 1; }
      if (entry.lane !== 'human') { console.error(`task "${v.task}" is lane "${entry.lane}", not human — attend is for human tasks`); return 1; }
      const task = plan.tasks[v.task];
      if (!task?.humanInterview?.live) { console.error(`task "${v.task}" has no humanInterview.live block — not live-capable`); return 1; }
      const meta = await attendedHostSession(root, plan, task, {
        signalFile: v['signal-file'] as string,
        marksFile: (v['marks-file'] as string | undefined) || undefined,
        timeoutMin: v['timeout-min'] ? Number(v['timeout-min']) : undefined,
        saveSession: !!v['save-session'],
      });
      console.log(`::attend::closed::${meta.exitReason}`);
      return meta.exitReason === 'cancel' ? 1 : 0;
    }

    case 'finding': {
      if (positionals[1] !== 'new' || !v.service || !v.slug) {
        console.error('usage: pnpm qa finding new --service <s> --slug <slug> [--task <id>] [--run <runId>]');
        return 1;
      }
      const file = scaffoldFinding(serviceDir, v.service, v.slug, { taskId: v.task, runId: v.run, owner: v.owner ?? 'qa@example.com' });
      console.log(`created ${file} — fill in the TODOs and link it from the task's lifecycle.sources`);
      return 0;
    }

    case 'scaffold-service': {
      const name = positionals[1];
      if (!name || !v.url) {
        console.error('usage: pnpm qa scaffold-service <name> --url <baseURL>');
        return 1;
      }
      const dir = scaffoldService(root, name, v.url);
      console.log(`created ${dir}\nnext: pnpm install && write agent-context.md, then author 3–5 smoke tasks (docs/adding-a-service.md)`);
      return 0;
    }

    default:
      console.error(`unknown command "${command}"\n`);
      console.log(HELP);
      return 1;
  }
}

function agentOptsFromArgs(v: Record<string, unknown>): AgentRunOptions {
  return {
    concurrency: v.concurrency ? Number(v.concurrency) : undefined,
    budgetUsd: v.budget ? Number(v.budget) : undefined,
    perTaskBudgetUsd: v['per-task-budget'] ? Number(v['per-task-budget']) : undefined,
    model: (v.model as string) || undefined,
    taskId: (v.task as string) || undefined,
    force: v.force === true,
    dryRun: v['dry-run'] === true,
  };
}

/**
 * Inject the Playwright-backed keeper operations into the agent lane. They live in the runner (which
 * owns the browser/login layer); the agent-bridge driver can only READ the manifest + ping CDP, so
 * self-heal (re)start and the between-task context reset are handed in as hooks here.
 */
function attachKeeperHooks(opts: AgentRunOptions, plan: RunPlan): void {
  opts.resolveKeeper = async (o) => {
    // A keeper that is UP but reports an unhealthy (dead) SESSION cannot be revived by a restart —
    // its persistent token is dead; return fast so the task falls through to blocked-keeper-down
    // rather than paying a full restart per auth task. This guard stays AHEAD of the force path:
    // `force` fixes a poisoned CONTEXT (still "healthy" at the manifest level), never a dead token.
    const before = await keeperStatus(plan.serviceDir, plan.envProfile).catch(() => null);
    if (before?.running && !before.healthy) return null;
    const st = await startKeeper(plan.serviceDir, plan.envProfile, { force: o?.force }).catch(() => null);
    return st && st.running && st.healthy && st.cdpEndpoint
      ? { cdpEndpoint: st.cdpEndpoint, userAgent: st.userAgent }
      : null;
  };
  opts.resetKeeper = (cdpEndpoint: string) => resetSharedContext(cdpEndpoint, plan.baseURL);
}

/**
 * Warm an EXISTING keeper before the preflight so the preflight attaches to it (zero token spend)
 * rather than fresh-booting the snapshot. Never launches a logged-OUT keeper for a service nobody has
 * logged into — in that case the preflight reports "no session" and auth tasks are blocked as before.
 */
async function ensureKeeperWarm(plan: RunPlan): Promise<void> {
  const st = await keeperStatus(plan.serviceDir, plan.envProfile).catch(() => null);
  if (!st || st.running || !st.everStarted) return;
  await startKeeper(plan.serviceDir, plan.envProfile).catch(() => { /* preflight will report */ });
}

function summarizeAgentOutcomes(results: Array<{ outcome: string; status?: string }>): string {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const key = r.outcome === 'result' ? (r.status ?? 'result') : r.outcome;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
}

function loadRun(root: string, runId?: string): { plan: RunPlan; runDir: string } {
  if (!runId) throw new Error('--run <runId> is required');
  const runDir = path.join(root, 'results', runId);
  const planFile = path.join(runDir, 'plan.json');
  if (!fs.existsSync(planFile)) throw new Error(`no plan.json at ${planFile}`);
  return { plan: JSON.parse(fs.readFileSync(planFile, 'utf8')) as RunPlan, runDir };
}

/** Flatten the verdict's outstanding buckets to counts for the progress `verdict` event. */
function outstandingCounts(v: ReleaseVerdict): { needsHuman: number; pendingReview: number; blocked: number } {
  return {
    needsHuman: v.outstanding.needsHuman.length,
    pendingReview: v.outstanding.pendingReview.length,
    blocked: v.outstanding.blocked.length,
  };
}

function finalizeRun(plan: RunPlan, runDir: string): void {
  const merged = mergeRun(runDir);
  const statusFile = updateStatus(plan, merged);
  const checklist = loadChecklist(plan.serviceDir);
  if (checklist) regenerateChecklistMd(plan.serviceDir, checklist, new Map(Object.entries(plan.tasks)));
  const verdict = checklist
    ? computeReleaseVerdict(checklist, statusFile, { plannedTaskIds: plan.entries.map((e) => e.taskId) })
    : null;
  // Late (agent/human) results re-tick the same status board.
  const progress = new ProgressWriter(plan.runId, runDir);
  for (const [taskId, rec] of Object.entries(statusFile.tasks)) {
    if (rec.runId !== plan.runId) continue;
    progress.emit({ event: 'task-finish', taskId, status: rec.status, verdictBy: rec.verdictBy, durationMs: rec.durationMs });
  }
  if (verdict) progress.emit({ event: 'verdict', release: verdict.release, failedGateSections: verdict.failedGateSections, outstanding: outstandingCounts(verdict) });
  const s = merged.results.summary;
  console.log(`\nrun ${plan.runId}: ${s.passed} passed · ${s.failed} failed · ${s.skipped} skipped · ${s.pending} pending`);
}

function dockerImageMatchesPlaywright(root: string): void {
  try {
    const dockerfile = fs.readFileSync(path.join(root, 'tools', 'docker', 'Dockerfile'), 'utf8');
    const tag = /playwright:v([\d.]+)-/.exec(dockerfile)?.[1];
    const require = createRequire(path.join(root, 'package.json'));
    const pkg = JSON.parse(fs.readFileSync(require.resolve('@playwright/test/package.json'), 'utf8')) as { version: string };
    if (tag && tag !== pkg.version) {
      console.warn(
        `⚠ Dockerfile pins Playwright v${tag} but the workspace uses v${pkg.version}. ` +
          `Update the FROM tag in tools/docker/Dockerfile so browser builds match.`,
      );
    }
  } catch {
    /* best-effort preflight */
  }
}

function runInDocker(root: string): number {
  dockerImageMatchesPlaywright(root);
  const args = process.argv.slice(2).filter((a) => a !== '--docker');
  const res = spawnSync(
    'docker',
    ['compose', '-f', path.join(root, 'tools', 'docker', 'docker-compose.yml'), 'run', '--rm', 'runner', 'pnpm', 'qa', ...args],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (res.error || res.status === null) {
    console.error(
      'docker is not available. Install Docker Desktop (WSL2 backend) and run tools/scripts/bootstrap.ps1 first.',
    );
    return 1;
  }
  return res.status ?? 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
