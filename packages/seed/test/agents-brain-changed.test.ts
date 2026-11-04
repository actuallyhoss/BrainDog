/**
 * HOW THE BRAIN CHANGED (AGT-C17 job b), the Agents add-on's page since 1.13.0: "the brain's growth over time: learnings
 * arriving and skills changing, with before and after", "easily visually displayed on the web ui". Batches 85 to 87
 * made agents capture learnings, confirm them and be told when a skill is behind; this is the page that shows it.
 *
 * WHAT IT HOLDS: one line said from figures, a chart by week of the learnings that arrived, What changed with the
 * failure that taught each, and Faded with its count. Reached from What the brain learned on the Agents page, and with
 * no place of its own in the rail.
 *
 * WHAT IT DOES NOT HOLD YET: a skill's before and after. It reads the record's log.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, type Pack } from '@braindog/declare';
import { openRecord, type Kernel } from '@braindog/kernel';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_PACK, AGENTS_PAGES, NOW, agentsPackDocument, day, declarations, installAgentsPack } from '../src/index.ts';
import { AGENTS_METRICS } from '../src/packs/agents.ts';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record with Things and the add-on and nothing else: what a person who just switched it on holds. */
async function fresh(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install(declarations().filter((d) => d.id === 'register.things')));
  value(await installAgentsPack(k));
  return { k, sql };
}

type When = { metric?: string; gt?: number; is?: number };
type Declared = { kind: string; key?: string; heading?: string; icon?: string; lead?: boolean; fold?: boolean; body?: string; when?: When; source?: string; where?: unknown; order?: unknown; limit?: number; back?: number; series?: { metric: string; label?: string }[]; columns?: { field: string; as?: string; label?: string }[] };
type Drawn = Declared & { drawn?: boolean; rows: { fields: Record<string, unknown> }[]; matched: number; refusals: unknown[]; bars?: { bucket: string; keys: string[]; values: (number | null)[][] } };

const PAGE = AGENTS_PAGES.brain as unknown as { page: string; title: string; nav?: unknown; for?: unknown; icon?: string; requires: string[]; blocks: Declared[] };
const opened = (k: Kernel): Drawn[] => value<{ blocks: Drawn[] }>(k.page('brain')).blocks;
const keyed = (blocks: Drawn[], key: string): Drawn => {
  const found = blocks.find((b) => b.key === key);
  assert.ok(found, `no block keyed ${key}`);
  return found;
};
const reading = (k: Kernel, id: string): number | null => {
  const decl = k.metricDecl(id);
  assert.ok(decl, `${id} is not declared on the record`);
  return value<{ value: number | null }>(k.metric(decl)).value;
};

const DAY_MS = 86_400_000;
const AS = { actor: 'p_seed' };

