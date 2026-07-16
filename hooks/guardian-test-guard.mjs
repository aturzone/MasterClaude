#!/usr/bin/env node
// guardian-test-guard — a PreToolUse hook that turns guardian's "tests are sacred" rule from prose
// the model can talk itself out of into a hard guarantee. It blocks the one move guardian's whole
// reputation rests on: silently weakening or skipping a test to make a suite go green.
//
// Why a hook and not just the skill: a skill is guidance, and guidance loses to compaction and to a
// long green-the-build session. A PreToolUse deny is the hard stop. This is opt-in enforcement — it
// only runs if wired into settings.json (scripts/install-hooks.mjs) or shipped via the plugin
// (hooks/hooks.json). Inert until then; shipping the script does not make MASTER CLAUDE non-inert.
//
// Scope: only Edit/Write whose file_path looks like a test. Anything else → allow.
//   - Edit: diff old_string vs new_string — we can see exactly what changed.
//   - Write: full-file replacement, so we CANNOT diff. We can only see the new content, so we can
//     flag a skip/only marker being present but cannot prove it is newly added, and cannot detect a
//     DELETED assertion at all. Honesty about that limit is baked into the Write decision (ask, not
//     deny) and its reason.
//
// Decision tiers (false-positives that hard-block are how a guardrail gets disabled, so deny is
// reserved for the unambiguous cases and everything doubtful is "ask"):
//   deny  — a skip/ignore marker was ADDED (it.skip/xit/pytest.mark.skip/@Ignore/@Disabled/t.Skip…),
//           or an assertion was COMMENTED OUT. Both unambiguously defeat the test.
//   ask   — a .only/focus was added (suppresses sibling tests), assertions merely dropped in count
//           (could be a legit refactor), or a full-file Write contains a skip/only marker.
//   allow — everything else, and any parse error (fail OPEN — a hook must never wedge a session).
//
// Contract (matches hooks/prod-rails.mjs): reads a PreToolUse event on stdin; prints a JSON decision;
// ALWAYS exits 0. Blocking is done with permissionDecision, never the exit code.
import fs from "node:fs";

const ALLOW = () => { process.stdout.write("{}"); process.exit(0); };
const DECIDE = (permissionDecision, reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
};

let raw = "";
try { raw = fs.readFileSync(0, "utf8"); } catch { ALLOW(); }

let evt;
try { evt = JSON.parse(raw || "{}"); } catch { ALLOW(); }

const tool = evt.tool_name || evt.toolName || "";
if (tool !== "Edit" && tool !== "Write") ALLOW();

const input = evt.tool_input || evt.toolInput || {};
const filePath = input.file_path || input.filePath || "";
if (!filePath) ALLOW();

// ---- scope: is this a test file? (*.test.* · *.spec.* · *_test.* · test_*.py · **/tests/** · **/__tests__/**)
function isTestFile(fp) {
  const p = String(fp).replace(/\\/g, "/");
  const base = p.split("/").pop() || "";
  return (
    /\.test\./i.test(base) ||
    /\.spec\./i.test(base) ||
    /_test\.[^.]+$/i.test(base) ||   // foo_test.go, foo_test.py, foo_test.js
    /^test_.*\.py$/i.test(base) ||   // Python: test_foo.py
    /(^|\/)tests\//i.test(p) ||      // **/tests/**
    /(^|\/)__tests__\//i.test(p)     // **/__tests__/**
  );
}
if (!isTestFile(filePath)) ALLOW();

