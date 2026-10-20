/**
 * What Settings says about where a choice lands, read from the areas themselves: the look is each record's, a muted rule
 * leaves Today's feed, a list's singular is asked for without "a" or "an", and the settings ground draws no glass.
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

test("Notifications says a muted rule's notices leave Today's feed and its urgent ones still show", () => {
  const words = wordsOf(area('Notifications'));
  const why = /tellersWhy: \(feed: string, home: string\) => `([^`]*)`/u.exec(words)?.[1];
  assert.ok(why, 'the line under the switches is where it was');
  const said = why.replace('${feed}', 'Since you were away').replace('${home}', 'Today');
  assert.equal(said, 'Turn one off and its notices leave “Since you were away” on Today, for you alone. Its urgent ones still show there.');
  assert.doesNotMatch(said, /—|reaches you/u, 'urgent notices are said to still show, where they show');
});

test('Words asks for a singular without "a" or "an", titles the lists in the voice, and names the limits a currency strands', () => {
  const src = area('Words');
  const words = wordsOf(src);
  assert.doesNotMatch(words, /One is an? /u, '"One is a update" can be drawn again');
  assert.doesNotMatch(words, /'Your lists'/u);
  assert.match(src, /<Tile icon="rows" title=\{said\('lists'\)\}/u);
  /* THE PICK WAITS ON WHAT IT WOULD STRAND, and only then is it sent. */
  assert.match(src, /strandedBy\(packs, code, next\)/u);
  assert.match(src, /onchange=\{\(e\) => pickCurrency\(e\.currentTarget\.value\)\}/u);
  for (const s of [...words.matchAll(/`([^`]*)`|'([^']*)'/gu)].map((m) => m[1] ?? m[2] ?? '')) assert.doesNotMatch(s, /—/u, `an em dash in "${s}"`);
});

test('the settings ground draws no glass at all: no backdrop filter, prefixed or not (UI pass 20 Oct, no glass anywhere)', () => {
  const css = readFileSync(new URL('./settings.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(css, /backdrop-filter/u, 'a settings rule still draws glass');
});
