/**
 * A screen's figures and declarations go to the record as one read each, as a first open turns them on (`firstOpen` in
 * `boot-live.ts`: `batchSchemas`, `batchMetrics`).
 *
 * MEASURED ON 23 OCT: the owner's Today asked `metric` once a project in play (13 at once), a project page four more,
 * and a failed `schemas` was asked again once a list (28); with an agent's 1 s call beside it the record's queue filled
 * and every one was a crash. Here the sidebar's reads and a project page's are asked as they are asked on screen, a
 * moment apart, and each kind is one request.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { batchMetrics, batchSchemas, createClient, forgetSchemas, keepReads, METRIC_WAVE_MS } from '@braindog/client';

import { figureReader, type Fetch } from './figures.ts';

/* THIRTEEN PROJECTS IN PLAY, as on the record it was measured on: `fixtures/names.ts`'s invented ones, written here,
   since a file under `src/` may not reach out of `apps/web`. */
const NAMED = ['Lanternfish', 'Copperleaf', 'Brightwell site', 'Quietcart', 'Oxbow'] as const;
const PROJECTS = [...NAMED, ...Array.from({ length: 8 }, (_, i) => `${NAMED[i % NAMED.length]} ${i + 2}`)];
const LISTS = ['things', 'tasks', 'people', 'organisations', 'session', 'learnings', 'accounts', 'balances', 'services', 'transactions'];
const MONTHS = { unit: 'GBP', groups: [{ key: '2026-10', value: 100 }], current: '2026-10' };

function record() {
  const asked: string[] = [];
  const fetch: Fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const name = url.pathname.replace(/^\/api\//u, '');
    asked.push(name);
    if (name === 'metrics') {
      const ids = JSON.parse(url.searchParams.get('metrics') ?? '[]') as string[];
      return Response.json({ ok: true, value: { readings: Object.fromEntries(ids.map((id) => [id, MONTHS])), refused: {} } });
    }
    if (name === 'schemas') {
      const ids = JSON.parse(url.searchParams.get('registers') ?? '[]') as string[];
      return Response.json({ ok: true, value: { lists: Object.fromEntries(ids.map((id) => [id, { id, name: id, title: 'name', fields: [] }])), refused: {}, blocks: {} } });
    }
    return Response.json({ ok: true, value: MONTHS });
  }) as Fetch;
  return { fetch, asked };
}

const firstOpen = async (fn: () => Promise<void>) => {
  forgetSchemas();
  batchSchemas(true);
  batchMetrics(true);
  try {
    await fn();
  } finally {
    batchSchemas(false);
    batchMetrics(false);
    forgetSchemas();
  }
};

const later = (ms: number) => new Promise((done) => setTimeout(done, ms));

test('TODAY: every list learnt is one schemas, and the sidebar\'s money a project is one metrics', () =>
  firstOpen(async () => {
    const r = record();
    const client = createClient({ base: 'https://brain.example', fetch: r.fetch });
    const side = figureReader('https://brain.example', r.fetch);
    const [schemas, ins] = await Promise.all([Promise.all(LISTS.map((id) => client.schema(id))), Promise.all(PROJECTS.map((p) => side.moneyIn(p)))]);
    assert.ok(schemas.every((s) => s.ok));
    assert.ok(ins.every((m) => m !== null && m.total === 100), 'every project still hears its own money');
    assert.deepEqual(r.asked.sort(), ['metrics', 'schemas']);
  }));

test('A PROJECT PAGE: the sidebar\'s figures and the page\'s own, asked a moment apart, are one metrics', () =>
  firstOpen(async () => {
    const r = record();
    const side = figureReader('https://brain.example', r.fetch);
    const shape = figureReader('https://brain.example', r.fetch);
    const sidebar = Promise.all(PROJECTS.map((p) => side.moneyIn(p)));
    await later(10);
    const page = Promise.all([...['project-in-month', 'project-out-month', 'project-owed'].map((m) => shape.scalar(m, NAMED[0])), shape.moneyIn(NAMED[0]), shape.moneyOut(NAMED[0])]);
    await Promise.all([sidebar, page]);
    assert.deepEqual(r.asked, ['metrics']);
  }));

test('A REVISIT: figures kept at this version are answered from the kept copy, never waiting for a wave', () =>
  firstOpen(async () => {
    keepReads(true);
    try {
      const r = record();
      const page = figureReader('https://brain.example', r.fetch);
      const ask = () => Promise.all([...['project-in-month', 'project-owed'].map((m) => page.scalar(m, NAMED[0])), page.moneyIn(NAMED[0])]);
      const first = await ask();
      assert.deepEqual(r.asked, ['metrics']);
      const t0 = performance.now();
      const again = await ask();
      assert.ok(performance.now() - t0 < METRIC_WAVE_MS, 'the kept figures do not wait out a wave');
      assert.deepEqual(again, first);
      assert.deepEqual(r.asked, ['metrics'], 'and nothing is asked again');
    } finally {
      keepReads(false);
    }
  }));

test('A HOST WITHOUT metrics IS ASKED ONCE A FIGURE, and from then on without trying it again', () =>
  firstOpen(async () => {
    const asked: string[] = [];
    const fetch: Fetch = (async (input: string | URL | Request) => {
      const name = new URL(String(input)).pathname.replace(/^\/api\//u, '');
      asked.push(name);
      if (name === 'metrics') return Response.json({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called metrics.' } }, { status: 404 });
      return Response.json({ ok: true, value: MONTHS });
    }) as Fetch;
    const f = figureReader('https://old.example', fetch);
    const first = await Promise.all([NAMED[0], NAMED[1]].map((p) => f.moneyIn(p)));
    assert.ok(first.every((m) => m !== null));
    await Promise.all([NAMED[0], NAMED[1]].map((p) => f.moneyOut(p)));
    assert.deepEqual(asked, ['metrics', 'metric', 'metric', 'metric', 'metric']);
  }));

test('OFF, as for a command or an agent, each figure is asked by itself', async () => {
  forgetSchemas();
  const r = record();
  const side = figureReader('https://brain.example', r.fetch);
  await Promise.all(PROJECTS.slice(0, 3).map((p) => side.moneyIn(p)));
  assert.deepEqual(r.asked, ['metric', 'metric', 'metric']);
});
