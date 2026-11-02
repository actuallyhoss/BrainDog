/**
 * `kpis`: the plan (figures, change, target, stale, the chart each shape picks, the three-point rule) and the Svelte
 * drawer rendered on the server with the same data.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { KPI_FIX, KPIS_MORE, kpiFigure, kpiKindOf, kpiView, kpisPlan, type KpiInput } from './kpis.ts';

const NOW = '2026-10-21T12:00:00Z';
const monthly = (vals: number[], from: [number, number]) => vals.map((value, i) => ({ at: new Date(Date.UTC(from[0], from[1] + i, 20)).toISOString(), value }));
const days = (vals: number[], last: string, step: number) =>
  vals.map((value, i) => ({ at: new Date(Date.parse(`${last}T09:00:00Z`) - (vals.length - 1 - i) * step * 86_400_000).toISOString(), value }));

/* ── figures ──────────────────────────────────────────────────────────────── */

test('money is written by money.ts: the home currency by its sign, another by its own sign, a signless one code first', () => {
  assert.deepEqual(kpiFigure(461000, 'GBP', 'GBP'), { text: '£4,610', before: '', main: '£4,610', after: '' });
  assert.deepEqual(kpiFigure(370000, 'USD', 'GBP'), { text: '$3,700', before: '', main: '$3,700', after: '' });
  assert.equal(kpiFigure(4875000, 'EGP', 'GBP').before, 'EGP');
  /* A display figure is whole: £4,610.49 reads £4,610. */
  assert.equal(kpiFigure(461049, 'GBP', 'GBP').text, '£4,610');
  assert.equal(kpiFigure(461000, 'GBP', 'GBP', true).text, '£4.6k');
});

test('a count carries its unit after it, a share its sign, and one of a thing is not plural', () => {
  assert.deepEqual(kpiFigure(1602, 'players', null), { text: '1,602 players', before: '', main: '1,602', after: 'players' });
  assert.equal(kpiFigure(4.1, '%', null).text, '4.1%');
  assert.equal(kpiFigure(1, 'days', null).text, '1 day');
  assert.equal(kpiFigure(-3, '', null).text, '−3');
});

test('the shape defaults from the unit: a share in %, money a flow, the rest a level', () => {
  assert.equal(kpiKindOf({ name: 'a', unit: '%', points: [] }), 'share');
  assert.equal(kpiKindOf({ name: 'a', unit: 'GBP', points: [] }), 'flow');
  assert.equal(kpiKindOf({ name: 'a', unit: 'players', points: [] }), 'level');
  assert.equal(kpiKindOf({ name: 'a', unit: 'GBP', kind: 'level', points: [] }), 'level');
});

/* ── flow ─────────────────────────────────────────────────────────────────── */

const revenue: KpiInput = {
  name: 'Revenue a month',
  unit: 'GBP',
  kind: 'flow',
  target: 6000,
  target_by: '2026-12-31',
  points: monthly([2050, 2680, 2990, 3240, 3110, 3720, 4180, 4610, 1350], [2026, 1]),
};

test('a flow says its last whole period, the one still running as so far, and its change on the period before', () => {
  const v = kpiView(revenue, { home: 'GBP', now: NOW });
  assert.equal(v.figure?.text, '£4,610');
  assert.equal(v.when, 'in Sep');
  assert.equal(v.sofar, '£1,350 so far in Oct');
  assert.deepEqual(v.change, { dir: 'up', tone: 'good', said: 'Up 10%', against: 'on Aug' });
  assert.deepEqual(v.target, { value: '£6,000', by: 'by 31 Dec', state: 'open', said: 'Target £6,000 by 31 Dec' });
  assert.equal(v.stale, null);
  assert.equal(v.sentence, 'Revenue a month: £4,610 in Sep, Up 10% on Aug, Target £6,000 by 31 Dec');
});

