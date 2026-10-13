/**
 * A HOLE IN A LOOK'S HEADLINE (`fillHoles`, `applyLook`): the line a model wrote says `{{open}}` where its number goes,
 * and the read fills it from the figures the page shows now.
 *
 * A number the model typed could be right the night it was written and wrong by morning, or right and in the wrong
 * sentence. A hole is neither: it is filled each time the page is read, in the form the page prints the figure, and one
 * that names no figure of the page drops the line, so the rules' line stands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyedBlocks } from '../src/block-keys.ts';
import { applyLook, figureSaid, figuresOf, fillHoles, holesIn, lookOf, type LookBody } from '../src/compose.ts';
import { validate, type Declaration } from '../src/declare.ts';
import type { BlockResult, PageRow } from '../src/pages.ts';

const row = (register: string, seq: number, fields: Record<string, unknown>): PageRow => ({
  id: `01K${register.toUpperCase()}${seq}`,
  register,
  seq,
  fields: fields as PageRow['fields'],
  state: 'open',
  version: 1,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-01T09:00:00.000Z',
  deleted_at: null,
});
const block = (b: Partial<BlockResult> & { kind: string; body?: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...b }) as BlockResult;
const look = (rest: Partial<LookBody>): LookBody => ({ look: 'money', basis: 'x', by: 'slash', ...rest });

const bills = block({ kind: 'table', source: 'register.bills', heading: 'Bills', rows: [row('bills', 1, { what: 'Rent' })], matched: 1 });
const notes = block({ kind: 'table', source: 'register.notes', heading: 'Notes', rows: [row('notes', 1, { what: 'x' })], matched: 1 });
/** A page whose lead note reads the figure `open` as `open`, and owes `owed`. */
const pageOf = (open: number, more: Record<string, unknown> = {}): BlockResult[] =>
  keyedBlocks([block({ kind: 'note', lead: true, body: '{{open}} bill(s) open', values: { open, ...more } as never }), bills, notes]);

test('A HOLE IS FILLED FROM THE FIGURE THE PAGE SHOWS NOW, so the same look says 3 today and 5 tomorrow', () => {
  const stored = look({ headline: '{{open}} bills are late' });
  assert.equal(applyLook(pageOf(3), stored).look.headline, '3 bills are late');
  assert.equal(applyLook(pageOf(5), stored).look.headline, '5 bills are late');
  /* Spaces inside the braces are the same hole, and a hole named twice is filled twice. */
  assert.equal(applyLook(pageOf(3), look({ headline: '{{ open }} late, {{open}} in all' })).look.headline, '3 late, 3 in all');
});

test('A HOLE THAT NAMES NO FIGURE OF THE PAGE DROPS THE LINE, so the rules line stands, and the rest of the look is kept', () => {
  const blocks = pageOf(3);
  const [, billsKey, notesKey] = blocks.map((b) => b.key!);
  const out = applyLook(blocks, look({ headline: '{{overdue}} bills are late', order: [notesKey!, billsKey!], hide: [notesKey!], next: { row: 'bills#1', text: 'Pay the rent' } }));
  assert.equal(out.look.headline, undefined);
  assert.deepEqual(out.look.order, [notesKey, billsKey]);
  assert.deepEqual(out.look.hide, [notesKey]);
  assert.deepEqual(out.look.next, { row: 'bills#1', text: 'Pay the rent' });
  /* One hole of two unfilled drops the whole line: half a sentence is no line. */
  assert.equal(applyLook(blocks, look({ headline: '{{open}} open and {{overdue}} late' })).look.headline, undefined);
  /* And a figure the page holds no value for is no figure to say. */
  assert.equal(applyLook(pageOf(3, { owed: null }), look({ headline: '{{owed}} is owed' })).look.headline, undefined);
});

test('A HEADLINE WITH NO HOLE IS UNCHANGED', () => {
  assert.equal(applyLook(pageOf(3), look({ headline: 'Rent is late' })).look.headline, 'Rent is late');
  assert.equal(applyLook(pageOf(3), look({})).look.headline, undefined);
  assert.equal(fillHoles('Rent is late', {}), 'Rent is late');
});

