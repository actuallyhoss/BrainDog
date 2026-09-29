/**
 * `previewPage` held to what `list`, `metric` and `page` already answer the same caller.
 *
 * THE BODY IS THE CALLER'S OWN, AND THAT IS WHAT IS NEW. `page` draws a body the owner installed, so its `where` and
 * its figures are words nobody reading the page chose. `previewPage` draws a body the caller writes, so every word in
 * it is a question she gets to ask, and each of the three cases below is one kind of question the record already
 * refuses to answer somewhere else:
 *
 *   1. A `where` naming a row of a list she cannot read. `list` resolves her words with `reads` and answers 0 rows
 *      whether the title exists or not; the preview resolved them against the whole record and drew 1 row for
 *      `client is Acme Redundancy Plan` and `REF_UNKNOWN` for `client is Nobody Ltd`.
 *   9. A figure over a list she cannot read. `metric` answers `METRIC_UNKNOWN` to it and to a name nobody declared; the
 *      preview answered `FORBIDDEN` to the first and drew the second, or refused it `DECLARATION_INVALID`.
 *   2. What one call costs. At `read` level, 24 cash walks at the horizon cap over 2,000 monthly rows took 18 to 35 s
 *      and answered 333.8 MB. `page` spends the same only on a body the owner installed.
 *
 * Every test here was run against the record before the repair and failed there; the outputs are in the report.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as recordModule from '../src/index.ts';
import type { CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

/* READ OFF THE MODULE RATHER THAN IMPORTED BY NAME, so that against a record without the ceilings each test fails on
   what it measures instead of the whole file failing to load. */
const { createRecordApi } = recordModule;
const ceiling = (name: string): number => (recordModule as unknown as Record<string, number | undefined>)[name] ?? Number.NaN;
const PREVIEW_WALKS_MOST = ceiling('PREVIEW_WALKS_MOST');
const PREVIEW_HORIZON_MOST = ceiling('PREVIEW_HORIZON_MOST');
const PREVIEW_ROWS_MOST = ceiling('PREVIEW_ROWS_MOST');
const PREVIEW_BYTES_MOST = ceiling('PREVIEW_BYTES_MOST');
const PREVIEW_WALK_ROWS_MOST = ceiling('PREVIEW_WALK_ROWS_MOST');
const PREVIEW_CURRENCIES_MOST = ceiling('PREVIEW_CURRENCIES_MOST');

const NOW = Date.UTC(2026, 8, 24, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });

/** The record with two more lists: Topics, which Wren reads and Notes points at, and Bills, a cash walk's leg. */
const DECLS = [
  reg('clients', 'Clients', 'name', [{ id: 'name', type: 'text', required: true }]),
  reg('diary', 'Diary', 'body', [{ id: 'body', type: 'text', required: true }]),
  reg('topics', 'Topics', 'name', [{ id: 'name', type: 'text', required: true }]),
  reg('notes', 'Notes', 'body', [
    { id: 'body', type: 'text', required: true },
    { id: 'client', type: 'ref', to: 'clients' },
    { id: 'topic', type: 'ref', to: 'topics' },
  ]),
  reg('bills', 'Bills', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', required: true },
    { id: 'repeats', type: 'enum', values: ['none', 'monthly'] },
    { id: 'client', type: 'ref', to: 'clients' },
    { id: 'topic', type: 'ref', to: 'topics' },
  ]),
  {
    id: 'metric.diary-count',
    kind: 'metric' as const,
    body: { metric: 'diary-count', name: 'Diary entries', source: 'register.diary', value: { count: 'body' }, format: 'int', target: { lte: 99 }, window: '30d' } as never,
  },
  /* A FIGURE OVER A LIST SHE READS, WHOSE PARAMETER IS A TITLE IN ONE SHE DOES NOT, as `project-open:<title>` is. */
  {
    id: 'metric.notes-for',
    kind: 'metric' as const,
    body: { metric: 'notes-for', name: 'Notes for', source: 'register.notes', where: 'client is {{it}}', value: { count: 'id' }, format: 'int', target: { lte: 5 }, window: '30d', compare: 'none' } as never,
  },
];

type Refusal = { code: string; fix: string; at?: string };
type Block = { kind: string; rows: unknown[]; matched: number; refusals: Refusal[]; walk?: { steps: unknown[] }; [k: string]: unknown };
type Answer = { ok: true; value: { blocks: Block[] } } | { ok: false; refusal: Refusal };

