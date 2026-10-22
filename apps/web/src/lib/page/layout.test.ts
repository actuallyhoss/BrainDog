/**
 * A page declared with `layout: { rail: 4 }` draws a main column and a side rail.
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The kernel admits `layout` and a block's `area`, and the page read hands
 * both to the app, but nothing in the app read either: every block went into the one twelve-column flow in declared
 * order. So three `area: rail` blocks declared after one tall main block were drawn UNDER it, a screen's height below
 * where their author put them. The browser half of that (the rail blocks' `offsetTop` against the main block's) is the
 * layout gate's to measure; what is measured here is the split the page draws from, and the record carrying the keys.
 *
 * THE LAST TEST GOES THROUGH THE KERNEL AND `blockOf`, because a split over hand-made blocks would pass while the page
 * read or the app's narrowing threw `area` away. `blockOf` names every key it narrows and carries the rest, so `area`
 * and `box` ride through; that is a property of its destructuring, and this is the test that notices if it stops.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';

import { blockOf } from '../record/page-live.ts';
import { boardRail, boxesOf, headCaptureAt, leadChartAt, paired, layoutOf, mainSpan, railDrawn, snapped, splitAreas, sticks, TILE_SPANS, widened, type Layout } from './layout.ts';

const RAIL: Layout = { rail: 4, sticky: false };

/* ONE TALL MAIN BLOCK AND THREE FOR THE RAIL, declared after it: a launch desk's page. */
const DESK = [
  { kind: 'table', heading: 'Every step' },
  { kind: 'note', heading: 'Pinned', area: 'rail' },
  { kind: 'queue', heading: 'Waiting on you', area: 'rail' },
  { kind: 'table', heading: 'People', area: 'rail' },
];

const headings = (blocks: readonly { heading?: string }[]) => blocks.map((b) => b.heading);

test('THE RAIL BLOCKS ARE DRAWN BESIDE THE MAIN COLUMN, NOT UNDER IT, each area in declared order', () => {
  const { main, rail } = splitAreas(DESK, RAIL);
  assert.deepEqual(headings(main), ['Every step']);
  assert.deepEqual(headings(rail), ['Pinned', 'Waiting on you', 'People']);
});

test('A PAGE WITH NO LAYOUT IS ONE COLUMN, as it was, whatever its blocks say', () => {
  // The kernel refuses `area: rail` on a page with no layout, so this is an older record or a hand-set body. Drawing
  // the block in a rail nobody declared would put it where no reader was told there is a column.
  const { main, rail } = splitAreas(DESK, null);
  assert.deepEqual(headings(main), headings(DESK));
  assert.deepEqual(rail, []);
});

test('THE LAYOUT IS READ AS THE KERNEL ADMITS IT, and anything else draws the page as one column', () => {
  assert.deepEqual(layoutOf({ layout: { rail: 4, sticky: true } }), { rail: 4, sticky: true });
  assert.deepEqual(layoutOf({ layout: { rail: 3 } }), { rail: 3, sticky: false });
  assert.equal(layoutOf({}), null);
  assert.equal(layoutOf({ layout: { rail: 13 } }), null, 'a rail wider than the kernel admits');
  assert.equal(layoutOf({ layout: { rail: 4.5 } }), null, 'a rail between two columns');
  assert.equal(layoutOf({ layout: null }), null);
  assert.equal(layoutOf(null), null);
  // `sticky: 'yes'` is truthy wherever it is read, which is why only `true` keeps the rail in view.
  assert.deepEqual(layoutOf({ layout: { rail: 5, sticky: 'yes' } }), { rail: 5, sticky: false });
});

test('SPAN KEEPS ITS MEANING INSIDE THE MAIN COLUMN, which is the twelfths the rail leaves', () => {
  assert.equal(mainSpan({ rail: 3, sticky: false }), 9);
  assert.equal(mainSpan(RAIL), 8);
  assert.equal(mainSpan({ rail: 5, sticky: false }), 7);
});

