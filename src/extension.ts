import * as vscode from 'vscode';
import { applyInitialEnvironment, updateTerminalEnvironment, warnOnClaudeEnvironmentConflict } from './claude/envInjector';
import { hookCommand, installStopFailureHook } from './claude/hookInstaller';
import { authStatus } from './claude/cli';
import { expandHome, defaultConfigDir, defaultProfileRoot } from './core/paths';
import { ProfileStore } from './core/profiles';
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
  const rootSetting = vscode.workspace.getConfiguration('agentShift').get<string>('profileRoot') || defaultProfileRoot();
  const store = new ProfileStore(expandHome(rootSetting));
  const controller = new CommandController(context, store, bootstrap.id, false, status, log);
  controller.register();
  // Links must be in place before the Claude Code extension reads the profile directory.
  controller.applyDataSharing(false);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('agentShift.dataSharing')) controller.applyDataSharing(true);
  }));
  context.subscriptions.push(log, status, watchLimitSignals(context, () => controller.state(), (id) => controller.switchTo(id)));
  void warnOnClaudeEnvironmentConflict();
  void refreshIdentities(store, controller, log);
  void offerDefaultHook(context);
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
  controller.refresh();
}

async function offerDefaultHook(context: vscode.ExtensionContext): Promise<void> {
  if (!vscode.workspace.isTrusted || context.globalState.get<boolean>('defaultHookDecisionMade')) return;
  await context.globalState.update('defaultHookDecisionMade', true);
  const choice = await vscode.window.showInformationMessage(
    'Allow AgentShift to install its usage-limit hook in the Default Claude profile?',
    'Install hook',
    'Not now',
  );
  if (choice !== 'Install hook') return;
  const configDir = defaultConfigDir();
  const command = hookCommand(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'hook', 'stop-failure.js').fsPath,
    vscode.Uri.joinPath(context.globalStorageUri, 'signals').fsPath,
    configDir,
  );
  installStopFailureHook(configDir, command);
}
