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
const page = (slug: string, blocks: unknown[], requires: string[] = ['register.invoices']) =>
  ({ id: `page.${slug}`, kind: 'page', body: { page: slug, title: slug === 'money' ? 'Money' : 'Elsewhere', requires, blocks } }) as never;
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
  /* THESE LINKS SAY "Include money", since what they test is how money reads on one; a link that does not is below. */
  const read = async (slug: string, money: boolean | 'unsaid' = true): Promise<SharedPage> => {
    const { id } = value<{ id: string }>(await direct.openShare(money === 'unsaid' ? { slug } : { slug, money }, owner));
    return value<SharedPage>(await api.sharedPage(undefined, link(id, slug)));
  };
  return { sql, read, direct, api, rows: [first.id, second.id] };
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
  /* EACH AMOUNT WRITTEN ONE WAY, as Money writes it against the record's home currency, whatever the language. AND A
     SENTENCE WITH A HOLE NOTHING FILLS IS LEFT OUT WHOLE, rather than read "Also and the handbook." */
  assert.match(said!, /^Owed: (?=.*€300\.50.EUR)(?=.*£1,250\.00.GBP).*\.$/u);
  assert.doesNotMatch(note.body, /Also|handbook/u);
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

test('a note keeps what it says: a typed figure in words, a day as a day, and no sentence that names a row or a question', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'Europe/London', 1, '2026-10-01T00:00:00.000Z')",
  );
  const body = [
    'Earning. {{money:1840000 GBP}} in the last twelve months.',
    '',
    'Open as SG31 and it blocks two quotes. It is not deferrable past {{date:2026-11-20}}.',
    '',
    '```timeline | Recent',
    '{{ago:2026-08-14}} | Raised the studio tier | first increase since launch | good',
    '```',
    '',
    '```note | Watch this | warn',
    'Letting it lapse breaks links. Tracked',
    'as {{ref:invoices#3}}.',
    '```',
    '',
    'Settled by research. The comparison is D41.',
  ].join('\n');
  value(await api.kernel.install([INVOICES, page('notes', [{ kind: 'note', heading: 'Notes', body }])]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'notes', money: true }, owner));
  const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'notes')));
  const note = (shown.blocks.find((b) => b.kind === 'note') as { body: string }).body;
  assert.match(note, /^Earning\. £18,400(?:\.00)?(?: GBP)? in the last twelve months\.$/mu);
  assert.match(note, /^It is not deferrable past 20 Nov 2026/mu);
  assert.match(note, /^\d{1,2} Aug \| Raised the studio tier/mu);
  assert.match(note, /Letting it lapse breaks links\.\n```/u);
  assert.match(note, /^Settled by research\.$/mu);
  assert.doesNotMatch(note, /SG31|D41|Tracked|invoices|\{\{|\}\}|\u0000/u);
  sql.close();
});

test('AF18: A NEW LINK KEEPS MONEY OFF UNLESS IT WAS ASKED FOR, and a link made before shows what it showed', async () => {
  const { sql, read, direct, api } = await harness();
  for (const money of ['unsaid', false] as const) {
    const shown = await read('money', money);
    const said = JSON.stringify(shown);
    assert.doesNotMatch(said, /"currency"|EUR|GBP|€|£/u, `money reached a link made with money ${String(money)}`);
    /* THE ROWS STAY, THEIR AMOUNT GOES: invoices may hold an amount, and are not money through and through. */
    const table = tableOf(shown);
    assert.deepEqual(table.columns.map((c) => c.label), ['Client', 'Stage', 'Where']);
    for (const r of table.rows) assert.equal(r.cells.amount_due, undefined);
    /* A FIGURE IN A CURRENCY GOES, and the sentence that said it goes whole. */
    const stat = shown.blocks.find((b) => b.kind === 'stat') as { readings?: unknown[] } | undefined;
    assert.equal(stat?.readings?.length ?? 0, 0);
    const note = shown.blocks.find((b) => b.kind === 'note') as { body?: string } | undefined;
    assert.doesNotMatch(note?.body ?? '', /Owed/u);
  }
  /* SAID AS ANYTHING BUT TRUE OR FALSE, IT IS REFUSED, rather than read as either. */
  const bad = (await direct.openShare({ slug: 'money', money: 'yes' }, owner)) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(bad.ok, false);
  assert.deepEqual([bad.refusal?.code, bad.refusal?.at], ['VALUE_MALFORMED', 'money']);
  /* A LINK OPENED BEFORE LINKS SAID SO carries no word about money, and shows it as it did. */
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'money', money: false }, owner));
  const held = sql.one<{ bound: string }>("SELECT from_v AS bound FROM event WHERE target = ? AND kind = 'share.open'", `share:${id}`)!;
  const { money: _gone, ...before } = JSON.parse(held.bound) as Record<string, unknown>;
  assert.equal(_gone, false);
  sql.exec("UPDATE event SET from_v = ? WHERE target = ? AND kind = 'share.open'", JSON.stringify(before), `share:${id}`);
  const old = value<SharedPage>(await api.sharedPage(undefined, link(id, 'money')));
  assert.match(JSON.stringify(old), /"currency":"GBP"/u);
  sql.close();
});

test('AF18: WITH MONEY OFF, A LIST THAT IS MONEY IS NOT SENT AT ALL', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'Europe/London', 1, '2026-10-01T00:00:00.000Z')",
  );
  const LEDGER = {
    id: 'register.ledger',
    kind: 'register',
    body: { id: 'ledger', name: 'Bills and invoices', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }] },
  } as never;
  const PLAN = page('plan', [
    { kind: 'table', source: 'register.ledger', heading: 'Bills', columns: [{ field: 'what' }, { field: 'amount' }] },
    { kind: 'note', heading: 'Notes', body: 'Earning. {{money:1840000 GBP}} in the last twelve months.\n\nThe licensing tier ships in September.' },
  ], ['register.ledger']);
  value(await api.kernel.install([LEDGER, PLAN]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  value(api.kernel.create('ledger', { what: 'Hosting, quarterly, July', amount: { amount: -853_000, currency: 'GBP' } }, { actor: 'p_owner' }));
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'plan' }, owner));
  const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'plan')));
  /* The blocks, not the page's own facts: `home` names the record's currency and holds no amount. */
  const said = JSON.stringify(shown.blocks);
  assert.doesNotMatch(said, /Hosting|Bills|18,400|GBP|£/u);
  assert.match(said, /The licensing tier ships in September\./u);
  sql.close();
});
