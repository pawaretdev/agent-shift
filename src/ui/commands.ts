import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ProfileStore, type Profile } from '../core/profiles';
import { DEFAULT_PROFILE_ID, defaultConfigDir } from '../core/paths';
import { copyHistorySession, listHistory, uniqueSessions } from '../core/history';
import { shareProfileData, unshareProfileData, type DataSharing } from '../core/sharing';
import { authStatus, logout } from '../claude/cli';
import { applyProcessEnvironment, updateTerminalEnvironment } from '../claude/envInjector';
import { hookCommand, installStopFailureHook, removeAgentShiftHooks } from '../claude/hookInstaller';
import { pickProfile } from './picker';
import type { ProfileStatusBar } from './statusBar';
import type { Log } from '../log';

export class CommandController {
  private profiles: Profile[];
  private activeId: string;
  private pendingReload: boolean;
  /** The profile this window's Claude Code process was started with; only a reload changes it. */
  private readonly loadedId: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: ProfileStore,
    initialId: string,
    pendingReload: boolean,
    private readonly status: ProfileStatusBar,
    private readonly log: Log,
  ) {
    this.profiles = store.list();
    this.activeId = initialId;
    this.loadedId = initialId;
    this.pendingReload = pendingReload;
    this.render();
  }

  register(): void {
    const command = (id: string, fn: () => unknown) => this.context.subscriptions.push(vscode.commands.registerCommand(id, fn));
    command('agentShift.switch', () => this.chooseProfile());
    command('agentShift.add', () => this.addProfile());
    command('agentShift.manage', () => this.manageProfiles());
    command('agentShift.setWorkspaceDefault', () => this.setWorkspaceDefault());
    command('agentShift.clearWorkspaceDefault', () => this.clearWorkspaceDefault());
    command('agentShift.switchToPrevious', () => this.switchToPrevious());
    command('agentShift.browseHistory', () => this.browseHistory());
    command('agentShift.setDataSharing', () => this.chooseDataSharing());
  }

  state(): { profile?: Profile; profiles: Profile[] } {
    return { profile: this.profiles.find((profile) => profile.id === this.activeId), profiles: this.profiles };
  }

  refresh(): void {
    this.profiles = this.store.list();
    this.render();
  }

  /**
   * Links every managed profile's history and configuration to the Default profile (~/.claude), or undoes it.
   * On activation (transition false) this only repairs links; a setting change also moves the limit hook.
   */
  applyDataSharing(transition: boolean): void {
    if (!vscode.workspace.isTrusted) return;
    const sharedDir = defaultConfigDir();
    const mode = dataSharing();
    if (mode === 'isolated' && !transition) return;
    for (const profile of this.profiles) {
      try {
        if (mode === 'shared') {
          const result = shareProfileData(profile.dir, sharedDir);
          if (result.skipped.length) this.log.info(`${profile.id}: left existing links alone: ${result.skipped.join(', ')}`);
          if (result.backupDir) this.log.info(`${profile.id}: entries that clashed with ~/.claude were kept in ${result.backupDir}`);
        } else {
          unshareProfileData(profile.dir, sharedDir);
          removeAgentShiftHooks(profile.dir);
          installStopFailureHook(profile.dir, this.hookFor(profile.dir));
        }
      } catch (error) { this.log.error(error); }
    }
    if (mode === 'shared' && transition) {
      // One hook in the shared settings.json reports whichever profile ran it, via CLAUDE_CONFIG_DIR.
      removeAgentShiftHooks(sharedDir);
      installStopFailureHook(sharedDir, this.hookFor(sharedDir));
    }
  }

  private hookFor(profileDir: string): string {
    const script = join(this.context.extensionPath, 'dist', 'hook', 'stop-failure.js');
    return hookCommand(script, join(this.context.globalStorageUri.fsPath, 'signals'), profileDir);
  }

  async switchTo(id: string): Promise<void> {
    if (id !== DEFAULT_PROFILE_ID && !this.profiles.some((profile) => profile.id === id)) id = DEFAULT_PROFILE_ID;
    if (id === this.activeId && !this.pendingReload) return;
    const previous = this.activeId;
    this.activeId = id;
    await this.context.workspaceState.update('previousProfile', previous);
    await this.context.workspaceState.update('activeProfile', id);
    const dir = this.profiles.find((profile) => profile.id === id)?.dir;
    applyProcessEnvironment(dir);
    updateTerminalEnvironment(this.context.environmentVariableCollection, dir);
    // Switching back to the profile the window loaded with needs no reload.
    this.pendingReload = id !== this.loadedId;
    this.render();
    if (!this.pendingReload) return;
    const behavior = vscode.workspace.getConfiguration('agentShift').get<'ask' | 'always' | 'never'>('reloadBehavior', 'ask');
    // UNDOCUMENTED: restarting only the extension host is assumed enough for the Claude Code panel to relaunch with the new CLAUDE_CONFIG_DIR.
    if (behavior === 'always') await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
    if (behavior === 'ask') {
      const choice = await vscode.window.showInformationMessage('Restart extensions so Claude Code uses the selected profile.', 'Restart');
      if (choice === 'Restart') await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
    }
  }

  private async chooseProfile(): Promise<void> {
    const choice = await pickProfile(this.profiles, this.activeId);
    if (!choice) return;
    if (choice === 'add') return this.addProfile();
    if (choice === 'manage') return this.manageProfiles();
    await this.switchTo(choice === 'default' ? DEFAULT_PROFILE_ID : choice.id);
  }

  private assertTrusted(): boolean {
    if (vscode.workspace.isTrusted) return true;
    void vscode.window.showWarningMessage('Agent Shift is read-only in untrusted workspaces.');
    return false;
  }

  private async addProfile(): Promise<void> {
    if (!this.assertTrusted()) return;
    const label = await vscode.window.showInputBox({ prompt: 'Profile name', validateInput: (value) => value.trim() ? undefined : 'Enter a name' });
    if (!label) return;
    const method = await vscode.window.showQuickPick([
      { label: 'Browser login', flag: undefined },
      { label: 'Email login', flag: '--email' },
      { label: 'SSO login', flag: '--sso' },
      { label: 'Console/API billing (may not be isolated)', flag: '--console' },
    ], { placeHolder: 'Choose a Claude login method' });
    if (!method) return;
    const loginArgs = method.flag ? [method.flag] : [];
    if (method.flag === '--email') {
      // Strict pattern doubles as shell-safety: the value is typed into a terminal unquoted.
      const email = await vscode.window.showInputBox({ prompt: 'Email address', validateInput: (value) => /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(value.trim()) ? undefined : 'Enter a valid email' });
      if (!email) return;
      loginArgs.push(email.trim());
    }
    const profile = this.store.create(label.trim());
    this.profiles = this.store.list();
    if (dataSharing() === 'shared') shareProfileData(profile.dir, defaultConfigDir());
    else installStopFailureHook(profile.dir, this.hookFor(profile.dir));
    const terminal = vscode.window.createTerminal({ name: `Agent Shift: ${profile.label}`, env: { CLAUDE_CONFIG_DIR: profile.dir } });
    terminal.sendText(['claude', 'auth', 'login', ...loginArgs].join(' '));
    terminal.show();
    const disposable = vscode.window.onDidCloseTerminal(async (closed) => {
      if (closed !== terminal) return;
      disposable.dispose();
      try {
        const identity = await authStatus(profile.dir);
        if (identity.loggedIn === false) {
          this.store.deleteManagedDirectory(profile);
          this.profiles = this.store.list();
          if (this.activeId === profile.id) await this.switchTo(DEFAULT_PROFILE_ID);
          this.render();
          void vscode.window.showWarningMessage(`Login for ${profile.label} did not complete; the profile was removed.`);
          return;
        }
        this.store.updateIdentity(profile.id, identity);
        this.profiles = this.store.list();
        this.render();
      } catch (error) { this.log.error(error); }
    });
    await this.switchTo(profile.id);
  }

  private async manageProfiles(): Promise<void> {
    if (!this.assertTrusted()) return;
    if (this.profiles.length === 0) { void vscode.window.showInformationMessage('No managed profiles.'); return; }
    const selected = await vscode.window.showQuickPick(this.profiles.map((profile) => ({ label: profile.label, description: profile.id, profile })), { placeHolder: 'Select a profile to remove' });
    if (!selected) return;
    const confirmed = await vscode.window.showWarningMessage(`Log out and permanently delete profile ${selected.profile.label}?`, { modal: true }, 'Delete');
    if (confirmed !== 'Delete') return;
    try { await logout(selected.profile.dir); } catch (error) { this.log.error(error); void vscode.window.showErrorMessage('Claude logout failed; the profile was not deleted.'); return; }
    this.store.deleteManagedDirectory(selected.profile);
    this.profiles = this.store.list();
    if (this.activeId === selected.profile.id) await this.switchTo(DEFAULT_PROFILE_ID);
    this.render();
  }

  private async setWorkspaceDefault(): Promise<void> {
    if (!this.assertTrusted()) return;
    const choice = await pickProfile(this.profiles, this.activeId, false);
    if (!choice) return;
    const id = choice === 'default' ? DEFAULT_PROFILE_ID : (typeof choice === 'object' ? choice.id : DEFAULT_PROFILE_ID);
    await this.context.workspaceState.update('workspaceDefault', id);
    void vscode.window.showInformationMessage(`Workspace default set to ${id === DEFAULT_PROFILE_ID ? 'Default' : this.profiles.find((profile) => profile.id === id)?.label}.`);
  }

  private async clearWorkspaceDefault(): Promise<void> {
    if (!this.assertTrusted()) return;
    await this.context.workspaceState.update('workspaceDefault', undefined);
  }

  private async chooseDataSharing(): Promise<void> {
    if (!this.assertTrusted()) return;
    const current = dataSharing();
    const picked = await vscode.window.showQuickPick([
      { label: 'Isolated', description: current === 'isolated' ? 'Active' : undefined, detail: 'Each profile keeps its own conversations, settings, skills, and plugins.', mode: 'isolated' as const },
      { label: 'Shared', description: current === 'shared' ? 'Active' : undefined, detail: 'All profiles use the conversations, settings, skills, and plugins in ~/.claude. Logins stay separate.', mode: 'shared' as const },
    ], { placeHolder: 'How should profiles store Claude Code data?' });
    if (!picked || picked.mode === current) return;
    const message = picked.mode === 'shared'
      ? 'Merge every profile\'s conversations and configuration into ~/.claude and link them there? Entries that clash with ~/.claude are kept in each profile\'s .agent-shift-backup folder. The usage-limit hook moves to ~/.claude/settings.json.'
      : 'Stop sharing? Profiles get a copy of the current settings, skills, and plugins. Conversations stay in ~/.claude and remain reachable through Browse Conversations.';
    const confirmed = await vscode.window.showWarningMessage(message, { modal: true }, picked.label);
    if (confirmed !== picked.label) return;
    // The configuration listener applies the change.
    await vscode.workspace.getConfiguration('agentShift').update('dataSharing', picked.mode, vscode.ConfigurationTarget.Global);
    const choice = await vscode.window.showInformationMessage('Restart extensions so Claude Code picks up the shared data.', 'Restart');
    if (choice === 'Restart') await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
  }

  private async switchToPrevious(): Promise<void> {
    await this.switchTo(this.context.workspaceState.get<string>('previousProfile', DEFAULT_PROFILE_ID));
  }

  private async browseHistory(): Promise<void> {
    if (!this.assertTrusted()) return;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) { void vscode.window.showInformationMessage('Open a workspace folder to browse conversations.'); return; }
    if (!this.context.globalState.get<boolean>('historyDisclosureAccepted')) {
      const accepted = await vscode.window.showWarningMessage('Conversation transcripts may contain secrets and source code. Agent Shift reads only names and modification times until you select one to copy.', { modal: true }, 'Continue');
      if (accepted !== 'Continue') return;
      await this.context.globalState.update('historyDisclosureAccepted', true);
    }
    const all = uniqueSessions([
      ...listHistory(defaultConfigDir(), cwd, DEFAULT_PROFILE_ID),
      ...this.profiles.flatMap((profile) => listHistory(profile.dir, cwd, profile.id)),
    ]).sort((a, b) => b.mtimeMs - a.mtimeMs);
    const picked = await vscode.window.showQuickPick(all.map((session) => ({
      label: session.id,
      description: session.profileId === DEFAULT_PROFILE_ID ? 'Default' : this.profiles.find((profile) => profile.id === session.profileId)?.label,
      detail: new Date(session.mtimeMs).toLocaleString(),
      session,
    })), { placeHolder: 'Choose a conversation to copy and resume' });
    if (!picked) return;
    const targetDir = this.profiles.find((profile) => profile.id === this.activeId)?.dir ?? defaultConfigDir();
    try {
      const { copied } = copyHistorySession(picked.session.file, targetDir, cwd);
      // UNDOCUMENTED: Claude is expected to discover a transcript copied into the active encoded project directory by session id.
      const terminal = vscode.window.createTerminal({ name: 'Agent Shift: Resume', env: this.activeId === DEFAULT_PROFILE_ID ? { CLAUDE_CONFIG_DIR: null } : { CLAUDE_CONFIG_DIR: targetDir } });
      terminal.sendText(`claude --resume ${picked.session.id}${copied ? ' --fork-session' : ''}`);
      terminal.show();
    } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
  }

  private render(): void {
    this.status.update(this.profiles.find((profile) => profile.id === this.activeId), this.pendingReload, vscode.workspace.getConfiguration('agentShift').get('statusBarStyle', 'name'));
  }
}

function dataSharing(): DataSharing {
  return vscode.workspace.getConfiguration('agentShift').get<DataSharing>('dataSharing', 'isolated');
}
