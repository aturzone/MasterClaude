import type { Page } from '@playwright/test';

export interface HumanAnswer {
  status: 'pass' | 'fail' | 'manual-pending';
  notes?: string;
}

/**
 * Human-in-the-loop prompt, rendered INSIDE the browser page as an overlay so the
 * tester answers where they are looking. In CI / headless runs it resolves to
 * "manual-pending" so the task is queued for a later interview session instead.
 */
export async function promptHumanInPage(
  page: Page,
  prompt: string,
  opts?: { headed?: boolean },
): Promise<HumanAnswer> {
  const attended = opts?.headed ?? process.env.QA_HEADED === '1';
  if (process.env.CI || !attended) {
    return { status: 'manual-pending', notes: 'not an attended headed run' };
  }

  await page.evaluate((text) => {
    const w = window as typeof window & { __mcqaHumanResult?: unknown };
    delete w.__mcqaHumanResult;
    const host = document.createElement('div');
    host.id = '__mc-qa-human-prompt';
    host.setAttribute(
      'style',
      'position:fixed;inset:auto 16px 16px 16px;z-index:2147483647;background:#111;color:#fff;' +
        'padding:16px;border-radius:12px;font:14px/1.6 system-ui;box-shadow:0 8px 32px rgba(0,0,0,.5)',
    );
    host.innerHTML =
      `<div style="margin-bottom:8px;white-space:pre-wrap">🧪 SKULL QA — ${text}</div>` +
      `<textarea id="__mc-qa-notes" placeholder="notes (optional)" style="width:100%;min-height:40px;margin-bottom:8px"></textarea>` +
      `<div style="display:flex;gap:8px">` +
      `<button id="__mc-qa-pass" style="flex:1;padding:8px;background:#16a34a;color:#fff;border:0;border-radius:8px;cursor:pointer">Pass ✓</button>` +
      `<button id="__mc-qa-fail" style="flex:1;padding:8px;background:#dc2626;color:#fff;border:0;border-radius:8px;cursor:pointer">Fail ✗</button>` +
      `</div>`;
    document.body.appendChild(host);
    const answer = (status: string) => {
      const notes = (document.getElementById('__mc-qa-notes') as HTMLTextAreaElement)?.value;
      w.__mcqaHumanResult = { status, notes };
      host.remove();
    };
    document.getElementById('__mc-qa-pass')!.addEventListener('click', () => answer('pass'));
    document.getElementById('__mc-qa-fail')!.addEventListener('click', () => answer('fail'));
  }, prompt);

  const handle = await page.waitForFunction(
    () => (window as typeof window & { __mcqaHumanResult?: unknown }).__mcqaHumanResult,
    undefined,
    { timeout: 0 },
  );
  return (await handle.jsonValue()) as HumanAnswer;
}
