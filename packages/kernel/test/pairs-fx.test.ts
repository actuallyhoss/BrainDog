/**
 * `pairs.across_currency`: a move between two accounts in two currencies is one move, and both legs are marked.
 *
 * DOLLARS OUT OF ONE ACCOUNT AND POUNDS INTO ANOTHER WERE SPENDING AND INCOME until a person marked both, because the
 * matching compares an amount by its size and its currency and the two legs of such a move agree on neither. The owner's
 * rule for a pair stands as it was (two rows, opposite ways, two accounts, inside the window, paired once, marked and
 * never hidden, a pinned row never a partner); what this adds is what "the same amount" means across two currencies:
 * the earlier leg at the rate of its own day, within the tolerance the list declares.
 *
 * THE SIDE A MISTAKE FALLS ON IS THE COUNTED ONE. No rate for the day, a rate too old to be the day's, a third leg as
 * near, a pending row that may be the real leg: each leaves both rows counted.
 *
 * AND A NEAR MATCH IS NOT PROOF (audit of batch 61, claim 2). Within 2% at the day's rate, two unrelated rows paired
 * in silence. So the pair is made only on a rate no more than two days old AND where each row is the other's one
 * candidate; anything else is a question for a person (`crossAsks`), with the rate's age in it, and their answer
 * comes back as `Pairing.ruled`.
 *
 * OFF UNLESS THE LIST SAYS SO, so no ledger that installed before this moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { crossAsks, crossKey, crossLegs, crossStill, loadLeg, neighboursOf, newestRate, partnerOf, passOf, ruledOf, settle, ASK_RATE_DAYS, ASK_SPREAD, PAIR_RATE_DAYS, type PairsDecl, type Pairing } from '../src/pairs.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const PERSON = { actor: 'p_1' };
const BANK = { actor: 'ingest:bank' };
const DAY = (n: number) => new Date(Date.UTC(2026, 8, 10 + n, 12)).toISOString().slice(0, 10);

const PAIRS = { on: ['abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved', where: { field: 'state', is: 'cleared' } };
const ACROSS = { ...PAIRS, across_currency: { tolerance: 2 } };

/** money-core's shape, with the lifecycle a bank alert moves a row through. */
const LEDGER = (pairs: unknown = ACROSS): Declaration => ({
  id: 'register.ledger',
  kind: 'register',
  body: {
    id: 'ledger',
    name: 'Ledger',
    title: 'what',
    state: 'state',
    done: ['cleared', 'void'],
    pairs,
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', required: true },
      { id: 'direction', type: 'enum', values: ['in', 'out'], required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'account', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['pending', 'cleared', 'void'], default: 'cleared', required: true },
      { id: 'moved', type: 'bool', default: false },
    ],
  } as never,
});

/** The rates, under the old names on a list called `fx`, which is what a record holds before any list declares `rates:`. */
const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

