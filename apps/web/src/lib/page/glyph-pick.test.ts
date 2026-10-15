/**
 * The picker's reading of the glyph set (PGS-A19), and the kernel's copy of the names held to the renderer's, so the
 * install and the drawer cannot drift: a glyph the picker offers is one the kernel installs.
 *
 * THE KERNEL'S LEAF IS READ BY ITS ADDRESS, as `marks-unknown.test.ts` reads the renderer's: the kernel's package entry
 * does not export it, and the app's own code never imports it (`glyphListsAgree` takes the copy as an argument).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { glyphGroups } from 'braindog-render';
import { GLYPH_LIST, glyphFault } from '@braindog/kernel';
import { PICK_GROUPS, glyphListsAgree, pickerGroups, pickerOrder, rendererGlyphList } from './glyph-pick.ts';

test("the kernel's list is the renderer's names and aliases, word for word and in order", () => {
  assert.deepEqual([...GLYPH_LIST], [...rendererGlyphList()]);
  assert.equal(glyphListsAgree(GLYPH_LIST), true);
  assert.equal(glyphListsAgree([...GLYPH_LIST, 'rokcet']), false, 'a name the renderer does not draw');
  assert.equal(glyphListsAgree(GLYPH_LIST.slice(1)), false, 'a name the copy lost');
});

test('an empty query lists every group, each under its heading', () => {
  const groups = pickerGroups('');
  const all = glyphGroups();
  assert.deepEqual(groups.map((g) => g.group), [...PICK_GROUPS]);
  assert.deepEqual(PICK_GROUPS, ['core', 'set']);
  assert.equal(pickerOrder(groups).length, all.core.length + all.set.length, 'every core and set glyph is offered');
  for (const g of groups) {
    assert.ok(g.heading.length > 0);
    assert.equal(g.heading[0], g.heading[0]!.toUpperCase());
    assert.doesNotMatch(g.heading, /\u2014/u, 'no em dash in a heading');
  }
});

test('every glyph offered installs, and none is offered twice', () => {
  const order = pickerOrder(pickerGroups());
  assert.equal(new Set(order).size, order.length);
  for (const name of order) {
    assert.match(name, /^[a-z][a-z0-9-]{0,31}$/u, `${name} fails the install's shape`);
    assert.equal(glyphFault(name), null, `${name} is refused`);
  }
  assert.ok(!order.includes('arrowUp'), 'a spelling with a capital is never offered');
});

test('a query narrows the groups over names and aliases', () => {
  const every = pickerOrder(pickerGroups()).length;
  const rocket = pickerOrder(pickerGroups('rock'));
  assert.ok(rocket.includes('rocket'));
  assert.ok(rocket.length < every);
  assert.ok(pickerOrder(pickerGroups('cake')).includes('gift'), 'an alias finds its glyph');
  assert.ok(pickerOrder(pickerGroups('home')).includes('house'), "the shell's name finds the core glyph it stands for");
  assert.ok(pickerOrder(pickerGroups('Invoice ')).includes('receipt-text'), 'case and spaces do not matter');
  assert.ok(pickerOrder(pickerGroups('trending up')).includes('trending-up'), 'a space reads as a dash');
  assert.deepEqual(pickerGroups('qqqqzzzz'), [], 'a word no glyph holds lists no group');
});
