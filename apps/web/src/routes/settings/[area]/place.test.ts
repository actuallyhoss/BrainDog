/**
 * The settings index, declared: the house body every record starts from, and a declared index read back into the
 * groups the chooser beside an open area draws, in the person's order, under the person's names.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { AREAS, AREA_AT, DEFAULT_GROUPS, areaOf, ONLY_WIDE, SETTINGS_INDEX, SETTINGS_PAGE, groupsOf, indexBody, labelIn, rowsOf, type IndexBlock } from './place.ts';

const ids = (groups: ReturnType<typeof groupsOf>) => groups.map((g) => [g.title, g.areas.map((a) => a.id)]);
const link = (heading: string, rows: string[][], more: Partial<IndexBlock> = {}): IndexBlock => ({
  kind: 'link',
  heading,
  authored: rows.map((cells) => ({ cells })),
  ...more,
});

test('the house index is a page of link tiles, one for each group, each area once with its address, its line and its icon', () => {
  assert.equal(SETTINGS_INDEX.page, SETTINGS_PAGE);
  assert.deepEqual(
    SETTINGS_INDEX.blocks.map((b) => [b.kind, b.heading, typeof b.icon]),
    DEFAULT_GROUPS.map((g) => ['link', g.title, 'string']),
  );
  const rows = SETTINGS_INDEX.blocks.flatMap((b) => b.authored ?? []).filter((r) => r.cells[1]!.startsWith(AREA_AT));
  assert.equal(rows.length, DEFAULT_GROUPS.flatMap((g) => g.areas).length);
  for (const r of rows) {
    assert.equal(r.cells.length, 4);
    assert.ok(AREAS.has(r.cells[1]!.slice(AREA_AT.length)));
    /* THE AREA'S OWN GLYPH RIDES WITH ITS ROW, so the index draws the well the chooser draws. */
    assert.equal(r.cells[3], AREAS.get(r.cells[1]!.slice(AREA_AT.length))!.icon);
  }
});

test('the house body read back is the house groups, so the chooser and the index never disagree', () => {
  assert.deepEqual(ids(groupsOf(SETTINGS_INDEX.blocks as IndexBlock[])), ids(DEFAULT_GROUPS));
});

test('the one irreversible act is the last row of the last group', () => {
  assert.equal(DEFAULT_GROUPS.at(-1)?.areas.at(-1)?.id, 'delete');
  assert.equal(rowsOf(DEFAULT_GROUPS.at(-1)!).at(-1)?.id, 'delete');
});

test('a person reorders, moves, renames and leaves out areas, and the chooser follows', () => {
  const mine = [
    link('Mine', [
      ['Look', '/settings/appearance', 'Colours'],
      ['Backups', '/settings/backups'],
    ]),
    link('Rest', [['Keys', '/settings/keyboard', '']]),
  ];
  const groups = groupsOf(mine);
  assert.deepEqual(ids(groups), [
    ['Mine', ['appearance', 'backups']],
    ['Rest', ['keyboard']],
  ]);
  assert.equal(labelIn(groups, 'appearance'), 'Look');
  /* A ROW WITH NO LINE OF ITS OWN KEEPS THE AREA'S; ONE WRITTEN EMPTY IS EMPTY, as it was written. */
  assert.equal(groups[0]!.areas[1]!.line, AREAS.get('backups')!.line);
  assert.equal(groups[1]!.areas[0]!.line, '');
  /* AND ITS ICON IS THE AREA'S, whatever the person named it. */
  assert.equal(groups[0]!.areas[0]!.icon, AREAS.get('appearance')!.icon);
  /* LEFT OUT IS NOT GONE: the address still names the area, and its label is its own. */
  assert.equal(labelIn(groups, 'delete'), 'Delete my BrainDog');
});

test('what is not an area is left out, an area listed twice is drawn once, and a tile not drawn draws nothing', () => {
  const groups = groupsOf([
    link('A', [
      ['Elsewhere', 'https://example.com'],
      ['Nope', '/settings/banana'],
      ['Billing', '/settings/billing'],
      ['Billing again', '/settings/billing'],
    ]),
    link('Hidden', [['Export', '/settings/export']], { drawn: false }),
    { kind: 'note', heading: 'Words' },
    link('Empty', [['Nope', '/settings/nope']]),
  ]);
  assert.deepEqual(ids(groups), [['A', ['billing']]]);
});

