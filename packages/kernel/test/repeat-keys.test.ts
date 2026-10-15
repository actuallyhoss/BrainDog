/**
 * A `repeat:` key the record does not read is refused at install, naming the key, and the days a repeat names are days.
 *
 * `validate` read `freq` out of a field's `repeat:` and nothing else, so every other key installed and was ignored:
 * `{ freq: monthly, colour: blue }` walked as though the colour were not there. `schedule.ts` now reads `freq`,
 * `interval`, `count`, `until`, `workday`, `bymonthday` and `byday`, so those seven install, `bymonthday` and `byday`
 * each on the frequency it belongs to, and anything else is refused by name. A salary on the 15th and the last day and
 * `02 §4`'s Tuesdays and Thursdays install; a day that is no day is refused where it is written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REPEAT_READ, openRecord, type Declaration } from '../src/index.ts';
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

type Out = { ok: boolean; refusal?: { code: string; fix: string; at?: string; allowed?: readonly string[] } };

test('THE DAYS OF SECTION 4.2 INSTALL, and a key nobody reads is still refused, naming it', async () => {
  const month = await installed({ freq: 'monthly', bymonthday: [15, -1] });
  assert.ok(month.ok, JSON.stringify(month));
  const week = await installed({ freq: 'weekly', byday: ['TU', 'TH'], count: 4 });
  assert.ok(week.ok, JSON.stringify(week));
  const out = (await installed({ freq: 'monthly', colour: 'blue' })) as Out;
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'DECLARATION_INVALID');
  assert.equal(out.refusal?.at, 'due.repeat.colour');
  assert.match(out.refusal?.fix ?? '', /\bcolour\b/u, out.refusal?.fix);
  assert.deepEqual(out.refusal?.allowed, ['freq', 'interval', 'count', 'until', 'workday', 'bymonthday', 'byday']);
  assert.deepEqual(out.refusal?.allowed, [...REPEAT_READ], 'the keys the install admits are the keys the walk reads');
});

test('A DAY THAT IS NO DAY IS REFUSED where it is written', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ freq: 'monthly', bymonthday: [0] }, 'bymonthday'],
    [{ freq: 'monthly', bymonthday: [32] }, 'bymonthday'],
    [{ freq: 'monthly', bymonthday: [-4] }, 'bymonthday'],
    [{ freq: 'monthly', bymonthday: [] }, 'bymonthday'],
    [{ freq: 'monthly', bymonthday: 'fifteen' }, 'bymonthday'],
    [{ freq: 'weekly', byday: ['XX'] }, 'byday'],
    [{ freq: 'weekly', byday: ['tuesday'] }, 'byday'],
    [{ freq: 'weekly', bymonthday: [15] }, 'bymonthday'],
    [{ freq: 'monthly', byday: ['TU'] }, 'byday'],
    [{ freq: 'monthly', workday: 'sometimes' }, 'workday'],
  ];
  const outs: Out[] = [];
  for (const [repeat] of cases) outs.push((await installed(repeat)) as Out);
  /* ALL ASKED BEFORE ANY IS ASSERTED, so a red run names every declaration that installed, not the first. */
  assert.deepEqual(cases.filter((_, i) => outs[i]!.ok).map(([repeat]) => JSON.stringify(repeat)), [], 'these installed');
  for (const [i, [repeat, key]] of cases.entries()) {
    assert.equal(outs[i]!.refusal?.code, 'DECLARATION_INVALID', JSON.stringify(repeat));
    assert.equal(outs[i]!.refusal?.at, `due.repeat.${key}`, JSON.stringify(repeat));
  }
});

test('AND WHAT THE RECORD DOES READ STILL INSTALLS: freq alone, and freq with the four keys the walk takes', async () => {
  assert.ok((await installed({ freq: 'monthly' })).ok, 'freq: monthly alone was refused');
  const full = await installed({ freq: 'weekly', interval: 2, count: 4, until: '2027-01-01', workday: 'previous' });
  assert.ok(full.ok, JSON.stringify(full));
});