test('THE PAGE IS DECLARED: How the brain changed, with no place in the rail, and every block has a key', async () => {
  assert.ok(PAGE, 'the add-on holds no page `brain`');
  assert.equal(PAGE.title, 'What changed');
  assert.equal(PAGE.nav, undefined, 'the page takes a place of its own in the rail');
  assert.equal(PAGE.for, undefined, 'it is one page, not one a learning');
  assert.deepEqual(PAGE.requires, ['register.learnings']);
  const keys = PAGE.blocks.map((b) => b.key);
  for (const [i, b] of PAGE.blocks.entries()) assert.match(String(b.key), /^[a-z][a-z0-9-]*$/u, `block ${i}, a ${b.kind}, has no key`);
  assert.equal(new Set(keys).size, keys.length, `a key is used twice: ${keys.join(', ')}`);
  for (const b of PAGE.blocks) assert.doesNotMatch(`${b.heading ?? ''} ${b.body ?? ''}`, /—|\brows?\b|\bentit|list item|\bLN\d|#\d/iu, `${b.key} reads as the machine`);
  /* THE ADD-ON SAYS IT PROVIDES THE PAGE AND ITS TWO FIGURES. */
  const pack = value<Pack>(await normalise(agentsPackDocument()));
  for (const id of ['page.brain', 'metric.learnings-arrived', 'metric.learnings-charted']) assert.ok(pack.manifest.provides.includes(id), `${id} is not provided`);
  /* CAME WITH 1.13.0, so every version since holds it. */
  const [major, minor] = AGENTS_PACK.manifest.version.split('.').map(Number);
  assert.ok(major! > 1 || minor! >= 13, `the page came with 1.13.0 and the add-on is ${AGENTS_PACK.manifest.version}`);
});

/* UNDER What the brain learned FROM 1.13.0 TO 1.16.0; THE FIRST DOOR OF THE PAGE'S FOOT SINCE 1.17.0, which is no fold. */
test('THE AGENTS PAGE LINKS TO IT FROM ITS FOOT, first of the doors and always drawn', () => {
  const blocks = AGENTS_PAGES.agents!.blocks as Declared[];
  const link = blocks.find((b) => b.kind === 'note' && String(b.body).includes('(/p/brain)'));
  assert.ok(link, 'nothing on the Agents page opens the page');
  assert.ok(String(link.body).startsWith('[What changed](/p/brain)'), 'What changed is not the first door');
  assert.equal(link.key, 'brain-link');
  assert.equal(link.when, undefined, 'the link is drawn only some of the time');
  /* NOTHING FOLDS IT AWAY: no section after it, and none of the page's sections is a fold. */
  assert.ok(!blocks.slice(blocks.indexOf(link) + 1).some((b) => b.kind === 'section'), 'a section follows the foot');
  assert.ok(!blocks.some((b) => b.fold === true), 'a part of the Agents page is folded');
});

test('IT OPENS ON NO LINE OF COUNTS SINCE 1.34.0, the chart and the lists under it counting themselves', () => {
  /* "2 learnings arrived this month, 5 in use in all, 1 skill changed" went on 3 Nov ("i dont like those briefs at all,
     remove them"): the chart by week is the first block, and no note leads. */
  assert.deepEqual(PAGE.blocks.filter((b) => b.lead), []);
  assert.equal(PAGE.blocks[0]!.kind, 'series');
  assert.equal(PAGE.blocks.find((b) => b.key === 'line' || b.key === 'line-quiet'), undefined);
  assert.equal(PAGE.blocks.find((b) => String(b.body ?? '').includes('{{learnings-arrived}}')), undefined);
});

test('THE BLOCKS: a chart by week drawn only from three points, each learning once on the timeline, and Faded with its count', () => {
  const by = (key: string): Declared => PAGE.blocks.find((b) => b.key === key)!;
  const chart = by('by-week');
  assert.deepEqual([chart.kind, chart.heading], ['series', 'Learnings that arrived and skills that changed, by week']);
  assert.deepEqual(chart.series, [{ metric: 'learnings-by-week', label: 'Learnings' }, { metric: 'skills-changed-by-week', label: 'Skills changed' }]);
  assert.equal(chart.back, 24, 'the chart reaches back six months');
  /* THREE POINTS: drawn only while a learning arrived two weeks ago or more, so its week, the one after and this one
     are three bars at least. A chart of one bar says nothing a number does not. */
  assert.deepEqual(chart.when, { metric: 'learnings-charted', gt: 0 });
  assert.equal(AGENTS_METRICS['learnings-charted']!.where, 'created_at after -182d, created_at before -14d');

  /* EACH LEARNING ONCE, ON THE TIMELINE, SINCE 1.31.0 (3a04e7020), where a list of cards over the same learnings stood; and
     NO LINE OF COUNTS OVER THE PAGE SINCE 1.34.0 (7438cc7e8). */
  assert.deepEqual(PAGE.blocks.map((b) => b.key), ['by-week', 'timeline', 'faded', 'faded-learnings']);
  const timeline = by('timeline') as Declared & { panel?: string };
  assert.deepEqual([timeline.kind, timeline.heading, timeline.panel], ['section', 'Over time', 'evolution']);

  const faded = by('faded');
  assert.deepEqual([faded.kind, faded.heading, faded.source], ['section', 'Faded', 'register.learnings']);
  assert.deepEqual(faded.where, AGENTS_METRICS['learnings-faded']!.where, 'Faded and its figure count different learnings');
  assert.deepEqual(faded.when, { metric: 'learnings-faded', gt: 0 });
  const cards = by('faded-learnings');
  assert.deepEqual([cards.kind, cards.heading], ['cards', undefined]);
  assert.deepEqual(cards.where, faded.where);
  assert.deepEqual(cards.when, faded.when);
  assert.equal(PAGE.blocks.indexOf(cards), PAGE.blocks.indexOf(faded) + 1);
});

test('ON A FRESH RECORD IT INSTALLS CLEAN, and draws no empty chart or Faded', async () => {
  const { k, sql } = await fresh();
  const page = k.pages().find((p) => p.slug === 'brain');
  assert.ok(page, k.pages().map((p) => p.slug).join(', '));
  assert.equal(page.title, 'What changed');
  const blocks = opened(k);
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${b.key}: ${JSON.stringify(b.refusals)}`);
  assert.deepEqual(blocks.map((b) => b.key), PAGE.blocks.map((b) => b.key), 'a block answers under another key');
  assert.deepEqual([reading(k, 'learnings-arrived'), reading(k, 'learnings-faded'), reading(k, 'learnings-charted')], [0, 0, 0]);
  for (const key of ['by-week', 'faded', 'faded-learnings']) assert.equal(keyed(blocks, key).drawn, false, `${key} is drawn over nothing`);
  /* AND THE AGENTS PAGE STILL READS, its link among its blocks. */
  const agents = value<{ blocks: Drawn[] }>(k.page('agents')).blocks;
  assert.deepEqual(agents.find((b) => b.key === 'brain-link')?.refusals, []);
  sql.close();
});

test('SIX LEARNINGS OVER FOUR WEEKS, ONE NOT CONFIRMED IN A HUNDRED DAYS: the chart answers the weeks, and one has faded', async () => {
  const { k, sql } = await fresh();
  /* Days back from the record's today, a Thursday: two this week, one in each of the two before, two in the fourth. */
  const BACK = [1, 2, 9, 16, 22, 23];
  const made: string[] = [];
  for (const [i, back] of BACK.entries()) {
    const row = value<{ id: string }>(
      k.create(
        'learnings',
        {
          lesson: `Lesson ${i + 1}: check the thing before it ships.`,
          because: `Failure ${i + 1}: it shipped unchecked and a morning went on putting it right.`,
          kind: 'method',
          ...(i === 5 ? { confirmed_on: day(-100) } : {}),
        },
        AS,
      ),
    );
    sql.exec('UPDATE entry SET created_at = ? WHERE id = ?', new Date(NOW - back * DAY_MS).toISOString(), row.id);
    made.push(row.id);
  }
  /* FIVE, SINCE 1.21.0: the sixth says it was last confirmed a hundred days ago, so it did not arrive this month. */
  assert.equal(reading(k, 'learnings-arrived'), 5);
  assert.equal(reading(k, 'learnings-faded'), 1);
  assert.ok((reading(k, 'learnings-charted') ?? 0) > 0);

  const blocks = opened(k);
  for (const b of blocks) assert.deepEqual(b.refusals, [], `${b.key}: ${JSON.stringify(b.refusals)}`);

  /* THE CHART'S WEEKS: four of them, the oldest first, since a week before the first learning is trimmed. */
  const chart = keyed(blocks, 'by-week');
  assert.notEqual(chart.drawn, false);
  assert.equal(chart.bars?.bucket, 'week');
  assert.equal(chart.bars?.keys.length, 4, chart.bars?.keys.join(', '));
  assert.deepEqual(chart.bars?.values, [[2, 1, 1, 2], [null, null, null, null]]);

  /* FADED: the one, counted on the heading and drawn under it. */
  assert.equal(keyed(blocks, 'faded').matched, 1);
  const faded = keyed(blocks, 'faded-learnings');
  assert.deepEqual(faded.rows.map((r) => r.fields.lesson), ['Lesson 6: check the thing before it ships.']);
  sql.close();
});

test('A CHART OF FEWER THAN THREE WEEKS IS NOT DRAWN: learnings of this week and last are counted and draw no chart', async () => {
  const { k, sql } = await fresh();
  for (const back of [1, 8]) {
    const row = value<{ id: string }>(k.create('learnings', { lesson: `Lesson from ${back} days back, kept.`, because: 'It went wrong once and took a morning to put right.', kind: 'fact' }, AS));
    sql.exec('UPDATE entry SET created_at = ? WHERE id = ?', new Date(NOW - back * DAY_MS).toISOString(), row.id);
  }
  const blocks = opened(k);
  assert.equal(reading(k, 'learnings-arrived'), 2);
  assert.equal(keyed(blocks, 'by-week').drawn, false, 'two points were drawn as a chart');
  sql.close();
});