test('an address with the base path in front, or a query behind, still names its area', () => {
  assert.deepEqual(ids(groupsOf([link('X', [['Keys', '/settings/keyboard?from=rail']])])), [['X', ['keyboard']]]);
  /* AND A MOVED ONE NAMES THE AREA THAT HOLDS IT NOW (UI pass 20 Oct, agents F14): Pages is Navigation's. */
  assert.deepEqual(ids(groupsOf([link('X', [['Pages', '/settings/pages?from=rail']])])), [['X', ['navigation']]]);
});

test('an index that names no area at all is read as the house one, so nobody is stranded in one area', () => {
  assert.deepEqual(ids(groupsOf([])), ids(DEFAULT_GROUPS));
  assert.deepEqual(ids(groupsOf([link('X', [['Nope', '/r/tasks']])])), ids(DEFAULT_GROUPS));
});

test('the body is built from whatever groups it is handed, so an arranged index writes back the same way', () => {
  const body = indexBody([{ title: 'One', icon: 'sun', areas: [AREAS.get('appearance')!] }]);
  assert.deepEqual(body.blocks.map((b) => b.authored?.map((r) => r.cells[1])), [['/settings/appearance']]);
});

test('the area for what comes in is named for what it holds, and every name and line is plain words', () => {
  assert.equal(AREAS.get('ingest')?.label, 'What comes in');
  for (const a of AREAS.values()) {
    assert.match(a.label, /^[A-Z]/u);
    assert.doesNotMatch(`${a.label} ${a.line}`, /\b(rows?|ingest|entit(y|ies)|list items?)\b/iu, a.id);
  }
});

test('the keyboard area is the one a phone is not offered', () => {
  assert.deepEqual([...ONLY_WIDE], ['keyboard']);
});

test('every area this build declares has an arm in the page that draws it', () => {
  /* AN AREA WITH NO ARM DRAWS AN EMPTY COLUMN IN SILENCE, since an unknown address is a refusal and a known one draws
     whatever its arm says. The arms are `{#if}` lines in a `.svelte` file, so they are read as text. */
  const route = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.ok(AREAS.size >= 12, `only ${AREAS.size} areas are declared`);
  for (const id of AREAS.keys()) assert.ok(route.includes(`area === '${id}'`), `the index offers ${id} and no arm draws it`);
});

test('FIVE GROUPS NAMED BY WHAT THEY HOLD, two by two and Your data the whole width under them, Delete last', () => {
  assert.deepEqual(DEFAULT_GROUPS.map((g) => g.title), ['You', 'How it looks', 'Agents and add-ons', 'People and billing', 'Your data']);
  const rows = DEFAULT_GROUPS.map((g) => rowsOf(g).map((r) => r.label));
  assert.deepEqual(rows[0], ['Signing in', 'Notifications', 'Keyboard']);
  assert.deepEqual(rows[1], ['Appearance', 'Pages', 'Time and money']);
  assert.deepEqual(rows[2], ['Agents', 'Keychain', 'What comes in', 'Add-ons']);
  assert.deepEqual(rows[3], ['People and sharing', 'Usage', 'Billing']);
  assert.deepEqual(rows[4], ['Health', 'Tidy up', 'Backups', 'Export', 'Delete my BrainDog']);
  assert.deepEqual(SETTINGS_INDEX.blocks.map((b) => b.span), [6, 6, 6, 6, 12]);
  const hrefs = SETTINGS_INDEX.blocks.flatMap((b) => (b.authored ?? []).map((r) => r.cells[1]));
  for (const at of ['/keychain', '/settings/addons', '/usage']) assert.ok(hrefs.includes(at), at);
  assert.ok(!DEFAULT_GROUPS.some((g) => g.areas.some((a) => a.id === 'look')), 'the design book is a setting again');
  const route = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(route, /param === 'look'\) void goto\(at\('\/design'\)/u, 'a link to the design book no longer lands');
  /* THE OLD ADDRESSES LAND ON WHAT HOLDS THEM NOW. */
  for (const [from, to] of [['identity', 'signing-in'], ['recovery', 'signing-in'], ['sessions', 'signing-in'], ['pages', 'navigation']] as const)
    assert.equal(areaOf(from)?.id, to, from);
  assert.ok(!SETTINGS_INDEX.blocks.some((b) => (b.authored ?? []).some((r) => String(r.cells[1]).endsWith('/look'))));
});
