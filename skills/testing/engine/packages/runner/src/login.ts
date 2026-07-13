import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { chromium, type BrowserContext } from '@playwright/test';
import { loadEnvProfile, loadServiceConfig, resolveBaseURL, resolveSecret, resolveServiceDir } from '@mc-qa/core';
import { keeperProfileDir } from '@mc-qa/agent-bridge';
import { keeperPort, startKeeper, stopKeeper } from './session-keeper.ts';

// The bundled Playwright chromium's page CRASHES loading the heavy Flutter/CanvasKit app
// ("Page crashed"), and Edge only renders it under software WebGL (slow/blank). System Brave
// (real GPU) renders it properly AND stays stable — so browserLaunch() prefers Brave, with the
// Edge channel (+ SwiftShader) and bundled chromium as fallbacks. LAUNCH_CHANNEL is that Edge
// fallback (the Playwright CDN is geo-blocked here, so a system channel is needed anyway).
const LAUNCH_CHANNEL = process.env.MC_QA_AGENT_BROWSER || (process.platform === 'win32' ? 'msedge' : undefined);

/** Path to a system Brave, if installed (Windows). Brave (real GPU) renders the CanvasKit app AND
 * stays stable, unlike bundled chromium / Edge which crash the GPU process on the heavy page. */
function braveExe(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const c = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
    'C:/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe',
  ].filter(Boolean) as string[];
  return c.find((p) => fs.existsSync(p));
}

/**
 * Launch the login browser. Preference (verified on this host): Brave via executablePath (real
 * GPU — renders the login form AND survives; verified 40s+ to /starter) → Edge channel with
 * software WebGL (stable but slow render) → bundled chromium. Override with MC_QA_LOGIN_BROWSER
 * (an .exe path or a Playwright channel name).
 */
