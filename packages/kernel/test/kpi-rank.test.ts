/**
 * The KPI rules held still (`src/kpi-rank.ts`): the kind from source
 * and unit, the chart per kind and the three-point rule, stale from cadence, the Today score and its four places, and
 * the card's headline. Every constant is pinned to the one it mirrors, so a rule moved in one place goes red here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KPI_BIG_CHANGE,
  KPI_CHART_POINTS,
  KPI_LATE_PERIODS,
  KPI_STALE_DAYS,
  KPI_TODAY_MOST,
  KPI_TODAY_PHONE,
  KPI_TREND_POINTS,
  everyMs,
  isMoneyUnit,
  kpiChart,
  kpiFix,
  kpiHeadline,
  kpiIsMoney,
  kpiKind,
  kpiRanked,
  kpiScore,
  kpiStale,
  kpiVerdict,
  kpisForToday,
  type KpiCandidate,
} from '../src/kpi-rank.ts';
import { FEED_LATE_PERIODS } from '../src/signs.ts';
import { TREND_POINTS } from '../src/trend.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 9, 21, 12);
const AT = { now: NOW, today: '2026-10-21' };

/** A calm KPI: live, auto, in play, fresh, no target, no change, not money. */
const kpi = (id: string, over: Partial<KpiCandidate> = {}): KpiCandidate => ({
  id,
  name: id,
  thing: `p-${id}`,
  source: 'typed',
  unit: 'players',
  today: 'auto',
  state: 'live',
  newest: NOW - HOUR,
  inPlay: true,
  ...over,
});
const ids = (picks: readonly { kpi: { id: string } }[]): string[] => picks.map((p) => p.kpi.id);

/* ── constants ── */

test('the constants are the ones the record already uses', () => {
  assert.equal(KPI_LATE_PERIODS, FEED_LATE_PERIODS);
  assert.equal(KPI_TREND_POINTS, TREND_POINTS);
  assert.equal(KPI_CHART_POINTS, 3);
  assert.equal(KPI_STALE_DAYS, 14);
  assert.equal(KPI_BIG_CHANGE, 0.2);
  assert.equal(KPI_TODAY_MOST, 4);
  assert.equal(KPI_TODAY_PHONE, 2);
});

/* ── kind ── */

test('kind: his own kind wins over every default', () => {
  assert.equal(kpiKind({ kind: 'level', unit: 'USD' }), 'level');
  assert.equal(kpiKind({ kind: 'progress', unit: '%' }), 'progress');
  assert.equal(kpiKind({ kind: 'share', source: 'figure' }), 'share');
});

test('kind: a kind that is not one of the five reads as absent', () => {
  assert.equal(kpiKind({ kind: 'gauge' as never, unit: 'USD' }), 'flow');
});

test('kind: money is a flow, in either case, by unit or by a money target', () => {
  assert.equal(kpiKind({ unit: 'USD' }), 'flow');
  assert.equal(kpiKind({ unit: 'gbp' }), 'flow');
  assert.equal(kpiKind({ unit: ' EUR ' }), 'flow');
  assert.equal(kpiKind({ source: 'figure', unit: 'GBP' }), 'flow');
  assert.equal(kpiKind({ target: { amount: 1_000_000, currency: 'USD' } }), 'flow');
});

test('kind: three letters that are no currency are not money', () => {
  assert.equal(isMoneyUnit('XYZ'), false);
  assert.equal(isMoneyUnit('GPB'), false);
  assert.equal(isMoneyUnit('USDT'), false);
  assert.equal(isMoneyUnit(''), false);
  assert.equal(isMoneyUnit(null), false);
  assert.equal(kpiKind({ unit: 'XYZ' }), 'level');
  assert.equal(kpiIsMoney({ unit: 'players', target: 500 }), false);
});

test('kind: a percent is a share, a figure or days a count, the rest a level', () => {
  assert.equal(kpiKind({ unit: '%' }), 'share');
  assert.equal(kpiKind({ source: 'figure' }), 'count');
  assert.equal(kpiKind({ source: 'figure', unit: 'tasks' }), 'count');
  assert.equal(kpiKind({ unit: 'days' }), 'count');
  assert.equal(kpiKind({ unit: 'Days' }), 'count');
  assert.equal(kpiKind({ source: 'numbers', unit: 'players' }), 'level');
  assert.equal(kpiKind({ source: 'feed' }), 'level');
  assert.equal(kpiKind({}), 'level');
});

