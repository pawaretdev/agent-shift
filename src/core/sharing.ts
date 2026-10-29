import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmdirSync, symlinkSync, unlinkSync, type Stats } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type DataSharing = 'isolated' | 'shared';

interface SharedEntry { name: string; kind: 'dir' | 'file'; history: boolean }

// Everything a profile keeps besides its login: .claude.json (oauthAccount, MCP, project trust),
// credentials, caches, and org-scoped policy files stay per profile.
export const SHARED_ENTRIES: readonly SharedEntry[] = [
  { name: 'projects', kind: 'dir', history: true },
  { name: 'todos', kind: 'dir', history: true },
  { name: 'file-history', kind: 'dir', history: true },
  { name: 'plans', kind: 'dir', history: true },
  { name: 'shell-snapshots', kind: 'dir', history: true },
  { name: 'history.jsonl', kind: 'file', history: true },
  { name: 'settings.json', kind: 'file', history: false },
  { name: 'CLAUDE.md', kind: 'file', history: false },
  { name: 'keybindings.json', kind: 'file', history: false },
  { name: 'agents', kind: 'dir', history: false },
  { name: 'commands', kind: 'dir', history: false },
  { name: 'skills', kind: 'dir', history: false },
  { name: 'hooks', kind: 'dir', history: false },
  { name: 'output-styles', kind: 'dir', history: false },
  { name: 'plugins', kind: 'dir', history: false },
];

export interface ShareResult { linked: string[]; skipped: string[]; backupDir?: string }

function lstatOrUndefined(path: string): Stats | undefined {
  try { return lstatSync(path); } catch { return undefined; }
}

function linksTo(path: string, target: string): boolean {
  return resolve(dirname(path), readlinkSync(path)) === resolve(target);
}

function moveAside(source: string, backup: string): void {
  mkdirSync(dirname(backup), { recursive: true });
  renameSync(source, backup);
}

/** Moves every entry of source into target; entries already present in target are moved to backup instead. */
function mergeDirectory(source: string, target: string, backup: string): void {
  if (!lstatOrUndefined(target)) { mkdirSync(dirname(target), { recursive: true }); renameSync(source, target); return; }
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    const existing = lstatOrUndefined(to);
    if (!existing) renameSync(from, to);
    else if (entry.isDirectory() && existing.isDirectory()) mergeDirectory(from, to, join(backup, entry.name));
    else moveAside(from, join(backup, entry.name));
  }
  // A writer can create a file between the merge and here; keep it in the backup rather than losing it.
  try { rmdirSync(source); } catch { moveAside(source, join(backup, '.leftover')); }
}

/**
 * Replaces the profile's shareable entries with symlinks into sharedDir, merging existing data first.
 * Idempotent: entries that already link to sharedDir are left alone, and entries that a writer turned
 * back into regular files are merged again.
 */
export function shareProfileData(profileDir: string, sharedDir: string, now = Date.now()): ShareResult {
  const result: ShareResult = { linked: [], skipped: [] };
  const backupRoot = join(profileDir, '.agent-shift-backup', String(now));
  mkdirSync(sharedDir, { recursive: true });
  for (const entry of SHARED_ENTRIES) {
    const local = join(profileDir, entry.name);
    const shared = join(sharedDir, entry.name);
    const stat = lstatOrUndefined(local);
    if (stat?.isSymbolicLink()) {
      if (!linksTo(local, shared)) result.skipped.push(entry.name);
      continue;
    }
    if (stat) {
      result.backupDir = backupRoot;
      if (stat.isDirectory() !== (entry.kind === 'dir')) moveAside(local, join(backupRoot, entry.name));
      else if (entry.kind === 'dir') mergeDirectory(local, shared, join(backupRoot, entry.name));
      else if (!existsSync(shared)) renameSync(local, shared);
      else {
        if (entry.name === 'history.jsonl') {
          const lines = readFileSync(local, 'utf8');
          if (lines) appendFileSync(shared, lines.endsWith('\n') ? lines : `${lines}\n`, { mode: 0o600 });
        }
        moveAside(local, join(backupRoot, entry.name));
      }
    }
    if (entry.kind === 'dir') mkdirSync(shared, { recursive: true });
    symlinkSync(shared, local, entry.kind === 'dir' ? 'junction' : 'file');
    result.linked.push(entry.name);
  }
  return result;
}

/**
 * Removes the profile's links into sharedDir. Configuration entries are copied back so the profile keeps
 * working; history stays in sharedDir, where Browse Conversations can still reach it.
 */
export function unshareProfileData(profileDir: string, sharedDir: string): string[] {
  const restored: string[] = [];
  for (const entry of SHARED_ENTRIES) {
    const local = join(profileDir, entry.name);
    const shared = join(sharedDir, entry.name);
    if (!lstatOrUndefined(local)?.isSymbolicLink() || !linksTo(local, shared)) continue;
    unlinkSync(local);
    if (!entry.history && existsSync(shared)) cpSync(shared, local, { recursive: true });
    restored.push(entry.name);
  }
  return restored;
}

/** Resolves a symlinked file to the path that should actually be written, so atomic renames keep the link. */
export function writeTarget(file: string): string {
  const stat = lstatOrUndefined(file);
  return stat?.isSymbolicLink() ? resolve(dirname(file), readlinkSync(file)) : file;
}
