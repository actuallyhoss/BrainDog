/**
 * Typing in a page's head narrows the page (PGS-A14): the word under `header.search.param` keeps, on every list the page
 * draws, the rows whose title or a field marked `search: true` holds it, and the head says how many it found. One letter
 * narrows nothing; a page whose head declares no search reads the same word as nothing; a field not marked is not
 * searched. Invented lists and words throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { searchClauses, searchWord } from '../src/page-search.ts';
import { fixedClock, openSqlite } from './sqlite.ts';
import { PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 12);

const CRATES: Declaration = {
  id: 'register.crates',
  kind: 'register',
  body: {
    id: 'crates',
    name: 'Crates',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text', search: true },
      { id: 'mark', type: 'text' },
    ],
  },
};

const BARRELS: Declaration = {
  id: 'register.barrels',
  kind: 'register',
  body: { id: 'barrels', name: 'Barrels', title: 'label', fields: [{ id: 'label', type: 'text', required: true }] },
};

const page = (id: string, header: unknown): Declaration => ({
  id: `page.${id}`,
  kind: 'page',
  body: {
    page: id,
    title: 'Hold',
    requires: ['register.crates', 'register.barrels'],
    ...(header === undefined ? {} : { header }),
    blocks: [
      { kind: 'table', source: 'register.crates', columns: [{ field: 'what' }] },
      { kind: 'table', source: 'register.barrels', columns: [{ field: 'label' }] },
      { kind: 'note', body: 'Below deck.' },
    ],
  } as Declaration['body'],
});

const [LANTERN, COPPER] = [PROJECTS[0], PROJECTS[1]];

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([CRATES, BARRELS, page('hold', { search: { param: 'q' } }), page('plain', { kicker: 'Below deck' })]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const add = (register: string, fields: Record<string, string>): void => assert.ok(k.create(register, fields, { actor: 'p_1' }).ok);
  add('crates', { what: `${LANTERN} lamps`, mark: 'blue' });
  add('crates', { what: 'Rope', note: `for the ${LANTERN} mast` });
  add('crates', { what: 'Tar', mark: LANTERN });
  add('crates', { what: `${COPPER} nails` });
  add('barrels', { label: `${LANTERN} oil` });
  add('barrels', { label: 'Water' });
  return k;
}

type Read = { blocks: { source?: string; matched: number; rows: { fields: Record<string, unknown> }[] }[]; head?: { search?: unknown; searched?: { word: string; found: number } }; filters?: unknown };

const read = (k: Kernel, slug: string, filter?: Record<string, string>): Read => {
  const got = k.page(slug, filter);
  assert.ok(got.ok, JSON.stringify(got));
  return got.value as unknown as Read;
};
const titles = (r: Read, source: string): string[] =>
  (r.blocks.find((b) => b.source === source)?.rows ?? []).map((row) => String(row.fields.what ?? row.fields.label)).sort();

test('THE WORD NARROWS EVERY LIST ON THE PAGE, by the title and the fields marked to be searched, and the head says how many', async () => {
  const k = await record();
  const r = read(k, 'hold', { q: ` ${LANTERN.toLowerCase()} ` });
  /* The rope is found by its note, which is marked; the tar is not, though its mark says the word, since mark is not. */
  assert.deepEqual(titles(r, 'register.crates'), [`${LANTERN} lamps`, 'Rope']);
  assert.deepEqual(titles(r, 'register.barrels'), [`${LANTERN} oil`]);
  assert.deepEqual(r.head?.searched, { word: LANTERN.toLowerCase(), found: 3 });
  assert.deepEqual(r.head?.search, { param: 'q' });
  /* THE WORD IS NEVER READ AS A FIELD: the page declares no filters, and none is answered. */
  assert.equal(r.filters, undefined);
});

test('EVERY WORD TYPED MUST BE FOUND, each in any searched field', async () => {
  const k = await record();
  const r = read(k, 'hold', { q: `lamps ${LANTERN}` });
  assert.deepEqual(titles(r, 'register.crates'), [`${LANTERN} lamps`]);
  assert.deepEqual(titles(r, 'register.barrels'), []);
  assert.equal(r.head?.searched?.found, 1);
});

test('ONE LETTER NARROWS NOTHING, and an empty word is no word', async () => {
  const k = await record();
  for (const q of ['l', ' ', '']) {
    const r = read(k, 'hold', { q });
    assert.equal(titles(r, 'register.crates').length, 4, `"${q}" narrowed the crates`);
    assert.equal(titles(r, 'register.barrels').length, 2);
    assert.equal(r.head?.searched, undefined);
  }
});

test('A PAGE WHOSE HEAD DECLARES NO SEARCH READS THE WORD AS NOTHING', async () => {
  const k = await record();
  const r = read(k, 'plain', { q: LANTERN });
  assert.equal(titles(r, 'register.crates').length, 4);
  assert.equal(titles(r, 'register.barrels').length, 2);
  assert.equal(r.head?.searched, undefined);
});

test('THE WORD IS TRIMMED AND CUT, and a block over no list is left as it is', () => {
  assert.equal(searchWord('  ab  '), 'ab');
  assert.equal(searchWord(' a '), null);
  assert.equal(searchWord('x'.repeat(200))?.length, 80);
  const shape = { fields: [{ id: 'what', type: 'text' }, { id: 'note', type: 'text', search: true }, { id: 'mark', type: 'text' }], title: 'what' };
  const got = searchClauses(() => shape, [{ source: 'register.crates' }, { source: 'activity' }, { source: 'metric.open' }, null], 'Oil');
  assert.deepEqual([...got.keys()], ['crates']);
  assert.deepEqual(got.get('crates'), [{ any: [{ field: 'what', contains: 'Oil' }, { field: 'note', contains: 'Oil' }] }]);
});

test('A CAPITAL PAST ASCII IS FOUND AS TYPED, since the list lowers ASCII letters only', async () => {
  const k = await record();
  assert.ok(k.create('barrels', { label: 'Émile tar' }, { actor: 'p_1' }).ok);
  const r = read(k, 'hold', { q: 'Émile' });
  assert.deepEqual(titles(r, 'register.barrels'), ['Émile tar']);
  assert.equal(r.head?.searched?.found, 1);
  /* Punctuation still splits the words as the record's search splits them, and each is found in any case. */
  assert.deepEqual(searchClauses(() => ({ fields: [{ id: 'what', type: 'text' }], title: 'what' }), [{ source: 'register.crates' }], 'Émile-TAR').get('crates'), [
    { all: [{ field: 'what', contains: 'Émile' }, { field: 'what', contains: 'TAR' }] },
  ]);
});
