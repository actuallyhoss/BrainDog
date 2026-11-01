/**
 * Money's ledger tile: a ledger to add to, edit and delete from, and no tabs. What moved was
 * twelve lines folded shut inside History, and a person went looking for their transactions.
 *
 * WHAT IS HELD HERE: the tile is on Money's page under the accounts and above the fold, it draws the six newest
 * entries of the Ledger newest first, every line is an entry of the Ledger a host can open, and a record whose Ledger
 * holds nothing draws no tile. The tile is gated by its own entries: one that has not cleared
 * draws it, a void one alone does not, and it carries its own empty line. The add is declared beside it and is NOT on
 * the page yet, for the two reasons `parts/ledger.ts` gives; the last test fails the day either reason is gone, so the
 * box is not forgotten.
 *
 * WHO WAS PAID, ON THE TILE. The record keeps a payee by the name a person reads beside the bank's own
 * line, and the tile says the payee, and the description where an entry holds none. The three tests at the foot hold
 * the two lines, what did not move with them (the day, the signed amount, the order), and why the column names a
 * second field: a payee column alone is an empty cell on every entry a person typed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, REGISTERS, TRANSACTIONS, day, declarations, installSeed, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { ADD_MOVEMENT, LEDGER, LEDGER_LINES } from '../src/modules/money/pages/parts/ledger.ts';

type Column = { field: string; or?: string; sign?: { field: string; minus: string } };
type Drawn = { kind?: string; heading?: string; drawn?: boolean; refusals: readonly unknown[]; columns?: readonly Column[]; rows?: readonly { id: string; seq: number; fields: Record<string, unknown> }[] };

const drawn = (k: Kernel): Drawn[] => {
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  return (out.value as unknown as { blocks: Drawn[] }).blocks;
};

const declared = MONEY_PAGE.blocks as { kind: string; heading?: string; area?: string; fold?: boolean; source?: string; register?: string }[];

test('THE LEDGER IS A TILE ON MONEY, under the accounts and above the fold, and it is not said twice', () => {
  const at = declared.findIndex((b) => b.heading === 'Ledger');
  assert.ok(at >= 0, 'Money declares no Ledger tile');
  /* THE PART ITSELF, WITH NO LINE OVER ITS LINES ON THE HOME SINCE money-core 3.34.0: "143 came in today." read as news
     on a record a minute old. The line stays declared on the part. */
  const { body: _line, ...tile } = LEDGER[0]!;
  assert.deepEqual(declared[at], tile);
  assert.ok(at > declared.findIndex((b) => b.heading === 'Accounts'), 'the Ledger is above the accounts');
  assert.ok(declared.every((b, i) => b.fold !== true || at < i), 'the Ledger is under a fold, where he went looking for it');
  assert.equal(declared[at]!.area, undefined, 'the Ledger is in the side column, which is too narrow for a day, a name and an amount');
  /* ONE READING OF THE LEDGER ON THE PAGE: History gave up the twelve it folded, which were these six and six more. The
     bar of who was paid under Where it went (money-where-it-went-100) reads the same list as sums by payee, not as
     entries, so it is not a second Ledger. */
  assert.deepEqual(declared.filter((b) => b.source === 'register.transactions' && b.kind !== 'bar').map((b) => b.heading), ['Ledger']);
  assert.ok(declared.length <= 24, `Money declares ${declared.length} blocks, and a page holds 24`);
});

