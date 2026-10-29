import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('pawaretdev.agent-shift');
  assert.ok(extension, 'Agent Shift extension is installed in the test host');
  await extension.activate();
  assert.equal(extension.isActive, true);
  const commands = await vscode.commands.getCommands(true);
  for (const id of [
    'agentShift.switch',
    'agentShift.add',
    'agentShift.manage',
    'agentShift.setWorkspaceDefault',
    'agentShift.clearWorkspaceDefault',
    'agentShift.switchToPrevious',
    'agentShift.browseHistory',
  ]) assert.ok(commands.includes(id), `${id} is registered`);
}
