/**
 * What a payment does to the thing it pays, one test an effect.
 *
 * `settle` IS THE DECISION AND `run` IS THE SCRIPT ROUND IT, and both are measured: the decision on plain fields, and
 * the script as a host's sandbox runs it, its declared `source` imported as a module and handed a `ctx`, the way
 * `last-day.test.ts` runs Money's other script. So a `source` that left `settle` out of its text fails here.
 *
 * RED FIRST: with no `scripts/settle.js` the file does not load; with `paid_so_far`, `paid_by`, `last_paid` or
 * `last_amount` off its list the test of the fields fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { INSTALLMENTS_REGISTER } from '../src/modules/money/lists/installments.ts';
import { OBLIGATIONS_REGISTER } from '../src/modules/money/lists/obligations.ts';
import { RECURRING_REGISTER } from '../src/modules/money/lists/recurring.ts';
import { SETTLE_SCRIPT, cycleOn, settle, type Settled } from '../src/modules/money/scripts/settle.js';

type Fields = Record<string, unknown>;
const row = (list: string, seq: number, fields: Fields) => ({ list, id: `e_${list}_${seq}`, spoken: `${list}#${seq}`, version: 3, fields });

const payment = (amount: number, on = '2026-10-01', more: Fields = {}) =>
  row('transactions', 12, { what: 'NORTHGATE ESTATES', direction: 'out', amount: gbp(amount), on, state: 'cleared', ...more });
const bill = (more: Fields = {}) => row('obligations', 4, { what: 'Studio rent', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open', ...more });
const part = (more: Fields = {}) =>
  row('installments', 2, { what: 'Desk, part 2', plan: 'Desk', direction: 'out', amount: gbp(400_000), due: '2026-10-01', state: 'open', ...more });
const rent = (more: Fields = {}) =>
  row('recurring', 7, { what: 'Rent', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live', ...more });

/** The one change a result makes to the thing paid, or a failure that says what came back instead. */
const changeTo = (out: Settled, spoken: string): Fields => {
  assert.ok('writes' in out, `no change came back: ${JSON.stringify(out)}`);
  const found = out.writes.find((w) => w.id === spoken);
  assert.ok(found, `nothing was written to ${spoken}`);
  return found.fields;
};

test('the three lists hold what a payment leaves behind, and none of it is indexed', () => {
  const field = (reg: { fields: readonly { id: string }[] }, id: string) => reg.fields.find((f) => f.id === id) as Fields | undefined;
  assert.deepEqual(field(OBLIGATIONS_REGISTER, 'paid_so_far'), { id: 'paid_so_far', label: 'Paid so far', type: 'money' });
  assert.deepEqual(field(INSTALLMENTS_REGISTER, 'paid_by'), { id: 'paid_by', label: 'Paid by', type: 'ref', to: 'transactions' });
  assert.deepEqual(field(RECURRING_REGISTER, 'last_paid'), { id: 'last_paid', label: 'Last paid', type: 'day' });
  assert.deepEqual(field(RECURRING_REGISTER, 'last_amount'), { id: 'last_amount', label: 'Last amount', type: 'money' });
});

test('a payment of the whole bill marks it paid, with the day the money moved', () => {
  const out = settle(bill(), payment(400_000, '2026-10-03'));
  assert.deepEqual(changeTo(out, 'obligations#4'), { state: 'paid', settled: '2026-10-03', paid_so_far: gbp(400_000) });
  /* THE LINK STAYS ON THE PAYMENT, since one bill can take several. */
  assert.deepEqual(changeTo(out, 'transactions#12'), { settles: 'e_obligations_4' });
});

test('a part payment says how much is paid so far and keeps the bill open', () => {
  const out = settle(bill(), payment(150_000));
  assert.deepEqual(changeTo(out, 'obligations#4'), { state: 'part', paid_so_far: gbp(150_000) });
});

test('a second part payment adds to the first and closes the bill when it reaches the amount', () => {
  const out = settle(bill({ state: 'part', paid_so_far: gbp(150_000) }), payment(250_000, '2026-10-20'));
  assert.deepEqual(changeTo(out, 'obligations#4'), { state: 'paid', settled: '2026-10-20', paid_so_far: gbp(400_000) });
});

