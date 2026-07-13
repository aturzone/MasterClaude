import fs from 'node:fs';
import path from 'node:path';

/**
 * Dependency-free client for the Session Keeper — the long-lived, logged-in "keeper" browser that
 * agent tasks ATTACH to over CDP instead of booting a fresh snapshot context.
 *
 * WHY it exists: the target app's Flutter app uses ROTATION-ON-USE refresh tokens. A `qa login` snapshot
 * holds refresh-token R1; the instant ANY fresh context boots from it, the app rotates R1→R2
 * server-side and the booting context discards R2 — so the snapshot file now holds a dead R1 and
 * every later per-task boot 401s. The keeper never re-boots: it keeps ONE persistent, authenticated
 * browser alive (its on-disk IndexedDB always holds the newest token), and each agent task attaches
 * to its live context over CDP.
 *
 * This module only READS the keeper's manifest and pings its CDP endpoint — both dependency-free so
 * the agent-bridge driver can consult a keeper without importing the runner's Playwright/login layer
 * (which would be a circular package dependency). The Playwright-backed operations that actually
 * LAUNCH / reset the keeper live in `@mc-qa/runner`'s `session-keeper.ts` and are injected into the
 * driver as hooks (see `AgentRunOptions.resolveKeeper` / `resetKeeper`).
 *
 * SECURITY: `cdpEndpoint` is an UNAUTHENTICATED, full-control handle on a logged-in session.
 * The keeper binds it to 127.0.0.1 ONLY. Its manifest lives under `.session/` (git-ignored + denied
 * to the agent's Read permissions) — treat it as a secret.
 */
export interface KeeperManifest {
  /** CDP base, always http://127.0.0.1:<port> — loopback only, never 0.0.0.0. */
  cdpEndpoint: string;
  /** PID of the detached keeper daemon (its child browser dies with it). */
  pid: number;
  /** UA pinned on the keeper's browser (via the `--user-agent` launch switch) so attached agent
   * pages and the snapshot fallback present an identical fingerprint to the login browser. */
  userAgent?: string;
  startedAt: string;
  /** Last time the health loop confirmed `flutter.auth_status` was logged-in. */
  lastHealthyAt?: string;
  /** Set by the health loop when the session went dead — the driver decides what to do. */
  unhealthy?: boolean;
}

/** A resolved, attachable keeper (returned by the injected self-heal hook). */
export interface ResolvedKeeper {
  cdpEndpoint: string;
  userAgent?: string;
}

/** apps/<svc>/.session/<env>.keeper.json — the keeper's manifest. */
export function keeperManifestPath(serviceDir: string, env: string): string {
  return path.join(serviceDir, '.session', `${env}.keeper.json`);
}

/** apps/<svc>/.session/<env>.profile — the keeper's persistent user-data-dir. */
export function keeperProfileDir(serviceDir: string, env: string): string {
  return path.join(serviceDir, '.session', `${env}.profile`);
}

export function readKeeperManifest(serviceDir: string, env: string): KeeperManifest | null {
  const file = keeperManifestPath(serviceDir, env);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as KeeperManifest;
  } catch {
    return null;
  }
}

/**
 * Is the keeper's CDP endpoint alive? A cheap `GET <endpoint>/json/version` with a short timeout.
 * Reachable ⇒ the browser is up; combine with `!manifest.unhealthy` for "healthy AND logged in".
 */
export async function pingCdp(cdpEndpoint: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cdpEndpoint.replace(/\/$/, '')}/json/version`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * DEEPER than pingCdp: does the keeper browser have at least one ATTACHABLE page target?
 * `/json/version` answers as long as the browser process is up — but a task that emulated offline
 * and killed the app tab (e.g. `resil.interrupt.offline-and-tabkill`) can leave the browser running
 * with ZERO page targets. Every subsequent CDP attach into that context then dies at turn 1 — the
 * exact cascade we saw (6 auth tasks failing back-to-back with an empty stderr). `/json/list` returns
 * the page-target array; a keeper is only truly attachable when ≥1 entry has `type === 'page'`.
 */
export async function probeCdpPages(cdpEndpoint: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cdpEndpoint.replace(/\/$/, '')}/json/list`, { signal: controller.signal });
    if (!res.ok) return false;
    const targets = (await res.json()) as Array<{ type?: string }>;
    return Array.isArray(targets) && targets.some((t) => t.type === 'page');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
