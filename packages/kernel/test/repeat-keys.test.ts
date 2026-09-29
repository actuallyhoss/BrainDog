/**
 * A `repeat:` key the record does not read is refused at install, naming the key.
 *
 * `validate` read `freq` out of a field's `repeat:` and nothing else, so every other key installed and was ignored.
 * Driven through `install` and `expandRepeat` from an anchor of 2026-09-15, all three of these installed and walked as
 * though the extra key were not there:
 *
 *     { freq: monthly, bymonthday: [15, -1] }        ->  09-15, 10-15, 11-15        (never the last day)
 *     { freq: weekly, byday: [TU, TH], count: 4 }    ->  09-15, 09-22, 09-29, 10-06 (never a Thursday)
 *     { freq: monthly, colour: blue }                ->  09-15, 10-15, 11-15
 *
 * The first is a salary paid on the 15th and the last day, and the second is `02 §4`'s own worked example. A schedule
 * that says two days a month and arms one is worse than a refusal, because nobody finds out until a day is missed.
 * `schedule.ts` reads `freq`, `interval`, `count`, `until` and `workday`, so those five are what installs until
 * `bymonthday` and `byday` are built there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);

const withRepeat = (repeat: Record<string, unknown>): Declaration => ({
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'due', type: 'day', repeat },
    ],
  } as never,
});

async function installed(repeat: Record<string, unknown>) {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  return k.install([withRepeat(repeat)]);
}

test('THE THREE DECLARATIONS OF SECTION 4.2 ARE REFUSED, each naming the key nobody reads', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ freq: 'monthly', bymonthday: [15, -1] }, 'bymonthday'],
    [{ freq: 'weekly', byday: ['TU', 'TH'], count: 4 }, 'byday'],
    [{ freq: 'monthly', colour: 'blue' }, 'colour'],
  ];
  type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  const outs: Out[] = [];
  for (const [repeat] of cases) outs.push((await installed(repeat)) as Out);
  /* ALL THREE ASKED BEFORE ANY IS ASSERTED, so a red run names every declaration that installed, not the first. */
  assert.deepEqual(
    cases.filter((_, i) => outs[i]!.ok).map(([repeat]) => JSON.stringify(repeat)),
    [],
    'these installed, and the key beside freq would be ignored',
  );
  for (const [i, [, key]] of cases.entries()) {
    const out = outs[i]!;
    assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
    assert.equal(out.refusal?.at, `due.repeat.${key}`);
    assert.match(out.refusal?.fix ?? '', new RegExp(`\\b${key}\\b`), out.refusal?.fix);
    assert.deepEqual(out.refusal?.allowed, ['freq', 'interval', 'count', 'until', 'workday']);
  }
});

test('AND WHAT THE RECORD DOES READ STILL INSTALLS: freq alone, and freq with the four keys the walk takes', async () => {
  assert.ok((await installed({ freq: 'monthly' })).ok, 'freq: monthly alone was refused');
  const full = await installed({ freq: 'weekly', interval: 2, count: 4, until: '2027-01-01', workday: 'previous' });
  assert.ok(full.ok, JSON.stringify(full));
});