test('a payment that already names its bill is not linked a second time', () => {
  const out = settle(bill(), payment(400_000, '2026-10-01', { settles: 'e_obligations_4' }));
  assert.ok('writes' in out);
  assert.deepEqual(out.writes.map((w) => w.id), ['obligations#4']);
});

test('an instalment takes the payment that paid it', () => {
  const out = settle(part(), payment(400_000, '2026-10-02'));
  assert.deepEqual(changeTo(out, 'installments#2'), { state: 'paid', settled: '2026-10-02', paid_by: 'e_transactions_12' });
});

test('a repeating line moves Next one cycle on and keeps the last day and amount', () => {
  const line = rent();
  const next = cycleOn(line.fields);
  assert.equal(next, '2026-11-01');
  const out = settle(line, payment(400_000, '2026-10-02'), { next });
  assert.deepEqual(changeTo(out, 'recurring#7'), { next_due: '2026-11-01', last_paid: '2026-10-02', last_amount: gbp(400_000) });
});

test('the day Next moves to is the walk\'s own: a month end stays a month end', () => {
  assert.equal(cycleOn(rent({ next_due: '2026-09-30', day_of_month: 'last' }).fields), '2026-10-31');
  assert.equal(cycleOn(rent({ every: 'weekly', next_due: '2026-10-01' }).fields), '2026-10-08');
  /* PAID EARLY, the line still moves from the day it named and not from the day the money moved. */
  const early = settle(rent(), payment(400_000, '2026-09-29'), { next: cycleOn(rent().fields) });
  assert.equal(changeTo(early, 'recurring#7').next_due, '2026-11-01');
});

test('an amount within 2 percent is the same payment, and the line keeps its amount', () => {
  const out = settle(rent(), payment(407_000), { next: '2026-11-01' });
  assert.deepEqual(changeTo(out, 'recurring#7'), { next_due: '2026-11-01', last_paid: '2026-10-01', last_amount: gbp(407_000) });
});

test('an amount more than 2 percent off asks, and changes no amount', () => {
  const out = settle(rent(), payment(420_000), { next: '2026-11-01' });
  assert.ok('ask' in out, `no question came back: ${JSON.stringify(out)}`);
  assert.ok(!('writes' in out), 'a question came with a change beside it');
  assert.equal(out.ask.question, 'Rent was GBP 4,200 this time, not GBP 4,000. Change the line?');
  assert.equal(out.ask.cause, 'money.settle.recurring#7');
  const [change, keep] = out.ask.options;
  assert.equal(change!.label, 'Change the line');
  assert.deepEqual(change!.patches, [
    { id: 'recurring#7', version: 3, fields: { next_due: '2026-11-01', last_paid: '2026-10-01', last_amount: gbp(420_000), amount: gbp(420_000) } },
  ]);
  /* ONLY THE ANSWER THAT SAYS SO CHANGES THE AMOUNT. */
  assert.equal(keep!.label, 'Keep GBP 4,000');
  assert.deepEqual(keep!.patches, [{ id: 'recurring#7', version: 3, fields: { next_due: '2026-11-01', last_paid: '2026-10-01', last_amount: gbp(420_000) } }]);
  assert.doesNotMatch(JSON.stringify(out.ask), /e_recurring|e_transactions|\u2014/u);
});

test('an instalment paid with another amount asks before it is marked paid', () => {
  const out = settle(part(), payment(450_000));
  assert.ok('ask' in out);
  assert.equal(out.ask.question, 'Desk, part 2 was GBP 4,500 this time, not GBP 4,000. Mark it paid?');
  assert.deepEqual(out.ask.options.map((o) => o.label), ['Mark it paid', 'Leave it open']);
  assert.deepEqual(out.ask.options[0]!.patches![0]!.fields, { state: 'paid', settled: '2026-10-01', paid_by: 'e_transactions_12' });
  assert.equal(out.ask.options[1]!.patches, undefined);
});

