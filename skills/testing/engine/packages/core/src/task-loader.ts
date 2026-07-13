import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Checklist, SelectorMap, ServiceConfig, Task, Taxonomy } from './types.ts';

export interface LoadedTask {
  task: Task;
  /** Absolute path of the task file. */
  file: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.task.json')) out.push(p);
  }
  return out;
}

export function loadTasks(serviceDir: string): LoadedTask[] {
  const files = walk(path.join(serviceDir, 'tasks')).sort();
  return files.map((file) => {
    let task: Task;
    try {
      task = JSON.parse(fs.readFileSync(file, 'utf8')) as Task;
    } catch (e) {
      throw new Error(`Invalid JSON in ${file}: ${(e as Error).message}`);
    }
    return { task, file };
  });
}

export function loadChecklist(serviceDir: string): Checklist | null {
  const file = path.join(serviceDir, 'checklist.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Checklist;
}

export function loadSelectorMaps(serviceDir: string): SelectorMap[] {
  const dir = path.join(serviceDir, 'selector-memory');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as SelectorMap);
}

/** All known selector keys of a service in "<page>.<name>" form. */
export function allSelectorKeys(serviceDir: string): Set<string> {
  const keys = new Set<string>();
  for (const map of loadSelectorMaps(serviceDir)) {
    for (const name of Object.keys(map.entries)) keys.add(`${map.page}.${name}`);
  }
  return keys;
}

/** service.config.ts default-exports (or exports `serviceConfig`) a ServiceConfig. */
export async function loadServiceConfig(serviceDir: string): Promise<ServiceConfig> {
  const file = path.join(serviceDir, 'service.config.ts');
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const mod = await import(pathToFileURL(file).href);
  const cfg: ServiceConfig | undefined = mod.serviceConfig ?? mod.default;
  if (!cfg?.id) throw new Error(`${file} must export a ServiceConfig (as default or "serviceConfig")`);
  return cfg;
}

export function loadTaxonomy(): Taxonomy {
  const file = path.join(import.meta.dirname, 'schemas', 'taxonomy.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Taxonomy;
}

export function findTaskById(serviceDir: string, id: string): LoadedTask {
  const hit = loadTasks(serviceDir).find((t) => t.task.id === id);
  if (!hit) throw new Error(`No task with id "${id}" under ${path.join(serviceDir, 'tasks')}`);
  return hit;
}

/** Folders under apps/ that hold a service (have a service.config.ts). */
export function serviceFolders(root: string): string[] {
  const appsDir = path.join(root, 'apps');
  if (!fs.existsSync(appsDir)) return [];
  return fs
    .readdirSync(appsDir)
    .filter((f) => fs.existsSync(path.join(appsDir, f, 'service.config.ts')));
}

/**
 * Resolve a `--service` argument to its directory, accepting EITHER the folder name
 * (e.g. "example") OR the immutable service id from service.config.ts (e.g. "example").
 * Folder match is exact and cheap; id match imports each config only if needed.
 */
export async function resolveServiceDir(root: string, arg: string): Promise<string> {
  const folders = serviceFolders(root);
  if (folders.includes(arg)) return path.join(root, 'apps', arg);
  const matches: string[] = [];
  for (const f of folders) {
    try {
      const cfg = await loadServiceConfig(path.join(root, 'apps', f));
      if (cfg.id === arg) matches.push(f);
    } catch {
      /* ignore unreadable config */
    }
  }
  if (matches.length === 1) return path.join(root, 'apps', matches[0]);
  if (matches.length > 1) {
    throw new Error(`Ambiguous service "${arg}" — matches folders: ${matches.join(', ')}`);
  }
  throw new Error(`Unknown service "${arg}". Available: ${folders.join(', ')}`);
}
