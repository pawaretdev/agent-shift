export interface LimitSignal { kind: 'session' | 'weekly' | 'opus' | 'sonnet'; resetsAt?: string }

export function parseLimitSignal(input: unknown): LimitSignal | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  // UNDOCUMENTED: Subscription caps are assumed to reach StopFailure hooks as error "rate_limit".
  if (record.error !== 'rate_limit' || typeof record.last_assistant_message !== 'string') return undefined;
  const message = record.last_assistant_message;
  if (/\b85%\b/i.test(message) || !/you(?:'|’)ve hit your .+ limit/i.test(message)) return undefined;
  const lower = message.toLowerCase();
  const kind = lower.includes('opus') ? 'opus' : lower.includes('sonnet') ? 'sonnet' : lower.includes('weekly') ? 'weekly' : 'session';
  const reset = message.match(/resets?\s+([^\n·.]+)/i)?.[1]?.trim();
  return { kind, ...(reset ? { resetsAt: reset } : {}) };
}
