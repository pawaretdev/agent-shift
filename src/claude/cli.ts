import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { projectIdentity } from '../core/redact';
import type { ProfileIdentity } from '../core/profiles';

const execFileAsync = promisify(execFile);

function profileEnv(configDir?: string, base = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
  else delete env.CLAUDE_CONFIG_DIR;
  return env;
}

export async function authStatus(configDir?: string, executable = 'claude'): Promise<ProfileIdentity> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(executable, ['auth', 'status', '--json'], {
      env: profileEnv(configDir),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
    }));
  } catch (error) {
    // Exit 1 means "not logged in" and still prints JSON; any other failure is rethrown without stdout/stderr.
    const failure = error as { code?: unknown; stdout?: unknown };
    if (failure.code !== 1 || typeof failure.stdout !== 'string') throw new Error(`claude auth status failed (${String(failure.code)})`);
    stdout = failure.stdout;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('claude auth status returned non-JSON output');
  }
  // UNDOCUMENTED: Some Claude versions add loggedIn, email, orgName, orgId, and subscriptionType to auth status JSON.
  return projectIdentity(parsed);
}

export async function logout(configDir: string, executable = 'claude'): Promise<void> {
  try {
    await execFileAsync(executable, ['auth', 'logout'], {
      env: profileEnv(configDir),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 60_000,
    });
  } catch (error) {
    // execFile embeds stderr in error.message; surface only the exit code.
    throw new Error(`claude auth logout failed (${String((error as { code?: unknown }).code)})`);
  }
}