test('IT DRAWS THE SIX NEWEST ENTRIES, NEWEST FIRST, and each line is an entry a host can open', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const seeded = await installSeed(k);
  assert.ok(seeded.ok, sayOf(seeded));
  const tile = drawn(k).find((b) => b.heading === 'Ledger');
  assert.ok(tile, 'the page draws no Ledger');
  assert.deepEqual(tile.refusals, []);
  assert.notEqual(tile.drawn, false, 'a record with a Ledger draws no Ledger tile');
  const rows = tile.rows ?? [];
  assert.equal(rows.length, LEDGER_LINES);
  assert.equal(LEDGER_LINES, 6);

  /* THE SIX NEWEST THE LEDGER HOLDS, void ones left out as a ledger a person reads leaves them out. */
  const days = TRANSACTIONS.filter((t) => t.state !== 'void').map((t) => String(t.on)).sort().reverse().slice(0, LEDGER_LINES);
  assert.ok(days[0]! > days[LEDGER_LINES - 1]!, 'the sample holds its six newest on one day, so newest first proves nothing');
  assert.deepEqual(rows.map((r) => String(r.fields.on)), days);

  /* EACH LINE OPENS ITS ENTRY: the row names an entry of the Ledger by its own id, which is what a host opens. */
  for (const r of rows) {
    const entry = k.get(r.id);
    assert.ok(entry, `${r.id} names no entry`);
    assert.equal(entry.register, 'transactions');
    assert.equal(entry.seq, r.seq);
    assert.equal(entry.fields.what, r.fields.what);
  }
});

test('A RECORD WHOSE LEDGER HOLDS NOTHING DRAWS NO LEDGER TILE, and draws it from the first entry on', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations()]);
  assert.ok(installed.ok, sayOf(installed));
  /* A RECORD WITH NO ACCOUNT YET reads its line and the box to add one, and no tile saying nothing has moved. */
  assert.equal(drawn(k).find((b) => b.heading === 'Ledger')?.drawn, false, 'a record with no account draws an empty Ledger');
  const account = k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 250_000, currency: 'GBP' }, as_of: day(0), liquid: true } as never, { actor: 'p_test' });
  assert.ok(account.ok, sayOf(account));
  const before = drawn(k).find((b) => b.heading === 'Ledger');
  assert.ok(before, 'the page holds no Ledger');
  assert.deepEqual(before.refusals, []);
  assert.equal(before.drawn, false, 'an empty Ledger is drawn as a tile');

  const moved = k.create(
    'transactions',
    { what: 'Rent', on: day(-1), direction: 'out', amount: { amount: 90_000, currency: 'GBP' }, account: account.value.id, state: 'cleared' } as never,
    { actor: 'p_test' },
  );
  assert.ok(moved.ok, sayOf(moved));
  const after = drawn(k).find((b) => b.heading === 'Ledger');
  assert.notEqual(after?.drawn, false, 'the first entry draws no Ledger');
  assert.deepEqual((after?.rows ?? []).map((r) => r.fields.what), ['Rent']);
});

test('AN ENTRY THAT HAS NOT CLEARED DRAWS THE LEDGER, and a void one alone does not', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations()]);
  assert.ok(installed.ok, sayOf(installed));
  const account = k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 250_000, currency: 'GBP' }, as_of: day(0), liquid: true } as never, { actor: 'p_test' });
  assert.ok(account.ok, sayOf(account));
  const move = (what: string, state: string) => {
    const made = k.create(
      'transactions',
      { what, on: day(0), direction: 'out', amount: { amount: 4_500, currency: 'GBP' }, account: account.value.id, state } as never,
      { actor: 'p_test' },
    );
    assert.ok(made.ok, sayOf(made));
  };

  /* A VOID ENTRY IS NOT ON THE LEDGER A PERSON READS, so a Ledger holding only one is still a Ledger holding nothing. */
  move('Card charged twice', 'void');
  const voided = drawn(k).find((b) => b.heading === 'Ledger');
  assert.deepEqual(voided?.refusals, []);
  assert.equal(voided?.drawn, false, 'a void entry alone draws the Ledger');

  /* THE CARD PAYMENT OF THIS MORNING, which the bank has not cleared: he typed it, and it is on the page. The gate
     was a figure that reads cleared entries alone, so the tile stayed away until the bank caught up. */
  move('Coffee beans', 'pending');
  const waiting = drawn(k).find((b) => b.heading === 'Ledger');
  assert.notEqual(waiting?.drawn, false, 'an entry that has not cleared draws no Ledger');
  assert.deepEqual((waiting?.rows ?? []).map((r) => r.fields.what), ['Coffee beans']);
});

