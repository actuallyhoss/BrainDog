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
import { methods as shareMethods, NOTHING_SHOWN, shareKind, type SharedCell, type SharedPage } from '../src/methods/shares.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { BLOCK_KINDS } from '../../kernel/src/declare.ts';
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
  assert.match(said!, /^Owed: (?=.*€300\.50)(?=.*£1,250).*\.$/u);
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
    '',
    'Oldest balance from last week. [Update](/r/balances?new=1)',
    '',
    'Keys are kept in the [Keychain](/keychain).',
    '',
    'Next: [Call Lina](/r/tasks/12)',
  ].join('\n');
  value(await api.kernel.install([INVOICES, page('notes', [{ kind: 'note', heading: 'Notes', body }])]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'notes', money: true }, owner));
  const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'notes')));
  const note = (shown.blocks.find((b) => b.kind === 'note') as { body: string }).body;
  /* A CODE AFTER A FIGURE STANDS ACROSS A NO-BREAK SPACE (`AMOUNT_SPACE`), so the line never ends on £18,400. */
  assert.match(note, /^Earning\. £18,400(?:\.00)?(?:\u00a0GBP)? in the last twelve months\.$/mu);
  /* A DAY READS AS THE APP SAYS IT: the day, and how far off it is from when the page was read. */
  assert.match(note, /^It is not deferrable past 20 Nov, in 5 weeks\.$/mu);
  assert.match(note, /^\d{1,2} Aug \| Raised the studio tier/mu);
  assert.match(note, /Letting it lapse breaks links\.\n```/u);
  assert.match(note, /^Settled by research\.$/mu);
  /* PL1: A LINK THAT IS ITS OWN SENTENCE IS A THING TO DO, and goes; one inside a sentence keeps its words. */
  assert.match(note, /^Oldest balance from last week\.$/mu);
  assert.match(note, /^Keys are kept in the Keychain\.$/mu);
  /* RI3: AFTER A COLON THE LINK IS THE THING NAMED, and keeps its words. */
  assert.match(note, /^Next: Call Lina$/mu);
  assert.doesNotMatch(note, /SG31|D41|Tracked|invoices|Update|\{\{|\}\}|\u0000/u);
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

test('PH3: WITH MONEY OFF, A NOTE TABLE KEEPS EVERY ROW: an amount\'s cell is emptied whole, and a column of nothing but amounts goes', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'Europe/London', 1, '2026-10-01T00:00:00.000Z')",
  );
  const body = [
    '```spec | Domains and hosting',
    'kiln.example | renews {{until:2026-11-15}} | the apex',
    'Object storage | {{money:4100 GBP}} a month | the binaries',
    '```',
    '',
    '```comparison | Plans',
    'Plan | Price | Seats',
    'Studio | {{money:2900 GBP}} a month | 5',
    'Team | {{money:9900 GBP}} a month | 20',
    '```',
    '',
    '| Service | Cost | Note |',
    '| --- | --- | --- |',
    '| Fonts CDN | {{money:1200 GBP}} | cached |',
    '| Mail | {{money:600 GBP}} a month | |',
  ].join('\n');
  value(await api.kernel.install([INVOICES, page('estate', [{ kind: 'note', heading: 'The estate', body }])]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const read = async (money: boolean) => {
    const { id } = value<{ id: string }>(await direct.openShare({ slug: 'estate', money }, owner));
    const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'estate')));
    return (shown.blocks.find((b) => b.kind === 'note') as { body: string }).body;
  };
  const off = await read(false);
  assert.doesNotMatch(off, /£|GBP|a month/u);
  /* A FENCE WHOSE CELLS MEAN THEIR PLACE keeps the place empty, so the note stays the note. */
  assert.match(off, /^kiln\.example \| renews 15 Nov \| the apex$/mu);
  assert.match(off, /^Object storage \|  \| the binaries$/mu);
  /* A HEADED TABLE LOSES THE COLUMN, its head with it, and keeps each row. */
  assert.match(off, /^Plan \| Seats$/mu);
  assert.match(off, /^Studio \| 5$/mu);
  assert.match(off, /^Team \| 20$/mu);
  assert.match(off, /^\| Service \| Note \|$/mu);
  assert.match(off, /^\| --- \| --- \|$/mu);
  assert.match(off, /^\| Fonts CDN \| cached \|$/mu);
  assert.match(off, /^\| Mail \|  \|$/mu);
  /* WITH MONEY ON, nothing moves. */
  const on = await read(true);
  assert.match(on, /^Object storage \| £41(?:\.00)?(?: GBP)? a month \| the binaries$/mu);
  assert.match(on, /^Plan \| Price \| Seats$/mu);
  assert.match(on, /^\| Service \| Cost \| Note \|$/mu);
  sql.close();
});

