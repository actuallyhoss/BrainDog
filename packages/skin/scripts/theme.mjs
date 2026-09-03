/**
 * Build the house theme into the skin.
 *
 * ONE output, two consumers. This writes `packages/skin/house.css` at build time so first paint is
 * themed with no server to render a head, and an installed theme arrives later with `boot()` and is
 * applied by one `replaceSync` (28 §5 mechanism 3, 50 §13 D18). The marketing site imports the same
 * file — it is the same product, and a landing page whose red is a shade off the app's is a landing
 * page that makes the app look like a different company's.
 *
 * The file is COMMITTED and gated for exactness, like `allow.json`: a palette that drifts from its
 * own generator is a palette nobody validated.
 *
 *   node scripts/theme.mjs           write it
 *   node scripts/theme.mjs --check   fail if the committed file is not what the generator emits
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BRAND_RED, HOUSE, HIGH_CONTRAST, toCSS, validate, refusals } from '@braindog/theme';

import { MARK } from '../mark.ts';

const OUT = join(import.meta.dirname, '..', 'house.css');
const css = toCSS(HOUSE, HIGH_CONTRAST);

/**
 * The favicon, generated from the same two sources as everything else: `MARK` for the artwork and
 * `BRAND_RED` for the colour.
 *
 * It has to be a literal hex and a real file. A favicon is fetched as its OWN document, outside any
 * page, so it can reach no custom property and no theme — and that is exactly why it kept drifting:
 * it was the one copy of the mark that no token change touched. Generating it means it cannot.
 *
 * The glyph on transparency, at its own ratio, and no tile. A rounded red square with the dog
 * reversed out is an APP ICON, and a browser tab is not a home screen: the tile competes with the
 * favicons beside it, its corner radius fights whatever radius the browser applies, and in dark
 * chrome a red square is the loudest thing in the tab strip.
 */
const FAVICONS = ['apps/web/static/mark.svg', 'apps/site/static/mark.svg'];
const favicon =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.viewBox}" role="img" aria-label="BrainDog">
` +
  `  <title>BrainDog</title>
` +
  `  <g fill="${BRAND_RED}">
` +
  MARK.paths.map((d) => `    <path d="${d}" />
`).join('') +
  `  </g>
</svg>
`;

/* A theme is never written without being validated first — the generator drives most of the sixteen
   checks, so what is left here is the handful it cannot drive. */
const bad = [...refusals(validate(HOUSE)), ...refusals(validate(HIGH_CONTRAST))];
if (bad.length > 0) {
  for (const f of bad) console.error(`  REFUSED ${f.check}  ${f.fix}`);
  process.exit(1);
}

const root = join(import.meta.dirname, '..', '..', '..');

if (process.argv.includes('--check')) {
  for (const rel of FAVICONS) {
    const on_disk = await readFile(join(root, rel), 'utf8').catch(() => '');
    if (on_disk !== favicon) {
      console.error(`  ${rel} is not what the generator emits. Run: pnpm theme`);
      process.exit(1);
    }
  }
  const on_disk = await readFile(OUT, 'utf8').catch(() => '');
  if (on_disk !== css) {
    console.error('  packages/skin/house.css is not what the generator emits. Run: pnpm theme');
    process.exit(1);
  }
  console.log('  house.css and both favicons match their generator.');
} else {
  await writeFile(OUT, css, 'utf8');
  for (const rel of FAVICONS) await writeFile(join(root, rel), favicon, 'utf8').catch(() => {});
  console.log(`  wrote packages/skin/house.css — ${(css.length / 1024).toFixed(1)} KB, 0 refusals`);
}