test('A BOXED SECTION HOLDS THE BLOCKS AFTER IT ON ONE SURFACE, up to the next section', () => {
  const runs = boxesOf([
    { kind: 'section', heading: 'Where it stands', box: true },
    { kind: 'note', heading: 'Sentence' },
    { kind: 'cards', heading: 'Next' },
    { kind: 'section', heading: 'The parts' },
    { kind: 'cards', heading: 'Parts' },
  ]);
  assert.deepEqual(
    runs.map((r) => ({ box: r.box, items: headings(r.items) })),
    [
      { box: true, items: ['Where it stands', 'Sentence', 'Next'] },
      { box: false, items: ['The parts', 'Parts'] },
    ],
  );
});

test('A BOX RUNS TO THE END OF ITS AREA, blocks before the first section are loose, and only `true` boxes', () => {
  const runs = boxesOf([
    { kind: 'stat', heading: 'Before' },
    { kind: 'section', heading: 'Loose', box: 'yes' },
    { kind: 'note', heading: 'Under loose' },
    { kind: 'section', heading: 'Boxed', box: true },
    { kind: 'note', heading: 'Last' },
  ]);
  assert.deepEqual(
    runs.map((r) => ({ box: r.box, items: headings(r.items) })),
    [
      { box: false, items: ['Before', 'Loose', 'Under loose'] },
      { box: true, items: ['Boxed', 'Last'] },
    ],
  );
  // A page with no section at all is one loose run, which is the page as it was drawn before boxes existed.
  assert.deepEqual(boxesOf([{ kind: 'note' }, { kind: 'stat' }]).map((r) => r.box), [false]);
  assert.deepEqual(boxesOf([]), []);
});

test('A BLOCK THAT JOINS SHARES THE SURFACE OF THE ONE BEFORE IT, and the two take nothing after them', () => {
  const runs = boxesOf([
    { kind: 'queue', heading: 'What needs you' },
    { kind: 'todo', heading: 'Late' },
    { kind: 'timeline', joins: true },
    { kind: 'todo', heading: 'Urgent' },
    { kind: 'section', heading: 'Boxed', box: true },
    { kind: 'note', heading: 'Inside' },
    { kind: 'timeline', heading: 'Also inside', joins: true },
  ]);
  assert.deepEqual(
    runs.map((r) => ({ box: r.box, items: headings(r.items) })),
    [
      { box: false, items: ['What needs you'] },
      { box: true, items: ['Late', undefined] },
      { box: false, items: ['Urgent'] },
      { box: true, items: ['Boxed', 'Inside', 'Also inside'] },
    ],
  );
  /* THE FIRST BLOCK HAS NOTHING TO JOIN, so it is loose. */
  assert.deepEqual(boxesOf([{ kind: 'timeline', joins: true }]).map((r) => r.box), [false]);
});

test('THE RAIL STAYS IN VIEW ONLY WHEN IT WAS ASKED TO AND FITS', () => {
  // A sticky rail taller than the window hides its own foot: it stays pinned while the main column scrolls, and the
  // blocks at its end cannot be reached until the main column runs out.
  const sticky: Layout = { rail: 4, sticky: true };
  assert.equal(sticks(sticky, 420, 700), true);
  assert.equal(sticks(sticky, 900, 700), false);
  assert.equal(sticks(RAIL, 420, 700), false, 'nobody asked');
  assert.equal(sticks(null, 420, 700), false);
  assert.equal(sticks(sticky, 0, 700), false, 'not measured yet');
});

/* ── Done, over the wire ──────────────────────────────────────────────── */

const DESK_BODY = {
  page: 'desk',
  title: 'Desk',
  layout: { rail: 4 },
  blocks: [
    { kind: 'table', heading: 'Every step', source: 'register.steps' },
    { kind: 'note', heading: 'Pinned', body: 'Ship the box first.', area: 'rail' },
  ],
};