// ---- markers ---------------------------------------------------------------------------------
// Skip/ignore: framework-anchored so we don't deny an unrelated `.skip()` (e.g. an RxJS operator).
const SKIP_MARKERS = [
  /\bit\.skip\s*\(/i, /\btest\.skip\s*\(/i, /\bdescribe\.skip\s*\(/i, /\bcontext\.skip\s*\(/i,
  /\bsuite\.skip\s*\(/i, /\bspecify\.skip\s*\(/i,
  /\bxit\s*\(/, /\bxdescribe\s*\(/, /\bxtest\s*\(/, /\bxcontext\s*\(/,
  /@?pytest\.mark\.skip/i, /@unittest\.skip/i, /\bself\.skipTest\s*\(/,
  /@Ignore\b/, /@Disabled\b/,                 // JUnit 4 / JUnit 5
  /\bt\.Skip(?:Now)?\s*\(/,                    // Go
];
// Focus markers: .only / jasmine fit/fdescribe — they make the runner SKIP every sibling test.
const ONLY_MARKERS = [
  /\bit\.only\s*\(/i, /\btest\.only\s*\(/i, /\bdescribe\.only\s*\(/i, /\bcontext\.only\s*\(/i,
  /\bfit\s*\(/, /\bfdescribe\s*\(/,
];
// A line that carries an assertion (JS expect/should, Python/JUnit assert*, chai should).
const ASSERT_LINE = /\bassert\w*|\bexpect\s*\(|\.should\b|\bshould\s*[.(]/i;

const countHits = (text, markers) =>
  markers.reduce((n, re) => n + (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length, 0);

const firstMarkerName = (text, markers) => {
  for (const re of markers) { const m = text.match(re); if (m) return m[0].trim(); }
  return "a marker";
};

const isCommentLine = (line) => {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("#") || t.startsWith("*") || t.startsWith("/*");
};
function assertCounts(text) {
  let active = 0, commented = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (!ASSERT_LINE.test(line)) continue;
    if (isCommentLine(line)) commented++; else active++;
  }
  return { active, commented };
}

const HONEST = "If this test is genuinely wrong, fix or delete it deliberately — don't skip it to go green.";

// ---- Write: cannot diff. Flag a present skip/only marker as "ask" (we can't prove it's new, and
//      we can't see a deletion at all — so we never hard-deny a Write).
if (tool === "Write") {
  const content = String(input.content || "");
  const skip = countHits(content, SKIP_MARKERS);
  const only = countHits(content, ONLY_MARKERS);
  if (skip || only) {
    const which = skip ? firstMarkerName(content, SKIP_MARKERS) : firstMarkerName(content, ONLY_MARKERS);
    DECIDE("ask",
      `guardian-test-guard: the new contents of ${filePath} contain a test skip/focus marker ("${which}"). ` +
      `This is a full-file write, so I can't diff it to confirm the marker is newly added, and can't detect a ` +
      `deleted assertion at all — confirm this isn't silently disabling a test. ${HONEST}`);
  }
  ALLOW();
}

// ---- Edit: diff old_string vs new_string.
const oldStr = String(input.old_string ?? input.oldString ?? "");
const newStr = String(input.new_string ?? input.newString ?? "");
if (!oldStr && !newStr) ALLOW();

const skipAdded = countHits(newStr, SKIP_MARKERS) > countHits(oldStr, SKIP_MARKERS);
const onlyAdded = countHits(newStr, ONLY_MARKERS) > countHits(oldStr, ONLY_MARKERS);
const oldA = assertCounts(oldStr), newA = assertCounts(newStr);
const assertionCommentedOut = newA.commented > oldA.commented && newA.active < oldA.active;
const assertionsDropped = newA.active < oldA.active;

// deny (unambiguous) first, then ask (doubtful).
if (skipAdded) {
  const which = firstMarkerName(newStr, SKIP_MARKERS);
  DECIDE("deny",
    `guardian-test-guard: this edit disables a test — it adds a skip/ignore marker ("${which}") to ${filePath}. ` +
    `A skipped test can't protect you: the suite goes green while the behavior goes unchecked. ${HONEST}`);
}
if (assertionCommentedOut) {
  DECIDE("deny",
    `guardian-test-guard: this edit comments out an assertion in ${filePath} ` +
    `(active assertions ${oldA.active} → ${newA.active}, commented ${oldA.commented} → ${newA.commented}). ` +
    `A commented-out assertion still counts as a passing test but verifies nothing. ${HONEST}`);
}
if (onlyAdded) {
  const which = firstMarkerName(newStr, ONLY_MARKERS);
  DECIDE("ask",
    `guardian-test-guard: this edit adds a focus marker ("${which}") to ${filePath}, which makes the runner ` +
    `skip every OTHER test in the file. If committed, the rest of the suite silently stops running. ` +
    `Confirm this is intentional. ${HONEST}`);
}
if (assertionsDropped) {
  DECIDE("ask",
    `guardian-test-guard: this edit removes ${oldA.active - newA.active} assertion(s) from ${filePath} ` +
    `(${oldA.active} → ${newA.active}). That may be a legitimate refactor, or it may be quietly weakening the ` +
    `test. Confirm it's intended. ${HONEST}`);
}

ALLOW();
