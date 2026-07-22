/**
 * Core contracts of the SKULL QA workspace. Everything else compiles against this file.
 * A "task" is one JSON file under apps/<service>/tasks/ — see schemas/task.schema.json.
 */

import type { LocalizedText } from './i18n.ts';

export type RiskClass = 'a' | 'b' | 'c' | 'd';
export type Executor = 'script' | 'agent' | 'human' | 'hybrid';
export type StepExecutor = 'script' | 'agent' | 'human';
export type AutomationLevel = 'full' | 'assisted' | 'manual';
export type TaskLifecycleStatus = 'draft' | 'active' | 'quarantined' | 'deprecated';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Severity = 'blocker' | 'critical' | 'major' | 'minor' | 'cosmetic';
export type ThirdPartyLeg = 'sms-otp' | 'email-link' | 'payment-gateway' | 'identity-verification' | 'push' | 'external-service';
export type Frequency =
  | 'per-deploy' | 'per-release' | 'nightly' | 'weekly' | 'monthly' | 'on-demand';

export type TestType =
  | 'functional' | 'visual' | 'perf' | 'a11y' | 'security' | 'seo' | 'pwa'
  | 'rtl-i18n' | 'network' | 'console' | 'fuzz' | 'ux-judgment' | 'content'
  | 'resilience' | 'data-sanity';

export type EvidenceKind =
  | 'screenshot' | 'screenshot-full-page' | 'video' | 'trace' | 'har'
  | 'console-log' | 'network-log' | 'aria-snapshot' | 'lighthouse-report'
  | 'axe-report' | 'human-photo' | 'human-notes';

/** 0–5 scale with fixed operational semantics — see docs/risk-and-safety.md */
export type HumanInvolvement = 0 | 1 | 2 | 3 | 4 | 5;

export interface TaskStep {
  n: number;
  /** A step-DSL verb (script steps) or prose instruction (agent/human steps). */
  action: string;
  /** Per-step executor override; only meaningful when the task executor is "hybrid". */
  executor?: StepExecutor;
  /** goto target path (relative to baseURL) */
  target?: string;
  /** A selector-memory key like "login.phone-input" */
  locator?: string;
  selectorKeys?: string[];
  data?: Record<string, unknown>;
  /** expectText verb payload */
  text?: string;
  /** assertFontLoaded verb payload */
  font?: string;
  /** custom verb: function name registered in the service's specs/steps/ */
  fn?: string;
  /** screenshotCompare verb: baseline name */
  name?: string;
  /** Prose expectation checked mid-flow (documentation + human/agent oracle). */
  expect?: string;
  evidence?: EvidenceKind[];
  /** Prompt shown to the human for executor:"human" steps. */
  prompt?: string;
}

export interface AgentRubricItem {
  criterion: string;
  verdict: 'must-pass' | 'should-pass' | 'informational';
}

export interface AgentBrief {
  goal: string;
  constraints: string[];
  successRubric: AgentRubricItem[];
  hints?: string[];
  maxSteps?: number;
  selectorMapAccess?: 'read' | 'read-propose';
  /** Optional per-task model override (e.g. a cheaper model for a purely structural check). Falls
   * back to the run's --model / MC_QA_AGENT_MODEL / the default. Omit for judgment tasks. */
  model?: string;
}

export interface InterviewQuestion {
  id: string;
  /** Human-facing; `LocalizedText` (a plain string counts as both langs). Render via `pickLang`. */
  prompt: LocalizedText;
  observationHint?: LocalizedText;
  kind: 'boolean' | 'scale-1-5' | 'single-choice' | 'multi-choice' | 'text' | 'number';
  options?: string[];
  /** Exactly one operator. `manual: true` means a reviewer decides. */
  passWhen: {
    equals?: unknown;
    gte?: number;
    lte?: number;
    in?: unknown[];
    matches?: string;
    manual?: true;
  };
  evidencePrompt?: LocalizedText;
  failSeverity?: Severity;
}

/** Attended-live mode: the tester performs the task in a headed browser opened on the host
 * (like the manual-login button), with the whole session video-recorded. Presence of this block
 * makes the task "live-capable"; the questionnaire fallback always remains available. */
export interface HumanInterviewLive {
  /** Path (relative to baseURL) the attended browser opens at, e.g. "login", "account". */
  startPath?: string;
  /** Load the saved authenticated session (storageState) into the attended browser. */
  requiresAuth?: boolean;
  /** On finish, save the resulting storageState back as the run's session (login-flow tasks). */
  savesSession?: boolean;
}

export interface HumanInterview {
  /** Human-facing fields are `LocalizedText` (a plain English string is the common case) — render
   * via `pickLang`. A `{ en, … }` object can supply extra locales for a multi-language project. */
  intro: LocalizedText;
  setupChecklist?: LocalizedText[];
  estimatedMinutes: number;
  questions: InterviewQuestion[];
  teardownChecklist?: LocalizedText[];
  live?: HumanInterviewLive;
}