test('THE LEDGER SAYS ITS OWN EMPTY LINE, and is gated by what it holds and by no figure', () => {
  const tile = LEDGER[0] as { when?: unknown; where?: unknown; empty?: unknown };
  assert.equal(tile.when, undefined, 'the Ledger waits on a figure again: a figure over cleared entries hides one that has not cleared');
  assert.equal(tile.where, 'state is not void');
  assert.equal(typeof tile.empty, 'string');
  assert.ok(String(tile.empty).trim().length > 0 && tile.empty !== 'keep', 'the Ledger has no line to say when it holds nothing');
  assert.ok(!/[\u2014\u2013]/u.test(String(tile.empty)), 'a dash in a line a person reads');
});

test('ADD A MOVEMENT IS DECLARED AND WAITS: one line cannot say an amount, an account and a day', async () => {
  assert.deepEqual(
    ADD_MOVEMENT.map((b) => [b.kind, b.heading, b.register]),
    [['capture', 'Add a movement', 'transactions']],
  );
  /* WHAT A MOVEMENT IS: a description, a day, an amount and the account it moved through, all four required by the
     Ledger itself. A capture is one typed line (the description) and a host fills a required day and amount at their
     emptiest; an account is a link, which no line fills, so the record refuses the entry. */
  const ledger = REGISTERS.transactions!;
  const required = new Map(ledger.fields.filter((f) => f.required === true).map((f) => [f.id, f.type]));
  assert.equal(ledger.title, 'what');
  for (const id of ['what', 'on', 'amount', 'account']) assert.ok(required.has(id), `the Ledger does not require ${id}`);
  /* THE DAY THIS FAILS, PLACE IT: either the page has room, or the Ledger stopped requiring a link a line cannot give. */
  assert.equal(required.get('account'), 'ref');
  /* AND THE RECORD SAYS SO ITSELF: what a host makes of a typed line, the words, today and an amount of nought, is
     refused for the account it cannot give. A box on the page would be refused at every press, so it is not there. */
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations()]);
  assert.ok(installed.ok, sayOf(installed));
  const typed = k.create('transactions', { what: 'Coffee beans', on: day(0), direction: 'out', amount: { amount: 0, currency: 'GBP' }, state: 'cleared' } as never, { actor: 'p_test' });
  assert.equal(typed.ok, false, 'the Ledger takes an entry with no account now: place ADD_MOVEMENT');
  assert.match(sayOf(typed), /account/iu);
  /* THE PAGE HAS ROOM SINCE money-core 3.29.0, a page per job, so the one reason left is the account a line cannot give: a
     movement is added from the sheet the app opens, which asks for one. */
  assert.ok(!declared.some((b) => b.kind === 'capture' && b.register === 'transactions'), 'Add a movement is on the page: say so here and in parts/ledger.ts');
});

/**
 * What a line of a timeline says for its name: its second cell, the value of the second column's field, and of the
 * field its `or:` names where the first holds nothing (`toRows` in the app's `record/api.ts`; the record hands over
 * both). A column with no `or:` over a field holding nothing is an empty cell.
 */
const named = (tile: Drawn, row: { fields: Record<string, unknown> }): string => {
  const column = tile.columns?.[1];
  const said = (field: string | undefined): string => {
    const value = row.fields[field ?? ''];
    return typeof value === 'string' ? value : '';
  };
  return said(column?.field) || said(column?.or);
};

