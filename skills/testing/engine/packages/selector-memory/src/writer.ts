import fs from 'node:fs';
import path from 'node:path';
import type { SelectorEntry, SelectorMap, SelectorProposal } from '@mc-qa/core';

export interface MergeResult {
  added: string[];
  healed: string[];
  skipped: Array<{ proposal: SelectorProposal; reason: string }>;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'element';
}

/**
 * Merge agent proposals into the selector maps as provenance:"learned" candidates.
 * Agents never edit git files directly — this runs from `qa ingest` / `qa selectors merge`
 * and the diff goes through normal PR review. `authored` entries are never auto-modified.
 */
export function mergeProposals(
  serviceDir: string,
  service: string,
  proposals: SelectorProposal[],
  runId: string,
): MergeResult {
  const dir = path.join(serviceDir, 'selector-memory');
  fs.mkdirSync(dir, { recursive: true });
  const result: MergeResult = { added: [], healed: [], skipped: [] };
  const today = new Date().toISOString().slice(0, 10);

  for (const p of proposals) {
    const file = path.join(dir, `${p.page}.json`);
    let map: SelectorMap;
    if (fs.existsSync(file)) {
      map = JSON.parse(fs.readFileSync(file, 'utf8')) as SelectorMap;
    } else {
      map = { schemaVersion: '1.0', service, page: p.page, entries: {} };
    }

    const heals = p.reason.startsWith('heals:') ? p.reason.slice('heals:'.length) : null;
    if (heals) {
      const name = heals.includes('.') ? heals.slice(heals.indexOf('.') + 1) : heals;
      const existing = map.entries[name];
      if (!existing) {
        result.skipped.push({ proposal: p, reason: `heal target "${heals}" not found in ${file}` });
        continue;
      }
      if (existing.provenance === 'authored') {
        result.skipped.push({
          proposal: p,
          reason: `"${heals}" is authored — auto-heal forbidden, review manually`,
        });
        continue;
      }
      existing.fallbacks = [
        ...(existing.selector ? [existing.selector] : []),
        ...(existing.fallbacks ?? []),
      ];
      existing.selector = p.proposedSelector;
      existing.state = 'candidate';
      existing.learnedBy = runId;
      existing.lastVerified = today;
      result.healed.push(`${p.page}.${name}`);
    } else {
      const name = p.key
        ? p.key.includes('.') ? p.key.slice(p.key.indexOf('.') + 1) : p.key
        : slugify(p.name ?? p.description ?? p.proposedSelector);
      if (map.entries[name]) {
        result.skipped.push({ proposal: p, reason: `key "${p.page}.${name}" already exists` });
        continue;
      }
      const entry: SelectorEntry = {
        kind: 'element',
        selector: p.proposedSelector,
        role: p.role,
        name: p.name,
        description: p.description ?? `learned by agent run ${runId}`,
        provenance: 'learned',
        learnedBy: runId,
        state: 'candidate',
        lastVerified: today,
        hits: 0,
        misses: 0,
        stability: 0.5,
      };
      map.entries[name] = entry;
      result.added.push(`${p.page}.${name}`);
    }
    fs.writeFileSync(file, JSON.stringify(map, null, 2) + '\n');
  }
  return result;
}