const value = (r: unknown): { blocks: Block[] } => {
  const x = r as Answer;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal.code}: ${x.refusal.fix}`);
  return x.value;
};

/** Wren is invited to Notes, Topics and Bills, and to nothing else: not Clients, not Diary. */
async function record(bills = 0, text = '', currencies: readonly string[] = ['USD']) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS as never);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const acme = await api.create({ register: 'clients', fields: { name: 'Acme Redundancy Plan' } }, owner);
  assert.ok(acme.ok);
  const pricing = await api.create({ register: 'topics', fields: { name: 'Pricing' } }, owner);
  assert.ok(pricing.ok);
  assert.ok((await api.create({ register: 'diary', fields: { body: 'Told Sam' } }, owner)).ok);
  assert.ok((await api.create({ register: 'notes', fields: { body: 'Call back', client: acme.value.id, topic: pricing.value.id } }, owner)).ok);
  assert.ok(
    api.kernel.create('bills', { what: 'Acme retainer', amount: { amount: 50000, currency: 'USD' }, due: '2026-10-01', repeats: 'monthly', client: acme.value.id }, { actor: 'p_1' }).ok,
  );
  for (let i = 0; i < bills; i++)
    assert.ok(api.kernel.create('bills', { what: `b${i}${text}`, amount: { amount: 100 + i, currency: currencies[i % currencies.length]! }, due: '2026-10-01', repeats: 'monthly' }, { actor: 'p_1' }).ok);
  assert.ok((await api.invite({ person: 'p_9', name: 'Wren', registers: { notes: 'read', topics: 'read', bills: 'read' } }, owner)).ok);
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const preview = async (blocks: unknown[], who: CallContext = wren): Promise<Answer> =>
    (await api.previewPage({ body: { page: 'probe', title: 'Probe', blocks } }, who)) as Answer;
  return { sql, api, wren, preview };
}

/** A cash walk over Bills, every row monthly. */
const walk = (horizon: number, where?: string, legs = 1) => ({
  kind: 'forecast',
  source: 'forecast.runway',
  from: Array.from({ length: legs }, () => ({ register: 'bills', on: 'due', amount: 'amount', every: { field: 'repeats', months: { monthly: 1 } }, ...(where ? { where } : {}) })),
  opening: 0,
  horizon,
});

test('A WHERE NAMING A ROW OF A LIST SHE CANNOT READ ANSWERS ALIKE WHETHER THE ROW EXISTS OR NOT, as `list` answers it', async () => {
  const { sql, api, wren, preview } = await record();
  /* The three bodies. Before the repair: 1 row, then `REF_UNKNOWN` "there is no clients called Nobody Ltd.", twice. */
  const table = (where: string) => preview([{ kind: 'table', source: 'register.notes', where }]);
  const exists = await table('client is Acme Redundancy Plan');
  const made = await table('client is Nobody Ltd');
  const not = await table('client is not Nobody Ltd');
  assert.deepEqual(exists, made, 'a title that exists in Clients answered differently from one that does not');
  assert.deepEqual(exists, not);
  for (const b of value(exists).blocks) {
    assert.deepEqual(b.rows, [], 'a row was drawn by matching a title in a list she cannot read');
    assert.doesNotMatch(JSON.stringify(b), /Acme|Nobody/u);
  }
  /* THE CONTROL IS `list` ITSELF, which answers 0 rows to both, with no refusal telling them apart. */
  for (const where of ['client is Acme Redundancy Plan', 'client is Nobody Ltd']) {
    const listed = await api.list({ register: 'notes', where: where as never }, wren);
    assert.ok(listed.ok);
    assert.equal(listed.value.rows.length, 0);
  }

  /* AND A CASH WALK'S LEG IS A `where` TOO: the walk drew Acme's retainer for one title and refused the other. */
  const legExists = await preview([walk(30, 'client is Acme Redundancy Plan')]);
  const legMade = await preview([walk(30, 'client is Nobody Ltd')]);
  assert.deepEqual(legExists, legMade, 'a leg filtered by a hidden title answered differently from one filtered by a made-up title');
  assert.doesNotMatch(JSON.stringify(legExists), /Acme retainer/u);

  /* A SPOKEN ID IN A FIELD SHE READS, NAMING A LIST SHE DOES NOT: `diary#1` against `nosuch#1` must not say Diary exists. */
  const spokenHidden = await table('topic is diary#1');
  const spokenNone = await table('topic is nosuch#1');
  /* HER OWN WORDS COME BACK IN EACH, so they are set aside before the two are compared, as the figures' names are below. */
  const words = (r: Answer, said: string) => JSON.parse(JSON.stringify(r).replaceAll(said, 'X')) as unknown;
  assert.deepEqual(words(spokenHidden, 'diary#1'), words(spokenNone, 'nosuch#1'), 'a spoken id into a hidden list answered differently from one into no list');
  assert.doesNotMatch(JSON.stringify(spokenHidden), /diary(?!#1)/iu);
  /* AND IN A LEG. Held unchecked, `topic is diary#1` in a leg was held `FORBIDDEN` while `topic is nosuch#1` was walked
     and refused inside the walk as a topic nobody holds, so the leg said which lists this record keeps. */
  const legHidden = await preview([walk(30, 'topic is diary#1')]);
  const legNone = await preview([walk(30, 'topic is nosuch#1')]);
  assert.deepEqual(words(legHidden, 'diary#1'), words(legNone, 'nosuch#1'), 'a spoken id into a hidden list, in a leg, answered differently from one into no list');

  /* HER OWN LISTS STILL FILTER, or a repair that held every ref would pass: Topics is hers, and Pricing draws its note. */
  const own = value(await table('topic is Pricing'));
  assert.equal(own.blocks[0]!.rows.length, 1, JSON.stringify(own.blocks[0]));
  assert.deepEqual(own.blocks[0]!.refusals, []);
  /* AND THE OWNER, WHO READS CLIENTS, IS STILL DRAWN ACME'S NOTE AND TOLD NOBODY LTD IS NOBODY. */
  assert.equal(value(await preview([{ kind: 'table', source: 'register.notes', where: 'client is Acme Redundancy Plan' }], owner)).blocks[0]!.rows.length, 1);
  const ownerMade = value(await preview([{ kind: 'table', source: 'register.notes', where: 'client is Nobody Ltd' }], owner));
  assert.equal(ownerMade.blocks[0]!.refusals[0]?.code, 'REF_UNKNOWN');
  sql.close();
});

