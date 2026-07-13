import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { loadEnvProfile, loadServiceConfig, resolveBaseURL } from '@mc-qa/core';
import {
  keeperManifestPath,
  keeperProfileDir,
  pingCdp,
  readKeeperManifest,
  type KeeperManifest,
} from '@mc-qa/agent-bridge';
import { launchPersistent, sessionFileFor } from './login.ts';

/**
 * Session Keeper — ONE long-lived, logged-in "keeper" browser per service+env that agent tasks
 * ATTACH to over CDP, instead of each task booting a fresh context from a saved snapshot.
 *
 * ROOT CAUSE it fixes: the target app's Flutter app uses ROTATION-ON-USE refresh tokens. `qa login` saves a
 * storageState snapshot holding refresh-token R1; the moment ANY fresh browser context boots from it,
 * the app POSTs /auth/refreshToken and rotates R1→R2 server-side. The booting context discards R2, so
 * the snapshot file still holds the now-dead R1 → every subsequent per-task boot 401s → the whole
 * authenticated agent lane collapses to `blocked-no-session`. The live login browser stayed healthy
 * only because it kept the newest token in its OWN IndexedDB. So: keep exactly that browser alive.
 *
 * The keeper launches from a PERSISTENT user-data-dir (real on-disk IndexedDB), pins the login UA via
 * the `--user-agent` switch, and exposes CDP on 127.0.0.1:<port>. A health loop re-confirms the
 * session every ~2 min and re-saves the storageState snapshot (so the legacy fallback lane stays
 * fresh and `qa session status` is meaningful). Agent tasks attach via Playwright MCP `--cdp-endpoint`.
 *
 * ─── SECURITY ────────────────────────────────────────────────────────────────────────────────────
 * The CDP port is UNAUTHENTICATED, full remote control of a logged-in session. It is
 * bound to 127.0.0.1 ONLY (never 0.0.0.0) via `--remote-debugging-address=127.0.0.1`. The manifest
 * (which holds the endpoint) lives under `.session/` — git-ignored and denied to the agent's Read
 * permissions (see agent-settings.ts). Never widen the bind address or log the endpoint to shared
 * surfaces.
 */

/** Fixed CDP port per service (keyed on the immutable service.config.ts id). */
const KEEPER_PORTS: Record<string, number> = { example: 9223, pwa: 9224 };

/** How often the daemon re-confirms the session is still logged in. */
const HEALTH_INTERVAL_MS = 2 * 60 * 1000;

