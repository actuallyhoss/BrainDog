/**
 * Build the house theme, and one stylesheet per environment, into the skin.
 *
 * ONE output per deployment, two consumers. This writes `packages/skin/house.css` at build time so
 * first paint is themed with no server to render a head, and an installed theme arrives later with
 * `boot()` and is applied by one `replaceSync` (28 section 5 mechanism 3, 50 section 13 D18). The
 * marketing site imports the house file - it is the same product, and a landing page whose red is a
 * shade off the app's is a landing page that makes the app look like a different company's.
 *
 * AND ONE PER ENVIRONMENT, WHICH IS THE SAME ARTEFACT AND NOT A SPECIAL CASE. A alpha deployment
 * gets `alpha.css`, generated from the same generator, validated by the same sixteen checks and
 * committed and byte-compared the same way. The reason it is a second FILE rather than a second
 * selector inside the first is that the wrong palette must not be in the bundle at all: a rule
 * behind `html[data-env]` is a rule anybody can turn on in devtools, and `apps/web/vite.config.ts`
 * already refuses that shape of door in as many words - "a `window.__seed` hook would be a dev door
 * shipping to production".
 *
 * The files are COMMITTED and gated for exactness, like `allow.json`: a palette that drifts from its
 * own generator is a palette nobody validated.
 *
 *   node scripts/theme.mjs           write them
 *   node scripts/theme.mjs --check   fail if a committed file is not what the generator emits
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  HOUSE,
  HIGH_CONTRAST,
  ALPHA,
  ALPHA_HIGH_CONTRAST,
  brand,
  toCSS,
  validate,
  refusals,
} from '@braindog/theme';

import { MARK } from '../mark.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const skin = join(import.meta.dirname, '..');

/**
 * The favicon, generated from the same two sources as everything else: `MARK` for the artwork and
 * the deployment's own accent for the colour.
 *
 * It has to be a literal hex and a real file. A favicon is fetched as its OWN document, outside any
 * page, so it can reach no custom property and no theme - and that is exactly why it kept drifting:
 * it was the one copy of the mark that no token change touched. Generating it means it cannot.
 *
 * AND IT IS THE ONE PLACE AN ENVIRONMENT IS SEEN WITH THE PRODUCT NOT IN FRONT OF YOU. A tab strip
 * with nine tabs shows about a dozen characters of title and the whole icon, so the icon is where a
 * alpha window is picked out of a row of production ones. The title carries the word, for the
 * reader who cannot use the colour; the icon carries the colour, for everybody else. Neither is
 * sufficient and both are cheap.
 *
 * The glyph on transparency, at its own ratio, and no tile. A rounded red square with the dog
 * reversed out is an APP ICON, and a browser tab is not a home screen: the tile competes with the
 * favicons beside it, its corner radius fights whatever radius the browser applies, and in dark
 * chrome a red square is the loudest thing in the tab strip.
 */
const favicon = (hex) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK.viewBox}" role="img" aria-label="BrainDog">\n` +
  `  <title>BrainDog</title>\n` +
  `  <g fill="${hex}">\n` +
  MARK.paths.map((d) => `    <path d="${d}" />\n`).join('') +
  `  </g>\n</svg>\n`;

/**
 * The BIMI logo: the mark on a plain square, in SVG Tiny Portable/Secure, which a mailbox shows beside a mail from
 * brain.dog once the domain publishes a BIMI record pointing at it.
 *
 * THE SAME GLYPH AND THE SAME RED AS THE FAVICON, on the lightest surface rather than on red, because the mark is the
 * red dog on a light ground and a reversed-out tile is an app icon (see `favicon` above). Tiny PS takes no role, no
 * aria-label, no width and no height, so the root carries only what the profile names. The mailbox crops the square to
 * a circle, so the glyph is 64% of the side and centred, which keeps every point of it inside the circle with room.
 */
const bimi = (hex, ground) => {
  const side = 1000;
  const [, , w, h] = MARK.viewBox.split(' ').map(Number);
  const scale = (side * 0.64) / w;
  const x = ((side - w * scale) / 2).toFixed(2);
  const y = ((side - h * scale) / 2).toFixed(2);
  return (
    `<svg version="1.2" baseProfile="tiny-ps" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}">\n` +
    `  <title>BrainDog</title>\n` +
    `  <rect width="${side}" height="${side}" fill="${ground}"/>\n` +
    `  <g transform="translate(${x} ${y}) scale(${scale.toFixed(5)})" fill="${hex}">\n` +
    MARK.paths.map((d) => `    <path d="${d}"/>\n`).join('') +
    `  </g>\n</svg>\n`
  );
};

/**
 * The house colours a mail is painted in, as a module the Worker imports (`apps/worker/src/mail.ts`).
 *
 * A MAIL IS READ IN A CLIENT THAT REACHES NO CUSTOM PROPERTY, like the favicon, so its colours have to be literal, and
 * they are written here so a token change reaches the mail on the same rebuild it reaches the app. Only the roles a
 * letter uses, in both schemes: the light one inline, the dark one in the letter's own media query.
 */
const MAIL_ROLES = ['sunk', 'bg', 's1', 's3', 'ink', 'ink2', 'dim', 'line', 'accent'];
const mailPalette = (theme) => {
  const pick = (scheme) => Object.fromEntries(MAIL_ROLES.map((role) => [role, theme.schemes[scheme][role]]));
  return (
    '/* GENERATED by packages/theme. Do not edit - edit the seed and rebuild. */\n' +
    '/** The house colours a mail is painted in, light inline and dark in its media query. Written by `packages/skin/scripts/theme.mjs`. */\n' +
    `export const MAIL_PALETTE = ${JSON.stringify({ light: pick('light'), dark: pick('dark') }, null, 2)} as const;\n`
  );
};

