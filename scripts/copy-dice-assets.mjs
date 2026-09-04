/**
 * Copy the dice-box runtime assets (its ammo.js physics wasm and the dice theme's
 * models and textures) into public/, where the app serves them from.
 *
 * They live in node_modules rather than in the repo, so this runs from postinstall
 * and again before dev and build — `npm install && npm run dev` on a fresh clone has
 * to be all it takes, and that holds whether or not install scripts were allowed.
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', '@3d-dice', 'dice-box', 'dist', 'assets');
const to = join(root, 'public', 'assets', 'dice-box');

try {
  await stat(from);
} catch {
  // Not installed yet, or installed without optional deps. The dice tray detects the
  // missing assets and falls back to reporting the roll, so this is not fatal.
  console.warn('[dice-box] assets not found in node_modules; skipping copy');
  process.exit(0);
}

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`[dice-box] assets copied to ${to.replace(root + '/', '')}`);
