/**
 * Build the house theme into the shell.
 *
 * The same generator serves both sinks: this writes `src/theme/house.css` at build time so first
 * paint is themed with no server to render a head, and an installed theme arrives later with
 * `boot()` and is applied by one `replaceSync` (28 §5 mechanism 3, 50 §13 D18).
 *
 * The file is COMMITTED and gated for exactness, like `allow.json`: a palette that drifts from its
 * own generator is a palette nobody validated.
 *
 *   node scripts/theme.mjs           write it
 *   node scripts/theme.mjs --check   fail if the committed file is not what the generator emits
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { HOUSE, HIGH_CONTRAST, toCSS, validate, refusals } from '@braindog/theme';

const OUT = join(import.meta.dirname, '..', 'src', 'theme', 'house.css');
const css = toCSS(HOUSE, HIGH_CONTRAST);

/* A theme is never written without being validated first — the generator drives most of the sixteen
   checks, so what is left here is the handful it cannot drive. */
const bad = [...refusals(validate(HOUSE)), ...refusals(validate(HIGH_CONTRAST))];
if (bad.length > 0) {
  for (const f of bad) console.error(`  REFUSED ${f.check}  ${f.fix}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const on_disk = await readFile(OUT, 'utf8').catch(() => '');
  if (on_disk !== css) {
    console.error('  src/theme/house.css is not what the generator emits. Run: node scripts/theme.mjs');
    process.exit(1);
  }
  console.log('  house.css matches its generator.');
} else {
  await mkdir(join(import.meta.dirname, '..', 'src', 'theme'), { recursive: true });
  await writeFile(OUT, css, 'utf8');
  console.log(`  wrote src/theme/house.css — ${(css.length / 1024).toFixed(1)} KB, 0 refusals`);
}
