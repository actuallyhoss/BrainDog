/**
 * The Money page says when Cash now is not what its entries add up to (the page half).
 *
 * WHY. "Wrong money on a screen is the worst class of defect in this repo". The record checks Cash now against
 * a second walk of the same entries (`cash-cross-check`, `packages/kernel/src/money-figures.ts` `readCrosscheck`), and
 * until this nothing on a page drew what that check found: a figure a penny out read exactly like a figure that was right.
 *
 * WHAT IS HELD HERE, on a record holding money-core as the pack document says it:
 * - where the two ways agree, in one currency or in two, the page draws nothing about the check at all;
 * - one minor unit apart draws ONE tile, in the danger tone, whose heading says it in words and whose figure is the
 *   difference in the currency it is in;
 * - apart in two currencies the tile is drawn and reads the two amounts, never one number over both;
 * - with nothing to check, the check has no value and says ONE sentence, "No account counts as cash yet", true with
 *   no account and with accounts none of which is counted. The page declares no line of its own for it (one said "No
 *   balance has been typed yet" while 3.17.0 was being made, untrue of the second day, and went for the lead a record
 *   with two books opens on, Money being at the most blocks a page declares): the box to add an account stands, and
 *   where Money already speaks of cash with nothing to draw, What you have, by book, its words are the reading's.
 *
 * THE DIFFERENCE IS PLANTED AS THE KERNEL'S OWN TEST PLANTS IT (`packages/kernel/test/cash-cross-figure.test.ts`): a
 * movement called "Read wrong" comes back to the walk one minor unit heavier than the record holds. The walk reads
 * `id, fields` of one account's entries and the roll never does, so Cash now itself is untouched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, day, firstPartyDocument } from '../src/index.ts';
import { CASH_FIGURES } from '../src/modules/money/figures/cash.ts';
import { BY_BOOK } from '../src/modules/money/pages/parts/by-book.ts';
import { CROSSCHECK_NOTHING } from '@braindog/kernel';

const OWNER = { actor: 'p_1' };
const CHECK = 'cash-cross-check';
const WRONG = 'Read wrong';

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

type Sql = ReturnType<typeof openSqlite>;
type Entry = { id: string; fields: string };

/** A record's store with a hand on what the walk is given: a movement called "Read wrong" reads one minor unit heavier. */
function store(): Sql {
  const real = openSqlite();
  const sql: Sql = Object.create(real) as Sql;
  sql.all = ((text: string, ...params: never[]) => {
    const rows = real.all(text, ...params) as Entry[];
    if (!text.startsWith('SELECT id, fields FROM entry WHERE register = ? AND deleted_at IS NULL AND json_extract') || params[0] !== 'transactions') return rows;
    return rows.map((row) => {
      const fields = JSON.parse(row.fields) as { what: string; amount: { amount: number; currency: string } };
      if (fields.what !== WRONG) return row;
      return { ...row, fields: JSON.stringify({ ...fields, amount: { ...fields.amount, amount: fields.amount.amount + 1 } }) };
    });
  }) as Sql['all'];
  return sql;
}

