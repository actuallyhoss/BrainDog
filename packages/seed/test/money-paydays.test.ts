/**
 * Paydays in Money: a repeating line's days of the month and its rule for a rest day, Money's rest
 * days, the leg that hands both to the walk, and the lines on a month's last day decided without a question.
 *
 * RED FIRST: with `day_of_month` and `weekend` out of `lists/recurring.ts`, the first test fails on the fields and the
 * create is refused; with `days` and `weekend` off the leg in `legs.ts`, the walk tests read the 1st and the 15th and
 * the Friday; with the 31st or the cadence check out of `scripts/last-day.js`, the script decides four lines.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { CASH_LEGS } from '../src/modules/money/legs.ts';
import { RECURRING_REGISTER } from '../src/modules/money/lists/recurring.ts';
import { readCashAhead } from './money-walk-page.ts';

/* THE SCRIPT IS PLAIN JAVASCRIPT, run in a sandbox as written, so it is imported by its URL and typed here by hand. */
type Row = { id: string; seq: number; version: number; fields: Record<string, unknown> };
type Ctx = { input: Record<string, unknown> | null; record: { list: (register: string, where: unknown) => Promise<Row[]> }; update: (id: string, fields: Record<string, unknown>, version: number) => void; log: (line: string) => void };
const script = (await import(new URL('../src/modules/money/scripts/last-day.js', import.meta.url).href)) as {
  default: (ctx: Ctx) => Promise<{ filled: number; last?: number; date?: number } | null>;
  LAST_DAY_SCRIPT: Record<string, unknown> & { source: string };
};

const OWNER = { actor: 'p_1' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

/** A record holding money-core as the pack document says it, and what it points at, with no example rows. */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  /* CASH TO WALK FROM, without which Cash ahead is not drawn. */
  value(k.create('accounts', { name: 'Current account', kind: 'bank', balance: gbp(1_000_000), as_of: '2026-09-01', liquid: true }, OWNER));
  return k;
}

/** The days a line called `what` walks on Cash ahead, the first `n` of them. */
function walked(k: Kernel, what: string, n: number): string[] {
  const walk = (readCashAhead(k) as unknown as { walk?: { steps: readonly { day: string; label: string }[] } }).walk;
  assert.ok(walk, 'Cash ahead draws no walk');
  return walk.steps.filter((s) => s.label === what).slice(0, n).map((s) => s.day);
}

const line = (what: string, next_due: string, more: Record<string, unknown> = {}) => ({ what, direction: 'in', amount: gbp(250_000), every: 'monthly', next_due, state: 'live', ...more });

test('a repeating line takes its days and its rest-day rule, Money starts on Saturday and Sunday, and the leg names both', async () => {
  const fields = RECURRING_REGISTER.fields as { id: string; type: string; values?: string[]; default?: unknown; max?: number }[];
  assert.deepEqual(fields.find((f) => f.id === 'day_of_month'), { id: 'day_of_month', label: 'Days of the month', type: 'text', max: 12 });
  const weekend = fields.find((f) => f.id === 'weekend');
  assert.deepEqual([weekend?.type, weekend?.values, weekend?.default], ['enum', ['leave', 'before', 'after'], 'leave']);
  assert.match(String(RECURRING_REGISTER.holds), /Next is the next payment, and the days of the month every one after it/u);

  const leg = CASH_LEGS.find((l) => l.register === 'recurring');
  assert.deepEqual([leg?.days, leg?.weekend], ['day_of_month', 'weekend'], 'the walk is not handed the fields');

  const k = await moneyCore();
  const config = value<{ values: Record<string, unknown>; config: Record<string, { type: string; default?: unknown }> }>(k.packConfig('money-core'));
  assert.deepEqual([config.config.rest_days?.type, config.config.rest_days?.default], ['list', ['Saturday', 'Sunday']]);

  const made = value<Row>(k.create('recurring', line('Salary', '2026-09-15', { day_of_month: '15, last' }), OWNER));
  assert.equal(made.fields.weekend, 'leave', 'a line as imported moves nothing');
  const refused = (fields: Record<string, unknown>) => (k.create('recurring', line('Bad', '2026-09-15', fields), OWNER) as { ok: boolean; refusal?: { code: string } }).refusal?.code;
  assert.equal(refused({ weekend: 'monday' }), 'ENUM_VALUE_UNKNOWN');
  assert.equal(refused({ day_of_month: 'the fifteenth and the last' }), 'OUT_OF_BOUNDS');
});

