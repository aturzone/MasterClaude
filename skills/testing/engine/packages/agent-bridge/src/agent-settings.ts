import fs from 'node:fs';
import path from 'node:path';

/** Tools that would close the shared Session Keeper's browser or its tabs — removed from the
 * allowlist AND hard-denied whenever the agent is attached to the keeper's live context, so it can
 * never destroy the one logged-in session that every other auth task depends on. */
export const KEEPER_UNSAFE_TOOLS = ['mcp__playwright__browser_close', 'mcp__playwright__browser_tabs'];

/** DevTools screencast video tools (enabled via `--caps devtools` on the CDP-attach branch). The
 * isolated lane films natively via recordVideo; the attached lane can't, so it drives these two
 * tools instead to produce a .webm. Only these two — chapter/show-actions add turn cost, no evidence. */
export const KEEPER_VIDEO_TOOLS = ['mcp__playwright__browser_start_video', 'mcp__playwright__browser_stop_video'];

/**
 * Browser tools the autonomous agent may use. Anything not listed is denied in `-p` mode.
 * `sharedSession` = the task is attached to the Session Keeper over CDP; in that mode the
 * keeper-unsafe tools (close / tabs) are withheld so the agent cannot kill the shared session.
 * `allowTabs` = a DESTRUCTIVE task (offline/tab-kill) whose mission legitimately needs
 * `browser_tabs`; it is re-allowed (but `browser_close`, which would kill the whole keeper browser
 * and wedge the MCP client, never is). Safe only because the driver force-restarts the keeper right
 * after a destructive task runs.
 */
export function agentAllowedTools(vision: boolean, sharedSession = false, allowTabs = false): string[] {
  const base = [
    'Read',
    'Write',
    'mcp__playwright__browser_navigate',
    'mcp__playwright__browser_navigate_back',
    'mcp__playwright__browser_snapshot',
    'mcp__playwright__browser_take_screenshot',
    'mcp__playwright__browser_click',
    'mcp__playwright__browser_hover',
    'mcp__playwright__browser_type',
    'mcp__playwright__browser_press_key',
    'mcp__playwright__browser_select_option',
    'mcp__playwright__browser_fill_form',
    'mcp__playwright__browser_wait_for',
    'mcp__playwright__browser_console_messages',
    'mcp__playwright__browser_network_requests',
    'mcp__playwright__browser_network_request',
    'mcp__playwright__browser_resize',
    'mcp__playwright__browser_handle_dialog',
    'mcp__playwright__browser_tabs',
    'mcp__playwright__browser_verify_element_visible',
    'mcp__playwright__browser_verify_text_visible',
    'mcp__playwright__browser_verify_list_visible',
    'mcp__playwright__browser_verify_value',
    'mcp__playwright__browser_generate_locator',
    'mcp__playwright__browser_close',
  ];
  // Coordinate/vision tools only for the Flutter-canvas service, where there is no DOM.
  if (vision) base.push('mcp__playwright__browser_mouse_click_xy', 'mcp__playwright__browser_mouse_move_xy', 'mcp__playwright__browser_mouse_wheel');
  if (!sharedSession) return base;
  // A destructive task keeps browser_tabs (its mission is killing a tab); everyone else loses both.
  const withhold = allowTabs ? ['mcp__playwright__browser_close'] : KEEPER_UNSAFE_TOOLS;
  // Attached tasks film via the DevTools screencast tools (no context recordVideo over CDP).
  return [...base.filter((t) => !withhold.includes(t)), ...KEEPER_VIDEO_TOOLS];
}

/** Tools explicitly denied — the dangerous capabilities, even though the allowlist already excludes them. */
export const AGENT_DISALLOWED_TOOLS = [
  'Bash',
  'Edit',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'mcp__playwright__browser_evaluate',
  'mcp__playwright__browser_run_code_unsafe',
];

/** Absolute path to the PreToolUse/PostToolUse action-guard hook. */
export function guardHookPath(): string {
  return path.join(import.meta.dirname, '..', '..', '..', 'tools', 'agent-guard', 'guard.mjs').replaceAll('\\', '/');
}

/** Absolute path to the layered QA-agent system prompt. */
export function systemPromptPath(): string {
  return path.join(import.meta.dirname, '..', 'prompts', 'qa-agent-system.md');
}

/**
 * Write the Claude Code settings for an autonomous agent run: path-scoped Write/Read
 * permissions (the task dir is the sandbox) and the action-guard hook on every browser tool.
 */
export function writeAgentSettings(agentDir: string): string {
  const guard = `node "${guardHookPath()}"`;
  const abs = agentDir.replaceAll('\\', '/');
  const settings = {
    permissions: {
      // The brief's output contract uses absolute paths inside the task dir, so allow both
      // the relative cwd and the absolute task dir; deny anything above it and all secrets.
      allow: ['Read(./**)', 'Write(./**)', `Read(${abs}/**)`, `Write(${abs}/**)`],
      deny: [
        'Write(../**)',
        'Read(**/.env)',
        'Read(**/.env.*)',
        'Read(**/.session/**)',
        // The keeper manifest holds the UNAUTHENTICATED CDP endpoint = full control of the live
        // logged-in session. Already under .session/**, but denied explicitly as a hard boundary.
        'Read(**/*.keeper.json)',
        'Bash',
      ],
    },
    hooks: {
      PreToolUse: [{ matcher: 'mcp__playwright__.*', hooks: [{ type: 'command', command: guard }] }],
      PostToolUse: [{ matcher: 'mcp__playwright__browser_navigate', hooks: [{ type: 'command', command: guard }] }],
    },
  };
  const file = path.join(agentDir, 'agent-settings.json');
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  return file;
}

/** Per-task guard config the hook reads: the navigation origin allowlist, the task's risk class,
 * and its task-specific forbidden phrases. The guard hard-blocks confirm/submit/irreversible,
 * security-setting, credential/OTP and PII actions regardless — this only adds per-task context. */
export function writeGuardConfig(
  agentDir: string,
  cfg: { allowedOrigins: string[]; forbidden: string[]; riskClass: string },
): string {
  const file = path.join(agentDir, 'guard-config.json');
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}
