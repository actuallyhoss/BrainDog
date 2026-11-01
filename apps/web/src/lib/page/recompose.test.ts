/**
 * A page recomposing in place: which block moves, which comes and which goes, between two answers.
 *
 * WHAT WOULD BE SILENTLY WRONG: a block followed by its place rather than by what it is (a block put in at the top
 * slides every tile under it into the wrong one's place), two blocks alike sharing one name (one of them never moves,
 * and the page's keyed elements collide), the record's own key ignored for a name the page made up (the look orders by
 * the record's), a re-read that changed nothing playing a move anyway, and a headline that came or went crossfaded
 * rather than entering or leaving, and a block that left read through the one now standing in its place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockKeys, covered, frameOf, GLIDE, planOf, rewritten, slideOf, SLIDE_MAX, type Box } from './recompose.ts';

const at = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h });

test('a block is named by what it is, so one put in at the top leaves the others their names', () => {
  const was = blockKeys([
    { kind: 'todo', source: 'register.tasks', heading: 'Late' },
    { kind: 'feed', source: 'activity', heading: 'Since you were away' },
  ]);
  const now = blockKeys([
    { kind: 'note', lead: true },
    { kind: 'todo', source: 'register.tasks', heading: 'Late' },
    { kind: 'feed', source: 'activity', heading: 'Since you were away' },
  ]);
  assert.deepEqual(now.slice(1), was);
  assert.notEqual(now[0], was[0]);
});

test('two blocks alike are told apart by their order, and a list named by its register is that list', () => {
  const keys = blockKeys([
    { kind: 'note', body: 'One' } as never,
    { kind: 'note', body: 'Two' } as never,
    { kind: 'capture', register: 'tasks' },
  ]);
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys[2]!.includes('tasks'));
});

test('a block that moved plays from where it was, a new one comes in, one that left goes from where it stood', () => {
  const before = new Map([
    ['a', at(0, 0)],
    ['b', at(0, 60)],
    ['gone', at(0, 120)],
  ]);
  const after = new Map([
    ['new', at(0, 0)],
    ['a', at(0, 60)],
    ['b', at(0, 60.2)],
  ]);
  const plan = planOf(before, after);
  assert.deepEqual(plan.moves, [{ key: 'a', dx: 0, dy: -60 }]);
  assert.deepEqual(plan.enters, ['new']);
  assert.deepEqual(plan.leaves, [{ key: 'gone', box: at(0, 120) }]);
});

test('a re-read that changed nothing plays nothing', () => {
  const page = new Map([
    ['a', at(0, 0)],
    ['b', at(620, 0)],
  ]);
  assert.deepEqual(planOf(page, new Map(page)), { moves: [], enters: [], redrawn: [], leaves: [] });
});

test('a block that would stand outside the page at its old place is drawn anew and not slid', () => {
  /* TWO HALVES OF A 1,200 PAGE, and then a panel docks and the page is 680 and they stack, each the whole row. */
  const before = new Map([
    ['left', at(0, 0, 594)],
    ['right', at(606, 0, 594)],
    ['under', at(0, 60, 1200)],
  ]);
  const after = new Map([
    ['left', at(0, 0, 680)],
    ['right', at(0, 60, 680)],
    ['under', at(0, 120, 680)],
  ]);
  /* The left half stayed where it was and only widened, which is no move: it is simply drawn at its new width. The right
     half, slid from 606 at 680 wide, would reach past the page's end; the block under them narrowed but starts on the
     page's edge, so it still slides down to its new place rather than blinking out and back. */
  assert.deepEqual(planOf(before, after, 680), { moves: [{ key: 'under', dx: 0, dy: -60 }], enters: [], redrawn: ['right'], leaves: [] });
  /* A SCROLLBAR CAME AND EVERY BLOCK IS 15 NARROWER as one above them grew: they slide, and none is faded. */
  assert.deepEqual(planOf(new Map([['b', at(0, 60, 1200)]]), new Map([['b', at(0, 120, 1185)]]), 1185), {
    moves: [{ key: 'b', dx: 0, dy: -60 }],
    enters: [],
    redrawn: [],
    leaves: [],
  });
  /* THE SAME WIDTH, BUT ITS OLD PLACE IS PAST THE PAGE'S END NOW: slid, it would reach under the panel. */
  const wide = new Map([['b', at(620, 0, 300)]]);
  assert.deepEqual(planOf(wide, new Map([['b', at(0, 60, 300)]]), 680).redrawn, ['b']);
  /* AND ONE THE SAME WIDTH THAT STARTS INSIDE THE PAGE STILL SLIDES. */
  assert.deepEqual(planOf(wide, new Map([['b', at(0, 60, 300)]]), 1200).moves, [{ key: 'b', dx: 620, dy: -60 }]);
});

