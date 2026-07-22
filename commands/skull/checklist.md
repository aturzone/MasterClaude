---
description: Print the "adding a capability" stay-in-sync checklist and run the validate + sync checks
allowed-tools: Bash, Read, Glob
---
As SKULL, help the maintainer land a capability without missing a step. $ARGUMENTS

1. Read and print the checklist from `docs/ADDING-A-CAPABILITY.md`.
2. If you're inside the skills repo, run `node scripts/validate.mjs` and `node scripts/sync-check.mjs`, and
   report what's green and what's missing.
3. Call out the steps still pending for the current change — leader awareness, the website `catalog/<id>`,
   regenerating `catalog.json`, pushing the skills repo, and deploying + verifying the website — and offer to do them.
