/**
 * The newest reading (PGS-B13 job b): on a page with a row, `{{revenue.monthly}}` is the newest monthly revenue reading
 * the record holds about that row, in the currency it was written in, and `{{revenue.monthly.since}}` the day it was read.
 *
 * WHAT WAS MEASURED BEFORE IT: no path read a reading, so a project note's `{{revenue.monthly}}` was asked as a count of
 * a list called revenue in a state called monthly, which no record has, and drew as the author's words.
 *
 * The order is `PATH_ORDER` in `pages.ts`: a list and its count or state, a figure and its part, a module and its figure,
 * a field of the page's row and a part, then a measure and a period. Every filled hole says which rule read it
 * (`read_as`). Every name here is invented (`fixtures/names.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROJECTS as NAMES } from '../../../fixtures/names.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { readBlock, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { RawReading } from '../src/measures.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const OWNER = { actor: 'p_1' };
const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const usd = (amount: number) => ({ amount, currency: 'USD' });
const [LANTERN, COPPER, BRIGHT, QUIET, OXBOW] = NAMES;

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'revenue', type: 'money' }] },
};

/* A LIST OF READINGS BY ITS SHAPE: a measure's name as its title, a number or an amount, a unit, a day, its project. */
const NUMBERS: Declaration = {
  id: 'register.numbers',
  kind: 'register',
  body: {
    id: 'numbers',
    name: 'Numbers',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal' },
      { id: 'amount', type: 'money' },
      { id: 'unit', type: 'text' },
      { id: 'project', type: 'ref', to: 'things' },
      { id: 'at', type: 'instant' },
    ],
  },
};

const BODY = '{{revenue.monthly}} {{revenue.monthly.since}} {{revenue.amount}} {{payers.weekly}}';

/* A PAGE PER PROJECT, whose note is the project's own words about its numbers. */
const PROJECT: Declaration = {
  id: 'page.project',
  kind: 'page',
  body: { page: 'project', title: '{{name}}', for: { register: 'things' }, requires: ['register.things', 'register.numbers'], blocks: [{ kind: 'note', body: BODY }] } as never,
};

