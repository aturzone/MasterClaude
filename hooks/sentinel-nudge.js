#!/usr/bin/env node
// SKULL — Sentinel nudge hook (dependency-free, cross-platform).
// Wired from .claude/settings.json on SessionStart and Stop. It NEVER runs a model and never
// edits anything — it only reads .sentinel/ + git and emits a short awareness line. It must always
// exit 0 so it can never break a session.
//
// Usage: node sentinel-nudge.js <session-start|stop>

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const EVENT = (process.argv[2] || "").toLowerCase();

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 500 }).trim();
  } catch {
    return "";
  }
}

// One-line git awareness for SessionStart: "git: on <branch>, N dirty, A ahead, B behind".
// Fully offline (no fetch), each git call capped at 500ms by git(), and swallows everything — not a repo,
// git missing, detached HEAD, or a timeout just yields "" and the git line is omitted. Never throws.
function gitLine(root) {
  try {
    const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch) return ""; // not a git repo, or git is absent
    const status = git(root, ["status", "--porcelain"]);
    const dirty = status ? status.split("\n").length : 0;
    const parts = [`on ${branch}`, `${dirty} dirty`];
    // ahead/behind vs upstream, guarded: with no upstream, @{u} fails and git() returns "" → 0/0, omitted.
    const [behind, ahead] = git(root, ["rev-list", "--left-right", "--count", "@{u}...HEAD"])
      .split(/\s+/)
      .map((n) => parseInt(n, 10) || 0);
    if (ahead) parts.push(`${ahead} ahead`);
    if (behind) parts.push(`${behind} behind`);
    return `git: ${parts.join(", ")}`;
  } catch {
    return ""; // never let git awareness break the hook
  }
}

// Walk up from cwd to find the project root (the dir containing .git or .sentinel).
function findRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 30; i++) {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, ".sentinel"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// Count open findings by severity from .sentinel/findings/*.md (cheap frontmatter scan).
function countOpen(findingsDir) {
  const out = { total: 0, critical: 0, high: 0 };
  let names = [];
  try {
    names = fs.readdirSync(findingsDir).filter((n) => /^F-\d+\.md$/.test(n));
  } catch {
    return out;
  }
  for (const n of names) {
    let head = "";
    try {
      head = fs.readFileSync(path.join(findingsDir, n), "utf8").slice(0, 600);
    } catch {
      continue;
    }
    if (!/^status:\s*open\b/m.test(head)) continue;
    out.total++;
    const sev = (head.match(/^severity:\s*(\w+)/m) || [])[1];
    if (sev === "critical") out.critical++;
    else if (sev === "high") out.high++;
  }
  return out;
}

function emitContext(text) {
  // SessionStart additionalContext is injected into the model's context.
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }),
  );
}

try {
  const root = findRoot();
  const gl = gitLine(root); // "" outside a repo / when git is missing — then no git line is prepended
  const sentinelDir = path.join(root, ".sentinel");
  const statePath = path.join(sentinelDir, "state.json");
  const head = git(root, ["rev-parse", "--short", "HEAD"]);

  // No map yet.
  if (!fs.existsSync(statePath)) {
    // Surface "no map yet" once per session (SessionStart); stay silent on Stop to avoid nagging.
    if (EVENT === "session-start") {
      const s = "Sentinel: no project map yet. Run /sentinel:map to build the project map and start tracking gaps.";
      emitContext(gl ? `${gl}\n${s}` : s);
    }
    process.exit(0);
  }

  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    process.exit(0); // corrupt/partial state — stay silent
  }

  const open = countOpen(path.join(sentinelDir, "findings"));
  const openStr = `${open.total} open finding(s)${open.total ? ` (${open.critical} critical, ${open.high} high)` : ""}`;
  const behind = head && state.lastSHA && head !== state.lastSHA;

  if (EVENT === "session-start") {
    const text = behind
      ? `Sentinel: map is behind HEAD (last reviewed ${state.lastSHA}, now ${head}). ${openStr}. Run /sentinel:sweep to update.`
      : `Sentinel: map current at ${head || state.lastSHA}. ${openStr}. /sentinel:report for details.`;
    emitContext(gl ? `${gl}\n${text}` : text);
  } else if (EVENT === "stop" && behind) {
    // Quiet by default; nudge only when commits have landed since the last review.
    process.stdout.write(`Sentinel: ${head} is ahead of the last review (${state.lastSHA}) — run /sentinel:sweep to keep the map current.\n`);
  }
} catch {
  // never break the session
}
process.exit(0);