const made = (r: unknown): Entry => {
  const x = r as { ok: boolean; value: Entry; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record(pairs: unknown = ACROSS, rates: readonly [string, number][] = [[DAY(0), 48.5]]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([LEDGER(pairs), FX]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const [as_of, rate] of rates) made(k.create('fx', { currency: 'USD', base: 'EGP', rate, as_of }, PERSON));
  return { k, sql };
}

type Money = { amount: number; currency: string };
const usd = (amount: number): Money => ({ amount, currency: 'USD' });
const egp = (amount: number): Money => ({ amount, currency: 'EGP' });

const leg = (k: Kernel, what: string, day: number, direction: 'in' | 'out', amount: Money, account: string, state = 'cleared'): Entry =>
  made(k.create('ledger', { what, on: DAY(day), direction, amount, account, state }, BANK));

const pairOf = (k: Kernel, e: Entry): unknown => k.get(e.id)!.fields._pair ?? null;
const marked = (k: Kernel, e: Entry): unknown => k.get(e.id)!.fields.moved;

const paired = (k: Kernel, a: Entry, b: Entry, why: string): void => {
  assert.equal(pairOf(k, a), b.id, why);
  assert.equal(pairOf(k, b), a.id, why);
  assert.equal(marked(k, a), true, why);
  assert.equal(marked(k, b), true, why);
};
const apart = (k: Kernel, rows: readonly Entry[], why: string): void => {
  for (const r of rows) {
    assert.equal(pairOf(k, r), null, why);
    assert.equal(marked(k, r), false, why);
  }
};

/* USD 1,000.00 at 48.5 is EGP 48,500.00. The bank's own rate is never the day's, so the pounds that land are near it. */
const SENT = usd(100_000);
const LANDED = egp(4_800_000); // 1.04% under
const TOO_FEW = egp(4_700_000); // 3.19% under

/** The ledger's pairing as the kernel builds it, with what a person answered about two rows, if anything. */
const pairingOf = (sql: NodeSql, ruled?: ReadonlyMap<string, boolean>): Pairing => {
  const body = LEDGER(ACROSS).body as unknown as { pairs: PairsDecl; fields: Pairing['fields']; state: string; done: string[] };
  return { sql, register: 'ledger', pairs: body.pairs, fields: body.fields, state: body.state, done: body.done, ...(ruled ? { ruled } : {}) };
};
const answers = (got: { leg: { id: string }; to: string | null }[]) => got.filter((g) => g.to !== null).map((g) => [g.leg.id, g.to]).sort();

test('THE DECLARATION: across_currency installs over a money amount, and is refused with no money in `on` or a tolerance that is not one', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([LEDGER()])).ok);

  const refusedAt = async (decl: Declaration): Promise<{ code: string; at?: string; fix: string }> => {
    const fresh = await openRecord(openSqlite(), fixedClock(NOW));
    const out = (await fresh.install([decl])) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
    assert.equal(out.ok, false, 'a declaration that should be refused installed');
    return out.refusal!;
  };

  /* A BARE NUMBER WITH ITS CURRENCY IN A FIELD BESIDE IT has no amount to convert as one value, and `on` says the two
     rows hold that currency alike, which is the opposite of what this asks. */
  const bare = LEDGER({ on: ['currency', 'abs(amount)'], opposite: 'direction', across: 'account', within: '4d', mark: 'moved', across_currency: { tolerance: 2 } });
  (bare.body as unknown as { fields: { id: string; type: string }[] }).fields = [
    ...(bare.body as unknown as { fields: { id: string; type: string }[] }).fields.filter((f) => f.id !== 'amount'),
    { id: 'amount', type: 'int' },
    { id: 'currency', type: 'text' },
  ];
  const noMoney = await refusedAt(bare);
  assert.equal(noMoney.code, 'DECLARATION_INVALID');
  assert.equal(noMoney.at, 'pairs.across_currency');

  for (const said of [{ tolerance: 0 }, { tolerance: -1 }, { tolerance: 'two' }, { tolerance: 60 }, {}, 2, { tolerance: 2, rate: 'fx' }]) {
    const r = await refusedAt(LEDGER({ ...PAIRS, across_currency: said }));
    assert.equal(r.code, 'DECLARATION_INVALID', JSON.stringify(said));
    assert.match(r.at ?? '', /^pairs\.across_currency/, JSON.stringify(said));
  }
});

test('OFF UNLESS DECLARED: with the rates in the record and no across_currency, two currencies never pair', async () => {
  const { k, sql } = await record(PAIRS);
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  apart(k, [out, back], 'two currencies paired on a list that never asked for it');
  sql.close();
});

test('DOLLARS OUT AND POUNDS IN, A DAY APART, WITHIN 2% AT THE RATE OF THE EARLIER DAY: paired, both marked, whichever arrived first', async () => {
  for (const first of ['out', 'in'] as const) {
    const { k, sql } = await record();
    const write = {
      out: () => leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current'),
      in: () => leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current'),
    };
    const a = write[first]();
    apart(k, [a], 'one leg alone was marked');
    const b = write[first === 'out' ? 'in' : 'out']();
    paired(k, a, b, `arriving ${first} first`);
    /* MARKED, NEVER HIDDEN: both rows are still read, and the history says which row each was matched to. */
    assert.equal(k.get(a.id)!.deleted_at ?? null, null);
    const events = sql.all<{ field: string }>("SELECT field FROM event WHERE field IN ('moved', '_pair')");
    assert.equal(events.length, 4, 'a pair is the mark and `_pair` on each leg');
    sql.close();
  }
});

test('THE RATE IS THE EARLIER LEG’S DAY’S: a move that agrees at the day it left pairs, whatever the rate became the day it landed', async () => {
  /* 48.5 the day it left, 60 the day it landed. The pounds were bought at the first. */
  const { k, sql } = await record(ACROSS, [[DAY(0), 48.5], [DAY(1), 60]]);
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  paired(k, out, back, 'the later day’s rate was used');
  /* AND THE SAME POUNDS AGAINST A MOVE THAT LEFT ON THE LATER DAY do not agree: USD 1,000.00 at 60 is EGP 60,000.00. */
  const late = leg(k, 'TRANSFER TO EGP', 5, 'out', SENT, 'usd-current');
  const landed = leg(k, 'TRANSFER FROM USD', 6, 'in', LANDED, 'egp-current');
  apart(k, [late, landed], 'a move 20% off the rate of its day paired');
  sql.close();
});

