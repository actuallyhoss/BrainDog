/**
 * A long table draws what is on screen and no more (PGS-A16): `windowOf`'s arithmetic, `revealTop`'s scroll for a caret,
 * and `RowsWindow.svelte` drawn on the server over 2,527 rows, which is the list the scope names.
 *
 * THE SPACERS ARE THE CLAIM THAT MATTERS. A window that drew the right rows and reserved the wrong height would be a
 * scrollbar that lies about where the reader is, which is the reason `Table` refused to virtualise. So every window
 * here is checked to add up to the whole list's height, at a phone's screen and a desktop's, at the top, the middle and
 * the end.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { revealTop, windowed, windowOf, ROW_PX, ROWS_OVERSCAN, ROWS_WINDOW_FROM } from './rows-window.ts';
import type { Column, TableRow } from './table.ts';

const COUNT = 2527;
const PX = 44;
const SCREENS = [390, 1440];

test('2,527 rows at a 390 and a 1440 tall screen draw at most about 40, anywhere in the list', () => {
  for (const height of SCREENS) {
    for (const top of [0, PX * 7.5, PX * 1263, PX * (COUNT - 30), PX * COUNT * 2]) {
      const w = windowOf({ count: COUNT, rowPx: PX, top, height });
      assert.ok(w.to - w.from <= 40, `${w.to - w.from} rows at ${height} tall, ${top} down`);
      assert.ok(w.to - w.from >= Math.ceil(height / PX), `the screen at ${height} tall is filled`);
      assert.equal(w.before + (w.to - w.from) * PX + w.after, COUNT * PX, 'the spacers and the drawn rows are the whole height');
      assert.ok(w.from >= 0 && w.to <= COUNT && w.from <= w.to);
    }
  }
});

test('the rows on screen are among those drawn, with the overscan either side', () => {
  const top = PX * 1000 + 10;
  const w = windowOf({ count: COUNT, rowPx: PX, top, height: 1440 });
  const first = Math.floor(top / PX);
  const last = Math.floor((top + 1440) / PX);
  assert.equal(w.from, first - ROWS_OVERSCAN);
  assert.ok(w.to > last + ROWS_OVERSCAN - 1, 'the last row on screen and three past it are drawn');
  assert.equal(w.before, w.from * PX);
});

test('the ends: the top has no spacer above, the end none below, and past the end the last screen is drawn', () => {
  const head = windowOf({ count: COUNT, rowPx: PX, top: 0, height: 390 });
  assert.equal(head.from, 0);
  assert.equal(head.before, 0);
  const end = windowOf({ count: COUNT, rowPx: PX, top: PX * (COUNT - 5), height: 390 });
  assert.equal(end.to, COUNT);
  assert.equal(end.after, 0);
  /* A list that grew shorter under a screen scrolled far down: the last rows, never a page of spacer. */
  const past = windowOf({ count: COUNT, rowPx: PX, top: PX * COUNT * 3, height: 390 });
  assert.equal(past.to, COUNT);
  assert.ok(past.to - past.from >= Math.ceil(390 / PX));
});

test('a short list is drawn whole, and an empty one is nothing', () => {
  assert.deepEqual(windowOf({ count: 12, rowPx: PX, top: 0, height: 1440 }), { from: 0, to: 12, before: 0, after: 0 });
  assert.deepEqual(windowOf({ count: 0, rowPx: PX, top: 500, height: 1440 }), { from: 0, to: 0, before: 0, after: 0 });
});

test('what a live page can measure wrong does not break the window', () => {
  const nan = windowOf({ count: COUNT, rowPx: Number.NaN, top: Number.NaN, height: Number.NaN, overscan: -2 });
  assert.equal(nan.from, 0);
  assert.equal(nan.before + (nan.to - nan.from) * ROW_PX + nan.after, COUNT * ROW_PX, 'an unmeasured row is taken at the default height');
  const above = windowOf({ count: COUNT, rowPx: PX, top: -800, height: 390 });
  assert.equal(above.from, 0, 'a table still below the screen starts at its first row');
  const zero = windowOf({ count: COUNT, rowPx: 0, top: 0, height: 390 });
  assert.ok(zero.to - zero.from <= 40);
});

test('a caret moved onto a row off screen scrolls it to the nearer edge, and one on screen does not scroll', () => {
  assert.equal(revealTop({ index: 5, rowPx: PX, top: 0, height: 390 }), null);
  assert.equal(revealTop({ index: 20, rowPx: PX, top: 0, height: 390 }), 21 * PX - 390, 'below: its bottom at the bottom');
  assert.equal(revealTop({ index: 4, rowPx: PX, top: PX * 10, height: 390 }), 4 * PX, 'above: its top at the top');
  assert.equal(revealTop({ index: COUNT - 1, rowPx: PX, top: 0, height: 1440 }), COUNT * PX - 1440);
  /* A table under 300 pixels of page: the second row ends at 88, on a screen that ends at 90; the third's bottom at 132
     is past it, and the
     scroll is the whole distance, the 300 included, so the row lands at the bottom and not under the page's edge. */
  assert.equal(revealTop({ index: 1, rowPx: PX, top: -300, height: 390 }), null);
  const under = revealTop({ index: 2, rowPx: PX, top: -300, height: 390 });
  assert.equal(under, 3 * PX - 390);
  assert.equal((under ?? 0) - -300, 42, 'scrolled by what it takes, not by the clamped distance');
});