test('a flow is an area from the floor, the running month a lone faint dot and never a fall drawn to it', () => {
  const c = kpiView(revenue, { home: 'GBP', now: NOW }).chart!;
  assert.equal(c.form, 'area');
  assert.match(c.area, /^M0 100L0 /u, 'the area is closed to the floor');
  assert.match(c.partial, /^M1000 [\d.]+l0 0$/u);
  assert.doesNotMatch(c.line, /L1000 /u, 'the line stops at the last whole month');
  assert.ok(c.target && Number(c.target.y) < 10, 'the target is the top of the scale');
  assert.equal(c.target?.label, 'Target £6,000');
  assert.equal(c.ticks.at(-1)?.label, 'Oct');
  assert.equal(c.ticks.at(-1)?.align, 'end');
  assert.ok(c.ticks.length <= 5);
});

test('a Today row draws whole periods only: no running dot past its line, which runs to the end', () => {
  const plan = kpisPlan([revenue], { home: 'GBP', now: NOW });
  const row = plan.rows[0]!.chart!;
  assert.equal(row.partial, '', 'a row says no "so far", so it draws no dot for it');
  assert.match(row.line, /L1000 [\d.]+$/u, 'the last whole month is the end of the row');
  assert.match(row.end, /^M1000 [\d.]+l0 0$/u);
  assert.equal(plan.rows[0]!.figure?.text, '£4,610');
  /* A tile still shows where the month stands so far, beside its words. */
  assert.match(plan.lead!.chart!.partial, /^M1000 [\d.]+l0 0$/u);
  assert.equal(plan.lead!.sofar, '£1,350 so far in Oct');
});

test('MONEY IS NEVER ADDED ACROSS CURRENCIES: a reading in another currency is left out and said', () => {
  const v = kpiView(
    {
      name: 'Billed',
      unit: 'GBP',
      kind: 'flow',
      points: [
        { at: '2026-08-10', amount: 'GBP 1,000.00' },
        { at: '2026-09-10', amount: 'GBP 1,200.00' },
        { at: '2026-09-12', amount: 'EUR 900.00' },
        { at: '2026-09-14', amount: 'GBP 300.50' },
      ],
    },
    { home: 'GBP', now: NOW },
  );
  assert.equal(v.figure?.text, '£1,501', 'September is £1,500.50, shown whole, with the euros left out');
  assert.equal(v.left, '1 reading in EUR left out');
});

/* ── level, change direction, target ──────────────────────────────────────── */

test('UP IS NOT ALWAYS GOOD: a cost going up is a warning, with the word', () => {
  const v = kpiView({ name: 'Costs a year', unit: 'GBP', kind: 'level', good: 'down', points: days([10000, 10400, 11000], '2026-10-18', 20) }, { home: 'GBP', now: NOW });
  assert.equal(v.change?.dir, 'up');
  assert.equal(v.change?.tone, 'warn');
  assert.equal(v.change?.said, 'Up 10%');
  assert.equal(v.change?.against, 'since 8 Sep');
  const players = kpiView({ name: 'Players', unit: 'players', points: days([100, 90, 80], '2026-10-18', 20) }, { now: NOW });
  assert.deepEqual([players.change?.dir, players.change?.tone, players.change?.said], ['down', 'warn', 'Down 20%']);
});

test('a share moves in points, never in a share of itself', () => {
  const v = kpiView({ name: 'Conversion', unit: '%', every: '1w', points: days([3, 3.2, 4], '2026-10-19', 7) }, { now: NOW });
  assert.equal(v.change?.said, 'Up 0.8 pts');
  assert.equal(v.chart?.form, 'ring');
  assert.equal(v.chart?.ring?.dash, '4 100');
});

test('RED ONLY FOR OFF TARGET: met is good, a passed day without it is off, said in words', () => {
  const base = { name: 'Beta testers', unit: 'people', points: days([18, 24, 33], '2026-10-14', 7) };
  const off = kpiView({ ...base, target: 50, target_by: '2026-10-01' }, { now: NOW });
  assert.equal(off.target?.state, 'off');
  assert.equal(off.target?.said, 'Off target: 33 of 50 people by 1 Oct');
  assert.equal(kpiView({ ...base, target: 50, target_by: '2026-12-01' }, { now: NOW }).target?.state, 'open');
  assert.equal(kpiView({ ...base, target: 30 }, { now: NOW }).target?.said, 'Target 30 people met');
  assert.equal(kpiView({ ...base, target: 50, verdict: 'off' }, { now: NOW }).target?.state, 'off', "the source's verdict wins");
  /* Good is down: at or under the target is met. */
  assert.equal(kpiView({ ...base, good: 'down', target: 40 }, { now: NOW }).target?.state, 'met');
});

