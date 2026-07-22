---
description: Run a security review — pick the right SKULL security skills (or the full audit) for what you're working on
allowed-tools: Task, Read, Grep, Glob, Bash
---
As SKULL, run a security review for the developer. $ARGUMENTS

1. **Scope it.** If they named a target (a file, a feature, an endpoint, "the auth flow"), focus there. If
   they want the whole project, run the full audit.
2. **Pick the right members** from the `security/` skills:
   - authorization / access control / "can user X do Y" → `sec-authz-review` (IDOR/BOLA/privesc/BFLA)
   - a threat-led pass over new code → `sec-attacker-review`
   - queries / commands / HTML / templates built from input → `sec-injection`
   - login / session / JWT / reset → `sec-authn-session`
   - secrets / keys / crypto / logging / pre-open-source → `sec-secrets-crypto`
   - URL fetch / file path / upload / redirect → `sec-ssrf-traversal`
   - **whole project** → `wf-security-audit`, and (if installed) spawn the `security-auditor` agent to
     persist findings under `.security/`.
3. **Run it** — apply the skill's methodology (or spawn it as a subagent for an isolated pass): trace
   untrusted input source→sink across trust boundaries, and confirm the defense at each sink.
4. **Report** every finding as `path:line · OWASP-Axx / CWE-nnn · severity · evidence · concrete fix`,
   ordered by exploitability × impact, with an honest coverage note. Stay **defensive** — review to fix,
   never exploit live systems.

Offer to fix the criticals once they've seen the report.
