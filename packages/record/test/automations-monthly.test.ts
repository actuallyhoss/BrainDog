/**
 * What the record says starts an automation on a monthly clock.
 *
 * MEASURED BEFORE THIS: `said`'s trigger line for `{ every: 1mo, day: last, at: 09:00 }` was "Every 1mo at 09:00 on
 * last.", the weekly sentence with a month's words dropped into it, which a person reads on Decide as a clock nobody
 * could have meant. The months a clock of three falls in were not said at all: they live in `month:` and the arithmetic,
 * and a person approving a quarterly bill should read the four months rather than work them out.
 *
 * THE SENTENCE IS HELD TO THE KERNEL'S OWN LINT, so a clock the record describes is one the kernel installs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration } from '../../kernel/src/index.ts';
import { said } from '../src/automations.ts';

const body = (on: Record<string, unknown>) => ({ rule: 'next_rent', on, then: [{ stop: true }] });
const trigger = (on: Record<string, unknown>): string => {
  const fault = validateDeclaration({ id: 'rule.next_rent', kind: 'rule', body: body(on) as never });
  assert.equal(fault, null, `the kernel refuses the clock this sentence describes: ${fault?.fix}`);
  return said(body(on)).trigger;
};

test('THE LAST DAY OF EACH MONTH IS SAID AS THAT, at its time', () => {
  assert.equal(trigger({ every: '1mo', day: 'last', at: '09:00' }), 'On the last day of each month at 09:00.');
});

test('A DAY OF THE MONTH IS SAID AS ONE, and a day some months lack says where it falls in them', () => {
  assert.equal(trigger({ every: '1mo', day: 1, at: '09:00' }), 'On the 1st of each month at 09:00.');
  assert.equal(trigger({ every: '1mo', day: 22, at: '18:30' }), 'On the 22nd of each month at 18:30.');
  assert.equal(trigger({ every: '1mo', day: 23, at: '09:00' }), 'On the 23rd of each month at 09:00.');
  assert.equal(trigger({ every: '1mo', day: 11, at: '09:00' }), 'On the 11th of each month at 09:00.');
  assert.equal(trigger({ every: '1mo', day: 31, at: '09:00' }), 'On the 31st of each month at 09:00, or on the last day of a month that has no 31st.');
});

test('EVERY FEW MONTHS NAMES THE MONTHS IT FALLS IN, and a year names its one', () => {
  assert.equal(trigger({ every: '3mo', day: 1, at: '09:00', month: 'jan' }), 'On the 1st of January, April, July and October at 09:00.');
  assert.equal(trigger({ every: '6mo', day: 'last', at: '09:00', month: 'jun' }), 'On the last day of June and December at 09:00.');
  assert.equal(trigger({ every: '1y', day: 29, at: '09:00', month: 'feb' }), 'On the 29th of February each year at 09:00, or on the last day of February in a year that has no 29th.');
});

/* THE FALLBACK IS SAID ONLY WHERE A MONTH THE CLOCK FALLS IN CAN LACK THE DAY. Measured when this was first written:
   `{ every: 1y, day: 31, month: jan }` was said with ", or on the last day of January in a year that has no 31st",
   as if some Januaries were short, and `day: 31, month: apr` promised a 31st of April that `clock.ts` clamps to the
   30th every year. */
test('A DAY EVERY MONTH IT FALLS IN HAS IS SAID PLAINLY, and a day none of them has is said as their last', () => {
  assert.equal(trigger({ every: '1y', day: 31, at: '09:00', month: 'jan' }), 'On the 31st of January each year at 09:00.');
  assert.equal(trigger({ every: '6mo', day: 31, at: '09:00', month: 'jan' }), 'On the 31st of January and July at 09:00.');
  assert.equal(trigger({ every: '1y', day: 31, at: '09:00', month: 'apr' }), 'On the last day of April each year at 09:00.');
  assert.equal(trigger({ every: '1y', day: 30, at: '09:00', month: 'feb' }), 'On the last day of February each year at 09:00.');
});

test('THE CLOCKS THAT WERE ALREADY SAID ARE SAID AS THEY WERE', () => {
  assert.equal(trigger({ every: '1h' }), 'Every 1h.');
  assert.equal(trigger({ every: '1w', at: '08:00', day: 'mon' }), 'Every 1w at 08:00 on mon.');
});
