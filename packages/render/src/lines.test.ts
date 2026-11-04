import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changeSaid, linesNearest, linesOnly, linesPlan } from './lines.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';
import { KINDS } from './kinds.ts';

const rows = (src: string): string[][] => src.trim().split('\n').map((l) => l.split('|').map((c) => c.trim()));

test('a line and the period before it: the lead, the change, and the paths', () => {
  const plan = linesPlan(rows('Day | Revenue | was: Previous 30 days\n1 Sep | £4,000.00 | £3,600.00\n2 Sep |  | £3,650.00\n3 Sep | £4,200.00 | £3,900.00'));
  assert.equal(plan.lines.length, 2);
  assert.deepEqual(plan.lines.map((l) => [l.label, l.was, l.step]), [['Revenue', false, 0], ['Previous 30 days', true, 0]]);
  assert.equal(plan.now, '£4,200.00');
  assert.equal(plan.then, '£3,900.00');
  assert.equal(plan.change, '+7.7%');
  assert.equal(plan.trend, 'up');
  assert.equal(plan.against, 'Previous 30 days');
  /* NO TWO READINGS SIDE BY SIDE: the gap is only the day between readings, so the line runs through it (5d4647de2). */
  assert.equal((plan.lines[0]!.d.match(/M/gu) ?? []).length, 1);
  assert.equal((plan.lines[0]!.d.match(/L/gu) ?? []).length, 1);
  /* WHERE SOME DO STAND SIDE BY SIDE A GAP BREAKS THE LINE: it starts again after 3 Sep, and never draws a zero there. */
  const broken = linesPlan(rows('Day | Revenue\n1 Sep | £4,000.00\n2 Sep | £4,100.00\n3 Sep | \n4 Sep | £4,200.00\n5 Sep | £4,300.00'));
  assert.equal((broken.lines[0]!.d.match(/M/gu) ?? []).length, 2);
  assert.match(plan.lines[0]!.end, /^M1000 /u);
  assert.equal(plan.top, '£4.2k');
  assert.equal(plan.bottom, '£3.6k');
  assert.deepEqual(plan.points[1]!.values, ['—', '£3,650.00']);
  assert.match(plan.sentence, /Revenue, 1 Sep £4,000.00 to 3 Sep £4,200.00, highest £4,200.00 on 3 Sep/u);
});

test('a fall reads with a real minus, a flat run sits in the middle, and nothing to draw is said', () => {
  assert.equal(changeSaid(90, 100), '−10%');
  assert.equal(changeSaid(100, 100), '0%');
  assert.equal(changeSaid(5, 0), '', 'a change against nothing is not a percentage');
  const flat = linesPlan(rows('Day | Users\n1 Sep | 7\n2 Sep | 7'));
  assert.match(flat.lines[0]!.d, /^M0 50 L1000 50$/u);
  assert.equal(flat.bottom, '', 'one value has no bottom apart from its top');
  const none = linesPlan(rows('Day | Users\n1 Sep | '));
  assert.equal(none.empty, true);
  assert.equal(none.now, '');
});

test('five ticks at most, the ends kept, and a pointer finds the nearest point', () => {
  const body = Array.from({ length: 30 }, (_, i) => `${i + 1} Sep | ${i}`).join('\n');
  const plan = linesPlan(rows(`Day | Signups\n${body}`));
  assert.equal(plan.ticks.length, 5);
  assert.deepEqual([plan.ticks[0]!.minor, plan.ticks[4]!.minor], [false, false]);
  assert.equal(plan.ticks[4]!.label, '30 Sep');
  assert.equal(linesNearest(plan, 0), 0);
  assert.equal(linesNearest(plan, 1), 29);
  assert.equal(linesNearest(plan, 0.5), 15);
});

