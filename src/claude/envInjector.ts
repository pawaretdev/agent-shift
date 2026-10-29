import * as vscode from 'vscode';
import { expandHome, defaultProfileRoot } from '../core/paths';
import { ProfileStore } from '../core/profiles';
import { resolveProfileId, withoutConfigDir, type ProfileRule } from '../core/resolve';

export interface BootstrapProfile { id: string; dir?: string; store: ProfileStore }

export function applyProcessEnvironment(configDir?: string): void {
  // UNDOCUMENTED: Claude Code is expected to inherit CLAUDE_CONFIG_DIR from the shared extension-host process environment.
  if (configDir) process.env.CLAUDE_CONFIG_DIR = configDir;
  else delete process.env.CLAUDE_CONFIG_DIR;
}

export function applyInitialEnvironment(context: vscode.ExtensionContext): BootstrapProfile {
  const configuration = vscode.workspace.getConfiguration('agentShift');
  const root = expandHome(configuration.get<string>('profileRoot') || defaultProfileRoot());
  const store = new ProfileStore(root);
  const profiles = store.list();
  const id = resolveProfileId({
    windowChoice: context.workspaceState.get<string>('activeProfile'),
    workspaceDefault: context.workspaceState.get<string>('workspaceDefault'),
    rules: configuration.get<ProfileRule[]>('rules', []),
    workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    profiles,
  });
  const dir = profiles.find((profile) => profile.id === id)?.dir;
  applyProcessEnvironment(dir);
  return { id, dir, store };
}

export function updateTerminalEnvironment(collection: vscode.EnvironmentVariableCollection, configDir?: string): void {
  if (configDir) collection.replace('CLAUDE_CONFIG_DIR', configDir);
  else collection.delete('CLAUDE_CONFIG_DIR');
}

export async function warnOnClaudeEnvironmentConflict(): Promise<void> {
  // claudeCode.environmentVariables is an array of {name, value} (schema of anthropic.claude-code).
  const setting = vscode.workspace.getConfiguration('claudeCode').inspect<unknown>('environmentVariables');
  const next = withoutConfigDir(setting?.globalValue);
  if (!next) return;
  const choice = await vscode.window.showWarningMessage(
    'A user-level CLAUDE_CONFIG_DIR entry in claudeCode.environmentVariables overrides AgentShift.',
    'Remove this entry',
  );
  if (choice !== 'Remove this entry') return;
  await vscode.workspace.getConfiguration('claudeCode').update('environmentVariables', next, vscode.ConfigurationTarget.Global);
}