test("a block is named by the key the record answered for it, wherever the look moved it", () => {
  const was = blockKeys([
    { kind: 'note', key: 'lead-line', lead: true },
    { kind: 'todo', key: 'late', source: 'register.tasks', heading: 'Late' },
    { kind: 'stat', key: 'cash', source: 'metric.cash' },
  ]);
  const now = blockKeys([
    { kind: 'note', key: 'lead-line', lead: true },
    { kind: 'stat', key: 'cash', source: 'metric.cash', heading: 'Cash, written again' },
    { kind: 'todo', key: 'late', source: 'register.tasks', heading: 'Late' },
  ]);
  assert.deepEqual(was, ['lead-line', 'late', 'cash']);
  assert.deepEqual(now, ['lead-line', 'cash', 'late'], 'a heading written again is still the same block');
});

test('two blocks the record gave one key are still two elements, and a block with no key keeps the name it had', () => {
  const keys = blockKeys([{ kind: 'note', key: 'same' }, { kind: 'note', key: 'same' }, { kind: 'capture', register: 'tasks' }]);
  assert.equal(new Set(keys).size, 3);
  assert.deepEqual(keys[2], blockKeys([{ kind: 'capture', register: 'tasks' }])[0]);
});

test('a headline written again is crossfaded, and one that came or went is not', () => {
  const was = new Map([
    ['lead', 'Two are late'],
    ['gone', 'Cash is fine'],
  ]);
  const now = new Map([
    ['lead', 'Three are late'],
    ['new', 'Paid today'],
  ]);
  assert.deepEqual([...rewritten(was, now)], ['lead']);
  assert.deepEqual([...rewritten(was, new Map(was))], [], 'a headline that says what it said plays nothing');
});

test('a place another block now takes is told from one left empty, and a block beside it does not take it', () => {
  const gone = at(0, 120);
  assert.equal(covered(gone, [at(0, 0), at(0, 100)]), true, 'a block moved up over it takes the place');
  assert.equal(covered(gone, [at(0, 0), at(0, 60)]), false, 'blocks above it leave the place empty');
  assert.equal(covered(gone, [at(100, 120)]), false, 'a block edge to edge beside it does not take it');
  assert.equal(covered(gone, [at(0, 159.5)]), false, 'nor does one under a pixel of it');
});

/* THE BOX A COPY IS LAID AGAINST (fluid F8). On Today's desk the page and the home page above it are `display: contents`,
   and a frame with no box measured every block as one that cannot slide, so the tiles under an answer blinked. */
type Fake = { parentElement: Fake | null; style: { display: string; position: string } };
const el = (display: string, position: string, parentElement: Fake | null = null): Fake => ({ parentElement, style: { display, position } });

function withStyles<T>(run: () => T): T {
  const g = globalThis as unknown as { getComputedStyle?: (e: Fake) => Fake['style'] };
  const was = g.getComputedStyle;
  g.getComputedStyle = (e) => e.style;
  try {
    return run();
  } finally {
    if (was) g.getComputedStyle = was;
    else delete g.getComputedStyle;
  }
}

test('a page with a box of its own is its own frame', () => {
  const page = el('block', 'static', el('block', 'relative'));
  assert.equal(withStyles(() => frameOf(page as never)), page);
});

test('a page with no box is laid against the nearest positioned ancestor that has one', () => {
  const board = el('grid', 'relative', el('block', 'static'));
  const homePage = el('contents', 'relative', board);
  const page = el('contents', 'static', homePage);
  assert.equal(withStyles(() => frameOf(page as never)), board, 'not the home page, which has no box either');
  /* AND A STATIC BOX ON THE WAY IS STILL PASSED. */
  const wrap = el('block', 'static', board);
  assert.equal(withStyles(() => frameOf(el('contents', 'static', wrap) as never)), board);
});

test('with nothing positioned above it the page is its own frame', () => {
  const page = el('contents', 'static', el('contents', 'relative', el('block', 'static')));
  assert.equal(withStyles(() => frameOf(page as never)), page);
});

test('a short move slides the whole way, and a long one glides the last stretch on its heading and fades in', () => {
  assert.deepEqual(slideOf(-40, 30), { dx: -40, dy: 30, fade: false });
  assert.deepEqual(slideOf(0, SLIDE_MAX), { dx: 0, dy: SLIDE_MAX, fade: false });
  const far = slideOf(601.7, -196.9);
  assert.equal(far.fade, true);
  assert.ok(Math.abs(Math.hypot(far.dx, far.dy) - GLIDE) < 1e-9);
  assert.ok(far.dx > 0 && far.dy < 0);
});
