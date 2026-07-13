import type { Page, TestInfo } from '@playwright/test';
import type { ServiceConfig } from '@mc-qa/core';

/** Secret values to scrub from any attached artifact, passed by the runner as QA_REDACT. */
export function redactionList(): string[] {
  try {
    const raw = process.env.QA_REDACT;
    return raw ? (JSON.parse(raw) as string[]).filter((s) => typeof s === 'string' && s.length >= 3) : [];
  } catch {
    return [];
  }
}

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join('«redacted»');
  return out;
}

export interface ConsoleEntry {
  type: 'error' | 'warning' | 'pageerror';
  text: string;
  location?: string;
  stack?: string;
}

/**
 * Browsers report uncaught errors from cross-origin scripts (served without CORS) as an opaque
 * "Script error." / bare "Error" with no message and no stack — details are stripped for security.
 * These are not first-party and not attributable from a black-box vantage, so they are filtered
 * from console-error violations. This is NOT allowlisting a first-party error (those carry a real
 * message/location); it only drops the browser's deliberately-opaque cross-origin noise.
 */
export function isOpaqueCrossOriginError(e: ConsoleEntry): boolean {
  return (
    e.type === 'pageerror' &&
    /^(script error\.?|error)$/i.test(e.text.trim()) &&
    !(e.stack && e.stack.trim().length > 0)
  );
}

export class ConsoleCapture {
  readonly entries: ConsoleEntry[] = [];
  constructor(private allowlist: string[]) {}

  attachTo(page: Page): void {
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warning') return;
      this.entries.push({
        type,
        text: msg.text(),
        location: `${msg.location().url}:${msg.location().lineNumber}`,
      });
    });
    page.on('pageerror', (err) => {
      this.entries.push({ type: 'pageerror', text: String(err.message ?? err), stack: err.stack ?? '' });
    });
  }

  /** Errors that are NOT excused by the service allowlist or the opaque-cross-origin filter. */
  violations(): ConsoleEntry[] {
    return this.entries.filter(
      (e) =>
        e.type !== 'warning' &&
        !isOpaqueCrossOriginError(e) &&
        !this.allowlist.some((allow) => e.text.includes(allow) || (e.location ?? '').includes(allow)),
    );
  }

  async flush(testInfo: TestInfo): Promise<void> {
    if (this.entries.length === 0) return;
    await testInfo.attach('console-log', {
      body: redact(JSON.stringify(this.entries, null, 2), redactionList()),
      contentType: 'application/json',
    });
  }
}

export interface NetworkEntry {
  url: string;
  kind: 'http-error' | 'request-failed';
  status?: number;
  failure?: string;
}

export class NetworkCapture {
  readonly entries: NetworkEntry[] = [];
  constructor(
    private allowlist: string[],
    private firstPartyOrigin: string | undefined,
  ) {}

  attachTo(page: Page): void {
    page.on('response', (res) => {
      if (res.status() >= 400) {
        this.entries.push({ url: res.url(), kind: 'http-error', status: res.status() });
      }
    });
    page.on('requestfailed', (req) => {
      this.entries.push({
        url: req.url(),
        kind: 'request-failed',
        failure: req.failure()?.errorText,
      });
    });
  }

  /** First-party failures not excused by the allowlist. Third-party noise is reported separately. */
  violations(): NetworkEntry[] {
    return this.entries.filter((e) => {
      if (this.allowlist.some((allow) => e.url.includes(allow))) return false;
      if (this.firstPartyOrigin) {
        try {
          if (new URL(e.url).origin !== this.firstPartyOrigin) return false;
        } catch {
          return false;
        }
      }
      // aborted requests are normal SPA behavior (navigation cancels fetches)
      if (e.kind === 'request-failed' && /ERR_ABORTED|NS_BINDING_ABORTED/.test(e.failure ?? '')) return false;
      return true;
    });
  }

  async flush(testInfo: TestInfo): Promise<void> {
    if (this.entries.length === 0) return;
    await testInfo.attach('network-log', {
      body: redact(JSON.stringify(this.entries, null, 2), redactionList()),
      contentType: 'application/json',
    });
  }
}

export interface WsSummary {
  url: string;
  framesSent: number;
  framesReceived: number;
  closed: boolean;
}

export class WsCapture {
  readonly sockets: WsSummary[] = [];

  attachTo(page: Page): void {
    page.on('websocket', (ws) => {
      const summary: WsSummary = { url: ws.url(), framesSent: 0, framesReceived: 0, closed: false };
      this.sockets.push(summary);
      ws.on('framesent', () => summary.framesSent++);
      ws.on('framereceived', () => summary.framesReceived++);
      ws.on('close', () => (summary.closed = true));
    });
  }

  async flush(testInfo: TestInfo): Promise<void> {
    if (this.sockets.length === 0) return;
    await testInfo.attach('ws-log', {
      body: redact(JSON.stringify(this.sockets, null, 2), redactionList()),
      contentType: 'application/json',
    });
  }
}

export function allowlistsFrom(cfg: ServiceConfig | undefined) {
  return {
    consoleAllow: cfg?.consoleErrorAllowlist ?? [],
    requestAllow: cfg?.failedRequestAllowlist ?? [],
  };
}
