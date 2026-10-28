/**
 * An entry's own document, drawn on its own screen: the resolver over what the record read for it prints the
 * stage and the count where the screen printed holes, through the same renderer the screen draws with.
 *
 * WHAT WAS MEASURED BEFORE IT: the screen's resolver was `() => null`, so every `{{path}}` in a project's note was a hole,
 * `{{blockers.count}}` among them, while the same note on the project page printed the number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { UNNAMED, inline, parse, toHTML } from 'braindog-render';

import { resolverOf, shownOf } from './row-values.ts';

const NOTE = 'Stage: {{stage}}. {{blockers.count}} in the way.';
const READ = { values: { stage: 'Building', 'blockers.count': 2 } };

test('A PROJECT’S NOTE PRINTS ITS STAGE AND HOW MANY THINGS ARE IN THE WAY', () => {
  const html = toHTML(parse(NOTE), { resolve: resolverOf(READ, NOTE) });
  const text = html.replace(/<[^>]*>/gu, '');
  assert.match(text, /Stage: Building\. 2 in the way\./u, html);
  assert.doesNotMatch(html, /blockers\.count|\{\{/u, html);
  const before = toHTML(parse(NOTE), { resolve: () => null }).replace(/<[^>]*>/gu, '');
  assert.doesNotMatch(before, /Building/u, 'the stub the screen had printed holes, which this test is about');
});

test('A PATH THE RECORD READ NOTHING FOR IS THE DASH, AND ONE THAT NAMES NOTHING IS THE AUTHOR’S WORDS', () => {
  const resolve = resolverOf({ values: {}, unnamed: ['blokers.count'] }, '{{stage}} {{blokers.count}}');
  assert.equal(resolve('stage'), null);
  assert.equal(resolve('blokers.count'), UNNAMED);
  assert.equal(resolverOf(undefined)('stage'), null, 'a document the record read nothing for draws as a page draws an empty path');
});

test('A DAY FIELD IS SAID AS A DAY, AND A TYPED FORM IS HANDED THE LITERAL IT FORMATS', () => {
  const src = 'Due {{due}}. Sells at {{money:price}}, since {{date:started}}.';
  const resolve = resolverOf({ values: { due: '2025-10-09', price: { amount: 135_000, currency: 'EGP' }, started: '2026-09-01' } }, src);
  assert.equal(resolve('due'), '9 Oct 2025', 'a day of another year keeps its year');
  assert.equal(resolve('price'), '135000 EGP');
  const price = inline('{{money:price}}', { resolve });
  assert.equal(price.length, 1);
  assert.equal(price[0]!.type, 'typed', JSON.stringify(price));
  assert.match(toHTML(parse(src), { resolve }), /1,350/u);
});

test('A FIGURE OR AN AMOUNT WRITTEN BARE READS AS A PAGE WRITES IT', () => {
  const resolve = resolverOf({ values: { 'tasks.open': 1200, price: { amount: 135_000, currency: 'EGP' } } }, '{{tasks.open}} {{price}}');
  assert.equal(resolve('tasks.open'), '1,200');
  assert.match(String(resolve('price')), /1,350/u);
});

/* A VALUE SHE MAY NOT SEE PRINTS NOTHING. Before `shownOf` a held path drew its last word and a dash ("count —"), which
   said there was a value to ask for; the entry's own values still print. */
test('WHAT THE READER MAY NOT SEE PRINTS NOTHING, not its words and a dash', () => {
  const src = 'Stage: {{stage}}. {{payroll.count}} paid, {{money:payroll.total}} out. `{{kept}}` {{icon:rocket}}';
  const doc = { values: { stage: 'Building' }, held: true };
  const html = toHTML(parse(shownOf(doc, src)), { resolve: resolverOf(doc, src) });
  const text = html.replace(/<[^>]*>/gu, '');
  assert.match(text, /Stage: Building\./u, html);
  assert.doesNotMatch(text, /payroll|count|total|—/u, html);
  assert.doesNotMatch(html, /class="hole"|class="unresolved"/u, html);
  assert.match(text, /\{\{kept\}\}/u, 'a code span is the author’s text');
  assert.equal(shownOf({ values: {} }, src), src, 'a document the record did not hold is drawn as written');
  assert.equal(shownOf(undefined, src), src);
});

/* THE SCREEN ASKS FOR THE VALUES AND HANDS THEM TO THE DOCUMENT: the stub that answered nothing is gone, so a screen that
   goes back to it fails here rather than on his record. */
test('THE ENTRY SCREEN DRAWS EACH DOCUMENT WITH ITS OWN RESOLVER, and the row read asks for the values', () => {
  const screen = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(screen, /const resolve = \(\): null => null/u);
  assert.match(screen, /resolverOf\((got\.)?docs\?\.\[f\.id\]/u);
  assert.match(screen, /src=\{shownOf\(docs\?\.\[f\.id\]/u, 'a held value would print its words and a dash');
  const live = readFileSync(new URL('./row-live.ts', import.meta.url), 'utf8');
  assert.match(live, /client\.call(<unknown>)?\('get', \{ register, seq, values: true \}\)/u);
});
