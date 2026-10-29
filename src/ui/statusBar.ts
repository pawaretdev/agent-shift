import * as vscode from 'vscode';
import type { Profile, ProfileIdentity } from '../core/profiles';
import { formatUsageRow, type ProfileUsage } from '../core/usage';

export class ProfileStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);

  constructor() {
    this.item.command = 'agentShift.switch';
    this.item.name = 'AgentShift';
  }

  update(profile: Profile | undefined, pendingReload = false, style: string = 'name', usage?: ProfileUsage): void {
    if (style === 'hidden') { this.item.hide(); return; }
    const label = profile?.label ?? 'Default';
    this.item.text = style === 'compact' ? '$(account)' : `$(account) ${label}`;
    if (style !== 'compact' && usage?.session) this.item.text += ` ${usage.session.percent}%`;
    if (pendingReload) this.item.text += ' $(refresh) pending reload';
    this.item.tooltip = this.tooltip(label, profile?.identity, pendingReload, usage);
    this.item.backgroundColor = pendingReload ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.item.show();
  }

  private tooltip(label: string, identity?: ProfileIdentity, pendingReload = false, usage?: ProfileUsage): vscode.MarkdownString {
    const lines = [`**AgentShift: ${label}**`];
    if (identity?.email) lines.push(identity.email);
    if (identity?.orgName) lines.push(`Organization: ${identity.orgName}`);
    if (identity?.subscriptionType) lines.push(`Plan: ${identity.subscriptionType}`);
    if (usage?.session) lines.push(formatUsageRow(usage.session, 'Session'));
    if (usage?.weekly) lines.push(formatUsageRow(usage.weekly, 'Weekly'));
    if (usage) lines.push(`Checked ${Math.max(0, Math.floor((Date.now() - usage.fetchedAt) / 60_000))} min ago`);
    if (pendingReload) lines.push('Restart extensions (or reload the window) before using the Claude Code panel.');
    return new vscode.MarkdownString(lines.join('\n\n'));
  }

  dispose(): void { this.item.dispose(); }
}
