/**
 * The `lanes` writer, handed the record's answer as the kernel writes one (`packages/kernel/src/kinds/lanes.ts`) and
 * asked what fence it draws, then drawn through the path every page takes to it.
 *
 * AN INSTANT IS COMPARED AS THE MOMENT IT IS, never as its spelling: the writer puts each on the clock of the machine
 * that reads it, so the same test holds wherever it is run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lanesPlan, toHTML, type Block } from 'braindog-render';

import { draw, type Refusal } from '../../record/blocks.ts';
import { blockOf } from '../../record/page-live.ts';
import { drawerOf, type DrawOptions, type Drawn } from './index.ts';
import { lanes, written } from './lanes.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const NOTHING: Refusal = { kind: 'no-results', title: 'Nothing matched.' };
const OPTS: DrawOptions = { home: 'GBP', now: NOW, nothing: () => NOTHING };

const WINDOW = { from: '2026-10-06T12:00:00.000Z', to: '2026-10-07T12:00:00.000Z', now: '2026-10-07T12:00:00.000Z' };

/** A block as the record's `page` answers one: the declaration, with what the kernel read on it. */
const answer = (more: Record<string, unknown>) => ({ kind: 'lanes', rows: [], matched: 0, refusals: [], window: WINDOW, lanes: [], ...more }) as never;

/** The one block the writer drew. */
function blockOfDrawn(drawn: Drawn): Block {
  assert.equal(drawn.refusal, null);
  assert.equal(drawn.segments.length, 1);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block', segment?.type === 'degraded' ? segment.fix : '');
  return segment as Block;
}

/** A row's cells with each instant as its moment, so a spelling in any zone compares equal. */
const moments = (cells: readonly string[]): (string | number)[] => cells.map((c, i) => (i > 0 && c !== '' ? Date.parse(c) : c));

test('LANES WRITE THE WINDOW FIRST AND THEN A ROW A LANE, each name a door to its row, an open end left blank', () => {
  const block = blockOfDrawn(
    lanes.draw(
      answer({
        lanes: [
          { title: 'Import the bank file', start: '2026-10-07T09:00:00.000Z', end: '2026-10-07T09:40:00.000Z', tone: 'good', href: '/r/session/4' },
          { title: 'Chase the invoice', start: '2026-10-07T11:30:00.000Z', end: null, tone: 'info', href: '/r/session/5' },
          { title: 'Began on Monday', start: '2026-10-05T08:00:00.000Z', end: '2026-10-06T13:00:00.000Z' },
        ],
      }),
      OPTS,
    ),
  );
  assert.deepEqual(
    block.rows.map((r) => [moments(r.cells), r.tone ?? null]),
    [
      [['window', Date.parse(WINDOW.from), Date.parse(WINDOW.to), NOW], null],
      [['[Import the bank file](/r/session/4)', Date.UTC(2026, 9, 7, 9), Date.UTC(2026, 9, 7, 9, 40)], 'good'],
      [['[Chase the invoice](/r/session/5)', Date.UTC(2026, 9, 7, 11, 30), ''], 'info'],
      /* NEVER CUT TO THE WINDOW: the drawer says where it began and draws the part inside. */
      [['Began on Monday', Date.UTC(2026, 9, 5, 8), Date.UTC(2026, 9, 6, 13)], null],
    ],
  );

  /* AND THE DRAWER PLACES THEM IN THE RECORD'S WINDOW, not in the lanes' own first start to last end. */
  const plan = lanesPlan(block.rows, NOW);
  assert.deepEqual(
    plan.lanes.map((l) => [l.at, l.span, l.open, l.before]),
    [
      ['87.5%', '2.78%', false, false],
      ['97.92%', '2.08%', true, false],
      ['0%', '4.17%', false, true],
    ],
  );
  assert.equal(plan.now, '100%');
  assert.deepEqual([plan.skipped, plan.outside], [[], []]);
});

test('an instant is written on the reader\'s own clock with its offset, and is the same moment', () => {
  for (const at of [NOW, Date.UTC(2026, 0, 15, 23, 59, 30), Date.UTC(2026, 6, 1, 0, 0)]) {
    const said = written(at);
    assert.match(said, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/u);
    assert.equal(Date.parse(said), at);
    /* THE WALL CLOCK IN IT IS THE READER'S, which is what the drawer names its hours by. */
    const d = new Date(at);
    assert.equal(Number(said.slice(11, 13)), d.getHours());
    assert.equal(Number(said.slice(8, 10)), d.getDate());
  }
});

test('WHAT DOES NOT READ IS LEFT OUT AND NEVER THROWS: a lane with no start, an end before its start, a tone or a door that is not one', () => {
  const block = blockOfDrawn(
    lanes.draw(
      answer({
        lanes: [
          null,
          'a lane',
          { title: 'No start', end: '2026-10-07T09:00:00.000Z' },
          { title: 'Ends first', start: '2026-10-07T09:00:00.000Z', end: '2026-10-07T08:00:00.000Z' },
          { title: 'An end that is no instant', start: '2026-10-07T09:00:00.000Z', end: 'soon' },
          { title: 'Pipe | and [bracket]', start: '2026-10-07T10:00:00.000Z', end: null, tone: 'constructor', href: '/r/session/6' },
          { title: 'Elsewhere', start: '2026-10-07T10:30:00.000Z', end: null, tone: 'warn', href: 'https://example.com/x' },
          { title: 7, start: '2026-10-07T11:00:00.000Z', end: null, href: '/r/session/8) | bad' },
        ],
      }),
      OPTS,
    ),
  );
  assert.deepEqual(
    block.rows.slice(1).map((r) => [r.cells[0], r.tone ?? null]),
    [
      ['Pipe | and [bracket]', null],
      ['Elsewhere', 'warn'],
      ['', null],
    ],
  );
});

