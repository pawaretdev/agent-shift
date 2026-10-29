import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { runTests } = require('@vscode/test-electron');

// Inherited from VS Code-hosted terminals; would make the test host boot as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fakeHome = mkdtempSync(resolve(tmpdir(), 'agent-shift-vscode-home-'));
const fakeBin = resolve(fakeHome, 'bin');
await import('node:fs/promises').then(({ mkdir }) => mkdir(fakeBin));
const fakeClaude = resolve(fakeBin, 'claude');
writeFileSync(fakeClaude, '#!/bin/sh\nprintf \'%s\' \'{"loggedIn":false,"authMethod":"none"}\'\n');
chmodSync(fakeClaude, 0o755);
await build({
  entryPoints: [resolve(root, 'test/integration/suite/index.ts')],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: resolve(root, 'dist/integration/index.js'),
});

await runTests({
  extensionDevelopmentPath: root,
  extensionTestsPath: resolve(root, 'dist/integration/index.js'),
  launchArgs: ['--disable-extensions', `--user-data-dir=${resolve(fakeHome, 'user-data')}`],
  extensionTestsEnv: {
    HOME: fakeHome,
    PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
  },
});