/* ── the three-point rule ─────────────────────────────────────────────────── */

test('UNDER THREE POINTS THE KPI IS ITS NUMBER: no chart, its date and its target still said', () => {
  const two = kpiView({ name: 'Days quiet', unit: 'days', kind: 'count', good: 'down', target: 3, points: days([2, 5], '2026-10-20', 3) }, { now: NOW });
  assert.equal(two.chart, null);
  assert.equal(two.figure?.text, '5 days');
  assert.equal(two.when, '20 Oct');
  assert.equal(two.target?.said, 'Target 3 days');
  const progress = kpiView({ name: 'Waitlist', unit: 'sign-ups', kind: 'progress', target: 1000, points: days([300, 612], '2026-10-20', 8) }, { now: NOW });
  assert.equal(progress.chart, null, 'a bar of two points is a chart too');
  const three = kpiView({ name: 'Days quiet', unit: 'days', kind: 'count', points: days([2, 5, 1], '2026-10-20', 3) }, { now: NOW });
  assert.equal(three.chart?.form, 'line');
});

test('a gap breaks the line, and a level is placed by when each reading came', () => {
  const c = kpiView({ name: 'Rev', unit: 'GBP', kind: 'flow', points: monthly([100, 200], [2026, 4]).concat(monthly([300, 400], [2026, 7])) }, { home: 'GBP', now: NOW }).chart!;
  assert.equal((c.line.match(/M/gu) ?? []).length, 2, 'June and July have nothing, so the line is two runs');
  const level = kpiView({ name: 'Servers', unit: 'servers', points: [{ at: '2026-10-01', value: 1 }, { at: '2026-10-02', value: 2 }, { at: '2026-10-11', value: 3 }] }, { now: NOW }).chart!;
  assert.match(level.line, /^M0 [\d.]+L100 [\d.]+L1000 /u);
});

test('progress is a bar toward the target, with a mark where the target fell once it is passed', () => {
  const v = kpiView({ name: 'Waitlist', unit: 'sign-ups', kind: 'progress', target: 1000, target_by: '2026-12-01', points: days([300, 450, 612], '2026-10-20', 8) }, { now: NOW });
  assert.deepEqual(v.chart?.bar, { fill: '0.61', mark: null, share: '61%' });
  const past = kpiView({ name: 'Waitlist', unit: 'sign-ups', kind: 'progress', target: 1000, points: days([300, 900, 1250], '2026-10-20', 8) }, { now: NOW });
  assert.deepEqual(past.chart?.bar, { fill: '1', mark: '0.8', share: '125%' });
});

/* ── stale ────────────────────────────────────────────────────────────────── */

test('STALE after two of its periods, or fourteen days with none, with the fix its source offers', () => {
  const weekly = { name: 'Servers', unit: 'servers', every: '1w' as const, source: 'typed' as const };
  assert.equal(kpiView({ ...weekly, points: days([1, 2, 3], '2026-10-10', 3) }, { now: NOW }).stale, null, '11 days is under two weeks');
  assert.deepEqual(kpiView({ ...weekly, points: days([1, 2, 3], '2026-10-02', 3) }, { now: NOW }).stale, { said: 'Not updated since 2 Oct', fix: "Add today's value" });
  const none = { name: 'Players', source: 'agent' as const };
  assert.equal(kpiView({ ...none, points: days([1], '2026-10-08', 1) }, { now: NOW }).stale, null);
  assert.equal(kpiView({ ...none, points: days([1], '2026-10-06', 1) }, { now: NOW }).stale?.fix, KPI_FIX.agent);
  assert.deepEqual(kpiView({ ...none, points: [] }, { now: NOW }).stale, { said: 'No reading yet', fix: 'Ask Claude to report it' });
  assert.equal(kpiView({ ...none, points: days([1], '2025-10-02', 1) }, { now: NOW }).stale?.said, 'Not updated since 2 Oct 2025', 'another year says its year');
});

