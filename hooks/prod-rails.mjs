#!/usr/bin/env node
// prod-rails — a PreToolUse hook that turns "on production, advisor not actor" from prose into a
// guarantee. It reads .mc/env (written by ops-env-map) and, when the environment is production,
// DENIES a short list of irreversible shell commands.
//
// Why a hook and not a skill: a skill is guidance the model can talk itself out of, and the platform
// says so — conversation-stated boundaries can be lost to compaction; a PreToolUse deny is the hard
// guarantee. This is opt-in enforcement: it only runs if wired into settings.json (scripts/
// install-hooks.mjs) or shipped via the plugin. Inert until then.
//
// Contract: reads a PreToolUse event on stdin; prints a JSON decision; ALWAYS exits 0 (a hook that
// crashes must fail OPEN — it may never wedge a session). Blocking is done with permissionDecision,
// not the exit code.
import fs from "node:fs";
import path from "node:path";

const ALLOW = () => { process.stdout.write("{}"); process.exit(0); };

let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
} catch { ALLOW(); }

let evt;
try { evt = JSON.parse(raw || "{}"); } catch { ALLOW(); }

// Only Bash is in scope — the danger is irreversible shell, not file edits (those are checkpointed).
const tool = evt.tool_name || evt.toolName || "";
const cmd = (evt.tool_input || evt.toolInput || {}).command || "";
if (tool !== "Bash" || !cmd) ALLOW();

// Where's the project root? The hook may run from anywhere; walk up for .mc/ or .git.
function root() {
  let d = evt.cwd || process.cwd();
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(d, ".mc")) || fs.existsSync(path.join(d, ".git"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return evt.cwd || process.cwd();
}

// Read .mc/env. No file, or not production → this hook has nothing to say. (ops-env-map's rule is
// that an *unprovable* environment is written as production, so the absence of the file is NOT
// treated as production here — that would block every dev session; the burden is on ops-env-map to
// have run. The hook enforces a known-prod verdict, it doesn't guess one.)
function isProd(r) {
  try {
    const t = fs.readFileSync(path.join(r, ".mc", "env"), "utf8");
    return /^\s*environment\s*:\s*production\b/im.test(t);
  } catch { return false; }
}

const r = root();
if (!isProd(r)) ALLOW();

// The deny list — irreversible, production-catastrophic shell. Each is a decision for a human, not
// a default an agent takes on a live box. Patterns are deliberately broad; false-positives here are
// cheap (the developer runs it themselves), a false-negative is a disaster.
const DENY = [
  [/\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]/, "rm -rf on a production box — destructive and unrecoverable"],
  [/\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i, "a destructive SQL statement against production data"],
  [/\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i, "an unbounded DELETE (no WHERE) against production data"],
  [/\bterraform\s+destroy\b/, "terraform destroy against production infrastructure"],
  [/\bkubectl\s+delete\b/, "kubectl delete against a production cluster"],
  [/\bdocker\s+(system\s+prune|volume\s+rm|rm\s+-\w*f)/, "removing production containers/volumes"],
  [/\bgit\s+push\b[\s\S]*(--force|-f)\b/, "a force-push from a production context"],
  [/\b(mkfs|dd\s+if=|:\s*>\s*\/|>\s*\/dev\/[sh]d)/, "a raw disk/filesystem write"],
  [/\bchmod\s+-R\s+777\b/, "a recursive world-writable chmod on production"],
];

for (const [re, why] of DENY) {
  if (re.test(cmd)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `prod-rails: refused — ${why}.\n` +
          `MASTER CLAUDE's posture on production is advisor with read access, never an actor. ` +
          `If this is genuinely intended, run it yourself, or change .mc/env if this is not actually production.`,
      },
    }));
    process.exit(0);
  }
}

ALLOW();
