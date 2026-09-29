/**
 * `/usage`'s sentence and chart readings, and the per-day array `actions.ts` keeps for them: every figure is one the
 * ledger or the record sent, a chart with no data is none, and red is said only when actions wait.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { daysOf, usageFromLedger, words, type AccountUsage, type Allowed, type Group, type UsageView } from '../../lib/record/actions.ts';
import { creditsOf, daysSaid, heatOf, projectParts, projectsSaid, ringsOf, sentenceOf, weekBars, weeksSaid } from './reading.ts';

const t = (runs: number, held = 0) => ({ runs, requests: runs * 2, bytes: runs * 1_000, ms: runs * 10, failures: 0, held });

const ledger = (used: number, held = 0, slash?: AccountUsage['records'][number]['slash']): AccountUsage => ({
  from: '2026-09-01',
  to: '2026-09-15',
  totals: t(used, held),
  records: [
    {
      record: 'rec_1',
      slug: 'studio',
      plan: 'hosted',
      closed: false,
      month: { month: '2026-09', used: t(used, held), allowance: { runs: 1_000, requests: 1_000_000, bytes: 1_000_000_000, ms: 1_000_000_000 }, resets: '2026-10-01' },
      totals: t(used, held),
      projects: [],
      actions: [],
      days: [
        { day: '2026-08-31', ...t(99) },
        { day: '2026-09-01', ...t(40) },
        { day: '2026-09-08', ...t(used - 40) },
        { day: '2026-09-20', ...t(5) },
      ],
      ...(slash ? { slash } : {}),
    },
  ],
});

test('the per-day array keeps the month up to today, drops days with nothing, and sums a day twice named', () => {
  const days = daysOf([{ day: '2026-09-02', runs: 3 }, { day: '2026-09-02', runs: 1 }, { day: '2026-08-30', runs: 9 }, { day: '2026-09-01', runs: 0 }, { day: '2026-09-20', runs: 4 }], '2026-09', '2026-09-15');
  assert.deepEqual(days, [{ day: '2026-09-02', runs: 4 }]);
  const view = usageFromLedger(ledger(100), '2026-09', '2026-09-15');
  assert.deepEqual(view.days, [{ day: '2026-09-01', runs: 40 }, { day: '2026-09-08', runs: 60 }]);
  assert.equal(view.records[0]?.credits, null, 'a host that does not count credits says no credits');
  const counted = usageFromLedger(ledger(100, 0, { included: 200, used: 150, packs: 50 }), '2026-09', '2026-09-15');
  assert.deepEqual(counted.records[0]?.credits, { included: 200, used: 150, packs: 50 });
});

test('the sentence names the busiest meter, and only waiting actions are the red phrase', () => {
  const calm = sentenceOf(usageFromLedger(ledger(100), '2026-09', '2026-09-15'));
  assert.deepEqual(calm, { text: 'Everything ran, and the busiest meter is at 10%.' });

  const near = sentenceOf(usageFromLedger(ledger(850), '2026-09', '2026-09-15'));
  assert.equal(near?.text, "Runs is at 85% of the month's allowance; at the limit, actions wait until 1 October.");
  assert.equal(near?.needs, undefined, 'near is not yet something that needs him');

  const held = sentenceOf(usageFromLedger(ledger(1_000, 3), '2026-09', '2026-09-15'));
  assert.equal(held?.text, "Runs is at 100% of the month's allowance; actions wait until 1 October.");
  assert.equal(held?.needs, 'actions wait until 1 October');
  assert.ok(held && held.needs && held.text.includes(held.needs), 'the red phrase is inside the sentence');

  const past = sentenceOf(usageFromLedger(ledger(500), '2026-08', undefined, undefined, false));
  assert.match(past?.text ?? '', /^In August the busiest meter was runs, at 50% of the allowance\.$/u);
});

test('a member is told whose the plan is, and a month with no limit or no ledger says only its runs', () => {
  const member = { ...usageFromLedger(ledger(0), '2026-09'), owner: false, from: 'events' as const };
  assert.deepEqual(sentenceOf(member), { text: words.notOwner });
  const events: UsageView = { ...usageFromLedger(ledger(0), '2026-09'), records: [], totals: { runs: 12, requests: 0, bytes: 0, failures: 0 } };
  assert.deepEqual(sentenceOf(events), { text: '12 runs this month.' });
  assert.equal(sentenceOf({ ...events, totals: { ...events.totals, runs: 0 } }), null, 'nothing ran is the empty state, not a sentence');
});

test('the rings: amber from 80%, red only when used up, and the figure never says 0% of something', () => {
  const r = usageFromLedger(ledger(850), '2026-09', '2026-09-15').records[0] as Allowed;
  const rings = ringsOf(r);
  assert.deepEqual(rings.map((x) => [x.key, x.tone, x.figure]), [['runs', 'warn', '85%'], ['requests', 'ink', '<1%'], ['bytes', 'ink', '<1%'], ['ms', 'ink', '<1%']]);
  assert.equal(ringsOf(usageFromLedger(ledger(1_000, 1), '2026-09').records[0] as Allowed)[0]?.tone, 'danger');
  assert.equal(rings[0]?.amount, '850 of 1,000');
});

test('the weeks: the latest bar in ink and a line naming the busiest week', () => {
  const view = usageFromLedger(ledger(100), '2026-09', '2026-09-15');
  assert.deepEqual(weekBars(view).map((b) => b.tone ?? 'grey'), ['grey', 'grey', 'ink']);
  assert.equal(weeksSaid(view), '100 runs; the busiest week was 8 Sep to 14 Sep.');
  assert.equal(weeksSaid({ ...view, totals: { ...view.totals, runs: 0 } }), null);
});

const group = (name: string, runs: number): Group => ({ key: name, scope: name, name, faint: false, totals: { runs, requests: 0, bytes: 0, failures: 0 }, actions: [] });

test('by project: the top project in ink, the rest greys, and no bar under two projects that ran', () => {
  const parts = projectParts([group('Kiln', 20), group('Everywhere', 60), group('Idle', 0)]);
  assert.deepEqual(parts?.map((p) => [p.label, p.tone]), [['Everywhere', 'ink'], ['Kiln', 'g2']]);
  assert.equal(projectsSaid([group('Kiln', 20), group('Everywhere', 60)]), 'Everywhere ran 75% of them.');
  assert.equal(projectsSaid([group('Kiln', 30), group('Loom', 30)]), 'Kiln and Loom ran 50% each.');
  assert.equal(projectParts([group('Kiln', 30), group('Loom', 30)])?.some((p) => p.tone === 'ink'), false, 'a tie highlights nobody');
  assert.equal(projectParts([group('Kiln', 20), group('Idle', 0)]), null);
});

test('the heat grid: weeks from Monday, nothing drawn for days outside the month or not yet come', () => {
  const view = usageFromLedger(ledger(100), '2026-09', '2026-09-15');
  const heat = heatOf(view, '2026-09-15');
  assert.ok(heat);
  /* 1 September 2026 is a Tuesday, so the first row starts on Monday 31 August, which is not this month's. */
  assert.deepEqual(heat.rows, ['1 Sep', '7 Sep', '14 Sep']);
  assert.ok(Number.isNaN(heat.values[0]?.[0]), '31 August is not drawn as a zero');
  assert.equal(heat.values[0]?.[1], 40);
  assert.equal(heat.values[1]?.[1], 60);
  assert.equal(heat.values[1]?.[0], 0, 'a day in range with nothing counted is zero');
  assert.ok(Number.isNaN(heat.values[2]?.[2]), 'the 16th has not happened yet');
  assert.equal(heatOf({ ...view, days: [] }, '2026-09-15'), null);
  assert.equal(daysSaid(view), 'Busiest on Tue 8 Sep, with 60 runs.');
});

test('credits as a ring only where the host counts them', () => {
  const r = usageFromLedger(ledger(100, 0, { included: 200, used: 190, packs: 0 }), '2026-09').records[0] as Allowed;
  assert.deepEqual(creditsOf(r), { used: 190, max: 200, tone: 'warn' });
  assert.equal(creditsOf({ ...r, credits: null }), null);
});

test('the page keeps the sample and the clock out of its words', () => {
  const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
  assert.doesNotMatch(page, /\bNOW\b|'sample'/u);
});
