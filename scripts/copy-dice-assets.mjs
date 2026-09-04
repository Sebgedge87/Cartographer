/**
 * Copy the dice-box runtime assets (its ammo.js physics wasm and the dice theme's
 * models and textures) into public/, where the app serves them from.
 *
 * They live in node_modules rather than in the repo, so this runs from postinstall
 * and again before dev and build — `npm install && npm run dev` on a fresh clone has
 * to be all it takes, and that holds whether or not install scripts were allowed.
 *
 * Pass --soft to warn and carry on when the package is missing. postinstall does,
 * because failing there would fail the whole install; dev and build do not, because
 * a missing roller is about to stop them anyway with a far less helpful message.
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const soft = process.argv.includes('--soft');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@3d-dice', 'dice-box', 'dist', 'assets');
const to = join(root, 'public', 'assets', 'dice-box');

try {
  await stat(from);
} catch {
  const lines = [
    '[dice-box] @3d-dice/dice-box is not installed, so the 3D dice roller has no assets.',
    '[dice-box] Run: npm install',
  ];
  if (soft) {
    console.warn(lines[0]);
    process.exit(0);
  }
  console.error(`\n${lines.join('\n')}\n`);
  process.exit(1);
}

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
// relative(), not a string replace: the separator is a backslash on Windows.
console.log(`[dice-box] assets copied to ${relative(root, to)}`);
