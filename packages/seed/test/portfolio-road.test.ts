/**
 * A project's plan is drawn, not listed (§45 "A roadmap is drawn": its stages, each one's done-when line, and where it
 * stands; portfolio 1.23.0). A project with stages draws them as its road, the done ones marked and the next one said;
 * one with dated work draws its roadmap; one with both draws both until a shape is kept for it, and then only that one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Kernel, type PageResult } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

import { NOW, installSeed } from '../src/index.ts';
import { PORTFOLIO_PAGES } from '../src/modules/portfolio.ts';

const PERSON = { actor: 'p_1' };

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await installSeed(k);
  assert.ok(out.ok, sayOf(out));
  return k;
}

const opened = (k: Kernel, name: string): PageResult => {
  const page = (k.pages() as unknown as { slug: string; title: string }[]).find((p) => p.title === name);
  assert.ok(page, `${name} has no page`);
  const out = k.page(page.slug);
  assert.ok(out.ok, sayOf(out));
  return out.value;
};

type Drawn = PageResult['blocks'][number] & { rows?: { fields: Record<string, unknown> }[]; done_now?: boolean[]; next?: number | null };
const headed = (p: PageResult, heading: string): Drawn[] => p.blocks.filter((b) => b.heading === heading) as Drawn[];
const drawn = (b: Drawn | undefined): boolean => b !== undefined && b.drawn !== false;

test('THE PROJECT PAGE STAYS UNDER THE CEILING A USE CASE ADDS TO: twenty-one blocks, the road among them', () => {
  const blocks = PORTFOLIO_PAGES.project!.blocks as { kind: string; heading?: string }[];
  assert.equal(blocks.length, 21);
  assert.ok(blocks.some((b) => b.kind === 'steps' && b.heading === 'The road'));
});

test('A PROJECT WITH STAGES DRAWS ITS ROAD: each stage with its done-when line, the done ones marked, the next one said', async () => {
  const k = await seeded();
  const made = k.create('things', { name: 'Harbour', lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  for (const [order, name, done_when, done] of [
    [1, 'The art', 'Every island has its tiles', true],
    [2, 'The island', 'A player walks it end to end', false],
    [3, 'The launch', 'It is in the store', false],
  ] as const)
    assert.ok(k.create('stages', { name, thing: spoken, done_when, done, order }, PERSON).ok);

  const road = headed(opened(k, 'Harbour'), 'The road')[0];
  assert.ok(drawn(road), 'the road is not drawn over a project with stages');
  assert.deepEqual(road!.refusals, [], JSON.stringify(road!.refusals));
  assert.deepEqual(
    (road!.rows ?? []).map((r) => [r.fields.name, r.fields.done_when]),
    [
      ['The art', 'Every island has its tiles'],
      ['The island', 'A player walks it end to end'],
      ['The launch', 'It is in the store'],
    ],
  );
  /* WHERE IT STANDS: the first done, the second next. */
  assert.deepEqual(road!.done_now, [true, false, false]);
  assert.equal(road!.next, 1);
  /* AND NO PLAN OF DATED WORK, which it has none of. */
  assert.ok(!drawn(headed(opened(k, 'Harbour'), 'The plan')[0]));
});

test('A PROJECT WITH BOTH DRAWS BOTH, AND A SHAPE KEPT FOR IT DRAWS ONLY THAT ONE', async () => {
  const k = await seeded();
  const made = k.create('things', { name: 'Harbour', lane: 'building' }, PERSON);
  assert.ok(made.ok, sayOf(made));
  const spoken = `things#${made.value.seq}`;
  assert.ok(k.create('stages', { name: 'The art', thing: spoken, order: 1 }, PERSON).ok);
  assert.ok(k.create('tasks', { what: 'Paint the shore', thing: spoken, state: 'open', by: '2026-11-02' }, PERSON).ok);
  const both = opened(k, 'Harbour');
  assert.deepEqual([drawn(headed(both, 'The road')[0]), drawn(headed(both, 'The plan')[0])], [true, true]);

  assert.ok(k.update('things', spoken, { drawn_as: 'path' }, PERSON).ok);
  const road = opened(k, 'Harbour');
  assert.deepEqual([drawn(headed(road, 'The road')[0]), drawn(headed(road, 'The plan')[0])], [true, false]);

  assert.ok(k.update('things', spoken, { drawn_as: 'roadmap' }, PERSON).ok);
  const roadmap = opened(k, 'Harbour');
  assert.deepEqual([drawn(headed(roadmap, 'The road')[0]), drawn(headed(roadmap, 'The plan')[0])], [false, true]);
});

test('TWO PROJECTS KEPT TWO WAYS DRAW TWO PLANS: Marsh its road, Ferris its roadmap', async () => {
  const k = await seeded();
  const project = (name: string, drawn_as: string): string => {
    const made = k.create('things', { name, lane: 'building' }, PERSON);
    assert.ok(made.ok, sayOf(made));
    const spoken = `things#${made.value.seq}`;
    assert.ok(k.create('stages', { name: 'First', thing: spoken, order: 1 }, PERSON).ok);
    assert.ok(k.create('stages', { name: 'Second', thing: spoken, order: 2 }, PERSON).ok);
    assert.ok(k.create('tasks', { what: `Ship ${name}`, thing: spoken, state: 'open', by: '2026-11-02' }, PERSON).ok);
    assert.ok(k.update('things', spoken, { drawn_as }, PERSON).ok);
    return spoken;
  };
  project('Marsh', 'path');
  project('Ferris', 'roadmap');
  const shapes = (name: string): boolean[] => {
    const p = opened(k, name);
    return [drawn(headed(p, 'The road')[0]), drawn(headed(p, 'The plan')[0])];
  };
  assert.deepEqual(shapes('Marsh'), [true, false]);
  assert.deepEqual(shapes('Ferris'), [false, true]);
});