export async function browserLaunch(headless: boolean) {
  const override = process.env.MC_QA_LOGIN_BROWSER;
  if (override) {
    const isPath = /[\\/]/.test(override) || override.endsWith('.exe');
    try {
      return await chromium.launch(isPath ? { headless, executablePath: override } : { headless, channel: override });
    } catch { /* fall through to auto */ }
  }
  const brave = braveExe();
  if (brave) {
    try { return await chromium.launch({ headless, executablePath: brave }); } catch { /* fall through */ }
  }
  try {
    return await chromium.launch({ headless, channel: LAUNCH_CHANNEL, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch {
    return await chromium.launch({ headless }); // bundled fallback
  }
}

export interface PersistentLaunchOpts {
  headless: boolean;
  /** Extra Chromium switches (e.g. --remote-debugging-port=, --user-agent=). */
  args?: string[];
  locale?: string;
  timezoneId?: string;
  viewport?: { width: number; height: number };
  /** Record the whole session to webm into this dir (attended-live reuse of the keeper profile). */
  recordVideo?: { dir: string };
}

/**
 * Launch a PERSISTENT context (real on-disk user-data-dir) with the SAME browser preference as
 * `browserLaunch` (Brave via executablePath → Edge channel + software WebGL → bundled chromium).
 *
 * The persistent profile is what makes the Session Keeper work: the target app's Flutter auth token lives
 * in IndexedDB, and rotation-on-use refresh means only a browser that KEEPS its own live IndexedDB
 * (never re-boots from a stale snapshot) stays logged in. Both the human login flow and the keeper
 * daemon launch the same `profileDir`, so the token the human obtains is the token the keeper holds.
 */
export async function launchPersistent(profileDir: string, opts: PersistentLaunchOpts): Promise<BrowserContext> {
  fs.mkdirSync(profileDir, { recursive: true });
  const common = {
    headless: opts.headless,
    args: opts.args,
    locale: opts.locale,
    timezoneId: opts.timezoneId,
    viewport: opts.viewport ?? { width: 390, height: 844 },
    ...(opts.recordVideo ? { recordVideo: opts.recordVideo } : {}),
  };
  const override = process.env.MC_QA_LOGIN_BROWSER;
  if (override) {
    const isPath = /[\\/]/.test(override) || override.endsWith('.exe');
    try {
      return await chromium.launchPersistentContext(profileDir, isPath ? { ...common, executablePath: override } : { ...common, channel: override });
    } catch { /* fall through to auto */ }
  }
  const brave = braveExe();
  if (brave) {
    try { return await chromium.launchPersistentContext(profileDir, { ...common, executablePath: brave }); } catch { /* fall through */ }
  }
  try {
    return await chromium.launchPersistentContext(profileDir, {
      ...common,
      channel: LAUNCH_CHANNEL,
      args: [...(opts.args ?? []), '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
  } catch {
    return await chromium.launchPersistentContext(profileDir, common); // bundled fallback
  }
}

/**
 * Interactive login: opens a headed browser at the service's base URL and waits for the
 * HUMAN to log in themselves (phone + password + OTP). The tooling NEVER sees or stores the
 * password — it only saves the resulting session (cookies + localStorage) as a git-ignored
 * storageState file, which authenticated runs reuse (no password/OTP per run).
 *
 * If the app stores its token in IndexedDB rather than localStorage, storageState will not
 * capture it — see docs; the fallback is a persistent user-data-dir.
 */
export async function interactiveLogin(root: string, service: string, envName?: string): Promise<string> {
  const serviceDir = await resolveServiceDir(root, service);
  const cfg = await loadServiceConfig(serviceDir);
  const profileName = envName ?? cfg.defaultEnv;
  const profile = loadEnvProfile(serviceDir, profileName);
  const baseURL = resolveBaseURL(profile);
  const sessionDir = path.join(serviceDir, '.session');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = path.join(sessionDir, `${profileName}.json`);

  console.log(`\nOpening a headed browser at ${baseURL}`);
  console.log('Log in YOURSELF (phone + password + OTP). The tooling never sees your credentials.\n');

  // Persistent user-data-dir: the Session Keeper reuses this exact profile, so the token you obtain
  // here is the one it keeps alive. Stop any running keeper first — it holds a lock on this profile
  // dir and on the CDP port, and we are about to replace its session with a fresh login.
  await stopKeeper(serviceDir, profileName).catch(() => {});
  const profileDir = keeperProfileDir(serviceDir, profileName);
  const port = keeperPort(cfg.id);
  const context = await launchPersistent(profileDir, {
    headless: false,
    args: [`--remote-debugging-port=${port}`],
    locale: cfg.locale,
    timezoneId: cfg.timezoneId,
    viewport: cfg.viewport,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('When you are logged in and can see your dashboard, press Enter here to save the session... ');
  rl.close();

  // indexedDB:true is REQUIRED — this Flutter app keeps its auth token in IndexedDB, so a plain
  // cookies+localStorage storageState loads logged-OUT (redirects to /login). See run 231555.
  await context.storageState({ path: sessionFile, indexedDB: true });
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
  await context.close();

  // Auto-start the keeper on the just-authenticated profile so agent runs can attach immediately.
  const keeper = await startKeeper(serviceDir, profileName, { userAgent }).catch(() => null);

  console.log(`\nSaved authenticated session → ${sessionFile}`);
  console.log(keeper?.running
    ? `Session Keeper started → ${keeper.cdpEndpoint} (agent tasks will attach over CDP).`
    : 'Session Keeper did not start — agent runs will fall back to the snapshot (see `pnpm qa session status`).');
  console.log('It is git-ignored. Run authenticated suites with:');
  console.log(`  pnpm qa run --service ${service} --env ${profileName} --authenticated --risk a,b`);
  console.log('Re-run `pnpm qa login` when the session expires.');
  return sessionFile;
}

export function sessionFileFor(serviceDir: string, profileName: string): string {
  return path.join(serviceDir, '.session', `${profileName}.json`);
}

export function loginSignalFile(serviceDir: string, profileName: string): string {
  return path.join(serviceDir, '.session', `${profileName}.login-signal`);
}

/**
 * Manual login an ORCHESTRATOR triggers: opens a HEADED browser on the host at the login URL. The
 * user logs in themselves (phone + password, 2FA and all) — the tooling NEVER sees the password. We
 * save ONLY the session cookie. Completion is signalled either by the caller creating
 * `signalFile` (the orchestrator's "✅ logged in" button) or by auto-detecting we left the login route.
 * No .env creds and no password ever pass through the orchestrator or this code.
 */
export async function headedBotLogin(
  root: string,
  service: string,
  envName: string | undefined,
  opts: { signalFile: string; timeoutMs?: number },
): Promise<string> {
  const serviceDir = await resolveServiceDir(root, service);
  const cfg = await loadServiceConfig(serviceDir);
  const profileName = envName ?? cfg.defaultEnv;
  const profile = loadEnvProfile(serviceDir, profileName);
  const baseURL = resolveBaseURL(profile);
  const sessionDir = path.join(serviceDir, '.session');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = path.join(sessionDir, `${profileName}.json`);
  try { fs.rmSync(opts.signalFile); } catch { /* start clean */ }

  // Persistent profile (see interactiveLogin) — the keeper reuses it. Stop any running keeper first
  // so the profile dir + CDP port are free for this fresh headed login.
  await stopKeeper(serviceDir, profileName).catch(() => {});
  const profileDir = keeperProfileDir(serviceDir, profileName);
  const port = keeperPort(cfg.id);
  const context = await launchPersistent(profileDir, {
    headless: false,
    args: [`--remote-debugging-port=${port}`],
    locale: cfg.locale,
    timezoneId: cfg.timezoneId,
    viewport: cfg.viewport,
  });
  const browser = context.browser(); // Browser handle for the disconnect (window-closed) guard
  const page = context.pages()[0] ?? (await context.newPage());
  let crashed = false;
  let disconnected = false;
  page.on('crash', () => { crashed = true; }); // survive a renderer crash instead of throwing
  browser?.on('disconnected', () => { disconnected = true; }); // user closed the window → stop waiting
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  const deadline = Date.now() + (opts.timeoutMs ?? 8 * 60 * 1000);
  let done = false;
  let reloads = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000)); // plain timer — never throws even if the page crashed
    // If the user CLOSED the browser without tapping the button, stop immediately instead of polling
    // the full 8 min — otherwise the orchestrator's pendingLogins guard stays wedged and blocks live tests.
    if (disconnected || page.isClosed()) break; // done stays false → treated as not-logged-in below
    // The signal-file check must work even after a crash (the user may finish then tap the button).
    if (fs.existsSync(opts.signalFile)) { done = true; break; } // user tapped "✅ logged in"
    if (crashed) {
      crashed = false;
      if (++reloads > 3) break; // page keeps dying — give up (caller falls back / reports)
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      continue;
    }
    try {
      const p = new URL(page.url()).pathname;
      if (!/\/(login|starter)\b/.test(p) && /(root|dashboard|home|account|app)/.test(p)) { done = true; break; }
    } catch { /* non-URL — keep polling */ }
  }
  if (!done) {
    if (!disconnected) await context.close().catch(() => {});
    throw new Error(disconnected ? 'login: the browser was closed before you finished logging in' : 'login: timed out waiting for you to finish logging in');
  }
  const state = await context.storageState({ indexedDB: true }); // capture the Flutter IndexedDB auth token
  fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2));
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
  await context.close();
  // Auto-start the keeper on the freshly-authenticated persistent profile (best-effort; a failure
  // here just means agent runs fall back to the snapshot until the next `qa session start`).
  await startKeeper(serviceDir, profileName, { userAgent }).catch(() => {});
  try { fs.rmSync(opts.signalFile); } catch { /* best effort */ }
  return sessionFile;
}

/** Does this profile have phone+password creds in the environment (for scripted login)? */
export function hasScriptedCreds(serviceDir: string, profileName: string): { ok: boolean; missing: string[] } {
  const profile = loadEnvProfile(serviceDir, profileName);
  const missing: string[] = [];
  for (const key of ['phone', 'password']) {
    try {
      resolveSecret(profile, key);
    } catch {
      // Surface the exact env-var name the user must set.
      const raw = profile.secrets?.[key];
      const m = raw?.match(/^\$\{env:([A-Z0-9_]+)\}$/);
      missing.push(m ? m[1] : `secret:${key}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Session freshness check: exists and was written within `maxAgeHours` (default 12h). */
export function isSessionFresh(serviceDir: string, profileName: string, maxAgeHours = 12): boolean {
  const f = sessionFileFor(serviceDir, profileName);
  if (!fs.existsSync(f)) return false;
  const ageMs = Date.now() - fs.statSync(f).mtimeMs;
  return ageMs < maxAgeHours * 3600_000;
}

const OTP_HINT = /(otp|one.?time|verification code|passcode)/i;

/**
 * Non-interactive login from .env creds (phone + password), for a 2FA-DISABLED test account.
 * Drives the Flutter login via the semantics tree and saves ONLY the session cookie — the
 * password is read from the env, never logged, never written anywhere but the browser field.
 * If an OTP/2FA step appears, it stops with a clear error (turn 2FA off, or use headed login).
 * On any failure it saves a debug screenshot next to the session file so selectors can be tuned.
 */
export async function scriptedLogin(root: string, service: string, envName?: string): Promise<string> {
  const serviceDir = await resolveServiceDir(root, service);
  const cfg = await loadServiceConfig(serviceDir);
  const profileName = envName ?? cfg.defaultEnv;
  const profile = loadEnvProfile(serviceDir, profileName);
  const baseURL = resolveBaseURL(profile);
  const phone = resolveSecret(profile, 'phone');
  const password = resolveSecret(profile, 'password'); // never logged (also in redaction list)
  const sessionDir = path.join(serviceDir, '.session');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = path.join(sessionDir, `${profileName}.json`);
  const debugShot = path.join(sessionDir, `${profileName}.login-debug.png`);

  const browser = await browserLaunch(true);
  const context = await browser.newContext({
    locale: cfg.locale,
    timezoneId: cfg.timezoneId,
    viewport: cfg.viewport ?? { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const fail = async (msg: string): Promise<never> => {
    await page.screenshot({ path: debugShot, fullPage: true }).catch(() => {});
    await browser.close();
    throw new Error(`${msg}\n  debug screenshot: ${debugShot}`);
  };

  try {
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    // Populate Flutter's semantics tree so getByRole works on the canvas.
    const placeholder = page.locator('flt-semantics-placeholder, [aria-label="Enable accessibility"]').first();
    if (await placeholder.count()) await placeholder.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // From the starter screen, enter the login flow if a "login" CTA is present.
    const loginCta = page.getByRole('button', { name: /log ?in|sign ?in/i }).first();
    if (await loginCta.count()) await loginCta.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);

    // Phone → (maybe continue) → password → submit. Be tolerant of one- or two-step forms.
    const phoneField = page.getByRole('textbox').first();
    await phoneField.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (!(await phoneField.count())) return fail('login: no phone textbox found on the login screen');
    await phoneField.fill(phone);

    // If a password field isn't visible yet, a "continue/next" step may reveal it.
    const passwordField = page.getByRole('textbox').nth(1);
    if (!(await passwordField.count())) {
      const cont = page.getByRole('button', { name: /continue|next/i }).first();
      if (await cont.count()) { await cont.click().catch(() => {}); await page.waitForTimeout(1500); }
    }
    const pwd = page.getByRole('textbox').nth(1);
    if (await pwd.count()) {
      await pwd.fill(password);
    } else {
      return fail('login: no password field found (is this a phone+password account? is 2FA off?)');
    }

    // Submit.
    const submit = page.getByRole('button', { name: /submit|log ?in|sign ?in|continue/i }).first();
    if (await submit.count()) await submit.click().catch(() => {});
    else await pwd.press('Enter').catch(() => {});

    // A visible OTP field means 2FA is still on — scripted login can't complete.
    await page.waitForTimeout(2500);
    const otp = page.getByRole('textbox').filter({ hasText: OTP_HINT });
    if ((await otp.count()) || OTP_HINT.test(await page.title().catch(() => ''))) {
      return fail('login: an OTP/2FA step appeared — disable 2FA on the test account, or use headed `qa login`');
    }

    // Consider login done when the URL leaves /login/starter or a session cookie is set.
    await page.waitForURL((u) => !/\/(login|starter)\b/.test(u.pathname), { timeout: 20000 }).catch(() => {});
    // The URL leaving /login|/starter is the truth of a logged-in session; capture IndexedDB too
    // (the Flutter auth token lives there) so agent/authenticated runs actually load logged-in.
    const onApp = !/\/(login|starter)\b/.test((() => { try { return new URL(page.url()).pathname; } catch { return '/login'; } })());
    const state = await context.storageState({ indexedDB: true });
    if (!onApp) return fail('login: still on the login/starter screen after submitting (2FA on? wrong creds?)');

    fs.writeFileSync(sessionFile, JSON.stringify(state, null, 2));
    await browser.close();
    return sessionFile;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('login:')) throw e;
    return fail(`login: unexpected error — ${(e as Error).message}`);
  }
}