/* ── RF1: a link with money off sends no amount, through any block kind ─────────────────────────────────────────── */

/**
 * RF1 (review of 31 Oct f): A LINK WITH MONEY OFF SENDS NO AMOUNT, THROUGH ANY BLOCK KIND. It sent a chart by month as
 * `"bars":{"values":[[1234500,null]],"unit":"GBP"}`, a project's readings in pounds as `measures`, a card's money by week
 * as `trends`, and a gauge's target, because each holds its money as bare numbers with the code beside it.
 *
 * WALKED OVER EVERY KIND THE KERNEL ADMITS THAT A LINK MAY DRAW (`BLOCK_KINDS`, `shareKind`), each written every way a
 * block reads money: a list's amounts, a figure in money, its trend, its parts, a series of it, readings in a currency, a
 * card's trend, a sum set against a target, the cash walk, the figures pinned to Home, and the words that name them. Each
 * way a kind installs and draws is read twice: with money on, to show the amount is there to leak, and with money off,
 * where none of its numbers is anywhere in what is sent. A kind added later is walked the same way, and one that draws no
 * amount any way it is written is named in `NO_AMOUNT` by a decision, never by being forgotten.
 */
const SALE = 7_654_321;
const TARGET = 8_765_432;
const CASH = 3_141_592;
const DUE = 4_000_000;
/* EVERY NUMBER OF THE MONEY, as minor units, as major units in any grouping, and the reading in pounds. */
const AMOUNTS = /7654321|76[,.]?543|54321|54[,.]?321|8765432|87[,.]?654|3141592|31[,.]?415|4000000|40[,.]000|GBP|£|Cash lasts/u;

const SALES = {
  id: 'register.sales',
  kind: 'register',
  body: {
    id: 'sales',
    name: 'Sales',
    title: 'client',
    fields: [
      { id: 'client', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'stage', type: 'enum', values: ['open', 'won'] },
      { id: 'sold', type: 'day' },
      { id: 'until', type: 'day' },
      { id: 'hours', type: 'int' },
    ],
  },
} as never;
const POINTS = {
  id: 'register.points',
  kind: 'register',
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, index: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'unit', type: 'text' },
      { id: 'at', type: 'instant', index: true },
    ],
  },
} as never;
const ACCOUNTS = {
  id: 'register.accounts',
  kind: 'register',
  body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money', required: true }] },
} as never;
const DUES = {
  id: 'register.dues',
  kind: 'register',
  body: { id: 'dues', name: 'Dues', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }, { id: 'due', type: 'day' }] },
} as never;
const figure = (metric: string, body: Record<string, unknown>) =>
  ({ id: `metric.${metric}`, kind: 'metric', body: { metric, name: `The ${metric.replaceAll('-', ' ')}`, target: { gte: 0 }, window: '30d', compare: 'none', ...body } }) as never;
/* `where: stage is open` IS THE WORDS OF A DECLARATION, which no link is sent (`figures`). */
const FIGURES = [
  figure('sold-total', { source: 'register.sales', where: 'stage is open', value: { sum: 'amount' }, format: 'money', home: 1 }),
  figure('sold-by-client', { source: 'register.sales', value: { sum: 'amount' }, group_by: 'client', format: 'money' }),
  figure('sold-by-month', { source: 'register.sales', value: { sum: 'amount' }, group_by: 'sold', bucket: 'month', format: 'money' }),
  figure('sold-by-week', { source: 'register.sales', where: 'client is {{it}}', value: { sum: 'amount' }, group_by: 'sold', bucket: 'week', format: 'money' }),
  figure('cash-now', { source: 'register.accounts', value: { sum: 'balance' }, format: 'money' }),
  figure('runway-days', {
    source: 'forecast.runway',
    legs: [{ register: 'dues', on: 'due', amount: 'amount' }],
    opening: { metric: 'cash-now' },
    value: { walk: 'days_to_zero', within: '365d' },
    format: 'days',
    target: { gte: 365 },
  }),
];

