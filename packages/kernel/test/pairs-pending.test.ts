/**
 * A set of alike legs is matched as a whole only when the whole of it is in the ledger, and a leg left over is not a
 * reason to match none of it.
 *
 * Two cases, driven in the kernel's own shape. The first: EGP 20,000.00 out of CIB twice on the 10th, one half into
 * HSBC cleared and the other still pending, and a client paying EGP 20,000.00 into HSBC on the 12th. The pending half
 * is nobody's partner, so the set held two outs and two ins, and day order matched the client with the second out:
 * Received read EGP 0.00 against 20,000.00. When the bank cleared the half the set held three ins and two outs and
 * nothing paired at all. Before `57bf4ff7` every leg of it answered null. The second: the same halves all cleared, with
 * the client beside them, and the three-against-two set refused every pair, so Spent and Received each read EGP
 * 40,000.00 high.
 *
 * EVERY FIGURE HERE IS READ THE WAY THE LEDGER PAGE READS IT, as `pairs-ties.test.ts` reads it: `k.list` with Money's
 * `spent-30d` and `received-30d` sentences minus the date window.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const BANK = { actor: 'ingest:bank' };
const PERSON = { actor: 'p_1' };
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);

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
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'party', type: 'text' },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
};

/* MONEY-CORE'S OWN CLAUSE, as `packages/seed/src/modules/money.ts` writes it less the card bill's `settles`: a row
   that names who it was with is a payment to or from somebody and nobody's leg. */
const MONEY: Declaration = {
  ...LEDGER,
  body: {
    ...(LEDGER.body as object),
    pairs: {
      ...(LEDGER.body as { pairs: object }).pairs,
      where: { all: [{ field: 'state', is: 'cleared' }, { field: 'party', empty: true }] },
    },
  } as never,
};

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function ledger(decl: Declaration = LEDGER): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([decl])).ok);
  return k;
}

type Line = { what: string; on: string; direction: 'in' | 'out'; account: string; state?: 'pending' | 'cleared' | 'void'; party?: string; moved?: boolean };

/** Every line is EGP 20,000.00, the size of each half of the move. */
const write = (k: Kernel, lines: readonly Line[]): Record<string, string> =>
  Object.fromEntries(
    lines.map((l) => [
      l.what,
      made(
        k.create(
          'ledger',
          {
            what: l.what,
            on: l.on,
            direction: l.direction,
            amount: { amount: 2_000_000, currency: 'EGP' },
            account: l.account,
            state: l.state ?? 'cleared',
            ...(l.party === undefined ? {} : { party: l.party }),
            ...(l.moved === undefined ? {} : { moved: l.moved }),
          },
          l.moved === undefined ? BANK : PERSON,
        ),
      ).id,
    ]),
  );

/** Money's `spent-30d` or `received-30d` without the window, in whole pounds. */
const total = (k: Kernel, direction: 'in' | 'out'): number =>
  (made(k.list({ register: 'ledger', where: `state is cleared, moved is false, direction is ${direction}`, limit: 500 })) as unknown as { rows: Entry[] }).rows.reduce(
    (n, r) => n + (r.fields.amount as { amount: number }).amount / 100,
    0,
  );

/** Every row's partner by its `what`, so a failure prints the ledger as a person reads it. */
const partners = (k: Kernel, ids: Record<string, string>): Record<string, string | null> => {
  const name = new Map(Object.entries(ids).map(([what, id]) => [id, what]));
  return Object.fromEntries(
    Object.entries(ids).map(([what, id]) => {
      const to = k.get(id)!.fields._pair;
      return [what, typeof to === 'string' ? (name.get(to) ?? to) : null];
    }),
  );
};

const HALVES: readonly Line[] = [
  { what: 'CIB OUT 1', on: DAY(0), direction: 'out', account: 'cib' },
  { what: 'CIB OUT 2', on: DAY(0), direction: 'out', account: 'cib' },
  { what: 'HSBC IN 1', on: DAY(0), direction: 'in', account: 'hsbc' },
  { what: 'HSBC IN 2', on: DAY(0), direction: 'in', account: 'hsbc' },
];
const CLIENT: Line = { what: 'NILE DESIGN', on: DAY(2), direction: 'in', account: 'hsbc' };

