/**
 * A shared page tells the truth: what `sharedPage` answers for a page with a money table, a figure, a sentence
 * filled from the record, and blocks a link hides.
 *
 * A money cell arrives whole, as minor units and its own currency, and two currencies are never one sum. A hidden block
 * does not arrive at all, so it cannot say "Nothing is waiting on you" about a record where things are. No `{{path}}`
 * is left with its braces, no column or figure is named by its id, and nothing holds a row id, a list id or an address
 * under `/r/` or `/p/`. The answer says the record's language and zone, and the owner's words are filled in them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods as shareMethods, NOTHING_SHOWN, type SharedCell, type SharedPage } from '../src/methods/shares.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { COMPANIES, OWNER } from '../../../fixtures/names.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
const link = (id: string, slug: string): CallContext => ({ principal: { kind: 'share', id, slug } });

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const INVOICES = {
  id: 'register.invoices',
  kind: 'register',
  body: {
    id: 'invoices',
    name: 'Invoices',
    title: 'client',
    fields: [
      { id: 'client', type: 'text', required: true },
      { id: 'amount_due', type: 'money', label: 'Amount due' },
      { id: 'stage', type: 'enum', values: ['sent', 'paid'], labels: { sent: 'Sent out', paid: 'Paid in full' } },
      { id: 'where', type: 'text' },
      { id: 'parent', type: 'ref', to: 'invoices' },
    ],
  },
} as never;
const OWED = {
  id: 'metric.owed-total',
  kind: 'metric',
  body: { metric: 'owed-total', name: 'Owed to you', source: 'register.invoices', value: { sum: 'amount_due' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' },
} as never;
const page = (slug: string, blocks: unknown[]) =>
  ({ id: `page.${slug}`, kind: 'page', body: { page: slug, title: slug === 'money' ? 'Money' : 'Elsewhere', requires: ['register.invoices'], blocks } }) as never;
const MONEY = page('money', [
  { kind: 'stat', cells: [{ metric: 'owed-total' }] },
  { kind: 'note', heading: 'Where it stands', body: 'Owed: {{owed-total}}. Also {{nothing-here}} and [the handbook](/p/handbook).\n\n- Sent\n  - by hand' },
  { kind: 'table', source: 'register.invoices', columns: [{ field: 'client', label: 'Client' }, { field: 'amount_due' }, { field: 'stage' }, { field: 'where' }], empty: 'No invoices.' },
  { kind: 'queue', source: 'governance.open', heading: 'Waiting on you', empty: 'Nothing is waiting on you.' },
  { kind: 'feed', source: 'activity', heading: 'Lately', empty: 'Nothing happened lately.' },
]);
const HIDDEN = page('elsewhere', [{ kind: 'queue', source: 'governance.open', heading: 'Waiting on you', empty: 'Nothing is waiting on you.' }]);

/** A record in German on Berlin's clock, with two invoices in two currencies, and a link to each page. */
async function harness() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'de-DE', 'Europe/Berlin', 1, '2026-10-01T00:00:00.000Z')",
  );
  value(await api.kernel.install([INVOICES, OWED, MONEY, HIDDEN]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const first = value<{ id: string }>(api.kernel.create('invoices', { client: COMPANIES[0], amount_due: { amount: 125_000, currency: 'GBP' }, stage: 'sent', where: '/r/invoices/2' }, { actor: 'p_owner' }));
  const second = value<{ id: string }>(
    api.kernel.create('invoices', { client: COMPANIES[1], amount_due: { amount: 30_050, currency: 'EUR' }, stage: 'paid', parent: first.id }, { actor: 'p_owner' }),
  );
  const direct = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const read = async (slug: string): Promise<SharedPage> => {
    const { id } = value<{ id: string }>(await direct.openShare({ slug }, owner));
    return value<SharedPage>(await api.sharedPage(undefined, link(id, slug)));
  };
  return { sql, read, rows: [first.id, second.id] };
}

/** Every string anywhere in an answer: what a reader could print. */
const wordsIn = (x: unknown): string[] =>
  typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(wordsIn) : x !== null && typeof x === 'object' ? Object.values(x).flatMap(wordsIn) : [];

type Row = { fields: Record<string, unknown>; cells: Record<string, SharedCell> };
const tableOf = (p: SharedPage) => p.blocks.find((b) => b.kind === 'table') as { columns: { field: string; label: string }[]; rows: Row[] };

test('a money cell arrives whole, in its own currency, and two currencies are never one sum', async () => {
  const { sql, read } = await harness();
  const shown = await read('money');
  const rows = tableOf(shown).rows;
  assert.deepEqual(
    rows.map((r) => r.cells.amount_due).sort((a, b) => String((a!.value as { currency: string }).currency).localeCompare((b!.value as { currency: string }).currency)),
    [
      { type: 'money', value: { amount: 30_050, currency: 'EUR' } },
      { type: 'money', value: { amount: 125_000, currency: 'GBP' } },
    ],
  );
  /* THE OLDER READER'S PLAIN FIELDS NEVER HOLD AN AMOUNT, which it would draw as its braces. */
  for (const r of rows) assert.equal(r.fields.amount_due, undefined);
  /* A CHOICE CARRIES THE WORD THE OWNER READS. */
  assert.deepEqual(rows.map((r) => r.cells.stage).find((c) => c?.value === 'sent'), { type: 'enum', value: 'sent', label: 'Sent out' });
  /* THE FIGURE OVER BOTH IS EACH AMOUNT IN TURN, never one sum, in the tile and in the record's language in words. */
  const stat = shown.blocks.find((b) => b.kind === 'stat') as { readings: { reading: { value: number | null; parts: unknown[] } }[] };
  assert.deepEqual(stat.readings[0]!.reading.value, null);
  assert.deepEqual(stat.readings[0]!.reading.parts, [
    { amount: 30_050, currency: 'EUR' },
    { amount: 125_000, currency: 'GBP' },
  ]);
  const note = shown.blocks.find((b) => b.kind === 'note') as { body: string };
  const [said, ...rest] = note.body.split('\n');
  /* EACH AMOUNT WRITTEN ONE WAY, as Money writes it against the record's home currency, whatever the language. */
  assert.match(said!, /^Owed: (?=.*€300\.50.EUR)(?=.*£1,250\.00.GBP).*\. Also and the handbook\.$/u);
  /* AND THE REST OF HER WORDS KEEP THEIR SPACING: a nested list keeps its indent. */
  assert.deepEqual(rest, ['', '- Sent', '  - by hand']);
  sql.close();
});

test('a hidden block does not arrive, and a page left with none says one calm line', async () => {
  const { sql, read } = await harness();
  const shown = await read('money');
  assert.deepEqual(shown.blocks.map((b) => b.kind), ['stat', 'note', 'table']);
  assert.doesNotMatch(JSON.stringify(shown), /Waiting on you|Nothing is waiting|Lately/u);
  assert.equal(shown.empty, null);
  const bare = await read('elsewhere');
  assert.deepEqual([bare.blocks, bare.empty], [[], NOTHING_SHOWN]);
  sql.close();
});

test('no braces, no id and no address into the record, and every column and figure says its label', async () => {
  const { sql, read, rows } = await harness();
  const shown = await read('money');
  const said = JSON.stringify(shown);
  for (const words of wordsIn(shown)) assert.doesNotMatch(words, /\{\{|\}\}/u, 'a merge token kept its braces');
  assert.doesNotMatch(said, /#\d/u, 'the page carried a row\'s handle');
  for (const id of rows) assert.ok(!said.includes(id), `the page named the row ${id}`);
  assert.doesNotMatch(said, /[0-9A-HJKMNP-TV-Z]{26}/u, 'the page carried an id');
  assert.doesNotMatch(said, /register\.|"invoices"/u, 'the page named a list');
  assert.doesNotMatch(said, /\/[rp]\//u, 'the page carried an address into the record');
  assert.deepEqual(
    tableOf(shown).columns.map((c) => c.label),
    ['Client', 'Amount due', 'Stage', 'Where'],
  );
  const stat = shown.blocks.find((b) => b.kind === 'stat') as { readings: { label: string }[] };
  assert.deepEqual(stat.readings.map((r) => r.label), ['Owed to you']);
  sql.close();
});

test('the answer carries the record\'s language and zone', async () => {
  const { sql, read } = await harness();
  const shown = await read('money');
  assert.deepEqual([shown.language, shown.zone], ['de-DE', 'Europe/Berlin']);
  sql.close();
});
