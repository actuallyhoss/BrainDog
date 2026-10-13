/**
 * Money's ledger tile (REC-B15 job 4). "Ledger, add, edit, delete" and "I hate this tabs" (the owner): what moved was
 * twelve lines folded shut inside History, and he "went looking for his transactions".
 *
 * WHAT IS HELD HERE: the tile is on Money's page under the accounts and above the fold, it draws the six newest
 * entries of the Ledger newest first, every line is an entry of the Ledger a host can open, and a record whose Ledger
 * holds nothing draws no tile. The add is declared beside it and is NOT on the page yet, for the two reasons
 * `parts/ledger.ts` gives; the last test fails the day either reason is gone, so the box is not forgotten.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, REGISTERS, TRANSACTIONS, day, declarations, installSeed, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { ADD_MOVEMENT, LEDGER, LEDGER_LINES } from '../src/modules/money/pages/parts/ledger.ts';

type Drawn = { kind?: string; heading?: string; drawn?: boolean; refusals: readonly unknown[]; rows?: readonly { id: string; seq: number; fields: Record<string, unknown> }[] };

const drawn = (k: Kernel): Drawn[] => {
  const out = k.page('money');
  assert.ok(out.ok, sayOf(out));
  return (out.value as unknown as { blocks: Drawn[] }).blocks;
};

const declared = MONEY_PAGE.blocks as { kind: string; heading?: string; area?: string; fold?: boolean; source?: string; register?: string }[];

test('THE LEDGER IS A TILE ON MONEY, under the accounts and above the fold, and it is not said twice', () => {
  const at = declared.findIndex((b) => b.heading === 'Ledger');
  assert.ok(at >= 0, 'Money declares no Ledger tile');
  assert.deepEqual(declared[at], LEDGER[0]);
  assert.ok(at > declared.findIndex((b) => b.heading === 'Accounts'), 'the Ledger is above the accounts');
  assert.ok(at < declared.findIndex((b) => b.fold === true), 'the Ledger is under a fold, where he went looking for it');
  assert.equal(declared[at]!.area, undefined, 'the Ledger is in the side column, which is too narrow for a day, a name and an amount');
  /* ONE READING OF THE LEDGER ON THE PAGE: History gave up the twelve it folded, which were these six and six more. */
  assert.deepEqual(declared.filter((b) => b.source === 'register.transactions').map((b) => b.heading), ['Ledger']);
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

test('ADD A MOVEMENT IS DECLARED AND WAITS: one line cannot say an amount, an account and a day', () => {
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
  assert.equal(declared.length, 24, 'Money has room now: place ADD_MOVEMENT under the Ledger once a capture can ask for an account');
  assert.ok(!declared.some((b) => b.kind === 'capture' && b.register === 'transactions'), 'Add a movement is on the page: say so here and in parts/ledger.ts');
});
