import type { ProfileIdentity } from './profiles';

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b[A-Za-z0-9+/]{48,}={0,2}\b/g,
];

export function redact(value: unknown): string {
  // Errors only contribute their message: child-process errors carry raw stdout/stderr as own properties.
  let output = typeof value === 'string' ? value : value instanceof Error ? value.message : (JSON.stringify(value) ?? String(value));
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, '[REDACTED]');
  return output;
}

const IDENTITY_KEYS = ['loggedIn', 'authMethod', 'email', 'orgName', 'orgId', 'subscriptionType', 'configDirectory'] as const;

export function projectIdentity(input: unknown): ProfileIdentity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const record = input as Record<string, unknown>;
  const projected: Record<string, string | boolean> = {};
  for (const key of IDENTITY_KEYS) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'boolean') projected[key] = value;
  }
  return projected as ProfileIdentity;
}
