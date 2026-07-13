# Risk & Safety

This is a black-box QA suite for any web app. The single most important rule:

> **Real-world / irreversible actions never run unattended — enforced structurally, not by convention.**

## Risk classes

Every task declares `risk.class`:

| Class | Meaning | Examples |
|---|---|---|
| **a** | Public, no auth, no state change | landing pages, static content, links, Lighthouse |
| **b** | Authenticated, read-only or reversible | view data, toggle a preference, open a form *without submitting* |
| **c** | State-mutating but test-scoped / reversible | create-then-delete a record, enable/disable a setting, place-and-cancel |
| **d** | Irreversible / real-world side effect | payment, permanent deletion, sending a message/email, publishing |

A separate `risk.thirdParty` array (`sms-otp`, `email-link`, `payment-gateway`,
`identity-verification`, `push`, `external-service`) marks external legs that cap automation —
they drive `humanInvolvement`, not the risk class.

## Env profiles

Each service has `envs/<name>.json` (committed, **non-secret**). A profile declares which risk
classes may run **unattended** vs only **supervised**:

```jsonc
{
  "name": "production.test-account",
  "baseURL": "https://example.com",
  "accountType": "test",
  "unattendedRiskClasses": ["a", "b"],   // d can NEVER appear here — the schema forbids it
  "supervisedRiskClasses": ["c"],
  "ciAllowed": true,
  "secrets": { "phone": "${env:MC_QA_EXAMPLE_PRODTEST_PHONE}" }
}
```

The `unattendedRiskClasses` **schema enum is `["a","b","c"]` only** — it is structurally
impossible to configure class `d` to run unattended.

## The three gate layers (defense in depth)

1. **Planner** (`packages/core/src/risk-gate.ts`) — every candidate task is gated before the run.
   Refusals are written to `results/<run>/plan.json` under `refused[]` with a reason and echoed
   to the console. Never a silent drop.
2. **Fixture** (`packages/fixtures` `riskGuard`) — every generated `test()` re-reads
   `QA_ALLOWED_RISK` from the environment and hard-fails if the task's class exceeds it — a
   class-only check; there is no spend cap. This protects against invoking `playwright test`
   directly, around the CLI.
3. **Agent briefs** — the brief restates the task's `forbiddenActions` verbatim plus the global
   service blocklist from `agent-context.md`. Agent-executor tasks are **capped at risk `b`** by
   the validator; risky exploration is always `human` or `hybrid`.

## Supervised runs

Running a `c`/`d`-class task requires **all** of:
- `--supervised` flag, and an **attended, non-CI** session,
- a typed `CONFIRM <taskId>` per task at the prompt,
- the supervisor's `git config user.email` is recorded in the run's `plan.json`
  (`filters.supervisor`).

There is no spend cap or money ceiling to configure — a class `c`/`d` task is gated purely by its
declared class plus supervision. Any test-scoped state a `c`-class task created is undone by the
mandatory **teardown checklist** (delete, disable, cancel) at the end of the session.

## Attended live human tasks (class-c inspect-only)

Some tasks can only be done by a physically-present human (password/OTP login, identity
verification liveness, push-notification delivery, walking an irreversible flow up to — but not
through — its confirm). These run in **attended live mode**: a headed browser opens **on the
host** (like the manual-login button), the tester performs the action while the whole session is
**video-recorded**, and the interview questions are answered in parallel (`pnpm qa attend`).

The gate has one deliberate, narrow exception for these (`risk-gate.ts`): a **class-`c`** task
whose executor resolves to the **human lane** may be *queued* as an **inspect-only attended
interview** even without `--supervised` (`PlanEntry.attendedOnly = true`). This does **not**
weaken safety:

- **Queuing executes nothing.** The execution is a present human, not unattended automation. The
  agent lane is still capped at risk `b`; nothing automated can touch a class-`c` task.
- **Inspect-only is the contract.** The tester sees a bold "INSPECT ONLY — do not pass the final
  confirm" banner plus the task's `forbiddenActions`, and the video proves exactly where they
  stopped.
- **Mandatory sign-off.** Every attended result is born `pending-review`; it cannot count green
  until a **different** reviewer (never the tester) approves it after watching the video/answers.
- **Class `d` is untouched** — never eligible for this exception, still refused everywhere except
  a terminal `--supervised` + typed-`CONFIRM` run; still schema-impossible unattended.
- **Sensitive-data privacy.** A class-`c` screen can show the tester's real personal data, so
  attended videos are **disk-only** (never shipped anywhere — the report links the path), and
  typed answers are run through a PII scrubber. The capture policy is honest: the video *does*
  contain it.
- Crossing into class `d` from an attended session is **not** built. Real execution of an
  irreversible action stays terminal-only via `--supervised` + typed `CONFIRM`.

## Inspect-only agent coverage of gated flows

To keep human touches minimal, the **agent** lane covers the *UI* of gated flows read-only (where
bugs hide) while the irreversible act stays human — for example, a login-screen inspect task
(validation/error copy; never submits, never requests an OTP), a checkout/order-form inspect task
(class `b`; walks the form, stops before the final submit), an account-status display inspect
task (never uploads or enters PII), or a permission-prompt inspect task (the browser/OS
permission UI; never grants). All resolve to lane=agent; the ones sitting in front of a sensitive
submit carry a short guard-token `forbiddenActions` (the literal text of the submit/confirm
button) so the action-guard hard-blocks it in addition to the brief. **Video-PII posture:** an
authenticated agent recording of a sensitive screen (real personal data) is **disk-only** — kept
in `evidence/videos/` as proof but never shipped anywhere (same rule as class-c human videos).

## Destructive tasks & the shared keeper

A task that deliberately breaks its own browser context (offline emulation, tab-kill —
`automation.destructiveContext:true`, auto-detected for `resil.interrupt.*`) runs **last** in the
serialized auth lane and the Session Keeper is **force-restarted** after it, so it can never poison
the shared logged-in context for the tasks behind it. It keeps `browser_tabs` (its mission) but never
`browser_close`.

## Secrets

- One git-ignored `.env` at the repo root. Names: `MC_QA_<SERVICE>_<ENV>_<KEY>`.
- `.env.example` documents every name with empty values (the only env file committed).
- Profiles reference secrets only as `${env:NAME}` placeholders, resolved lazily, **never logged**;
  the resolved values feed the redaction list of the console/network/WS capture fixtures.
- Account **references** (not values) live in `apps/<svc>/data/accounts.json`.
