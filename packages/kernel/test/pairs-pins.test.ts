/**
 * What a person's mark on a leg means, and which field can say a bare number's currency.
 *
 * `loop/research-batch-sixty-audit.md` findings 3 and 6, driven with the audit's own probes (X1, X2, X2b). `974319fb`
 * made any mark a person wrote "his" and took the row out of the pairing for good. Two ordinary flows then counted money
 * that only moved: a transfer he typed and ticked before the bank sent the other leg (X2, GBP 4,000.00 read as received),
 * and a row an agent sent back whole with `moved: false` carried along unchanged (X2b, the same 4,000.00). Both were right
 * on `974319fb^`. And the currency guard asked only whether `on` held some text, enum or ref, so `state` passed it and
 * EGP -1000 paired with USD +1000 (X1).
 *
 * X2b AND X1 ARE MENDED HERE, AND X2 IS NOT, ON PURPOSE. A ticked transfer and a ticked card bill are the same write, a
 * person's `true` on an out leg with a bank line of the same size arriving beside it, and `41 §13 #10` says a
 * person-pinned mark skips the pairing whichever way it is pinned. The first attempt at this (held61) let a pinned `true`
 * take a partner, and it turned `pairs-undo.test.ts`'s P3b red (the card bill took the REFUND) and
 * `packages/seed/test/money-pairs.test.ts`'s sample record red (its two typed legs paired each other). So X2 below holds
 * the rule as the spec states it and names what it costs, and changing it is the owner's call.
 *
 * EVERY FIGURE HERE IS READ THE WAY THE LEDGER PAGE READS IT, as `pairs-undo.test.ts` reads it: `k.list` with Money's
 * `received-30d` sentence minus the date window.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const PERSON = { actor: 'p_1' };
const BANK = { actor: 'ingest:bank' };
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/* ─────────────── finding 6: the currency guard ─────────────── */

/** `02 §5`'s signed shape over an `int`, with `on` and the fields it may name handed in. */
const POSTINGS = (on: string[], extra: Record<string, unknown>[] = []): Declaration => ({
  id: 'register.postings',
  kind: 'register',
  body: {
    id: 'postings',
    name: 'Postings',
    title: 'what',
    pairs: { on, opposite: 'amount', across: 'account', within: '4d', mark: 'moved' },
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'booked', type: 'day', required: true },
      { id: 'amount', type: 'int', required: true },
      { id: 'currency', type: 'text', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared'], default: 'cleared' },
      { id: 'moved', type: 'bool', default: false },
      ...extra,
    ],
  } as never,
});

test('X1: AN ENUM THAT IS NOT A CURRENCY DOES NOT PASS THE CURRENCY GUARD, so EGP -1000 never pairs with USD +1000', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  /* `state` IS NOT A CURRENCY, and it is what every row that counts holds alike. Before the repair this installed and
     paired the two rows below: `{ installed: true, paired: true }`. */
  const installed = (await k.install([POSTINGS(['state', 'abs(amount)'])])) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  if (installed.ok) {
    const egp = made(k.create('postings', { what: 'CIB OUT', booked: DAY(0), amount: -1000, currency: 'EGP', account: 'cib', state: 'cleared' }, BANK));
    const usd = made(k.create('postings', { what: 'WISE IN', booked: DAY(1), amount: 1000, currency: 'USD', account: 'wise', state: 'cleared' }, BANK));
    assert.notEqual(k.get(egp.id)!.fields._pair, usd.id, 'EGP -1000 and USD +1000 were paired and both left the figures');
  }
  assert.equal(installed.ok, false, 'an enum of pending and cleared was taken as the currency');
  assert.equal(installed.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(installed.refusal?.at, 'pairs.on');
  /* THE FIX NAMES THE FIELDS THAT COULD SAY IT, and `state` is not one of them. */
  assert.ok(installed.refusal?.fix.includes('currency'), installed.refusal?.fix);
});

test('X1b: A REF IS REFUSED AND AN ENUM OF CODES INSTALLS, because one holds a row id and the other a currency', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const ref = (await k.install([POSTINGS(['bank', 'abs(amount)'], [{ id: 'bank', type: 'ref', to: 'postings' }])])) as {
    ok: boolean;
    refusal?: { at?: string };
  };
  assert.equal(ref.ok, false, 'a ref was taken as the currency');
  assert.equal(ref.refusal?.at, 'pairs.on');

  const codes = await k.install([POSTINGS(['ccy', 'abs(amount)'], [{ id: 'ccy', type: 'enum', values: ['EGP', 'USD', 'GBP'] }])]);
  assert.ok(codes.ok, JSON.stringify(codes));
});