test('a bill paid more than 2 percent over asks, and one paid a little over is paid', () => {
  const over = settle(bill(), payment(440_000));
  assert.ok('ask' in over);
  assert.equal(over.ask.question, 'Studio rent was GBP 4,400 this time, not GBP 4,000. Mark it paid?');
  assert.deepEqual(changeTo(settle(bill(), payment(404_000)), 'obligations#4'), { state: 'paid', settled: '2026-10-01', paid_so_far: gbp(404_000) });
});

test('two currencies are never added or compared: nothing is written, and a sentence says why', () => {
  const out = settle(bill(), row('transactions', 12, { what: 'NORTHGATE', direction: 'out', amount: { amount: 400_000, currency: 'EGP' }, on: '2026-10-01' }));
  assert.ok('nothing' in out);
  assert.equal(out.nothing, 'Studio rent is in GBP and the payment is in EGP, so nothing was marked paid.');
});

test('money the other way, a thing already paid and a line with no day to move to change nothing', () => {
  assert.ok('nothing' in settle(bill({ direction: 'owed_to_me' }), payment(400_000)));
  assert.ok('nothing' in settle(bill({ state: 'paid' }), payment(400_000)));
  assert.ok('nothing' in settle(part({ state: 'cancelled' }), payment(400_000)));
  assert.ok('nothing' in settle(rent({ state: 'ended' }), payment(400_000), { next: '2026-11-01' }));
  assert.ok('nothing' in settle(rent(), payment(400_000)));
  /* THE SAME PAYMENT HANDED TWICE moves the line once. */
  assert.ok('nothing' in settle(rent({ next_due: '2026-11-01', last_paid: '2026-10-01' }), payment(400_000), { next: '2026-12-01' }));
});

test('a payment that already settles another bill pays nothing else', () => {
  const taken = payment(400_000, '2026-10-01', { settles: 'e_obligations_9' });
  for (const thing of [bill(), part(), rent()]) {
    const out = settle(thing, taken, { next: '2026-11-01' });
    assert.ok('nothing' in out, `a payment was counted twice: ${JSON.stringify(out)}`);
    assert.match(out.nothing, /^The payment already settles something else, so .+ was not marked paid\.$/u);
  }
  /* ITS OWN BILL'S PAYMENT pays no instalment or repeating line either. */
  assert.ok('nothing' in settle(part(), payment(400_000, '2026-10-01', { settles: 'e_obligations_4' })));
});

test('a part payment already counted is not written a second time', () => {
  const out = settle(bill({ state: 'part', paid_so_far: gbp(150_000) }), payment(150_000, '2026-10-01', { settles: 'e_obligations_4' }), { before: 0 });
  assert.ok('nothing' in out, `the same sum was written again: ${JSON.stringify(out)}`);
});

test('a bill several payments took too far says the sum as a sum', () => {
  const out = settle(bill({ state: 'part', paid_so_far: gbp(150_000) }), payment(300_000));
  assert.ok('ask' in out);
  assert.equal(out.ask.question, 'The payments for Studio rent come to GBP 4,500, not GBP 4,000. Mark it paid?');
});

test('a repeating line never moves back: a day that is not later than Next moves nothing', () => {
  for (const next of ['2026-10-01', '2026-09-01', 'soon', ''])
    assert.ok('nothing' in settle(rent(), payment(400_000), { next }), `Next moved to "${next}"`);
  /* NO LATER DAY AT ALL keeps the payment and leaves Next. */
  assert.deepEqual(changeTo(settle(rent(), payment(400_000), { next: null }), 'recurring#7'), { last_paid: '2026-10-01', last_amount: gbp(400_000) });
});

/**
 * A PAYMENT TAKEN BACK UNPAYS (batch 62). `before` is what the bill's other cleared payments come to, as `run` counts
 * it, and the bill is written back to that: counted, never subtracted.
 */
const voided = (amount: number, more: Fields = {}) => payment(amount, '2026-10-01', { settles: 'e_obligations_4', state: 'void', ...more });

test('a void payment reopens the bill it had paid, with nothing in Paid so far and no day', () => {
  const paidBill = bill({ state: 'paid', settled: '2026-10-01', paid_so_far: gbp(400_000) });
  const out = settle(paidBill, voided(400_000), { before: 0 });
  assert.deepEqual(changeTo(out, 'obligations#4'), { state: 'open', settled: null, paid_so_far: null });
  assert.equal((out as { said: string }).said, 'Studio rent is open again, since its payment was made void.');
  /* THE PAYMENT KEEPS ITS LINK, so the day it is cleared again it pays the same bill. */
  assert.equal((out as { writes: unknown[] }).writes.length, 1);
});

