/**
 * A block's own menu: every row it offers, the width it greys, and the one change each press makes to the page's look.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LiveLook } from '../record/page-live.ts';
import { actionsFor, editOf, hideBody, laidAfter, laidOf, placeOf, saidOf, words, type Laid, type MenuBlock } from './block-menu.ts';

const LATE: MenuBlock = { key: 'late', kind: 'todo', columns: 0, span: 12, name: 'Late', kindName: 'to-do list' };
const owner = { owner: true, area: null, first: false, last: false, hidden: false } as const;
const ids = (b: MenuBlock, at: Parameters<typeof actionsFor>[1]) => actionsFor(b, at).map((a) => a.id);

const laid = (...keys: string[]): Laid[] => keys.map((key) => ({ key, span: 12, drawn: true }));
const look = (over: Partial<LiveLook> = {}): LiveLook => ({
  page: null,
  basis: 'rules',
  lead: null,
  order: [],
  hide: [],
  headline: null,
  next: null,
  pinned: [],
  by: 'rule',
  kept: null,
  ...over,
});

test('THE ROWS IN ORDER: up, down, the five widths, Hide; and the other column only on a page that has one', () => {
  assert.deepEqual(ids(LATE, owner), ['up', 'down', 'width-12', 'width-8', 'width-6', 'width-4', 'width-3', 'hide']);
  assert.deepEqual(ids(LATE, { ...owner, area: 'main' }), ['up', 'down', 'rail', 'width-12', 'width-8', 'width-6', 'width-4', 'width-3', 'hide']);
  assert.deepEqual(ids(LATE, { ...owner, area: 'rail' }).slice(0, 3), ['up', 'down', 'main']);
  const rows = actionsFor(LATE, { ...owner, area: 'main' });
  assert.deepEqual(
    rows.map((a) => a.label),
    [words.up, words.down, words.rail, 'Whole', 'Two thirds', 'Half', 'Third', 'Quarter', words.hide],
  );
  assert.equal(actionsFor(LATE, { ...owner, area: 'rail' })[2]!.label, 'To the main column');
});

test('A MOVE WITH NOWHERE TO GO IS ABSENT, and a hidden block is offered Show', () => {
  assert.deepEqual(ids(LATE, { ...owner, first: true }).slice(0, 2), ['down', 'width-12']);
  assert.deepEqual(ids(LATE, { ...owner, last: true }).slice(0, 2), ['up', 'width-12']);
  assert.equal(ids(LATE, { ...owner, hidden: true }).at(-1), 'show');
});

test('A MEMBER IS OFFERED NOTHING, so no mark is drawn for one', () => {
  assert.deepEqual(actionsFor(LATE, { ...owner, owner: false }), []);
});

test('A WIDTH UNDER THE KIND\'S FLOOR IS THERE AND GREYED, with the reason; the width it has is marked', () => {
  const table: MenuBlock = { key: 'bills', kind: 'table', columns: 0, span: 6, name: 'Bills', kindName: 'table' };
  const rows = actionsFor(table, owner).filter((a) => a.span !== undefined);
  assert.deepEqual(rows.map((a) => a.span), [12, 8, 6, 4, 3]);
  assert.deepEqual(rows.filter((a) => a.disabled).map((a) => a.span), [4, 3]);
  assert.equal(rows.find((a) => a.span === 4)!.why, 'Too narrow for this table');
  assert.deepEqual(rows.filter((a) => a.current).map((a) => a.span), [6]);
  /* A FLOOR HANDED IN WINS: a table of five columns may only be whole. */
  const five = actionsFor(table, { ...owner, steps: [12] }).filter((a) => a.disabled).map((a) => a.span);
  assert.deepEqual(five, [8, 6, 4, 3]);
  assert.equal(editOf(rows.find((a) => a.span === 3)!, table, { laid: laid('bills') }), null, 'a greyed width changes nothing');
});

