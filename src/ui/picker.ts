import * as vscode from 'vscode';
import type { Profile } from '../core/profiles';

export type ProfilePick = Profile | 'default' | 'add' | 'manage';

export async function pickProfile(profiles: Profile[], activeId: string, includeActions = true): Promise<ProfilePick | undefined> {
  const items: Array<vscode.QuickPickItem & { value: ProfilePick }> = [
    { label: '$(home) Default', description: activeId === 'default' ? 'Active' : '~/.claude', value: 'default' },
    ...profiles.map((profile) => ({
      label: `$(account) ${profile.label}`,
      description: profile.id === activeId ? 'Active' : profile.identity?.orgName ?? profile.identity?.email,
      detail: profile.identity?.subscriptionType,
      value: profile,
    })),
  ];
  if (includeActions) items.push(
    { label: '$(add) Add profile…', value: 'add' },
    { label: '$(settings-gear) Manage profiles…', value: 'manage' },
  );
  return (await vscode.window.showQuickPick(items, { placeHolder: 'Choose a Claude Code profile' }))?.value;
}
