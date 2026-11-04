/**
 * The palette on a live record: the lists and their counts from `boot`, the record's search capped fairly, the rows
 * changed last from the log, the figures the record works out, and only the newest query answered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { latest } from '../palette/latest.ts';
import { REGISTERS } from './api.ts';
import { METRICS } from './declared.ts';
import { isTemplate } from './metrics.ts';
import { FIGURE_IDS, recentOf, roundRobin, type List } from './palette.ts';
import { FIGURES_ASKED, paletteReader } from './palette-live.ts';
import type { Fetch } from './search-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (url: URL) => Response): { io: Fetch; sent: URL[] } {
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    sent.push(at);
    return answer(at);
  }) as Fetch;
  return { io, sent };
}

const LISTS: List[] = [
  { id: 'obligations', name: 'Obligations', count: 3, icon: 'rows' },
  { id: 'people', name: 'People', count: 2, icon: 'rows' },
];

test('the record\'s hits are capped one list per round, and every total is kept', () => {
  const hit = (register: string, seq: number) => ({ title: `${register} ${seq}`, detail: '', href: `/r/${register}/${seq}`, kind: register, icon: 'rows' as const });
  const result = {
    hits: [],
    total: 5,
    groups: [
      { kind: 'a', total: 4, hits: [hit('a', 1), hit('a', 2), hit('a', 3), hit('a', 4)], href: null },
      { kind: 'b', total: 1, hits: [hit('b', 1)], href: null },
    ],
  };
  const capped = roundRobin(result, 3);
  assert.deepEqual(capped.hits.map((h) => h.href), ['/r/a/1', '/r/b/1', '/r/a/2']);
  assert.equal(capped.total, 5);
  assert.equal(capped.groups, result.groups);
});

test('the rows changed last are each drawn once, newest first, and a row that cannot be opened is not', () => {
  const at = '2026-09-15T09:00:00.000Z';
  const line = (register: string | null, seq: number | null, title: string | null, kind = 'update') => ({ ts: at, kind, register, seq, title });
  const out = recentOf(
    [
      line('obligations', 2, 'Rent'),
      line(null, null, 'Nightly backup', 'export'),
      line('obligations', 2, 'Rent', 'create'),
      line('secrets', 1, 'Hidden'),
      line('people', 4, '  '),
      line('people', 5, 'Gone', 'delete'),
      line('people', 5, 'Gone', 'create'),
      line('people', 1, 'Hal Fenwick'),
      line('obligations', 3, 'Insurance'),
    ],
    LISTS,
    2,
  );
  assert.deepEqual(
    out.map((r) => [r.target, r.title, r.list, r.href, r.spoken]),
    [
      ['obligations#2', 'Rent', 'Obligations', '/r/obligations/2', '#2'],
      ['people#1', 'Hal Fenwick', 'People', '/r/people/1', '#1'],
    ],
  );
});

test('the figures listed are the declared ones that need nothing chosen first', () => {
  assert.ok(FIGURE_IDS.length > 0);
  for (const id of FIGURE_IDS) assert.ok(!isTemplate(METRICS[id]!), `${id} needs a project chosen first`);
  assert.ok(Object.values(METRICS).some((d) => isTemplate(d)), 'no figure needs a parameter, so this proves nothing');
});

test('a live search answers from the record, capped, and a refusal carries the record\'s sentence', async () => {
  const hits = Array.from({ length: 30 }, (_, i) => ({ register: 'obligations', seq: i + 1, title: `Fenwick ${i + 1}` }));
  const { io } = host((url) => {
    if (url.pathname === '/api/search') return json(200, { ok: true, value: hits });
    return json(200, { ok: true, value: url.pathname === '/api/boot' ? { registers: [], now: '2026-09-15T00:00:00Z' } : [] });
  });
  const out = await paletteReader(BASE, io).find('fenwick', 24);
  assert.equal(out.fix, null);
  assert.equal(out.value.hits.length, 24);
  assert.equal(out.value.total, 30);

  const fix = 'This key may not read that register.';
  const refused = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  const no = await paletteReader(BASE, refused.io).find('fenwick', 24);
  assert.equal(no.fix, fix);
  assert.equal(no.value.total, 0);
});

test('the rows changed last come from the log, and a log that cannot be read is none', async () => {
  const { io, sent } = host(() =>
    json(200, { ok: true, value: { cursor: null, events: [{ ts: '2026-09-15T09:00:00.000Z', kind: 'update', register: 'people', seq: 1, title: 'Hal Fenwick' }] } }),
  );
  const out = await paletteReader(BASE, io).recent(LISTS, 5);
  assert.deepEqual(out.map((r) => r.target), ['people#1']);
  assert.ok(sent[0]!.pathname.endsWith('/recentHistory'));

  const down = host(() => {
    throw new TypeError('fetch failed');
  });
  assert.deepEqual(await paletteReader(BASE, down.io).recent(LISTS, 5), []);
});

test('a figure is drawn from the record\'s reading, and one refused or over no rows is left out', async () => {
  const [first, second, ...rest] = FIGURE_IDS;
  assert.ok(first && second);
  const { io } = host((url) => {
    const id = url.searchParams.get('metric') ?? '';
    if (id === first) return json(200, { ok: true, value: { value: 1200, unit: null, rows: 3, met: true, refusals: [] } });
    if (id === second) return json(403, { ok: false, refusal: { code: 'METRIC_UNKNOWN', fix: 'No such figure.' } });
    return json(200, { ok: true, value: { value: 0, unit: null, rows: 0, met: null, refusals: [] } });
  });
  const named = new Set([METRICS[first]!.name, METRICS[second]!.name]);
  const out = await paletteReader(BASE, io).figures(undefined, (name) => named.has(name));
  assert.deepEqual(out.map((m) => m.id), [first]);
  assert.equal(out[0]!.label, METRICS[first]!.name);
  assert.equal(rest.length + 2, FIGURE_IDS.length);
});

test('A FIGURE OVER A LIST THE RECORD DOES NOT HOLD IS NOT ASKED FOR', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { value: 1, unit: null, rows: 1, met: true, refusals: [] } }));
  assert.deepEqual(await paletteReader(BASE, io).figures([{ id: 'courses' }, { id: 'assignments' }], () => true), []);
  assert.equal(sent.length, 0);
  const money = FIGURE_IDS.filter((id) => METRICS[id]?.source === 'register.obligations');
  await paletteReader(BASE, io).figures([{ id: 'obligations' }], () => true);
  assert.equal(sent.length, Math.min(money.length, FIGURES_ASKED));
});

test('only the newest query is answered, however the replies arrive', async () => {
  const replies = new Map<string, (v: string) => void>();
  const asked: string[] = [];
  const ask = latest((q: string) => {
    asked.push(q);
    return new Promise<string>((resolve) => replies.set(q, resolve));
  });
  const drawn: string[] = [];
  ask.ask('fen', (v) => drawn.push(v));
  await new Promise((r) => setTimeout(r, 5));
  ask.ask('fenwick', (v) => drawn.push(v));
  await new Promise((r) => setTimeout(r, 5));
  replies.get('fenwick')!('fenwick hits');
  replies.get('fen')!('fen hits');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(asked, ['fen', 'fenwick']);
  assert.deepEqual(drawn, ['fenwick hits']);

  ask.ask('hal', (v) => drawn.push(v));
  await new Promise((r) => setTimeout(r, 5));
  ask.cancel();
  replies.get('hal')!('hal hits');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(drawn, ['fenwick hits'], 'a cancelled read was drawn');
});

test('a burst of typing within the wait sends one read', async () => {
  const asked: string[] = [];
  const ask = latest(async (q: string) => (asked.push(q), q), 20);
  let drawn = '';
  for (const q of ['h', 'ha', 'hal']) ask.ask(q, (v) => (drawn = v));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(asked, ['hal']);
  assert.equal(drawn, 'hal');
});


test("a live search names a pack's own list as the record declares it", async () => {
  assert.equal(REGISTERS.study_modules, undefined, 'the build ships this list, so this proves nothing');
  const { io } = host((url) => {
    if (url.pathname === '/api/search') return json(200, { ok: true, value: [{ register: 'study_modules', seq: 1, title: 'Linear algebra' }] });
    if (url.pathname === '/api/schema') return json(200, { ok: true, value: { id: 'study_modules', name: 'Modules', icon: 'doc', title: 'name', fields: [{ id: 'name', type: 'text' }] } });
    return json(200, { ok: true, value: url.pathname === '/api/boot' ? {} : [] });
  });
  const out = await paletteReader(BASE, io).find('linear', 24);
  assert.deepEqual(out.value.groups.map((g) => g.kind), ['Modules']);
  assert.equal(out.value.hits[0]!.kind, 'Modules');
});
