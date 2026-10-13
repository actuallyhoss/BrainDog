/**
 * The site's glyphs, held to the app's.
 *
 *   node --test apps/site/src/lib/icons.test.ts
 *
 * WHY THIS TEST. `icons.ts` says a glyph here is the glyph a visitor meets again inside the product. That was a hand
 * copy with nothing behind it, and it had already come apart once: the app redrew `copy` and the site kept the old
 * drawing. `scripts/icons.mjs` writes the app's shapes into `SET` now, and the first check here is that script's
 * `--check` against the two files as they stand, so a glyph renamed or redrawn in the app turns this red.
 *
 * EVERY OTHER CHECK IS A PLANTED FAULT. A check that has never failed may be measuring nothing, so each thing the
 * script says it catches is handed the input that should trip it: a renamed glyph, a redrawn one, a hand shape the
 * app has come to draw, a dot that lost its heavier stroke. The app's file is passed in as text, so nothing on disk
 * is touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { DOTTED, GLYPHS } from './icons.ts';

const { FROM, differing, plan, run } = (await import(new URL('../../scripts/icons.mjs', import.meta.url).href)) as {
  FROM: Readonly<Record<string, string>>;
  differing: (before: string, after: string) => string[];
  plan: (app: string, site: string) => { text: string; findings: string[] };
  run: (options: { check: boolean; app?: string }) => { code: number; lines: string[] };
};

const APP = readFileSync(new URL('../../../web/src/lib/ui/icons.ts', import.meta.url), 'utf8');
const SITE = readFileSync(new URL('icons.ts', import.meta.url), 'utf8');

/** The app's line for one of its glyphs, so a fault can be planted on exactly that line. */
const lineOf = (name: string): string => {
  const line = APP.split('\n').find((l) => l.startsWith(`  ${name}: '<`));
  assert.ok(line, `the app has no line for ${name}`);
  return line;
};

test('the site draws its glyphs as the app draws them', () => {
  const { code, lines } = run({ check: true });
  assert.equal(code, 0, lines.join('\n'));
});

test('a glyph renamed in the app fails the check, and says which', () => {
  const renamed = APP.replace(lineOf('vault'), lineOf('vault').replace('  vault:', '  safe:'));
  const { code, lines } = run({ check: true, app: renamed });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /no longer draws `vault`, which the site draws as `shield`/);
});

test('a glyph redrawn in the app fails the check, and writing it takes the new drawing', () => {
  const redrawn = APP.replace(lineOf('plus'), `  plus: '<path d="M12 4v16M4 12h16"/>',`);
  const { code, lines } = run({ check: true, app: redrawn });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /draws plus differently from the app/);

  const { text, findings } = plan(redrawn, SITE);
  assert.deepEqual(findings, []);
  assert.deepEqual(differing(SITE, text), ['plus']);
  assert.ok(text.includes(`  plus: '<path d="M12 4v16M4 12h16"/>',`));
});

test('a hand shape the app comes to draw is asked to move into the table', () => {
  const grown = APP.replace(lineOf('plus'), `${lineOf('plus')}\n  minus: '<path d="M5.25 12h13.5"/>',`);
  assert.match(plan(grown, SITE).findings.join('\n'), /the app draws `minus` now/);

  const shaped = APP.replace(lineOf('plus'), `${lineOf('plus')}\n  less: '<path d="M5.25 12h13.5"/>',`);
  assert.match(plan(shaped, SITE).findings.join('\n'), /the app draws `minus` now, as `less`/);
});

test('the dots the app strokes heavier are the dots the site strokes heavier', () => {
  /* The app writes the stroke into the markup and the site reads `DOTTED`, so the attribute never reaches the page. */
  for (const name of DOTTED) assert.ok(!GLYPHS[name].includes('stroke-width'), name);
  const light = APP.replace(lineOf('drag'), lineOf('drag').replace(' stroke-width="2.75"', ''));
  assert.match(plan(light, SITE).findings.join('\n'), /DOTTED says grip, more and the app strokes more heavier/);
});

test('a file the script cannot read is a finding, never an empty set written out', () => {
  assert.equal(plan('export const PATHS = {} as const;', SITE).findings.length, 1);
  assert.match(plan(APP, SITE.replace('/* icons:end */', '')).findings.join('\n'), /two marks are gone/);
});

test('every name the table takes is drawn, and the scene that draws its glyphs inline draws the set\'s', () => {
  for (const name of Object.keys(FROM)) assert.ok(Object.hasOwn(GLYPHS, name), name);

  /* `Decide.svelte` writes its glyphs into its own markup (its server-render test compiles that file alone), so they
     are a second place a drawing could go stale. Each one on the 24 grid is a shape of the set. */
  const scene = readFileSync(new URL('Decide.svelte', import.meta.url), 'utf8');
  const drawn = new Set<string>(Object.values(GLYPHS));
  const inline = [...scene.matchAll(/<svg(?: class="[a-z]+")? viewBox="0 0 24 24"[^>]*>(.*?)<\/svg>/g)].map((m) => m[1]!.replaceAll(' />', '/>'));
  assert.ok(inline.length >= 5, `read only ${inline.length} glyphs from the scene`);
  for (const markup of inline) assert.ok(drawn.has(markup), `the scene draws a shape the set does not: ${markup}`);
});