export interface Precondition {
  kind:
    | 'account-state' | 'permission-level' | 'balance' | 'feature-flag'
    | 'device' | 'network' | 'time-window' | 'data-fixture' | 'other';
  value: string;
  setupRef?: string;
}

export interface Task {
  schemaVersion: '1.0';
  /** `<service>.<taxonomy-path>.<slug>.<NNN>` e.g. "pwa.i18n.typography.webfont-loads.001" */
  id: string;
  /** Human-facing task name. A plain English string is the common case; a `{ en, … }` object can
   * supply per-locale strings for a multi-language project. Render via `pickLang(task.title, lang)`. */
  title: LocalizedText;
  goal: string;
  classification: {
    category: string;
    testTypes: TestType[];
    tags?: string[];
  };
  importance: {
    priority: Priority;
    severityIfBroken: Severity;
    businessImpact?: string;
  };
  risk: {
    class: RiskClass;
    thirdParty?: ThirdPartyLeg[];
    reason?: string;
    /** Env profile names this task may run under. */
    allowedEnvs: string[];
    /** Injected verbatim into agent briefs and interview screens. */
    forbiddenActions?: string[];
  };
  automation: {
    level: AutomationLevel;
    executor: Executor;
    humanInvolvement: HumanInvolvement;
    agentBrief?: AgentBrief;
    /**
     * This task deliberately BREAKS its own browser context — emulates offline, kills tabs, etc.
     * On the shared Session Keeper that would poison the one logged-in context for every auth task
     * queued after it (the driver-error cascade). Tagging it makes the driver run it LAST in the
     * serialized auth lane and force-restart the keeper immediately after. Auto-detected for the
     * `resil.interrupt.*` category, but set explicitly so the intent is on the record.
     */
    destructiveContext?: boolean;
    /** CLI-lane tasks (lighthouse budgets, link crawls) run a tool instead of steps. */
    cliKind?: 'lhci' | 'linkinator' | 'k6';
    cliUrls?: string[];
  };
  humanInterview?: HumanInterview;
  procedure: {
    preconditions?: Precondition[];
    steps: TaskStep[];
    testDataRefs?: string[];
    /** All selector-memory keys the task depends on; validated in CI. */
    selectorKeys?: string[];
  };
  oracle: {
    expected: Array<{ id: string; description: string; assertionRef?: string }>;
    evidence: { required: EvidenceKind[]; optional?: EvidenceKind[] };
    baselines?: { visual?: string; aria?: string; lighthouse?: string };
  };
  lifecycle: {
    status: TaskLifecycleStatus;
    owner: string;
    createdAt: string;
    updatedAt: string;
    flakiness?: { knownFlaky: boolean; notes?: string; quarantinedUntil?: string | null };
    relatedTasks?: string[];
    supersededBy?: string;
    sources?: Array<{
      type: 'faq' | 'docs' | 'support-article' | 'observed-behavior' | 'bug-report';
      url: string;
      note?: string;
    }>;
  };
  schedule: {
    frequency: Frequency[];
    estimatedDurationSec: number;
    timeoutSec?: number;
  };
}

/** Committed, non-secret env profile. Class "d" can never be unattended — the type forbids it. */
export interface EnvProfile {
  name: string;
  /** May contain "${env:NAME}" placeholders. */
  baseURL: string;
  accountType: 'none' | 'test' | 'real';
  unattendedRiskClasses: Array<Exclude<RiskClass, 'd'>>;
  supervisedRiskClasses: RiskClass[];
  headedOnly?: boolean;
  ciAllowed?: boolean;
  /** Values are "${env:NAME}" placeholders, resolved lazily and never logged. */
  secrets?: Record<string, string>;
}

export interface ServiceConfig {
  id: string;
  displayName: string;
  /** Default env profile name, e.g. "production.test-account" */
  defaultEnv: string;
  locale: string;
  timezoneId: string;
  digitPolicy: 'persian' | 'latin' | 'mixed';
  /** Substrings; console errors containing any of these are tolerated (third-party noise). */
  consoleErrorAllowlist: string[];
  /** URL substrings; failed requests matching these are tolerated (sanctions-blocked CDNs etc). */
  failedRequestAllowlist: string[];
  perfLane?: 'lhci' | 'unlighthouse' | 'none';
  expectedFonts?: string[];
  viewport?: { width: number; height: number };
}

export interface ChecklistSection {
  id: string;
  /** Section heading; `LocalizedText` (plain string = both langs). Render via `pickLang`. */
  title: LocalizedText;
  /** Failing gate section blocks the release verdict. */
  gate?: boolean;
  /** Abort the run when this section fails (smoke only). */
  stopOnFail?: boolean;
  /** Present this section as one human interview sitting. */
  humanSession?: boolean;
  tasks: string[];
}