test('A FIGURE OVER A LIST SHE CANNOT READ AND A FIGURE NOBODY DECLARED ARE ONE ANSWER, as `metric` gives them', async () => {
  const { sql, api, wren, preview } = await record();
  /* `metric` is the reference: `METRIC_UNKNOWN` to both, in the same words. */
  const m1 = await api.metric({ metric: 'diary-count' }, wren);
  const m2 = await api.metric({ metric: 'nosuch-count' }, wren);
  assert.ok(!m1.ok && 'refusal' in m1 && !m2.ok && 'refusal' in m2);
  assert.equal(m1.refusal.code, 'METRIC_UNKNOWN');
  assert.equal(m1.refusal.fix.replace('diary-count', 'X'), m2.refusal.fix.replace('nosuch-count', 'X'));

  /* The bodies. Before the repair: `FORBIDDEN` against nothing, and `FORBIDDEN` against `DECLARATION_INVALID`. */
  const pairs: [unknown, unknown][] = [
    [{ kind: 'stat', cells: [{ metric: 'diary-count' }] }, { kind: 'stat', cells: [{ metric: 'nosuch-count' }] }],
    [{ kind: 'series', source: 'metric.diary-count' }, { kind: 'series', source: 'metric.nosuch-count' }],
    [
      { kind: 'note', text: 'Entries: {{diary-count}}' },
      { kind: 'note', text: 'Entries: {{nosuch-count}}' },
    ],
    /* AND A BODY THE LINT REFUSES. A `series` source takes no parameter, and the lint quotes the source it read: before
       the names were put back into its sentence, the hidden figure came back as `metric.unplaced-<hex>:q` and the unknown
       one as `metric.nosuch-count:q`, so the new name was itself the answer. */
    [
      { kind: 'series', source: 'metric.diary-count:q' },
      { kind: 'series', source: 'metric.nosuch-count:q' },
    ],
  ];
  for (const [known, unknown] of pairs) {
    const a = await preview([known]);
    const b = await preview([unknown]);
    assert.deepEqual(JSON.parse(JSON.stringify(a).replaceAll('diary-count', 'X')), JSON.parse(JSON.stringify(b).replaceAll('nosuch-count', 'X')), `${JSON.stringify(known)} answered differently from ${JSON.stringify(unknown)}`);
  }
  /* A FIGURE SHE READS, NAMED WITH A PARAMETER, IS A `where` SHE WROTE. Held unchecked,
     `notes-for:Acme Redundancy Plan` drew 1 and `notes-for:Nobody Ltd` a reading refused `REF_UNKNOWN`, "there is no
     clients called Nobody Ltd.", where `metric` answers 0 to both: the first case's oracle through a stat cell. The
     `metric` answers are the control. */
  for (const who of ['Acme Redundancy Plan', 'Nobody Ltd']) {
    const read = await api.metric({ metric: `notes-for:${who}` }, wren);
    assert.ok(read.ok && (read.value as { value?: unknown }).value === 0, JSON.stringify(read));
  }
  const cell = (who: string) => preview([{ kind: 'stat', cells: [{ metric: `notes-for:${who}` }] }]);
  const cellExists = await cell('Acme Redundancy Plan');
  const cellMade = await cell('Nobody Ltd');
  assert.deepEqual(
    JSON.parse(JSON.stringify(cellExists).replaceAll('Acme Redundancy Plan', 'X')),
    JSON.parse(JSON.stringify(cellMade).replaceAll('Nobody Ltd', 'X')),
    'a figure whose parameter is a hidden title answered differently from one whose parameter is a made-up title',
  );
  assert.doesNotMatch(JSON.stringify(cellExists), /"value":1/u);
  /* AND THE OWNER, WHO READS CLIENTS, IS STILL DRAWN THE ONE NOTE ABOUT ACME. */
  const ownerCell = value(await preview([{ kind: 'stat', cells: [{ metric: 'notes-for:Acme Redundancy Plan' }] }], owner));
  assert.equal((ownerCell.blocks[0]!.readings as { reading?: { value?: number } }[])[0]?.reading?.value, 1);

  /* AND THE OWNER IS STILL TOLD A FIGURE IS NOT THERE, since she reads every list and so every figure. */
  const ownerStat = value(await preview([{ kind: 'stat', cells: [{ metric: 'nosuch-count' }] }], owner));
  assert.equal((ownerStat.blocks[0]!.readings as { refusal?: Refusal }[])[0]?.refusal?.code, 'METRIC_UNKNOWN');
  sql.close();
});