/* ── chart ── */

test('chart: under three points it is the number alone, whatever the kind', () => {
  for (const kind of ['level', 'flow', 'share', 'progress', 'count'] as const) {
    for (const points of [0, 1, 2]) {
      assert.deepEqual(kpiChart({ kind, points, target: true }), { chart: 'number', target: null, trend: false }, `${kind} at ${points}`);
    }
  }
  assert.equal(kpiChart({ kind: 'flow', points: Number.NaN }).chart, 'number');
});

test('chart: money over time is a line on a tile and bars on its page', () => {
  assert.deepEqual(kpiChart({ kind: 'flow', points: 3 }), { chart: 'line', target: null, trend: false });
  assert.deepEqual(kpiChart({ kind: 'flow', points: 12, target: true, where: 'page' }), { chart: 'bars', target: 'line', trend: true });
});

test('chart: a share is a split, its target a mark, never a trend', () => {
  assert.deepEqual(kpiChart({ kind: 'share', points: 3 }), { chart: 'split', target: null, trend: false });
  assert.deepEqual(kpiChart({ kind: 'share', points: 30, target: true }), { chart: 'split', target: 'mark', trend: false });
});

test('chart: progress to a target is a bar with the target marked; with no target it draws as a level', () => {
  assert.deepEqual(kpiChart({ kind: 'progress', points: 3, target: true }), { chart: 'bar', target: 'mark', trend: false });
  assert.deepEqual(kpiChart({ kind: 'progress', points: 3 }), { chart: 'spark', target: null, trend: false });
  assert.deepEqual(kpiChart({ kind: 'progress', points: 7, where: 'page' }), { chart: 'line', target: null, trend: true });
});

test('chart: a count is the number and a sparkline, on a tile and on its page', () => {
  assert.deepEqual(kpiChart({ kind: 'count', points: 3 }), { chart: 'spark', target: null, trend: false });
  assert.deepEqual(kpiChart({ kind: 'count', points: 3, where: 'page', target: true }), { chart: 'spark', target: 'line', trend: false });
});

test('chart: a level is a sparkline on a tile and a line on its page', () => {
  assert.equal(kpiChart({ kind: 'level', points: 5 }).chart, 'spark');
  assert.equal(kpiChart({ kind: 'level', points: 5, where: 'page' }).chart, 'line');
});

test('chart: a trend from six points, not five', () => {
  assert.equal(kpiChart({ kind: 'level', points: 5 }).trend, false);
  assert.equal(kpiChart({ kind: 'level', points: 6 }).trend, true);
});

/* ── stale ── */

test('cadence: hours, days, weeks and thirty-day months; anything else is none', () => {
  assert.equal(everyMs('1h'), HOUR);
  assert.equal(everyMs('1d'), DAY);
  assert.equal(everyMs('2w'), 14 * DAY);
  assert.equal(everyMs('1m'), 30 * DAY);
  assert.equal(everyMs('1D'), DAY);
  assert.equal(everyMs('0d'), null);
  assert.equal(everyMs('weekly'), null);
  assert.equal(everyMs(''), null);
  assert.equal(everyMs(null), null);
  assert.equal(everyMs(undefined), null);
});

test('stale: after two of its cadence, not at two exactly', () => {
  const daily = { every: '1d', source: 'typed' as const };
  assert.deepEqual(kpiStale(daily, NOW - 2 * DAY, NOW), { stale: false, days: 2, fix: null });
  assert.deepEqual(kpiStale(daily, NOW - 2 * DAY - 1, NOW), { stale: true, days: 2, fix: 'add-value' });
  assert.equal(kpiStale({ every: '1h' }, NOW - 3 * HOUR, NOW).stale, true);
  assert.equal(kpiStale({ every: '1m' }, NOW - 59 * DAY, NOW).stale, false);
  assert.equal(kpiStale({ every: '1m' }, NOW - 61 * DAY, NOW).stale, true);
});

