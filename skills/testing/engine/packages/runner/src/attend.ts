import fs from 'node:fs';
import path from 'node:path';
import {
  ProgressWriter,
  loadEnvProfile,
  loadServiceConfig,
  resolveBaseURL,
  type RunPlan,
  type Task,
} from '@mc-qa/core';
import { keeperProfileDir } from '@mc-qa/agent-bridge';
import { browserLaunch, launchPersistent, sessionFileFor } from './login.ts';
import { startKeeper, stopKeeper } from './session-keeper.ts';

/** Injected into every page so the tester's mouse + clicks show up in the recorded webm (the OS
 * cursor is not captured). A red ring follows the pointer; each click leaves an expanding ripple. */
const CURSOR_OVERLAY = () => {
  const w = window as unknown as { __mcqaCursor?: boolean };
  if (w.__mcqaCursor) return;
  w.__mcqaCursor = true;
  const install = () => {
    if (!document.body) return;
    const style = document.createElement('style');
    style.textContent =
      '#__mc-qa_cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border:2px solid rgba(255,50,50,.9);border-radius:50%;background:rgba(255,50,50,.22);' +
      'pointer-events:none;left:-100px;top:-100px}' +
      '.__mc-qa_ripple{position:fixed;z-index:2147483646;width:12px;height:12px;margin:-6px 0 0 -6px;' +
      'border-radius:50%;background:rgba(255,50,50,.55);pointer-events:none;animation:__mc-qa_r .5s ease-out forwards}' +
      '@keyframes __mc-qa_r{to{transform:scale(6);opacity:0}}';
    (document.head || document.documentElement).appendChild(style);
    const dot = document.createElement('div');
    dot.id = '__mc-qa_cursor';
    document.body.appendChild(dot);
    addEventListener('mousemove', (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.className = '__mc-qa_ripple';
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.body) install();
  else addEventListener('DOMContentLoaded', install);
};

export interface AttendOptions {
  /** File the orchestrator writes `finish` or `cancel` into to end the session. */
  signalFile: string;
  /** NDJSON file the orchestrator appends `{qid,ts}` to each time the tester answers a question; we
   * screenshot the live page at that instant so the reviewer can jump the video to it. */
  marksFile?: string;
  /** Hard cap (minutes). Defaults to estimatedMinutes×5, floor 20. The video survives a timeout. */
  timeoutMin?: number;
  /** Login-flow tasks only: save the resulting storageState back as the run's session on finish. */
  saveSession?: boolean;
}

export interface AttendMark {
  qid: string;
  at: string;
  videoOffsetMs: number;
  screenshot: string;
}

export interface AttendMeta {
  taskId: string;
  startedAt: string;
  endedAt: string;
  exitReason: 'finish' | 'cancel' | 'timeout' | 'crash-limit';
  startUrl: string;
  endUrl: string;
  crashes: number;
  /** Path relative to the task dir, e.g. "video/session.webm" — null if none was produced. */
  video: string | null;
  videoSizeBytes: number;
  marks: AttendMark[];
}

/**
 * Attended live human task: open a HEADED browser on the host at the task's start page (like the
 * manual-login button), reuse the saved authenticated session when the task needs it, RECORD the
 * whole session to webm, and keep it open while the tester works — an orchestrator walks the
 * interview questions in a separate channel in parallel. Ends when the orchestrator writes
 * `finish`/`cancel` to the signal file, on a hard timeout, or after repeated renderer crashes. The
 * webm + attend-meta.json are written on EVERY exit path (even if the orchestrator dies) so
 * evidence is never lost.
 *
 * This never performs an irreversible action: it only opens a browser a present human drives.
 * Class-c tasks are inspect-only (forbiddenActions shown to the tester, mandatory review after).
 */
export async function attendedHostSession(
  root: string,
  plan: RunPlan,
  task: Task,
  opts: AttendOptions,
): Promise<AttendMeta> {
  const serviceDir = plan.serviceDir;
  const cfg = await loadServiceConfig(serviceDir);
  const profile = loadEnvProfile(serviceDir, plan.envProfile);
  const baseURL = resolveBaseURL(profile);
  const live = task.humanInterview?.live ?? {};

  const runDir = path.join(root, 'results', plan.runId);
  const taskDir = path.join(runDir, 'human', task.id);
  const videoDir = path.join(taskDir, 'video');
  const evidenceDir = path.join(taskDir, 'evidence');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  try { fs.rmSync(opts.signalFile); } catch { /* start clean */ }

  const startUrl = `${baseURL.replace(/\/$/, '')}/${String(live.startPath ?? '').replace(/^\//, '')}`;
  const requiresAuth = live.requiresAuth === true;
  const sessionFile = sessionFileFor(serviceDir, plan.envProfile);
  const keeperProfile = keeperProfileDir(serviceDir, plan.envProfile);
  // Preferred for auth tasks: reuse the Session Keeper's ALREADY-logged-in persistent profile so the
  // tester sees the app signed in with NO re-login (the owner's request). The keeper holds the
  // profile's single-instance lock, so pause it for the duration and restart it on every exit path.
  // Falls back to a fresh context (+ storageState snapshot if present) when there's no keeper profile.
  const reuseKeeper = requiresAuth && fs.existsSync(keeperProfile);
  const useSnapshot = requiresAuth && !reuseKeeper && fs.existsSync(sessionFile);
  const authed = reuseKeeper || useSnapshot;

  const progress = new ProgressWriter(plan.runId, runDir);
  progress.emit({ event: 'attended-start', taskId: task.id });

  let browser: Awaited<ReturnType<typeof browserLaunch>> | null = null;
  let context: Awaited<ReturnType<typeof launchPersistent>>;
  if (reuseKeeper) {
    await stopKeeper(serviceDir, plan.envProfile).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500)); // let the profile lock/port free
    context = await launchPersistent(keeperProfile, {
      headless: false,
      locale: cfg.locale,
      timezoneId: cfg.timezoneId,
      viewport: cfg.viewport ?? { width: 390, height: 844 }, // also the recorded frame size
      recordVideo: { dir: videoDir },
    });
  } else {
    browser = await browserLaunch(false);
    context = await browser.newContext({
      locale: cfg.locale,
      timezoneId: cfg.timezoneId,
      viewport: cfg.viewport ?? { width: 390, height: 844 }, // also the recorded frame size
      recordVideo: { dir: videoDir },
      ...(useSnapshot ? { storageState: sessionFile } : {}),
    });
  }
  // Make the mouse + clicks VISIBLE in the recorded video (the OS cursor is not captured by
  // Playwright's recordVideo). Inject a soft cursor that follows mousemove and a ripple on click —
  // so the reviewer can see exactly where the tester pointed and tapped. Works over the Flutter
  // canvas too (events fire on the glass pane).
  await context.addInitScript(CURSOR_OVERLAY).catch(() => {});
  const page = context.pages()[0] ?? (await context.newPage());
  let crashed = false;
  let crashes = 0;
  page.on('crash', () => { crashed = true; crashes++; });

  const startedAt = Date.now();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

  // Signal ready AS SOON AS the browser is open (the window is already visible after goto) — the
  // orchestrator resolves its readiness promise on this and messages the tester immediately, instead
  // of waiting out the session check below (which made the feature look dead for 5-10s).
  console.log('::attend::ready');

  // A present human can re-log-in if the session lapsed; warn AFTER ready so the orchestrator can tell
  // them (it listens for this via handle.onSessionExpired, not a synchronous post-resolve read).
  if (authed) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      if (/\/(login|starter)\b/.test(new URL(page.url()).pathname)) console.log('::attend::warn::session-expired');
    } catch { /* non-URL */ }
  }

  const timeoutMin = opts.timeoutMin ?? Math.max(20, (task.humanInterview?.estimatedMinutes ?? 10) * 5);
  const deadline = startedAt + timeoutMin * 60_000;
  const marks: AttendMark[] = [];
  let seenMarks = 0;
  let reloads = 0;
  let exitReason: AttendMeta['exitReason'] = 'timeout';

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500)); // plain timer — never throws even if the page crashed

    try {
      if (fs.existsSync(opts.signalFile)) {
        const s = fs.readFileSync(opts.signalFile, 'utf8').trim();
        if (s === 'finish') { exitReason = 'finish'; break; }
        if (s === 'cancel') { exitReason = 'cancel'; break; }
      }
    } catch { /* transient read */ }

    if (crashed) {
      crashed = false;
      if (++reloads > 3) { exitReason = 'crash-limit'; break; }
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      continue;
    }

    // Screenshot the live page each time the tester answers a question (orchestrator appends a mark line).
    if (opts.marksFile) {
      try {
        const lines = fs.existsSync(opts.marksFile)
          ? fs.readFileSync(opts.marksFile, 'utf8').split('\n').filter(Boolean)
          : [];
        for (let i = seenMarks; i < lines.length; i++) {
          let parsed: { qid?: string } = {};
          try { parsed = JSON.parse(lines[i]); } catch { continue; }
          const qid = String(parsed.qid ?? `mark${i}`);
          const shotRel = `evidence/mark-${qid}.png`;
          await page.screenshot({ path: path.join(taskDir, shotRel) }).catch(() => {});
          marks.push({ qid, at: new Date().toISOString(), videoOffsetMs: Date.now() - startedAt, screenshot: shotRel });
        }
        seenMarks = lines.length;
      } catch { /* transient */ }
    }
  }

  const endUrl = (() => { try { return page.url(); } catch { return startUrl; } })();

  // A successful live LOGIN task doubles as the run's session refresh.
  if (opts.saveSession && exitReason === 'finish') {
    try {
      const state = await context.storageState({ indexedDB: true });
      fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2));
    } catch { /* best effort */ }
  }

  const videoObj = page.video();
  await context.close().catch(() => {}); // flushes the webm to disk (also closes the persistent browser)
  if (browser) await browser.close().catch(() => {});
  // Restart the keeper we paused to borrow its logged-in profile, so the agent lane can resume
  // attaching. Done on EVERY exit path (finish/cancel/timeout/crash) — the tester's session lives on
  // in the profile, so the restart re-attaches to it without a re-login.
  if (reuseKeeper) {
    await new Promise((r) => setTimeout(r, 2000)); // let the profile lock/port free
    await startKeeper(serviceDir, plan.envProfile).catch(() => { /* the next preflight will report */ });
  }

  let videoRel: string | null = null;
  if (videoObj) {
    try {
      const src = await videoObj.path();
      const dest = path.join(videoDir, 'session.webm');
      if (src && fs.existsSync(src)) { fs.renameSync(src, dest); videoRel = 'video/session.webm'; }
    } catch { /* video may be absent on some exit paths */ }
  }
  const videoSizeBytes = videoRel && fs.existsSync(path.join(taskDir, videoRel))
    ? fs.statSync(path.join(taskDir, videoRel)).size
    : 0;

  const meta: AttendMeta = {
    taskId: task.id,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    exitReason,
    startUrl,
    endUrl,
    crashes,
    video: videoRel,
    videoSizeBytes,
    marks,
  };
  fs.writeFileSync(path.join(taskDir, 'attend-meta.json'), JSON.stringify(meta, null, 2));
  progress.emit({ event: 'attended-finish', taskId: task.id, exitReason, videoPath: videoRel ?? undefined });
  try { fs.rmSync(opts.signalFile); } catch { /* best effort */ }
  return meta;
}
