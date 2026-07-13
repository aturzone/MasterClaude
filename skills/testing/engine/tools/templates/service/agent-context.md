# __SERVICE__ — Agent Context

Prepended to every agent brief for this service. Fill this in **before** authoring agent tasks.

## What this app is
__SERVICE__ at `__BASEURL__`. _(Describe the surface: marketing site / web app / dashboard;
tech stack if known.)_

## Environments & accounts
- Base URL comes from the run's env profile (never hardcode it).
- Credentials live only in `.env`; `data/accounts.json` holds references, not values.

## Login procedure
_(If this surface has auth, document the exact steps and where the OTP/credential comes from.)_

## Global quirks
_(Loading behavior, realtime feeds, digit echoing, version drift, anything an agent must know.)_

## FORBIDDEN ACTIONS (absolute, all tasks)
- NEVER perform any money movement or irreversible action unless the task's risk class allows it
  AND the run is attended/supervised.
- NEVER submit auth forms or request OTPs unless the task authorizes it.
- NEVER enter real personal data during exploration.

## Selector conventions
- Prefer role + accessible name (accessible names are canonical). Reuse `selector-memory/` keys
  before exploring; write new finds back as proposals.

## Known bugs / accepted deviations
- _(none yet)_
