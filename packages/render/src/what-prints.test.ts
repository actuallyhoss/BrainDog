/**
 * What a page prints (PGS-B02): a chip's figure is read and never printed as typed, and a path that names nothing of
 * the record (`UNNAMED`) is told apart from a path whose figure has no value yet. Nine chips on his record printed
 * braces and 48 paths drew a word and a dash for a figure that will never come. The Svelte twins are held to the same
 * tree in `parity.test.ts` ("PRINTS THE SAME IN BOTH RENDERERS").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, type Block } from './parse.ts';
import { drawnRows, toHTML } from './html.ts';
import { UNNAMED, cellNamesNothing, inline, magnitudeOfCell, namesNothing, text, type Resolve } from './inline.ts';
import { MISSING } from './format.ts';
import * as root from './index.ts';

/** The record: `tasks.open` holds 7, `cash.due` names a figure with no value yet, and nothing else is named. */
const VALUES: Record<string, string | null> = { 'tasks.open': '7', 'cash.due': null, 'cash.now': 'GBP 1,200.00' };
const resolve: Resolve = (path) => (Object.hasOwn(VALUES, path) ? VALUES[path]! : UNNAMED);
const O = { resolve, empty: () => null };

const page = (src: string): Block => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', src);
  return seg as Block;
};
const draw = (src: string, o: object = O): string => toHTML([page(src)], o);

test('A PATH THAT NAMES NOTHING IS ITS OWN NODE, `named: false`, and a named path with no value is not', () => {
  assert.deepEqual(inline('{{tasks.late}}', O), [{ type: 'path', path: 'tasks.late', resolved: null, named: false }]);
  assert.deepEqual(inline('{{cash.due}}', O), [{ type: 'path', path: 'cash.due', resolved: null }]);
  assert.deepEqual(inline('{{tasks.open}}', O), [{ type: 'path', path: 'tasks.open', resolved: '7' }]);
  /* A typed form's path argument is read the same way. */
  assert.deepEqual(inline('{{money:cash.later}}', O), [{ type: 'path', path: 'cash.later', resolved: null, named: false }]);
  /* A resolver that never answers `UNNAMED` keeps every path a hole, as every host did before. */
  assert.deepEqual(inline('{{tasks.late}}', { resolve: () => null }), [{ type: 'path', path: 'tasks.late', resolved: null }]);
});

test('`UNNAMED` IS ONE CONSTANT FOR EVERY COPY OF THE PACKAGE, and the root hands it to a host', () => {
  assert.equal(UNNAMED, Symbol.for('braindog-render.unnamed'));
  assert.equal(root.UNNAMED, UNNAMED);
  assert.equal(root.namesNothing, namesNothing);
});

