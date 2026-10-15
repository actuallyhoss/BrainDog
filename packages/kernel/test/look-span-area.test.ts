/**
 * A look's widths and columns (`compose.ts`, `span` and `area`, PGS-B07): the person's own look says how wide a block is
 * drawn and which column it sits in, so Done in Edit layout keeps them as his look and the page stays the add-on's.
 *
 * ONLY HIS. A rule's or Slash's look places nothing; the install refuses one that tries (`lookPlacesFault`), and the read
 * passes over what it would refuse, a key the page lacks, and a rail on a page with no layout (`applyLook`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyLook, lookOf, lookPlacesFault, mergeLook, LOOK_KEYS, LOOK_SPANS, type LookBody } from '../src/compose.ts';
import type { BlockResult } from '../src/pages.ts';

const block = (b: Partial<BlockResult> & { kind: string; key: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...b }) as BlockResult;

/** A page with a rail: a heading, two lists in the main column, and a figure in the rail. */
const RAILED = (): BlockResult[] => [
  block({ kind: 'section', key: 'top', heading: 'This week' }),
  block({ kind: 'table', key: 'ledger', source: 'register.ledger', heading: 'Ledger', span: 12 }),
  block({ kind: 'table', key: 'accounts', source: 'register.accounts', heading: 'Accounts', span: 12 }),
  block({ kind: 'stat', key: 'cash', heading: 'Cash', area: 'rail' }),
];

/** A page of one column: no layout, so nothing on it sits in a rail. */
const FLAT = (): BlockResult[] => [
  block({ kind: 'table', key: 'ledger', source: 'register.ledger', heading: 'Ledger', span: 12 }),
  block({ kind: 'table', key: 'accounts', source: 'register.accounts', heading: 'Accounts', span: 12 }),
];

const own = (more: Partial<LookBody>): LookBody => ({ look: 'books', basis: 'arranged', by: 'owner', ...more });
const at = (blocks: readonly BlockResult[], key: string): BlockResult => blocks.find((b) => b.key === key)!;

test('A LOOK MAY CARRY span AND area, and the widths are the board\'s five', () => {
  assert.ok(LOOK_KEYS.has('span') && LOOK_KEYS.has('area'));
  assert.deepEqual([...LOOK_SPANS], [12, 8, 6, 4, 3]);
});

test('HIS LOOK GIVES THE LEDGER SPAN 6 AND PUTS THE ACCOUNTS IN THE RAIL, and says so', () => {
  const read = RAILED();
  const out = applyLook(read, own({ span: { ledger: 6 }, area: { accounts: 'rail' } }));
  assert.equal(at(out.blocks, 'ledger').span, 6);
  assert.equal(at(out.blocks, 'accounts').area, 'rail');
  assert.equal(at(out.blocks, 'accounts').span, 12, 'a block he only moved keeps its own width');
  assert.equal(at(out.blocks, 'cash').area, 'rail');
  assert.deepEqual(out.look.span, { ledger: 6 });
  assert.deepEqual(out.look.area, { accounts: 'rail' });
  assert.deepEqual(out.blocks.map((b) => b.key), ['top', 'ledger', 'accounts', 'cash'], 'nothing is added, taken out or moved in the list');
  assert.equal(read[1]!.span, 12, 'the blocks handed in are not written on');
  assert.equal(read[2]!.area, undefined);
});

test('A BLOCK HE BRINGS BACK TO THE MAIN COLUMN says no area, as a page that names none does', () => {
  const out = applyLook(RAILED(), own({ area: { cash: 'main' } }));
  assert.equal(at(out.blocks, 'cash').area, undefined);
  assert.deepEqual(out.look.area, { cash: 'main' });
});

