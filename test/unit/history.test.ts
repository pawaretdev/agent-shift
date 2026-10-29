import { mkdtempSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyHistorySession, encodeCwd, listHistory, uniqueSessions } from '../../src/core/history';

describe('history', () => {
  it('encodes cwd by replacing every non-alphanumeric character', () => {
    expect(encodeCwd('/Users/Pawaret/my repo_1')).toBe('-Users-Pawaret-my-repo-1');
  });

  it('lists names and copies without changing the source', () => {
    const base = mkdtempSync(join(tmpdir(), 'agent-shift-history-'));
    const cwd = join(base, 'workspace');
    const sourceConfig = join(base, 'source');
    const sourceDir = join(sourceConfig, 'projects', encodeCwd(resolve(cwd)));
    mkdirSync(sourceDir, { recursive: true });
    const source = join(sourceDir, 'session-1.jsonl');
    writeFileSync(source, '{"secret":"content"}\n');
    const before = statSync(source);
    expect(listHistory(sourceConfig, cwd, 'source')[0]?.id).toBe('session-1');
    const { target, copied } = copyHistorySession(source, join(base, 'target'), cwd);
    expect(copied).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('{"secret":"content"}\n');
    expect(statSync(source).mtimeMs).toBe(before.mtimeMs);
    expect(readFileSync(source, 'utf8')).toBe('{"secret":"content"}\n');
    expect(() => copyHistorySession(source, join(base, 'target'), cwd)).toThrow(/already exists/);
  });

  it('dedupes and skips copying a transcript shared through a projects link', () => {
    const base = mkdtempSync(join(tmpdir(), 'agent-shift-history-'));
    const cwd = join(base, 'workspace');
    const shared = join(base, 'shared');
    const profile = join(base, 'profile');
    const sourceDir = join(shared, 'projects', encodeCwd(resolve(cwd)));
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(profile);
    symlinkSync(join(shared, 'projects'), join(profile, 'projects'));
    const source = join(sourceDir, 'session-1.jsonl');
    writeFileSync(source, '{}\n');
    const all = [...listHistory(shared, cwd, 'default'), ...listHistory(profile, cwd, 'profile')];
    expect(all).toHaveLength(2);
    expect(uniqueSessions(all)).toHaveLength(1);
    expect(copyHistorySession(source, profile, cwd).copied).toBe(false);
  });
});
