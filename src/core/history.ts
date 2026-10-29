import { copyFileSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export interface HistorySession { id: string; file: string; profileId: string; mtimeMs: number }

export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

function candidateProjectDirs(configDir: string, cwd: string): string[] {
  const encoded = encodeCwd(resolve(cwd));
  const projects = join(configDir, 'projects');
  if (encoded.length <= 200) return [join(projects, encoded)];
  // UNDOCUMENTED: Claude truncates and hashes encoded workspace paths over 200 characters; the algorithm is not public.
  if (!existsSync(projects)) return [];
  const conservativePrefix = encoded.slice(0, 120);
  return readdirSync(projects, { withFileTypes: true })
    .filter((entry: { isDirectory(): boolean; name: string }) => entry.isDirectory() && entry.name.startsWith(conservativePrefix))
    .map((entry: { name: string }) => join(projects, entry.name));
}

export function listHistory(configDir: string, cwd: string, profileId: string): HistorySession[] {
  const sessions: HistorySession[] = [];
  for (const directory of candidateProjectDirs(configDir, cwd)) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const file = join(directory, entry.name);
      sessions.push({ id: basename(entry.name, '.jsonl'), file, profileId, mtimeMs: statSync(file).mtimeMs });
    }
  }
  return sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Drops sessions that are the same file reached through another profile's shared projects link. */
export function uniqueSessions(sessions: HistorySession[]): HistorySession[] {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    const real = realpathSync(session.file);
    if (seen.has(real)) return false;
    seen.add(real);
    return true;
  });
}

/** Copies a transcript into the target profile; copied is false when the target already shares that file. */
export function copyHistorySession(source: string, targetConfigDir: string, cwd: string): { target: string; copied: boolean } {
  if (!source.endsWith('.jsonl')) throw new Error('Only JSONL transcripts can be copied');
  const id = basename(source, '.jsonl');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid session id');
  const targetDir = join(targetConfigDir, 'projects', encodeCwd(resolve(cwd)));
  mkdirSync(targetDir, { recursive: true });
  const target = join(targetDir, `${id}.jsonl`);
  if (existsSync(target) && realpathSync(target) === realpathSync(source)) return { target, copied: false };
  if (existsSync(target)) throw new Error(`Session ${id} already exists in the active profile`);
  const before = statSync(source);
  copyFileSync(source, target, 0);
  const after = statSync(source);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    rmSync(target, { force: true });
    throw new Error('Source transcript changed during copy');
  }
  return { target, copied: true };
}
