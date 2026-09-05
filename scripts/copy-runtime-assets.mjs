/**
 * Copy the runtime assets the app serves rather than bundles into public/:
 *
 *   - dice-box's ammo.js physics wasm, and its dice models and textures
 *   - the Hunspell English dictionary the spellchecker loads on first use
 *
 * Both live in node_modules rather than in the repo, so this runs from postinstall
 * and again before dev and build — `npm install && npm run dev` on a fresh clone has
 * to be all it takes, and that holds whether or not install scripts were allowed.
 *
 * Pass --soft to warn and carry on when a package is missing. postinstall does,
 * because failing there would fail the whole install; dev and build do not, because
 * a missing roller or dictionary is about to stop them anyway with a far less
 * helpful message.
 */
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const soft = process.argv.includes('--soft');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mod = (...parts) => join(root, 'node_modules', ...parts);
const pub = (...parts) => join(root, 'public', ...parts);

/**
 * `from` is copied to `to`; a file keeps its own name, a directory its contents.
 * `tag` is what the log lines are prefixed with, so a failure names the package.
 */
const ASSETS = [
  {
    tag: 'dice-box',
    package: '@3d-dice/dice-box',
    from: mod('@3d-dice', 'dice-box', 'dist', 'assets'),
    to: pub('assets', 'dice-box'),
    why: 'the 3D dice roller has no assets',
  },
  {
    tag: 'dictionary',
    package: 'dictionary-en',
    from: mod('dictionary-en', 'index.aff'),
    to: pub('dict', 'index.aff'),
    why: 'the spellchecker has no dictionary',
  },
  {
    tag: 'dictionary',
    package: 'dictionary-en',
    from: mod('dictionary-en', 'index.dic'),
    to: pub('dict', 'index.dic'),
    why: 'the spellchecker has no dictionary',
  },
];

for (const asset of ASSETS) {
  try {
    await stat(asset.from);
  } catch {
    const lines = [
      `[${asset.tag}] ${asset.package} is not installed, so ${asset.why}.`,
      `[${asset.tag}] Run: npm install`,
    ];
    if (soft) {
      console.warn(lines[0]);
      continue;
    }
    console.error(`\n${lines.join('\n')}\n`);
    process.exit(1);
  }

  await mkdir(dirname(asset.to), { recursive: true });
  await cp(asset.from, asset.to, { recursive: true });
  // relative(), not a string replace: the separator is a backslash on Windows.
  console.log(`[${asset.tag}] copied to ${relative(root, asset.to)}`);
}