/**
 * Every file this script owns, by what it is generated from.
 *
 * A LIST RATHER THAN FIVE PAIRS OF CALLS, because `--check` and the write path have to walk exactly
 * the same set. They did not before: `--check` verified two favicons and one stylesheet by three
 * separate blocks of code, and a fourth artefact would have been written by one and checked by
 * neither.
 *
 * `--brand` IS EMITTED HERE AND NO LONGER LIVES IN `tokens.css`. It is the one colour that belongs
 * to the product rather than to a meaning, and it was a hand-written literal in the shared token
 * layer - which meant a alpha build painted its logo in the production red, on the single most
 * looked-at element in the app. It is still a separate token from `--accent`, and for the reason
 * `tokens.css` gave: the logo must not change colour when somebody installs a record theme. That
 * property is preserved by WHERE it is emitted rather than by what it is called - `toCSS` does not
 * write it, so `recordTheme`'s adopted block cannot carry it, and only this script can.
 */
const ARTEFACTS = [
  { path: join(skin, 'house.css'), text: toCSS(HOUSE, HIGH_CONTRAST) + brand(HOUSE.schemes.light.accent) },
  {
    path: join(skin, 'alpha.css'),
    text: toCSS(ALPHA, ALPHA_HIGH_CONTRAST) + brand(ALPHA.schemes.light.accent),
  },
  { path: join(root, 'apps/web/static/mark.svg'), text: favicon(HOUSE.schemes.light.accent) },
  { path: join(root, 'apps/site/static/mark.svg'), text: favicon(HOUSE.schemes.light.accent) },
  { path: join(root, 'apps/web/static/mark-alpha.svg'), text: favicon(ALPHA.schemes.light.accent) },
  { path: join(root, 'apps/site/static/bimi/braindog.svg'), text: bimi(HOUSE.schemes.light.accent, HOUSE.schemes.light.bg) },
  { path: join(root, 'apps/worker/src/mail-palette.ts'), text: mailPalette(HOUSE) },
];

/* A theme is never written without being validated first - the generator drives most of the sixteen
   checks, so what is left here is the handful it cannot drive. */
/* AGAINST THE DOCUMENT AS THE APP LOADS IT, not against the theme block alone. Check L asks whether
   the stylesheet has a forced-colors block, and the block lives in `a11y.css` - a layer no theme can
   reach and which is already in the page. Validating the theme on its own would refuse every build
   for the absence of a rule it is not allowed to write; validating with no `css` at all, which is
   what this used to do, skipped the check entirely. */
/* AND ITS ABSENCE IS A FINDING RATHER THAN A SKIP, which is the opposite of the answer
   `tools/gates/bundle.mjs` gives to the same question, and right for the opposite reason.
   `a11y.css` is committed source in this package, beside `base.css` and `tokens.css`. No command
   produces it, so a skip could not print the sentence a skip is for: there is nothing to tell a
   person to run. And the two paths below both do real damage without it. `--check` would compare
   against a house theme validated with check L unasked, which is the exact silence the paragraph
   above says this arrangement exists to end; the write path would put four unvalidated palettes on
   disk and report a success. Exiting non-zero here is the same colour `run.mjs` already gave the
   uncaught ENOENT, with one sentence naming the file instead of ten frames of `node:fs`.

   AND ONLY ENOENT IS TURNED INTO THAT SENTENCE. A file that is there and will not open is a
   different fact, and dressing it up as a missing file sends a person to look for one that
   exists. */
const a11y = await readFile(join(skin, 'a11y.css'), 'utf8').catch((err) => {
  if (err?.code !== 'ENOENT') throw err;
  return null;
});
if (a11y === null) {
  console.error('  packages/skin/a11y.css is not there, and check L reads the forced-colors block out of it.');
  console.error('  No theme is validated or written without it. Restore the file.');
  process.exit(1);
}

const houseDoc = toCSS(HOUSE, HIGH_CONTRAST) + a11y;
const alphaDoc = toCSS(ALPHA, ALPHA_HIGH_CONTRAST) + a11y;

/* EVERY PALETTE THAT SHIPS, NOT ONLY THE HOUSE ONE. An environment palette is a real palette a real
   person reads all day; validating the house theme and shipping a second unvalidated one would be
   the exact defect 28 section 4.5 refuses - "an auto-corrected theme is not portable" - one step
   further along, where nothing was even asked. */
const bad = [
  ...refusals(validate(HOUSE, houseDoc)),
  ...refusals(validate(HIGH_CONTRAST, houseDoc)),
  ...refusals(validate(ALPHA, alphaDoc)),
  ...refusals(validate(ALPHA_HIGH_CONTRAST, alphaDoc)),
];
if (bad.length > 0) {
  for (const f of bad) console.error(`  REFUSED ${f.check}  ${f.fix}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  let wrong = 0;
  for (const { path, text } of ARTEFACTS) {
    const on_disk = await readFile(path, 'utf8').catch(() => '');
    if (on_disk !== text) {
      console.error(`  ${path.slice(root.length + 1).replace(/\\/g, '/')} is not what the generator emits. Run: pnpm theme`);
      wrong += 1;
    }
  }
  if (wrong > 0) process.exit(1);
  console.log(`  ${ARTEFACTS.length} generated files match their generator.`);
} else {
  for (const { path, text } of ARTEFACTS) await writeFile(path, text, 'utf8');
  const bytes = ARTEFACTS.reduce((n, a) => n + a.text.length, 0);
  console.log(`  wrote ${ARTEFACTS.length} files - ${(bytes / 1024).toFixed(1)} KB, 0 refusals`);
}
