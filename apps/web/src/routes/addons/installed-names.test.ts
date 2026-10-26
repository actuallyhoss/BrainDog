/**
 * AN INSTALLED ADD-ON IS NAMED AND DESCRIBED AS ITS CATALOGUE DOES, with or without the Kennel (the audit of 25 October,
 * Z11).
 *
 * WHAT WAS WRONG. On his record the Installed list read "Bank hsbc eg" for the pack titled "HSBC Egypt alerts", and
 * described Holdings as "Holdings" (`packs-390-light.png`). Neither is one of this build's modules, so the page named it
 * from the Kennel's catalogue, and drew its id when the Kennel did not answer; the line under it was its lists' names.
 *
 * THE READS ARE TRIED AS FUNCTIONS over the catalogue this build ships, and the page's use of them read from its markup,
 * as `segmented.test.ts` reads markup: there is no component test in this tree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogueLines, catalogueTitles, readShippedCatalogue, SHIPPED_INDEX_AT } from './catalogue.ts';

const shipped = readFileSync(new URL('../../../static/catalogue/index.json', import.meta.url), 'utf8');

/** A host that serves this build's catalogue and nothing else, as the look's live source does with the Kennel refused. */
const host = (url: string): Promise<Response> =>
  Promise.resolve(url === SHIPPED_INDEX_AT ? new Response(shipped, { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 403 }));

test('with no Kennel, the shipped catalogue names HSBC Egypt alerts and says what Holdings is for', async () => {
  const index = await readShippedCatalogue(host);
  assert.ok(index, 'the shipped catalogue did not read');
  assert.equal((await catalogueTitles(index)).get('bank-hsbc-eg'), 'HSBC Egypt alerts');
  const line = (await catalogueLines(index)).get('holdings') ?? '';
  assert.match(line, /^What you hold rather than spend/u);
  assert.notEqual(line, 'Holdings');
});

test('a catalogue that cannot be read names nothing, and the page falls back as before', async () => {
  assert.equal(await readShippedCatalogue(() => Promise.resolve(new Response('nope', { status: 404 }))), null);
  assert.equal(await readShippedCatalogue(() => Promise.reject(new Error('offline'))), null);
  assert.equal((await catalogueLines(null)).size, 0);
});

test('the Installed list describes an add-on by its catalogue line, and says it is drawn once the names have landed', () => {
  const page = readFileSync(new URL('./Installed.svelte', import.meta.url), 'utf8');
  assert.match(page, /catalogueSays\.get\(state\.id\)/u, 'the line under a name does not read the catalogue');
  assert.match(page, /readShippedCatalogue\(fetch\)/u, 'no Kennel still names by id');
  assert.match(page, /await named;\s*return true;/u, 'the screen says it is drawn before the names land');
});
