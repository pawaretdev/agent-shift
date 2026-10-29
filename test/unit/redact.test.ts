import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { authStatus } from '../../src/claude/cli';
import { projectIdentity, redact } from '../../src/core/redact';

describe('credential safety', () => {
  it('redacts token patterns and allow-lists identity fields', () => {
    const token = 'sk-ant-super-secret-value';
    expect(redact(`Bearer abc.def.ghi ${token}`)).not.toContain(token);
    expect(projectIdentity({ loggedIn: true, email: 'dev@example.com', accessToken: token })).toEqual({ loggedIn: true, email: 'dev@example.com' });
  });

  it('drops fake CLI secrets without reading credential files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-shift-cli-'));
    const executable = join(dir, 'claude');
    const token = 'sk-ant-fake-access-token';
    writeFileSync(executable, `#!/bin/sh\nprintf '%s' '{"loggedIn":true,"email":"safe@example.com","accessToken":"${token}","nested":"Bearer hidden"}'\n`);
    chmodSync(executable, 0o755);
    const spy = vi.spyOn(require('node:fs') as typeof import('node:fs'), 'readFileSync');
    const identity = await authStatus(undefined, executable);
    expect(identity).toEqual({ loggedIn: true, email: 'safe@example.com' });
    const storedState = JSON.stringify(identity);
    const loggedState = redact(storedState);
    expect(storedState).not.toContain(token);
    expect(loggedState).not.toContain(token);
    expect(spy.mock.calls.some(([path]) => String(path).toLowerCase().includes('credentials'))).toBe(false);
    spy.mockRestore();
  });

  it('reports a logged-out profile and never leaks CLI output through errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-shift-cli-'));
    const loggedOut = join(dir, 'claude-out');
    writeFileSync(loggedOut, `#!/bin/sh\nprintf '%s' '{"loggedIn":false,"authMethod":"none"}'\nexit 1\n`);
    chmodSync(loggedOut, 0o755);
    expect(await authStatus(undefined, loggedOut)).toEqual({ loggedIn: false, authMethod: 'none' });

    const broken = join(dir, 'claude-broken');
    writeFileSync(broken, `#!/bin/sh\necho 'secret@example.com sk-ant-leaky-token' >&2\necho 'raw-stdout-identity'\nexit 2\n`);
    chmodSync(broken, 0o755);
    const error = await authStatus(undefined, broken).catch((e: unknown) => e);
    const logged = redact(error);
    expect(logged).toContain('claude auth status failed');
    for (const leak of ['secret@example.com', 'sk-ant-leaky-token', 'raw-stdout-identity']) expect(logged).not.toContain(leak);
  });
});