test('NO RATE FOR THE DAY: they do not pair, and nothing is asked of anybody', async () => {
  for (const rates of [[], [[DAY(3), 48.5]], [[DAY(-(ASK_RATE_DAYS + 1)), 48.5]]] as [string, number][][]) {
    const { k, sql } = await record(ACROSS, rates);
    const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n;
    const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
    const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
    /* NONE AT ALL, ONE ONLY AFTER THE DAY, AND ONE MORE THAN A MONTH OLD: a later rate is a guess backwards, and one
       that old says too little about the day even to ask on. */
    apart(k, [out, back], `rates ${JSON.stringify(rates)}`);
    assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n, before + 2, 'something was written beside the two legs');
    assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field IN ('moved', '_pair')")!.n, 0);
    assert.deepEqual(crossAsks(pairingOf(sql), [out.id, back.id]), [], `rates ${JSON.stringify(rates)}`);
    sql.close();
  }
});

test('3% APART IS NOT THE SAME MONEY: both legs stay counted, and an edit to within 2% pairs them, and one back out unpairs', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', TOO_FEW, 'egp-current');
  apart(k, [out, back], '3.19% apart paired');
  made(k.update('ledger', back.id, { amount: LANDED }, BANK));
  paired(k, out, back, 'a corrected amount did not pair');
  made(k.update('ledger', back.id, { amount: TOO_FEW }, BANK));
  apart(k, [out, back], 'a pair outlived the amounts that made it');
  sql.close();
});

test('A PINNED LEG IS NEVER A PARTNER, across currencies as within one', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  made(k.update('ledger', out.id, { moved: true }, PERSON));
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  assert.equal(pairOf(k, out), null);
  assert.equal(marked(k, out), true, 'his tick was taken away');
  apart(k, [back], 'a row paired with one a person pinned');
  sql.close();
});

test('A PENDING LEG HOLDS THE PAIR BACK: a client’s pounds as near are not taken for the leg still to clear', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const pending = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current', 'pending');
  const client = leg(k, 'NILE DESIGN', 1, 'in', egp(4_850_000), 'egp-savings');
  apart(k, [out, pending, client], 'a client’s payment was hidden while the real leg was pending');
  made(k.update('ledger', pending.id, { state: 'cleared' }, BANK));
  /* CLEARED, IT IS ONE OF TWO AS NEAR, and a tie is not guessed: the money stays counted until a person says. */
  apart(k, [out, pending, client], 'one of two equally near legs was guessed');
  /* THE CLIENT’S ROW MOVED OUT OF THE WINDOW leaves the move its one partner. */
  made(k.update('ledger', client.id, { on: DAY(9) }, BANK));
  paired(k, out, pending, 'the cleared leg did not pair once it was the only one');
  apart(k, [client], 'the client was marked');
  sql.close();
});

test('A SAME-CURRENCY PARTNER AS NEAR WINS, in either order of arrival, and the other currency stays counted', async () => {
  for (const order of [[0, 1, 2], [0, 2, 1], [2, 1, 0], [1, 2, 0]]) {
    const { k, sql } = await record();
    const writes = [
      () => leg(k, 'TRANSFER TO RESERVE', 0, 'out', SENT, 'usd-current'),
      () => leg(k, 'TRANSFER FROM CURRENT', 1, 'in', SENT, 'usd-reserve'),
      () => leg(k, 'NILE DESIGN', 1, 'in', LANDED, 'egp-current'),
    ];
    const rows: Entry[] = [];
    for (const i of order) rows[i] = writes[i]!();
    paired(k, rows[0]!, rows[1]!, `order ${order.join('')}`);
    apart(k, [rows[2]!], `order ${order.join('')}`);
    sql.close();
  }
});

/** The ledger every test below starts from: written while the list paired one currency only. */
function standing(k: Kernel): { out: Entry; back: Entry; rent: Entry; same: [Entry, Entry] } {
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  const rent = leg(k, 'RENT', 1, 'out', egp(2_000_000), 'egp-current');
  const same: [Entry, Entry] = [leg(k, 'TO RESERVE', 2, 'out', usd(5_000), 'usd-current'), leg(k, 'FROM CURRENT', 2, 'in', usd(5_000), 'usd-reserve')];
  apart(k, [out, back, rent], 'paired before the list asked');
  paired(k, same[0], same[1], 'one currency');
  return { out, back, rent, same };
}

