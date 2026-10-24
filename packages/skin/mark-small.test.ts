/**
 * The tab's mark (scope 2026-10-24 E46): `MARK_SMALL` is drawn on the 16-pixel grid it is shown on, so at 16 pixels the
 * brain's edge and the dog are whole pixels. Rendered and looked at by hand at 16 and 32; this holds what the look
 * checked, so a redraw that loses the dog or blurs it fails here first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MARK_SMALL } from './mark.ts';

const at = (x: number, y: number): boolean => MARK_SMALL.rows[y]?.[x] === '#';

test('THE SMALL MARK IS 16 BY 16 WHOLE PIXELS, and its path draws exactly those', () => {
  assert.equal(MARK_SMALL.rows.length, 16);
  for (const row of MARK_SMALL.rows) assert.match(row, /^[#.]{16}$/u);
  /* EVERY RUN OF THE PATH IS ONE ROW'S RUN, on whole coordinates, so `crispEdges` has nothing to round. */
  const runs = [...MARK_SMALL.path.matchAll(/M(\d+) (\d+)H(\d+)V(\d+)H\1Z/gu)];
  assert.equal(runs.map((r) => r[0]).join(''), MARK_SMALL.path, 'the path holds something other than whole runs');
  const drawn = Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
  for (const [, x0, y, x1, y1] of runs) {
    assert.equal(Number(y1), Number(y) + 1);
    for (let x = Number(x0); x < Number(x1); x++) drawn[Number(y)]![x] = '#';
  }
  assert.deepEqual(drawn.map((r) => r.join('')), [...MARK_SMALL.rows]);
});

test('THE DOG READS: an eye of one pixel with the head round it, an ear above, and the throat open to the bottom', () => {
  /* THE EYE: a pixel of the mark with no pixel of the mark on any side of it. */
  const eyes = MARK_SMALL.rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' && !at(x - 1, y) && !at(x + 1, y) && !at(x, y - 1) && !at(x, y + 1) ? [[x, y]] : [])));
  assert.equal(eyes.length, 1, `the eye is ${eyes.length} pixels`);
  const [ex, ey] = eyes[0]!;
  /* THE EAR: open ground in the column behind the eye, rising above the head into the mark. */
  const back = ex! - 2;
  assert.ok(!at(back, ey! - 3) && !at(back, ey! - 4), 'no ear rises above the head');
  /* THE THROAT: the ground under the head runs down to the mark's foot. */
  for (let y = ey! + 1; y < 13; y++) assert.ok(!at(back, y), `the throat is shut at row ${y}`);
  /* AND THE SNOUT points away from the ear: the head is wider in front of the eye than behind it. */
  const open = (y: number, from: number, step: number): number => {
    let n = 0;
    for (let x = from; x >= 0 && x < 16 && !at(x, y); x += step) n++;
    return n;
  };
  assert.ok(open(ey! - 1, ex!, 1) > open(ey! - 1, ex!, -1), 'the snout does not reach forward');
});

test("THE BRAIN'S EDGE IS LOBED: its top dips between lobes", () => {
  /* A DIP is a pixel of open ground on the top edge with the mark on both sides of it in the row below. */
  const top = MARK_SMALL.rows.findIndex((row) => row.includes('#'));
  const dips = [...MARK_SMALL.rows[top]!].filter((c, x) => c === '.' && at(x, top + 1) && x > MARK_SMALL.rows[top]!.indexOf('#') && x < MARK_SMALL.rows[top]!.lastIndexOf('#'));
  assert.ok(dips.length >= 1, 'the top of the brain is one flat line');
});

test('BOTH APPS NAME THE SMALL MARK FOR THE TAB, beside favicon.ico at 16 and 32', () => {
  for (const app of ['web', 'site']) {
    const html = readFileSync(new URL(`../../apps/${app}/src/app.html`, import.meta.url), 'utf8');
    assert.match(html, /<link rel="icon" href="%sveltekit\.assets%\/mark-small\.svg" type="image\/svg\+xml" \/>/u, `${app} names another tab SVG`);
    assert.match(html, /<link rel="icon" href="%sveltekit\.assets%\/favicon\.ico" sizes="16x16 32x32" \/>/u);
    const ico = readFileSync(new URL(`../../apps/${app}/static/favicon.ico`, import.meta.url));
    assert.equal(ico.readUInt16LE(4), 2, 'the icon holds other than two sizes');
    assert.deepEqual([ico[6], ico[22]], [16, 32]);
  }
});