test('a table is drawn through the window past the count, and as it was under it', () => {
  assert.equal(windowed(ROWS_WINDOW_FROM), false);
  assert.equal(windowed(ROWS_WINDOW_FROM + 1), true);
  assert.equal(windowed(COUNT), true);
  assert.equal(windowed(Number.NaN), false);
});

/* `parity.test.ts`'s hook: the component and the runes module it reads are compiled for the server. */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

type Props = { columns: readonly Column[]; rows: readonly TableRow[]; total?: number; label?: string; onmore?: () => void; cap?: number };
/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const load = async (): Promise<Component<Props>> =>
  ((await import(new URL('../svelte/p/RowsWindow.svelte', import.meta.url).href)) as { default: Component<Props> }).default;

const COLUMNS: Column[] = [
  { field: 'title', label: 'Title', width: 'minmax(0, 1fr)' },
  { field: 'amount', label: 'Amount', width: '10rem', align: 'end' },
];
const ROWS: TableRow[] = Array.from({ length: COUNT }, (_, i) => ({
  key: `e${i + 1}`,
  cells: [`Kiln firing ${i + 1}`, i % 3 === 0 ? null : `GBP ${(i * 7) % 900}.00`],
}));

const draw = async (props: Partial<Props> = {}): Promise<string> =>
  render(await load(), { props: { columns: COLUMNS, rows: ROWS, total: COUNT, label: 'Firings', ...props } }).body;

test('drawn on the server, 2,527 rows build one screenful, numbered in the whole list', async () => {
  const html = await draw();
  const drawn = [...html.matchAll(/<div class="tr" role="row" aria-rowindex="(\d+)"/gu)].map((m) => Number(m[1]));
  assert.ok(drawn.length > 0 && drawn.length <= 40, `${drawn.length} rows built`);
  assert.equal(drawn[0], 2, 'the first row is row 2, the header being row 1');
  assert.deepEqual(drawn, drawn.map((_, i) => i + 2), 'each row its own place');
  assert.match(html, /aria-rowcount="2528"/u, 'the count is the whole list and its header');
  assert.match(html, /Kiln firing 1</u);
  assert.doesNotMatch(html, /Kiln firing 2527</u);
  /* ONE STOP: the first cell of the first row, every other cell out of the tab order. */
  assert.equal([...html.matchAll(/tabindex="0"/gu)].length, 2, 'the region and one cell');
  /* The spacer below holds every row not built, at the row height the window is cut by. */
  const after = Number(/class="rw-spacer[^"]*" aria-hidden="true" style="block-size:(\d+(?:\.\d+)?)px"/u.exec(html)?.[1]);
  assert.equal(after, (COUNT - drawn.length) * ROW_PX);
  assert.doesNotMatch(html, /sentinel/u, 'no host asks for more, so nothing watches for the end');
});

test('a host that pages gets a sentinel past the last row, and none once the list is at its cap', async () => {
  const more = () => {};
  assert.match(await draw({ onmore: more, total: -1 }), /<div class="sentinel[^"]*" aria-hidden="true"/u);
  assert.match(await draw({ onmore: more, total: -1 }), /aria-rowcount="-1"/u, 'a count still unknown is said as unknown');
  assert.doesNotMatch(await draw({ onmore: more, cap: COUNT }), /sentinel/u);
});

test('a missing value is the record mark and a cell its words, as Table draws them, and no key is shown', async () => {
  const html = await draw();
  assert.match(html, /<span class="missing">—<\/span>/u);
  assert.match(html, />£7\.00</u, 'an amount is drawn by the money reader');
  assert.doesNotMatch(html, />e\d+</u, 'a row is named by its words, never its key');
});

test('a grouped list counts its headings into the grid, and each heading takes its place in the window', async () => {
  const rows = ROWS.map((r, i) => ({ ...r, group: i < 1000 ? 'Spring' : 'Autumn' }));
  const html = render(await load(), { props: { columns: COLUMNS, rows, total: COUNT, label: 'Firings' } }).body;
  assert.match(html, /aria-rowcount="2530"/u, 'the rows, the header and two headings');
  assert.match(html, /<div class="tr tr-group" role="row" aria-rowindex="2" data-line="0">/u);
  assert.match(html, /<div class="tr" role="row" aria-rowindex="3" data-line="1">/u, 'the first row stands under its heading');
});

test('the component compiles for the browser with no warning', () => {
  const filename = fileURLToPath(new URL('../svelte/p/RowsWindow.svelte', import.meta.url));
  const { warnings } = compile(readFileSync(filename, 'utf8'), { generate: 'client', filename });
  assert.deepEqual(warnings.map((w) => `${w.code}: ${w.message}`), []);
});