test('stale: with no cadence, after fourteen days', () => {
  assert.equal(kpiStale({}, NOW - 14 * DAY, NOW).stale, false);
  assert.deepEqual(kpiStale({}, NOW - 23 * DAY, NOW), { stale: true, days: 23, fix: 'set-up' });
  assert.equal(kpiStale({ every: 'often' }, NOW - 15 * DAY, NOW).stale, true);
});

test('stale: no point is not stale, nor a figure, nor a point from the future', () => {
  assert.deepEqual(kpiStale({ every: '1d' }, null, NOW), { stale: false, days: null, fix: null });
  assert.deepEqual(kpiStale({ every: '1d' }, undefined, NOW), { stale: false, days: null, fix: null });
  assert.deepEqual(kpiStale({ every: '1d' }, Number.NaN, NOW), { stale: false, days: null, fix: null });
  assert.deepEqual(kpiStale({ source: 'figure', every: '1d' }, NOW - 90 * DAY, NOW), { stale: false, days: 90, fix: null });
  assert.deepEqual(kpiStale({ every: '1d' }, NOW + DAY, NOW), { stale: false, days: 0, fix: null });
});

test('stale: the fix is chosen by source', () => {
  assert.equal(kpiFix({ source: 'typed' }), 'add-value');
  assert.equal(kpiFix({ source: 'agent' }), 'ask-agent');
  assert.equal(kpiFix({ source: 'feed' }), 'check-feed');
  assert.equal(kpiFix({ source: 'numbers' }), 'set-up');
  assert.equal(kpiFix({ source: 'numbers', owner: '  ' }), 'set-up');
  assert.equal(kpiFix({ source: 'numbers', owner: 'Maya' }), 'add-value');
  assert.equal(kpiFix({}), 'set-up');
  assert.equal(kpiFix({ source: 'figure' }), null);
});

/* ── verdict ── */

test('verdict: by which way is good, money in minor units, null with nothing to judge', () => {
  assert.equal(kpiVerdict(10, 10, 'up'), 'met');
  assert.equal(kpiVerdict(9, 10, 'up'), 'missed');
  assert.equal(kpiVerdict(9, 10, null), 'missed');
  assert.equal(kpiVerdict(10, 10, 'down'), 'met');
  assert.equal(kpiVerdict(11, 10, 'down'), 'missed');
  assert.equal(kpiVerdict(620_000, { amount: 1_000_000, currency: 'USD' }, 'up'), 'missed');
  assert.equal(kpiVerdict(null, 10, 'up'), null);
  assert.equal(kpiVerdict(10, null, 'up'), null);
  assert.equal(kpiVerdict(10, undefined, 'up'), null);
  assert.equal(kpiVerdict(Number.NaN, 10, 'up'), null);
});

/* ── the score ── */

test('score: each reason in its tier, a pin above all, the first reason that holds wins', () => {
  const at = AT;
  assert.deepEqual(kpiScore(kpi('a', { today: 'pinned', verdict: 'missed' }), at), { tier: 0, why: 'pinned' });
  assert.deepEqual(kpiScore(kpi('a', { verdict: 'missed', newest: NOW - 90 * DAY }), at), { tier: 1, why: 'off-target' });
  assert.deepEqual(kpiScore(kpi('a', { newest: NOW - 30 * DAY, change: 0.5 }), at), { tier: 2, why: 'stale' });
  assert.deepEqual(kpiScore(kpi('a', { target: 10, target_by: '2026-10-20', change: 0.5 }), at), { tier: 3, why: 'late' });
  assert.deepEqual(kpiScore(kpi('a', { change: -0.2, unit: 'USD' }), at), { tier: 4, why: 'change' });
  assert.deepEqual(kpiScore(kpi('a', { change: 0.19, unit: 'USD' }), at), { tier: 5, why: 'money' });
  assert.deepEqual(kpiScore(kpi('a'), at), { tier: 6, why: 'rest' });
});

test('score: late is past the day, not on it, and only for a target not met', () => {
  assert.equal(kpiScore(kpi('a', { target: 10, target_by: '2026-10-21' }), AT).why, 'rest');
  assert.equal(kpiScore(kpi('a', { target: 10, target_by: '2026-10-20', verdict: 'met' }), AT).why, 'rest');
  assert.equal(kpiScore(kpi('a', { target_by: '2026-10-20' }), AT).why, 'rest');
  assert.equal(kpiScore(kpi('a', { target: 10, target_by: '2026-10-20' }), AT).why, 'late');
});

