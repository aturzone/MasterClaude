#!/usr/bin/env node
// findings-scope — a PreToolUse hook that turns "read-only toward your source" from a promise in an
// agent's prose into a guarantee. SKULL's four read-only agents — sentinel, security-auditor,
// tester, designer — may read anything but must write ONLY under their finding directories (+ skull.html).
// Today that boundary is prose the agent can drift past; this hook makes it enforced.
//
// AGENT-SCOPED — DO NOT WIRE GLOBALLY. A hook that denied every Write outside these dirs would break
// every normal coding session. It is meant to be attached to the read-only AGENTS via their `hooks:`
// frontmatter, so it only governs those agents' tool calls. That is why hooks/hooks.json wires the
// other three hooks globally but NOT this one.
//
// It can't tell WHICH agent it's running for from the event alone, so it keeps it simple: it enforces
// the UNION of write locations allowed to any read-only agent —
//   .sentinel/   (sentinel)   ·   .security/  (security-auditor)
//   .skull/         (tester → .skull/qa/, designer → .skull/design/)   ·   basename skull.html (tester + designer)
// If a specific agent needs a narrower or wider set, adjust ALLOWED and re-scope. A path outside the
// union is denied with a reason pointing back at the read-only contract. (Known nuance: the tester
// agent also writes to a QA workspace under .claude/skills/testing/engine/apps/<target>/ — if you
// wire this hook onto that agent, add that prefix to ALLOWED_DIRS, or it will be denied.)
//
// Contract (matches hooks/prod-rails.mjs): reads a PreToolUse event on stdin; prints a JSON decision;
// ALWAYS exits 0. Blocking is via permissionDecision, never the exit code. Fails OPEN on any error.
import fs from "node:fs";
import path from "node:path";

const ALLOW = () => { process.stdout.write("{}"); process.exit(0); };

let raw = "";
try { raw = fs.readFileSync(0, "utf8"); } catch { ALLOW(); }

let evt;
try { evt = JSON.parse(raw || "{}"); } catch { ALLOW(); }

const tool = evt.tool_name || evt.toolName || "";
if (tool !== "Write" && tool !== "Edit") ALLOW();

const input = evt.tool_input || evt.toolInput || {};
const filePath = input.file_path || input.filePath || "";
if (!filePath) ALLOW();

// Directory prefixes a read-only agent may write under, plus the one allowed loose file (skull.html).
const ALLOWED_DIRS = [".sentinel", ".security", ".skull"];
const ALLOWED_BASENAMES = ["skull.html"];

// Resolve file_path relative to the project root, then test the relative path against the prefixes.
// Absolute or relative input both work: path.resolve leaves an absolute path alone and joins a
// relative one onto root. We normalize the result to forward slashes before matching (path.relative
// yields backslashes on Windows).
const root = evt.cwd || process.cwd();
const relRaw = path.relative(root, path.resolve(root, filePath));
const rel = relRaw.replace(/\\/g, "/");
const base = (String(filePath).replace(/\\/g, "/").split("/").pop() || "");

const underAllowedDir = ALLOWED_DIRS.some((d) => rel === d || rel.startsWith(d + "/"));
const isAllowedBasename = ALLOWED_BASENAMES.includes(base);

if (underAllowedDir || isAllowedBasename) ALLOW();

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason:
      `findings-scope: refused to write ${filePath}. This is a SKULL read-only agent — it is ` +
      `read-only toward your source and may write ONLY under ${ALLOWED_DIRS.map((d) => d + "/").join(", ")} ` +
      `or to ${ALLOWED_BASENAMES.join(", ")}. Record this as a finding with a suggested fix instead of ` +
      `editing the source; applying the fix is the developer's or the Conductor's job, not the agent's.`,
  },
}));
process.exit(0);
