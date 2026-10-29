import * as vscode from 'vscode';
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfigDir } from '../core/paths';
import type { Profile } from '../core/profiles';
import { parseLimitSignal } from '../core/limits';

interface StoredSignal { profileDir?: string; error?: string; message?: string }

export function watchLimitSignals(
  context: vscode.ExtensionContext,
  active: () => { profile?: Profile; profiles: Profile[] },
  switchTo: (id: string) => Promise<void>,
): vscode.Disposable {
  const pattern = new vscode.RelativePattern(context.globalStorageUri, 'signals/*.json');
  try {
    const dir = join(context.globalStorageUri.fsPath, 'signals');
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (Date.now() - statSync(file).mtimeMs > 10 * 60_000) rmSync(file, { force: true });
    }
  } catch { /* the folder may not exist yet */ }
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const handle = async (uri: vscode.Uri) => {
    try {
      const stored = JSON.parse(readFileSync(uri.fsPath, 'utf8')) as StoredSignal;
      const state = active();
      const activeDir = state.profile?.dir ?? defaultConfigDir();
      const label = state.profile?.label ?? 'Default';
      // Another window may own this signal; leave it for that window.
      if (stored.profileDir !== activeDir) return;
      rmSync(uri.fsPath, { force: true });
      const signal = parseLimitSignal({ error: stored.error, last_assistant_message: stored.message });
      if (!signal || !vscode.workspace.getConfiguration('agentShift').get('suggestSwitchOnLimit', true)) return;
      const alternative = state.profiles.find((profile) => profile.id !== state.profile?.id && profile.identity?.loggedIn);
      const suffix = signal.resetsAt ? ` (resets ${signal.resetsAt})` : '';
      const action = alternative ? `Switch to ${alternative.label}` : undefined;
      const selected = await vscode.window.showWarningMessage(`Profile ${label} hit its ${signal.kind} limit${suffix}.`, ...(action ? [action] : []));
      if (selected === action && alternative) await switchTo(alternative.id);
    } catch {
      rmSync(uri.fsPath, { force: true });
    }
  };
  watcher.onDidCreate(handle, undefined, context.subscriptions);
  return watcher;
}
