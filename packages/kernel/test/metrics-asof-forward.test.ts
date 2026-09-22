/**
 * A FORWARD window read as of a past day, over rows that already existed on that day.
 *
 * `5ae403ff` ENDED EVERY AS-OF WINDOW WITH A START AND NO END AT THE AS-OF DAY, and that is right only
 * for a window that looks back. `on after -30d` is thirty days up to the day asked about, and a row
 * dated after it had not happened yet. `due after today` is the other way round: its whole content
 * is dated after the day, so an end at the day leaves `due > asOf and due < asOf + 1`, which holds
 * nothing. Measured in `loop/research-batch-nineteen-audit.md` §5 over two open bills due 3 and 12
 * days after the as-of day, both written before it:
 *
 *     state is open, due after today   live on the day: 300000 | as of that day, read 60 days later: 0
 *     state is open, due after -1d     live on the day: 300000 | as of that day, read 60 days later: 0
 *
 * `snapshot` writes its series this way, so a person's own "owed from today" figure backfilled as a
 * line of zeros. The rule is now that the end is written only where the window's first day is before
 * the as-of day; a window that begins on the day or later is a question about what is coming, and a
 * live read on that day counted what was coming.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { evaluateMetric, openRecord, type Declaration, type EvalContext, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const AS_OF = NOW - 60 * DAY;
const day = (offset: number): string => new Date(AS_OF + offset * DAY).toISOString().slice(0, 10);

const BILLS: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
      /* A DEADLINE, as Bills, Obligations and five other shipped registers declare `due`. */
      { id: 'due', type: 'day', index: true, deadline: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

/* THE SCHEMA WITH THE REGISTER'S MARKER AS GIVEN, so a test can hand over the flag the kernel's own
   `schemaOf` now sends, the flag written `false`, or no flag at all. */
const schemaWith = (deadline: boolean | undefined): Schema => ({
  register: 'bills',
  state: 'state',
  fields: {
    what: { type: 'text' },
    amount: { type: 'money' },
    due: { type: 'day', ...(deadline === undefined ? {} : { deadline }) },
    state: { type: 'enum', values: ['open', 'paid'] },
  },
});

const owed = (where: string): MetricDecl => ({
  metric: 'owed-ahead',
  name: 'Owed ahead',
  source: 'register.bills',
  where,
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1_000_000 },
  window: '30d',
  compare: 'none',
});

/* Two open bills due 3 and 12 days after the as-of day: 100,000 and 200,000, the audit's 300,000. */
const AHEAD: ReadonlyArray<[number, number]> = [[3, 100_000], [12, 200_000]];

async function seeded(clockMs: number, rows: ReadonlyArray<[offset: number, amount: number]>) {
  const sql = openSqlite();
  const clock = fixedClock(clockMs);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([BILLS])).ok);
  for (const [offset, amount] of rows)
    assert.ok(k.create('bills', { what: `bill ${offset}`, amount: { amount, currency: 'GBP' }, due: day(offset), state: 'open' }, { actor: 'p_1' }).ok);
  return { k, sql, clock };
}