export interface Checklist {
  schemaVersion: '1.0';
  service: string;
  /** Checklist title; `LocalizedText` (plain string = both langs). Render via `pickLang`. */
  title: LocalizedText;
  sections: ChecklistSection[];
  unscheduled?: Array<{ task: string; reason: string }>;
}

export interface SelectorEntry {
  kind: 'element' | 'url-pattern';
  /** Primary Playwright locator (CSS or engine-prefixed). */
  selector?: string;
  fallbacks?: string[];
  /** Preferred resolution: getByRole(role, { name }). Accessible names are canonical. */
  role?: string;
  name?: string;
  /** kind:"url-pattern" — regex for API/WS endpoints. */
  urlPattern?: string;
  description: string;
  provenance: 'authored' | 'learned';
  learnedBy?: string;
  state?: 'verified' | 'candidate' | 'stale';
  lastVerified: string;
  hits?: number;
  misses?: number;
  stability?: number;
  notes?: string;
}

/** One file per page under apps/<svc>/selector-memory/<page>.json */
export interface SelectorMap {
  schemaVersion: '1.0';
  service: string;
  page: string;
  /** Route of the page, e.g. "/login" */
  path?: string;
  entries: Record<string, SelectorEntry>;
}

export interface SelectorProposal {
  /** Full key "<page>.<name>"; omitted when the agent could not name it. */
  key?: string;
  page: string;
  proposedSelector: string;
  role?: string;
  name?: string;
  description?: string;
  reason: string; // "new" | "heals:<existing-key>"
}

export type Lane = 'script' | 'cli' | 'agent' | 'human';

export interface PlanEntry {
  taskId: string;
  lane: Lane;
  cliKind?: 'lhci' | 'linkinator' | 'k6';
  supervised?: boolean;
  /** A class-c human task admitted ONLY as an inspect-only attended interview (never automated,
   * causes no irreversible change — see the gate's attended-human exception in risk-gate.ts). */
  attendedOnly?: boolean;
  /** This task breaks its own browser context (offline/tab-kill) — the driver runs it LAST in the
   * serialized auth lane and force-restarts the keeper after it. Stamped from
   * `automation.destructiveContext` or the `resil.interrupt.*` category. */
  destructive?: boolean;
}

export interface RunPlan {
  runId: string;
  service: string;
  serviceDir: string;
  envProfile: string;
  baseURL: string;
  allowedRiskClasses: RiskClass[];
  createdAt: string;
  ci: boolean;
  filters: Record<string, unknown>;
  entries: PlanEntry[];
  refused: Array<{ taskId: string; reason: string }>;
  /** Frozen task copies keyed by id — the plan is a self-contained contract. */
  tasks: Record<string, Task>;
  serviceConfig: ServiceConfig;
}

export type RunTaskStatus =
  | 'passed' | 'failed' | 'blocked' | 'skipped-risk-gate'
  | 'skipped-needs-human' | 'pending-review' | 'quarantined';

/** apps/<svc>/status/<profile>.json */
export interface StatusFile {
  envProfile: string;
  updatedAt: string;
  tasks: Record<string, {
    status: RunTaskStatus;
    verdictBy?: 'script' | 'agent' | 'human' | 'cli';
    runId: string;
    at: string;
    durationMs?: number;
    /** True when the task only passed on a retry — the pass is real but the flake is tracked. */
    flaky?: boolean;
    /** Count of soft-failed criteria (should-pass/informational unmet) — a warning, not a failure. */
    softFails?: number;
    /** Set when the agent lane drove this task but produced NO verdict (driver-error / timeout /
     * no-result / session-blocked). The task is `blocked` (needs a re-run), NOT a human interview and
     * NOT a product failure. Distinguishes an infra failure from genuine needs-human work. */
    agentOutcome?: string;
  }>;
}

/** Minimal CTRF shapes we produce/consume (https://ctrf.io) */
export interface CtrfTest {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
  duration: number;
  message?: string;
  suite?: string;
  /** Set by the Playwright CTRF reporter when a test passed only after a retry. */
  flaky?: boolean;
  retries?: number;
  extra?: Record<string, unknown>;
}

export interface CtrfReport {
  results: {
    tool: { name: string };
    summary: {
      tests: number; passed: number; failed: number;
      pending: number; skipped: number; other: number;
      start: number; stop: number;
    };
    tests: CtrfTest[];
  };
}

export interface TaxonomyNode {
  title: string;
  defaultExecutor: Executor;
  defaultHumanInvolvement: HumanInvolvement;
  examples: string[];
}

/** Flat map keyed by category path, e.g. "i18n.typography". */
export type Taxonomy = Record<string, TaxonomyNode>;