test('score: with no day given the day is UTC of the moment', () => {
  assert.equal(kpiScore(kpi('a', { target: 10, target_by: '2026-10-20' }), { now: NOW }).why, 'late');
  assert.equal(kpiScore(kpi('a', { target: 10, target_by: '2026-10-21' }), { now: NOW }).why, 'rest');
});

test('score: a change that is not a number is no change', () => {
  assert.equal(kpiScore(kpi('a', { change: null }), AT).why, 'rest');
  assert.equal(kpiScore(kpi('a', { change: Number.NaN }), AT).why, 'rest');
  assert.equal(kpiScore(kpi('a', { change: Number.POSITIVE_INFINITY }), AT).why, 'rest');
});

/* ── Today ── */

test('today: nothing in, nothing out', () => {
  assert.deepEqual(kpisForToday([], AT), []);
  assert.deepEqual(kpiRanked([], AT), []);
  assert.deepEqual(kpisForToday([kpi('a')], AT, 0), []);
});

test('today: the tiers in order across projects', () => {
  const list = [
    kpi('rest'),
    kpi('money', { unit: 'GBP' }),
    kpi('change', { change: 0.34 }),
    kpi('late', { target: 5, target_by: '2026-09-01' }),
    kpi('stale', { newest: NOW - 23 * DAY }),
    kpi('off', { verdict: 'missed', target: 10_000 }),
    kpi('pin', { today: 'pinned' }),
  ];
  assert.deepEqual(ids(kpiRanked(list, AT)), ['pin', 'off', 'stale', 'late', 'change', 'money', 'rest']);
  assert.deepEqual(ids(kpisForToday(list, AT)), ['pin', 'off', 'stale', 'late']);
  assert.deepEqual(ids(kpisForToday(list, AT, KPI_TODAY_PHONE)), ['pin', 'off']);
  assert.deepEqual(
    kpisForToday(list, AT).map((p) => p.why),
    ['pinned', 'off-target', 'stale', 'late'],
  );
});

test('today: pins first in his order, absent order last, then by name; pins win over the four', () => {
  const list = [
    kpi('z-auto', { verdict: 'missed' }),
    kpi('b', { today: 'pinned', order: 2 }),
    kpi('a', { today: 'pinned' }),
    kpi('c', { today: 'pinned', order: 1 }),
    kpi('d', { today: 'pinned', order: 2 }),
    kpi('e', { today: 'pinned' }),
  ];
  assert.deepEqual(ids(kpisForToday(list, AT)), ['c', 'b', 'd', 'a']);
});

test('today: one auto KPI per project, the best of them; a pin takes no project place', () => {
  const list = [
    kpi('kiln-rest', { thing: 'kiln' }),
    kpi('kiln-off', { thing: 'kiln', verdict: 'missed' }),
    kpi('kiln-stale', { thing: 'kiln', newest: NOW - 30 * DAY }),
    kpi('kiln-pin', { thing: 'kiln', today: 'pinned' }),
    kpi('portage-rest', { thing: 'portage' }),
  ];
  assert.deepEqual(ids(kpisForToday(list, AT)), ['kiln-pin', 'kiln-off', 'portage-rest']);
});

test('today: hidden, retired and draft never show; a pin shows though its project is out of play', () => {
  const list = [
    kpi('hidden', { today: 'hidden', verdict: 'missed' }),
    kpi('retired', { state: 'retired', today: 'pinned' }),
    kpi('draft', { draft: true, verdict: 'missed' }),
    kpi('parked', { inPlay: false, verdict: 'missed' }),
    kpi('parked-pin', { inPlay: false, today: 'pinned' }),
    kpi('plain'),
  ];
  assert.deepEqual(ids(kpisForToday(list, AT)), ['parked-pin', 'plain']);
});

test('today: an absent today, state and draft read as auto, live and kept', () => {
  const bare: KpiCandidate = { id: 'bare', name: 'Bare', thing: 'p', verdict: 'missed' };
  assert.deepEqual(kpisForToday([bare], AT), [{ kpi: bare, why: 'off-target' }]);
});

