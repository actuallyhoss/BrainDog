/**
 * The inspector's clock offers the record's monthly and yearly clocks, and every clock it builds is one the record
 * installs (`packages/kernel/src/clock.ts`, `flow-lint.ts` `calendarFault`).
 *
 * MEASURED RED ON 25 SEPTEMBER AT `896dd8b`. The kernel had taken `every: 1mo, day: 31, at: 09:00` since `clock.ts`
 * landed, and the inspector still offered 15m to 1w only. A monthly rule opened with its clock as an unlisted option and
 * no field for its day, time or month, and picking any clock went through `flow.ts`'s `clockOf`, which keeps `at` and
 * `day` for a day or a week alone: from `1mo, day: 31, at: 07:30` a pick of `3mo` wrote `{ every: 3mo }`, which the
 * record refuses as naming no day of the month. `calendar.ts` began as the two lines the inspector ran then (`EVERY`
 * and `clockOf`), and every test here failed against them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDeclaration } from '@braindog/kernel';

import { CLOCKS, MONTH_DAYS, andWords, calendarFault, clockTo, clockWords, dayWords, fallsIn } from './calendar.ts';
import { draftOf, faultsOf, sayTrigger } from './flow.ts';

/** What the record says about a rule on this clock, or `ok`. */
const record = (on: unknown): string =>
  validateDeclaration({ id: 'rule.m', kind: 'rule', body: { rule: 'm', on, steps: [{ notify: { say: 'x' } }] } } as never)?.fix ?? 'ok';

const KERNEL_STEPS = ['1mo', '2mo', '3mo', '4mo', '6mo', '1y'];

test('EVERY MONTHLY AND YEARLY CLOCK THE RECORD TAKES IS OFFERED, and each one picked from nothing installs', () => {
  for (const every of KERNEL_STEPS) assert.ok(CLOCKS.includes(every), `${every} is not offered`);
  /* A PICK FROM AN HOURLY CLOCK has no day, time or month to carry, so the builder supplies the ones the lint's own fix
     sentences name (day 1, 09:00, January) rather than leave a rule the record refuses. */
  for (const every of CLOCKS) assert.equal(record(clockTo(every, { every: '1h' })), 'ok', `${every} picked from 1h`);
});

test('PICKING ANOTHER CLOCK KEEPS THE DAY, THE TIME AND THE MONTH where the new clock reads them, and drops them where it does not', () => {
  const monthly = { every: '1mo', day: 31, at: '07:30' };
  assert.deepEqual(clockTo('3mo', monthly), { every: '3mo', day: 31, at: '07:30', month: 'jan' });
  assert.deepEqual(clockTo('1y', { every: '3mo', day: 'last', at: '07:30', month: 'apr' }), { every: '1y', day: 'last', at: '07:30', month: 'apr' });
  /* `month:` ON A COUNT OF ONE is refused as choosing nothing, so it goes. */
  assert.deepEqual(clockTo('1mo', { every: '6mo', day: 15, at: '07:30', month: 'apr' }), { every: '1mo', day: 15, at: '07:30' });
  /* A DAY OF THE MONTH IS NO WEEKDAY: day 31 on a weekly clock is refused, so the week falls back to Monday. */
  assert.deepEqual(clockTo('1w', monthly), { every: '1w', at: '07:30', day: 'mon' });
  assert.deepEqual(clockTo('1d', monthly), { every: '1d', at: '07:30' });
  assert.deepEqual(clockTo('1h', monthly), { every: '1h' });
  /* AND A WEEKDAY IS NO DAY OF THE MONTH: from a weekly clock on Friday, the month starts on the 1st. */
  assert.deepEqual(clockTo('1mo', { every: '1w', at: '18:00', day: 'fri' }), { every: '1mo', day: 1, at: '18:00' });
  for (const [to, from] of [['3mo', monthly], ['1mo', { every: '1w', at: '18:00', day: 'fri' }], ['1w', monthly]] as const)
    assert.equal(record(clockTo(to, from)), 'ok', `${to} from ${JSON.stringify(from)}`);
});

test('EVERY DAY, EVERY MONTH AND A NEW TIME EDITED ON A MONTHLY CLOCK IS ONE THE RECORD TAKES', () => {
  assert.deepEqual(MONTH_DAYS, [...Array.from({ length: 31 }, (_, i) => i + 1), 'last']);
  for (const day of MONTH_DAYS) assert.equal(record(clockTo('1mo', { every: '1mo', day, at: '09:00' })), 'ok', `day ${day}`);
  for (const month of ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])
    assert.equal(record(clockTo('6mo', { every: '6mo', day: 1, at: '09:00', month })), 'ok', month);
  assert.deepEqual(clockTo('1mo', { every: '1mo', day: 5, at: '23:45' }), { every: '1mo', day: 5, at: '23:45' });
  /* `12mo` IS WHAT AN AGENT MAY HAVE WRITTEN, and it is the same clock as `1y`: kept as written, and edited as one. */
  assert.deepEqual(clockTo('12mo', { every: '12mo', day: 1, at: '09:00', month: 'mar' }), { every: '12mo', day: 1, at: '09:00', month: 'mar' });
});

