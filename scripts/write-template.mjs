/**
 * Write templates/project.cartographer.json from the app's own template.
 *
 * One source, two destinations: the download button in the app and the file in the
 * repo. Generating the second from the first is what stops the committed example
 * quietly ageing past the importer, which is exactly what happened to the last one
 * — it predated tags and choice fields and taught neither.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { templateProject } from '../src/lib/template.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../templates/project.cartographer.json');
await writeFile(out, `${JSON.stringify(templateProject(), null, 2)}\n`);
console.log(`wrote ${out}`);
