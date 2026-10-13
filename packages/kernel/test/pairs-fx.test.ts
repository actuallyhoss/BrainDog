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
 * near, a pending row that may be the real leg: each leaves both rows counted, and nothing is asked of anybody.
 *
 * OFF UNLESS THE LIST SAYS SO, so no ledger that installed before this moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { loadLeg, neighboursOf, partnerOf, passOf, settle, type PairsDecl, type Pairing } from '../src/pairs.ts';
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
  for (const rates of [[], [[DAY(3), 48.5]], [[DAY(-9), 48.5]]] as [string, number][][]) {
    const { k, sql } = await record(ACROSS, rates);
    const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n;
    const out = leg(k, 'TRANSFER TO EGP', 0, 'out', SENT, 'usd-current');
    const back = leg(k, 'TRANSFER FROM USD', 1, 'in', LANDED, 'egp-current');
    /* NONE AT ALL, ONE ONLY AFTER THE DAY, AND ONE NINE DAYS OLD: a later rate is a guess backwards, and a rate past
       the week `fx.ts` calls stale is not the day's. */
    apart(k, [out, back], `rates ${JSON.stringify(rates)}`);
    assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')!.n, before + 2, 'something was written beside the two legs');
    assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE field IN ('moved', '_pair')")!.n, 0);
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
