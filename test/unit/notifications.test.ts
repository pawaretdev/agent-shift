import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscode = vi.hoisted(() => ({ showWarningMessage: vi.fn(), created: undefined as undefined | ((uri: { fsPath: string }) => Promise<void>) }));

vi.mock('vscode', () => ({
  RelativePattern: class {},
  window: { showWarningMessage: vscode.showWarningMessage },
  workspace: {
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
    createFileSystemWatcher: () => ({ onDidCreate: (fn: typeof vscode.created) => { vscode.created = fn; }, dispose: vi.fn() }),
  },
}));

import { watchLimitSignals } from '../../src/ui/notifications';
import { defaultConfigDir } from '../../src/core/paths';

function signal(profileDir: string) {
  const storage = mkdtempSync(join(tmpdir(), 'agent-shift-notify-'));
  mkdirSync(join(storage, 'signals'));
  const file = join(storage, 'signals', '1.json');
  writeFileSync(file, JSON.stringify({ profileDir, error: 'rate_limit', message: "You've hit your session limit · resets 3pm" }));
  watchLimitSignals({ globalStorageUri: { fsPath: storage }, subscriptions: [] } as never, () => ({ profiles: [] }), vi.fn());
  return file;
}

describe('watchLimitSignals', () => {
  beforeEach(() => vscode.showWarningMessage.mockReset().mockResolvedValue(undefined));

  it('leaves a signal for another profile directory alone', async () => {
    const file = signal('/somewhere/else');
    await vscode.created!({ fsPath: file });
    expect(existsSync(file)).toBe(true);
    expect(vscode.showWarningMessage).not.toHaveBeenCalled();
  });

  it('warns for the Default profile when none is active', async () => {
    const file = signal(defaultConfigDir());
    await vscode.created!({ fsPath: file });
    expect(existsSync(file)).toBe(false);
    expect(vscode.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Default'));
  });
});