test('A PASS OVER A LEDGER ALREADY THERE answers what a write would: the list read once gives the answers a query per window gives', async () => {
  const { k, sql } = await record(PAIRS);
  const { out, back, rent, same } = standing(k);
  const body = LEDGER(ACROSS).body as unknown as { pairs: PairsDecl; fields: Pairing['fields']; state: string; done: string[] };
  const p: Pairing = { sql, register: 'ledger', pairs: body.pairs, fields: body.fields, state: body.state, done: body.done };
  const every = [out, back, rent, ...same].map((e) => e.id);
  const answers = (got: { leg: { id: string }; to: string | null }[]) => got.map((g) => [g.leg.id, g.to]).sort();
  const want = [[out.id, back.id], [back.id, out.id]].sort();

  const pass = passOf(p);
  assert.ok(pass.windows !== undefined, 'the pass did not read the list once');
  assert.deepEqual(answers(every.flatMap((id) => settle(p, [id], pass))), want, 'the pass');
  assert.deepEqual(answers(settle(p, every)), want, 'one write');
  assert.equal(partnerOf(p, loadLeg(p, out.id)!), back.id);
  assert.equal(partnerOf(p, loadLeg(p, back.id)!), out.id);
  assert.equal(partnerOf(p, loadLeg(p, rent.id)!), null);
  assert.equal(partnerOf(p, loadLeg(p, same[0].id)!), same[1].id);
  /* AND A ROW LEAVING THE WINDOW IS LED BACK TO BY ITS NEIGHBOURS, which is how a write finds the rows it freed. */
  assert.deepEqual(neighboursOf(p, loadLeg(p, out.id)!), [back.id]);
  sql.close();
});

test('TURNED OFF AGAIN, the pairs two currencies made are taken back and the pairs of one currency stand', async () => {
  const { k, sql } = await record(ACROSS);
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  const same = [leg(k, 'TO RESERVE', 2, 'out', usd(5_000), 'usd-current'), leg(k, 'FROM CURRENT', 2, 'in', usd(5_000), 'usd-reserve')];
  paired(k, out, back, 'two currencies');
  assert.ok((await k.install([LEDGER(PAIRS)])).ok);
  apart(k, [out, back], 'a pair outlived the declaration that made it');
  paired(k, same[0]!, same[1]!, 'a pair in one currency moved');
  sql.close();
});

/* TODO UNTIL `index.ts` ASKS THESE ROWS. The install pass (`settleRedeclared`) seeds only a row whose size another row
   shares, which is every leg of a move in one currency and no leg of a move between two. `pairs.ts` answers the pass
   rightly (the test above); the seed is the kernel's, and the line is in this build's report under blocked. */
test('TURNED ON OVER A LEDGER ALREADY THERE: the install pairs the two currencies and moves nothing else', async () => {
  const { k, sql } = await record(PAIRS);
  const { out, back, rent, same } = standing(k);
  assert.ok((await k.install([LEDGER(ACROSS)])).ok);
  paired(k, out, back, 'the pass over the whole ledger did not pair the two currencies');
  paired(k, same[0], same[1], 'a pair in one currency moved');
  apart(k, [rent], 'a payment was marked');
  sql.close();
});

test('THE RATE ARRIVES AFTER BOTH LEGS: the two pair when it is written, and are counted again when it is taken away', async () => {
  const { k, sql } = await record(ACROSS, []);
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  const rent = leg(k, 'RENT', 1, 'out', egp(1_500_000), 'egp-current');
  apart(k, [out, back], 'they paired with no rate');
  const rate = made(k.create('fx', { currency: 'USD', base: 'EGP', rate: 48.5, as_of: DAY(0) }, PERSON));
  paired(k, out, back, 'the rate of the day arrived and the two legs stayed counted');
  apart(k, [rent], 'a payment was marked');
  const by = sql.all<{ actor: string }>("SELECT DISTINCT actor FROM event WHERE field = '_pair'");
  assert.equal(by.length, 1, 'the pair is signed once');
  assert.notEqual(by[0]!.actor, PERSON.actor, 'the pair was signed by whoever wrote the rate');
  made(k.update('fx', rate.id, { deleted_at: 'now' }, PERSON));
  apart(k, [out, back], 'the rate was taken away and the pair it held stood');
  sql.close();
});

