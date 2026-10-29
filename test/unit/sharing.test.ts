import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shareProfileData, unshareProfileData, withLock } from '../../src/core/sharing';
import { installStopFailureHook, removeAgentShiftHooks } from '../../src/claude/hookInstaller';

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'agent-shift-sharing-'));
  const shared = join(base, 'default');
  const profile = join(base, 'profile');
  mkdirSync(join(shared, 'projects', 'repo'), { recursive: true });
  mkdirSync(join(profile, 'projects', 'repo'), { recursive: true });
  writeFileSync(join(shared, 'projects', 'repo', 'a.jsonl'), 'default\n');
  writeFileSync(join(profile, 'projects', 'repo', 'b.jsonl'), 'profile\n');
  writeFileSync(join(shared, 'settings.json'), '{"theme":"dark"}');
  writeFileSync(join(profile, 'settings.json'), '{"theme":"light"}');
  writeFileSync(join(shared, 'history.jsonl'), '{"p":1}\n');
  writeFileSync(join(profile, 'history.jsonl'), '{"p":2}');
  writeFileSync(join(profile, '.claude.json'), '{"oauthAccount":{}}');
  return { shared, profile };
}

describe('profile data sharing', () => {
  it('merges profile data into the shared directory and links it', () => {
    const { shared, profile } = setup();
    const result = shareProfileData(profile, shared, 1);
    expect(lstatSync(join(profile, 'projects')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(profile, 'projects', 'repo', 'a.jsonl'), 'utf8')).toBe('default\n');
    expect(readFileSync(join(shared, 'projects', 'repo', 'b.jsonl'), 'utf8')).toBe('profile\n');
    expect(readFileSync(join(profile, 'settings.json'), 'utf8')).toBe('{"theme":"dark"}');
    expect(readFileSync(join(result.backupDir!, 'settings.json'), 'utf8')).toBe('{"theme":"light"}');
    expect(readFileSync(join(shared, 'history.jsonl'), 'utf8')).toBe('{"p":1}\n{"p":2}\n');
    expect(lstatSync(join(profile, '.claude.json')).isSymbolicLink()).toBe(false);
    expect(lstatSync(join(profile, 'skills')).isSymbolicLink()).toBe(true);
  });

  it('is idempotent and repairs a link a writer replaced', () => {
    const { shared, profile } = setup();
    shareProfileData(profile, shared, 1);
    expect(shareProfileData(profile, shared, 2).backupDir).toBeUndefined();
    rmSync(join(profile, 'settings.json'));
    writeFileSync(join(profile, 'settings.json'), '{"replaced":true}');
    shareProfileData(profile, shared, 3);
    expect(lstatSync(join(profile, 'settings.json')).isSymbolicLink()).toBe(true);
  });

  it('keeps writes to linked settings inside the shared file', () => {
    const { shared, profile } = setup();
    shareProfileData(profile, shared, 1);
    installStopFailureHook(profile, 'node hook.js # agent-shift-stop-failure');
    expect(lstatSync(join(profile, 'settings.json')).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(join(shared, 'settings.json'), 'utf8')).hooks.StopFailure).toHaveLength(1);
    expect(removeAgentShiftHooks(profile)).toBe(true);
    expect(JSON.parse(readFileSync(join(shared, 'settings.json'), 'utf8')).hooks.StopFailure).toHaveLength(0);
  });

  it('unshares by copying configuration and leaving history shared', () => {
    const { shared, profile } = setup();
    shareProfileData(profile, shared, 1);
    unshareProfileData(profile, shared);
    expect(lstatSync(join(profile, 'settings.json')).isSymbolicLink()).toBe(false);
    expect(readFileSync(join(profile, 'settings.json'), 'utf8')).toBe('{"theme":"dark"}');
    expect(existsSync(join(profile, 'projects'))).toBe(false);
    expect(existsSync(join(shared, 'projects', 'repo', 'b.jsonl'))).toBe(true);
  });

  it('deleting a shared profile directory leaves the shared data intact', () => {
    const { shared, profile } = setup();
    shareProfileData(profile, shared, 1);
    rmSync(profile, { recursive: true, force: false });
    expect(readFileSync(join(shared, 'projects', 'repo', 'a.jsonl'), 'utf8')).toBe('default\n');
    expect(readFileSync(join(shared, 'settings.json'), 'utf8')).toBe('{"theme":"dark"}');
  });

  it('leaves links to other places alone', () => {
    const { shared, profile } = setup();
    const elsewhere = join(shared, '..', 'elsewhere');
    mkdirSync(elsewhere);
    renameSync(join(profile, 'projects'), join(elsewhere, 'projects'));
    require('node:fs').symlinkSync(join(elsewhere, 'projects'), join(profile, 'projects'));
    expect(shareProfileData(profile, shared, 1).skipped).toEqual(['projects']);
  });

  it('keeps the shared copy of a clashing file and backs up the profile copy', () => {
    const { shared, profile } = setup();
    writeFileSync(join(shared, 'projects', 'repo', 'x.jsonl'), 'shared\n');
    writeFileSync(join(profile, 'projects', 'repo', 'x.jsonl'), 'profile\n');
    const result = shareProfileData(profile, shared, 1);
    expect(readFileSync(join(shared, 'projects', 'repo', 'x.jsonl'), 'utf8')).toBe('shared\n');
    expect(readFileSync(join(result.backupDir!, 'projects', 'repo', 'x.jsonl'), 'utf8')).toBe('profile\n');
  });

  it('withLock skips while a fresh lock exists and takes over a stale one', () => {
    const lock = join(mkdtempSync(join(tmpdir(), 'agent-shift-lock-')), 'sharing.lock');
    mkdirSync(lock);
    let ran = 0;
    expect(withLock(lock, () => { ran++; })).toBe(false);
    expect(ran).toBe(0);
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(lock, old, old);
    expect(withLock(lock, () => { ran++; })).toBe(true);
    expect(ran).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });
});