const reading = (r: unknown): Reading => {
  const x = r as { ok: boolean; value: Reading; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const asOf = (asOfMs: number, schema: Schema = schemaWith(true)): EvalContext => ({
  nowMs: NOW,
  asOfMs,
  schemaOf: (register) => (register === 'bills' ? schema : null),
});

for (const where of ['state is open, due after today', 'state is open, due after -1d'])
  test(`a forward window read as of a past day is what a live read gave on that day: ${where}`, async () => {
    const { k, sql } = await seeded(AS_OF, AHEAD);
    const live = reading(k.metric(owed(where)));
    sql.close();
    const past = await seeded(NOW, AHEAD);
    const backfilled = reading(evaluateMetric(past.sql, owed(where), asOf(AS_OF)));
    past.sql.close();
    assert.deepEqual({ live: live.value, backfilled: backfilled.value }, { live: 300_000, backfilled: 300_000 });
  });

/**
 * A window that begins before the as-of day, over a field the register declares a deadline.
 *
 * THIS TEST ONCE SAID SUCH A WINDOW ENDS AT THE AS-OF DAY, and over `due` that was the defect rather
 * than the rule. It asserted 1,000 for `due after -2d` because only the bill due on the day was
 * inside; but the two ahead were owed on that day as well, and a live read on it counted them. The
 * audit (`loop/research-batch-twenty-one-audit.md` §6) measured exactly this gap, and `isDeadline` in
 * `metrics.ts` closes it for a field whose register says `deadline: true`. The live figure is measured
 * here on a record opened on the as-of day, not copied, so the two numbers are one question asked
 * twice. `metrics-past-window.test.ts` holds the audit's own three bills.
 */
test('a deadline window that begins before the as-of day is what a live read gave on that day', async () => {
  const rows: ReadonlyArray<[number, number]> = [[0, 1_000], ...AHEAD];
  const then = await seeded(AS_OF, rows);
  const live = reading(then.k.metric(owed('state is open, due after -2d'))).value;
  then.sql.close();
  const { sql } = await seeded(NOW, rows);
  const backfilled = reading(evaluateMetric(sql, owed('state is open, due after -2d'), asOf(AS_OF))).value;
  sql.close();
  assert.deepEqual({ live, backfilled }, { live: 301_000, backfilled: 301_000 });
});

/* AND ONLY `true` IS A DEADLINE. A register that writes `deadline: false` is saying the field is a
   day something happened, and one that says nothing is saying the same; both keep the end at the
   as-of day, so the bills due after it are not counted. The string `'yes'` is what a truthy test
   would have let through: a hand-built schema is not checked by `declare`, and the flag decides
   whether rows that had not happened yet are counted. */
for (const [said, flag] of [['deadline: false', false], ['no deadline key', undefined], ["deadline: 'yes'", 'yes' as unknown as boolean]] as const)
  test(`a window that begins before the as-of day still ends at it with ${said}`, async () => {
    const { sql } = await seeded(NOW, [[0, 1_000], ...AHEAD]);
    const r = reading(evaluateMetric(sql, owed('state is open, due after -2d'), asOf(AS_OF, schemaWith(flag))));
    sql.close();
    assert.equal(r.value, 1_000);
  });

/**
 * THE RECORD'S OWN NIGHT, which reads the flag through the kernel's `schemaOf` and not a schema a test
 * built by hand. Every test above hands `evaluateMetric` its schema, so each passed while `schemaOf`
 * dropped `deadline` and no read through the record could reach `isDeadline`: with the flag dropped
 * this point was stored as 1,000, the bill due on the day alone.
 */
test('the night the record stores reads the deadline the register declared', async () => {
  const { k, sql, clock } = await seeded(NOW, []);
  /* The point stored at 00:05 on the 6th is the 5th's; the bills are dated from it. */
  const stored = '2026-09-05';
  const from = (offset: number): string => new Date(Date.parse(`${stored}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
  for (const [offset, amount] of [[0, 1_000], ...AHEAD] as const)
    assert.ok(k.create('bills', { what: `bill ${offset}`, amount: { amount, currency: 'GBP' }, due: from(offset), state: 'open' }, { actor: 'p_1' }).ok);
  const METRIC = { id: 'metric.owed-ahead', kind: 'metric', body: { ...owed('state is open, due after -2d'), snapshot: { grain: 'day' } } } as never;
  assert.ok((await k.install([BILLS, METRIC])).ok);
  const armed = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'snapshot' AND state = 'pending'")!;
  assert.equal(new Date(armed.due_at).toISOString(), '2026-09-06T00:05:00.000Z');
  clock.set(Date.parse(armed.due_at));
  assert.equal((await k.drain()).failed, 0);
  const point = sql.one<{ value: number }>("SELECT value FROM metric_point WHERE grain = 'day' AND at = ?", stored);
  sql.close();
  assert.equal(point?.value, 301_000);
});
