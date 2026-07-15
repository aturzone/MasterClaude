---
name: supplyguard
description: >-
  Dependency supply-chain check before a package lands. Triggers when adding or bumping any dependency —
  package.json, requirements.txt, pyproject.toml, go.mod, Gemfile, Cargo.toml — or when running
  npm/pnpm/yarn/pip install, and on "is this package safe / real / maintained?". Catches hallucinated and
  typosquatted names, known-vulnerable versions, and weak trust signals. Guidance the model follows before it
  writes the dependency — it is not interception.
allowed-tools: Read, Grep, Glob, Bash
---

# SupplyGuard — check the package before you write it down

The single highest-value moment in supply-chain safety is **before** a name reaches a manifest. A hallucinated
package name is not a typo — it is an open slot an attacker can register. Check first, write second.

## 1. Existence — the one that catches hallucinations
Confirm the exact name resolves on its registry. **Do not eyeball this; run it.**

```bash
npm view <pkg> version                     # npm — non-zero exit = it does not exist
pip index versions <pkg>                   # PyPI (or: pip download <pkg>==  to list)
go list -m -versions <module>              # Go
gem list -r -e <gem>                       # RubyGems
cargo search <crate> --limit 1             # crates.io
```
A name that is a near-miss of a popular package (`reqeusts`, `lodahs`, `python-dateutils`) is a **typosquat or a
hallucination** — do not add it, and show the correct name. If you cannot check (offline, no registry access),
say so and let the developer decide. **An unverified dependency is a decision for the human, not a default.**

## 2. Known vulnerabilities
```bash
npm audit --json                           # after install, for the whole tree
osv-scanner --lockfile=<path>              # OSV, cross-ecosystem, if available
pip-audit                                  # Python
```
Vulnerable → report the advisory and the safe minimum version. Prefer the smallest bump that clears it.

## 3. Trust signals
Brand-new, unmaintained, single-maintainer, no repository link, or a version count of 1 → flag for a second
look. Weigh against how deep it sits: a build-time dev dependency and a runtime dependency handling untrusted
input are not the same risk. **Prefer a maintained, widely-used alternative, or the standard library.**

## Report
One line per dependency: `OK` · `STOP <reason>` · `WARN <advisory> → <safe version>`.
`STOP` means **you do not write the dependency** and you tell the developer why. That is a choice you make, not
a gate that exists — say so honestly. If a rule must hold even when the model is talked out of it, that belongs
in a `PreToolUse` hook the developer installs deliberately.

---
*The deeper pass is `sec-deps` (SBOM, install scripts, pinning, integrity). This skill is the fast check at the
moment of adding. See docs/ECOSYSTEM.md.*
