import type { Profile } from './profiles';
import { DEFAULT_PROFILE_ID } from './paths';

export interface ProfileRule { glob: string; profile: string }
export interface ResolveInput {
  windowChoice?: string;
  workspaceDefault?: string;
  rules?: ProfileRule[];
  workspacePath?: string;
  profiles: Profile[];
}

export function globMatches(value: string, glob: string): boolean {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`).test(value.replace(/\\/g, '/'));
}

export function resolveProfileId(input: ResolveInput): string {
  const exists = (id: string | undefined) => id === DEFAULT_PROFILE_ID || input.profiles.some((profile) => profile.id === id);
  if (exists(input.windowChoice)) return input.windowChoice!;
  if (exists(input.workspaceDefault)) return input.workspaceDefault!;
  if (input.workspacePath) {
    const match = input.rules?.find((rule) => globMatches(input.workspacePath!, rule.glob) && exists(rule.profile));
    if (match) return match.profile;
  }
  return DEFAULT_PROFILE_ID;
}

/** Returns the env-var array minus CLAUDE_CONFIG_DIR entries, or undefined when there is nothing to remove. */
export function withoutConfigDir(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const next = value.filter((entry) => (entry as { name?: unknown } | null)?.name !== 'CLAUDE_CONFIG_DIR');
  return next.length === value.length ? undefined : next;
}
