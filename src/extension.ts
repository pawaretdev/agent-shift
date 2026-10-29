import * as vscode from 'vscode';
import { join } from 'node:path';
import { applyInitialEnvironment, updateTerminalEnvironment, warnOnClaudeEnvironmentConflict } from './claude/envInjector';
import { installHookScript, installStopFailureHook } from './claude/hookInstaller';
import { authStatus } from './claude/cli';
import { defaultConfigDir } from './core/paths';
import type { ProfileStore } from './core/profiles';
import { Log } from './log';
import { CommandController } from './ui/commands';
import { watchLimitSignals } from './ui/notifications';
import { ProfileStatusBar } from './ui/statusBar';

export function activate(context: vscode.ExtensionContext): void {
  // UNDOCUMENTED: Cursor-specific extension hosting is assumed to match VS Code closely enough for this integration.
  const bootstrap = applyInitialEnvironment(context);
  updateTerminalEnvironment(context.environmentVariableCollection, bootstrap.dir);
  const log = new Log();
  const status = new ProfileStatusBar();
  const store = bootstrap.store;
  const controller = new CommandController(context, store, bootstrap.id, status, log);
  controller.register();
  try { installHookScript(join(context.extensionPath, 'dist', 'hook', 'stop-failure.js'), context.globalStorageUri.fsPath); } catch (error) { log.error(error); }
  // Links must be in place before the Claude Code extension reads the profile directory.
  controller.applyDataSharing(false);
  controller.repairHooks();
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('agentShift.dataSharing')) controller.applyDataSharing(true);
  }));
  context.subscriptions.push(log, status, controller, watchLimitSignals(context, () => controller.state(), (id) => controller.switchTo(id)));
  void warnOnClaudeEnvironmentConflict();
  void refreshIdentities(store, controller, log);
  void offerDefaultHook(context, controller);
}

export function deactivate(): void {}

async function refreshIdentities(store: ProfileStore, controller: CommandController, log: Log): Promise<void> {
  for (const profile of store.list()) {
    try {
      store.updateIdentity(profile.id, await authStatus(profile.dir));
    } catch (error) {
      log.error(error);
    }
  }
  let defaultIdentity;
  try { defaultIdentity = await authStatus(); } catch (error) { log.error(error); }
  controller.refresh(defaultIdentity);
}

async function offerDefaultHook(context: vscode.ExtensionContext, controller: CommandController): Promise<void> {
  if (!vscode.workspace.isTrusted || context.globalState.get<boolean>('defaultHookDecisionMade')) return;
  const choice = await vscode.window.showInformationMessage(
    'Allow AgentShift to install its usage-limit hook in the Default Claude profile?',
    'Install hook',
    "Don't ask again",
  );
  if (choice === undefined) return;
  await context.globalState.update('defaultHookDecisionMade', true);
  if (choice !== 'Install hook') return;
  const configDir = defaultConfigDir();
  installStopFailureHook(configDir, controller.hookFor(configDir));
}