test('EACH PRESS IS ONE EDIT: the order, a width, a column, hidden', () => {
  const page = { laid: laid('cash', 'late', 'bills') };
  const pick = (id: string) => actionsFor(LATE, { ...owner, area: 'main' }).find((a) => a.id === id)!;
  assert.deepEqual(editOf(pick('up'), LATE, page), { order: ['late', 'cash', 'bills'] });
  assert.deepEqual(editOf(pick('down'), LATE, page), { order: ['cash', 'bills', 'late'] });
  assert.deepEqual(editOf(pick('width-6'), LATE, page), { span: 6 });
  assert.equal(editOf(pick('width-12'), LATE, page), null, 'the width it has is no change');
  assert.deepEqual(editOf(pick('rail'), LATE, page), { area: 'rail' });
  assert.deepEqual(editOf(pick('hide'), LATE, page), { hide: true });
  assert.deepEqual(editOf({ id: 'show', label: words.show }, LATE, page), { hide: false });
  assert.equal(editOf(pick('up'), { ...LATE, key: 'gone' }, page), null, 'a block the page does not lay');
});

test('A MOVE STEPS OVER THE OTHER COLUMN AND WHAT IS NOT DRAWN, and never past a heading', () => {
  const page: Laid[] = [
    { key: 'top', span: 12, drawn: true, kind: 'section' },
    { key: 'cash', span: 12, area: 'main', drawn: true },
    { key: 'side', span: 12, area: 'rail', drawn: true },
    { key: 'quiet', span: 12, area: 'main', drawn: false },
    { key: 'late', span: 12, area: 'main', drawn: true },
    { key: 'more', span: 12, drawn: true, kind: 'section' },
    { key: 'bills', span: 12, area: 'main', drawn: true },
  ];
  assert.deepEqual(editOf({ id: 'up', label: words.up }, LATE, { laid: page }), { order: ['top', 'late', 'cash', 'side', 'quiet', 'more', 'bills'] });
  assert.equal(editOf({ id: 'down', label: words.down }, LATE, { laid: page }), null);
  assert.deepEqual(placeOf(page, 'late', true), { first: false, last: true, area: 'main' });
  assert.deepEqual(placeOf(page, 'cash', true), { first: true, last: false, area: 'main' });
  assert.deepEqual(placeOf(page, 'side', true), { first: true, last: true, area: 'rail' });
  assert.equal(placeOf(page, 'late', false)!.area, null, 'no column to offer on a page with no side column');
});

test('THE PAGE AS LAID AFTER A PRESS is what the look is built from', () => {
  const page = laid('cash', 'late');
  assert.deepEqual(laidAfter(page, 'late', { order: ['late', 'cash'] }).map((l) => l.key), ['late', 'cash']);
  assert.equal(laidAfter(page, 'late', { span: 4 })[1]!.span, 4);
  assert.equal(laidAfter(page, 'late', { area: 'rail' })[1]!.area, 'rail');
  assert.equal(laidAfter(page, 'late', { span: 4 })[0]!.span, 12, 'the other blocks are as they were');
});

test('THE RECORD\'S ANSWER, LAID: keys a look may name, the width the board draws, the column on a page with one', () => {
  const blocks = [
    { kind: 'todo', key: 'late', span: 5 },
    { kind: 'table', key: 'bills', span: 2, columns: [1, 2, 3] },
    { kind: 'note', key: 'side', area: 'rail', drawn: false },
    { kind: 'note' },
  ];
  assert.deepEqual(laidOf(blocks, {}), [
    { key: 'late', span: 5, drawn: true, kind: 'todo' },
    { key: 'bills', span: 6, drawn: true, kind: 'table' },
    { key: 'side', span: 12, drawn: false, kind: 'note' },
  ]);
  assert.deepEqual(laidOf(blocks, { layout: { rail: 4 } }).map((l) => l.area), ['main', 'main', 'rail']);
});