test('IN PROSE A PATH THAT NAMES NOTHING IS THE AUTHOR\'S TEXT, DOTTED, and a named one with no value keeps its dash', () => {
  const html = draw('```note\nOpen {{tasks.open}}, late {{tasks.late}}, due {{cash.due}}.\n```');
  assert.match(html, /Open <span class="figure num">7<\/span>/u);
  assert.match(html, /late <span class="unresolved">tasks\.late<\/span>/u);
  assert.match(html, new RegExp(`due <span class="hole" data-path="cash\\.due">[^<]* ${MISSING}</span>`, 'u'));
  assert.doesNotMatch(html, /\{\{|data-path="tasks\.late"/u, 'a path that names nothing is no hole');
  /* Its plain text is the author's, never the dash, so an accessible name says what was written. */
  assert.equal(text(inline('late {{tasks.late}}', O)), 'late tasks.late');
});

test('A CHIP\'S FIGURE IS READ, NEVER PRINTED AS TYPED: the count, a money figure, a typed form, never braces', () => {
  const html = draw('```chips\ndot | {{tasks.open}} | open tasks\ndot | {{cash.now}} | in the bank\n```');
  assert.match(html, /<span class="pill-figure num"><span class="figure num">7<\/span><\/span><span class="pill-word">open tasks<\/span>/u);
  assert.match(html, /<span class="pill-figure num"><span class="figure num">GBP 1,200\.00<\/span><\/span>/u);
  assert.doesNotMatch(html, /\{\{/u);
  /* A literal figure prints as it did, and markdown in it is read as markdown, not as asterisks. */
  assert.match(draw('```chips\ndot | 3 | open\ndot | **4** | late\n```'), /<span class="pill-figure num">3<\/span>.*<span class="pill-figure num"><strong>4<\/strong><\/span>/u);
});

test('A CHIP WHOSE FIGURE READS TO NOTHING IS DROPPED: one that names nothing, one with no value yet, and the dash', () => {
  const html = draw('```chips\ndot | {{tasks.late}} | late\ndot | {{cash.due}} | due\ndot | — | status\ndot | {{tasks.open}} | open\n```');
  assert.deepEqual([...html.matchAll(/<span class="pill-word">([^<]*)</gu)].map((m) => m[1]), ['open']);
  assert.doesNotMatch(html, /tasks\.late|cash\.due|—/u);
  /* A figure with a hole inside it says nothing either: `{{effortDays}}d` with no value drew "effortDays —d". */
  assert.equal(draw('```chips\nclock | {{cash.due}}d | to build\n```'), '');
  /* With every figure gone the block is not drawn at all where it does not lead the page. */
  assert.equal(draw('```chips\ndot | {{tasks.late}} | late\n```'), '');
});

test('A CHIP THAT NAMES NOTHING IS DROPPED EVEN WHERE THE BLOCK KEEPS ITS NOUGHTS, and its dash is kept there', () => {
  const kept = { resolve, empty: () => 'keep' };
  const block = page('```chips\ndot | {{tasks.late}} | late\ndot | {{cash.due}} | due\n```');
  assert.deepEqual(drawnRows(block, kept).map(({ at }) => at), [1]);
});

test('A TILE, A CARD\'S FIGURE AND A BAR THAT NAME NOTHING ARE LEFT OUT; the rest of the block is drawn', () => {
  const stat = draw('```stat\nLate | {{tasks.late}} | \nOpen | {{tasks.open}} | \n```');
  assert.match(stat, /style="--cells:1"/u, 'the tiles are counted after');
  assert.doesNotMatch(stat, /Late|tasks\.late/u);
  const cards = draw('```cards\ntitle: Project | figure: Open\nOxbow.gg | {{tasks.late}}\nKiln | {{tasks.open}}\n```');
  assert.match(cards, /<h3 class="cards-title">Oxbow\.gg<\/h3><\/div><\/li>/u, 'the card keeps its name and loses its figure');
  assert.match(cards, /<span class="cards-value num"><span class="figure num">7<\/span><\/span>/u);
  const bar = draw('```bar\nOpen | {{tasks.open}} | \nLate | {{tasks.late}} | \nDue | {{cash.due}} | \n```');
  assert.doesNotMatch(bar, /Late|tasks\.late/u);
  assert.match(bar, /Open/u);
  assert.match(bar, new RegExp(`Due.*${MISSING}`, 'u'), 'a bar with no value yet keeps its dash');
});

test('A PATH THAT NAMES NOTHING IS NO NUMBER, whatever digits its own name holds', () => {
  assert.ok(Number.isNaN(magnitudeOfCell('{{q3.revenue2025}}', O)));
  assert.equal(magnitudeOfCell('{{tasks.open}}', O), 7);
  assert.equal(cellNamesNothing('{{q3.revenue2025}}', O), true);
  assert.equal(cellNamesNothing('**{{q3.revenue2025}}**', O), true, 'at any depth');
  assert.equal(cellNamesNothing('{{cash.due}}', O), false);
  assert.equal(cellNamesNothing('12', O), false);
  assert.equal(cellNamesNothing(undefined, O), false);
});