test('a void payment leaves the bill part paid with what its other payments come to', () => {
  const paidBill = bill({ state: 'paid', settled: '2026-10-02', paid_so_far: gbp(400_000) });
  const out = settle(paidBill, voided(250_000), { before: 150_000 });
  assert.deepEqual(changeTo(out, 'obligations#4'), { state: 'part', settled: null, paid_so_far: gbp(150_000) });
  assert.equal((out as { said: string }).said, 'Studio rent is part paid, GBP 1,500 of GBP 4,000, since one of its payments was made void.');
  /* A PART-PAID BILL LOSES THE SUM AND NOTHING ELSE: it had no day. */
  assert.deepEqual(changeTo(settle(bill({ state: 'part', paid_so_far: gbp(300_000) }), voided(150_000), { before: 150_000 }), 'obligations#4'), { paid_so_far: gbp(150_000) });
});

test('a bill already written back is not written a second time', () => {
  const said = { nothing: 'The payment for Studio rent was made void, so nothing was marked paid.' };
  assert.deepEqual(settle(bill(), voided(400_000), { before: 0 }), said);
  assert.deepEqual(settle(bill({ state: 'part', paid_so_far: gbp(150_000) }), voided(250_000), { before: 150_000 }), said);
});

test('a bill a person marked paid by hand is not reopened by a void payment', () => {
  /* NO "PAID SO FAR" ON A PAID BILL: no run of this script closed it. */
  assert.deepEqual(settle(bill({ state: 'paid', settled: '2026-10-01' }), voided(400_000), { before: 0 }), {
    nothing: 'Studio rent was marked paid by hand, so the payment that was made void changed nothing.',
  });
  assert.deepEqual(settle(bill({ state: 'written_off', paid_so_far: gbp(400_000) }), voided(400_000), { before: 0 }), { nothing: 'Studio rent is not open, so the payment changed nothing.' });
});

test('money that has not cleared marks nothing paid, whichever list it is handed for', () => {
  const pending = payment(400_000, '2026-10-01', { state: 'pending' });
  const said = (name: string) => ({ nothing: `The payment for ${name} has not cleared, so nothing was marked paid.` });
  /* NOT LINKED EITHER: a pending payment that names no bill is not given one. */
  assert.deepEqual(settle(bill(), pending, { before: 0 }), said('Studio rent'));
  assert.deepEqual(settle(part(), pending), said('Desk, part 2'));
  assert.deepEqual(settle(rent(), pending, { next: '2026-11-01' }), said('Rent'));
  /* A CLEARED PAYMENT THAT GOES BACK TO PENDING unpays as a void one does. */
  const back = settle(bill({ state: 'paid', settled: '2026-10-01', paid_so_far: gbp(400_000) }), payment(400_000, '2026-10-01', { state: 'pending', settles: 'e_obligations_4' }), { before: 0 });
  assert.equal((back as { said: string }).said, 'Studio rent is open again, since its payment has not cleared.');
});

/* Measured red before the guard: a bill part paid at 500 of 1,000 by hand, and a new pending payment
   naming it, came back `{ state: open, paid_so_far: null }` and "is open again". */
test('a Paid so far somebody typed is not wiped by a pending or void payment that paid none of it', () => {
  const half = bill({ amount: gbp(100_000), state: 'part', paid_so_far: gbp(50_000) });
  for (const state of ['pending', 'void']) {
    const out = settle(half, payment(30_000, '2026-10-01', { settles: 'e_obligations_4', state }), { before: 0 });
    assert.deepEqual(out, { nothing: `Studio rent has a Paid so far that somebody typed, so the payment that ${state === 'void' ? 'was made void' : 'has not cleared'} changed nothing.` });
  }
  /* AND A SUM THIS PAYMENT IS IN still goes back: 500 held, 300 from this one, 200 from the others. */
  assert.deepEqual(changeTo(settle(half, payment(30_000, '2026-10-01', { settles: 'e_obligations_4', state: 'void' }), { before: 20_000 }), 'obligations#4'), { paid_so_far: gbp(20_000) });
});

