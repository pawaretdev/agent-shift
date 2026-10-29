'use strict';

const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

const [signalDir, installedFor] = process.argv.slice(2);
// Shared profiles run one settings.json, so the installing profile is only a fallback for the profile that ran.
const profileDir = process.env.CLAUDE_CONFIG_DIR || installedFor;
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { if (input.length < 65536) input += chunk; });
process.stdin.on('end', () => {
  try {
    const value = JSON.parse(input);
    // UNDOCUMENTED: subscription caps are assumed to reach StopFailure as error "rate_limit".
    if (value.error !== 'rate_limit') return;
    const scrub = (text) => String(text ?? '').slice(0, 1000)
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .replace(/\b[A-Za-z0-9+/]{48,}={0,2}\b/g, '[REDACTED]');
    const signal = {
      profileDir,
      error: typeof value.error === 'string' ? value.error.slice(0, 80) : '',
      message: scrub(value.last_assistant_message),
      ts: Date.now(),
    };
    mkdirSync(signalDir, { recursive: true });
    writeFileSync(join(signalDir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(signal), { mode: 0o600 });
  } catch {
    process.exitCode = 1;
  }
});
