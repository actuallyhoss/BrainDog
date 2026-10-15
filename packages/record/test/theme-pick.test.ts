/**
 * Which installed look a person is drawn in, and the looks Appearance lists (`src/theme-pick.ts`, PGS-A21).
 *
 * WHAT WAS TRUE BEFORE IT: with several themes installed the record drew its own, else the first by id, and nobody could
 * choose. These pin the pick: `house` is the house look, an installed id is that theme, and anything else is the old
 * rule, so a record nobody picked in draws what it drew before. Every name is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOOK_THEME_HOUSE, lookThemeFault, looksOf, themeFor, type ThemeRow } from '../src/theme-pick.ts';

const row = (id: string, pack_id: string | null, body: Record<string, unknown> = { seed: { accent: '#2F6B4F' } }): ThemeRow => ({
  id,
  pack_id,
  body: JSON.stringify(body),
  checksum: `sum-${id}`,
});

/* OUT OF ORDER ON PURPOSE: the answers are by id, not by the order the rows arrived in. */
const THEMES = [row('theme.saltmarsh', 'saltmarsh'), row('theme.mine', null, { name: 'Lanternfish', seed: { accent: '#7A3E9D' } }), row('theme.copperleaf', 'copper-leaf')];

test('house picks the house look, whatever is installed', () => {
  assert.equal(themeFor(THEMES, LOOK_THEME_HOUSE), null);
  assert.equal(LOOK_THEME_HOUSE, 'house');
});

test("an add-on's theme id picks that theme over the record's own", () => {
  assert.equal(themeFor(THEMES, 'theme.saltmarsh')?.id, 'theme.saltmarsh');
  assert.equal(themeFor(THEMES, 'theme.copperleaf')?.checksum, 'sum-theme.copperleaf');
});

test('an unknown id, or no pick, falls back to the record’s own', () => {
  assert.equal(themeFor(THEMES, 'theme.gone')?.id, 'theme.mine');
  assert.equal(themeFor(THEMES, undefined)?.id, 'theme.mine');
});

test('with no own look the fallback is the first by id, and with none installed it is the house', () => {
  const packs = THEMES.filter((t) => t.pack_id !== null);
  assert.equal(themeFor(packs, undefined)?.id, 'theme.copperleaf');
  assert.equal(themeFor(packs, 'theme.gone')?.id, 'theme.copperleaf');
  assert.equal(themeFor([], 'theme.saltmarsh'), null);
});

test('looksOf lists the own look first, then each add-on by id, each with a name and never a bare id', () => {
  assert.deepEqual(looksOf(THEMES, { saltmarsh: 'Saltmarsh Labs' }), [
    { id: 'theme.mine', name: 'Lanternfish', from: 'own' },
    { id: 'theme.copperleaf', name: 'Copper leaf', from: 'pack', pack: 'copper-leaf' },
    { id: 'theme.saltmarsh', name: 'Saltmarsh Labs', from: 'pack', pack: 'saltmarsh' },
  ]);
  assert.equal(looksOf([row('theme.own', null)])[0]?.name, 'Your own look');
  assert.deepEqual(looksOf([]), []);
});

test('lookThemeFault takes house and the installed ids, and refuses anything else naming every word', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(lookThemeFault('house', ids), null);
  assert.equal(lookThemeFault('theme.saltmarsh', ids), null);
  for (const wrong of ['theme.gone', 'House', 7, null, undefined]) {
    const fault = lookThemeFault(wrong, ids);
    assert.equal(fault?.code, 'VALUE_MALFORMED');
    assert.equal(fault?.at, 'value');
    assert.deepEqual(fault?.allowed, ['house', 'theme.copperleaf', 'theme.mine', 'theme.saltmarsh']);
    assert.match(fault?.fix ?? '', /^look\.theme is house, theme\.copperleaf, theme\.mine, theme\.saltmarsh/u);
  }
});