test('a void payment whose bill the others still pay in full keeps it paid, and with no count handed writes nothing', () => {
  const paidBill = bill({ state: 'paid', settled: '2026-10-02', paid_so_far: gbp(500_000) });
  const out = settle(paidBill, voided(100_000), { before: 400_000 });
  assert.deepEqual(changeTo(out, 'obligations#4'), { paid_so_far: gbp(400_000) });
  assert.equal((out as { said: string }).said, 'Studio rent still has GBP 4,000 paid, since one of its payments was made void.');
  assert.deepEqual(settle(paidBill, voided(100_000)), { nothing: 'The payment for Studio rent was made void, so nothing was marked paid.' });
});

/** The script's own text, run as a sandbox runs it: nothing but `ctx`. */
async function ran(rows: ReturnType<typeof row>[], input: Fields) {
  const writes: { spoken: string; patch: unknown; version: number }[] = [];
  const log: string[] = [];
  const shaped = (r: ReturnType<typeof row>) => ({ id: r.id, seq: Number(r.spoken.split('#')[1]), version: r.version, fields: r.fields });
  const ctx = {
    input,
    record: {
      get: async (spoken: string) => {
        const found = rows.find((r) => r.spoken === spoken);
        return found ? shaped(found) : null;
      },
      list: async (list: string, where: { field: string; is: unknown }) => rows.filter((r) => r.list === list && r.fields[where.field] === where.is).map(shaped),
    },
    update: (spoken: string, patch: unknown, version: number) => void writes.push({ spoken, patch, version }),
    log: (...words: string[]) => void log.push(words.join(' ')),
  };
  const mod = (await import(`data:text/javascript,${encodeURIComponent(SETTLE_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
  return { out: await mod.default(ctx), writes, log };
}

test('the script is Money\'s own, fetches nothing, and writes only the four lists a payment touches', () => {
  assert.equal(SETTLE_SCRIPT.script, 'settle');
  assert.equal(SETTLE_SCRIPT.pack, 'money-core');
  assert.deepEqual(SETTLE_SCRIPT.egress, []);
  assert.deepEqual(SETTLE_SCRIPT.keys, []);
  assert.deepEqual(SETTLE_SCRIPT.runs, { rule: true });
  assert.deepEqual(SETTLE_SCRIPT.writes, ['obligations', 'installments', 'recurring', 'transactions']);
});

test('run as a sandbox runs it, the script writes the line at the version it read and says so by name', async () => {
  const { out, writes, log } = await ran([rent(), payment(400_000)], { payment: 'transactions#12', item: 'recurring#7', next: '2026-11-01' });
  assert.deepEqual(writes, [{ spoken: 'recurring#7', patch: { next_due: '2026-11-01', last_paid: '2026-10-01', last_amount: gbp(400_000) }, version: 3 }]);
  assert.deepEqual(out, { settled: 'recurring#7' });
  assert.deepEqual(log, ['Rent is paid for 1 October, and Next is 1 November.']);
});

test('run on a bill, the script counts every payment that names it, so a second run adds nothing twice', async () => {
  /* CLEARED, as the Ledger writes an entry: the sum counts money that has moved and nothing pending or void (settle-rule-60). */
  const first = row('transactions', 11, { what: 'NORTHGATE', direction: 'out', amount: gbp(150_000), on: '2026-09-20', settles: 'e_obligations_4', state: 'cleared' });
  const second = payment(250_000, '2026-10-01', { settles: 'e_obligations_4' });
  const open = bill({ state: 'part', paid_so_far: gbp(150_000) });
  const { writes } = await ran([open, first, second], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual(writes, [{ spoken: 'obligations#4', patch: { state: 'paid', settled: '2026-10-01', paid_so_far: gbp(400_000) }, version: 3 }]);
  /* AGAIN, on a bill whose `paid_so_far` already holds both: the sum is the payments', not the field plus one more. */
  const again = await ran([bill({ state: 'part', paid_so_far: gbp(400_000) }), first, second], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual((again.writes[0]!.patch as Fields).paid_so_far, gbp(400_000));
});

test('run on a void payment, the script counts the bill\'s other cleared payments and writes it back to that', async () => {
  const paidBill = bill({ state: 'paid', settled: '2026-10-02', paid_so_far: gbp(400_000) });
  const first = row('transactions', 11, { what: 'NORTHGATE ESTATES', direction: 'out', amount: gbp(150_000), on: '2026-09-28', state: 'cleared', settles: 'e_obligations_4' });
  const second = payment(250_000, '2026-10-02', { settles: 'e_obligations_4', state: 'void' });
  const { writes, log } = await ran([paidBill, first, second], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual(writes, [{ spoken: 'obligations#4', patch: { state: 'part', settled: null, paid_so_far: gbp(150_000) }, version: 3 }]);
  assert.deepEqual(log, ['Studio rent is part paid, GBP 1,500 of GBP 4,000, since one of its payments was made void.']);
  /* AGAIN, ON THE BILL AS THAT RUN LEFT IT: nothing. */
  const again = await ran([bill({ state: 'part', paid_so_far: gbp(150_000) }), first, second], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual(again.writes, []);
  /* A BILL CLOSED BY HAND is left, and the log says why. */
  const byHand = await ran([bill({ state: 'paid', settled: '2026-10-01' }), second], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual([byHand.writes, byHand.log], [[], ['Studio rent was marked paid by hand, so the payment that was made void changed nothing.']]);
});

/* AS THE RULE RUNS IT: the count comes from the Ledger here, not from the test. A bill of 1,000 with
   500 typed in "Paid so far" and no payment behind it, then a payment logged against it that has not moved. */
test('run on a new pending or void payment, the script leaves a Paid so far somebody typed and says so', async () => {
  const half = bill({ amount: gbp(100_000), state: 'part', paid_so_far: gbp(50_000) });
  for (const [state, why] of [['pending', 'has not cleared'], ['void', 'was made void']] as const) {
    const fresh = payment(30_000, '2026-10-01', { settles: 'e_obligations_4', state });
    const { out, writes, log } = await ran([half, fresh], { payment: 'transactions#12', item: 'obligations#4' });
    assert.deepEqual([out, writes], [null, []]);
    assert.deepEqual(log, [`Studio rent has a Paid so far that somebody typed, so the payment that ${why} changed nothing.`]);
  }
  /* A CLEARED PAYMENT BESIDE IT changes nothing: 200 cleared, and 200 with the 300 pending, are neither the 600 held, so the 600 was typed... */
  const cleared = row('transactions', 11, { what: 'NORTHGATE', direction: 'out', amount: gbp(20_000), on: '2026-09-20', settles: 'e_obligations_4', state: 'cleared' });
  const typed = bill({ amount: gbp(100_000), state: 'part', paid_so_far: gbp(60_000) });
  const beside = await ran([typed, cleared, payment(30_000, '2026-10-01', { settles: 'e_obligations_4', state: 'pending' })], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual([beside.writes, beside.log], [[], ['Studio rent has a Paid so far that somebody typed, so the payment that has not cleared changed nothing.']]);
  /* ...and a pending payment in another currency is still refused before the sum is looked at. */
  const euro = row('transactions', 12, { what: 'NORTHGATE', direction: 'out', amount: { amount: 30_000, currency: 'EUR' }, on: '2026-10-01', settles: 'e_obligations_4', state: 'pending' });
  const other = await ran([half, euro], { payment: 'transactions#12', item: 'obligations#4' });
  assert.deepEqual([other.writes, other.log], [[], ['Studio rent is in GBP and the payment is in EUR, so nothing was marked paid.']]);
});

test('run on an amount that is off, the script writes nothing and hands back the one question', async () => {
  const { out, writes } = await ran([rent(), payment(420_000)], { payment: 'transactions#12', item: 'recurring#7', next: '2026-11-01' });
  assert.deepEqual(writes, []);
  assert.equal((out as { ask: { question: string } }).ask.question, 'Rent was GBP 4,200 this time, not GBP 4,000. Change the line?');
});

test('run with a payment or a thing that is not there, the script writes nothing and says which', async () => {
  const { out, writes, log } = await ran([payment(400_000)], { payment: 'transactions#12', item: 'recurring#7' });
  assert.equal(out, null);
  assert.deepEqual(writes, []);
  assert.deepEqual(log, ['The thing this payment was to pay is no longer in the record, so nothing was marked paid.']);
});

/**
 * ON A RECORD HOLDING MONEY AS ITS PACK DOCUMENT SAYS IT, so the new fields are the lists' own, a filter on "Settles"
 * finds a bill's payments, and every change the script asks for is one the record takes.
 */
const OWNER = { actor: 'p_1' };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
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

test('on a record, a bill, an instalment and a repeating line each take what their payment did', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const made = (list: string, fields: Fields) => value<Entry>(k.create(list, fields, OWNER));
  const book = made('books', { name: 'Personal' }).id;
  const account = made('accounts', { name: 'Current', kind: 'bank', liquid: true, balance: gbp(1_000_000), as_of: '2026-10-01', book }).id;
  const paid = (amount: number, on: string, more: Fields = {}) => made('transactions', { what: 'NORTHGATE ESTATES', on, direction: 'out', amount: gbp(amount), account, state: 'cleared', ...more });
  const theBill = made('obligations', { what: 'Studio rent', direction: 'owed_by_me', amount: gbp(400_000), due: '2026-10-01', state: 'open' });
  const thePart = made('installments', { what: 'Desk, part 2', plan: 'Desk', direction: 'out', amount: gbp(90_000), due: '2026-10-05', state: 'open', account });
  const theLine = made('recurring', { what: 'Rent', direction: 'out', amount: gbp(400_000), every: 'monthly', next_due: '2026-10-01', state: 'live', account });

  /** The declared source, with `list`, `get` and `update` the kernel's own. */
  const settleOn = async (payment: Entry, item: Entry, list: string, next?: string | null) => {
    const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });
    const lists = new Map([[`transactions#${payment.seq}`, payment.id], [`${list}#${item.seq}`, item.id]]);
    const listOf = (spoken: string) => spoken.split('#')[0]!;
    const ctx = {
      input: { payment: `transactions#${payment.seq}`, item: `${list}#${item.seq}`, ...(next === undefined ? {} : { next }) },
      record: {
        get: async (spoken: string) => {
          const e = k.get(lists.get(spoken)!);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
      },
      update: (spoken: string, patch: Fields, version: number) => void value(k.update(listOf(spoken), lists.get(spoken)!, patch, { ...OWNER, version })),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(SETTLE_SCRIPT.source as string)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    return mod.default(ctx);
  };

  /* A BILL IN TWO PAYMENTS: part paid with the sum, then paid on the second one's day, each payment naming the bill. */
  const first = paid(150_000, '2026-09-28');
  await settleOn(first, theBill, 'obligations');
  assert.equal(k.get(first.id)!.fields.settles, theBill.id);
  assert.deepEqual([k.get(theBill.id)!.fields.state, k.get(theBill.id)!.fields.paid_so_far], ['part', gbp(150_000)]);
  await settleOn(k.get(first.id)!, k.get(theBill.id)!, 'obligations');
  assert.deepEqual(k.get(theBill.id)!.fields.paid_so_far, gbp(150_000), 'the same payment was counted twice');
  await settleOn(paid(250_000, '2026-10-02'), k.get(theBill.id)!, 'obligations');
  const closed = k.get(theBill.id)!.fields;
  assert.deepEqual([closed.state, closed.settled, closed.paid_so_far], ['paid', '2026-10-02', gbp(400_000)]);

  const forPart = paid(90_000, '2026-10-05');
  await settleOn(forPart, thePart, 'installments');
  const part2 = k.get(thePart.id)!.fields;
  assert.deepEqual([part2.state, part2.settled, part2.paid_by], ['paid', '2026-10-05', forPart.id]);

  await settleOn(paid(400_000, '2026-10-01'), theLine, 'recurring', cycleOn(theLine.fields));
  const line = k.get(theLine.id)!.fields;
  assert.deepEqual([line.next_due, line.last_paid, line.last_amount, line.amount], ['2026-11-01', '2026-10-01', gbp(400_000), gbp(400_000)]);
});
