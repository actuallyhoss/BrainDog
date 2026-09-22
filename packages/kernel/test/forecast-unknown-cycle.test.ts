/**
 * A cycle the walk has no factor for, in the kernel's walk.
 *
 * `leg.every.months[value] ?? 0` READ AN UNKNOWN CYCLE AS ZERO, AND ZERO IS THE ONE-OFF PATH. Driven
 * before the repair against the record below: a £100 bill whose `repeats` is `weekly`, on a leg whose
 * table names only `monthly`, came out of a 60-day walk as ONE step of minus 10,000 and an empty
 * refusals list, where eight or nine weeks of it fall inside the window. Nothing on the screen could
 * tell that from a bill that really is paid once. Once any register can gain a value without a pack
 * release, that is the ordinary way for a leg to fall behind its register, and it is money missing
 * from the answer with nothing said. The metrics engine already refuses the same gap in a factor
 * table (`LOOKUP_MISSING`); the walk now says it too.
 *
 * THE ROW STAYS IN THE WALK ONCE. Dropping it would make the walk cheaper still, and the one charge
 * it certainly has is a real movement on a real day. The refusal is what tells the reader the rest
 * of it is not there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Leg, type Runway } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;
const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/* `weekly` IS A VALUE THE REGISTER HAS AND THE LEG DOES NOT, which is the whole of N6: the register
   was widened and the leg that walks it was not. */
const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day', index: true },
      { id: 'repeats', type: 'enum', values: ['none', 'monthly', 'weekly', 'once', 'toString'] },
    ],
  } as never,
};

const LEG: Leg = { register: 'obligations', on: 'due', amount: 'amount', every: { field: 'repeats', months: { monthly: 1 } } };

async function walk(rows: Record<string, unknown>[], leg: Leg = LEG): Promise<Runway> {
  const sql = openSqlite();
  try {
    const k = await openRecord(sql, fixedClock(NOW));
    assert.ok((await k.install([OBLIGATIONS])).ok);
    for (const fields of rows) assert.ok(k.create('obligations', fields, { actor: 'p_1' }).ok);
    const out = k.runway(500_000, [leg], 60);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value;
  } finally {
    sql.close();
  }
}

test('A CYCLE THE LEG HAS NO FACTOR FOR IS SAID, and the row is still in the walk once', async () => {
  const out = await walk([{ what: 'Cleaner', amount: gbp(10_000), due: day(3), repeats: 'weekly' }]);
  assert.deepEqual(
    out.steps.map((s) => [s.day, s.label, s.delta]),
    [[day(3), 'Cleaner', -10_000]],
    'the row was dropped, or walked as a cycle the leg never named',
  );
  assert.equal(out.refusals.length, 1, `the walk said nothing about weekly: ${JSON.stringify(out.refusals)}`);
  const [said] = out.refusals;
  assert.equal(said!.code, 'LOOKUP_MISSING');
  assert.equal(said!.at, 'every');
  assert.deepEqual(said!.allowed, ['monthly'], 'the refusal does not say which cycles the leg does read');
  /* THE SHAPE OF THE `truncated` SENTENCE: a count, the register, what is wrong, and what that does
     to the money. It names the value because the value is what somebody has to go and add. */
  assert.equal(
    said!.fix,
    '1 row of obligations has repeats set to weekly, which this walk has no cycle for, and its money is in the walk once rather than every time it recurs. Give weekly a whole number of months on this leg, or set the row to a cycle the leg has.',
  );
});

test('and it is one sentence per value, not one per row', async () => {
  const out = await walk([
    { what: 'Cleaner', amount: gbp(10_000), due: day(3), repeats: 'weekly' },
    { what: 'Window round', amount: gbp(2_000), due: day(4), repeats: 'weekly' },
  ]);
  assert.equal(out.steps.length, 2);
  assert.deepEqual(
    out.refusals.map((r) => r.fix.split(',')[0]),
    ['2 rows of obligations have repeats set to weekly'],
  );
  assert.match(out.refusals[0]!.fix, /their money is in the walk once/);
});

test('NONE AND AN EMPTY CYCLE ARE A ONE-OFF, AND SAY NOTHING, because that is exactly what they mean', async () => {
  const out = await walk([
    { what: 'Deposit', amount: gbp(30_000), due: day(2), repeats: 'none' },
    { what: 'Survey', amount: gbp(7_000), due: day(6) },
    { what: 'Rent', amount: gbp(50_000), due: day(10), repeats: 'monthly' },
  ]);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(
    out.steps.map((s) => s.label),
    ['Deposit', 'Survey', 'Rent', 'Rent'],
    'a declared cycle stopped recurring, or a one-off started',
  );
});

/* THE TWO SILENCES THE REPAIR CLAIMS, HELD. Deleting `recurs.of.length` from the count, or reading a
   table-named zero as unknown, left all three tests above green: the checker ran both mutations and
   neither went red. These two go red on each. */
test('A ROW WHOSE FIRST DAY IS PAST THE HORIZON IS MISSING NOTHING, and says nothing', async () => {
  const out = await walk([{ what: 'Cleaner', amount: gbp(10_000), due: day(90), repeats: 'weekly' }]);
  assert.deepEqual(out.steps, []);
  assert.deepEqual(out.refusals, [], 'a row with no step in this window was reported as money missing from it');
});

test('A CYCLE THE TABLE NAMES WITH A ZERO IS THE DECLARATION SAYING ONCE, and says nothing', async () => {
  const once: Leg = { ...LEG, every: { field: 'repeats', months: { monthly: 1, once: 0 } } };
  const out = await walk([{ what: 'Deposit', amount: gbp(30_000), due: day(2), repeats: 'once' }], once);
  assert.deepEqual(out.steps.map((s) => s.label), ['Deposit']);
  assert.deepEqual(out.refusals, []);
});

/* `toString` IS ON EVERY OBJECT'S PROTOTYPE, so a lookup by `in` or by plain indexing finds a
   function there and not a missing cycle. The table has to be asked what it owns. */
test('A CYCLE NAMED LIKE A PROTOTYPE KEY IS STILL A CYCLE THE TABLE DOES NOT HAVE', async () => {
  const out = await walk([{ what: 'Cleaner', amount: gbp(10_000), due: day(3), repeats: 'toString' }]);
  assert.deepEqual(out.steps.map((s) => [s.day, s.delta]), [[day(3), -10_000]]);
  assert.deepEqual(out.refusals.map((r) => r.code), ['LOOKUP_MISSING']);
  assert.match(out.refusals[0]!.fix, /repeats set to toString,/);
});
