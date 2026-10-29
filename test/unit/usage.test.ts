import { describe, expect, it } from 'vitest';
import { formatProfileUsage, formatUsageRow, parseUsageReport, type UsageRow } from '../../src/core/usage';

const usageLine = JSON.stringify({
  type: 'assistant',
  message: { usage: {} },
  usage_report: {
    session: {},
    rate_limits: {
      limits: [
        { kind: 'session', group: 'session', percent: 27, resets_at: '2026-10-29T20:29:59.592325+00:00', scope: null, severity: 'normal', is_active: false },
        { kind: 'weekly_all', group: 'weekly', percent: 68, resets_at: '2026-11-03T13:59:59.592343+00:00', scope: null, severity: 'normal', is_active: true },
        { kind: 'weekly_sonnet', group: 'weekly', percent: 12, resets_at: '2026-11-03T13:59:59.592343+00:00' },
      ],
      extra_usage: {},
    },
  },
});

describe('parseUsageReport', () => {
  it('projects session and all-model weekly rows from the first usage report', () => {
    const before = Date.now();
    const usage = parseUsageReport(`${JSON.stringify({ type: 'system' })}\n${usageLine}\n`);
    expect(usage).toEqual({
      session: { kind: 'session', group: 'session', percent: 27, resetsAt: '2026-10-29T20:29:59.592325+00:00' },
      weekly: { kind: 'weekly_all', group: 'weekly', percent: 68, resetsAt: '2026-11-03T13:59:59.592343+00:00' },
      fetchedAt: expect.any(Number),
    });
    expect(usage!.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns undefined for null rate limits', () => {
    expect(parseUsageReport(JSON.stringify({ usage_report: { rate_limits: null } }))).toBeUndefined();
  });

  it('skips non-JSON lines', () => {
    expect(parseUsageReport(`not json\n${usageLine}`)?.session?.percent).toBe(27);
    expect(parseUsageReport('not json')).toBeUndefined();
  });

  it('keeps weekly usage when the session row is missing', () => {
    const usage = parseUsageReport(JSON.stringify({
      usage_report: { rate_limits: { limits: [{ kind: 'weekly_all', group: 'weekly', percent: 42, resets_at: '2026-11-03T13:59:59Z' }] } },
    }));
    expect(usage?.session).toBeUndefined();
    expect(usage?.weekly?.percent).toBe(42);
  });
});

describe('usage formatting', () => {
  const row = (resetsAt: string): UsageRow => ({ kind: 'session', group: 'session', percent: 27, resetsAt });

  it('shows only local time when the reset is today', () => {
    const reset = new Date(2026, 9, 30, 3, 29);
    const expectedTime = reset.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(formatUsageRow(row(reset.toISOString()), '5h', new Date(2026, 9, 30, 1))).toBe(`5h 27% · resets ${expectedTime}`);
  });

  it('includes the local date when the reset is later', () => {
    const reset = new Date(2026, 10, 3, 20);
    const expectedDate = reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const expectedTime = reset.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(formatUsageRow(row(reset.toISOString()), 'week', new Date(2026, 9, 30))).toBe(`week 27% · resets ${expectedDate} ${expectedTime}`);
  });

  it('formats session and weekly rows together', () => {
    const reset = new Date(2026, 9, 30, 3, 29);
    const usage = { session: row(reset.toISOString()), weekly: { ...row(reset.toISOString()), kind: 'weekly_all', group: 'weekly', percent: 68 }, fetchedAt: 0 };
    expect(formatProfileUsage(usage, new Date(2026, 9, 30))).toContain('5h 27%');
    expect(formatProfileUsage(usage, new Date(2026, 9, 30))).toContain('week 68%');
  });
});
