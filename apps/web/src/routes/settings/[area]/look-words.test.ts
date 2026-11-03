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
  /* SAID AT THE CARD HEAD'S END SINCE 3 NOV (settings lane), in the record whose settings these are. */
  assert.match(words, /hint: 'On all your devices'/u);
  assert.match(words, /hintPending:/u);
  /* THE SHELL'S SLUG IS HANDED OVER, so Settings opened first names the same person and record the layout does. */
  assert.match(src, /follow\(untrack\(\(\) => \(\{ me: props\.shell\.me, record: \{ slug: props\.shell\.index\.slug \} \}\)\)\)/u);
  assert.match(src, /pref\.whereKept\(\)/u);
});

test('NOTIFICATIONS SENDS THE RULES THAT TELL YOU TO AUTOMATIONS, says no digest, and reads no rule to settle', () => {
  const src = area('Notifications');
  assert.doesNotMatch(wordsOf(src), /digest/u, 'a muted rule is still said to leave a digest that carries no rule notices');
  assert.match(src, /<Button weight="quiet" href="\/automations">\{words\.openRules\}<\/Button>/u);
  assert.doesNotMatch(src, /openAutomations|\.automation\(/u, 'the area reads every rule again before it settles');
});

test('Words asks for a singular without "a" or "an", titles the lists "Your lists", and names the limits a currency strands', () => {
  const src = area('Words');
  const words = wordsOf(src);
  assert.doesNotMatch(words, /One is an? /u, '"One is a update" can be drawn again');
  /* "YOUR LISTS" ON THE PAGE WHERE LISTS ARE NAMED (SPEC agents F4), in every one of its three forms; the voice's
     "Your things" is the rail's word, and said here it titled a tile of list names with something else. */
  assert.match(words, /lists: 'Your lists'/u);
  assert.equal(src.match(/<Tile icon="rows" title=\{words\.lists\}/gu)?.length, 3);
  assert.doesNotMatch(src, /title=\{said\('lists'\)\}/u);
  /* THE PICK WAITS ON WHAT IT WOULD STRAND, and only then is it sent. */
  assert.match(src, /strandedBy\(packs, code, next\)/u);
  assert.match(src, /onchange=\{\(e\) => pickCurrency\(e\.currentTarget\.value\)\}/u);
  for (const s of [...words.matchAll(/`([^`]*)`|'([^']*)'/gu)].map((m) => m[1] ?? m[2] ?? '')) assert.doesNotMatch(s, /—/u, `an em dash in "${s}"`);
});

test('the settings ground draws no glass at all: no backdrop filter, prefixed or not (UI pass 20 Oct, no glass anywhere)', () => {
  const css = readFileSync(new URL('./settings.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(css, /backdrop-filter/u, 'a settings rule still draws glass');
});
