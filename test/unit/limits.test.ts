import { describe, expect, it } from 'vitest';
import { parseLimitSignal } from '../../src/core/limits';

describe('usage limit parsing', () => {
  it.each([
    ["You've hit your session limit · resets 3:45pm", 'session', '3:45pm'],
    ["You've hit your weekly limit · resets Monday", 'weekly', 'Monday'],
    ["You've hit your weekly Opus limit · resets 8pm", 'opus', '8pm'],
    ["You've hit your weekly Sonnet limit · resets tomorrow", 'sonnet', 'tomorrow'],
  ])('parses %s', (message, kind, resetsAt) => {
    expect(parseLimitSignal({ error: 'rate_limit', last_assistant_message: message })).toEqual({ kind, resetsAt });
  });

  it('ignores 85% warnings and non-rate-limit errors', () => {
    expect(parseLimitSignal({ error: 'rate_limit', last_assistant_message: "You've used 85% of your weekly limit" })).toBeUndefined();
    expect(parseLimitSignal({ error: 'other', last_assistant_message: "You've hit your session limit · resets 3:45pm" })).toBeUndefined();
  });
});