test('A TIME WITH NO OFFSET, OR ONE NO CLOCK CAN WRITE, IS NO INSTANT: the lane is left out and nothing throws', () => {
  const block = blockOfDrawn(
    lanes.draw(
      answer({
        lanes: [
          { title: 'No offset', start: '2026-10-07T09:00:00', end: null },
          { title: 'Loose words', start: 'Oct 7 2026', end: null },
          { title: 'Past the last date', start: '+275760-09-13T00:00:00.000Z', end: null },
          { title: 'Before the first', start: '-271821-04-20T00:00:00.000Z', end: null },
          { title: 'A fifth figure in the year', start: '2026-10-07T09:00:00.000Z', end: '+010000-01-01T00:00:00.000Z' },
          { title: 'Reads', start: '2026-10-07T11:00:00+02:00', end: null },
        ],
      }),
      OPTS,
    ),
  );
  assert.deepEqual(block.rows.slice(1).map((r) => moments(r.cells)), [['Reads', Date.UTC(2026, 9, 7, 9), '']]);

  /* AND A CLOCK THAT IS NO DATE writes no now, where the window names none. */
  for (const now of [Number.NaN, Number.POSITIVE_INFINITY, 8.64e15, -8.64e15]) {
    const drawn = blockOfDrawn(lanes.draw(answer({ window: { from: WINDOW.from, to: WINDOW.to }, lanes: [{ title: 'One', start: '2026-10-07T09:00:00.000Z', end: null }] }), { ...OPTS, now }));
    assert.equal(drawn.rows[0]!.cells[3] ?? '', '');
  }
});

test('an answer from a build with no window still draws its lanes, in their own first start to last end', () => {
  for (const window of [undefined, null, 'today', { from: WINDOW.to, to: WINDOW.from, now: WINDOW.now }, { from: 'then', to: WINDOW.to }]) {
    const block = blockOfDrawn(lanes.draw(answer({ window, lanes: [{ title: 'One', start: '2026-10-07T09:00:00.000Z', end: '2026-10-07T10:00:00.000Z' }] }), OPTS));
    assert.deepEqual(block.rows.map((r) => r.cells[0]), ['One']);
  }
  /* A WINDOW WHOSE NOW DOES NOT READ takes the clock the block was read at. */
  const block = blockOfDrawn(lanes.draw(answer({ window: { from: WINDOW.from, to: WINDOW.to }, lanes: [{ title: 'One', start: '2026-10-07T09:00:00.000Z', end: null }] }), OPTS));
  assert.equal(Date.parse(block.rows[0]!.cells[3]!), NOW);
});

test('WITH NO LANE IN ITS HOURS, the block says the empty state every kind says and draws no axis', () => {
  assert.deepEqual(lanes.draw(answer({}), OPTS), { segments: [], refusal: NOTHING });
  assert.deepEqual(lanes.draw(answer({ lanes: 'none', window: null }), OPTS), { segments: [], refusal: NOTHING });
  assert.deepEqual(lanes.draw(answer({ lanes: [{ title: 'No start' }] }), OPTS), { segments: [], refusal: NOTHING });
  assert.deepEqual(lanes.draw(null as never, OPTS), { segments: [], refusal: NOTHING });
});

test('lanes are registered, and a page\'s block reaches the writer with the record\'s answer whole', () => {
  assert.equal(drawerOf('lanes'), lanes);
  const live = blockOf(
    answer({ heading: 'At work', source: 'register.session', matched: 1, lanes: [{ title: 'Import the bank file', start: '2026-10-07T09:00:00.000Z', end: null, tone: 'info', href: '/r/session/4' }] }),
    new Map(),
    NOW,
  );
  assert.ok(live.answer, 'the reader did not keep the answer on a registered kind');
  assert.equal(live.cannot, undefined, 'lanes were said to be a kind this build cannot draw');
  const block = blockOfDrawn(draw(live));
  assert.equal(block.kind, 'lanes');
  assert.equal(block.rows[1]?.cells[0], '[Import the bank file](/r/session/4)');

  /* AND WHAT IS DRAWN NAMES THE LANE AND NO ID: the words a person reads are the title and its hours. */
  const html = toHTML([block], { now: NOW });
  assert.match(html, /class="lanes-item" data-intent="info"/u);
  assert.match(html, /Import the bank file/u);
  assert.doesNotMatch(html, /window/u);
});

test('A BUSY STRETCH IS ITS NEWEST LANES AND ONE LINE UNDER THEM: "And 87 more that started earlier."', () => {
  const drawn = lanes.draw(
    answer({
      lanes: [{ title: 'Sort the receipts', start: '2026-10-07T10:00:00.000Z', end: '2026-10-07T10:30:00.000Z', href: '/r/session/9' }],
      matched: 88,
      more: 87,
    }),
    OPTS,
  );
  assert.equal(drawn.refusal, null);
  assert.equal(drawn.segments.length, 2);
  assert.equal(drawn.segments[0]?.type, 'block');
  const html = toHTML(drawn.segments, {});
  assert.match(html, /And 87 more that started earlier\./u);
  /* NO COUNT, OR ONE THAT IS NOT A WHOLE NUMBER ABOVE NOUGHT, SAYS NOTHING MORE. */
  for (const more of [undefined, 0, -3, 2.5, '87'])
    assert.equal(lanes.draw(answer({ lanes: [{ title: 'Sort the receipts', start: '2026-10-07T10:00:00.000Z', end: null }], more }), OPTS).segments.length, 1, String(more));
});