/** The halves paired across the two banks and the client left counted, as a correct ledger reads a split move. */
function halvesPairedClientCounted(k: Kernel, ids: Record<string, string>, said: string): void {
  const got = partners(k, ids);
  assert.equal(got['NILE DESIGN'], null, `${said}: the client's payment was hidden as half of a move, ${JSON.stringify(got)}`);
  for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) {
    const to = got[what];
    assert.notEqual(to, null, `${said}: ${what} was left unpaired, ${JSON.stringify(got)}`);
    assert.equal(got[to!], what, `${said}: ${what} names ${to}, which does not name it back`);
    assert.notEqual(to, 'NILE DESIGN', `${said}: ${what} was paired with the client`);
  }
  assert.equal(total(k, 'out'), 0, `${said}: EGP 40,000.00 that only moved read as spent`);
  assert.equal(total(k, 'in'), 20_000, `${said}: Received is the client alone`);
}

test('A SPLIT MOVE PAIRS WITH AN UNRELATED LEG OF THE SAME SIZE IN ITS WINDOW, and that leg stays counted, in every order', async () => {
  /* Measured before the repair: every row null, Spent 40,000 and Received 60,000, because two outs against three ins
     left one in over and the set was refused whole. Only one in can be the one left over at no cost to any day, the
     client two days off, so which rows pair is in the ledger and not a guess. */
  for (const order of [
    [0, 1, 2, 3, 4],
    [4, 0, 1, 2, 3],
    [2, 4, 3, 1, 0],
  ]) {
    const k = await ledger();
    const lines = [...HALVES, CLIENT];
    const ids = write(
      k,
      order.map((i) => lines[i]!),
    );
    halvesPairedClientCounted(k, ids, order.join(', '));
  }
});

test('A HALF STILL PENDING KEEPS ITS SET FROM BEING MATCHED, so the client is not hidden in its place, and clearing it pairs the move', async () => {
  const k = await ledger();
  const ids = write(k, [HALVES[0]!, HALVES[1]!, HALVES[2]!, { ...HALVES[3]!, state: 'pending' }, CLIENT]);
  /* Measured before the repair: CIB OUT 2 named NILE DESIGN, so Received read 0.00 against 20,000.00. Answered leg by
     leg, as the build before `57bf4ff7` answered it, every row is tied or refused and all of it counts. */
  const pending = partners(k, ids);
  for (const [what, to] of Object.entries(pending)) assert.equal(to, null, `${what} was paired while a half was pending, ${JSON.stringify(pending)}`);
  assert.equal(k.get(ids['NILE DESIGN']!)!.fields.moved, false);
  assert.equal(total(k, 'in'), 40_000, 'the cleared half and the client, both counted');

  /* THE BANK CLEARS THE HALF. Measured before the repair: three ins against two outs, nothing paired, Spent 40,000.00
     and Received 60,000.00. */
  made(k.update('ledger', ids['HSBC IN 2']!, { state: 'cleared' }, BANK));
  halvesPairedClientCounted(k, ids, 'cleared');
});

test('A HALF STILL PENDING, IN THE OTHER ORDER: the pending half arriving after the client unpicks the match that hid it', async () => {
  const k = await ledger();
  const ids = write(k, [HALVES[0]!, HALVES[1]!, HALVES[2]!, CLIENT]);
  /* Two outs and two ins, and nothing in the ledger yet says the second in is missing: day order pairs the client, and
     that is a guess no rule over these four rows can refuse. What it owes is to take it back when the half turns up. */
  assert.equal(partners(k, ids)['NILE DESIGN'], 'CIB OUT 2');
  ids['HSBC IN 2'] = write(k, [{ ...HALVES[3]!, state: 'pending' }])['HSBC IN 2']!;
  for (const [what, to] of Object.entries(partners(k, ids))) assert.equal(to, null, `${what} kept a pair once the pending half arrived`);
  assert.equal(k.get(ids['NILE DESIGN']!)!.fields.moved, false);
  made(k.update('ledger', ids['HSBC IN 2']!, { state: 'cleared' }, BANK));
  halvesPairedClientCounted(k, ids, 'cleared');
});

test('A LEG HE SAID IS NOT A TRANSFER DOES NOT HOLD A SET BACK, though it fails to pair as a pending one does', async () => {
  /* His `false` is his word that the row is nobody's partner, so it is not a leg whose partner is still to come. Held
     back like a pending row, measured: his unticking the client left all four halves counted, Spent 40,000.00, which
     is the reverse of what he said. */
  const k = await ledger();
  const ids = write(k, [...HALVES, CLIENT]);
  made(k.update('ledger', ids['NILE DESIGN']!, { moved: false }, PERSON));
  halvesPairedClientCounted(k, ids, 'client unticked');
});

