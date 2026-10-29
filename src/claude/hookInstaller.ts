import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeTarget } from '../core/sharing';

type HookCommand = { type: 'command'; command: string };
type HookGroup = { matcher?: string; hooks: HookCommand[] };
type ClaudeSettings = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> };

function readSettings(file: string): ClaudeSettings {
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8')) as ClaudeSettings;
}

function writeSettings(link: string, settings: ClaudeSettings): void {
  // A shared profile's settings.json is a symlink; renaming over it would silently unshare it.
  const file = writeTarget(link);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.agent-shift.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

const HOOK_MARKER = '# agent-shift-stop-failure';

export function hookCommand(scriptPath: string, signalDir: string, profileDir: string): string {
  const quote = (value: string) => JSON.stringify(value);
  return `node ${quote(scriptPath)} ${quote(signalDir)} ${quote(profileDir)} ${HOOK_MARKER}`;
}

export function installStopFailureHook(configDir: string, command: string): boolean {
  const file = join(configDir, 'settings.json');
  const settings = readSettings(file);
  const hooks = settings.hooks ?? {};
  const groups = Array.isArray(hooks.StopFailure) ? hooks.StopFailure : [];
  if (groups.some((group) => group.hooks?.some((hook) => hook.command === command))) return false;
  hooks.StopFailure = [...groups, { hooks: [{ type: 'command', command }] }];
  settings.hooks = hooks;
  writeSettings(file, settings);
  return true;
}

function removeHooks(configDir: string, drop: (command: string) => boolean): boolean {
  const file = join(configDir, 'settings.json');
  const settings = readSettings(file);
  const groups = settings.hooks?.StopFailure;
  if (!Array.isArray(groups)) return false;
  let removed = false;
  const next = groups.map((group) => ({ ...group, hooks: group.hooks.filter((hook) => {
    if (hook.command && drop(hook.command)) { removed = true; return false; }
    return true;
  }) })).filter((group) => group.hooks.length > 0);
  if (!removed) return false;
  settings.hooks!.StopFailure = next;
  writeSettings(file, settings);
  return true;
}

/** Removes every AgentShift hook, whichever profile or extension version installed it. */
export function removeAgentShiftHooks(configDir: string): boolean {
  return removeHooks(configDir, (command) => command.endsWith(HOOK_MARKER));
}

/** Swaps out AgentShift hooks of this signal dir that are not `command` (an older extension version); never installs where none existed. */
export function replaceStaleHooks(configDir: string, command: string, signalDir: string): boolean {
  const mine = JSON.stringify(signalDir);
  const removed = removeHooks(configDir, (existing) => existing.endsWith(HOOK_MARKER) && existing.includes(mine) && existing !== command);
  if (removed) installStopFailureHook(configDir, command);
  return removed;
}

/** Copies the hook script to a stable path that survives extension updates; the rename keeps concurrent windows safe. */
export function installHookScript(source: string, storageDir: string): string {
  mkdirSync(storageDir, { recursive: true });
  const target = join(storageDir, 'stop-failure.js');
  const tmp = join(storageDir, `stop-failure.js.${process.pid}.tmp`);
  copyFileSync(source, tmp);
  renameSync(tmp, target);
  return target;
}
