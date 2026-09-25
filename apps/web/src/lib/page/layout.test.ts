/**
 * A page declared with `layout: { rail: 4 }` draws a main column and a side rail (brief D4 of
 * `loop/research-dynamic-layouts.md`, primitive P1).
 *
 * WHAT WAS WRONG BEFORE THIS FILE. The kernel admits `layout` and a block's `area` since wave one, and the page read hands
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
import { boxesOf, layoutOf, mainSpan, splitAreas, sticks, type Layout } from './layout.ts';

const RAIL: Layout = { rail: 4, sticky: false };

/* ONE TALL MAIN BLOCK AND THREE FOR THE RAIL, declared after it: the brief's page. */
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
  // THE RED WAVE TWO LEFT: `saveArrangement` laid the body out by order and span, so the area a block was moved to never
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
