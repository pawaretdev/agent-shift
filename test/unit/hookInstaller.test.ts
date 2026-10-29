import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { installStopFailureHook } from '../../src/claude/hookInstaller';

describe('hook installer', () => {
  it('is idempotent and preserves user hooks', () => {
    const config = mkdtempSync(join(tmpdir(), 'agent-shift-hook-'));
    const settings = join(config, 'settings.json');
    const userHook = { hooks: [{ type: 'command', command: 'echo user-hook' }] };
    writeFileSync(settings, JSON.stringify({ theme: 'dark', hooks: { StopFailure: [userHook] } }));
    const command = 'node /extension/stop-failure.js # agent-shift-stop-failure';
    expect(installStopFailureHook(config, command)).toBe(true);
    expect(installStopFailureHook(config, command)).toBe(false);
    const result = JSON.parse(readFileSync(settings, 'utf8'));
    expect(result.theme).toBe('dark');
    expect(result.hooks.StopFailure).toHaveLength(2);
    expect(result.hooks.StopFailure[0]).toEqual(userHook);
  });

  it('writes a redacted signal with no token patterns', () => {
    const base = mkdtempSync(join(tmpdir(), 'agent-shift-signal-'));
    const signals = join(base, 'signals');
    mkdirSync(signals);
    const script = join(process.cwd(), 'src', 'claude', 'hook', 'stop-failure.js');
    const result = spawnSync(process.execPath, [script, signals, '/fake/profile'], {
      input: JSON.stringify({ error: 'rate_limit', last_assistant_message: "You've hit your session limit sk-ant-fake-secret Bearer abc.def.ghi" }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    const files = require('node:fs').readdirSync(signals) as string[];
    const output = readFileSync(join(signals, files[0]!), 'utf8');
    expect(output).not.toMatch(/sk-ant-|Bearer\s|abc\.def\.ghi/);
  });
});