/* A record that answers the desk's page read with the body above and keeps every declaration it is sent. */
function desk(): { io: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; set: () => { blocks: { heading?: string; area?: string }[] } | undefined } {
  const sent: { url: string; body: unknown }[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  return {
    io: async (input, init) => {
      const url = String(input);
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/api/page')) return json({ ok: true, value: { ...DESK_BODY, blocks: DESK_BODY.blocks.map((b) => ({ ...b, rows: [], drawn: true })) } });
      return json({ ok: true, value: [{ id: 'page.desk', version: 2, changed: true }] });
    },
    set: () => (sent.find((s) => s.url.endsWith('/api/setDeclaration'))?.body as { body: { blocks: { heading?: string; area?: string }[] } } | undefined)?.body,
  };
}

test('DONE WRITES A BLOCK MOVED TO THE RAIL IN THE RAIL, through the one arrangement write every page uses', async () => {
  // THE FAULT THIS HOLDS: `saveArrangement` laid the body out by order and span, so the area a block was moved to never
  // reached the record, and pages with a rail went through a second write, `layout-write.ts`, to carry it. `Placed`
  // carries `area` now and `arrangedBody` writes it (`page-write.test.ts` holds the rules), so that file is gone and
  // this is the plain path, which failed here with the areas as the record held them: Pinned still rail, Every step main.
  const placed = [
    { i: 1, span: 12, area: 'main' as const },
    { i: 0, span: 12, area: 'rail' as const },
  ];
  const plain = desk();
  const { saveArrangement } = await import('../record/page-write.ts');
  assert.equal((await saveArrangement('http://record.test', 'desk', 2, placed, [], plain.io as never)).from, 'written');
  assert.deepEqual(plain.set()?.blocks.map((b) => [b.heading, b.area]), [['Pinned', undefined], ['Every step', 'rail']]);
});

/* ── through the record ───────────────────────────────────────────────── */

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

test('THE RECORD`S PAGE READ CARRIES `layout`, `area` AND `box` TO THE SPLIT THE PAGE DRAWS', async () => {
  const k = await openRecord(openSqlite(), { now: () => Date.parse('2026-09-25T12:00:00Z') });
  const put = await k.install([
    { id: 'register.steps', kind: 'register', body: { id: 'steps', name: 'Steps', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } },
    {
      id: 'page.desk',
      kind: 'page',
      body: {
        page: 'desk',
        title: 'Desk',
        layout: { rail: 4, sticky: true },
        requires: ['register.steps'],
        blocks: [
          { kind: 'section', heading: 'Where it stands', box: true },
          { kind: 'table', heading: 'Every step', source: 'register.steps' },
          { kind: 'note', heading: 'Pinned', body: 'Ship the box first.', area: 'rail' },
          { kind: 'note', heading: 'Asked', body: 'Which board?', area: 'rail' },
          { kind: 'note', heading: 'Later', body: 'After the fit.', area: 'rail' },
        ],
      },
    },
  ] as never);
  assert.ok(put.ok, JSON.stringify(put));
  const read = k.page('desk');
  assert.ok(read.ok, JSON.stringify(read));
  const layout = layoutOf(read.value);
  assert.deepEqual(layout, { rail: 4, sticky: true });
  const blocks = (read.value.blocks as never[]).map((b) => blockOf(b, new Map(), Date.parse('2026-09-25T12:00:00Z')));
  const { main, rail } = splitAreas(blocks, layout);
  assert.deepEqual(headings(main), ['Where it stands', 'Every step']);
  assert.deepEqual(headings(rail), ['Pinned', 'Asked', 'Later']);
  assert.deepEqual(boxesOf(main).map((r) => ({ box: r.box, items: headings(r.items) })), [{ box: true, items: ['Where it stands', 'Every step'] }]);
});

/* A ROW THE AUTHOR FILLED STAYS FILLED. Work's Late and This week are six each, each on its own `when:`. */
const shown = (span: number) => ({ span, drawn: true });
const hidden = (span: number) => ({ span, drawn: false });

test('A HALF WHOSE PARTNER IS HIDDEN TAKES THE WHOLE ROW, either way round, and the next row keeps its own widths', () => {
  assert.deepEqual(widened([shown(12), hidden(6), shown(6), shown(6), shown(6)]), [12, 6, 12, 6, 6]);
  assert.deepEqual(widened([shown(6), hidden(6), shown(12)]), [12, 6, 12]);
});

test('A ROW THAT LOSES ONE OF THREE SHARES ITS ROOM by span, and a row with nothing hidden is drawn as declared', () => {
  assert.deepEqual(widened([shown(4), hidden(4), shown(4)]), [6, 4, 6]);
  assert.deepEqual(widened([shown(8), hidden(4)]), [12, 4]);
  assert.deepEqual(widened([shown(3), shown(3), hidden(6)]), [6, 6, 6]);
  assert.deepEqual(widened([shown(6), shown(6), shown(4), shown(8)]), [6, 6, 4, 8]);
});

test('A ROW THAT WAS NEVER WHOLE IS LEFT AS IT WAS, and a row with nothing drawn gives nobody its room', () => {
  /* A six alone before a twelve is half the page by choice. A six that does not fit beside an eight starts the next
     row, so the eight is left as it is and that row is the one that widens. */
  assert.deepEqual(widened([shown(6), shown(12)]), [6, 12]);
  assert.deepEqual(widened([shown(8), hidden(6), shown(6)]), [8, 6, 12]);
  assert.deepEqual(widened([hidden(6), hidden(6), shown(6)]), [6, 6, 6]);
});

/* ON A WIDE SCREEN A FLOW OF FULL-WIDTH LISTS IS TWO COLUMNS. */
const k = (kind: string, span = 12, more: { drawn?: boolean; lead?: boolean; columns?: number; declared?: boolean } = {}) => ({ kind, span, drawn: more.drawn ?? true, ...more });

test('TWO WHOLE-ROW LISTS ONE AFTER THE OTHER ARE TWO HALVES, and one left over keeps the whole row', () => {
  assert.deepEqual(paired([k('todo'), k('feed'), k('timeline')]), [6, 6, 12]);
  assert.deepEqual(paired([k('todo'), k('feed'), k('timeline'), k('note')]), [6, 6, 6, 6]);
});

test('A BLOCK THAT MAY NOT BE HALVED STANDS ALONE and the pairing starts again after it, in declared order', () => {
  /* The page's line, a heading, a table and a forecast each keep the row; the lists either side of them pair among themselves. */
  assert.deepEqual(paired([k('note', 12, { lead: true }), k('todo'), k('feed')]), [12, 6, 6]);
  assert.deepEqual(paired([k('todo'), k('section'), k('feed'), k('timeline')]), [12, 12, 6, 6]);
  assert.deepEqual(paired([k('todo'), k('table'), k('feed')]), [12, 12, 12]);
  assert.deepEqual(paired([k('forecast'), k('todo'), k('capture'), k('feed')]), [12, 12, 12, 12]);
  /* A spec of five columns is laid out in tracks that need the row. */
  assert.deepEqual(paired([k('spec', 12, { columns: 5 }), k('todo')]), [12, 12]);
});

test('AN AUTHOR`S OWN WIDTH IS KEPT, and a hidden block takes no place between two that pair', () => {
  assert.deepEqual(paired([k('todo', 6), k('feed', 6), k('timeline')]), [6, 6, 12]);
  assert.deepEqual(paired([k('todo'), k('stat', 12, { drawn: false }), k('feed')]), [6, 12, 6]);
});

test('A BLOCK DECLARED AT THE WHOLE ROW IS NEVER HALF OF ONE: only a block that names no width is the page`s to pair', () => {
  /* Work: Late says `span: 12` and At a glance says nothing. Late keeps its row, and the pairing starts again after it. */
  assert.deepEqual(paired([k('todo', 12, { declared: true }), k('stat')]), [12, 12]);
  assert.deepEqual(paired([k('stat'), k('todo', 12, { declared: true })]), [12, 12]);
  assert.deepEqual(paired([k('todo', 12, { declared: true }), k('stat'), k('feed')]), [12, 6, 6]);
  assert.deepEqual(paired([k('todo'), k('todo', 12, { declared: true }), k('feed')]), [12, 12, 12]);
});

/* ── the line a page opens on, in its header ─────────────────────────────────── */

const o = (kind: string, more: { drawn?: boolean; lead?: boolean; box?: boolean; joins?: boolean } = {}) => ({ kind, drawn: more.drawn ?? true, ...more });

test('A LONE CAPTURE THAT OPENS THE PAGE IS THE HEADER`S, after the page`s sentence or with none', () => {
  assert.equal(headCaptureAt([o('note', { lead: true }), o('capture'), o('todo')]), 1);
  assert.equal(headCaptureAt([o('capture'), o('todo')]), 0);
  /* A block its `when:` left out is not what the page opens on. */
  assert.equal(headCaptureAt([o('note', { lead: true }), o('stat', { drawn: false }), o('capture'), o('todo')]), 2);
  assert.equal(headCaptureAt([o('capture')]), 0);
});

test('A CAPTURE ITS AUTHOR PUT SOMEWHERE STAYS THERE: further down, under a heading, or on a surface it shares', () => {
  assert.equal(headCaptureAt([o('note', { lead: true }), o('todo'), o('capture')]), -1);
  assert.equal(headCaptureAt([o('section', { box: true }), o('capture')]), -1);
  assert.equal(headCaptureAt([o('section'), o('capture')]), -1);
  assert.equal(headCaptureAt([o('capture'), o('todo', { joins: true })]), -1);
  /* Two sentences and then the line: only the page's one sentence stands before it. */
  assert.equal(headCaptureAt([o('note', { lead: true }), o('note', { lead: true }), o('capture')]), -1);
  assert.equal(headCaptureAt([]), -1);
  assert.equal(headCaptureAt([o('capture', { drawn: false }), o('todo')]), -1);
});

/* ── a phone's order ─────────────────────────────────────────────────────────── */

test('ON A PHONE THE CHART THE MAIN COLUMN OPENS ON COMES BEFORE THE SIDE COLUMN', () => {
  /* Money: Cash ahead, then the notes and what comes and goes. */
  assert.equal(leadChartAt([o('forecast'), o('note'), o('bridge')]), 0);
  assert.equal(leadChartAt([o('stat', { drawn: false }), o('forecast'), o('note')]), 1);
  assert.equal(leadChartAt([o('lines')]), 0);
});

test('A MAIN COLUMN THAT OPENS ON ANYTHING ELSE KEEPS ITS ORDER, and so does a chart that shares its surface', () => {
  assert.equal(leadChartAt([o('table'), o('forecast')]), -1);
  assert.equal(leadChartAt([o('roadmap'), o('todo')]), -1);
  assert.equal(leadChartAt([o('section', { box: true }), o('forecast')]), -1);
  assert.equal(leadChartAt([o('forecast'), o('spec', { joins: true })]), -1);
  assert.equal(leadChartAt([]), -1);
  assert.equal(leadChartAt([o('forecast', { drawn: false })]), -1);
});

/* ── the board's widths ─────────────────────────────────────── */

const at = (...spans: number[]) => spans.map((span) => ({ span, drawn: true }));

test('EVERY TILE ON THE BOARD IS A QUARTER, A THIRD, A HALF, TWO THIRDS OR THE WHOLE ROW, and a whole row stays whole', () => {
  assert.deepEqual(snapped(at(12)), [12]);
  assert.deepEqual(snapped(at(6, 6)), [6, 6]);
  assert.deepEqual(snapped(at(5, 7)), [4, 8]);
  assert.deepEqual(snapped(at(4, 4, 4)), [4, 4, 4]);
  assert.deepEqual(snapped(at(2, 10)), [4, 8]);
  assert.deepEqual(snapped(at(3, 3, 3, 3)), [3, 3, 3, 3]);
  for (const row of [at(5, 7), at(2, 10), at(7, 5), at(1, 11), at(9, 3), at(5, 5, 2)]) {
    const got = snapped(row);
    assert.equal(
      got.reduce((a, b) => a + b, 0),
      12,
      `${row.map((b) => b.span)} is a whole row and draws as one`,
    );
    for (const s of got) assert.ok(TILE_SPANS.includes(s), `${s} is a width the board has`);
  }
});

test('A ROW THAT WAS NOT WHOLE STAYS WITHIN THE ROW, and a hidden block keeps its span and takes no place', () => {
  assert.deepEqual(snapped(at(5)), [6]);
  assert.deepEqual(snapped(at(2)), [3]);
  assert.deepEqual(snapped(at(7, 4)), [8, 4]);
  assert.deepEqual(snapped([{ span: 5, drawn: false }, { span: 7, drawn: true }]), [5, 8]);
  for (const s of snapped(at(2, 2, 2, 2, 2, 2))) assert.equal(s, 3, 'six in a row are quarters, and wrap');
});

test('THE RAIL IS A THIRD OF THE BOARD AND THE MAIN COLUMN TWO, whatever rail the page declares', () => {
  for (const rail of [3, 4, 5]) assert.deepEqual(boardRail({ rail, sticky: false }), { main: 8, rail: 4 }, `rail ${rail}`);
});

/* THE RAIL RULE, which had no test at all (`PageBody.svelte` drew it from its own arithmetic). The rule sheet's Layout
   page declares this very page: a side rail whose only block says `when:` false. */
test('A SIDE RAIL WHOSE ONLY BLOCK IS HIDDEN DRAWS NO SIDE COLUMN, and the main column is twelve wide', () => {
  const hidden = [
    { kind: 'table', drawn: true },
    { kind: 'note', area: 'rail', drawn: false },
  ];
  assert.deepEqual(railDrawn(RAIL, hidden), { main: 12, rail: 0 });
});

test('both columns drawn are the board\'s two thirds and a third, and either alone takes the whole board', () => {
  assert.deepEqual(railDrawn(RAIL, [{ drawn: true }, { area: 'rail', drawn: true }]), { main: 8, rail: 4 });
  assert.deepEqual(railDrawn({ rail: 5, sticky: true }, [{ drawn: true }, { area: 'rail', drawn: true }]), { main: 8, rail: 4 });
  assert.deepEqual(railDrawn(RAIL, [{ drawn: false }, { area: 'rail', drawn: true }]), { main: 0, rail: 12 }, 'a main column of hidden blocks');
  assert.deepEqual(railDrawn(RAIL, [{ area: 'rail', drawn: true }]), { main: 0, rail: 12 }, 'no main block at all');
  assert.deepEqual(railDrawn(RAIL, []), { main: 0, rail: 0 }, 'a page of nothing draws neither');
});

test('A PAGE WITH NO LAYOUT IS ONE COLUMN, though a block says `area: rail`', () => {
  assert.deepEqual(railDrawn(null, [{ drawn: true }, { area: 'rail', drawn: true }]), { main: 12, rail: 0 });
  assert.deepEqual(railDrawn(null, [{ area: 'rail', drawn: true }]), { main: 12, rail: 0 });
  assert.deepEqual(railDrawn(null, [{ drawn: false }]), { main: 0, rail: 0 });
});

test('the rule is the one `splitAreas` splits by: an area that is not `rail` is main', () => {
  assert.deepEqual(railDrawn(RAIL, [{ area: 'side', drawn: true }, { area: 'rail', drawn: false }]), { main: 12, rail: 0 });
});
