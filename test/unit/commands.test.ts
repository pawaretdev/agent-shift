import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const vscode = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  showInformationMessage: vi.fn(),
  reloadBehavior: 'ask',
}));

vi.mock('vscode', () => ({
  commands: { executeCommand: vscode.executeCommand, registerCommand: vi.fn() },
  window: { showInformationMessage: vscode.showInformationMessage },
  workspace: { getConfiguration: () => ({ get: (key: string, fallback: unknown) => (key === 'reloadBehavior' ? vscode.reloadBehavior : fallback) }) },
}));

import { CommandController } from '../../src/ui/commands';
import type { ProfileStore } from '../../src/core/profiles';

function controller() {
  const store = { list: () => [{ id: 'personal', dir: '/p/personal' }, { id: 'work', dir: '/p/work' }] } as unknown as ProfileStore;
  const context = {
    workspaceState: { update: vi.fn() },
    environmentVariableCollection: { replace: vi.fn(), delete: vi.fn() },
    subscriptions: [],
  };
  const status = { update: vi.fn() };
  const ctl = new CommandController(context as never, store, 'personal', false, status as never, {} as never);
  return { ctl, status };
}

describe('CommandController.switchTo', () => {
  const savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  beforeEach(() => {
    vscode.reloadBehavior = 'ask';
    vscode.executeCommand.mockReset();
    vscode.showInformationMessage.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
  });

  it('asks to restart extensions when switching away from the loaded profile', async () => {
    const { ctl, status } = controller();
    await ctl.switchTo('work');
    expect(status.update).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'work' }), true, 'name');
    expect(vscode.showInformationMessage).toHaveBeenCalledTimes(1);
  });

  it('clears pending reload without prompting when switching back to the loaded profile', async () => {
    const { ctl, status } = controller();
    await ctl.switchTo('work');
    await ctl.switchTo('personal');
    expect(status.update).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'personal' }), false, 'name');
    expect(vscode.showInformationMessage).toHaveBeenCalledTimes(1);
    expect(process.env.CLAUDE_CONFIG_DIR).toBe('/p/personal');
  });

  it('restarts the extension host instead of reloading the window', async () => {
    vscode.reloadBehavior = 'always';
    const { ctl } = controller();
    await ctl.switchTo('work');
    expect(vscode.executeCommand).toHaveBeenCalledWith('workbench.action.restartExtensionHost');
  });
});