test('THE EARLIER LEG MAY BE EITHER CURRENCY, and each currency keeps its own minor units: pounds out first, and yen through dollars', async () => {
  const { k, sql } = await record();
  made(k.create('fx', { currency: 'USD', base: 'JPY', rate: 150, as_of: DAY(0) }, PERSON));
  /* EGP 48,500.00 at one over 48.5 is USD 1,000.00, and USD 990.00 landed. */
  const out = leg(k, 'TRANSFER TO USD', 0, 'out', egp(4_850_000), 'egp-current');
  const back = leg(k, 'TRANSFER FROM EGP', 1, 'in', usd(99_000), 'usd-current');
  paired(k, out, back, 'the rate was not read the other way round');
  /* JPY 15,000 is USD 100.00 is EGP 4,850.00: yen has no minor unit, and no rate is quoted from yen into pounds. */
  const yen = leg(k, 'TRANSFER TO EGP', 2, 'out', { amount: 15_000, currency: 'JPY' }, 'jpy-current');
  const landed = leg(k, 'TRANSFER FROM JPY', 2, 'in', egp(485_000), 'egp-savings');
  paired(k, yen, landed, 'yen was converted as if it had cents');
  sql.close();
});

test('A PAIR OF TWO CURRENCIES IS TAKEN BACK AS ONE OF ONE IS: a leg deleted, a leg a person unticks, a partner of its own currency arriving', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  paired(k, out, back, 'two currencies');
  /* THE POUNDS LEFT FOR ANOTHER ACCOUNT THE SAME DAY: that is the same money to the piastre, and the dollars are counted again. */
  const on = leg(k, 'TRANSFER TO SAVINGS', 1, 'out', LANDED, 'egp-savings');
  paired(k, back, on, 'the exact partner did not win');
  apart(k, [out], 'the dollars stayed marked with no partner');
  made(k.update('ledger', on.id, { deleted_at: 'now' }, PERSON));
  paired(k, out, back, 'the two currencies did not pair again');
  made(k.update('ledger', out.id, { moved: false }, PERSON));
  apart(k, [out, back], 'a pair outlived his untick');
  sql.close();
});

test('TWO MOVES OF ONE SIZE INSIDE ONE WINDOW ARE NOT GUESSED: the middle legs each stand as near to two, and all four stay counted', async () => {
  const { k, sql } = await record();
  const rows = [
    leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current'),
    leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current'),
    leg(k, 'TRANSFER TO EGP', 2, 'out', SENT, 'usd-current'),
    leg(k, 'TRANSFER FROM USD', 3, 'in', egp(4_810_000), 'egp-current'),
  ];
  apart(k, rows, 'one of two equally near moves was guessed');
  sql.close();
});

test('A COINCIDENCE BESIDE A REAL MOVE IS A QUESTION, NOT A PAIR: a second row that fits leaves all three counted, and the answer decides', async () => {
  const { k, sql } = await record();
  /* A REAL MOVE, AND A CLIENT'S POUNDS A DAY LATER THAT HAPPEN TO SIT WITHIN 2% OF THE SAME DOLLARS. The nearest won
     before, so which of the two receipts dropped out of Received was a matter of which day it landed. */
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  const client = leg(k, 'DEPOSIT', 2, 'in', egp(4_830_000), 'egp-savings');
  apart(k, [out, back, client], 'a row with two candidates was paired in silence');

  const asks = crossAsks(pairingOf(sql), [out.id, back.id, client.id]);
  assert.deepEqual(asks.map((a) => a.key).sort(), [crossKey(out.id, back.id), crossKey(out.id, client.id)].sort(), 'one question for each two rows, however many seeds led to it');
  for (const a of asks) {
    assert.deepEqual(a.why, ['not_only']);
    assert.equal(a.first.id, out.id, 'the leg that went first is the one the rate converts');
    assert.deepEqual([a.from, a.to, a.rate, a.rate_as_of, a.rate_days, a.converted], ['USD', 'EGP', 48.5, DAY(0), 0, 4_850_000]);
  }

  /* YES TO THE REAL ONE pairs it, and the client's pounds stay counted with nothing left to ask. */
  const every = [out.id, back.id, client.id];
  const yes = pairingOf(sql, new Map([[crossKey(out.id, back.id), true]]));
  assert.deepEqual(answers(settle(yes, every)), [[out.id, back.id], [back.id, out.id]].sort());
  assert.deepEqual(crossAsks(yes, every), []);
  /* NO TO THE COINCIDENCE takes it out of the way for good, and the move is then the one candidate it always was. */
  const no = pairingOf(sql, new Map([[crossKey(out.id, client.id), false]]));
  assert.deepEqual(answers(settle(no, every)), [[out.id, back.id], [back.id, out.id]].sort());
  assert.deepEqual(crossAsks(no, every), []);
  /* NO TO BOTH leaves all three counted and asks nothing again. */
  const neither = pairingOf(sql, new Map([[crossKey(out.id, client.id), false], [crossKey(out.id, back.id), false]]));
  assert.deepEqual(answers(settle(neither, every)), []);
  assert.deepEqual(crossAsks(neither, every), []);
  sql.close();
});

