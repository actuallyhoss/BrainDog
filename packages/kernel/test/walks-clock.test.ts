/**
 * A held walk answers what a fresh kernel answers, at every moment of the day.
 *
 * THE CASE: a walk's window moves inside a day, because a step sits at noon of its day. A 5,000.00 bill due exactly 30 days
 * ahead, walked `out` within 30d: at 11:30 UTC it is outside, at 12:10 it is in. Held on its lists and the day, the 12:10 read
 * answered 0 and a fresh kernel 500000. So each moment here is asked of the kernel holding and of a new one over the same rows,
 * in a record with no zone, one ahead of UTC and one behind it, by figure and by forecast block.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { walkMovesAt } from '../src/forecast.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 8, 20, 0, 0);
const P = { actor: 'p_owner' };
const money = (amount: number) => ({ amount, currency: 'EGP' });

const register = (id: string, title: string, fields: unknown[]): Declaration => ({ id: `register.${id}`, kind: 'register', body: { id, name: id, title, fields } }) as never;
const metric = (body: Record<string, unknown>): Declaration => ({ id: `metric.${String(body.metric)}`, kind: 'metric', body }) as never;

const ACCOUNTS = register('accounts', 'name', [
  { id: 'name', type: 'text', required: true },
  { id: 'balance', type: 'money' },
  { id: 'as_of', type: 'day', index: true },
]);
const TRANSACTIONS = register('transactions', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'account', type: 'ref', to: 'accounts', index: true },
  { id: 'on', type: 'day', index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
]);
const BILLS = register('bills', 'what', [
  { id: 'what', type: 'text', required: true },
  { id: 'direction', type: 'enum', values: ['in', 'out'], index: true },
  { id: 'amount', type: 'money', required: true },
  { id: 'next_due', type: 'day', index: true },
]);
const LEGS = [{ register: 'bills', on: 'next_due', amount: 'amount', incoming: { field: 'direction', is: 'in' } }];
const CASH = {
  metric: 'cash',
  name: 'Cash now',
  source: 'register.accounts',
  value: { rolled: { balance: 'balance', as_of: 'as_of', moves: { register: 'transactions', by: 'account', on: 'on', amount: 'amount', direction: 'direction', out: 'out' } } },
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};
const walk = (id: string, value: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ metric: id, name: id, source: 'forecast.runway', legs: LEGS, value, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none', ...more });
const OUT = walk('out-30d', { walk: 'out', within: '30d' });
const DAYS = walk('lasts', { walk: 'days_to_zero' }, { opening: { metric: 'cash' }, format: 'days' });
const ON = walk('runs-out', { walk: 'zero_on' }, { opening: { metric: 'cash' }, format: 'day' });
const FORECAST = { kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash' }, from: LEGS, horizon: 30 };

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

async function made(tz?: string) {
  const sql = openSqlite();
  const clock = fixedClock(START);
  const held = await openRecord(sql, clock);
  if (tz !== undefined) held.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAY', slug: 'the-studio', name: 'The Studio', tz, locale: 'en', owner: { id: 'p_owner' } });
  const installed = await held.install([ACCOUNTS, TRANSACTIONS, BILLS, metric(CASH), metric(OUT), metric(DAYS), metric(ON)]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(held.create('accounts', { name: 'Current', balance: money(1_000_000), as_of: iso(START - DAY) }, P).ok);
  /* A bill on each of the days the window's edge can reach, and one that takes the money under. */
  for (const ahead of [28, 29, 30, 31, 32])
    assert.ok(held.create('bills', { what: `Due in ${ahead}`, direction: 'out', amount: money(500_000 + ahead), next_due: iso(START + ahead * DAY) }, P).ok);
  const fresh = () => openRecord(sql, clock);
  return { sql, clock, held, fresh };
}

const read = (k: Kernel, decl: Record<string, unknown>) => {
  const r = k.metric(decl as never);
  assert.ok(r.ok, JSON.stringify(r));
  return r.value.value;
};
const drawn = (k: Kernel) => {
  const out = k.block(FORECAST as never) as unknown as { refusals: unknown[]; walk?: { steps?: unknown[] } };
  assert.deepEqual(out.refusals, []);
  assert.ok(out.walk !== undefined, JSON.stringify(out).slice(0, 300));
  return JSON.stringify(out);
};