test('WHAT ONE PREVIEW MAY DRAW IS BOUNDED, AND THE REFUSAL SAYS WHICH BOUND: cash walks, horizon, rows answered, bytes', async () => {
  /* The list: 2,000 monthly bills, the most one leg may carry. */
  const { sql, wren, preview } = await record(2000);

  /* THE HORIZON. `page` walks up to 3,650 days; a preview draws a walk no further than the ceiling, and says so on the
     block rather than running it. Before the repair this one block answered 128,000 steps and 13.9 MB. */
  const far = value(await preview([walk(3650)]));
  assert.equal(far.blocks[0]!.walk, undefined, 'a walk past the ceiling was run');
  assert.equal(far.blocks[0]!.refusals[0]?.code, 'OUT_OF_BOUNDS');
  assert.equal(far.blocks[0]!.refusals[0]?.at, 'horizon');
  assert.match(far.blocks[0]!.refusals[0]!.fix, new RegExp(`${PREVIEW_HORIZON_MOST}`, 'u'));
  assert.match(far.blocks[0]!.refusals[0]!.fix, /3,650/u, 'the sentence does not say what `page` allows');

  /* THE WALKS. The body: the block ceiling of walks. The first ones are drawn and the rest are held on the block. */
  const t = performance.now();
  const many = await preview(Array.from({ length: 24 }, () => walk(30)));
  const ms = performance.now() - t;
  const drawn = value(many);
  const walked = drawn.blocks.filter((b) => b.walk !== undefined);
  assert.equal(walked.length, PREVIEW_WALKS_MOST);
  const held = drawn.blocks.filter((b) => b.walk === undefined);
  assert.equal(held.length, 24 - PREVIEW_WALKS_MOST);
  for (const b of held) {
    assert.equal(b.refusals[0]?.code, 'OUT_OF_BOUNDS');
    assert.match(b.refusals[0]!.fix, /24 blocks/u, 'the sentence does not say what `page` allows');
  }
  assert.ok(Buffer.byteLength(JSON.stringify(many)) <= PREVIEW_BYTES_MOST);
  assert.ok(ms < 15_000, `24 walks took ${Math.round(ms)} ms`);

  /* THE ROWS ANSWERED, ACROSS THE BLOCKS. 24 tables of 500 is 12,000 rows, each block inside `page`'s own limit. */
  const tables = await preview(Array.from({ length: 24 }, () => ({ kind: 'table', source: 'register.bills', limit: 500 })));
  assert.equal(tables.ok, false, 'twenty-four tables of 500 rows were drawn');
  if (!tables.ok) {
    assert.equal(tables.refusal.code, 'OUT_OF_BOUNDS');
    assert.equal(tables.refusal.at, 'blocks');
    assert.match(tables.refusal.fix, new RegExp(PREVIEW_ROWS_MOST.toLocaleString('en-GB'), 'u'));
    assert.match(tables.refusal.fix, /12,000/u);
  }
  /* AND ONE TABLE OF 500 IS INSIDE EVERY BOUND, the control. */
  assert.equal(value(await preview([{ kind: 'table', source: 'register.bills', limit: 500 }])).blocks[0]!.rows.length, 500);
  sql.close();
});