/** Each way a block reads money, as one block's keys beside its kind. The words ones fill an amount into what it says. */
const WAYS: Record<string, Record<string, unknown>> = {
  rows: { source: 'register.sales', columns: [{ field: 'client' }, { field: 'amount' }], target: TARGET },
  'dated rows': { source: 'register.sales', columns: [{ field: 'sold' }, { field: 'amount' }] },
  'named dated rows': { source: 'register.sales', columns: [{ field: 'client' }, { field: 'sold' }, { field: 'until' }, { field: 'amount' }] },
  'rows by their day': { source: 'register.sales', columns: [{ field: 'client' }, { field: 'sold' }, { field: 'amount' }] },
  'a money list': { source: 'register.dues', columns: [{ field: 'what' }, { field: 'amount' }] },
  'a figure': { cells: [{ metric: 'sold-total' }], target: TARGET },
  'a figure trend': { cells: [{ metric: 'sold-total', trend: '12w' }] },
  'a figure in parts': { source: 'metric.sold-by-client' },
  'a series': { series: [{ metric: 'sold-by-month', label: 'Sold' }], back: 3 },
  readings: { source: 'register.points', columns: [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }] },
  'a card trend': { source: 'register.sales', columns: [{ field: 'client', as: 'title' }, { metric: 'sold-by-week:{{client}}', as: 'trend' }] },
  'set against a figure': { source: 'register.sales', columns: [{ field: 'client' }, { field: 'hours' }], spent: 'sold-by-client', target: TARGET },
  'the cash walk': { source: 'forecast.runway', opening: { metric: 'cash-now' }, from: [{ register: 'dues', on: 'due', amount: 'amount' }], horizon: 90 },
  'the figures on Home': { source: 'figures.home' },
};
const WORD_WAYS: Record<string, Record<string, unknown>> = {
  body: { body: 'Sold {{sold-total}} so far.\n\nCash lasts {{runway-days}} days.\n\nThe tier ships in September.' },
  authored: { authored: [{ cells: ['Sold', '{{sold-total}}'] }, { cells: ['Lasts', '{{runway-days}}'] }] },
  heading: { heading: 'Sold {{sold-total}}' },
};

/**
 * THE KINDS THAT DRAW NO AMOUNT ANY WAY THE WALK WRITES ONE: a gallery draws pictures, an embed a page from elsewhere,
 * lanes draw spans of time, and a drawn block its own component, whose code no link is sent. Each is still read every
 * way above and must send none of it; this says only that none of the ways draws money with it, by a decision.
 */
const NO_AMOUNT = new Set<string>(['gallery', 'embed', 'lanes', 'drawn']);

