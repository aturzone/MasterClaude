#!/usr/bin/env node
// install-hooks — the opt-in arming switch for the plain-.md tier of MASTER CLAUDE.
//
// MASTER CLAUDE is inert by default: copying the .md files into .claude/ runs nothing, and shipping
// the scripts in hooks/ runs nothing either. Enforcement only turns on when a hook is deliberately
// wired into .claude/settings.json. If you installed MASTER CLAUDE as a Claude Code PLUGIN, the
// plugin's hooks/hooks.json already wires the global hooks and you do NOT need this script. This
// script is for people who copied the .md files by hand and want the same enforcement.
//
// What it wires (the three hooks that are safe to run globally):
//   SessionStart / Stop  → sentinel-nudge.js   (read-only awareness line)
//   PreToolUse  Bash     → prod-rails.mjs       (deny irreversible shell on a known-prod box)
//   PreToolUse  Edit|Write → guardian-test-guard.mjs (block silently skipping/weakening a test)
// It does NOT wire findings-scope.mjs — that hook is agent-scoped (wired via an agent's `hooks:`
// frontmatter), never global.
//
// It is careful: it shows the EXACT diff first, ASKS before writing, is idempotent (re-running is a
// no-op once wired), never writes secrets, and only ever touches the top-level "hooks" block —
// every other key in your settings.json is preserved untouched. On anything but an explicit "yes"
// it prints the manual instructions and writes nothing.
//
// Usage:  node scripts/install-hooks.mjs [projectDir]
//         projectDir defaults to the current working directory.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import readline from "node:readline";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
// Absolute path to THIS checkout's hooks/ dir, forward-slashed so it is shell- and JSON-clean on
// every OS (node accepts forward slashes on Windows too).
const HOOKS_DIR = path.resolve(HERE, "..", "hooks").replace(/\\/g, "/");

const projectDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const claudeDir = path.join(projectDir, ".claude");
const settingsPath = path.join(claudeDir, "settings.json");

const cmd = (script, arg) => `node "${HOOKS_DIR}/${script}"${arg ? " " + arg : ""}`;

// The hooks this installer wires. Each spec knows its event, optional matcher, and the script whose
// basename identifies it inside settings.json (for the idempotency check).
const SPECS = [
  { event: "SessionStart",                 script: "sentinel-nudge.js",       command: cmd("sentinel-nudge.js", "session-start") },
  { event: "Stop",                         script: "sentinel-nudge.js",       command: cmd("sentinel-nudge.js", "stop") },
  { event: "PreToolUse", matcher: "Bash",       script: "prod-rails.mjs",         command: cmd("prod-rails.mjs") },
  { event: "PreToolUse", matcher: "Edit|Write", script: "guardian-test-guard.mjs", command: cmd("guardian-test-guard.mjs") },
];

const groupFor = (spec) => ({
  ...(spec.matcher ? { matcher: spec.matcher } : {}),
  hooks: [{ type: "command", command: spec.command }],
});

// Is this spec already wired? True iff settings.hooks[event] holds a hook whose command mentions the
// spec's script basename. Within a single event each of our specs uses a distinct script, so the
// basename identifies it unambiguously.
function isWired(settings, spec) {
  const groups = settings?.hooks?.[spec.event];
  if (!Array.isArray(groups)) return false;
  return groups.some((g) =>
    Array.isArray(g?.hooks) && g.hooks.some((h) => typeof h?.command === "string" && h.command.includes(spec.script)),
  );
}

// Read + parse existing settings.json. Returns { settings, existed, corrupt }.
function readSettings() {
  if (!fs.existsSync(settingsPath)) return { settings: {}, existed: false, corrupt: false };
  let text = "";
  try { text = fs.readFileSync(settingsPath, "utf8"); } catch { return { settings: {}, existed: true, corrupt: true }; }
  try { return { settings: JSON.parse(text || "{}"), existed: true, corrupt: false }; }
  catch { return { settings: {}, existed: true, corrupt: true }; }
}

// Merge missing specs into a deep copy; return { next, added }.
function planMerge(settings) {
  const next = JSON.parse(JSON.stringify(settings || {}));
  next.hooks = next.hooks || {};
  const added = [];
  for (const spec of SPECS) {
    if (isWired(next, spec)) continue;
    next.hooks[spec.event] = next.hooks[spec.event] || [];
    next.hooks[spec.event].push(groupFor(spec));
    added.push(spec);
  }
  return { next, added };
}

// The standalone hooks block, for the manual-instructions path.
function manualBlock() {
  const hooks = {};
  for (const spec of SPECS) {
    hooks[spec.event] = hooks[spec.event] || [];
    hooks[spec.event].push(groupFor(spec));
  }
  return JSON.stringify({ hooks }, null, 2);
}

function label(spec) {
  return spec.matcher ? `${spec.event} [${spec.matcher}]` : spec.event;
}

function prompt(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.question(q, (a) => { answered = true; rl.close(); resolve(String(a).trim().toLowerCase()); });
    rl.on("close", () => { if (!answered) resolve(""); }); // EOF with no line → treat as "no"
  });
}

async function main() {
  console.log(`MASTER CLAUDE — arm the opt-in enforcement hooks`);
  console.log(`Project:  ${projectDir}`);
  console.log(`Settings: ${settingsPath}${fs.existsSync(settingsPath) ? "" : "  (will be created)"}`);
  console.log(`Hooks:    ${HOOKS_DIR}\n`);

  const { settings, existed, corrupt } = readSettings();

  if (corrupt) {
    console.log(`⚠ ${settingsPath} exists but is not valid JSON. I will not touch it.`);
    console.log(`Fix the JSON, or add this "hooks" block by hand:\n`);
    console.log(manualBlock());
    process.exit(0);
  }

  const { next, added } = planMerge(settings);

  if (added.length === 0) {
    console.log(`✓ Already wired — all three enforcement hooks are present in settings.json. Nothing to do.`);
    process.exit(0);
  }

  // Show the EXACT diff: which hooks get added, and the resulting "hooks" block.
  console.log(`These hooks will be ADDED (absolute paths to this checkout's hooks/):`);
  for (const spec of added) console.log(`  + ${label(spec).padEnd(22)} → ${spec.command}`);
  if (added.length < SPECS.length) {
    for (const spec of SPECS) if (!added.includes(spec)) console.log(`    (already present: ${label(spec)})`);
  }
  console.log(`\nResulting "hooks" block in ${settingsPath}:\n`);
  console.log(JSON.stringify({ hooks: next.hooks }, null, 2));
  console.log(`\nEvery other key in settings.json is left untouched. No secrets are written.\n`);

  const answer = await prompt(`Apply this to ${settingsPath}? [y/N] `);
  if (answer !== "y" && answer !== "yes") {
    console.log(`\nNo changes made. To wire these by hand, merge this into ${settingsPath}:\n`);
    console.log(manualBlock());
    process.exit(0);
  }

  try {
    if (!existed) fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch (e) {
    console.log(`\n✗ Could not write ${settingsPath}: ${e.message}`);
    console.log(`Add this "hooks" block by hand instead:\n`);
    console.log(manualBlock());
    process.exit(0);
  }

  console.log(`\n✓ Wired ${added.length} hook entr${added.length === 1 ? "y" : "ies"} into ${settingsPath}.`);
  console.log(`  Restart Claude Code (or /hooks) to load them. To undo, remove the "hooks" block from that file.`);
  process.exit(0);
}

main();