test('X1c: A TEXT IN `on` PAIRS ONLY ROWS WHOSE TEXT IS A CURRENCY, so a text naming anything else is no currency', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  /* A TEXT CAN HOLD ANYTHING, so the declaration is taken at its word and each row is held to it. `note` here holds
     the same word on both rows and says nothing about which money they are in. */
  assert.ok((await k.install([POSTINGS(['note', 'abs(amount)'], [{ id: 'note', type: 'text' }])])).ok);
  const post = (what: string, booked: string, amount: number, currency: string, account: string, note: string) =>
    made(k.create('postings', { what, booked, amount, currency, account, note }, BANK));
  const egp = post('CIB OUT', DAY(0), -1000, 'EGP', 'cib', 'cleared');
  const usd = post('WISE IN', DAY(1), 1000, 'USD', 'wise', 'cleared');
  assert.equal(k.get(egp.id)!.fields._pair, undefined, 'two rows agreeing on a note that is no currency were paired');
  assert.equal(k.get(usd.id)!.fields._pair, undefined);

  /* AND THE SAME DECLARATION OVER `currency` STILL PAIRS, which is `02 §5`'s own example and `pairs.test.ts`'s SIGNED. */
  const j = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await j.install([POSTINGS(['currency', 'abs(amount)'])])).ok);
  const out = made(j.create('postings', { what: 'CIB OUT', booked: DAY(0), amount: -1000, currency: 'EGP', account: 'cib' }, BANK));
  const back = made(j.create('postings', { what: 'NBE IN', booked: DAY(1), amount: 1000, currency: 'EGP', account: 'nbe' }, BANK));
  assert.equal(j.get(out.id)!.fields._pair, back.id);
});

/* ─────────────── finding 3: a pin is a person's word, not a resend ─────────────── */

const LEDGER: Declaration = {
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    state: 'state',
    done: ['cleared', 'void'],
    pairs: { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved', where: { field: 'state', is: 'cleared' } },
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'category', type: 'text' },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
};

async function ledger(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([LEDGER])).ok);
  return k;
}

/** Money's `received-30d` without the window, in pence. */
const received = (k: Kernel): number =>
  (made(k.list({ register: 'ledger', where: 'state is cleared, moved is false, direction is in', limit: 500 })) as unknown as { rows: Entry[] }).rows.reduce(
    (n, r) => n + (r.fields.amount as { amount: number }).amount,
    0,
  );

test('X2: A LEG HE TICKED STAYS HIS AND PAIRS NOTHING (`41 §13 #10`), and the leg the bank sends later is counted: the cost of the rule', async () => {
  const k = await ledger();
  /* He types the transfer out of current and ticks "Between your own accounts", as the field's label invites. */
  const out = made(k.create('ledger', { what: 'TO SAVINGS', on: DAY(0), direction: 'out', amount: gbp(400_000), account: 'current', moved: true }, PERSON));
  const arrived = made(k.create('ledger', { what: 'FROM CURRENT', on: DAY(1), direction: 'in', amount: gbp(400_000), account: 'savings' }, BANK));
  assert.equal(k.get(out.id)!.fields.moved, true, 'his tick was written over');
  assert.equal(k.get(out.id)!.fields._pair, undefined);
  assert.equal(k.get(arrived.id)!.fields._pair, undefined);
  /* THE AUDIT'S MEASURE, KEPT: GBP 4,000.00 that only moved reads as received until he ticks the second leg too. With a
     pinned `true` let through as a partner (held61) this read 0, and P3b's card bill took a REFUND the same way. */
  assert.equal(received(k), 400_000);

  /* AND THE WAY OUT IS HIS, as it is for the card bill: he ticks the other leg as well, and neither is counted. */
  made(k.update('ledger', arrived.id, { moved: true }, PERSON));
  assert.equal(received(k), 0);
});

