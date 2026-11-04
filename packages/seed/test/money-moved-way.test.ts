/**
 * A row of what moved says which way the money went (the look at f7a709ef, fault H: "rows do not say in or out, no
 * sign, no word"). On the owner's screen "Aman Services 185" read `EGP 700` whether it was paid or received.
 *
 * WHAT IS HELD HERE, the declaration's half: Money's Ledger tile, which is where Money says what moved since
 * money-core 3.17.0, and a book's What moved are both a timeline whose amount is signed by the Ledger's own Which way,
 * the record sends that field with every row, and two rows of one amount, one out and one in, are told apart by it.
 *
 * WHAT IS NOT HELD HERE: the drawing. A host writes the sign on the cell and a drawer draws the cell; this package
 * depends on neither. `said` below is the rule a host follows, written out so the two rows can be compared.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, REGISTERS, day, declarations, metricDeclarations, pageDeclarations } from '../src/index.ts';
import { MONEY_BOOK_PAGE } from '../src/modules/money/pages/book.ts';
import { MONEY_PAGE } from '../src/modules/money/pages/money.ts';
import { LEDGER, LEDGER_COLUMNS } from '../src/modules/money/pages/parts/ledger.ts';
import { MOVED_COLUMNS } from '../src/modules/money/pages/shared.ts';

type Column = { field: string; sign?: { field: string; minus: string } };
type Declared = { kind?: string; heading?: string; source?: string; columns?: Column[] };
type Row = { fields: Record<string, unknown> };
type Drawn = Declared & { refusals: readonly unknown[]; rows?: readonly Row[] };

/** How many cells a timeline draws: the day, the name and one detail. */
const TIMELINE_CELLS = 6;

/** Every place money-core lists what moved: [where a person reads it, the block]. */
const MOVED: [string, Declared][] = [
  ['Money', (MONEY_PAGE.blocks as Declared[]).find((b) => b.heading === 'Ledger')!],
  ['the Ledger tile', LEDGER[0] as Declared],
  ['a book', (MONEY_BOOK_PAGE.blocks as Declared[]).find((b) => b.heading === 'What moved')!],
];

/** A row's amount as a host says it under the column's `sign:`: `−` where the field holds the value that goes out, `+` otherwise. */
const said = (row: Row, column: Column): string => {
  const amount = row.fields[column.field] as { amount: number; currency: string };
  return `${row.fields[column.sign!.field] === column.sign!.minus ? '−' : '+'}${amount.currency} ${amount.amount}`;
};

const blocksOf = (k: Kernel, slug: string): Drawn[] => {
  const out = k.page(slug);
  assert.ok(out.ok, sayOf(out));
  return (out.value as unknown as { blocks: Drawn[] }).blocks;
};

test('EVERY LIST OF WHAT MOVED SIGNS ITS AMOUNT BY THE WAY THE MONEY WENT, on Money, on the Ledger tile and on a book', () => {
  const ledger = REGISTERS.transactions!.fields as { id: string; type: string; values?: string[]; labels?: Record<string, string> }[];
  for (const [where, block] of MOVED) {
    assert.ok(block, `${where} lists nothing that moved`);
    assert.equal(block.kind, 'timeline', where);
    assert.equal(block.source, 'register.transactions', where);
    assert.deepEqual(block.columns, where === 'a book' ? MOVED_COLUMNS : LEDGER_COLUMNS, `${where} lists what moved in columns of its own`);

    /* THE SIGN IS ON A CELL A TIMELINE DRAWS: a fourth column would be declared and never seen. */
    const columns = block.columns!;
    assert.ok(columns.length <= TIMELINE_CELLS, `${where} declares ${columns.length} columns, and a timeline draws ${TIMELINE_CELLS}`);
    const signed = columns.filter((c) => c.sign !== undefined);
    assert.deepEqual(signed.map((c) => c.field), ['amount'], `${where} signs something other than the one amount`);

    /* AND IT IS READ FROM THE LEDGER'S OWN WHICH WAY: an enum, the value named is the one that goes out, and there is
       another, each with a word a person reads. */
    const way = ledger.find((f) => f.id === signed[0]!.sign!.field);
    assert.equal(way?.type, 'enum', where);
    assert.ok(way!.values!.includes(signed[0]!.sign!.minus), `${where} takes the minus from a value the Ledger does not hold`);
    assert.ok(way!.values!.some((v) => v !== signed[0]!.sign!.minus), 'every entry would read as money out');
    assert.equal(way!.labels?.[signed[0]!.sign!.minus], 'Money out');
    assert.equal(way!.labels?.in, 'Money in');
  }
  /* MONEY'S IS THE TILE ITSELF, so the two cannot drift, WITH NO LINE OVER IT SINCE money-core 3.34.0 (aaf8e24df): "143 came in today." read as news on a record a minute old. */
  const { body: said, ...tile } = MOVED[1]![1] as Declared & { body?: string };
  assert.equal(said, '{{filed-today}} came in today.');
  assert.deepEqual(MOVED[0]![1], tile);
});

test('MONEY OUT AND MONEY IN OF ONE AMOUNT ON ONE DAY READ DIFFERENTLY, on Money and on a book', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([...declarations(), ...pageDeclarations(), ...metricDeclarations()]);
  assert.ok(installed.ok, sayOf(installed));
  const by = { actor: 'p_test' };
  const book = k.create('books', { name: 'Household' } as never, by);
  assert.ok(book.ok, sayOf(book));
  const account = k.create('accounts', { name: 'Current account', kind: 'bank', balance: { amount: 250_000, currency: 'GBP' }, as_of: day(0), liquid: true, book: book.value.id } as never, by);
  assert.ok(account.ok, sayOf(account));
  /* THE SAME AMOUNT, THE SAME DAY, so nothing but the way tells the two apart. */
  for (const [what, direction] of [['Rent', 'out'], ['Refund', 'in']]) {
    const moved = k.create('transactions', { what, on: day(-1), direction, amount: { amount: 90_000, currency: 'GBP' }, account: account.value.id, book: book.value.id, state: 'cleared' } as never, by);
    assert.ok(moved.ok, sayOf(moved));
  }

  for (const [where, slug, heading] of [['Money', 'money', 'Ledger'], ['a book', 'household', 'What moved']] as const) {
    const block = blocksOf(k, slug).find((b) => b.heading === heading);
    assert.ok(block, `${where} draws no ${heading}`);
    assert.deepEqual(block.refusals, [], where);
    const amount = block.columns!.find((c) => c.sign !== undefined)!;
    const rows = new Map((block.rows ?? []).map((r) => [String(r.fields.what), r]));
    assert.deepEqual([...rows.keys()].sort(), ['Refund', 'Rent'], where);

    /* THE RECORD SENDS THE WAY WITH THE ROW, though no column draws it: without it a host has nothing to sign by. */
    assert.equal(rows.get('Rent')!.fields[amount.sign!.field], 'out', where);
    assert.equal(rows.get('Refund')!.fields[amount.sign!.field], 'in', where);
    assert.deepEqual(rows.get('Rent')!.fields.amount, rows.get('Refund')!.fields.amount);

    assert.equal(said(rows.get('Rent')!, amount), '−GBP 90000', where);
    assert.equal(said(rows.get('Refund')!, amount), '+GBP 90000', where);
  }
});
