/**
 * A stat's line ahead: the cash walk from today, one point a day, with today marked at its start, its lowest point
 * marked on the stroke, and its two ends dated under it. A run behind is drawn as it always was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { trendAhead, trendOf } from './cards.ts';
import { toHTML } from './html.ts';
import { parse } from './parse.ts';

test('A RUN AHEAD is dated from its first day, and its lowest point is the first day it is lowest', () => {
  const a = trendAhead('@2026-10-27 5000 4990 4800 6200 70 4100 70 3900');
  assert.ok(a);
  assert.equal(a.from, '2026-10-27');
  assert.equal(a.to, '3 Nov', 'eight points are today and the seven days after it');
  assert.equal(a.lowDay, '31 Oct', 'the first of two equal lows');
  /* THE MARKS SIT ON THE STROKE: today is the line's first point and the low its lowest, both read off trendOf's scale. */
  const line = trendOf(a.run)!;
  assert.ok(line.d.startsWith(a.today.replace(/h0$/u, '').replace(/^M/u, 'M')), 'today is where the line starts');
  assert.match(a.low, /^M571\.43 90h0$/u, 'the lowest point is on the floor of the line, at its day');
  assert.equal(trendAhead('5000 4990 4800'), null, 'a run behind is not one ahead');
  assert.equal(trendAhead('@2026-10-27 5'), null, 'one point is no line');
});

test('A STAT DRAWS THE WALK AHEAD with today, its lowest point and both ends, and a run behind as before', () => {
  const html = toHTML(parse('```stat\nCash now | EGP 500,000.00 | Lowest EGP 7,000 on Wed 13 Jan | @2026-10-27 5000 4990 4800 70 4000\nBehind | 3 | | 1 2 3 4\n```'));
  assert.match(html, /<span class="cell-trend-ahead"><svg class="cell-trend"[^>]*aria-label="Cash now, today to 31 Oct: 5000, 4990, 4800, 70, 4000"/u);
  assert.match(html, /class="trend-today"/u);
  assert.match(html, /class="trend-low"/u);
  assert.match(html, /<span class="trend-days" aria-hidden="true"><span>Today<\/span><span>31 Oct<\/span><\/span>/u);
  assert.match(html, /Lowest EGP 7,000 on Wed 13 Jan/u);
  /* A RUN BEHIND KEEPS ITS LINE AND ITS END, with no day under it. */
  assert.match(html, /aria-label="Behind: 1, 2, 3, 4"/u);
  assert.equal((html.match(/trend-days/gu) ?? []).length, 1);
});

test('CASH AHEAD NUMBERS EACH PART OF A PLAN THE LINE DROPS BY, on the line and in a list with its day and amount', () => {
  const html = toHTML(
    parse(
      '```forecast\nopening | 2026-10-27 | Cash now | EGP 500,000.00\nstep | 2026-10-31 | Pay | EGP 120,000.00\nstep | 2027-01-05 | Car, part 4 of 12 | EGP −90,000.00\nof | Car |  | \nstep | 2027-01-13 | House, part 2 of 30 | EGP −300,000.00\nof | House |  | \nhorizon | 84 |  | \n```',
      { page: true },
    ),
  );
  assert.equal((html.match(/class="forecast-drop num"/gu) ?? []).length, 2, 'two marks on the line, none for the pay');
  assert.match(html, /<li class="forecast-drop-item"><span class="forecast-drop-n num" aria-hidden="true">1<\/span><span class="forecast-drop-label">Car, part 4 of 12<\/span><span class="forecast-drop-day">5 Jan 2027<\/span><span class="forecast-drop-amount num">[^<]*90,000/u);
  assert.match(html, /<span class="forecast-drop-n num" aria-hidden="true">2<\/span><span class="forecast-drop-label">House, part 2 of 30<\/span><span class="forecast-drop-day">13 Jan 2027<\/span>/u);
  /* A WALK WITH NO PLAN IN IT DRAWS NO LIST. */
  const none = toHTML(parse('```forecast\nopening | 2026-10-27 | Cash now | EGP 1,000.00\nstep | 2026-11-01 | Rent | EGP −100.00\nhorizon | 30 |  | \n```', { page: true }));
  assert.match(none, /forecast-chart/u, 'the walk is drawn');
  assert.doesNotMatch(none, /forecast-drop/u);
});