test('THE INSTALL REFUSES a span of 5, a third column word, a span on a rule look, and one on a Slash look', () => {
  const span5 = lookPlacesFault({ look: 'books', by: 'owner', span: { ledger: 5 } }, 'look.books');
  assert.equal(span5?.code, 'DECLARATION_INVALID');
  assert.equal(span5?.at, 'span.ledger');
  assert.match(span5?.fix ?? '', /12, 8, 6, 4, 3/u);
  const third = lookPlacesFault({ look: 'books', by: 'owner', area: { ledger: 'aside' } }, 'look.books');
  assert.equal(third?.at, 'area.ledger');
  const rule = lookPlacesFault({ look: 'books', by: 'rule', span: { ledger: 6 } }, 'look.books');
  assert.equal(rule?.at, 'span');
  const slash = lookPlacesFault({ look: 'books', by: 'slash', area: { ledger: 'rail' } }, 'look.books');
  assert.equal(slash?.at, 'area');
  assert.equal(lookPlacesFault({ look: 'books', by: 'owner', span: { 'Not A Key': 6 } }, 'look.books')?.at, 'span');
  assert.equal(lookPlacesFault({ look: 'books', by: 'owner', span: [6] }, 'look.books')?.at, 'span');
  assert.equal(lookPlacesFault({ look: 'books', by: 'owner', span: { ledger: 6 }, area: { ledger: 'rail' } }, 'look.books'), null);
  assert.equal(lookPlacesFault({ look: 'books', by: 'rule', order: ['ledger'] }, 'look.books'), null, 'a look that places nothing has nothing to refuse');
});

test('THE READ PASSES OVER WHAT THE INSTALL WOULD REFUSE, so a look that came in by another door still draws', () => {
  const read = RAILED();
  const bad = applyLook(read, own({ span: { ledger: 5, accounts: 4 }, area: { ledger: 'aside' as never } }));
  assert.equal(at(bad.blocks, 'ledger').span, 12);
  assert.equal(at(bad.blocks, 'accounts').span, 4);
  assert.deepEqual(bad.look.span, { accounts: 4 });
  assert.equal(bad.look.area, undefined);
  const rule = applyLook(read, { look: 'books', basis: 'b', by: 'rule', span: { ledger: 6 }, area: { accounts: 'rail' } });
  assert.equal(at(rule.blocks, 'ledger').span, 12, "a rule's look places nothing");
  assert.equal(at(rule.blocks, 'accounts').area, undefined);
  assert.equal(rule.look.span, undefined);
  const stored = lookOf({ look: 'books', basis: 'b', by: 'slash', span: { ledger: 6 } });
  assert.equal(stored?.span, undefined, "a Slash look read off the record carries no width");
});

test('A KEY THE PAGE LACKS CHANGES NOTHING, nor does a heading', () => {
  const read = RAILED();
  const out = applyLook(read, own({ span: { gone: 6, top: 4 }, area: { gone: 'rail', top: 'rail' } }));
  assert.deepEqual(out.blocks, read);
  assert.equal(out.look.span, undefined);
  assert.equal(out.look.area, undefined);
});

test('A RAIL ON A PAGE WITH NO LAYOUT IS PASSED OVER, and its width still holds', () => {
  const out = applyLook(FLAT(), own({ span: { ledger: 8 }, area: { ledger: 'rail' } }));
  assert.equal(at(out.blocks, 'ledger').area, undefined);
  assert.equal(at(out.blocks, 'ledger').span, 8);
  assert.equal(out.look.area, undefined);
  const said = applyLook(FLAT(), own({ area: { ledger: 'rail' } }), { layout: true });
  assert.equal(at(said.blocks, 'ledger').area, 'rail', 'a host that says the page has a layout gets the rail');
  const none = applyLook(RAILED(), own({ area: { ledger: 'rail' } }), { layout: false });
  assert.equal(at(none.blocks, 'ledger').area, undefined, 'and one that says it has none does not');
});

test('HIS WIDTHS AND COLUMNS STAND OVER THE ENGINE\'S LOOK, which brings none of its own', () => {
  const engine: LookBody = { look: 'books', basis: 'rules', by: 'rule', order: ['accounts', 'ledger'], span: { accounts: 3 } as never };
  const merged = mergeLook(own({ span: { ledger: 6 }, area: { accounts: 'rail' } }), engine);
  assert.deepEqual(merged.span, { ledger: 6 });
  assert.deepEqual(merged.area, { accounts: 'rail' });
  assert.deepEqual(mergeLook(own({}), engine).span, undefined);
  const read = lookOf({ look: 'books', basis: 'b', by: 'owner', span: { ledger: 6, accounts: 7 }, area: { accounts: 'rail', cash: 'side' } });
  assert.deepEqual(read?.span, { ledger: 6 });
  assert.deepEqual(read?.area, { accounts: 'rail' });
});