test('a line on "15, last" walks the 15th and each month\'s own last day, and one on the 30th stays on the 30th', async () => {
  const k = await moneyCore();
  value(k.create('recurring', line('Salary, halves', '2026-09-15', { every: 'twice_monthly', day_of_month: '15, last' }), OWNER));
  value(k.create('recurring', line('Rent in', '2026-09-30', { day_of_month: '30' }), OWNER));
  assert.deepEqual(walked(k, 'Salary, halves', 5), ['2026-09-15', '2026-09-30', '2026-10-15', '2026-10-31', '2026-11-15']);
  assert.deepEqual(walked(k, 'Rent in', 3), ['2026-09-30', '2026-10-30', '2026-11-30']);
});

test('with rest days Friday and Saturday, a payday on Friday 30 October set to the working day before walks on Thursday 29', async () => {
  const k = await moneyCore();
  value(k.setPackConfig('money-core', { rest_days: ['Friday', 'Saturday'] }, { actor: 'p_1' }));
  value(k.create('recurring', line('Pay, moved', '2026-10-30', { day_of_month: '30', weekend: 'before' }), OWNER));
  value(k.create('recurring', line('Pay, kept', '2026-10-30', { day_of_month: '30' }), OWNER));
  assert.deepEqual(walked(k, 'Pay, moved', 1), ['2026-10-29']);
  assert.deepEqual(walked(k, 'Pay, kept', 1), ['2026-10-30']);
});

/* ── the question ───────────────────────────────────────────────────────── */

/** The one filter the script lists Repeating with: live, and monthly or longer. */
const LONGER = ['monthly', 'quarterly', 'yearly'];
const LISTED = { all: [{ field: 'state', is: 'live' }, { field: 'every', in: LONGER }] };

/** A script's `ctx` over rows held here: `list` keeps to `LISTED`, `update` writes into the rows. */
function ctxOver(rows: Row[], input: Record<string, unknown> | null = null) {
  const writes: [string, Record<string, unknown>, number][] = [];
  const ctx: Ctx = {
    input,
    record: {
      list: async (register, where) => {
        assert.equal(register, 'recurring');
        assert.deepEqual(where, LISTED);
        return rows.filter((r) => r.fields.state === 'live' && LONGER.includes(String(r.fields.every))).map((r) => structuredClone(r));
      },
    },
    update: (id, fields, version) => {
      writes.push([id, fields, version]);
      const row = rows.find((r) => `recurring#${r.seq}` === id);
      assert.ok(row && row.version === version, `${id} written at a version it does not hold`);
      Object.assign(row.fields, fields);
      row.version++;
    },
    log: () => {},
  };
  return { ctx, writes };
}

const HIS = (): Row[] =>
  [
    line('Salary', '2026-09-30'),
    line('Consulting', '2027-02-28'),
    line('Rent from the flat', '2026-06-30', { every: 'quarterly' }),
    line('Interest', '2026-10-31'),
    line('Pocket money', '2026-09-30', { every: 'weekly' }),
    line('Bonus', '2026-09-30', { day_of_month: '30' }),
    line('Old job', '2026-09-30', { state: 'paused' }),
    line('Hosting', '2026-09-15'),
  ].map((fields, i) => ({ id: `r${i + 1}`, seq: i + 1, version: 1, fields }));

