/**
 * The grammar an agent and Slash are handed says what the registries hold (PGS-A08 step 4).
 *
 * THE SOURCES LINE WAS TYPED BY HAND, and it had already left out `exceptions` the day that source was registered: a
 * page that wanted what went quiet was a page no agent was told it could write. It is built now from the kernel's
 * `SOURCE_MODULES`, the block kinds from the renderer's `KINDS`, and the glyph names by group from `glyphs/groups.ts`,
 * so each test here goes red on an entry a registry holds and the grammar does not say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as render from 'braindog-render';
import { KINDS, kindSpec } from 'braindog-render';

import { GLYPHS, KINDS_SHORT, SOURCES, glyphLines, grammarOf, sourcesLine, sourcesSaid } from '../src/grammar.ts';
import { SOURCE_MODULES } from '../../kernel/src/sources/index.ts';
import { GROUP_SAYS, markGlyphs, markGroups } from '../../render/src/glyphs/groups.ts';

type Page = { body: { icon: string }; block: { kind: string[]; source: string }; glyphs?: Record<string, string> };
const page = (): Page => {
  const r = grammarOf('page') as { ok: boolean; value?: unknown };
  assert.ok(r.ok);
  return r.value as Page;
};

test('EVERY REGISTERED SOURCE IS IN THE GRAMMAR, exceptions among them, in the registry\'s order', () => {
  const line = page().block.source;
  const names = Object.keys(SOURCE_MODULES);
  for (const name of names) assert.ok(line.includes(name), `${name} is a registered source the grammar does not say`);
  assert.match(line, /\bexceptions \(what went quiet/u);
  assert.deepEqual(SOURCES.map((s) => s.name), names, 'a source the registry holds that the grammar does not, or out of order');
  assert.equal(line, sourcesLine(sourcesSaid(names, SOURCE_MODULES)));
  const at = names.map((name) => line.indexOf(`, ${name}`) >= 0 ? line.indexOf(`, ${name}`) : line.indexOf(` or ${name}`));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'the sources are said in the order the registry holds them');
  assert.ok(line.startsWith('register.<id>, metric.<id> (or metric.<id>:<parameter>'));
  assert.ok(line.endsWith(` or ${names.at(-1)!} (${SOURCES.at(-1)!.says})`));
});

test('A SOURCE ADDED TO A COPY OF THE REGISTRY CHANGES THE LINE, said by its name until it carries words of its own', () => {
  const names = Object.keys(SOURCE_MODULES);
  const before = sourcesLine(sourcesSaid(names, SOURCE_MODULES));
  const copy = { ...SOURCE_MODULES, 'weather.today': { read: () => ({}) } };
  const bare = sourcesLine(sourcesSaid(Object.keys(copy), copy));
  assert.notEqual(bare, before);
  assert.ok(bare.endsWith(' or weather.today'));
  assert.ok(bare.includes(`, ${names.at(-1)!}`), 'the old last source is no longer last');
  const said = { ...copy, 'weather.today': { read: () => ({}), says: 'the sky over the record, as rows: hour, sky' } };
  assert.ok(sourcesLine(sourcesSaid(Object.keys(said), said)).endsWith(' or weather.today (the sky over the record, as rows: hour, sky)'));
  /* The registry is a plain object a test may stub; the copy left it as it was. */
  assert.equal(Object.hasOwn(SOURCE_MODULES, 'weather.today'), false);
});

test('A SOURCE WITH NOTHING TO SAY PAST ITS NAME IS SAID BY NAME, and a module\'s own words win over the table', () => {
  assert.deepEqual(sourcesSaid(['activity']), [{ name: 'activity' }]);
  assert.deepEqual(sourcesSaid(['constructor']), [{ name: 'constructor' }]);
  assert.deepEqual(sourcesSaid(['deadlines'], { deadlines: { says: 'what falls due' } }), [{ name: 'deadlines', says: 'what falls due' }]);
  assert.equal(sourcesLine([{ name: 'activity' }]), 'register.<id>, metric.<id> (or metric.<id>:<parameter> on a bar or a split, such as metric.project-cost:{{name}} on a project page), block.<n> or activity');
});

test('EVERY BLOCK KIND THE RENDERER HOLDS IS IN THE PAGE GRAMMAR AND THE SHORT FORM', () => {
  const kinds = Object.keys(KINDS);
  assert.deepEqual(page().block.kind, kinds);
  for (const kind of kinds) {
    assert.ok(kindSpec(kind), `${kind} has no spec`);
    assert.ok(typeof (KINDS_SHORT.kinds as Record<string, string>)[kind] === 'string', `${kind} has no line in the short form`);
  }
});

test('THE GLYPH NAMES A MARK MAY USE ARE SAID ONE LINE A GROUP, and none is a control', () => {
  const lines = glyphLines(markGroups(), GROUP_SAYS);
  assert.deepEqual(Object.keys(lines), Object.keys(markGroups()).filter((g) => markGroups()[g as keyof ReturnType<typeof markGroups>].length > 0));
  for (const [group, line] of Object.entries(lines)) assert.ok(line.startsWith(`${GROUP_SAYS[group as keyof typeof GROUP_SAYS]}: `));
  const said = Object.values(lines).flatMap((line) => line.slice(line.indexOf(': ') + 2).split(', '));
  assert.deepEqual(said, [...markGlyphs()]);
  for (const control of ['x', 'pencil', 'close', 'chevron-right']) assert.ok(!said.includes(control), `${control} is offered as a mark`);
  assert.deepEqual(glyphLines({ a: [], b: ['rocket'] }), { b: 'b: rocket' });
});

const wired = Object.hasOwn(render, 'markGroups');

test('THE PAGE GRAMMAR CARRIES THE GLYPH LINES once the renderer exports them', { skip: wired ? false : 'braindog-render does not export markGroups yet (blocked line in its index)' }, () => {
  assert.deepEqual(page().glyphs, GLYPHS);
  assert.deepEqual({ ...page().glyphs, use: undefined }, { ...glyphLines(markGroups(), GROUP_SAYS), use: undefined });
  assert.match(page().body.icon, /glyphs below/u);
});

test('WHILE THE RENDERER EXPORTS NO GROUPS, the page grammar promises none', { skip: wired ? 'the renderer exports them' : false }, () => {
  assert.equal(GLYPHS, undefined);
  assert.equal(page().glyphs, undefined);
  assert.equal(page().body.icon, 'a glyph name, such as board');
});