test('X2b: A WHOLE ROW SENT BACK WITH THE MARK CARRIED ALONG UNCHANGED IS NOT A PIN, and the row pairs when its leg arrives', async () => {
  const k = await ledger();
  const out = made(k.create('ledger', { what: 'TO SAVINGS', on: DAY(0), direction: 'out', amount: gbp(400_000), account: 'current' }, BANK));
  /* An agent speaking for him categorises the line and sends the row back whole, the mark unchanged. Before the repair:
     `{ pair: null, received: 4000 }`; the control naming `category` alone paired. */
  const whole: Record<string, unknown> = { ...k.get(out.id)!.fields, category: 'savings' };
  delete whole._pair;
  made(k.update('ledger', out.id, whole, PERSON));
  const arrived = made(k.create('ledger', { what: 'FROM CURRENT', on: DAY(1), direction: 'in', amount: gbp(400_000), account: 'savings' }, BANK));
  assert.equal(k.get(arrived.id)!.fields._pair, out.id, 'a patch that changed nothing about the mark pinned it');
  assert.equal(received(k), 0);
});

test('X2e: A WHOLE ROW SENT BACK WITH NOTHING CHANGED AT ALL IS NOT A PIN either, which the history alone cannot tell from his lone false', async () => {
  const k = await ledger();
  const out = made(k.create('ledger', { what: 'TO SAVINGS', on: DAY(0), direction: 'out', amount: gbp(400_000), account: 'current' }, BANK));
  /* THE CHECKER'S CASE AGAINST held61. An agent reads the row and writes it back as read. Nothing moved, so the write is
     one bare event and the mark's resend beside it, exactly the two rows P3b's lone `{ moved: false }` leaves; reading
     the history for "carried beside another field" found no other field and pinned it. Only the patch knows it named
     every field, so the write path decides. */
  const whole: Record<string, unknown> = { ...k.get(out.id)!.fields };
  delete whole._pair;
  made(k.update('ledger', out.id, whole, PERSON));
  const arrived = made(k.create('ledger', { what: 'FROM CURRENT', on: DAY(1), direction: 'in', amount: gbp(400_000), account: 'savings' }, BANK));
  assert.equal(k.get(arrived.id)!.fields._pair, out.id, 'a row sent back as it was read pinned its mark');
  assert.equal(received(k), 0);
});

test('X2c: A FALSE HE SET BY ITSELF IS NOT UNDONE BY A WHOLE ROW SENT BACK LATER, which carried his false along', async () => {
  const k = await ledger();
  const rent = made(k.create('ledger', { what: 'RENT', on: DAY(0), direction: 'out', amount: gbp(100_000), account: 'current' }, BANK));
  const client = made(k.create('ledger', { what: 'CLIENT', on: DAY(1), direction: 'in', amount: gbp(100_000), account: 'business' }, BANK));
  assert.equal(k.get(rent.id)!.fields._pair, client.id);

  /* HE SAYS THE RENT IS SPEND, and then an agent sends the rent back whole with a category. The carried `false` is not
     a new word from him, and it is not an old one withdrawn either: the pin he set stands. */
  made(k.update('ledger', rent.id, { moved: false }, PERSON));
  const whole: Record<string, unknown> = { ...k.get(rent.id)!.fields, category: 'rent' };
  delete whole._pair;
  made(k.update('ledger', rent.id, whole, PERSON));
  const later = made(k.create('ledger', { what: 'FROM CURRENT', on: DAY(0), direction: 'in', amount: gbp(100_000), account: 'savings' }, BANK));
  assert.equal(k.get(rent.id)!.fields.moved, false, 'his false was dropped by a resend that carried it');
  assert.equal(k.get(later.id)!.fields._pair, undefined);
});

test('X2d: A MARK HE CHANGES IN THE SAME WRITE AS ANOTHER FIELD IS HIS, so unticking a paired row while categorising it unpairs it', async () => {
  const k = await ledger();
  const rent = made(k.create('ledger', { what: 'RENT', on: DAY(0), direction: 'out', amount: gbp(100_000), account: 'current' }, BANK));
  const client = made(k.create('ledger', { what: 'CLIENT', on: DAY(1), direction: 'in', amount: gbp(100_000), account: 'business' }, BANK));
  assert.equal(k.get(rent.id)!.fields._pair, client.id);

  /* ONLY A MARK RESENT AS IT WAS IS PASSED OVER. With `markPinned`'s `from_v === to_v` dropped, this true-to-false,
     written in one batch beside the category, was read as carried: the pin fell through to the pairing's own `true`,
     the rent paired with the client again in the same write, and his false was written over. */
  made(k.update('ledger', rent.id, { category: 'rent', moved: false }, PERSON));
  assert.equal(k.get(rent.id)!.fields.moved, false, 'a false he set beside a category was written over');
  assert.equal(k.get(rent.id)!.fields._pair, undefined);
  assert.equal(k.get(client.id)!.fields._pair, undefined);
  assert.equal(received(k), 100_000);
});
