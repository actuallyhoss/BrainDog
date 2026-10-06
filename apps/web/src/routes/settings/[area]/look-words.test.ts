/**
 * What Settings says about where a choice lands, read from the areas themselves: the look is each record's, a muted rule
 * leaves Today's feed, a list's singular is asked for without "a" or "an", and the settings ground keeps Safari off glass.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const area = (name: string): string => readFileSync(new URL(`./areas/${name}.svelte`, import.meta.url), 'utf8');
/* THE AREA'S OWN WORDS, without the comments over them, which quote the old ones on purpose. */
const wordsOf = (src: string): string => src.slice(src.indexOf('const words = {'), src.indexOf('} as const;')).replace(/\/\*[\s\S]*?\*\//gu, '');

test('Appearance says the look is kept per record, and where it waits when the record has not heard of it', () => {
  const src = area('Appearance');
  const words = src.slice(src.indexOf('const words = {'), src.indexOf('};', src.indexOf('const words = {')));
  assert.doesNotMatch(words, /every device you sign in on/u, 'the hint still promises one look across every record');
  assert.match(words, /Yours in \$\{record\}, on every device you open it on\./u);
  assert.match(words, /hintPending:/u);
  /* THE SHELL'S SLUG IS HANDED OVER, so Settings opened first names the same person and record the layout does. */
  assert.match(src, /follow\(untrack\(\(\) => \(\{ me: props\.shell\.me, record: \{ slug: props\.shell\.index\.slug \} \}\)\)\)/u);
  assert.match(src, /pref\.whereKept\(\)/u);
});

test("Notifications names Today's feed, by the record's own words, and no digest", () => {
  const src = area('Notifications');
  assert.doesNotMatch(wordsOf(src), /digest/u, 'a muted rule is still said to leave a digest that carries no rule notices');
  assert.match(src, /words\.tellersWhy\(said\('since_away'\), said\('home'\)\)/u);
});

test('Words asks for a singular without "a" or "an", titles the lists in the voice, and names the limits a currency strands', () => {
  const src = area('Words');
  const words = wordsOf(src);
  assert.doesNotMatch(words, /One is an? /u, '"One is a update" can be drawn again');
  assert.doesNotMatch(words, /'Your lists'/u);
  assert.match(src, /<Section title=\{said\('lists'\)\}/u);
  /* THE PICK WAITS ON WHAT IT WOULD STRAND, and only then is it sent. */
  assert.match(src, /strandedBy\(packs, code, next\)/u);
  assert.match(src, /onchange=\{\(e\) => pickCurrency\(e\.currentTarget\.value\)\}/u);
  for (const s of [...words.matchAll(/`([^`]*)`|'([^']*)'/gu)].map((m) => m[1] ?? m[2] ?? '')) assert.doesNotMatch(s, /—/u, `an em dash in "${s}"`);
});

test("the settings ground takes Safari's own glass off the segmented track, in a block of its own", () => {
  const css = readFileSync(new URL('./settings.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  const block = /@supports \(-webkit-backdrop-filter: none\)\s*\{\s*\.settings-place \.segmented[^{]*\{\s*-webkit-backdrop-filter: none;/u;
  assert.match(css, block, 'Safari keeps the toolbar glass on a settings track');
});