/** One record holding money every way a block reads it, the page for each way a kind installs, and a link to each. */
const moneyRecord = (() => {
  let made: Promise<{ api: Awaited<ReturnType<typeof createRecordApi>>; open: (slug: string, money: boolean) => Promise<SharedPage> }> | undefined;
  return () =>
    (made ??= (async () => {
      const sql = openSqlite();
      const clock = fixedClock(NOW);
      const api = await createRecordApi({ sql, clock });
      sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'UTC', 1, '2026-10-01T00:00:00.000Z')");
      value(await api.kernel.install([SALES, POINTS, ACCOUNTS, DUES, ...FIGURES]));
      sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
      sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
      const by = { actor: 'p_owner' };
      value(api.kernel.create('sales', { client: COMPANIES[0], amount: { amount: SALE, currency: 'GBP' }, stage: 'open', sold: '2026-10-12', until: '2026-10-16', hours: 3 }, by));
      value(api.kernel.create('points', { name: 'Revenue', value: 54_321.98, unit: 'GBP', at: '2026-10-13T09:00:00.000Z' }, by));
      value(api.kernel.create('points', { name: 'Revenue', value: 54_321.97, unit: 'GBP', at: '2026-10-14T09:00:00.000Z' }, by));
      value(api.kernel.create('accounts', { name: 'Current', balance: { amount: CASH, currency: 'GBP' } }, by));
      value(api.kernel.create('dues', { what: 'Rent', amount: { amount: DUE, currency: 'GBP' }, due: '2026-10-20' }, by));
      const direct = shareMethods({ kernel: api.kernel, sql, clock, no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
      const open = async (slug: string, money: boolean): Promise<SharedPage> => {
        const { id } = value<{ id: string }>(await direct.openShare({ slug, money }, owner));
        return value<SharedPage>(await api.sharedPage(undefined, link(id, slug)));
      };
      return { api, open };
    })());
})();

/** Whether anything sent holds a block's `figures`, at any depth. */
const figuresIn = (x: unknown): boolean =>
  Array.isArray(x) ? x.some(figuresIn) : x !== null && typeof x === 'object' ? Object.hasOwn(x, 'figures') || Object.values(x).some(figuresIn) : false;

const LINKED = BLOCK_KINDS.filter(shareKind);

test('RF1: THE WALK HAS KINDS TO WALK, and a kind named as drawing no amount is one a link still draws', () => {
  assert.ok(LINKED.length > 20, LINKED.join(', '));
  for (const kind of NO_AMOUNT) assert.ok(LINKED.includes(kind), `${kind} is no kind a link draws`);
});

for (const kind of LINKED)
  test(`RF1: A LINK WITH MONEY OFF SENDS NO AMOUNT THROUGH A ${kind} BLOCK, and no block's figures either way`, async () => {
    const { api, open } = await moneyRecord();
    const drew: string[] = [];
    for (const [way, keys] of Object.entries({ ...WAYS, ...WORD_WAYS })) {
      const slug = `rf1-${kind.replaceAll(/[^a-z0-9]/gu, '-')}-${way.replaceAll(' ', '-').toLowerCase()}`;
      const block = { kind, heading: 'Plain heading', ...keys };
      const put = (await api.kernel.install([page(slug, [block], ['register.sales', 'register.points', 'register.accounts', 'register.dues'])])) as { ok: boolean };
      if (!put.ok) continue;
      const on = await open(slug, true);
      const off = await open(slug, false);
      /* NEITHER LINK IS SENT WHAT A FIGURE IS AS DECLARED: its `where`, its list, its target. */
      assert.equal(figuresIn(on.blocks) || figuresIn(off.blocks), false, `${way}: a link was sent a block's figures`);
      assert.doesNotMatch(JSON.stringify([on.blocks, off.blocks]), /stage is open/u, `${way}: a link was sent a figure's where`);
      const said = JSON.stringify(off.blocks);
      assert.doesNotMatch(said, AMOUNTS, `${way}: money reached a link with money off: ${said.slice(0, 900)}`);
      if (AMOUNTS.test(JSON.stringify(on.blocks)) && !(way in WORD_WAYS)) drew.push(way);
    }
    /* AND THE WALK ASKED SOMETHING OF IT: some way draws money with this kind, or it is named as drawing only words. */
    assert.equal(drew.length > 0, !NO_AMOUNT.has(kind), drew.length > 0 ? `${kind} draws money (${drew.join(', ')}) and is named in NO_AMOUNT` : `no way drew money with ${kind}: write the way it reads money above, or name it in NO_AMOUNT if it reads none`);
  });

test('RF1: A BLOCK\'S figures GOES TO A READER ONLY FOR A FIGURE SHE MAY READ, as `metric` answers her', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }).ok);
  const NOTES = { id: 'register.notes', kind: 'register', body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } } as never;
  const BILLS = {
    id: 'register.bills',
    kind: 'register',
    body: { id: 'bills', name: 'Bills', title: 'payee', fields: [{ id: 'payee', type: 'text', required: true }, { id: 'amount', type: 'money', required: true }] },
  } as never;
  /* A FIGURE OVER BILLS WHOSE NAME IS A WORD OF A PATH OVER NOTES, and one over Notes she reads. */
  const OVERDUE = figure('overdue', { source: 'register.bills', where: 'payee is Severance for Sam', value: { sum: 'amount' }, format: 'money', target: { lte: 9_100_000 } });
  const WRITTEN = figure('written', { source: 'register.notes', value: { count: 'id' }, format: 'int' });
  const DESK = page('desk', [{ kind: 'note', heading: 'Notes', body: 'Notes overdue: {{notes.overdue}}. Written: {{written}}.' }], ['register.notes']);
  value(await api.kernel.install([NOTES, BILLS, OVERDUE, WRITTEN, DESK]));
  const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
  value(await api.create({ register: 'notes', fields: { what: 'A note' } }, owner));
  value(await api.create({ register: 'bills', fields: { payee: 'Severance for Sam', amount: { amount: 9_100_000, currency: 'GBP' } } }, owner));
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  type Drawn = { blocks: { figures?: Record<string, unknown>; refusals: unknown[] }[] };
  const mine = value<Drawn>(await api.page({ slug: 'desk' }, owner)).blocks[0]!;
  /* THE OWNER IS TOLD WHAT BOTH ARE. */
  assert.deepEqual(Object.keys(mine.figures ?? {}).sort(), ['overdue', 'written']);
  const hers = value<Drawn>(await api.page({ slug: 'desk' }, wren)).blocks[0]!;
  assert.deepEqual(hers.refusals, [], 'the note over Notes is drawn for her');
  /* SHE IS TOLD WHAT THE FIGURE OVER NOTES IS, AND NOTHING OF THE ONE OVER BILLS: not its name, list, where or target. */
  assert.deepEqual(Object.keys(hers.figures ?? {}), ['written']);
  assert.doesNotMatch(JSON.stringify(hers), /Severance|register\.bills|9100000|"overdue"/u);
  sql.close();
});

