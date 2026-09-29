/**
 * `pairs:` finds the two legs of a transfer and marks both.
 *
 * MONEY MOVED BETWEEN TWO OF HIS OWN ACCOUNTS IS NOT SPENT, and the ledger counted it as spent. Every Ledger figure
 * says `transfer is false`, the field defaults to false, and the import writes a move between his accounts as two
 * ordinary rows, so until somebody marks both legs by hand the money leaving is spend and the money landing is income.
 * `02 §5` specifies the register option that finds them, and until this build it sat on `REGISTER_UNBUILT`, refused at
 * install as `NOT_IN_THIS_BUILD`.
 *
 * TWO SHAPES OF THE SAME RULE ARE DRIVEN HERE, because a ledger says which way money went in one of two ways. `02 §5`'s
 * own example signs the amount (`opposite: amount`, `-1000` and `+1000`); money-core keeps the amount positive and
 * says the way in an enum (`opposite: direction`, `out` and `in`), which is the declaration money-core gives `transactions`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const OWNER = { actor: 'p_1' };

/** money-core's shape: a positive amount, the way it went in `direction`, and `moved` for the mark. */
const LEDGER = (pairs: unknown = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved' }): Declaration => ({
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    pairs,
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
});

/** `02 §5`'s own example: a signed number, and a currency beside it that the pair must share. */
const SIGNED: Declaration = {
  id: 'register.postings',
  kind: 'register',
  body: {
    id: 'postings',
    name: 'Postings',
    title: 'what',
    pairs: { on: ['currency', 'abs(amount)'], opposite: 'amount', across: 'account', within: '4d', mark: 'moved' },
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'booked', type: 'day', required: true },
      { id: 'amount', type: 'int', required: true },
      { id: 'currency', type: 'text', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'moved', type: 'bool' },
    ],
  } as never,
};

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);

async function record(decls: Declaration[] = [LEDGER()]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install(decls);
  assert.ok(out.ok, JSON.stringify(out));
  return { k, sql };
}

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const leg = (k: Kernel, what: string, on: string, direction: 'in' | 'out', amount: number, account: string): Entry =>
  made(k.create('ledger', { what, on, direction, amount: gbp(amount), account }, OWNER));

const now = (k: Kernel, id: string): Entry => k.get(id)!;

test('AT HEAD `pairs:` IS REFUSED AT INSTALL, and after, a register declaring it installs', async () => {
  /* BEFORE PAIRING WAS BUILT BOTH WERE REFUSED, and this file's red run quoted the refusal: `NOT_IN_THIS_BUILD` at `pairs`,
     "ledger declares pairs, which the documents publish and this build reads nowhere, so it would install and be kept
     by nothing. The repair is a deploy, not an edit." */
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([LEDGER(), SIGNED]);
  assert.ok(out.ok, JSON.stringify(out));
});

test('TWO LEGS ONE DAY APART ARE PAIRED: both marked, each naming the other, and the write says so as events', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO RESERVE', DAY(0), 'out', 400_000, 'current');
  assert.equal(out.fields.moved, false, 'a leg with no partner yet was marked');
  assert.equal(out.fields._pair, undefined);

  const back = leg(k, 'TRANSFER FROM CURRENT', DAY(1), 'in', 400_000, 'reserve');
  /* THE ROW THE WRITE RETURNS IS THE ROW AS IT NOW STANDS, so a caller that created the second leg sees it paired. */
  assert.equal(back.fields.moved, true);
  assert.equal(back.fields._pair, out.id);
  const first = now(k, out.id);
  assert.equal(first.fields.moved, true);
  assert.equal(first.fields._pair, back.id);
  assert.equal(first.version, out.version + 1, 'the first leg changed without its version moving');

  /* ONE BATCH FOR THE WRITE AND WHAT IT CAUSED, and a row per field per leg, so "why is this marked" is answered by the
     history rather than by knowing the kernel does it. */
  const events = sql.all<{ target: string; kind: string; field: string | null; from_v: string | null; to_v: string | null; batch: string | null }>(
    "SELECT target, kind, field, from_v, to_v, batch FROM event WHERE field IN ('moved', '_pair') ORDER BY rowid",
  );
  assert.deepEqual(
    events.map((e) => [e.target, e.field, e.from_v, e.to_v]),
    [
      [`entry:${back.id}`, 'moved', 'false', 'true'],
      [`entry:${back.id}`, '_pair', null, JSON.stringify(out.id)],
      [`entry:${out.id}`, 'moved', 'false', 'true'],
      [`entry:${out.id}`, '_pair', null, JSON.stringify(back.id)],
    ],
  );
  const created = sql.one<{ id: string; batch: string | null }>("SELECT id, batch FROM event WHERE kind = 'create' AND target = ?", `entry:${back.id}`)!;
  const batch = created.batch ?? created.id;
  assert.ok(events.every((e) => e.batch === batch), 'the pairing is not in the batch of the write that caused it');
  sql.close();
});

