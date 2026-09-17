/**
 * `/search` against the record: the live answer drawn, the sample when there is no record, the
 * record's sentence for any other refusal, and nothing sent for a query with no words in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { iconFor, REGISTERS, search } from './api.ts';
import { groupsOf, othersOf, searcher, type Fetch } from './search-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that gives one answer to `/api/search`, or throws, and remembers what it was sent. */
function host(answer: (() => Response) | null): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    sent.push(String(url));
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as Fetch;
  return { io, sent };
}

test('the record answers, and its hits are drawn grouped by register, best first', async () => {
  const { io, sent } = host(() =>
    json(200, {
      ok: true,
      value: [
        { register: 'obligations', seq: 1, title: 'Fenwick invoice', rank: -3 },
        { register: 'people', seq: 4, title: 'Hal Fenwick', rank: -2 },
        { register: 'obligations', seq: 2, title: 'Fenwick retainer', rank: -1 },
      ],
    }),
  );
  const out = await searcher(BASE, io).find('fenwick');
  assert.equal(out.from, 'live');
  assert.equal(out.value.total, 3);
  assert.deepEqual(
    out.value.groups.map((g) => [g.kind, g.total, g.href]),
    [
      [REGISTERS.obligations!.name, 2, '/r/obligations?q=fenwick'],
      [REGISTERS.people!.name, 1, '/r/people?q=fenwick'],
    ],
  );
  assert.deepEqual(
    out.value.groups[0]!.hits.map((h) => [h.title, h.href, h.spoken]),
    [
      ['Fenwick invoice', '/r/obligations/1', '#1'],
      ['Fenwick retainer', '/r/obligations/2', '#2'],
    ],
  );
  const url = new URL(sent[0]!);
  assert.equal(url.pathname, '/api/search');
  assert.equal(url.searchParams.get('q'), 'fenwick');
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } })],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const)
  test(`the sample's search is drawn when ${what}, and the tab does not ask again`, async () => {
    const { io, sent } = host(answer);
    const find = searcher(BASE, io);
    const first = await find.find('a');
    assert.equal(first.from, 'sample');
    assert.deepEqual(first.value, search('a', Number.MAX_SAFE_INTEGER));
    assert.ok(first.value.total > 0, 'the sample found nothing, so this proves nothing');
    const second = await find.find('re');
    assert.equal(second.from, 'sample');
    assert.equal(sent.length, 1);
  });

test('any other refusal is the record\'s own sentence, and the next query asks again', async () => {
  const fix = 'This key may not read that register.';
  const { io, sent } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix } }));
  const find = searcher(BASE, io);
  assert.deepEqual(await find.find('rent'), { from: 'refused', fix });
  assert.deepEqual(await find.find('rent due'), { from: 'refused', fix });
  assert.equal(sent.length, 2);
});

test('a query with no words in it sends nothing', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: [] }));
  const find = searcher(BASE, io);
  for (const q of ['', '   ', '"-*'])
    assert.deepEqual(await find.find(q), { from: 'live', value: { hits: [], total: 0, groups: [] } });
  assert.equal(sent.length, 0);
});

test('the page asks through the live source and draws a refusal\'s sentence', () => {
  const page = readFileSync(new URL('../../routes/search/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /from '\$lib\/record\/search-live\.ts'/u);
  assert.doesNotMatch(page, /import \{ search \} from '\$lib\/record\/api\.ts'/u, 'the page searches the sample directly again');
  assert.match(page, /<Empty kind="error" title=\{answer\.fix\}(?: \/>|>)/u);
});

test('a live search finds the record\'s questions and pages too, asked once for the tab', async () => {
  const { io, sent } = host(() => json(500, {}));
  const routed = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    sent.push(String(url));
    if (path === '/api/search') return json(200, { ok: true, value: [{ register: 'obligations', seq: 9, title: 'Rent for the studio', rank: -1 }] });
    if (path === '/api/boot')
      return json(200, {
        ok: true,
        value: {
          registers: [],
          now: '2026-09-16T00:00:00.000Z',
          waiting: [{ id: 'SG4', body_kind: 'options', opened_by: 'rule:rent', opened_at: '2026-09-15T00:00:00.000Z', question: 'Renew the studio rent?' }],
          pages: [
            { slug: 'rent-watch', title: 'Rent watch', nav: { section: 'Views', order: 900 }, icon: null },
            { slug: 'rent-hidden', title: 'Rent unplaced', nav: null, icon: null },
          ],
        },
      });
    if (path === '/api/governance' && new URL(String(url)).searchParams.get('register') === 'decision')
      return json(200, { ok: true, value: [{ id: 'D2', question: 'Pay the rent early?', answer: 'yes' }, { id: 'D3', question: 'Hire help?' }] });
    if (path === '/api/governance') return json(200, { ok: true, value: [{ id: 'SG4', body_kind: 'options', question: 'Renew the studio rent?' }] });
    return io(url, init);
  }) as Fetch;
  const find = searcher(BASE, routed);
  const out = await find.find('rent');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(
    out.value.groups.map((g) => [g.kind, g.hits.map((h) => [h.title, h.href, h.detail])]),
    [
      ['Decide', [['Renew the studio rent?', '/decide/SG4', 'Open question'], ['Pay the rent early?', '/decide/D2', 'Decided']]],
      [REGISTERS.obligations!.name, [['Rent for the studio', '/r/obligations/9', '']]],
      ['Pages and lists', [['Rent watch', '/p/rent-watch', 'Views']]],
    ],
  );
  assert.equal(out.value.total, 4);
  await find.find('studio');
  assert.equal(sent.filter((u) => new URL(u).pathname === '/api/boot').length, 1, 'boot was asked again for a second query');
  assert.equal(sent.filter((u) => new URL(u).pathname === '/api/search').length, 2);
});

