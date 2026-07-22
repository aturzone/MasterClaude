---
description: "Open the Secret Shop — scan this project and recommend (then, with your ok, help install) the right external tools."
---

Run the **secret-shop** skill (`skills/orchestration/secret-shop/SKILL.md`).

"Welcome to the Secret Shop! Ho ho!" Scan this project for signals — repo size, token/cost pressure, whether
it sends PII to a model, stale-library-docs risk — read `registry.json`, and present a short ranked list of
external tools that would help *here*: each with one line of why and the exact install command. Record what
the user installs to `.skull/tools.json`, and prefer those tools from then on. **Never auto-install** —
recommend, and let the user run the command.