test('A ROW WITH A PARTNER OF ITS OWN CURRENCY IS NOBODY\u2019S RIVAL: the pounds still pair with the one dollar leg left', async () => {
  const { k, sql } = await record();
  /* THE DOLLARS OUT OF ONE ACCOUNT INTO ANOTHER ARE A PAIR TO THE CENT, so that out is nobody's rival for the pounds. */
  const moved = [leg(k, 'TO SAVINGS', 0, 'out', SENT, 'usd-current'), leg(k, 'FROM CURRENT', 0, 'in', SENT, 'usd-savings')];
  const out = leg(k, 'TRANSFER TO EGP', 1, 'out', SENT, 'usd-savings');
  const back = leg(k, 'TRANSFER FROM USD', 2, 'in', LANDED, 'egp-current');
  paired(k, moved[0]!, moved[1]!, 'the move in one currency');
  paired(k, out, back, 'a taken row stood in the way of the one candidate left');
  sql.close();
});

test('A RATE OLDER THAN TWO DAYS IS A QUESTION WITH ITS AGE IN IT: two days pairs, three asks, and past a month nothing is asked', async () => {
  for (const [old, pairs] of [[0, true], [PAIR_RATE_DAYS, true], [PAIR_RATE_DAYS + 1, false], [15, false], [ASK_RATE_DAYS, false]] as [number, boolean][]) {
    const { k, sql } = await record(ACROSS, [[DAY(-old), 48.5]]);
    const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
    const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
    const asks = crossAsks(pairingOf(sql), [out.id, back.id]);
    if (pairs) {
      paired(k, out, back, `a rate ${old} days old`);
      assert.deepEqual(asks, [], `a rate ${old} days old`);
    } else {
      /* THE ONE CANDIDATE, WITHIN THE TOLERANCE, AND STILL NOT TAKEN ON ITS OWN WORD: 15 days is the owner's record on
         the day of the audit, one rate from September 28th read on October 13th. */
      apart(k, [out, back], `a rate ${old} days old`);
      assert.equal(asks.length, 1, `a rate ${old} days old`);
      const a = asks[0]!;
      assert.deepEqual([a.key, a.first.id, a.second.id, a.why], [crossKey(out.id, back.id), out.id, back.id, ['rate_old']]);
      assert.deepEqual([a.rate_as_of, a.rate_days, a.converted], [DAY(-old), old, 4_850_000]);
      /* AND THE PERSON'S YES IS ENOUGH, whatever the rate's age. */
      const yes = pairingOf(sql, new Map([[a.key, true]]));
      assert.deepEqual(answers(settle(yes, [out.id, back.id])), [[out.id, back.id], [back.id, out.id]].sort());
    }
    /* THE VITAL SIGN'S LINE: how old the newest rate is, read on the day the money left. */
    assert.deepEqual(newestRate(sql, DAY(0)), { as_of: DAY(-old), days: old });
    sql.close();
  }
  const { sql } = await record(ACROSS, []);
  assert.equal(newestRate(sql, DAY(0)), null, 'no rate at all');
  sql.close();
});

/* ─────────────── where a person is asked (`Pairing.asks`): the audit of batch 63, claim 3 ─────────────── */

/** The pairing of a caller that puts `crossAsks` to a person, as the kernel will build it once it does. */
const asking = (sql: NodeSql, ruled?: ReadonlyMap<string, boolean>): Pairing => ({ ...pairingOf(sql, ruled), asks: true });
const both = (a: Entry, b: Entry) => [[a.id, b.id], [b.id, a.id]].sort();
/** Who a row is paired with as this pairing reads the ledger, whatever is written on it now (`settle` says only what changes). */
const partner = (p: Pairing, e: Entry): string | null => partnerOf(p, loadLeg(p, e.id)!);