test('HIDE IS THE LIVE LOOK PLUS ONE KEY: the owner\'s keeps all it held, the rules\' gives up its order and lines', () => {
  const own = look({ by: 'owner', order: ['cash', 'late'], hide: ['old'], pinned: ['cash', 'late'], headline: 'Cash is fine', lead: 'late' });
  const mine = hideBody('money', own, 'late', true);
  assert.equal(mine.look, 'money');
  assert.equal(mine.by, 'owner');
  assert.deepEqual(mine.hide, ['old', 'late']);
  assert.deepEqual(mine.pinned, ['cash'], 'a hidden block is pinned no longer');
  assert.deepEqual(mine.order, ['cash', 'late']);
  assert.equal(mine.lead, undefined, 'the block hidden leads no longer');
  assert.equal(mine.headline, 'Cash is fine');
  const rules = hideBody('money', look({ order: ['cash', 'late'], headline: 'Engine line', hide: ['old'] }), 'late', true);
  assert.deepEqual(rules.hide, ['late']);
  assert.equal(rules.order, undefined);
  assert.equal(rules.headline, undefined);
  assert.equal(hideBody('money', null, 'late', true).basis, 'pinned');
  assert.deepEqual(hideBody('money', own, 'old', false).hide ?? [], [], 'Show takes the key out again');
  assert.equal(hideBody('lists', look({ page: 'list-page' }), 'late', true).look, 'list-page', 'written under the page the look is laid over');
});

test('A HIDE KEEPS THE PERSON\'S OWN WIDTHS AND COLUMNS, and takes none from the rules', () => {
  const own = { ...look({ by: 'owner', order: ['late'] }), span: { late: 6 }, area: { late: 'main' } } as LiveLook;
  const mine = hideBody('money', own, 'cash', true);
  assert.deepEqual(mine.span, { late: 6 });
  assert.deepEqual(mine.area, { late: 'main' });
  const rules = hideBody('money', { ...look(), span: { late: 6 } } as LiveLook, 'cash', true);
  assert.equal(rules.span, undefined);
});

test('EACH PRESS SAYS WHAT IT DID, in the block\'s own name', () => {
  assert.equal(saidOf({ span: 6 }, 'Late'), 'Late is half the row.');
  assert.equal(saidOf({ span: 12 }, 'Late'), 'Late is the whole row.');
  assert.equal(saidOf({ span: 8 }, 'Late'), 'Late is two thirds of the row.');
  assert.equal(saidOf({ span: 3 }, 'Late'), 'Late is a quarter of the row.');
  assert.equal(saidOf({ area: 'rail' }, 'Late'), 'Late is in the side column.');
  assert.equal(saidOf({ area: 'main' }, 'Late'), 'Late is in the main column.');
  assert.equal(saidOf({ hide: true }, 'Late'), 'Late is hidden.');
  assert.equal(saidOf({ order: [] }, 'Late', 'down'), 'Late moved down.');
  assert.equal(saidOf({ order: [] }, '', 'up'), 'This block moved up.');
  for (const line of Object.values(words).map((w) => (typeof w === 'function' ? (w as (a: string, b: number) => string)('Late', 6) : w))) {
    assert.doesNotMatch(line, /—|\brow item\b|\bentity\b/u);
  }
});

test('THE MARK IS THE OWNER\'S, behind `?menu`, on a page that writes and is not being arranged, and loaded apart', async () => {
  const { readFile } = await import('node:fs/promises');
  const slot = await readFile(new URL('./BlockSlot.svelte', import.meta.url), 'utf8');
  const gate = slot.slice(slot.indexOf('const menuOn'), slot.indexOf(');', slot.indexOf('const menuOn')));
  for (const must of ['writes !== null', '!arranging', "searchParams.has('menu')", 'owner === true', 'menuSlug !== null']) assert.ok(gate.includes(must), must);
  assert.match(slot, /\{#if menuOn && writes && menuSlug\}[\s\S]*?import\('\.\/BlockMenu\.svelte'\)/u, 'by import(), never in the entry');
  assert.doesNotMatch(slot, /^\s*import BlockMenu/mu);
  const menu = await readFile(new URL('./BlockMenu.svelte', import.meta.url), 'utf8');
  assert.match(menu, /<Icon name="more" size="s" \/>/u);
  assert.match(menu, /lookOfArrangement\(/u);
  assert.match(menu, /writeLook\(/u);
});
