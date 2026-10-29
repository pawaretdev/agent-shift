import * as vscode from 'vscode';
import { sameAccount, type Profile, type ProfileIdentity } from '../core/profiles';
import { defaultConfigDir } from '../core/paths';
import { formatProfileUsage, type ProfileUsage } from '../core/usage';

export type ProfilePick = Profile | 'default' | 'add' | 'manage';

export interface UsageSource {
  get(configDir: string): ProfileUsage | undefined;
  isStale(configDir: string): boolean;
  refresh(configDir: string): Promise<ProfileUsage | undefined>;
}

interface ProfilePickItem extends vscode.QuickPickItem {
  value: ProfilePick;
  configDir?: string;
  subscriptionType?: string;
}

export async function pickProfile(
  profiles: Profile[],
  activeId: string,
  usage: UsageSource,
  defaultIdentity: ProfileIdentity | undefined,
  includeActions = true,
): Promise<ProfilePick | undefined> {
  const quickPick = vscode.window.createQuickPick<ProfilePickItem>();
  quickPick.placeholder = 'Choose a Claude Code profile';
  const earlier = [{ label: 'Default', identity: defaultIdentity }, ...profiles];
  const twinNote = (profile: Profile, index: number) => {
    const twin = earlier.slice(0, index + 1).find((other) => sameAccount(other.identity, profile.identity));
    return twin ? ` · same account as ${twin.label}` : '';
  };
  const items: ProfilePickItem[] = [
    profileItem({ label: '$(home) Default', description: activeId === 'default' ? 'Active' : '~/.claude', value: 'default', configDir: defaultConfigDir() }, usage),
    ...profiles.map((profile, index) => profileItem({
      label: `$(account) ${profile.label}`,
      description: (profile.id === activeId ? 'Active' : profile.identity?.orgName ?? profile.identity?.email ?? '') + twinNote(profile, index),
      value: profile,
      configDir: profile.dir,
      subscriptionType: profile.identity?.subscriptionType,
    }, usage)),
  ];
  if (includeActions) items.push(
    { label: '$(add) Add profile…', value: 'add' },
    { label: '$(settings-gear) Manage profiles…', value: 'manage' },
  );
  quickPick.items = items;
  const active = items.find((item) => item.value === 'default' ? activeId === 'default' : typeof item.value === 'object' && item.value.id === activeId);
  if (active) quickPick.activeItems = [active];

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: ProfilePick) => {
      if (settled) return;
      settled = true;
      resolve(value);
      quickPick.hide();
      quickPick.dispose();
    };
    quickPick.onDidAccept(() => finish(quickPick.selectedItems[0]?.value));
    quickPick.onDidHide(() => finish());
    quickPick.show();

    const stale = items.filter((item) => item.configDir && usage.isStale(item.configDir));
    if (!stale.length) return;
    quickPick.busy = true;
    void Promise.all(stale.map(async (item) => {
      await usage.refresh(item.configDir!);
      item.detail = usageDetail(item.subscriptionType, usage.get(item.configDir!));
      if (settled) return;
      // Replacing items resets the highlight to the first row; keep the user's place.
      const highlighted = quickPick.activeItems;
      quickPick.items = [...items];
      quickPick.activeItems = highlighted;
    })).finally(() => { if (!settled) quickPick.busy = false; });
  });
}

function profileItem(item: ProfilePickItem, usage: UsageSource): ProfilePickItem {
  item.detail = usageDetail(item.subscriptionType, item.configDir ? usage.get(item.configDir) : undefined);
  return item;
}

function usageDetail(subscriptionType?: string, usage?: ProfileUsage): string | undefined {
  const usageText = usage && formatProfileUsage(usage);
  return [subscriptionType, usageText].filter(Boolean).join(' · ') || undefined;
}
