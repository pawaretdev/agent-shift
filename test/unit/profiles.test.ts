import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProfileStore, sameAccount } from '../../src/core/profiles';
import { containedProfilePath, defaultConfigDir } from '../../src/core/paths';

describe('profile isolation', () => {
  it('creates separate managed directories and never touches Default', () => {
    const home = mkdtempSync(join(tmpdir(), 'agent-shift-home-'));
    const marker = join(defaultConfigDir(home), 'do-not-touch');
    mkdirSync(defaultConfigDir(home));
    writeFileSync(marker, 'unchanged');
    const root = join(home, '.agent-shift', 'profiles');
    const store = new ProfileStore(root);
    const first = store.create('Work');
    const second = store.create('Personal');
    expect(first.dir).not.toBe(second.dir);
    expect(store.list()).toHaveLength(2);
    expect(readFileSync(marker, 'utf8')).toBe('unchanged');
  });

  it('rejects traversal profile ids', () => {
    expect(() => containedProfilePath('/tmp/profiles', '../escape')).toThrow(/Invalid profile id/);
    expect(() => containedProfilePath('/tmp/profiles', 'work/escape')).toThrow(/Invalid profile id/);
  });
});

describe('sameAccount', () => {
  it('matches on email and organization only', () => {
    const personal = { email: 'Me@example.com', orgId: 'o1' };
    expect(sameAccount(personal, { email: 'me@example.com', orgId: 'o1' })).toBe(true);
    expect(sameAccount(personal, { email: 'me@example.com', orgId: 'o2' })).toBe(false);
    expect(sameAccount({}, {})).toBe(false);
    expect(sameAccount(personal, undefined)).toBe(false);
  });
});