test('A LONE NEAR MATCH IS A QUESTION WHERE SOMEBODY IS ASKED: the day’s rate and no rival is still not proof, and the answer decides', async () => {
  const { k, sql } = await record();
  /* THE AUDIT'S TWO ROWS: each the other's one candidate, the rate of the day, 1.04% apart. Nothing says they are one
     move but their sizes. The kernel asks nobody yet, so it pairs them, as it did. */
  const out = leg(k, 'CARD PURCHASE', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'DEPOSIT', 1, 'in', LANDED, 'egp-current');
  const ids = [out.id, back.id];
  paired(k, out, back, 'with nobody asked, a lone match pairs as before');
  assert.equal(partnerOf(pairingOf(sql), loadLeg(pairingOf(sql), out.id)!), back.id);
  assert.deepEqual(crossAsks(pairingOf(sql), ids), [], 'and nothing is asked');

  /* ASKED, THE PAIR IS TAKEN BACK (both rows counted again) and it is one question. */
  const p = asking(sql);
  assert.deepEqual(settle(p, ids).map((g) => [g.leg.id, g.to]).sort(), [[back.id, null], [out.id, null]].sort());
  assert.deepEqual(settle(p, ids, passOf(p)).map((g) => g.to), [null, null], 'a pass answers as a write does');
  for (const asks of [crossAsks(p, ids), crossAsks(p, [back.id]), crossAsks(p, ids, passOf(p))]) {
    assert.equal(asks.length, 1);
    const a = asks[0]!;
    assert.deepEqual([a.key, a.first.id, a.second.id, a.why], [crossKey(out.id, back.id), out.id, back.id, ['lone']]);
    assert.deepEqual([a.from, a.to, a.rate, a.rate_days, a.converted, a.landed], ['USD', 'EGP', 48.5, 0, 4_850_000, 4_800_000]);
  }

  const key = crossKey(out.id, back.id);
  const yes = asking(sql, ruledOf([{ key, one: true }]));
  assert.deepEqual([partner(yes, out), partner(yes, back)], [back.id, out.id], 'a yes pairs them');
  assert.deepEqual(settle(yes, ids), [], 'which is what the ledger already says, so nothing is written');
  assert.deepEqual(crossAsks(yes, ids), []);
  const no = asking(sql, ruledOf([{ a: back.id, b: out.id, one: false }]));
  assert.deepEqual([partner(no, out), partner(no, back)], [null, null], 'a no leaves both counted');
  assert.equal(settle(no, ids).length, 2, 'and the pair made before anybody was asked is taken back');
  assert.deepEqual(crossAsks(no, ids), [], 'and is not asked again');
  sql.close();
});

test('A LONE MATCH ASKED ABOUT GIVES WAY TO THE SAME MONEY IN ONE CURRENCY, and is `lone` only while each is the other’s nearest', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  /* A second receipt as near: neither is taken, each is a question, and neither is `lone`. */
  const client = leg(k, 'DEPOSIT', 1, 'in', egp(4_830_000), 'egp-savings');
  const p = asking(sql);
  const asks = crossAsks(p, [out.id]);
  assert.deepEqual(asks.map((a) => [a.key, a.why]).sort(), [[crossKey(out.id, back.id), ['not_only']], [crossKey(out.id, client.id), ['not_only']]].sort());
  /* The dollars arrive in another dollar account: a pair to the cent, asked of nobody, and both questions are gone. */
  const landed = leg(k, 'FROM CURRENT', 0, 'in', SENT, 'usd-savings');
  assert.deepEqual([partner(p, out), partner(p, landed)], [landed.id, out.id]);
  assert.deepEqual(crossAsks(p, [out.id, back.id, client.id]), []);
  assert.deepEqual([...crossStill(p, asks.map((a) => a.key))], [], 'the caller closes what it held open');
  sql.close();
});