test('A FIGURE IS WRITTEN AS THE PAGE PRINTS IT: money in its own decimals, each currency on its own, never added', () => {
  assert.equal(figureSaid(1234.5), '1,234.5');
  assert.equal(figureSaid({ amount: 3385000, currency: 'GBP' }), 'GBP 33,850.00');
  assert.equal(figureSaid({ amount: 129900, currency: 'JPY' }), 'JPY 129,900');
  assert.equal(figureSaid({ amount: -500, currency: 'gbp' }), 'GBP −5.00');
  assert.equal(figureSaid([{ amount: 1000, currency: 'GBP' }, { amount: 2000, currency: 'USD' }]), 'GBP 10.00 · USD 20.00');
  assert.equal(figureSaid('+8% on last month'), '+8% on last month');
  assert.equal(figureSaid(''), null);
  assert.equal(figureSaid(null), null);
  assert.equal(figureSaid([]), null);
  assert.equal(figureSaid(undefined), null);
  /* A nought is 0 however it was reached, and a money with no currency or no finite amount is no figure to say. */
  assert.equal(figureSaid(-0), '0');
  assert.equal(figureSaid({ amount: 100, currency: '' }), null);
  assert.equal(figureSaid({ amount: Number.NaN, currency: 'GBP' } as never), null);
  const blocks = pageOf(3, { owed: { amount: 3385000, currency: 'GBP' }, 'owed.change': 'up 8%' });
  assert.equal(applyLook(blocks, look({ headline: '{{owed}} is owed, {{owed.change}}' })).look.headline, 'GBP 33,850.00 is owed, up 8%');
});

test("THE FIGURES ARE THE PAGE'S OWN, from every block that is drawn and refused nothing, the first to say one winning", () => {
  const blocks = keyedBlocks([
    block({ kind: 'note', lead: true, body: '{{open}} open', values: { open: 3 } as never }),
    block({ kind: 'note', body: '{{late}} late', values: { late: 2, open: 9 } as never }),
    block({ kind: 'note', body: '{{gone}}', drawn: false, values: { gone: 7 } as never }),
    block({ kind: 'note', body: '{{bad}}', refusals: [{ code: 'DECLARATION_INVALID' } as never], values: { bad: 1 } as never }),
    bills,
  ]);
  assert.deepEqual(figuresOf(blocks), { open: 3, late: 2 });
  assert.equal(applyLook(blocks, look({ headline: '{{late}} of {{open}} are late' })).look.headline, '2 of 3 are late');
  assert.equal(applyLook(blocks, look({ headline: '{{gone}} went' })).look.headline, undefined);
  /* A figure named like something every object has is still no figure of the page. */
  assert.equal(fillHoles('{{constructor}} and {{toString}}', figuresOf(blocks)), null);
  assert.deepEqual(holesIn('{{late}} of {{ open }}, {{late}}'), ['late', 'open']);
  const odd = figuresOf([block({ kind: 'note', body: 'x', values: JSON.parse('{"__proto__":{"amount":1,"currency":"GBP"},"a":1}') as never })]);
  assert.deepEqual(odd, { a: 1 });
  assert.equal(Object.getPrototypeOf(odd), Object.prototype);
});

test('A LINE WHOSE FILL IS TOO LONG, OR IS NOT ONE PLAIN LINE, IS DROPPED TOO', () => {
  assert.equal(fillHoles('{{a}} is owed', { a: 'x'.repeat(201) }), null);
  assert.equal(fillHoles('{{a}} is owed', { a: 'two\nlines' }), null);
  assert.equal(fillHoles('{{a}} is owed', { a: '{{b}}', b: 4 }), null);
  /* A brace that is not a hole is left for no reader: a look stored before the check knew holes may hold one. */
  assert.equal(fillHoles('{open} bills', { open: 3 }), null);
  assert.equal(fillHoles('{{open}} bills }}', { open: 3 }), null);
});

test('THE OWNER\'S LOOK IS FILLED THE SAME WAY, and a stored look reads back with its holes', () => {
  assert.equal(applyLook(pageOf(4), look({ by: 'owner', headline: '{{open}} to pay' })).look.headline, '4 to pay');
  assert.equal(lookOf({ look: 'money', basis: 'x', by: 'slash', headline: '{{open}} bills are late' })!.headline, '{{open}} bills are late');
});

const decl = (headline: unknown): Declaration => ({ id: 'look.desk', kind: 'look', body: { look: 'desk', basis: 'b1', by: 'slash', headline } as never });
const at = (headline: unknown): [string, string | undefined] | null => {
  const r = validate(decl(headline));
  return r ? [r.code, r.at] : null;
};

test("THE LOOK'S CHECK ACCEPTS A HOLE, and still refuses any other brace or markup", () => {
  assert.equal(at('{{open}} bills are late'), null);
  assert.equal(at('{{ book-cash:Kiln }} in the bank, {{owed.change}}'), null);
  assert.equal(at('Two things are late'), null);
  for (const bad of ['{open} bills', '{{open} bills', '{{}} bills', '{{open bills}} late', '{{open}} bills }}', '{{{open}}} bills', '**3** bills', '[Bills](/bills) are late', '`3` bills', '<b>3</b> bills', 'Three bills\nare late'])
    assert.deepEqual(at(bad), ['DECLARATION_INVALID', 'headline'], bad);
  /* The refusal says what a hole is, in a sentence. */
  assert.match(validate(decl('{open} bills'))!.fix, /\{\{/u);
  assert.deepEqual(at('x'.repeat(201)), ['OUT_OF_BOUNDS', 'headline']);
});