async function record(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([PROJECTS, NUMBERS, PROJECT]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const ids: Record<string, string> = {};
  for (const [name, revenue] of [[LANTERN, gbp(1_840_000)], [COPPER], [BRIGHT], [QUIET], [OXBOW]] as const) {
    const made = k.create('things', { name, ...(revenue ? { revenue } : {}) }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
    ids[name] = made.value.id;
  }
  const reading = (project: string, fields: Record<string, unknown>) => {
    const made = k.create('numbers', { project: ids[project], ...fields }, OWNER);
    assert.ok(made.ok, JSON.stringify(made));
  };
  /* Two monthly revenue readings, the older named the way an import names one, with a comma and the project. */
  reading(LANTERN, { name: `Monthly revenue, ${LANTERN}`, amount: gbp(120_000), at: '2026-09-01T09:00:00Z' });
  reading(LANTERN, { name: 'Monthly revenue', amount: gbp(150_000), at: '2026-10-01T09:00:00Z' });
  reading(LANTERN, { name: 'Weekly payers', value: 42, at: '2026-10-02T09:00:00Z' });
  /* A reading whose name is a field and a part of the row: the field is read first. */
  reading(LANTERN, { name: 'Revenue amount', value: 7, at: '2026-10-03T09:00:00Z' });
  /* Another project's reading, newer, is never this one's. */
  reading(COPPER, { name: 'Monthly revenue', amount: gbp(999), at: '2026-10-10T09:00:00Z' });
  /* An older reading is a decimal whose unit is a currency, and is said in minor units. */
  reading(BRIGHT, { name: 'Revenue monthly', value: 1234.5, unit: 'GBP', at: '2026-09-15T09:00:00Z' });
  /* Two currencies: the newer is said in its own, and never added to the other. */
  reading(OXBOW, { name: 'Monthly revenue', amount: gbp(30_000), at: '2026-09-20T09:00:00Z' });
  reading(OXBOW, { name: 'Monthly revenue', amount: usd(50_000), at: '2026-10-05T09:00:00Z' });
  return k;
}

type Read = { values?: Record<string, unknown>; read_as?: Record<string, string>; unnamed?: string[] };

function noteOn(k: Kernel, project: string): Read {
  const slug = k.pages().find((p) => p.title === project)?.slug;
  assert.ok(slug, `no page for ${project}`);
  const page = k.page(slug);
  assert.ok(page.ok, JSON.stringify(page));
  return page.value.blocks[0] as Read;
}

test('A PROJECT WITH TWO MONTHLY REVENUE READINGS PRINTS THE NEWER, in its currency, and .since its day', async () => {
  const k = await record();
  const read = noteOn(k, LANTERN);
  assert.deepEqual(read.values?.['revenue.monthly'], gbp(150_000), 'the newer of the two, and never the other project’s');
  assert.equal(read.values?.['revenue.monthly.since'], '2026-10-01');
  assert.equal(read.values?.['payers.weekly'], 42, 'a reading that is not money is the number as it was read');
  assert.equal(read.read_as?.['revenue.monthly'], 'reading');
  assert.equal(read.read_as?.['revenue.monthly.since'], 'reading');
  assert.equal(read.unnamed, undefined);
});

test('A FIELD OF THE ROW WINS OVER A READING OF THE SAME WORDS (the order), and says it was read as a field', async () => {
  const k = await record();
  const read = noteOn(k, LANTERN);
  assert.equal(read.values?.['revenue.amount'], 1_840_000, 'the project’s own revenue, not the reading named Revenue amount');
  assert.equal(read.read_as?.['revenue.amount'], 'field');
  assert.deepEqual(Object.keys(read.read_as ?? {}).sort(), Object.keys(read.values ?? {}).sort(), 'every filled hole says its rule');
});

test('A PROJECT WITH NO READING PRINTS THE PATH, MARKED, as before', async () => {
  const k = await record();
  const read = noteOn(k, QUIET);
  assert.equal(read.values, undefined);
  assert.equal(read.read_as, undefined);
  assert.deepEqual(read.unnamed, ['revenue.monthly', 'revenue.monthly.since', 'payers.weekly'], 'a money with no value is named and draws its dash');
});

test('A READING IN ANOTHER CURRENCY IS NEVER ADDED: the newest is said in the currency it was written in', async () => {
  const k = await record();
  assert.deepEqual(noteOn(k, OXBOW).values?.['revenue.monthly'], usd(50_000));
  /* A decimal whose unit is a currency is that currency's minor units, and its name may put the period last. */
  assert.deepEqual(noteOn(k, BRIGHT).values?.['revenue.monthly'], gbp(123_450));
  assert.equal(noteOn(k, BRIGHT).values?.['revenue.monthly.since'], '2026-09-15');
});

test('A PATH AN EARLIER RULE ANSWERS READS AS BEFORE, with its rule named', async () => {
  const k = await record();
  const read = k.block({ kind: 'note', body: '{{things.count}} {{numbers.count}} {{revenue.monthly}}' } as never) as Read;
  assert.deepEqual(read.values, { 'things.count': 5, 'numbers.count': 8 });
  assert.deepEqual(read.read_as, { 'things.count': 'count', 'numbers.count': 'count' });
  assert.deepEqual(read.unnamed, ['revenue.monthly'], 'with no row, there is no reading to read');
});

/* ── a reader held from the readings ─────────────────────────────────────── */

test('A READER WHO MAY NOT OPEN THE READINGS IS NOT SHOWN ONE, and the path is the author’s words', async () => {
  const k = await record();
  const here = k.list({ register: 'things', where: { field: 'name', is: LANTERN }, limit: 1 });
  assert.ok(here.ok);
  const row = here.value.rows[0] as Entry;
  const asked: string[] = [];
  const readings = (q: { register: string }) => {
    asked.push(q.register);
    const latest: RawReading[] = [{ at: '2026-10-01T09:00:00Z', value: null, amount: JSON.stringify(gbp(150_000)), name: 'Monthly revenue' }];
    return { ok: true as const, value: { readings: [], latest } };
  };
  const deps = (reads: (list: string) => boolean): PageDeps => ({
    pages: () => [],
    metric: () => null,
    read: (decl) => k.metric(decl),
    list: (q) => k.list({ register: q.register, ...(q.where ? { where: q.where } : {}), ...(q.limit ? { limit: q.limit } : {}) }),
    schemaOf: k.schemaOf,
    titleOf: (register) => k.register(register)?.title ?? null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: k.schemaOf, reads },
    lists: () => [...k.registers().values()],
    readings,
    here: row,
  });
  const block: PageBlock = { kind: 'note', body: '{{revenue.monthly}}' } as never;
  const held = readBlock(deps((list) => list !== 'numbers'), block) as Read;
  assert.equal(held.values, undefined);
  assert.deepEqual(asked, [], 'the list was never asked');
  const open = readBlock(deps(() => true), block) as Read;
  assert.deepEqual(open.values, { 'revenue.monthly': gbp(150_000) });
  assert.deepEqual(open.read_as, { 'revenue.monthly': 'reading' });
  /* Read back with the answer on it, the block is read again and not refused for a key nobody declares. */
  const again = readBlock(deps(() => true), { ...block, read_as: open.read_as } as never) as Read & { refusals: unknown[] };
  assert.deepEqual(again.refusals, []);
  assert.deepEqual(again.read_as, { 'revenue.monthly': 'reading' });
});
