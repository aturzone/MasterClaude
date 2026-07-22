#!/usr/bin/env node
// SKULL QA action guard — a Claude Code PreToolUse/PostToolUse hook (dependency-free ESM).
//
// It is the THIRD safety layer under the agent brief and the tool allowlist: it inspects
// each browser tool call and BLOCKS anything that would commit an irreversible action, change
// security settings, submit login/OTP, upload files, or enter PII — even on a class-a/b task.
//
// Contract: Claude Code pipes the tool call as JSON on stdin. To BLOCK a PreToolUse call
// we write the reason to stderr and exit 2 (the version-stable "blocking error" path).
// Allowing is exit 0. PostToolUse just records state (last navigated URL) and exits 0.
//
// Per-task config is read from <session-cwd>/guard-config.json (written by the driver).
// Denials are appended to <session-cwd>/guard-log.ndjson so the driver can abort a run
// that repeatedly attempts forbidden actions.

import fs from 'node:fs';
import path from 'node:path';

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Normalize text for matching: NFC, drop the zero-width non-joiner, lowercase.
function norm(s) {
  return String(s ?? '').normalize('NFC').replace(/‌/g, '').toLowerCase();
}

// Irreversible / state-committing controls — confirm, submit, pay, delete, publish, send, etc.
// Blocked on click and on accepting a dialog. Class-d actions never reach the agent lane (the
// validator caps agent tasks at risk b); this is the hard backstop that keeps an agent from
// committing an irreversible change during exploration.
const IRREVERSIBLE = /(confirm|submit|place order|check\s?out|purchase|buy\b|sell\b|\bpay\b|payment|delete|remove|withdraw|withdrawal|transfer|\bsend\b|publish|deactivate|unsubscribe|save changes)/i;
// Withdrawals / transfers / payouts move value out — called out explicitly for a clearer message.
const WITHDRAW_TRANSFER = /(withdraw|withdrawal|transfer|remit|payout|cash.?out)/i;
const SECURITY = /(two.?factor|2fa|disable|security settings|change password|passkey|api key|revoke)/i;
const OTP = /(otp|one.?time|verification code|passcode|password)/i;
const PAN = /\b\d{16}\b/; // card number
const LONG_ID = /(?<!\d)\d{10,}(?!\d)/; // long numeric identifier (SSN/national-id style) — likely PII

function deny(reason, cwd) {
  try {
    fs.appendFileSync(
      path.join(cwd || process.cwd(), 'guard-log.ndjson'),
      JSON.stringify({ at: new Date().toISOString(), reason }) + '\n',
    );
  } catch { /* best effort */ }
  process.stderr.write(`SKULL QA guard blocked this action: ${reason}\n`);
  process.exit(2);
}

function allow() {
  process.exit(0);
}

function main() {
  let input;
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    allow(); // can't parse — don't wedge the run; the tool allowlist is the hard boundary
    return;
  }
  const cwd = input.cwd || process.cwd();
  const tool = String(input.tool_name || '');
  const ti = input.tool_input || {};
  const ev = input.hook_event_name || 'PreToolUse';

  // Load per-task config (allowed origins, extra forbidden phrases, risk class).
  let cfg = { allowedOrigins: [], forbidden: [], riskClass: undefined };
  try {
    cfg = { ...cfg, ...JSON.parse(fs.readFileSync(path.join(cwd, 'guard-config.json'), 'utf8')) };
  } catch { /* no config → keyword rules still apply */ }

  const stateFile = path.join(cwd, 'guard-state.json');
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };

  // --- PostToolUse: record the last navigated URL for context-aware rules ---
  if (ev === 'PostToolUse') {
    if (tool.endsWith('browser_navigate') && ti.url) {
      try { fs.writeFileSync(stateFile, JSON.stringify({ lastUrl: String(ti.url) })); } catch { /* best effort */ }
    }
    allow();
    return;
  }

  const base = tool.replace(/^mcp__[a-z0-9_]+__/, '');

  // --- Hard-denied capabilities (also excluded from the allowlist — belt and suspenders) ---
  if (/^(browser_evaluate|browser_run_code_unsafe|browser_route|browser_unroute|browser_network_state_set)$/.test(base)) {
    deny(`tool "${base}" can bypass the UI (arbitrary JS / network mocking) and is never permitted`, cwd);
  }
  if (/(cookie|localstorage|sessionstorage|storage_state|set_storage)/i.test(base) && /(set|clear|delete|add)/i.test(base)) {
    deny(`tool "${base}" tampers with session/security storage`, cwd);
  }
  if (base === 'browser_file_upload') {
    deny('file upload is a PII vector and is not permitted during exploration', cwd);
  }

  // Flatten the tool input's human-facing text (element description, target text, values).
  const texts = [];
  const collect = (v) => {
    if (v == null) return;
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(ti.element);
  collect(ti.text);
  collect(ti.name);
  collect(ti.fields);
  collect(ti.value);
  collect(ti.values);
  collect(ti.submit);
  collect(ti.promptText);
  const hay = norm(texts.join(' | '));
  const extraForbidden = (cfg.forbidden || []).map(norm).filter(Boolean);

  // --- Navigation origin allowlist ---
  if (base === 'browser_navigate' && ti.url) {
    try {
      const origin = new URL(String(ti.url)).origin;
      const ok = (cfg.allowedOrigins || []).length === 0 || cfg.allowedOrigins.includes(origin);
      if (!ok) deny(`navigation to ${origin} is outside the allowed origins`, cwd);
    } catch { /* non-URL — let it pass, MCP will reject */ }
  }

  // --- Click / coordinate-click: block irreversible & security controls ---
  if (/(browser_click|browser_mouse_click_xy|browser_double_click)$/.test(base)) {
    if (WITHDRAW_TRANSFER.test(hay)) deny('withdrawal/transfer/payout controls are never permitted', cwd);
    if (SECURITY.test(hay)) deny('click on a security-setting control is forbidden', cwd);
    if (IRREVERSIBLE.test(hay)) deny(`click on an irreversible/confirm control ("${hay.slice(0, 60)}") is forbidden on this task`, cwd);
    if (extraForbidden.some((p) => hay.includes(p))) deny('click matches a task-specific forbidden action', cwd);
  }

  // --- Typing / form fill: block OTP/password/PII entry ---
  if (/(browser_type|browser_fill_form|browser_press_sequentially)$/.test(base)) {
    if (OTP.test(hay) || SECURITY.test(hay)) deny('entering credentials / OTP / security fields is forbidden', cwd);
    if (PAN.test(hay)) deny('a 16-digit value looks like a card number — refusing to enter PII', cwd);
    if (LONG_ID.test(hay)) deny('a long numeric value looks like a personal identifier — refusing to enter PII', cwd);
    if (extraForbidden.some((p) => hay.includes(p))) deny('input matches a task-specific forbidden action', cwd);
  }

  // --- Enter key while on the login page = form submit ---
  if (base === 'browser_press_key' && /enter/i.test(String(ti.key || ''))) {
    if (/\/login\b/.test(String(readState().lastUrl || ''))) deny('pressing Enter on /login would submit the login form', cwd);
  }

  // --- Accepting a dialog that commits an irreversible action ---
  if (base === 'browser_handle_dialog' && ti.accept === true) {
    if (WITHDRAW_TRANSFER.test(hay)) deny('accepting a withdrawal/transfer dialog is never permitted', cwd);
    if (IRREVERSIBLE.test(hay)) deny('accepting a confirmation dialog that commits an irreversible action is forbidden', cwd);
  }

  allow();
}

main();
