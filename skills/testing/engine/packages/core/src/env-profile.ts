import fs from 'node:fs';
import path from 'node:path';
import type { EnvProfile } from './types.ts';

const PLACEHOLDER = /^\$\{env:([A-Z0-9_]+)\}$/;

export function loadEnvProfile(serviceDir: string, name: string): EnvProfile {
  const file = path.join(serviceDir, 'envs', `${name}.json`);
  if (!fs.existsSync(file)) {
    const available = fs.existsSync(path.join(serviceDir, 'envs'))
      ? fs.readdirSync(path.join(serviceDir, 'envs')).map((f) => f.replace(/\.json$/, '')).join(', ')
      : '(none)';
    throw new Error(`Env profile "${name}" not found at ${file}. Available: ${available}`);
  }
  const profile = JSON.parse(fs.readFileSync(file, 'utf8')) as EnvProfile;
  if (profile.name !== name) {
    throw new Error(`Env profile file ${file} declares name "${profile.name}" (expected "${name}")`);
  }
  if ((profile.unattendedRiskClasses as string[]).includes('d')) {
    throw new Error(
      `Env profile "${name}" lists risk class "d" as unattended. ` +
        `Class d (real money / irreversible) can never run unattended — remove it.`,
    );
  }
  return profile;
}

/** Resolve the baseURL, expanding a "${env:NAME}" placeholder. Throws with the missing name. */
export function resolveBaseURL(profile: EnvProfile): string {
  const m = PLACEHOLDER.exec(profile.baseURL);
  if (!m) return profile.baseURL;
  const v = process.env[m[1]];
  if (!v) {
    throw new Error(
      `Env profile "${profile.name}" needs environment variable ${m[1]} for its baseURL. ` +
        `Set it in .env (see .env.example).`,
    );
  }
  return v;
}

/**
 * Resolve one secret lazily. Values are never logged; callers must feed them to the
 * redaction list of the capture fixtures.
 */
export function resolveSecret(profile: EnvProfile, key: string): string {
  const raw = profile.secrets?.[key];
  if (!raw) throw new Error(`Env profile "${profile.name}" declares no secret "${key}"`);
  const m = PLACEHOLDER.exec(raw);
  if (!m) throw new Error(`Secret "${key}" in profile "${profile.name}" must be a "\${env:NAME}" placeholder`);
  const v = process.env[m[1]];
  if (!v) throw new Error(`Missing environment variable ${m[1]} (secret "${key}" of profile "${profile.name}")`);
  return v;
}

/** All env var names a profile references (for fail-fast checks and redaction). */
export function referencedEnvVars(profile: EnvProfile): string[] {
  const names: string[] = [];
  const bm = PLACEHOLDER.exec(profile.baseURL);
  if (bm) names.push(bm[1]);
  for (const raw of Object.values(profile.secrets ?? {})) {
    const m = PLACEHOLDER.exec(raw);
    if (m) names.push(m[1]);
  }
  return names;
}

/** Referenced env vars that are not currently set (for a startup warning). */
export function missingEnvVars(profile: EnvProfile): string[] {
  return referencedEnvVars(profile).filter((n) => !process.env[n]);
}

/**
 * The concrete secret VALUES currently set for this profile — fed to the capture
 * fixtures' redaction list so phone numbers / OTPs never land in attached logs.
 * Best-effort: silently skips secrets whose env var is not set.
 */
export function resolveRedactions(profile: EnvProfile): string[] {
  const out = new Set<string>();
  for (const raw of Object.values(profile.secrets ?? {})) {
    const m = PLACEHOLDER.exec(raw);
    const v = m ? process.env[m[1]] : undefined;
    if (v && v.length >= 3) out.add(v);
  }
  return [...out];
}