test('A CLOCK OF MONTHS IS SAID IN WORDS, and which months it falls in is said from the month it counts from', () => {
  assert.equal(clockWords('1mo'), 'every month');
  assert.equal(clockWords('3mo'), 'every 3 months');
  assert.equal(clockWords('1y'), 'every year');
  assert.equal(clockWords('12mo'), 'every year');
  assert.equal(clockWords('1h'), 'every hour');
  assert.equal(dayWords(1), '1st');
  assert.equal(dayWords(22), '22nd');
  assert.equal(dayWords(13), '13th');
  assert.equal(dayWords('last'), 'last day');
  assert.deepEqual(fallsIn('3mo', 'feb'), ['February', 'May', 'August', 'November']);
  assert.deepEqual(fallsIn('6mo', 'sep'), ['March', 'September']);
  assert.deepEqual(fallsIn('1y', 'dec'), ['December']);
  assert.equal(andWords(fallsIn('4mo', 'jan')), 'January, May and September');
  assert.equal(andWords(fallsIn('6mo', 'sep')), 'March and September');
});

test('A MONTHLY CLOCK PICKED ON THE CANVAS LEAVES SEND ON, and the trigger says its months in words', () => {
  /* MEASURED RED ON 25 SEPTEMBER. `faultsOf` read every clock through `everyMs`, which knows m, h, d and w, so a pick of
     every 3 months said "3mo is not a clock" and turned Send off, and the card said "3mo on 1 at 09:00". */
  const draft = (on: unknown) => draftOf('rule.m', { rule: 'm', on, steps: [{ notify: { say: 'x' } }] });
  const quarterly = draft(clockTo('3mo', { every: '1h' }));
  assert.deepEqual(faultsOf(quarterly), []);
  /* THE SAME SENTENCE THE RECORD SAYS ON DECIDE (`packages/record/src/automations.ts` `calendarSaid`), less its stop. */
  assert.equal(sayTrigger(quarterly.trigger), 'On the 1st of January, April, July and October at 09:00');
  assert.equal(sayTrigger(clockTo('1mo', { every: '1mo', day: 'last', at: '09:00' })), 'On the last day of each month at 09:00');
  assert.equal(
    sayTrigger(clockTo('1mo', { every: '1mo', day: 31, at: '07:30' })),
    'On the 31st of each month at 07:30, or on the last day of a month that has no 31st',
  );
  assert.equal(sayTrigger(clockTo('1y', { every: '1y', day: 30, at: '09:00', month: 'feb' })), 'On the last day of February each year at 09:00');
  assert.equal(
    sayTrigger(clockTo('1y', { every: '1y', day: 29, at: '09:00', month: 'feb' })),
    'On the 29th of February each year at 09:00, or on the last day of February in a year that has no 29th',
  );
  assert.equal(sayTrigger(clockTo('6mo', { every: '6mo', day: 15, at: '08:00', month: 'sep' })), 'On the 15th of March and September at 08:00');
  for (const every of CLOCKS) assert.deepEqual(faultsOf(draft(clockTo(every, { every: '1h' }))), [], every);
});

/* R2 MOVED WHO SAYS IT: the canvas's fault list no longer copies the lint, and the record's own refusal comes back
   through `checkAutomation`. `calendarFault` is still the sheet's reading of a clock of months, held here to the lint. */
test('A MONTHLY CLOCK THE RECORD WOULD REFUSE IS SAID IN CALENDAR WORDS, and never as no clock at all', () => {
  const cases: Record<string, unknown>[] = [
    { every: '5mo', day: 1, at: '09:00', month: 'jan' },
    { every: '1mo', at: '09:00' },
    { every: '1mo', day: 32, at: '09:00' },
    { every: '1mo', day: '31', at: '09:00' },
    { every: '1mo', day: 1 },
    { every: '1mo', day: 1, at: '25:00' },
    { every: '1mo', day: 1, at: '09:00', month: 'jan' },
    { every: '3mo', day: 1, at: '09:00' },
    { every: '3mo', day: 1, at: '09:00', month: 'january' },
  ];
  for (const on of cases) {
    const said = calendarFault(on);
    assert.notEqual(said, null, JSON.stringify(on));
    assert.doesNotMatch(said!, /not a clock|—/u);
    /* AND THE RECORD REFUSES EVERY ONE OF THEM, so the canvas is not stricter than the lint, nor looser. */
    assert.notEqual(record(on), 'ok', JSON.stringify(on));
  }
  for (const every of KERNEL_STEPS) assert.equal(calendarFault(clockTo(every, { every: '1h' })), null, every);
});

test('A DAY WRITTEN AS "31" IS THE 31st, and an edit keeps it rather than starting the month over on the 1st', () => {
  assert.deepEqual(clockTo('1mo', { every: '1mo', day: '31', at: '09:00' }), { every: '1mo', day: 31, at: '09:00' });
  assert.deepEqual(clockTo('3mo', { every: '1mo', day: '7', at: '09:00' }), { every: '3mo', day: 7, at: '09:00', month: 'jan' });
  assert.equal(record(clockTo('1mo', { every: '1mo', day: '31', at: '09:00' })), 'ok');
  /* NOT EVERY STRING: a day past the month is still no day, and falls back to the 1st as before. */
  assert.deepEqual(clockTo('1mo', { every: '1mo', day: '32', at: '09:00' }), { every: '1mo', day: 1, at: '09:00' });
});
