import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changeSaid, linesNearest, linesPlan } from './lines.ts';
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
  /* A GAP BREAKS THE LINE: the current line starts again after 2 Sep, and never draws a zero there. */
  assert.equal((plan.lines[0]!.d.match(/M/gu) ?? []).length, 2);
  assert.match(plan.lines[0]!.end, /^M1000 /u);
  assert.equal(plan.top, '£4,200.00');
  assert.equal(plan.bottom, '£3,600.00');
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