test('PAIRED ONCE: of two equal rows, the nearer takes the leg and the other stays unmarked, whichever arrived first', async () => {
  const { k, sql } = await record();
  const a = leg(k, 'out', DAY(0), 'out', 50_000, 'current');
  const b = leg(k, 'in', DAY(1), 'in', 50_000, 'reserve');
  const c = leg(k, 'in again', DAY(0), 'in', 50_000, 'savings');
  /* THIS ONCE ASSERTED a WITH b, because b arrived first and a paired row was nobody's candidate. c is on a's own
     day and b a day off, so c is a's leg, and b, which first-come pairing had marked, is given back to Spent. */
  assert.equal(now(k, a.id).fields._pair, c.id);
  assert.equal(now(k, c.id).fields._pair, a.id);
  assert.equal(now(k, b.id).fields.moved, false);
  assert.equal(now(k, b.id).fields._pair, undefined);
  sql.close();
});

test('ZERO NEVER MATCHES, and neither do two legs in one account, one way, or two currencies', async () => {
  const { k, sql } = await record();
  const zero = [leg(k, 'nil out', DAY(0), 'out', 0, 'current'), leg(k, 'nil in', DAY(0), 'in', 0, 'reserve')];
  const same = [leg(k, 'a', DAY(0), 'out', 7_000, 'current'), leg(k, 'b', DAY(0), 'in', 7_000, 'current')];
  const oneWay = [leg(k, 'c', DAY(0), 'out', 8_000, 'current'), leg(k, 'd', DAY(0), 'out', 8_000, 'reserve')];
  const euros = made(k.create('ledger', { what: 'e', on: DAY(0), direction: 'in', amount: { amount: 9_000, currency: 'EUR' }, account: 'reserve' }, OWNER));
  const pounds = leg(k, 'f', DAY(0), 'out', 9_000, 'current');
  for (const row of [...zero, ...same, ...oneWay, euros, pounds])
    assert.equal(now(k, row.id).fields._pair, undefined, `${row.fields.what} was paired`);
  sql.close();
});

test('FIVE DAYS APART IS OUTSIDE A FOUR-DAY WINDOW, and four days is inside it', async () => {
  const { k, sql } = await record();
  const a = leg(k, 'out', DAY(0), 'out', 12_000, 'current');
  const b = leg(k, 'in', DAY(5), 'in', 12_000, 'reserve');
  assert.equal(now(k, a.id).fields._pair, undefined);
  assert.equal(now(k, b.id).fields._pair, undefined);

  const c = leg(k, 'out', DAY(10), 'out', 13_000, 'current');
  const d = leg(k, 'in', DAY(14), 'in', 13_000, 'reserve');
  assert.equal(now(k, c.id).fields._pair, d.id);
  sql.close();
});

test('A LEG WRITTEN LATER BY AN UPDATE IS PAIRED, and the nearest candidate is the one taken', async () => {
  const { k, sql } = await record();
  const far = leg(k, 'out, far', DAY(0), 'out', 30_000, 'current');
  const near = leg(k, 'out, near', DAY(3), 'out', 30_000, 'savings');
  const late = leg(k, 'in', DAY(20), 'in', 30_000, 'reserve');
  assert.equal(now(k, late.id).fields._pair, undefined);

  /* THE DATE WAS TYPED WRONG AND THEN FIXED. The fix touches `on`, so the row is looked at again. */
  const fixed = made(k.update('ledger', late.id, { on: DAY(2) }, OWNER));
  assert.equal(fixed.fields._pair, near.id, 'a day away was passed over for two days away');
  assert.equal(now(k, near.id).fields.moved, true);
  assert.equal(now(k, far.id).fields._pair, undefined);

  /* AN UPDATE TO A PAIRED ROW IS SETTLED AGAIN, as the ledger it leaves stands. This asserted the old pair held, which
     is the first-come rule, which hid the wrong row: a day from `far` and two from `near`, `late` is `far`'s leg now,
     and `near` is unmarked with the history saying so. */
  made(k.update('ledger', late.id, { on: DAY(1) }, OWNER));
  assert.equal(now(k, late.id).fields._pair, far.id);
  assert.equal(now(k, far.id).fields._pair, late.id);
  assert.equal(now(k, near.id).fields._pair, undefined);
  assert.equal(now(k, near.id).fields.moved, false);
  sql.close();
});

