import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { build, context } = createRequire(import.meta.url)('esbuild');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  sourcemap: true,
  minify: false,
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
  await mkdir('dist/hook', { recursive: true });
  await copyFile('src/claude/hook/stop-failure.js', 'dist/hook/stop-failure.js');
}
