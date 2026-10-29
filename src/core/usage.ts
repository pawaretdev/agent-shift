export interface UsageRow {
  kind: string;
  group: string;
  percent: number;
  resetsAt: string;
}

export interface ProfileUsage {
  session?: UsageRow;
  weekly?: UsageRow;
  fetchedAt: number;
}

export function parseUsageReport(stdout: string): ProfileUsage | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!isRecord(parsed) || !('usage_report' in parsed)) continue;
    const report = parsed.usage_report;
    if (!isRecord(report) || !('rate_limits' in report) || report.rate_limits === null) return undefined;
    const rateLimits = report.rate_limits;
    if (!isRecord(rateLimits) || !Array.isArray(rateLimits.limits)) return undefined;
    const rows = rateLimits.limits.map(projectRow).filter((row): row is UsageRow => row !== undefined);
    return {
      session: rows.find((row) => row.group === 'session'),
      weekly: rows.find((row) => row.kind === 'weekly_all'),
      fetchedAt: Date.now(),
    };
  }
  return undefined;
}

export function formatUsageRow(row: UsageRow, label: string, now = new Date()): string {
  const reset = new Date(row.resetsAt);
  if (Number.isNaN(reset.getTime())) return `${label} ${row.percent}%`;
  const sameDay = reset.getFullYear() === now.getFullYear()
    && reset.getMonth() === now.getMonth()
    && reset.getDate() === now.getDate();
  const time = reset.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = sameDay ? '' : `${reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} `;
  return `${label} ${row.percent}% · resets ${date}${time}`;
}

export function formatProfileUsage(usage: ProfileUsage, now = new Date()): string {
  return [
    usage.session && formatUsageRow(usage.session, '5h', now),
    usage.weekly && formatUsageRow(usage.weekly, 'week', now),
  ].filter((value): value is string => Boolean(value)).join(' · ');
}

function projectRow(input: unknown): UsageRow | undefined {
  if (!isRecord(input)) return undefined;
  const { kind, group, percent, resets_at: resetsAt } = input;
  if (typeof kind !== 'string' || typeof group !== 'string' || typeof percent !== 'number' || !Number.isFinite(percent) || typeof resetsAt !== 'string') return undefined;
  return { kind, group, percent, resetsAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