test('A WALK IS BOUNDED BY WHAT IT READS, NOT ONLY BY HOW FAR IT LOOKS: legs and currencies, refused before the walk runs', async () => {
  /* THE LEGS. Held unchecked, one walk of twenty legs over 2,001 bills at 366 days ran 480,000 steps in 3.8 s and was
     refused only afterwards, on the rows it answered: a block count and a horizon bound nothing a leg multiplies. */
  {
    const { sql, preview } = await record(2000);
    const t = performance.now();
    const legs = value(await preview([walk(366, undefined, 20)]));
    const ms = performance.now() - t;
    const b = legs.blocks[0]!;
    assert.equal(b.walk, undefined, 'a walk reading past the ceiling was run');
    assert.equal(b.refusals[0]?.code, 'OUT_OF_BOUNDS');
    assert.equal(b.refusals[0]?.at, 'from');
    assert.match(b.refusals[0]!.fix, new RegExp(PREVIEW_WALK_ROWS_MOST.toLocaleString('en-GB'), 'u'));
    assert.match(b.refusals[0]!.fix, /2,000 rows a leg/u, 'the sentence does not say what `page` allows');
    assert.ok(ms < 1_500, `refusing twenty legs took ${Math.round(ms)} ms`);
    sql.close();
  }
  /* THE CURRENCIES. A walk over money in several currencies with no rate between them is one walk a currency, and each
     reads every leg again: held unchecked, 2,001 bills in 40 currencies took 6.5 s at 30 days and 19.1 s at 366, for
     one block, with the block and horizon ceilings met. */
  {
    const forty = 'USD EUR GBP EGP JPY CHF CAD AUD NZD SEK NOK DKK PLN CZK HUF RON BGN TRY ZAR BRL MXN ARS CLP COP PEN INR PKR BDT LKR NPR CNY HKD TWD KRW SGD MYR THB IDR PHP VND'.split(' ');
    const { sql, preview } = await record(2000, '', forty);
    const t = performance.now();
    const b = value(await preview([walk(366)])).blocks[0]!;
    const ms = performance.now() - t;
    assert.equal(b.walks, undefined, 'a walk in forty currencies was run');
    assert.equal(b.refusals[0]?.code, 'OUT_OF_BOUNDS');
    assert.equal(b.refusals[0]?.at, 'from');
    assert.match(b.refusals[0]!.fix, new RegExp(`at most ${PREVIEW_CURRENCIES_MOST} currencies`, 'u'));
    assert.match(b.refusals[0]!.fix, /40/u);
    assert.ok(ms < 1_500, `refusing forty currencies took ${Math.round(ms)} ms`);
    sql.close();
  }
  /* AND THE SHIPPED SHAPE IS INSIDE EVERY BOUND, the control: two walks over a few hundred monthly rows in two
     currencies, as `/p/money` walks 365 days and 30. */
  {
    const { sql, preview } = await record(300, '', ['USD', 'GBP']);
    const two = value(await preview([walk(365), walk(30)]));
    for (const b of two.blocks) {
      assert.deepEqual(b.refusals.filter((r) => r.code === 'OUT_OF_BOUNDS' && r.at === 'from'), []);
      assert.ok(b.walk !== undefined || Array.isArray(b.walks), JSON.stringify(b.refusals));
    }
    sql.close();
  }
});

test('THE BYTES OF THE ANSWER ARE BOUNDED TOO, for rows few enough to pass the row bound and long enough to be heavy', async () => {
  /* 800 bills whose titles are 4,000 bytes each: four tables of 500 is 2,000 rows, inside the row bound, and 8 MB. */
  const { sql, wren, preview } = await record(800, 'x'.repeat(4000));
  const heavy = await preview(Array.from({ length: 4 }, () => ({ kind: 'table', source: 'register.bills', limit: 500 })), wren);
  assert.equal(heavy.ok, false, 'an answer of 8 MB was sent');
  if (!heavy.ok) {
    assert.equal(heavy.refusal.code, 'OUT_OF_BOUNDS');
    assert.equal(heavy.refusal.at, 'blocks');
    assert.match(heavy.refusal.fix, /bytes/u);
    assert.match(heavy.refusal.fix, new RegExp(PREVIEW_BYTES_MOST.toLocaleString('en-GB'), 'u'));
  }
  sql.close();
});