test('lines on a month end are decided and never asked about: a yearly line or one with no history keeps its date, one paid on two month ends moves with them', async () => {
  const rows = [
    ...HIS(),
    { id: 'r9', seq: 9, version: 1, fields: line('Retainer', '2026-11-30', { started: '2026-04-30', last_paid: '2026-10-31' }) },
    { id: 'r10', seq: 10, version: 1, fields: line('Domain', '2027-02-28', { every: 'yearly', started: '2025-02-28', last_paid: '2026-02-28' }) },
    { id: 'r11', seq: 11, version: 1, fields: line('Metered bill', '2026-11-30', { last_paid: '2026-10-30' }) },
  ];
  const { ctx, writes } = ctxOver(rows);
  assert.deepEqual(await script.default(ctx), { filled: 6, last: 1, date: 5 });
  assert.deepEqual(
    writes.map((w) => [w[0], w[1].day_of_month]),
    [['recurring#1', '30'], ['recurring#2', '28'], ['recurring#3', '30'], ['recurring#9', 'last'], ['recurring#10', '28'], ['recurring#11', '30']],
  );
  assert.equal(await script.default(ctxOver(rows).ctx), null, 'a line that holds its days is decided again');
  const none = HIS().filter((r) => !['Salary', 'Consulting', 'Rent from the flat'].includes(String(r.fields.what)));
  assert.equal(await script.default(ctxOver(none).ctx), null);
});

test('an answer to a question asked before fills each line still open, the last day or that date', async () => {
  for (const [answer, filled] of [
    ['The last day', ['last', 'last', 'last']],
    ['That date', ['30', '28', '30']],
  ] as const) {
    const rows = HIS();
    const { ctx, writes } = ctxOver(rows, { answer });
    assert.deepEqual(await script.default(ctx), { filled: 3 });
    assert.deepEqual(writes.map((w) => [w[0], w[1].day_of_month]), [['recurring#1', filled[0]], ['recurring#2', filled[1]], ['recurring#3', filled[2]]]);
    assert.equal(await script.default(ctxOver(rows).ctx), null, `${answer}: decided again after the answer`);
  }
  const { ctx, writes } = ctxOver(HIS(), { answer: 'Both' });
  assert.equal(await script.default(ctx), null);
  assert.deepEqual(writes, [], 'an answer that is not one of the two filled something');
});

test('the declaration carries the script as a sandbox runs it, Repeating its only reach, and nothing to send anywhere', async () => {
  const d = script.LAST_DAY_SCRIPT;
  assert.deepEqual([d.script, d.pack, d.runs, d.reads, d.writes, d.egress, d.keys], ['last_day', 'money-core', { every: '1d', rule: true }, ['recurring'], ['recurring'], [], []]);
  const alone = (await import(`data:text/javascript,${encodeURIComponent(d.source)}`)) as typeof script;
  assert.deepEqual(await alone.default(ctxOver(HIS()).ctx), { filled: 3, last: 0, date: 3 });
});

test('the script asks a real record what it asks the one held here: its filter reads, and only live lines monthly or longer come back', async () => {
  const k = await moneyCore();
  for (const r of HIS()) value(k.create('recurring', r.fields, OWNER));
  const rows = value<{ rows: Row[] }>(k.list({ register: 'recurring', where: LISTED as never })).rows;
  const decided: string[] = [];
  const ctx: Ctx = { input: null, record: { list: async () => rows }, update: (id) => void decided.push(String(rows.find((r) => `recurring#${r.seq}` === id)?.fields.what)), log: () => {} };
  await script.default(ctx);
  assert.deepEqual(decided.toSorted(), ['Consulting', 'Rent from the flat', 'Salary']);
  assert.ok(!rows.some((r) => r.fields.every === 'weekly' || r.fields.state !== 'live'), 'the filter let a weekly or paused line through');
});

test('three days, "15, last, 3", fit the box and are said by the walk in one line, and the line walks by how often alone', async () => {
  const k = await moneyCore();
  value(k.create('recurring', line('Three days', '2026-09-15', { day_of_month: '15, last, 3' }), OWNER));
  assert.deepEqual(walked(k, 'Three days', 3), ['2026-09-15', '2026-10-15', '2026-11-15']);
  const said = JSON.stringify(readCashAhead(k)).match(/\d+ lines? of [^"]*could not read[^"]*/u)?.[0];
  assert.ok(said, 'three days walked in silence');
  assert.match(said, /^1 line of /u);
});
