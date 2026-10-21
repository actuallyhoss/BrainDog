/**
 * A `kpis` block's key numbers as the drawer takes them (`kpis-in.ts`): the project's colour slot, why it is on Today
 * only for a pin or a number off target, and where a row opens.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blockOf } from '../record/page-live.ts';
import { kpiHref, kpiInputOf, kpisIn } from './kpis-in.ts';

/** One key number as the kernel's `sources/kpis.ts` answers it on Today. */
const answered = (over: Record<string, unknown> = {}) => ({
  kpi: 'k1',
  name: 'Sales a month',
  thing: 'r_kiln',
  spoken: 'things#1',
  project: 'Kiln',
  mark: 'tag',
  hue: 265,
  source: 'numbers',
  unit: 'GBP',
  kind: 'flow',
  good: 'up',
  target: 'GBP 4,000.00',
  every: '1m',
  today: 'auto',
  headline: true,
  points: [
    { at: '2026-06-28', amount: 'GBP 3,900.00' },
    { at: '2026-07-28', amount: 'GBP 4,600.00' },
    { at: '2026-08-28', amount: 'GBP 4,350.00' },
  ],
  latest: { at: '2026-08-28', amount: 'GBP 4,350.00' },
  change: -0.054,
  stale: { stale: false, days: 6, fix: null },
  chart: { chart: 'line', target: 'line', trend: false },
  rank: 'money',
  ...over,
});

test('A KEY NUMBER IS HANDED OVER AS THE DRAWER TAKES IT: its fields, its points and its project`s colour slot, and nothing it does not read', () => {
  const k = kpiInputOf(answered())!;
  assert.equal(k.name, 'Sales a month');
  assert.equal(k.project, 'Kiln');
  assert.equal(k.slot, 'blue', 'hue 265 is the blue slot');
  assert.equal(k.unit, 'GBP');
  assert.equal(k.kind, 'flow');
  assert.equal(k.target, 'GBP 4,000.00');
  assert.equal(k.headline, true);
  assert.equal(k.points.length, 3);
  for (const key of ['thing', 'mark', 'hue', 'today', 'latest', 'change', 'stale', 'chart', 'rank']) assert.ok(!(key in k), key);
  /* NO HUE IS THE NEUTRAL SLOT, never a made-up colour. */
  assert.equal(kpiInputOf(answered({ hue: null }))!.slot, 'slate');
  /* WHAT CANNOT BE DRAWN IS LEFT OUT: no name, no points, a point with no value. */
  assert.equal(kpiInputOf(answered({ name: '' })), null);
  assert.equal(kpiInputOf(answered({ points: null })), null);
  assert.deepEqual(kpiInputOf(answered({ points: [{ at: '2026-08-28' }, { at: '2026-08-29', value: 4 }] }))!.points, [{ at: '2026-08-29', value: 4 }]);
  assert.deepEqual(kpisIn({ kpis: [answered(), { name: 'Broken' }, 7] }).map((x) => x.name), ['Sales a month']);
  assert.deepEqual(kpisIn({}), []);
});

test('WHY IT IS ON TODAY IS SAID ONLY FOR A PIN OR A NUMBER OFF TARGET: money first, a big change and stale order the rows and are not printed', () => {
  const why = (rank: string, said: string) => kpiInputOf(answered({ rank, why: said }))!.why;
  assert.equal(why('pinned', 'Pinned to Today'), 'Pinned to Today');
  assert.equal(why('off-target', 'Off target'), 'Off target');
  assert.equal(why('change', 'Up 34%'), undefined);
  assert.equal(why('stale', 'Not updated for 23 days'), undefined);
  assert.equal(why('money', 'Money first'), undefined);
  assert.equal(kpiInputOf(answered({ rank: 'pinned' }))!.why, undefined, 'a pin the record put no words to says none');
});

test('A ROW OPENS ITS PROJECT: the project`s own page where its list made one, else its row, and nothing for a number with no project', () => {
  assert.equal(kpiHref({ spoken: 'things#1' }, () => '/p/kiln'), '/p/kiln');
  assert.equal(kpiHref({ spoken: 'things#3' }, () => null), '/r/things/3');
  assert.equal(kpiHref({}, () => '/p/kiln'), null);
  assert.equal(kpiHref({ spoken: 'not a row' }, () => '/p/kiln'), null);
  assert.equal(kpiInputOf(answered())!.spoken, 'things#1');
});

test('THE RECORD`S ANSWER REACHES THE PAGE WHOLE: a kpis block is drawn from its numbers, never said to be beyond this build, and says no "N more"', () => {
  const live = blockOf({ kind: 'kpis', source: 'kpis', for: 'today', key: 'numbers', heading: 'Numbers', rows: [], matched: 5, refusals: [], kpis: [answered()] } as never, new Map(), Date.parse('2026-09-03T12:00:00Z'));
  assert.equal(live.cannot, undefined);
  assert.equal(live.drawn, true);
  assert.deepEqual([live.shown, live.total], [1, 1]);
  assert.deepEqual(kpisIn(live as { kpis?: unknown }).map((k) => k.name), ['Sales a month']);
});