/** A record with one account and two entries: one a bank door filed, with its payee, and one a person typed. */
async function paidAndTyped(extra: unknown[] = []): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations(), ...(extra as never[])]);
  assert.ok(installed.ok, sayOf(installed));
  const account = k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 250_000, currency: 'GBP' }, as_of: day(0), liquid: true } as never, { actor: 'p_test' });
  assert.ok(account.ok, sayOf(account));
  const move = (fields: Record<string, unknown>) => {
    const made = k.create('transactions', { direction: 'out', account: account.value.id, state: 'cleared', ...fields } as never, { actor: 'p_test' });
    assert.ok(made.ok, sayOf(made));
  };
  /* AS THE BANK WROTE IT, with the processor's reference on its tail, and the name the record read out of it. */
  move({ what: 'CHILLOUT CAFE 4471 REF 99812', payee: 'Chillout', on: day(0), amount: { amount: 4_500, currency: 'GBP' } });
  move({ what: 'Rent', on: day(-1), amount: { amount: 90_000, currency: 'GBP' } });
  return k;
}

/* A LINE STRIPS A TRAILING PROCESSOR REFERENCE: a person reads who they paid, and the bank's own line only where
   nothing better is known. */
test('A LINE SAYS WHO WAS PAID, and an entry a person typed, with no payee, says its description', async () => {
  const k = await paidAndTyped();
  const tile = drawn(k).find((b) => b.heading === 'Ledger');
  assert.ok(tile, 'the page draws no Ledger');
  assert.deepEqual(tile.refusals, []);
  assert.deepEqual((tile.rows ?? []).map((r) => named(tile, r)), ['Chillout', 'Rent']);
});

test('THE DAY, THE SIGNED AMOUNT AND THE ORDER ARE THE LEDGER\'S, whatever its name comes to say', async () => {
  const k = await paidAndTyped();
  const tile = drawn(k).find((b) => b.heading === 'Ledger');
  assert.ok(tile, 'the page draws no Ledger');
  const columns = tile.columns ?? [];
  /* THE THREE A LIST OF LINES ALWAYS DRAWS, then the category, the account and the category's chip for the row's quiet line. */
  assert.equal(columns.length, 6);
  assert.deepEqual(columns[0], { field: 'on' });
  assert.deepEqual(columns[1], { field: 'payee', or: 'what' });
  assert.deepEqual(columns[2], { field: 'amount', sign: { field: 'direction', minus: 'out' } });
  assert.deepEqual((LEDGER[0] as { order?: unknown }).order, [{ field: 'on', dir: 'desc' }]);
  assert.deepEqual((tile.rows ?? []).map((r) => String(r.fields.on)), [day(0), day(-1)]);
  assert.deepEqual((tile.rows ?? []).map((r) => (r.fields.amount as { amount: number }).amount), [4_500, 90_000]);
});

/* WHY THE COLUMN NAMES A SECOND FIELD, MEASURED. The same Ledger with the payee alone as its name: the line a bank
   door filed reads well, and the line a person typed says nothing at all, which is worse than the bank's words. */
test('A PAYEE COLUMN ALONE SAYS NOTHING FOR AN ENTRY WITH NO PAYEE, so the tile falls back to the description', async () => {
  const probe = {
    id: 'page.ledger-payee-probe',
    kind: 'page',
    body: {
      page: 'ledger-payee-probe',
      title: 'Probe',
      blocks: [{ ...LEDGER[0], body: undefined, columns: [{ field: 'on' }, { field: 'payee' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }] }],
    },
  };
  const k = await paidAndTyped([probe]);
  const out = k.page('ledger-payee-probe');
  assert.ok(out.ok, sayOf(out));
  const tile = (out.value as unknown as { blocks: Drawn[] }).blocks[0]!;
  assert.deepEqual(tile.refusals, []);
  assert.deepEqual((tile.rows ?? []).map((r) => named(tile, r)), ['Chillout', '']);
  /* AND THE TILE AS IT SHIPS says the payee, and the words typed where there is none. The bank's own line is still on
     the entry, for a host that opens it. */
  const shipped = drawn(k).find((b) => b.heading === 'Ledger');
  assert.ok(shipped, 'the page draws no Ledger');
  assert.deepEqual((shipped.rows ?? []).map((r) => named(shipped, r)), ['Chillout', 'Rent']);
  assert.deepEqual((shipped.rows ?? []).map((r) => r.fields.what), ['CHILLOUT CAFE 4471 REF 99812', 'Rent']);
});
