import * as vscode from 'vscode';
import { readFileSync, rmSync } from 'node:fs';
import type { Profile } from '../core/profiles';
import { parseLimitSignal } from '../core/limits';

interface StoredSignal { profileDir?: string; error?: string; message?: string }

export function watchLimitSignals(
  context: vscode.ExtensionContext,
  active: () => { profile?: Profile; profiles: Profile[] },
  switchTo: (id: string) => Promise<void>,
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(context.globalStorageUri, 'signals/*.json');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const handle = async (uri: vscode.Uri) => {
    try {
      const stored = JSON.parse(readFileSync(uri.fsPath, 'utf8')) as StoredSignal;
      rmSync(uri.fsPath, { force: true });
      const state = active();
      if (!state.profile || stored.profileDir !== state.profile.dir) return;
      const signal = parseLimitSignal({ error: stored.error, last_assistant_message: stored.message });
      if (!signal || !vscode.workspace.getConfiguration('agentShift').get('suggestSwitchOnLimit', true)) return;
      const alternative = state.profiles.find((profile) => profile.id !== state.profile!.id && profile.identity?.loggedIn);
      const suffix = signal.resetsAt ? ` (resets ${signal.resetsAt})` : '';
      const action = alternative ? `Switch to ${alternative.label}` : undefined;
      const selected = await vscode.window.showWarningMessage(`Profile ${state.profile.label} hit its ${signal.kind} limit${suffix}.`, ...(action ? [action] : []));
      if (selected === action && alternative) await switchTo(alternative.id);
    } catch {
      rmSync(uri.fsPath, { force: true });
    }
  };
  watcher.onDidCreate(handle, undefined, context.subscriptions);
  return watcher;
}
