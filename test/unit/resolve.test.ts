import { describe, expect, it } from 'vitest';
import { resolveProfileId, withoutConfigDir } from '../../src/core/resolve';
import type { Profile } from '../../src/core/profiles';

const profiles = [
  { id: 'work', label: 'Work', dir: '/profiles/work', managed: true },
  { id: 'personal', label: 'Personal', dir: '/profiles/personal', managed: true },
] satisfies Profile[];

describe('profile resolution', () => {
  it('uses window choice before workspace default and rules', () => {
    expect(resolveProfileId({ profiles, windowChoice: 'personal', workspaceDefault: 'work', rules: [{ glob: '**/repo', profile: 'work' }], workspacePath: '/tmp/repo' })).toBe('personal');
  });

  it('uses workspace default before rules', () => {
    expect(resolveProfileId({ profiles, workspaceDefault: 'work', rules: [{ glob: '**', profile: 'personal' }], workspacePath: '/tmp/repo' })).toBe('work');
  });

  it('uses the first matching rule and falls back to Default', () => {
    expect(resolveProfileId({ profiles, rules: [{ glob: '**/repo', profile: 'personal' }], workspacePath: '/tmp/repo' })).toBe('personal');
    expect(resolveProfileId({ profiles, windowChoice: 'removed', workspaceDefault: 'missing' })).toBe('default');
  });
});

describe('claudeCode.environmentVariables conflict', () => {
  it('removes only CLAUDE_CONFIG_DIR from the {name, value} array', () => {
    const keep = { name: 'HTTPS_PROXY', value: 'http://proxy' };
    expect(withoutConfigDir([keep, { name: 'CLAUDE_CONFIG_DIR', value: '/x' }])).toEqual([keep]);
    expect(withoutConfigDir([keep])).toBeUndefined();
    expect(withoutConfigDir(undefined)).toBeUndefined();
  });
});
