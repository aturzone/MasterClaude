import fs from 'node:fs';
import path from 'node:path';

export interface McpConfigOptions {
  headless?: boolean;
  /** Which browser Playwright MCP drives. Use a channel like "msedge"/"chrome" to reuse a
   * system-installed browser (no CDN download — required where the Playwright CDN is geo-blocked). */
  browser?: string;
  /** Autonomous driver mode: harden the browser (isolated profile, origin allowlist, timeouts). */
  autonomous?: boolean;
  /** Origins the browser may visit (autonomous mode). */
  allowedOrigins?: string[];
  /** Where Playwright MCP writes screenshots/output (autonomous: the task dir). */
  outputDir?: string;
  /** Reuse a saved authenticated session (from `qa login`) — path to a storageState JSON. */
  storageState?: string;
  /** Enable coordinate/vision tools (needed for the Flutter-canvas service only). */
  vision?: boolean;
  /** Drop screenshot bytes from tool responses to save tokens (evidence still saves to disk). */
  omitImageResponses?: boolean;
  /** Optional proxy passthrough (e.g. the system SOCKS5) for the browser. */
  proxyServer?: string;
  /** Record a full .webm video of the session into this dir (Playwright-native, automatic). */
  recordVideoDir?: string;
  /**
   * ATTACH-over-CDP mode: connect Playwright MCP to the long-lived Session Keeper's already-running,
   * logged-in browser instead of booting a fresh context. When set, we emit `--cdp-endpoint` and
   * OMIT `--isolated` + `--storage-state` (isolated would `newContext()` = a fresh, logged-OUT
   * context, re-triggering the token-rotation bug). This is the fix for the target app's rotation-on-use
   * refresh tokens (see keeper.ts). Mutually exclusive with the isolated `autonomous` path.
   */
  cdpEndpoint?: string;
  /** Pin the user-agent on the fresh isolated context (snapshot-fallback mode). Ignored in CDP mode
   * — there the UA is already pinned browser-wide by the keeper's `--user-agent` launch switch, and
   * MCP's `--user-agent` only applies to the isolated `newContext` path anyway. */
  userAgent?: string;
}

/**
 * MCP config for driving an agent task with Playwright MCP.
 *
 * - Attended mode (default): headed Chrome so a human can watch; Claude-in-Chrome is the
 *   alternative for on-site exploratory sessions.
 * - Autonomous mode (the `qa agent-run` driver): headless + isolated profile + an origin
 *   allowlist + write-to-task-dir + per-action timeouts. The dangerous JS/route/storage
 *   tools are additionally denied at the Claude permission layer and by the action guard.
 */
export function writeMcpConfig(agentDir: string, opts?: McpConfigOptions): string {
  const file = path.join(agentDir, 'mcp.json');
  // Pin the MCP version: the video-tool surface (--caps devtools → browser_start_video/stop_video)
  // is verified against 0.0.77; an unpinned `npx` fetch could shift it and silently break recording.
  const args = ['-y', '@playwright/mcp@0.0.77', '--browser', opts?.browser ?? 'chromium'];

  if (opts?.cdpEndpoint) {
    // Attach to the Session Keeper's live logged-in context. WITHOUT --isolated (and WITHOUT a
    // --storage-state), Playwright MCP 0.0.77 attaches to the connected browser's existing
    // contexts()[0] — exactly the keeper's authenticated context. No --headless either: headless
    // is a property of the keeper's already-launched browser, not of this attaching client.
    args.push('--cdp-endpoint', opts.cdpEndpoint);
    if (opts.allowedOrigins?.length) args.push('--allowed-origins', opts.allowedOrigins.join(';'));
    args.push('--output-dir', opts.outputDir ?? agentDir);
    args.push('--timeout-action', '10000', '--timeout-navigation', '60000');
    args.push('--save-session'); // structured action/snapshot log = replayable evidence
    // Playwright MCP's context `recordVideo` can't attach to an already-open CDP context, so instead
    // enable the DevTools capability: it exposes browser_start_video / browser_stop_video, which use
    // CDP screencast and DO work on an attached page (see agent-settings allowlist + the driver's
    // video preamble). This is how auth agent tasks get .webm evidence despite CDP-attach.
    const caps = ['devtools', ...(opts.vision ? ['vision'] : [])];
    args.push('--caps', caps.join(','));
    if (opts.omitImageResponses) args.push('--image-responses', 'omit');
    if (opts.proxyServer) args.push('--proxy-server', opts.proxyServer);
    // NB: --storage-state, recordVideo (contextOptions) and --user-agent only apply to the isolated
    // newContext path, so they are intentionally NOT emitted here — they would be silently ignored.
  } else if (opts?.autonomous) {
    args.push('--headless', '--isolated');
    if (opts.allowedOrigins?.length) args.push('--allowed-origins', opts.allowedOrigins.join(';'));
    args.push('--output-dir', opts.outputDir ?? agentDir);
    args.push('--timeout-action', '10000', '--timeout-navigation', '60000');
    args.push('--save-session'); // structured action/snapshot log = replayable evidence
    if (opts.storageState) args.push('--storage-state', opts.storageState);
    // Pin the same UA the login browser used so the fresh isolated context keeps one device
    // fingerprint (snapshot-fallback mode only — CDP-attach mode inherits the keeper's pinned UA).
    if (opts.userAgent) args.push('--user-agent', opts.userAgent);
    if (opts.vision) args.push('--caps', 'vision');
    if (opts.omitImageResponses) args.push('--image-responses', 'omit');
    if (opts.proxyServer) args.push('--proxy-server', opts.proxyServer);
    // Full-session video via a Playwright MCP config file (recordVideo context option).
    if (opts.recordVideoDir) {
      fs.mkdirSync(opts.recordVideoDir, { recursive: true });
      const pwConfig = path.join(agentDir, 'mcp-pw-config.json');
      fs.writeFileSync(
        pwConfig,
        JSON.stringify({ browser: { contextOptions: { recordVideo: { dir: opts.recordVideoDir } } } }, null, 2),
      );
      args.push('--config', pwConfig);
    }
  } else if (opts?.headless) {
    args.push('--headless');
  }

  const config = { mcpServers: { playwright: { command: 'npx', args } } };
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}
