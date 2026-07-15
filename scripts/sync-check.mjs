#!/usr/bin/env node
// Maintainer tool: flag skills present in this skills repo but missing from the (private) website catalog,
// and vice-versa, so the showcase site never drifts from the repo. Skips gracefully if the website
// catalog isn't available (e.g. for outside contributors who only have this repo).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const catalogDir = process.env.MC_WEBSITE_CATALOG || path.resolve(ROOT, '..', 'master-claude', 'catalog');

if (!fs.existsSync(catalogDir)) {
  console.log(`(sync-check skipped — website catalog not found at ${catalogDir}; set MC_WEBSITE_CATALOG to enable)`);
  process.exit(0);
}

// Skip vendored dependency trees. The bundled QA engine's node_modules contains third-party
// SKILL.md files (playwright-core ships its own), and counting those as MASTER CLAUDE
// capabilities makes this check cry wolf on every run.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

// Repo ids = each skill folder name (holding SKILL.md) + each agent file basename.
const repoIds = new Set([
  ...walk(path.join(ROOT, 'skills')).filter((p) => p.endsWith('SKILL.md')).map((p) => path.basename(path.dirname(p))),
  ...walk(path.join(ROOT, 'agents')).filter((p) => p.endsWith('.md')).map((p) => path.basename(p, '.md')),
]);
const catalogIds = new Set(
  fs.readdirSync(catalogDir).filter((d) => fs.existsSync(path.join(catalogDir, d, 'meta.json')))
);

// Intentional differences: the leader itself isn't a catalog product; the bundled `grill-me`
// skill corresponds to the catalog's `cap-grill-me`.
const NOT_IN_CATALOG = new Set(['master-claude', 'grill-me']);
const NOT_IN_REPO = new Set(['cap-grill-me']);

const missingFromCatalog = [...repoIds].filter((id) => !catalogIds.has(id) && !NOT_IN_CATALOG.has(id));
const missingFromRepo = [...catalogIds].filter((id) => !repoIds.has(id) && !NOT_IN_REPO.has(id));

if (missingFromCatalog.length || missingFromRepo.length) {
  if (missingFromCatalog.length) console.error('✗ in repo but MISSING from website catalog/:\n  ' + missingFromCatalog.join('\n  '));
  if (missingFromRepo.length) console.error('✗ in website catalog/ but MISSING from skills/:\n  ' + missingFromRepo.join('\n  '));
  console.error('\nAdd the missing catalog/<id>/{meta.json,content.md} (or the skill), regenerate catalog.json,');
  console.error('and follow docs/ADDING-A-CAPABILITY.md.');
  process.exit(1);
}
console.log(`✓ in sync: ${repoIds.size} repo skills ↔ ${catalogIds.size} catalog items`);