test('A VOID LEG IS NOT WAITING, because the register says void is final, so a voided attempt does not keep the halves counted', async () => {
  /* A half that bounced and was sent again: a void EGP 20,000.00 into HSBC the next day. Held back as a pending row is,
     measured: all five null, Spent and Received each EGP 40,000.00 high, and for good, since a void row never clears.
     `where` cannot say which of the rows it refuses are final and the register's `done:` can, so the kernel hands the
     matching the register's `state` and `done` with every `Pairing` it builds. */
  const k = await ledger();
  const ids = write(k, [...HALVES, { what: 'HSBC VOID', on: DAY(1), direction: 'in', account: 'hsbc', state: 'void' }]);
  const got = partners(k, ids);
  assert.equal(got['HSBC VOID'], null);
  for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) assert.notEqual(got[what], null, `${what} was left unpaired beside a void leg, ${JSON.stringify(got)}`);
  assert.equal(total(k, 'out'), 0);
  assert.equal(total(k, 'in'), 0);
});

test("A CLEARED PAYMENT THAT NAMES ITS PARTY DOES NOT HOLD A SPLIT MOVE BACK, under Money's own `where`, through `k.create`", async () => {
  /* THE CHECKER'S CASE AGAINST THE FIRST ATTEMPT. The kernel built its `Pairing` without the register's `state` and
     `done`, so every row `where` refused was taken for one that may yet clear, and a client's cleared EGP 20,000.00,
     refused only because it names Nile Design, held the whole set back. Measured on that attempt: all five null, Spent
     EGP 40,000.00 and Received 60,000.00 against 0.00 and 20,000.00. A cleared row is where it will stay, and so is a
     pending one that no final state would let through: naming its party refuses it cleared or not. */
  for (const state of ['cleared', 'pending'] as const) {
    const k = await ledger(MONEY);
    const ids = write(k, [...HALVES, { ...CLIENT, party: 'Nile Design', state }]);
    const got = partners(k, ids);
    assert.equal(got['NILE DESIGN'], null, `${state}: ${JSON.stringify(got)}`);
    for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2'])
      assert.notEqual(got[what], null, `${state}: ${what} was held back by a named payment, ${JSON.stringify(got)}`);
    assert.equal(total(k, 'out'), 0, `${state}: EGP 40,000.00 that only moved read as spent`);
    assert.equal(total(k, 'in'), state === 'cleared' ? 20_000 : 0, `${state}: Received is the client alone, once it has cleared`);
  }
  /* AND A BARE PENDING HALF STILL HOLDS IT, under this clause as under the plain one: cleared, it would be a leg. */
  const k = await ledger(MONEY);
  const ids = write(k, [HALVES[0]!, HALVES[1]!, HALVES[2]!, { ...HALVES[3]!, state: 'pending' }, CLIENT]);
  for (const [what, to] of Object.entries(partners(k, ids))) assert.equal(to, null, `${what} was paired while a half was pending`);
});

test('HIS `true` ON A LEG BESIDE A SPLIT MOVE DOES NOT HOLD THE SET BACK: the bank legs pair, his leg counts as moved', async () => {
  /* A third EGP 20,000.00 into HSBC the same day, which he typed and ticked. His ticked row used to hold the set back,
     since one of the outs might be its other leg; but a pinned row is never a partner, so the wait never resolved and
     the move was counted twice for good. So only a row the pairing's `where` refuses (pending) holds a pair back,
     because it clears on its own. */
  const k = await ledger();
  const ids = write(k, [...HALVES, { what: 'HSBC TYPED', on: DAY(0), direction: 'in', account: 'hsbc', moved: true }]);
  const got = partners(k, ids);
  assert.equal(got['HSBC TYPED'], null, 'his ticked leg is a partner of nothing');
  for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) assert.notEqual(got[what], null, `${what} was held back by his ticked leg, ${JSON.stringify(got)}`);
  assert.equal(k.get(ids['HSBC TYPED']!)!.fields.moved, true, 'his mark is his');
  assert.equal(total(k, 'out'), 0, 'the move read as spent');
  assert.equal(total(k, 'in'), 0, 'the move, or his ticked leg, read as received');
  /* HE UNTICKS IT, so it is income he typed, and the halves stay paired. */
  made(k.update('ledger', ids['HSBC TYPED']!, { moved: false }, PERSON));
  const after = partners(k, ids);
  assert.equal(after['HSBC TYPED'], null);
  for (const what of ['CIB OUT 1', 'CIB OUT 2', 'HSBC IN 1', 'HSBC IN 2']) assert.notEqual(after[what], null, `${what}: ${JSON.stringify(after)}`);
  assert.equal(total(k, 'in'), 20_000, 'his unticked row alone');
});