test('RF5: WITH MONEY OFF, A MONEY FIGURE THAT IS NOT IN A CURRENCY GOES TOO: how many days the money lasts', async () => {
  const { api, open } = await moneyRecord();
  const body = 'Cash lasts {{runway-days}} days.\n\nWritten {{days:runway-days}} ahead.\n\nThe tier ships in September.';
  value(await api.kernel.install([page('rf5-runway', [{ kind: 'note', heading: 'Lasts {{runway-days}} days', body }, { kind: 'stat', cells: [{ metric: 'runway-days' }] }], ['register.sales'])]));
  const on = JSON.stringify((await open('rf5-runway', true)).blocks);
  assert.match(on, /Cash lasts \d+ days\./u, 'the walk is there to keep off');
  const off = await open('rf5-runway', false);
  const note = off.blocks.find((b) => b.kind === 'note') as { heading: string; body: string };
  assert.equal(note.body, 'The tier ships in September.');
  assert.doesNotMatch(note.heading, /\d/u);
  const stat = off.blocks.find((b) => b.kind === 'stat') as { readings?: unknown[] } | undefined;
  assert.equal(stat?.readings?.length ?? 0, 0);
});

test('SC1: A PROJECTS PAGE\'S CARDS REACH A LINK without the column that reads the runs, and without the card\'s mark or hue', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'Europe/London', 1, '2026-10-01T00:00:00.000Z')",
  );
  const THINGS = {
    id: 'register.things',
    kind: 'register',
    body: {
      id: 'things',
      name: 'Projects',
      title: 'name',
      fields: [
        { id: 'name', type: 'text', required: true },
        { id: 'mark', type: 'text' },
        { id: 'hue', type: 'int' },
        { id: 'health', type: 'enum', values: ['on_track', 'at_risk'], labels: { on_track: 'On track', at_risk: 'At risk' } },
        { id: 'revenue', label: 'Earned in a year', type: 'money' },
      ],
    },
  } as never;
  /* THE CARDS AS PROJECTS DRAWS THEM: "Worked on" is `project-worked`, which reads the runs and names the whole record. */
  const PROJECTS = page('portfolio', [
    {
      kind: 'cards',
      heading: 'In play',
      source: 'register.things',
      columns: [
        { field: 'name', as: 'title' },
        { field: 'mark', as: 'mark' },
        { field: 'hue', as: 'hue' },
        { field: 'health', label: '', as: 'fact' },
        { field: 'revenue', as: 'fact' },
        { metric: 'project-worked:{{name}}', as: 'when', label: 'Worked on' },
      ],
    },
  ], ['register.things']);
  value(await api.kernel.install([THINGS, PROJECTS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  value(api.kernel.create('things', { name: 'Kiln', mark: 'tag', hue: 265, health: 'at_risk', revenue: { amount: 1_840_000, currency: 'GBP' } }, { actor: 'p_owner' }));
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  for (const money of [false, true]) {
    const { id } = value<{ id: string }>(await direct.openShare({ slug: 'portfolio', money }, owner));
    const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'portfolio')));
    assert.equal(shown.empty, null, `the cards never reached a link made with money ${String(money)}`);
    const cards = shown.blocks.find((b) => b.kind === 'cards') as { columns: { field: string }[]; rows: Row[]; whens?: unknown; trends?: unknown } | undefined;
    assert.ok(cards);
    assert.deepEqual(cards.columns.map((c) => c.field), money ? ['name', 'health', 'revenue'] : ['name', 'health']);
    assert.equal(cards.rows[0]?.cells.name?.value, 'Kiln');
    assert.equal(cards.whens, undefined);
    const said = JSON.stringify(shown.blocks);
    assert.doesNotMatch(said, /"tag"|265|Worked on/u);
    if (money) assert.match(said, /"currency":"GBP"/u);
    else assert.doesNotMatch(said, /GBP|18,400|1840000/u);
  }
  sql.close();
});