/* ── the block ────────────────────────────────────────────────────────────── */

test('the lead is the headline, else the first; at most five more; Today at most four rows', () => {
  const k = (name: string, headline = false): KpiInput => ({ name, headline, points: [] });
  const plan = kpisPlan([k('a'), k('b'), k('c', true), k('d'), k('e'), k('f'), k('g'), k('h')], { now: NOW });
  assert.equal(plan.lead?.name, 'c');
  assert.deepEqual(plan.rest.map((v) => v.name), ['a', 'b', 'd', 'e', 'f']);
  assert.equal(plan.rest.length, KPIS_MORE);
  assert.deepEqual(plan.rows.map((v) => v.name), ['a', 'b', 'c', 'd']);
  assert.equal(kpisPlan([k('x')]).lead?.name, 'x');
  assert.equal(kpisPlan([]).lead, null);
});

/* ── the drawer ───────────────────────────────────────────────────────────── */

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: Kpis } = (await import(new URL('../svelte/Kpis.svelte', import.meta.url).href)) as { default: Component<Record<string, unknown>> };

test('the project form draws the lead with its chart, the grid, the off-target words and the stale fix', () => {
  const body = render(Kpis, {
    props: {
      kpis: [
        { ...revenue, headline: true },
        { name: 'Beta testers', unit: 'people', target: 50, target_by: '2026-10-01', points: days([18, 24, 33], '2026-10-14', 7) },
        { name: 'Open bugs', unit: 'bugs', source: 'agent', points: [] },
      ],
      home: 'GBP',
      now: NOW,
      onfix: () => {},
    },
  }).body;
  assert.match(body, /<div class="kpis" data-form="project">/u);
  assert.match(body, /class="kpi kpi-lead"[^>]*data-chart="area"/u);
  assert.match(body, /<svg class="kpi-chart" viewBox="0 0 1000 100"[^>]*role="img" aria-label="Revenue a month: £4,610 in Sep, Up 10% on Aug, Target £6,000 by 31 Dec"/u);
  assert.match(body, /<span class="kpi-change" data-tone="good" data-dir="up">/u);
  assert.match(body, /<p class="kpi-target" data-state="off">(?:<!--[^>]*-->)*Off target: 33 of 50 people by 1 Oct<\/p>/u);
  assert.match(body, /<button type="button" class="kpi-fix">Ask Claude to report it<\/button>/u);
  assert.match(body, /No reading yet/u);
  assert.doesNotMatch(body, /style="[^"]*--chart-1/u, 'inside a project the page sets the colour');
});

test('with no fix given the stale line is said and nothing is pressed; Today rows wear their own colour', () => {
  const stale = { name: 'Players', project: 'Driftwood.gg', slot: 'pink', why: 'Not updated for 19 days', points: days([1, 2, 3], '2026-10-02', 2) };
  const body = render(Kpis, { props: { kpis: [stale], form: 'today', now: NOW } }).body;
  assert.match(body, /<div class="kpis" data-form="today">/u);
  assert.match(body, /<li class="kpi kpi-row" style="--chart-1:var\(--cat-pink\)" data-state="stale"/u);
  assert.match(body, /<p class="kpi-why" data-state="stale">Not updated for 19 days<\/p>/u);
  assert.doesNotMatch(body, /<button/u);
});

test('AN OLD READING SAYS ITS DAY: past a week and on its rhythm it is not stale, and still says when it was read', () => {
  const old = kpiView({ name: 'Members', unit: 'people', every: '1w', points: days([300, 318], '2026-10-11', 7) }, { now: NOW });
  assert.equal(old.stale, null);
  assert.equal(old.aged, 'Last reading 11 Oct');
  const fresh = kpiView({ name: 'Members', unit: 'people', every: '1w', points: days([300, 318], '2026-10-19', 7) }, { now: NOW });
  assert.equal(fresh.aged, '');
  const quiet = kpiView({ name: 'Members', unit: 'people', points: days([300, 318], '2026-09-20', 7) }, { now: NOW });
  assert.ok(quiet.stale, 'past fourteen days with no rhythm it is stale');
  assert.equal(quiet.aged, '', 'and stale already says since when');
});