test('A WIDER SPREAD THAN THE TOLERANCE IS A QUESTION UP TO 10%, never a pair: 3% is asked, a yes pairs it, and 11% is two sizes that only look alike', async () => {
  const { k, sql } = await record();
  /* AN EXCHANGE DESK TOOK 3.19%. The list says 2%, so the two were neither paired nor asked about, and Spent and
     Received both read high by the move. */
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', TOO_FEW, 'egp-current');
  const ids = [out.id, back.id];
  apart(k, [out, back], '3.19% apart paired');
  assert.deepEqual(crossAsks(pairingOf(sql), ids), [], 'nobody asked, nothing asked');

  const p = asking(sql);
  assert.deepEqual(answers(settle(p, ids)), [], 'a wider spread is never paired on its own word');
  for (const asks of [crossAsks(p, [out.id]), crossAsks(p, [back.id]), crossAsks(p, ids, passOf(p))]) {
    assert.equal(asks.length, 1);
    const a = asks[0]!;
    assert.deepEqual([a.key, a.first.id, a.second.id, a.why, a.converted, a.landed], [crossKey(out.id, back.id), out.id, back.id, ['spread'], 4_850_000, 4_700_000]);
  }
  const key = crossKey(out.id, back.id);
  assert.deepEqual(crossLegs(key).sort(), [...ids].sort());
  assert.deepEqual([...crossStill(p, [key, crossKey(out.id, 'gone')])], [key], 'a question whose rows are still there stands, and one about a row that is gone does not');

  /* YES pairs them, in a write's settle and in a pass over the list, and with nobody asked too: the answer is the
     person's, whoever reads it. NO leaves them counted and unasked. */
  const yes = ruledOf([{ key, one: true }]);
  assert.deepEqual(answers(settle(asking(sql, yes), ids)), both(out, back));
  assert.deepEqual(answers(settle(asking(sql, yes), ids, passOf(asking(sql, yes)))), both(out, back));
  assert.deepEqual(answers(settle(pairingOf(sql, yes), ids)), both(out, back));
  assert.deepEqual(crossAsks(asking(sql, yes), ids), []);
  assert.deepEqual([...crossStill(asking(sql, yes), [key])], []);
  const no = asking(sql, ruledOf([{ key, one: true }, { a: out.id, b: back.id, one: false }]));
  assert.deepEqual(answers(settle(no, ids)), [], 'the later answer about the same two is the one that holds');
  assert.deepEqual(crossAsks(no, ids), []);

  /* THE EDGE, to the piastre: EGP 48,500.00 against 44,090.91 is 10% of what landed, and one piastre less is past it. */
  assert.equal(ASK_SPREAD, 10);
  made(k.update('ledger', back.id, { amount: egp(4_409_091) }, BANK));
  assert.deepEqual(crossAsks(p, ids).map((a) => a.why), [['spread']]);
  made(k.update('ledger', back.id, { amount: egp(4_409_090) }, BANK));
  assert.deepEqual(crossAsks(p, ids), [], 'past 10% was asked about');
  assert.deepEqual(answers(settle(asking(sql, yes), ids)), [], 'and a yes given at 3% does not reach past 10%');
  sql.close();
});

test('A WIDER SPREAD STANDS IN NOBODY’S WAY: beside a match inside the tolerance it is a second question, and on an old rate it says both', async () => {
  const { k, sql } = await record();
  const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
  const other = leg(k, 'DEPOSIT', 2, 'in', TOO_FEW, 'egp-savings');
  paired(k, out, back, 'a row outside the tolerance is no rival');
  const p = asking(sql);
  const every = [out.id, back.id, other.id];
  assert.deepEqual(
    crossAsks(p, every).map((a) => [a.key, a.why]).sort(),
    [[crossKey(out.id, back.id), ['lone']], [crossKey(out.id, other.id), ['spread', 'not_only']]].sort(),
  );
  /* A yes to the nearer one pairs it and closes the other question with it. */
  const yes = asking(sql, ruledOf([{ a: out.id, b: back.id, one: true }]));
  assert.deepEqual([partner(yes, out), partner(yes, back), partner(yes, other)], [back.id, out.id, null]);
  assert.deepEqual(crossAsks(yes, every), []);
  sql.close();

  const old = await record(ACROSS, [[DAY(-5), 48.5]]);
  const sent = leg(old.k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const few = leg(old.k, 'TRANSFER FROM USD', 1, 'in', TOO_FEW, 'egp-current');
  const pending = leg(old.k, 'DEPOSIT', 1, 'in', TOO_FEW, 'egp-savings', 'pending');
  const asks = crossAsks(asking(old.sql), [sent.id, few.id, pending.id]);
  assert.deepEqual(asks.map((a) => [a.key, a.why, a.rate_days]), [[crossKey(sent.id, few.id), ['spread', 'rate_old'], 5]], 'a row still pending is not asked about');
  old.sql.close();

  /* A row of the other currency that is already one move with a row of its own is taken, and is no second candidate. */
  const own = await record();
  const gone = leg(own.k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
  const short = leg(own.k, 'TRANSFER FROM USD', 1, 'in', TOO_FEW, 'egp-current');
  const into = leg(own.k, 'TO SAVINGS', 1, 'in', LANDED, 'egp-savings');
  const from = leg(own.k, 'TO SAVINGS', 1, 'out', LANDED, 'egp-current');
  paired(own.k, into, from, 'the same pounds between two pound accounts pair to the piastre');
  assert.deepEqual(crossAsks(asking(own.sql), [gone.id, short.id, into.id, from.id]).map((a) => [a.key, a.why]), [[crossKey(gone.id, short.id), ['spread']]]);
  own.sql.close();
});
