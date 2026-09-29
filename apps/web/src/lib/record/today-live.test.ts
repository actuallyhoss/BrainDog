/**
 * The reads Today added: the next two weeks' tasks, the runs of the day, who made the changes since the mark, and the
 * Money page's cash walk as a value a week. Pure pieces, driven with the rows the record answers.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byAgent, comingOf, forecastOf, hostOf, sessionsOf, sinceWho, tasksOf } from './today-live.ts';

const TODAY = '2026-09-29';
const row = (seq: number, fields: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id: `r${seq}`, seq, fields, ...extra });

test('WHAT WAS HANDED BACK TO BE CHECKED COMES AFTER THE LATE WORK, and each task carries its version, state, tier and project hue', () => {
  const out = tasksOf(
    [row(1, { what: 'Late', by: '2026-09-27', thing: 'p1', priority: 'high' }, { version: 4 })],
    [row(3, { what: 'Urgent' })],
    TODAY,
    new Map([['p1', 'acme.example']]),
    [row(2, { what: 'Check it', state: 'review', agent: 'claude' })],
    new Map([['p1', 30]]),
  );
  assert.deepEqual(out.map((t) => [t.seq, t.why]), [[1, 'late'], [2, 'review'], [3, 'urgent']]);
  assert.deepEqual([out[0]!.version, out[0]!.priority, out[0]!.hue, out[1]!.state], [4, 'high', 30, 'review']);
});

test('THE NEXT TWO WEEKS: after today, inside the window, soonest first, and never a task already in what needs you', () => {
  const out = comingOf(
    [row(1, { what: 'Today', by: TODAY }), row(2, { what: 'Friday', by: '2026-10-02', thing: 'p1' }), row(3, { what: 'Tomorrow', by: '2026-09-30' }), row(4, { what: 'Too far', by: '2026-10-20' }), row(5, { what: 'Shown', by: '2026-10-01' })],
    TODAY,
    '2026-10-13',
    new Map([['p1', 'acme.example']]),
    new Map([['p1', 30]]),
    new Set([5]),
  );
  assert.deepEqual(out.map((d) => [d.seq, d.day, d.project, d.hue]), [[3, '2026-09-30', null, null], [2, '2026-10-02', 'acme.example', 30]]);
});

test('THE RUNS OF THE DAY: a span from when each opened, from midnight at the earliest, to its last word or to now while it works', () => {
  const midnight = Date.parse('2026-09-29T00:00:00');
  const now = Date.parse('2026-09-29T09:40:00');
  const iso = (h: number, m: number, d = 29) => new Date(`2026-09-${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
  const out = sessionsOf(
    [
      row(1, { agent: 'claude', state: 'done', last_seen: iso(1, 40), host: 'OMEN' }, { created_at: iso(0, 20) }),
      row(2, { agent: 'codex', state: 'active', last_seen: iso(9, 39), host: 'OMEN' }, { created_at: iso(8, 32) }),
      row(3, { agent: 'cursor', state: 'active', last_seen: iso(8, 0) }, { created_at: iso(7, 0) }),
      row(4, { agent: 'claude', state: 'done', last_seen: iso(22, 0, 28) }, { created_at: iso(21, 0, 28) }),
      row(5, { agent: 'claude', state: 'active', last_seen: iso(9, 30) }, { created_at: iso(20, 0, 28) }),
    ],
    midnight,
    now,
  );
  assert.deepEqual(
    out.map((s) => [s.seq, s.working, s.from === midnight, s.to === now]),
    [
      [5, true, true, true],
      [1, false, false, false],
      [3, false, false, false],
      [2, true, false, true],
    ],
  );
  assert.equal(hostOf(['OMEN', 'OMEN']), 'OMEN');
  assert.equal(hostOf(['OMEN', 'MINI']), null);
  assert.equal(hostOf(['OMEN', null]), null);
  assert.equal(hostOf([]), null);
});

test('WHO MADE THE CHANGES: a run, an agent token or an agent`s name is an agent, the reader is you, and a heartbeat is neither', () => {
  assert.ok(byAgent('S42') && byAgent('agent:claude') && byAgent('codex'));
  assert.ok(!byAgent('p_1') && !byAgent('rule:late'));
  const who = sinceWho(
    [
      { kind: 'edit', register: 'tasks', actor: 'S4', ts: '2026-09-29T08:00:00.000Z' },
      { kind: 'edit', register: 'tasks', actor: 'p_me', ts: '2026-09-28T19:40:00.000Z' },
      { kind: 'edit', register: 'session', actor: 'S4', ts: '2026-09-27T08:00:00.000Z' },
      { kind: 'decide', register: null, actor: 'rule:x', ts: '2026-09-29T01:00:00.000Z' },
    ],
    'p_me',
  );
  assert.deepEqual(who, { byAgents: 1, byYou: 1, from: '2026-09-28T19:40:00.000Z' });
});

test('CASH AHEAD: the lowest balance each week reaches, from the walk`s own steps, its low and the day, the day it goes under, in the currency asked for', () => {
  const walk = {
    from: 1000,
    currency: 'EGP',
    horizon: 365,
    steps: [
      { day: '2026-10-02', balance: 800 },
      { day: '2026-10-20', balance: -50 },
      { day: '2026-10-25', balance: 400 },
      { day: '2027-03-01', balance: -900 },
    ],
  };
  const short = { ...walk, horizon: 30, steps: [] };
  const f = forecastOf([{ source: 'forecast.runway', walk: short }, { source: 'forecast.runway', walk }, { source: 'register.accounts' }], TODAY, 4);
  assert.ok(f);
  assert.deepEqual(f.values, [1000, 800, 800, -50, -50]);
  assert.deepEqual([f.low, f.crossed], [{ value: -50, day: '2026-10-20' }, '2026-10-20']);
  assert.equal(forecastOf([{ source: 'forecast.runway', walks: [walk] }], TODAY, 4, 'USD'), null);
  assert.equal(forecastOf([], TODAY), null);
});