test('a question is found by its whole id, and nothing of the sample is mixed in', async () => {
  const out = groupsOf('d2', [], othersOf({ ok: true, value: {} }, { ok: true, value: [{ id: 'D2', question: 'Pay early?' }] }));
  assert.deepEqual(out.hits.map((h) => h.href), ['/decide/D2']);
  assert.deepEqual(othersOf({ ok: false }, { ok: false }), { pages: [], questions: [] });
});

test("a pack's own list is grouped under the name and icon the record declares, and a sample list is never asked about", async () => {
  assert.equal(REGISTERS.study_courses, undefined, 'the build ships this list, so this proves nothing');
  const sent: URL[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    sent.push(at);
    if (at.pathname === '/api/search')
      return json(200, {
        ok: true,
        value: [
          { register: 'study_courses', seq: 1, title: 'Linear algebra', rank: -3 },
          { register: 'obligations', seq: 1, title: 'Linear invoice', rank: -2 },
        ],
      });
    if (at.pathname === '/api/schema')
      return json(200, { ok: true, value: { id: 'study_courses', name: 'Courses', one: 'course', icon: 'doc', title: 'name', fields: [{ id: 'name', label: 'Course', type: 'text', search: true }] } });
    return json(200, { ok: true, value: at.pathname === '/api/boot' ? {} : [] });
  }) as Fetch;
  const find = searcher(BASE, io);
  const out = await find.find('linear');
  assert.equal(out.from, 'live');
  assert.deepEqual(
    out.value.groups.map((g) => [g.kind, g.hits[0]!.icon]),
    [
      ['Courses', iconFor('doc', 'rows')],
      [REGISTERS.obligations!.name, iconFor(REGISTERS.obligations!.icon, 'rows')],
    ],
  );
  const schemas = sent.filter((u) => u.pathname === '/api/schema');
  assert.equal(schemas.length, 1, 'only the list the build does not ship is asked about');
  await find.find('linear');
  assert.equal(sent.filter((u) => u.pathname === '/api/schema').length, 1, 'and it is asked once for the tab');
});

test('SEARCH REACHES EVERY OPEN QUESTION AND EVERY DECISION, past boot’s twenty and past a page of two hundred', async () => {
  const { io, sent } = host(() => json(500, {}));
  const open = Array.from({ length: 45 }, (_, i) => ({ id: `SG${100 - i}`, question: i === 44 ? 'The oldest open rent question?' : `Open ${i}?` }));
  const decided = Array.from({ length: 431 }, (_, i) => ({ id: `D${1000 - i}`, question: i === 430 ? 'The oldest rent decision?' : `Decided ${i}?` }));
  const routed = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    sent.push(String(url));
    if (at.pathname === '/api/search') return json(200, { ok: true, value: [] });
    if (at.pathname === '/api/boot') return json(200, { ok: true, value: { registers: [], now: '2026-09-16T00:00:00.000Z', waiting: open.slice(0, 20), pages: [] } });
    if (at.pathname === '/api/governance') {
      const rows = at.searchParams.get('register') === 'decision' ? decided : open;
      const limit = Number(at.searchParams.get('limit'));
      const cursor = at.searchParams.get('cursor');
      const from = cursor ? rows.findIndex((r) => r.id === cursor) + 1 : 0;
      return json(200, { ok: true, value: rows.slice(from, from + limit) });
    }
    return io(url, init);
  }) as Fetch;
  const out = await searcher(BASE, routed).find('oldest rent');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.value.groups[0]?.hits.map((h) => h.href), ['/decide/SG56', '/decide/D570']);
  const decisionPages = sent.filter((u) => new URL(u).searchParams.get('register') === 'decision').length;
  assert.equal(decisionPages, 3, 'decisions are read a page of two hundred at a time');
});