for (const tz of [undefined, 'Africa/Cairo', 'America/New_York', 'Pacific/Auckland']) {
  test(`A HELD WALK ANSWERS AS A FRESH ONE AT EVERY MOMENT OF TWO DAYS (${tz ?? 'no zone'})`, async () => {
    const { clock, held, fresh } = await made(tz);
    /* Every twenty minutes, and on each side of each edge of the clock. */
    const moments: number[] = [];
    for (let t = START; t < START + 2 * DAY; t += HOUR / 3) moments.push(t);
    for (const edge of [START, START + 12 * HOUR, START + DAY, START + 36 * HOUR]) moments.push(edge - 1, edge, edge + 1);
    moments.sort((a, b) => a - b);
    for (const t of moments) {
      clock.set(t);
      const now = await fresh();
      const at = new Date(t).toISOString();
      for (const decl of [OUT, DAYS, ON]) assert.equal(read(held, decl), read(now, decl), `${String(decl.metric)} at ${at}`);
      assert.equal(drawn(held), drawn(now), `the forecast block at ${at}`);
    }
  });
}

test('THE CASE ITSELF: a bill due in exactly 30 days, 11:30 and then 12:10 UTC', async () => {
  const sql = openSqlite();
  const eleven = Date.UTC(2026, 8, 20, 11, 30);
  const clock = fixedClock(eleven);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([BILLS, metric(OUT)])).ok);
  assert.ok(k.create('bills', { what: 'Tax', direction: 'out', amount: money(500_000), next_due: iso(eleven + 30 * DAY) }, P).ok);
  assert.equal(read(k, OUT), 0);
  clock.set(Date.UTC(2026, 8, 20, 12, 10));
  assert.equal(read(k, OUT), 500_000);
});

test('WITHIN THE HALF DAY IT IS STILL HELD, so the saving stands where nothing can move it', async () => {
  const { sql, clock, held } = await made();
  const seen: string[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (seen.push(q), all(q, ...a))) as typeof sql.all;
  const legRows = () => seen.filter((q) => /SELECT id FROM entry WHERE register = \?/u.test(q)).length;
  clock.set(START + 10 * HOUR);
  const first = read(held, OUT);
  seen.length = 0;
  clock.set(START + 10.75 * HOUR);
  assert.equal(read(held, OUT), first);
  assert.equal(legRows(), 0, 'a walk 45 minutes on, with no edge between, read its rows again');
  clock.set(START + 12 * HOUR);
  read(held, OUT);
  assert.ok(legRows() > 0, 'a walk past noon UTC was handed out from before it');
});

test('IN A ZONE A FIGURE\'S CLOCK STANDS AT NOON OF THE LOCAL DATE: held through noon UTC, walked again the next local day', async () => {
  const { sql, clock, held } = await made('Africa/Cairo');
  const seen: string[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (seen.push(q), all(q, ...a))) as typeof sql.all;
  const legRows = () => seen.filter((q) => /SELECT id FROM entry WHERE register = \?/u.test(q)).length;
  clock.set(START + 11.75 * HOUR);
  read(held, OUT);
  seen.length = 0;
  clock.set(START + 12.25 * HOUR);
  read(held, OUT);
  assert.equal(legRows(), 0, 'a figure whose clock stands still was walked again at noon UTC');
  clock.set(START + 30 * HOUR);
  read(held, OUT);
  assert.ok(legRows() > 0, 'the next local day was answered from the one before');
});

test('walkMovesAt: the next half day, and the millisecond of an edge is good for that millisecond', () => {
  assert.equal(walkMovesAt(START + HOUR), START + 12 * HOUR);
  assert.equal(walkMovesAt(START + 12 * HOUR + 1), START + 24 * HOUR);
  assert.equal(walkMovesAt(START), START + 1);
  assert.equal(walkMovesAt(START + 12 * HOUR), START + 12 * HOUR + 1);
});

test('A DRAW WITH A WALK IN IT IS STAMPED AGAIN WHEN THE CLOCK MOVES IT, and not before', async () => {
  const { clock, held } = await made();
  clock.set(START + HOUR);
  const seen = held.drawsOf(() => held.block(FORECAST as never)).seen!;
  assert.ok(seen, 'a draw with a walk in it was kept by nothing');
  const before = held.drawStamper()(seen);
  assert.ok(seen.until !== undefined, 'the draw does not know it moves with the clock');
  clock.set(START + 11 * HOUR);
  assert.equal(held.drawStamper()(seen), before, 'nothing moved it');
  clock.set(START + 12 * HOUR);
  assert.notEqual(held.drawStamper()(seen), before, 'noon UTC moved the walk and the stamp said it had not');
});
