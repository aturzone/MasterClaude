import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { loadEnvProfile, resolveBaseURL } from '@mc-qa/core';
import { pingCdp, readKeeperManifest } from '@mc-qa/agent-bridge';
import { sessionFileFor } from './login.ts';

export interface PreflightResult {
  valid: boolean;
  reason: string;
}

/**
 * Cheap (~10s, $0) check that the session is ACTUALLY authenticated before we spend on authenticated
 * agent tasks. Two paths:
 *
 *  1. KEEPER-AWARE (preferred): if a healthy Session Keeper is up, ATTACH to its live context over
 *     CDP and read `flutter.auth_status` from a page there — ZERO fresh contexts, so ZERO token
 *     consumption. (A fresh boot ROTATES the one-time refresh token, which is exactly what kills the
 *     snapshot; the keeper's whole purpose is to never do that.)
 *  2. LEGACY fresh-boot: no keeper → load the snapshot in a throwaway context and check the auth
 *     gate. This path DOES consume/rotate the token, so when it finds the session valid it RE-SAVES
 *     storageState (indexedDB:true) before closing — otherwise it would silently assassinate the very
 *     session it just validated (the historical bug behind run 231555's $40 loss).
 *
 * Uses system Edge on Windows (the Playwright CDN is geo-blocked here).
 */
export async function preflightSession(serviceDir: string, envProfile: string): Promise<PreflightResult> {
  const sessionFile = sessionFileFor(serviceDir, envProfile);
  let profile;
  try {
    profile = loadEnvProfile(serviceDir, envProfile);
  } catch (e) {
    return { valid: false, reason: `env profile: ${(e as Error).message}` };
  }
  const baseURL = resolveBaseURL(profile);

  // 1. Keeper-aware path — attach to the live logged-in context, consume no token.
  const manifest = readKeeperManifest(serviceDir, envProfile);
  if (manifest?.cdpEndpoint && !manifest.unhealthy && (await pingCdp(manifest.cdpEndpoint))) {
    const viaKeeper = await preflightViaKeeper(manifest.cdpEndpoint, baseURL);
    if (viaKeeper) return viaKeeper; // only fall through if the attach itself failed unexpectedly
  }

  // 2. Legacy fresh-boot path (snapshot mode).
  if (!fs.existsSync(sessionFile)) return { valid: false, reason: 'no saved session (run login first)' };
  const browser = await chromium
    .launch({
      headless: true,
      channel: process.env.MC_QA_AGENT_BROWSER || (process.platform === 'win32' ? 'msedge' : undefined),
    })
    .catch(() => null);
  if (!browser) return { valid: false, reason: 'could not launch a browser for preflight' };
  try {
    const context = await browser.newContext({ storageState: sessionFile });
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(9000); // let the Flutter auth-gate route AND refresh a stale token
    // Trust the app's OWN auth flag over the URL: the authenticated boot briefly passes through
    // /starter while it refreshes, so a fixed-wait URL check gives flaky false negatives. The app
    // writes flutter.auth_status="logged_in" once it settles, and rewrites it to "not_logged_in"
    // when the token is truly dead. Fall back to the URL only when the flag is absent.
    const authStatus = await page.evaluate(() => { try { return localStorage.getItem('flutter.auth_status'); } catch { return null; } }).catch(() => null);
    const pathname = (() => { try { return new URL(page.url()).pathname; } catch { return ''; } })();
    const raw = authStatus ?? '';
    const explicitlyOut = raw.includes('not_logged_in');
    const explicitlyIn = raw.includes('logged_in') && !explicitlyOut;
    const onAuthWall = /\/(login|starter)\b/.test(pathname);
    const valid = explicitlyIn || (!explicitlyOut && !onAuthWall);
    // Re-save the (now rotated) token so this cheap check does not DESTROY the session it validated.
    if (valid) await context.storageState({ path: sessionFile, indexedDB: true }).catch(() => {});
    return valid
      ? { valid: true, reason: `authenticated (auth_status=${raw || 'n/a'}, ${pathname || '/'})` }
      : { valid: false, reason: `not authenticated (auth_status=${raw || 'n/a'}, ${pathname || '/'}) — re-login` };
  } catch (e) {
    return { valid: false, reason: `preflight error: ${(e as Error).message}` };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Attach to the keeper's live context over CDP and read the auth flag from a page ON baseURL. Opening
 * a page in the SHARED, live context (and letting IT use/rotate the token in place) is safe — rotation
 * is only fatal for a FRESH context that boots from a stale file and discards the rotated result.
 * Returns null if the attach itself failed (caller falls back to the legacy path).
 */
async function preflightViaKeeper(cdpEndpoint: string, baseURL: string): Promise<PreflightResult | null> {
  const browser = await chromium.connectOverCDP(cdpEndpoint).catch(() => null);
  if (!browser) return null;
  let page;
  try {
    const ctx = browser.contexts()[0];
    if (!ctx) return null;
    page = await ctx.newPage();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);
    const authStatus = await page.evaluate(() => { try { return localStorage.getItem('flutter.auth_status'); } catch { return null; } }).catch(() => null);
    const pathname = (() => { try { return new URL(page.url()).pathname; } catch { return ''; } })();
    const raw = authStatus ?? '';
    const explicitlyOut = raw.includes('not_logged_in');
    const explicitlyIn = raw.includes('logged_in') && !explicitlyOut;
    const onAuthWall = /\/(login|starter)\b/.test(pathname);
    const valid = explicitlyIn || (!explicitlyOut && !onAuthWall);
    return valid
      ? { valid: true, reason: `authenticated via keeper (auth_status=${raw || 'n/a'}, ${pathname || '/'})` }
      : { valid: false, reason: `keeper session not authenticated (auth_status=${raw || 'n/a'}, ${pathname || '/'}) — re-login` };
  } catch {
    return null;
  } finally {
    await page?.close().catch(() => {}); // close only the page WE opened
    await browser.close().catch(() => {}); // disconnect only — the keeper stays alive
  }
}