test('SL2: A PROJECT CARD\'S TREND REACHES A LINK from the project\'s own rows, never from a key number, and named as its figure', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'Europe/London', 1, '2026-10-01T00:00:00.000Z')",
  );
  const THINGS = { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } } as never;
  const TASKS = {
    id: 'register.tasks',
    kind: 'register',
    body: {
      id: 'tasks',
      name: 'Tasks',
      title: 'what',
      state: 'state',
      done: ['done'],
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'state', type: 'enum', values: ['open', 'done'] },
        { id: 'thing', type: 'text' },
        { id: 'done_on', type: 'day' },
      ],
    },
  } as never;
  const DONE = figure('project-done-by-week', {
    name: 'Done, by week',
    source: 'register.tasks',
    where: 'thing is {{it}}, state is done',
    value: { count: 'id' },
    group_by: 'done_on',
    bucket: 'week',
    format: 'int',
  });
  const PROJECTS = page('portfolio', [
    {
      kind: 'cards',
      heading: 'In play',
      source: 'register.things',
      columns: [{ field: 'name', as: 'title' }, { metric: 'project-done-by-week:{{name}}', kpi: 'headline', as: 'trend' }],
    },
  ], ['register.things', 'register.tasks']);
  value(await api.kernel.install([THINGS, TASKS, DONE, PROJECTS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  value(api.kernel.create('things', { name: 'Kiln' }, { actor: 'p_owner' }));
  value(api.kernel.create('things', { name: 'Tallow' }, { actor: 'p_owner' }));
  for (const [what, thing, done_on] of [['Cut one', 'Kiln', '2026-09-01'], ['Cut two', 'Kiln', '2026-09-15'], ['Cut three', 'Kiln', '2026-09-22'], ['Elsewhere', 'Tallow', '2026-09-15']])
    value(api.kernel.create('tasks', { what, thing, done_on, state: 'done' }, { actor: 'p_owner' }));
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'portfolio', money: false }, owner));
  const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'portfolio')));
  const cards = shown.blocks.find((b) => b.kind === 'cards') as { rows: Row[]; trends?: ((number | null)[] | null)[]; trend_label?: string } | undefined;
  assert.ok(cards);
  assert.equal(cards.trends?.length, cards.rows.length, 'the cards came back without their lines');
  assert.equal(cards.trend_label, 'Done, by week');
  /* KILN'S LINE COUNTS KILN'S TASKS ALONE: three done, one a week, and Tallow's one is on Tallow's line. */
  const kiln = cards.rows.findIndex((r) => r.cells.name?.value === 'Kiln');
  const sum = (run: (number | null)[] | null | undefined) => (run ?? []).reduce<number>((n, v) => n + (v ?? 0), 0);
  assert.equal(sum(cards.trends?.[kiln]), 3);
  assert.equal(sum(cards.trends?.[1 - kiln]), 1);
  sql.close();
});

test('AL1: A COLUMN THAT READS A SECOND FIELD WHERE ITS OWN IS EMPTY SENDS BOTH, as the Ledger names a line with no payee', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec(
    "INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_1', 'studio', 'Studio', 'en-GB', 'Europe/London', 1, '2026-10-01T00:00:00.000Z')",
  );
  value(await api.kernel.install([INVOICES, page('ledger', [{ kind: 'table', source: 'register.invoices', columns: [{ field: 'where', or: 'client', label: 'Who' }] }])]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_owner', ?, ?)", OWNER.email, OWNER.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_owner', '*', 'owner')");
  value(api.kernel.create('invoices', { client: 'Grangemoor Events', stage: 'sent' }, { actor: 'p_owner' }));
  const direct = shareMethods({ kernel: api.kernel, sql, clock: fixedClock(NOW), no, tail: async <T>(o: T) => o, scoped: () => null, admin: () => null, shares: () => ({ can: true }) } as unknown as RecordDeps);
  const { id } = value<{ id: string }>(await direct.openShare({ slug: 'ledger', money: true }, owner));
  const shown = value<SharedPage>(await api.sharedPage(undefined, link(id, 'ledger')));
  const table = tableOf(shown) as ReturnType<typeof tableOf> & { columns: { or?: string }[] };
  assert.equal(table.columns[0]?.or, 'client');
  assert.deepEqual(table.rows[0]?.cells.client, { type: 'text', value: 'Grangemoor Events' });
  sql.close();
});