const DAEMON_ENTRY = fileURLToPath(import.meta.url);
// This file is <root>/packages/runner/src/session-keeper.ts → repo root is three levels up. The
// detached daemon is spawned with this cwd so `node --import tsx` resolves `tsx` from root/node_modules.
const REPO_ROOT = path.resolve(path.dirname(DAEMON_ENTRY), '..', '..', '..');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The CDP port for a service, keyed on its config id; unknown services get a stable port in 9230–9289. */
export function keeperPort(serviceConfigId: string): number {
  const known = KEEPER_PORTS[serviceConfigId];
  if (known) return known;
  let h = 0;
  for (const ch of serviceConfigId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 9230 + (h % 60);
}

export interface KeeperStatus {
  /** CDP endpoint is reachable (the keeper browser is up). */
  running: boolean;
  /** Running AND the session is logged in (manifest not marked unhealthy). */
  healthy: boolean;
  /** A manifest OR persistent profile exists — i.e. the owner has logged in at least once. */
  everStarted: boolean;
  cdpEndpoint?: string;
  userAgent?: string;
  lastHealthyAt?: string;
  unhealthy?: boolean;
}

function writeManifest(serviceDir: string, env: string, m: KeeperManifest): void {
  const file = keeperManifestPath(serviceDir, env);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
}

/** Read the keeper manifest, ping its CDP endpoint, and report running/healthy state. */
export async function keeperStatus(serviceDir: string, env: string): Promise<KeeperStatus> {
  const manifest = readKeeperManifest(serviceDir, env);
  const everStarted = manifest != null || fs.existsSync(keeperProfileDir(serviceDir, env));
  if (!manifest?.cdpEndpoint) return { running: false, healthy: false, everStarted };
  const running = await pingCdp(manifest.cdpEndpoint);
  return {
    running,
    healthy: running && !manifest.unhealthy,
    everStarted,
    cdpEndpoint: manifest.cdpEndpoint,
    userAgent: manifest.userAgent,
    lastHealthyAt: manifest.lastHealthyAt,
    unhealthy: manifest.unhealthy,
  };
}

/**
 * Start the keeper for a service+env (idempotent). If a reachable, healthy keeper already runs it is
 * left alone. Otherwise any stale daemon is stopped and a fresh detached daemon is spawned; we wait
 * for it to bring the browser up and record a definitive health verdict before returning.
 */
export async function startKeeper(
  serviceDir: string,
  env: string,
  opts?: { userAgent?: string; force?: boolean },
): Promise<KeeperStatus> {
  const existing = await keeperStatus(serviceDir, env);
  // `force` skips the "already running & healthy" early-out. A keeper whose page target was killed
  // (a destructive task) still reads running & healthy at the manifest level, so the ONLY way to
  // recover it is a forced stop+respawn on the same persistent profile — the token chain continues
  // (no snapshot boot, no rotation loss), the browser just gets a fresh live page again.
  if (!opts?.force && existing.running && existing.healthy) return existing;

  const ua = opts?.userAgent ?? existing.userAgent; // pin the login UA across restarts
  await stopKeeper(serviceDir, env); // clear any stale/unhealthy daemon + free the profile dir + port

  const daemonArgs = ['--import', 'tsx', DAEMON_ENTRY, '--daemon', '--service-dir', serviceDir, '--env', env];
  if (ua) daemonArgs.push('--ua', ua);
  const child = spawn(process.execPath, daemonArgs, {
    cwd: REPO_ROOT,
    detached: true, // survive the qa process that started it — runs come and go, the keeper stays
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  // Wait (bounded) for the daemon to launch the browser and record a health verdict.
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await sleep(500);
    const m = readKeeperManifest(serviceDir, env);
    if (m?.cdpEndpoint && (m.lastHealthyAt || m.unhealthy) && (await pingCdp(m.cdpEndpoint))) break;
  }
  return keeperStatus(serviceDir, env);
}

/** Stop the keeper daemon (kills its child browser too) and remove the manifest. */
export async function stopKeeper(serviceDir: string, env: string): Promise<void> {
  const manifest = readKeeperManifest(serviceDir, env);
  if (manifest?.pid) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(manifest.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(manifest.pid, 'SIGTERM');
      }
    } catch {
      /* already gone */
    }
  }
  // Wait (bounded) for the port/profile lock to actually release, so a subsequent launch on the same
  // persistent profile + port (a fresh login, or a restart) does not collide with the dying browser.
  if (manifest?.cdpEndpoint) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (await pingCdp(manifest.cdpEndpoint, 500))) await sleep(250);
  }
  try {
    fs.rmSync(keeperManifestPath(serviceDir, env));
  } catch {
    /* no manifest */
  }
}

/**
 * Reset the shared keeper context between serialized auth tasks: connect over CDP, close every tab
 * but one, re-home it to baseURL, then disconnect. Hygiene only — never closes the keeper itself
 * (`browser.close()` on a connectOverCDP handle only DISCONNECTS the client).
 *
 * Returns `true` on a clean reset, `false` when the context could not be reached / re-homed (connect
 * failed, no context, or the re-home goto threw). A `false` tells the caller the shared context is
 * poisoned and the keeper should be force-restarted before the next attach — previously these
 * failures were silently swallowed and the next task attached into a dead context.
 */
export async function resetSharedContext(cdpEndpoint: string, baseURL: string): Promise<boolean> {
  const browser = await chromium.connectOverCDP(cdpEndpoint).catch(() => null);
  if (!browser) return false;
  try {
    const ctx = browser.contexts()[0];
    if (!ctx) return false;
    for (const p of ctx.pages().slice(1)) await p.close().catch(() => {});
    const keep = ctx.pages()[0] ?? (await ctx.newPage());
    const homed = await keep
      .goto(baseURL, { waitUntil: 'domcontentloaded' })
      .then(() => true)
      .catch(() => false);
    return homed;
  } catch {
    return false;
  } finally {
    await browser.close().catch(() => {}); // disconnects only — the keeper stays alive
  }
}

/** Is the session logged in? Mirrors session-preflight's flag/URL logic (trust auth_status, URL fallback). */
async function checkAuth(page: Page, baseURL: string): Promise<boolean> {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(9000); // let the Flutter auth gate route AND refresh a stale token
  const raw =
    (await page
      .evaluate(() => {
        try {
          return localStorage.getItem('flutter.auth_status');
        } catch {
          return null;
        }
      })
      .catch(() => null)) ?? '';
  const pathname = (() => {
    try {
      return new URL(page.url()).pathname;
    } catch {
      return '';
    }
  })();
  const explicitlyOut = raw.includes('not_logged_in');
  const explicitlyIn = raw.includes('logged_in') && !explicitlyOut;
  const onAuthWall = /\/(login|starter)\b/.test(pathname);
  return explicitlyIn || (!explicitlyOut && !onAuthWall);
}

/**
 * The detached daemon body: launch the persistent keeper browser, expose CDP on 127.0.0.1, then loop
 * forever re-confirming the session and re-saving the snapshot. Runs ONLY in the child spawned with
 * `--daemon` (never on a plain library import — see the entry guard at the bottom).
 */