test('today: ties go to earning projects, then his order, then the name, then the id', () => {
  const list = [
    kpi('b-build', { verdict: 'missed' }),
    kpi('a-build', { verdict: 'missed' }),
    kpi('earn-late-order', { verdict: 'missed', earning: true, order: 9 }),
    kpi('earn-first', { verdict: 'missed', earning: true, order: 1 }),
    kpi('earn-none', { verdict: 'missed', earning: true }),
    kpi('build-ordered', { verdict: 'missed', order: 0 }),
  ];
  assert.deepEqual(ids(kpiRanked(list, AT)), ['earn-first', 'earn-late-order', 'earn-none', 'build-ordered', 'a-build', 'b-build']);

  const twins = [kpi('y', { name: 'Same' }), kpi('x', { name: 'Same' })];
  assert.deepEqual(ids(kpiRanked(twins, AT)), ['x', 'y']);
});

test('today: the order the list arrives in changes nothing', () => {
  const list = [
    kpi('p', { today: 'pinned', order: 1 }),
    kpi('o', { verdict: 'missed', earning: true }),
    kpi('s', { newest: NOW - 20 * DAY }),
    kpi('m', { unit: 'USD' }),
    kpi('r'),
  ];
  const want = ids(kpisForToday(list, AT));
  assert.deepEqual(ids(kpisForToday([...list].reverse(), AT)), want);
  assert.deepEqual(want, ['p', 'o', 's', 'm']);
});

test('today: the input is not reordered or changed', () => {
  const list = [kpi('r'), kpi('o', { verdict: 'missed' })];
  const before = structuredClone(list);
  kpisForToday(list, AT);
  assert.deepEqual(list, before);
});

/* ── the headline ── */

test('headline: the KPI marked headline leads, by his order when more than one is marked', () => {
  const list = [
    kpi('off', { thing: 'portage', verdict: 'missed' }),
    kpi('mrr', { thing: 'portage', headline: true, order: 2, unit: 'USD' }),
    kpi('dau', { thing: 'portage', headline: true, order: 1 }),
  ];
  assert.deepEqual(kpiHeadline(list, 'portage', AT), { kpi: list[2], why: 'rest' });
});

test('headline: a retired or draft KPI marked headline is passed over', () => {
  const list = [
    kpi('old', { thing: 'portage', headline: true, state: 'retired' }),
    kpi('new', { thing: 'portage', headline: true, draft: true }),
    kpi('dau', { thing: 'portage' }),
  ];
  assert.equal(kpiHeadline(list, 'portage', AT)?.kpi.id, 'dau');
});

test('headline: else the top KPI by the Today score, hidden and out-of-play ones counted', () => {
  const list = [
    kpi('rest', { thing: 'marlow', inPlay: false }),
    kpi('money', { thing: 'marlow', inPlay: false, unit: 'GBP' }),
    kpi('stale', { thing: 'marlow', inPlay: false, today: 'hidden', newest: NOW - 40 * DAY }),
    kpi('elsewhere', { thing: 'portage', verdict: 'missed' }),
  ];
  const pick = kpiHeadline(list, 'marlow', AT);
  assert.equal(pick?.kpi, list[2]);
  assert.equal(pick?.why, 'stale');
});

test('headline: a pin leads the card when nothing is marked', () => {
  const list = [kpi('off', { thing: 'q', verdict: 'missed' }), kpi('pin', { thing: 'q', today: 'pinned' })];
  assert.deepEqual(kpiHeadline(list, 'q', AT), { kpi: list[1], why: 'pinned' });
});

test('headline: none for a project with no live KPI, or no KPI at all', () => {
  assert.equal(kpiHeadline([], 'portage', AT), null);
  assert.equal(kpiHeadline([kpi('x', { thing: 'other' })], 'portage', AT), null);
  assert.equal(kpiHeadline([kpi('x', { thing: 'portage', state: 'retired' }), kpi('y', { thing: 'portage', draft: true })], 'portage', AT), null);
});

test('headline: a tie between calm KPIs goes to his order, then the name', () => {
  const list = [kpi('b', { thing: 'p' }), kpi('a', { thing: 'p' }), kpi('c', { thing: 'p', order: 1 })];
  assert.equal(kpiHeadline(list, 'p', AT)?.kpi.id, 'c');
  assert.equal(kpiHeadline(list.slice(0, 2), 'p', AT)?.kpi.id, 'a');
});
