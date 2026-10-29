import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const DEFAULT_PROFILE_ID = 'default';

export function expandHome(input: string, home = homedir()): string {
  if (input === '~') return home;
  if (input.startsWith(`~${sep}`) || input.startsWith('~/')) return resolve(home, input.slice(2));
  return resolve(input);
}

export function defaultProfileRoot(home = homedir()): string {
  return resolve(home, '.agent-shift', 'profiles');
}

export function defaultConfigDir(home = homedir()): string {
  return resolve(home, '.claude');
}

export function metadataPath(profileRoot: string): string {
  return resolve(profileRoot, '..', 'profiles.json');
}

export function validateProfileId(id: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id)) throw new Error(`Invalid profile id: ${id}`);
  return id;
}

export function slugifyProfileId(label: string): string {
  const id = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return validateProfileId(id);
}

export function containedProfilePath(root: string, id: string): string {
  validateProfileId(id);
  const base = resolve(root);
  const candidate = resolve(base, id);
  const rel = relative(base, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Profile path escapes profile root');
  return candidate;
}

export function assertCanonicalContainment(root: string, candidate: string): void {
  const canonicalRoot = realpathSync(root);
  const canonicalCandidate = realpathSync(candidate);
  const rel = relative(canonicalRoot, canonicalCandidate);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Canonical profile path escapes profile root');
}