/** A record holding money-core as the pack document says it, and what it points at, with no example entries. */
async function moneyCore(): Promise<Kernel> {
  const k = await openRecord(store(), fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  return k;
}

type Money = { amount: number; currency: string };
const money = (amount: number, currency: string): Money => ({ amount, currency });
const make = (k: Kernel, register: string, fields: Record<string, unknown>): string => value<{ id: string }>(k.create(register, fields, OWNER)).id;

/**
 * An owner's accounts and a month of their movements: a balance checked ten days ago, a transfer into Savings and,
 * with `dollars`, an account in dollars. `wrong` names the currencies with one counted movement the walk reads a minor
 * unit heavier: 30,000 paid in in pounds (the walk holds a penny more than the figure), 1,000 paid out in dollars
 * (a cent less).
 */
function write(k: Kernel, dollars: boolean, wrong: string[] = []): void {
  const named = (currency: string) => (wrong.includes(currency) ? { what: WRONG } : {});
  const everyday = make(k, 'accounts', { name: 'Everyday account', kind: 'bank', balance: money(200_000, 'GBP'), as_of: day(-20) });
  const savings = make(k, 'accounts', { name: 'Savings', kind: 'bank', balance: money(100_000, 'GBP'), as_of: day(-30) });
  make(k, 'balances', { account: everyday, balance: money(180_000, 'GBP'), as_of: day(-10), source: 'Statement' });
  const move = (account: string, on: string, direction: 'in' | 'out', amount: Money, more: Record<string, unknown> = {}) =>
    make(k, 'transactions', { what: 'Movement', on, direction, amount, account, state: 'cleared', ...more });
  move(everyday, day(-5), 'in', money(30_000, 'GBP'), named('GBP'));
  move(everyday, day(-2), 'out', money(50_000, 'GBP'), { what: 'To savings', transfer: true });
  move(savings, day(-2), 'in', money(50_000, 'GBP'), { what: 'From everyday', transfer: true });
  if (!dollars) return;
  const usd = make(k, 'accounts', { name: 'Dollar account', kind: 'bank', balance: money(120_000, 'USD'), as_of: day(-20) });
  move(usd, day(-1), 'out', money(1_000, 'USD'), named('USD'));
}

type Reading = { value: number | null; unit: string | null; met: boolean | null; why?: string; parts?: Money[] };
const checked = (k: Kernel): Reading => value<Reading>(k.metric(CASH_FIGURES[CHECK] as never));

/** A block as the Money page is read, with what it says of the check. */
type Cell = { metric: string; label?: string; note?: string; reading: Reading | null };
type Block = { kind: string; heading?: string; body?: string; tone?: string; drawn?: boolean; why?: string; readings?: Cell[]; cells?: { metric: string }[] };

/** Either sentence a line about nothing to check has ever said: the one it says now, and the one that was untrue. */
const SENTENCE = /balance has been typed|counts as cash/;

/** Every block of Money that is about the check, in the page's order: the tile on its figure, and any line about a balance typed. */
function about(k: Kernel): { all: Block[]; drawn: Block[] } {
  const page = value<{ blocks: Block[] }>(k.page('money'));
  const all = page.blocks.filter((b) => (b.cells ?? []).some((c) => c.metric === CHECK) || SENTENCE.test(b.body ?? ''));
  return { all, drawn: all.filter((b) => b.drawn !== false) };
}

/** What a tile's figure reads for the check. */
const differenceOn = (b: Block | undefined): Reading | null => (b?.readings ?? []).find((c) => c.metric === CHECK)?.reading ?? null;

/** Everything a person reads on a block: its heading, its line, and each figure's label and note. */
const words = (b: Block): string => [b.heading, b.body, ...(b.cells ?? []).flatMap((c) => [(c as Cell).label, (c as Cell).note])].filter((t) => typeof t === 'string').join(' ');

test('the Money page holds one tile on the check and nothing else, and it is not drawn where the entries agree', async () => {
  const k = await moneyCore();
  write(k, false);
  assert.deepEqual([checked(k).value, checked(k).unit, checked(k).met], [0, 'GBP', true]);
  const { all, drawn } = about(k);
  assert.deepEqual(all.map((b) => b.kind), ['stat'], 'a tile for a difference, and nothing else on the check');
  assert.deepEqual(drawn, [], 'a check at nought says nothing, so nothing is drawn');
});

test('two currencies that both agree draw nothing, and never the line for no balance', async () => {
  const k = await moneyCore();
  write(k, true);
  /* Nought with no currency: the reading `empty:` on the check itself would take for no amount at all. */
  assert.deepEqual([checked(k).value, checked(k).unit, checked(k).met], [0, null, true]);
  assert.deepEqual(about(k).drawn, []);
});

test('ONE MINOR UNIT APART IS ONE TILE, in the danger tone, saying so in words and the difference in its own currency', async () => {
  const k = await moneyCore();
  write(k, true, ['USD']);
  const { drawn } = about(k);
  assert.equal(drawn.length, 1, 'one tile, not one a currency and not a line beside it');
  const tile = drawn[0]!;
  assert.deepEqual([tile.kind, tile.tone], ['stat', 'bad']);
  assert.match(tile.heading ?? '', /does not add up/, 'the colour is never the only mark: the heading says what is wrong');
  assert.equal(tile.readings?.length, 1, 'the tile says one figure');
  const reading = differenceOn(tile);
  /* The figure less the walk: the walk paid out a cent more. The pounds agree, so the pounds are not said. */
  assert.deepEqual([reading?.value, reading?.unit, reading?.met, reading?.parts], [1, 'USD', false, undefined]);
});

test('a penny under is drawn as a penny over is', async () => {
  const k = await moneyCore();
  write(k, false, ['GBP']);
  const { drawn } = about(k);
  assert.equal(drawn.length, 1);
  assert.deepEqual([differenceOn(drawn[0])?.value, differenceOn(drawn[0])?.unit, drawn[0]!.tone], [-1, 'GBP', 'bad']);
});

/**
 * DRAWN, SINCE THE LOOK READS A FIGURE'S AMOUNTS BY CURRENCY (`drewNothing` in `packages/kernel/src/compose.ts`). Out in
 * two currencies the check is two amounts and no one value, and a tile whose figure had no `value` was left out as one
 * with nothing to say, so the tile vanished exactly when two currencies were wrong at once.
 */
test('apart in two currencies the tile is drawn and reads each amount in its own currency, never one number', async () => {
  const k = await moneyCore();
  write(k, true, ['GBP', 'USD']);
  const tile = about(k).all[0]!;
  const reading = differenceOn(tile);
  assert.notEqual(reading, null, 'the condition on the check said no with two currencies out, so the tile was never read');
  /* A penny under and a cent over: added, they would read nought and pass. */
  assert.deepEqual([reading?.value, reading?.unit, reading?.met], [null, null, false]);
  assert.deepEqual(reading?.parts, [money(-1, 'GBP'), money(1, 'USD')]);
  assert.deepEqual(about(k).drawn.map((d) => [d.kind, d.tone]), [['stat', 'bad']], 'the tile was left out with two currencies out');
});

/**
 * Money's blocks as the pack document declares them, before any record reads them, and the bar of what each book holds,
 * which the Accounts page places and not the home (money-core 3.29.0).
 */
function declared(): { heading?: string; empty?: string; body?: string; source?: string }[] {
  const doc = firstPartyDocument('money-core', { seeds: [] }) as { declarations: { page?: string; blocks?: Record<string, unknown>[] }[] };
  return [...(doc.declarations.find((d) => d.page === 'money')?.blocks ?? []), ...BY_BOOK] as never;
}

test('WITH NO ACCOUNT the reading says the one sentence, and the page draws nothing about the check: the box to add an account stands', async () => {
  const k = await moneyCore();
  const read = checked(k);
  assert.deepEqual([read.value, read.unit, read.met], [null, null, null]);
  assert.equal(read.why, CROSSCHECK_NOTHING);
  assert.equal(read.why, 'No account counts as cash yet', 'true of a record with no account: none of none is counted');
  assert.deepEqual(about(k).drawn, [], 'no tile and no line: a check with no value is never read as a pass or drawn as one');
  const page = value<{ blocks: Block[] }>(k.page('money'));
  assert.deepEqual(page.blocks.filter((b) => b.drawn !== false && b.heading === 'Add an account').map((b) => b.kind), ['capture']);
});

/**
 * AN ACCOUNT THAT IS NOT CASH HAS A BALANCE, AND THE CHECK SAID NONE HAD BEEN TYPED.
 * One sentence is true of both days, so the reading says the same words before the account and after it, and nothing
 * has to tell the two apart.
 */
test('an account that is not cash is still nothing to check, and the reading says the same sentence as with no account', async () => {
  const k = await moneyCore();
  const before = checked(k).why;
  make(k, 'accounts', { name: 'Deposit', kind: 'bank', liquid: false, balance: money(900_000, 'GBP'), as_of: day(-30) });
  const read = checked(k);
  assert.deepEqual([read.value, read.unit, read.met], [null, null, null]);
  assert.equal(read.why, CROSSCHECK_NOTHING, 'the check said no balance was typed of an account that has one');
  assert.equal(read.why, before, 'two sentences for one day with nothing to check');
  /* AND THE PAGE SAYS NOTHING UNTRUE OF IT: no line of the check's own is drawn on either day. */
  assert.deepEqual(about(k).drawn, []);
});

/**
 * THE PAGE AND THE READING SAY ONE THING. Wherever Money's declared blocks speak of there being no cash to read, in a
 * line or in a tile's sentence for nothing to draw, the words are the reading's with a full stop, and the sentence
 * that was untrue is nowhere on the page.
 */
test('where the Money page says there is no cash to read, its words are the reading\'s, and it never says no balance was typed', async () => {
  const k = await moneyCore();
  const said = declared().flatMap((b) => [b.empty, b.body]).filter((t): t is string => typeof t === 'string');
  assert.deepEqual(said.filter((t) => /balance has been typed/.test(t)), [], 'the page says no balance was typed, which is untrue with an account that is not cash');
  const cash = declared().filter((b) => typeof b.empty === 'string' && /cash/i.test(b.empty));
  assert.deepEqual(cash.map((b) => [b.heading, b.empty]), [['What you have, by book', `${checked(k).why}.`]]);
});

test('a balance of nought is a balance: the check reads nought in its currency and the page says nothing', async () => {
  const k = await moneyCore();
  make(k, 'accounts', { name: 'Everyday account', kind: 'bank', balance: money(0, 'GBP'), as_of: day(-1) });
  assert.deepEqual([checked(k).value, checked(k).unit, checked(k).met], [0, 'GBP', true]);
  assert.deepEqual(about(k).drawn, []);
});

test('what the page says of the check is plain: no long dash, and none of the words a person never reads', async () => {
  const k = await moneyCore();
  write(k, false);
  const { all } = about(k);
  assert.equal(all.length, 1);
  for (const b of all) {
    const said = words(b);
    assert.ok(said.length > 20, said);
    assert.doesNotMatch(said, /[\u2014\u2013]/, said);
    assert.doesNotMatch(said, /\b(rows?|entity|entities|list items?|metric|cross-?check)\b/i, said);
  }
});
