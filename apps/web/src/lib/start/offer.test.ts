/**
 * What the first run offers (`offer.ts`): the compiled lists, and beside them each use case the host's catalogue serves
 * with its words. A word on an entry is heard, the same entry with the word taken off is not, and a catalogue that does
 * not read leaves the compiled lists exactly as they were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUNDLED, shape } from '../shape.ts';
import { setupOffer } from './propose.ts';
import { catalogueOfferOf, heardOf, offerOf, readCatalogueOffer, type CatalogueOffer } from './offer.ts';

const SAID = 'I rent out six flats and need to keep track of rent and repairs';
const LETTING = { kind: 'usecase', id: 'letting-desk', title: 'Letting desk', summary: 'Flats, tenancies and repairs.', signals: ['flats', 'tenancy'], modules: ['money', 'letting-desk-lists'] };

const INDEX = {
  format: 1,
  name: 'A test catalogue',
  entries: [{ kind: 'pack', id: 'pinboard', title: 'Pinboard', summary: 'Pins.' }, LETTING],
};

const serving = (status: number, body: unknown) => {
  const sent: { url: string; init: RequestInit }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { sent, send };
};

const ids = (o: ReturnType<typeof offerOf>): string[] => o.usecases.map((u) => u.id);
const heardIn = (catalogue: CatalogueOffer | null): string[] => shape(SAID, '2026-10-14', [...BUNDLED, ...heardOf(catalogue)]).packs.map((p) => p.id);

test('WITH NO CATALOGUE THE OFFER IS THE COMPILED LISTS, the very ones the first run hands the model today', () => {
  assert.deepEqual(offerOf(), setupOffer());
  assert.deepEqual(offerOf(null), setupOffer());
  assert.deepEqual(heardOf(null), []);
});

test('A CATALOGUE USE CASE HEARD AS "FLATS" IS OFFERED, and with that word taken off it is not', async () => {
  const { sent, send } = serving(200, INDEX);
  const catalogue = await readCatalogueOffer(send);
  assert.equal(sent[0]?.url, '/app/catalogue/index.json');
  assert.equal(sent[0]?.init.credentials, 'omit', 'read with no session');
  assert.deepEqual(catalogue?.usecases.map((u) => u.id), ['letting-desk'], 'an add-on is not a use case');

  assert.ok(ids(offerOf(catalogue)).includes('letting-desk'));
  assert.deepEqual(heardOf(catalogue), [{ id: 'letting-desk', signals: ['flats', 'tenancy'], modules: ['money', 'letting-desk-lists'] }]);
  assert.ok(heardIn(catalogue).includes('letting-desk'), 'the rules hear "flats" in the sentence');

  const quiet = catalogueOfferOf({ ...INDEX, entries: [{ ...LETTING, signals: ['tenancy'] }] });
  assert.ok(!heardIn(quiet).includes('letting-desk'), 'with "flats" taken off the sentence points at nothing of it');

  const wordless = catalogueOfferOf({ ...INDEX, entries: [{ ...LETTING, signals: [] }] });
  assert.deepEqual(wordless?.usecases, [], 'an entry with no words is passed over');
  assert.deepEqual(offerOf(wordless), setupOffer());
});

test('A USE CASE THIS BUILD SHIPS IS NOT OFFERED TWICE, since the compiled words already listen for it', () => {
  const shipped = setupOffer().usecases[0]!;
  const twice = catalogueOfferOf({ format: 1, entries: [{ ...LETTING, id: shipped.id, title: 'Again' }, LETTING, LETTING] });
  assert.equal(ids(offerOf(twice)).filter((id) => id === shipped.id).length, 1);
  assert.equal(ids(offerOf(twice)).filter((id) => id === 'letting-desk').length, 1);
});

test('A BROKEN INDEX, A FAILED FETCH AND A MISSING ONE EACH LEAVE THE COMPILED LISTS', async () => {
  for (const send of [
    serving(200, '{ not json').send,
    serving(200, { format: 1, entries: 'none' }).send,
    serving(404, 'Not found').send,
    (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch,
  ]) {
    const catalogue = await readCatalogueOffer(send);
    assert.equal(catalogue, null);
    assert.deepEqual(offerOf(catalogue), setupOffer());
    assert.deepEqual(heardOf(catalogue), []);
  }
});
