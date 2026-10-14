/**
 * The glyph names by group are read back from the registry, so what this holds is that the reading lost nothing,
 * offered no control as a mark, and named nothing the registry does not draw.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CORE } from './core.ts';
import { SET } from './set.ts';
import { SHELL } from './aliases.ts';
import { CONTROLS, CONTROL_GLYPHS, GLYPH_NAMES, isMark } from './names.ts';
import { GLYPH_GROUPS, GROUP_SAYS, glyphGroups, groupOf, markGlyphs, markGroups } from './groups.ts';

test('no control glyph is offered as a mark, under any of its names', () => {
  const marks = markGlyphs();
  for (const control of CONTROLS) assert.ok(!marks.includes(control), `${control} is a control and offered as a mark`);
  for (const name of marks) {
    assert.ok(!CONTROL_GLYPHS.has(name), `${name} is a control`);
    assert.ok(isMark(name), `${name} is offered and isMark refuses it`);
  }
});

test('every name offered exists in the registry, once, in the group it is drawn from', () => {
  const groups = glyphGroups();
  const seen = new Set<string>();
  for (const group of GLYPH_GROUPS) {
    for (const name of groups[group]) {
      assert.ok(GLYPH_NAMES.has(name), `${name} is no glyph`);
      assert.ok(!seen.has(name), `${name} is in two groups`);
      seen.add(name);
      assert.equal(groupOf(name), group);
    }
  }
  assert.deepEqual([...seen].sort(), [...GLYPH_NAMES].sort(), 'a registered name is in no group');
  assert.deepEqual(groups.core, Object.keys(CORE), 'the core in core.ts order');
  assert.deepEqual([...groups.set].sort(), Object.keys(SET).sort(), 'the set is every name of set.ts');
  for (const name of groups.shell) assert.ok(Object.hasOwn(SHELL, name), `${name} is no shell name`);
});

test('the marks are every glyph that may be a mark, by group, in the groups\' order', () => {
  const groups = markGroups();
  const all = glyphGroups();
  for (const group of GLYPH_GROUPS) assert.deepEqual(groups[group], all[group].filter(isMark));
  assert.deepEqual(markGlyphs(), GLYPH_GROUPS.flatMap((g) => groups[g]));
  assert.ok(markGlyphs().includes('rocket') && markGlyphs().includes('house'));
  assert.equal(groupOf('not-a-glyph'), undefined);
  assert.equal(groupOf('constructor'), undefined);
  for (const group of GLYPH_GROUPS) assert.ok(GROUP_SAYS[group].length > 0);
});
