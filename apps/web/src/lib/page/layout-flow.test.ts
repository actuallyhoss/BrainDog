/* WHERE THE SIDE COLUMN CLOSES, and the main column split there (`layout.ts` `flowAfterRail`, `areasWithFlow`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areasWithFlow, flowAfterRail } from './layout.ts';

const GAP = 12;
const tall = (...hs: number[]) => hs.map((height) => ({ height }));

test('a rail of 600 beside main blocks of 300, 300 and 300 flows from the third', () => {
  assert.equal(flowAfterRail(tall(300, 300, 300), 600, GAP), 2);
});

test('no rail flows nothing', () => {
  assert.equal(flowAfterRail(tall(300, 300, 300), 0, GAP), 3);
  assert.deepEqual(areasWithFlow(['Kiln figures', 'Glaze notes', 'Firing log'], 3), { beside: ['Kiln figures', 'Glaze notes', 'Firing log'], after: [] });
});

test('a rail taller than the main column flows nothing', () => {
  assert.equal(flowAfterRail(tall(300, 300, 300), 1200, GAP), 3);
});

test('two halves of one row share their top, so the column never closes between them', () => {
  const main = [
    { height: 500, top: 0 },
    { height: 300, top: 512 },
    { height: 340, top: 512 },
    { height: 200, top: 864 },
  ];
  assert.equal(flowAfterRail(main, 400, GAP), 1);
  assert.equal(flowAfterRail(main, 600, GAP), 3);
});

test('a block already drawn after the rail stands one gap under the foot before it', () => {
  /* The column holds two blocks ending at 612; the third, drawn wide, comes back if the rail grew past 624. */
  const main = [{ height: 300, top: 0 }, { height: 300, top: 312 }, { height: 120 }];
  assert.equal(flowAfterRail(main, 600, GAP), 2);
  assert.equal(flowAfterRail(main, 700, GAP), 3);
});

test('the first block never flows, and the split keeps declared order', () => {
  assert.equal(flowAfterRail(tall(300, 300), 1, GAP), 1);
  assert.deepEqual(areasWithFlow(['Cash ahead', 'Spending', 'Bills'], 2), { beside: ['Cash ahead', 'Spending'], after: ['Bills'] });
  assert.deepEqual(areasWithFlow(['Cash ahead'], 0), { beside: ['Cash ahead'], after: [] });
});