async function runKeeperDaemon(serviceDir: string, env: string, uaArg?: string): Promise<void> {
  const cfg = await loadServiceConfig(serviceDir);
  const profile = loadEnvProfile(serviceDir, env);
  const baseURL = resolveBaseURL(profile);
  const port = keeperPort(cfg.id);
  const cdpEndpoint = `http://127.0.0.1:${port}`;
  const profileDir = keeperProfileDir(serviceDir, env);
  const sessionFile = sessionFileFor(serviceDir, env);

  // SECURITY: bind DevTools to loopback ONLY. Pin the UA via the browser-wide switch so every page
  // (including ones the attached MCP opens) presents the login fingerprint.
  const launchArgs = [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'];
  if (uaArg) launchArgs.push(`--user-agent=${uaArg}`);

  const context = await launchPersistent(profileDir, {
    headless: true,
    args: launchArgs,
    locale: cfg.locale,
    timezoneId: cfg.timezoneId,
    viewport: cfg.viewport,
  });

  // Graceful shutdown on POSIX signals (Windows stop uses taskkill /T, which kills the tree directly).
  const shutdown = async (): Promise<void> => {
    try {
      await context.close();
    } catch {
      /* best effort */
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  // Effective UA (equals uaArg when pinned, else the browser's native UA) — recorded so restarts pin it.
  let effectiveUa = uaArg;
  try {
    const p = context.pages()[0] ?? (await context.newPage());
    effectiveUa = (await p.evaluate(() => navigator.userAgent).catch(() => uaArg)) ?? uaArg;
  } catch {
    /* keep uaArg */
  }
  writeManifest(serviceDir, env, {
    cdpEndpoint,
    pid: process.pid,
    userAgent: effectiveUa,
    startedAt: new Date().toISOString(),
  });

  let healthPage: Page | null = null;
  let contextFailures = 0; // consecutive ticks where we could not obtain a live page target
  for (;;) {
    let pageOk = false;
    try {
      if (!healthPage || healthPage.isClosed()) healthPage = await context.newPage();
      pageOk = !healthPage.isClosed();
      const ok = await checkAuth(healthPage, baseURL);
      const m = readKeeperManifest(serviceDir, env) ?? {
        cdpEndpoint,
        pid: process.pid,
        startedAt: new Date().toISOString(),
      };
      m.cdpEndpoint = cdpEndpoint;
      m.pid = process.pid;
      if (effectiveUa) m.userAgent = effectiveUa;
      if (ok) {
        m.lastHealthyAt = new Date().toISOString();
        m.unhealthy = false;
        // Re-save the snapshot from the LIVE context so the fallback lane stays fresh. (Re-saving from
        // a live, non-rebooted context does NOT rotate the token away — rotation only bites a FRESH
        // context booting from a stale file, which is the whole bug this keeper avoids.)
        await context.storageState({ path: sessionFile, indexedDB: true }).catch(() => {});
      } else {
        m.unhealthy = true; // session went dead — the driver decides (do NOT ping from here)
      }
      writeManifest(serviceDir, env, m);
    } catch {
      /* a transient navigation error must not kill the keeper — keep looping */
    }
    // A DEAD CONTEXT (couldn't get a live page this tick) is different from a transient nav error: it
    // means the browser has no attachable page target — a destructive task poisoned the shared context.
    // After 2 consecutive such ticks, self-destruct so pingCdp/probeCdpPages fail honestly and the
    // driver's self-heal relaunches us on the SAME persistent profile (token chain intact). We do NOT
    // set manifest.unhealthy for this — `unhealthy` means "session dead, do NOT restart"; a poisoned
    // context is the opposite (a restart fixes it).
    if (pageOk) {
      contextFailures = 0;
    } else if (++contextFailures >= 2) {
      try {
        await context.close();
      } catch {
        /* best effort */
      }
      process.exit(1);
    }
    await sleep(HEALTH_INTERVAL_MS);
  }
}

function parseDaemonArgs(argv: string[]): { serviceDir: string; env: string; ua?: string } | null {
  if (!argv.includes('--daemon')) return null;
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const serviceDir = get('--service-dir');
  const env = get('--env');
  if (!serviceDir || !env) return null;
  return { serviceDir, env, ua: get('--ua') };
}

// Entry guard: run the daemon ONLY when spawned with `--daemon`. A plain `import` of this module (by
// login.ts / cli.ts) never has `--daemon` in argv, so this is a no-op there.
const parsed = parseDaemonArgs(process.argv);
if (parsed) {
  runKeeperDaemon(parsed.serviceDir, parsed.env, parsed.ua).catch((e) => {
    console.error('keeper daemon:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
