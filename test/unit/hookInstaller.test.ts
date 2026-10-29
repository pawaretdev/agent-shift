import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { hookCommand, installHookScript, installStopFailureHook, replaceStaleHooks } from '../../src/claude/hookInstaller';

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

  it('replaces stale hooks of the same signal dir only', () => {
    const config = mkdtempSync(join(tmpdir(), 'agent-shift-hook-'));
    const settings = join(config, 'settings.json');
    const userHook = { hooks: [{ type: 'command', command: 'echo user-hook' }] };
    const oldCommand = hookCommand('/ext-0.1.0/stop-failure.js', '/cursor/signals', config);
    const otherEditor = hookCommand('/ext/stop-failure.js', '/code/signals', config);
    const next = hookCommand('/storage/stop-failure.js', '/cursor/signals', config);
    writeFileSync(settings, JSON.stringify({ hooks: { StopFailure: [userHook, { hooks: [{ type: 'command', command: oldCommand }] }, { hooks: [{ type: 'command', command: otherEditor }] }] } }));
    expect(replaceStaleHooks(config, next, '/cursor/signals')).toBe(true);
    const commands = (JSON.parse(readFileSync(settings, 'utf8')).hooks.StopFailure as { hooks: { command: string }[] }[]).flatMap((group) => group.hooks.map((hook) => hook.command));
    expect(commands).toEqual(['echo user-hook', otherEditor, next]);
    expect(replaceStaleHooks(config, next, '/cursor/signals')).toBe(false);
  });

  it('installs nothing when there is no AgentShift hook', () => {
    const config = mkdtempSync(join(tmpdir(), 'agent-shift-hook-'));
    expect(replaceStaleHooks(config, hookCommand('/s.js', '/signals', config), '/signals')).toBe(false);
    expect(existsSync(join(config, 'settings.json'))).toBe(false);
  });

  it('copies the hook script to a stable path', () => {
    const base = mkdtempSync(join(tmpdir(), 'agent-shift-script-'));
    const source = join(base, 'src.js');
    writeFileSync(source, 'console.log(1)');
    const target = installHookScript(source, join(base, 'storage'));
    expect(target).toBe(join(base, 'storage', 'stop-failure.js'));
    expect(readFileSync(target, 'utf8')).toBe('console.log(1)');
  });

  it('writes no signal for other errors', () => {
    const signals = join(mkdtempSync(join(tmpdir(), 'agent-shift-signal-')), 'signals');
    const script = join(process.cwd(), 'src', 'claude', 'hook', 'stop-failure.js');
    const result = spawnSync(process.execPath, [script, signals, '/fake/profile'], { input: JSON.stringify({ error: 'other', last_assistant_message: 'x' }), encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(existsSync(signals) ? readdirSync(signals) : []).toEqual([]);
  });
});