test('`02 §5`’S OWN EXAMPLE: a signed amount pairs with its negation, in the same currency only', async () => {
  const { k, sql } = await record([SIGNED]);
  const post = (what: string, booked: string, amount: number, currency: string, account: string) =>
    made(k.create('postings', { what, booked, amount, currency, account }, OWNER));
  const a = post('out', DAY(0), -1000, 'EGP', 'cib');
  /* THE SAME WAY IN ANOTHER ACCOUNT IS NOT A TRANSFER. Before this row the sign test in `pairs.ts` could be taken
     out and every assertion here still passed, because each candidate was already refused by currency or account. */
  const sameWay = post('out too', DAY(-1), -1000, 'EGP', 'nbe');
  const other = post('in, dollars', DAY(1), 1000, 'USD', 'hsbc');
  const b = post('in', DAY(2), 1000, 'EGP', 'hsbc');
  const c = post('in again', DAY(1), 1000, 'EGP', 'nbe');
  /* `c` IS A DAY FROM `a` AND `b` TWO, so `c` is the leg. This once asserted `b`, the first to arrive; the point that
     stands is that the one not taken stays unmarked. */
  assert.equal(now(k, a.id).fields._pair, c.id);
  assert.equal(now(k, c.id).fields.moved, true);
  assert.equal(now(k, other.id).fields._pair, undefined);
  assert.equal(now(k, b.id).fields._pair, undefined);
  assert.equal(now(k, b.id).fields.moved, false);
  assert.equal(now(k, sameWay.id).fields._pair, undefined, 'two payments out of two accounts were paired');
  sql.close();
});

test('THE DECLARATION IS CHECKED AS `02 §5` STATES IT, and each fault names the key', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const base = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved' };
  const cases: [unknown, string, string][] = [
    [{ ...base, mark: 'what' }, 'DECLARATION_INVALID', 'pairs.mark'],
    [{ ...base, mark: 'nothing' }, 'FIELD_UNKNOWN', 'pairs.mark'],
    [{ ...base, across: 'nowhere' }, 'FIELD_UNKNOWN', 'pairs.across'],
    [{ ...base, on: ['abs(nope)'] }, 'FIELD_UNKNOWN', 'pairs.on'],
    [{ ...base, on: [] }, 'DECLARATION_INVALID', 'pairs.on'],
    [{ ...base, on: ['what', 'account', 'on', 'abs(amount)'] }, 'DECLARATION_INVALID', 'pairs.on'],
    [{ ...base, on: ['what'] }, 'DECLARATION_INVALID', 'pairs.on'],
    [{ ...base, within: '4 days' }, 'DECLARATION_INVALID', 'pairs.within'],
    [{ ...base, date: 'what' }, 'DECLARATION_INVALID', 'pairs.date'],
    [{ ...base, opposite: 'what' }, 'DECLARATION_INVALID', 'pairs.opposite'],
    [{ ...base, colour: 'blue' }, 'DECLARATION_INVALID', 'pairs.colour'],
    ['yes', 'DECLARATION_INVALID', 'pairs'],
  ];
  for (const [pairs, code, at] of cases) {
    const out = (await k.install([LEDGER(pairs)])) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
    assert.equal(out.ok, false, `${JSON.stringify(pairs)} installed`);
    assert.equal(out.refusal?.code, code, `${JSON.stringify(pairs)}: ${out.refusal?.fix}`);
    assert.equal(out.refusal?.at, at, `${JSON.stringify(pairs)}: ${out.refusal?.fix}`);
  }

  /* `date` DEFAULTS TO THE SOLE DAY FIELD, so a register with two says which one the window runs over. */
  const twoDays = LEDGER();
  (twoDays.body as unknown as { fields: unknown[] }).fields.push({ id: 'cleared', type: 'day' });
  const said = (await k.install([twoDays])) as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(said.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(said.refusal?.at, 'pairs.date');
  (twoDays.body as unknown as { pairs: Record<string, unknown> }).pairs.date = 'on';
  const named = await k.install([twoDays]);
  assert.ok(named.ok, JSON.stringify(named));
});