test('a lines fence parses as its own kind and draws its numbers in a fold', () => {
  assert.equal(KINDS.lines.header, true);
  const html = toHTML(parse('```lines | Revenue\nDay | Revenue | was: Before\n1 Sep | 10 | 8\n2 Sep | 12 | 9\n```'));
  assert.match(html, /data-kind="lines"/u);
  assert.match(html, /<details class="lines-numbers">/u);
  assert.match(html, /class="lines-change num" data-trend="up">\+33.3%/u);
  assert.match(html, /role="img" aria-label="Day: Revenue, 1 Sep 10 to 2 Sep 12/u);
});

test('ONE READING IS A FIGURE, its value and when it was read, and not a chart of one dot over a fold of one point', () => {
  const plan = linesPlan(rows('Day | Aov, Oxbow.gg | was: Previous 30 days\n27 Sep |  | \n28 Sep | £24.10 | \n29 Sep |  | '));
  assert.deepEqual(plan.single, { value: '£24.10', label: '28 Sep', line: 'Aov, Oxbow.gg', was: false, alone: true });
  assert.equal(linesOnly(plan.single!, true), '28 Sep, the only reading');
  assert.equal(linesOnly(plan.single!, false), 'Aov, Oxbow.gg, 28 Sep, the only reading', 'a figure under no heading names its measure');
  const html = toHTML(parse('```lines | Aov\nDay | Aov | was: Before\n27 Sep |  | \n28 Sep | £24.10 | \n```'));
  assert.match(
    html,
    /<div class="prop lines" data-single=""><p class="lines-lead"><span class="lines-now num">£24.10<\/span><span class="lines-against">28 Sep, the only reading<\/span><\/p><\/div>/u,
  );
  assert.doesNotMatch(html, /<svg|lines-numbers|lines-legend|Points on this chart/u, 'no chart, no fold of one point, no key to one line');

  /* TWO READINGS ARE A LINE, and so is one reading beside the period before. */
  assert.equal(linesPlan(rows('Day | Users\n1 Sep | 7\n2 Sep | 9')).single, null);
  assert.equal(linesPlan(rows('Day | Users | was: Before\n1 Sep | 7 | 5')).single, null);
  /* A READING ONLY IN THE PERIOD BEFORE SAYS WHICH LINE IT IS ON, and nothing at all is still a sentence. */
  assert.equal(linesOnly(linesPlan(rows('Day | Users | was: Previous 30 days\n1 Sep |  | 5')).single!, true), 'Previous 30 days, 1 Sep, the only reading');
  assert.equal(linesPlan(rows('Day | Users\n1 Sep | ')).single, null);
  /* AND ON A CHART OF TWO LINES, where the heading names both and the figure would be read as the first. */
  const costs = linesPlan(rows('Day | Revenue | Costs\n1 Sep |  | \n2 Sep |  | £5'));
  assert.equal(linesOnly(costs.single!, true), 'Costs, 2 Sep, the only reading');
  assert.match(toHTML(parse('```lines | Revenue and costs\nDay | Revenue | Costs\n2 Sep |  | £5\n```')), /<span class="lines-against">Costs, 2 Sep, the only reading<\/span>/u);
});

test('AN OLD READING SAYS ITS AGE: a line that stopped weeks ago says when, and a fresh one says nothing', async () => {
  const { linesAge, linesPlan } = await import('./lines.ts');
  const now = Date.UTC(2026, 9, 23, 12);
  const rows = [['Day', 'Players'], ['26 Sep', '5,100'], ['27 Sep', '5,683'], ['28 Sep', '—']];
  const plan = linesPlan(rows);
  assert.equal(plan.last, '27 Sep');
  assert.equal(linesAge(plan, now), 'Last reading 27 Sep, 26 days ago');
  assert.equal(linesAge(linesPlan([['Day', 'Players'], ['20 Oct', '9'], ['22 Oct', '10']]), now), '');
  assert.equal(linesAge(plan), '', 'with no clock it says nothing');
  assert.equal(linesAge(linesPlan([['Month', 'Players'], ['Aug', '9'], ['Sep', '10']]), now), '', 'a month is no day');
  assert.equal(linesAge(linesPlan([['Day', 'Players'], ['30 Dec', '9'], ['31 Dec', '10']]), Date.UTC(2027, 0, 20)), 'Last reading 31 Dec, 20 days ago');
});