const CROSSED: readonly Line[] = [
  { what: 'X OUT', on: DAY(0), direction: 'out', account: 'x' },
  { what: 'Y OUT', on: DAY(0), direction: 'out', account: 'y' },
  { what: 'X IN', on: DAY(0), direction: 'in', account: 'x' },
  { what: 'Y IN', on: DAY(0), direction: 'in', account: 'y' },
  { what: 'Z IN', on: DAY(0), direction: 'in', account: 'z' },
];

test('WHICH LEG IS LEFT OVER IS A GUESS WHEN A CROSSING MATCHING LEAVES ANOTHER AT THE SAME COST, in every order', async () => {
  /* Outs from x and y, ins into x, y and z, one day, one size. An out may not take the in of its own account, so the
     feasible matchings are x to y with y to x (z over), x to y with y to z (x over) and x to z with y to x (y over),
     each costing no day. The first attempt counted only matchings taken first with first in account order, found the
     one with x over, and paired four rows: which account's in counted as income was decided by how the names sort. */
  for (const order of [
    [0, 1, 2, 3, 4],
    [4, 3, 2, 1, 0],
    [2, 0, 4, 1, 3],
  ]) {
    const k = await ledger();
    const ids = write(
      k,
      order.map((i) => CROSSED[i]!),
    );
    for (const [what, to] of Object.entries(partners(k, ids))) assert.equal(to, null, `${order.join(', ')}: ${what} was paired by a guess`);
    assert.equal(total(k, 'out'), 40_000);
    assert.equal(total(k, 'in'), 60_000);
  }
});

test('A LEG LEFT OVER AT MORE COST THAN ANOTHER IS NO GUESS, whichever order the matchings are counted in', async () => {
  /* Outs from x and y on one day; ins into y and z that day and into x two days later. Leaving X IN over costs no day
     (X OUT to Y IN, Y OUT to Z IN), and leaving either other in over costs two, so X IN is over in the one matching of
     least cost and the rest pair. Counting every feasible matching must not make this a guess. */
  const k = await ledger();
  const ids = write(k, [CROSSED[0]!, CROSSED[1]!, { ...CROSSED[2]!, on: DAY(2) }, CROSSED[3]!, CROSSED[4]!]);
  assert.deepEqual(partners(k, ids), { 'X OUT': 'Y IN', 'Y OUT': 'Z IN', 'X IN': null, 'Y IN': 'X OUT', 'Z IN': 'Y OUT' });
  assert.equal(total(k, 'out'), 0);
  assert.equal(total(k, 'in'), 20_000);
});

test('TWO LEGS LEFT OVER AT THE SAME COST ARE STILL A GUESS: the move pairs nothing when either in could be the spare', async () => {
  /* Three ins on the day of two outs, two of them into HSBC and one into NBE: leaving any one of the three over costs
     no day, so which in was not part of the move is not in the ledger. `pairs-ties.test.ts` holds this for three outs
     and two ins in one pair of accounts; this is the same with the spare in another bank. */
  const k = await ledger();
  const ids = write(k, [
    { what: 'CIB OUT 1', on: DAY(0), direction: 'out', account: 'cib' },
    { what: 'CIB OUT 2', on: DAY(0), direction: 'out', account: 'cib' },
    { what: 'HSBC IN 1', on: DAY(0), direction: 'in', account: 'hsbc' },
    { what: 'HSBC IN 2', on: DAY(0), direction: 'in', account: 'hsbc' },
    { what: 'NBE IN', on: DAY(0), direction: 'in', account: 'nbe' },
  ]);
  for (const [what, to] of Object.entries(partners(k, ids))) assert.equal(to, null, `${what} was paired by a guess`);
  assert.equal(total(k, 'out'), 40_000);
  assert.equal(total(k, 'in'), 60_000);
});
