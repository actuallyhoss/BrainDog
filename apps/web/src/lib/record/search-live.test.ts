/**
 * `/search` against the record: the live answer drawn, the record's sentence for any refusal including
 * no record at all, and nothing sent for a query with no words in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './fixtures/fill.ts';
import { iconFor, REGISTERS } from './api.ts';
import { answered, groupsOf, othersOf, searcher, type Fetch } from './search-live.ts';

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

/**
 * NO RECORD IS A REFUSAL, AND THE SEEDED STUDIO'S HITS ARE NOT AN ANSWER. This drew the in-browser
 * sample's search for a 401, an unreachable host and a static host's 404 page, and remembered that for the tab, so a
 * person whose session had lapsed searched a fictional studio's rows under their own record's address and was never
 * asked again. Each case is now the refusal the record or the client gave, with its sentence, and the next query asks
 * again the way any other refusal does.
 */
for (const [what, answer, fix] of [
  ['nothing answers', null, /^BrainDog could not be reached\.$/u],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }), /^Sign in again\.$/u],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 }), /^BrainDog's answer could not be read\.$/u],
] as const)
  test(`a search is refused when ${what}, never answered with the sample's hits`, async () => {
    const { io, sent } = host(answer);
    const find = searcher(BASE, io);
    const first = await find.find('a');
    assert.equal(first.from, 'refused', `answered ${JSON.stringify(first).slice(0, 120)}`);
    if (first.from !== 'refused') return;
    assert.match(first.fix, fix);
    assert.equal((await find.find('re')).from, 'refused');
    assert.equal(sent.length, 2, 'the tab stopped asking the record after one refusal');
    /* A QUERY WITH NO WORDS IS STILL NOTHING SENT AND NOTHING FOUND, on a record that refused the last one too. */
    assert.deepEqual(await find.find('  '), { from: 'live', value: { hits: [], total: 0, groups: [] } });
  });

test('the search reader reads nothing from the sample', () => {
  const src = readFileSync(new URL('./search-live.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bsampleSearch\b|\bsearch as\b|'sample'/u);
  assert.doesNotMatch(src, /\bnoRecord\b/u);
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
      ['Needs you', [['Renew the studio rent?', '/decide/SG4', 'Open question'], ['Pay the rent early?', '/decide/D2', 'Decided']]],
      [REGISTERS.obligations!.name, [['Rent for the studio', '/r/obligations/9', '']]],
      ['Pages', [['Rent watch', '/p/rent-watch', 'Views']]],
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

/* THE BUILD'S OWN OBLIGATIONS, held before any test here learns over it. */
const OBLIGATIONS = JSON.parse(JSON.stringify(REGISTERS.obligations));

test("a pack's own list is grouped under the name and icon the record declares, and every list is asked about once for the tab", async () => {
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
    /* EACH LIST ITS OWN DECLARATION: Courses as the pack declares it, and the build's own Obligations as the record
       holds it, which here is the bundle's copy word for word. */
    if (at.pathname === '/api/schema') {
      const register = at.searchParams.get('register');
      if (register === 'study_courses')
        return json(200, { ok: true, value: { id: 'study_courses', name: 'Courses', one: 'course', icon: 'doc', title: 'name', fields: [{ id: 'name', label: 'Course', type: 'text', search: true }] } });
      if (register === 'obligations') return json(200, { ok: true, value: OBLIGATIONS });
      return json(404, { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'No such list.' } });
    }
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
  /* A LIST THE BUILD SHIPS IS ASKED ABOUT TOO, since a field added at run time is on the record alone. */
  const schemas = () => sent.filter((u) => u.pathname === '/api/schema').map((u) => u.searchParams.get('register')).sort();
  assert.deepEqual(schemas(), ['obligations', 'study_courses']);
  await find.find('linear');
  assert.deepEqual(schemas(), ['obligations', 'study_courses'], 'and each is asked once for the tab');
  assert.equal(REGISTERS.obligations!.name, OBLIGATIONS.name, 'one list was answered with another list');
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

/* ── search by meaning ─────────────────────────────────────────────────── */

const byWords = { register: 'obligations', seq: 1, title: 'Renew the van policy with Marlow' };
const byMeaning = { register: 'obligations', seq: 9, title: 'Kestrel motor insurance', by: 'meaning' as const };

test('A HIT FOUND BY MEANING SAYS SO IN ITS LINE, and its list counts the words’ matches plus it', async () => {
  const { io } = host(() => json(200, { ok: true, value: { hits: [byWords, byMeaning], matched: { obligations: 7 }, meaning: 'fused' } }));
  const out = await searcher(BASE, io).find('vehicle cover');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.meaning, 'fused');
  assert.deepEqual(
    out.value.groups[0]!.hits.map((h) => [h.title, h.detail, h.meaning ?? false]),
    [
      ['Renew the van policy with Marlow', '', false],
      /* MARKED AND NEVER CAPTIONED: the row says nothing about why it ranked. */
      ['Kestrel motor insurance', '', true],
    ],
  );
  assert.equal(out.value.groups[0]!.total, 8, '`matched` counts word matches only');
  assert.equal(out.value.total, 8);
});

test('an answer that says nothing of meaning is grouped exactly as before', async () => {
  const { io } = host(() => json(200, { ok: true, value: { hits: [byWords, { ...byWords, seq: 2 }], matched: { obligations: 7 } } }));
  const out = await searcher(BASE, io).find('marlow');
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal('meaning' in out, false);
  assert.deepEqual(out.value, groupsOf('marlow', [byWords, { ...byWords, seq: 2 }], undefined, { obligations: 7 }));
  assert.equal(out.value.groups[0]!.total, 7);
  assert.ok(out.value.hits.every((h) => h.detail === ''));
});

test('a word for how it searched that this build does not know is read as nothing', () => {
  assert.equal('meaning' in answered({ hits: [], matched: {}, meaning: 'nonsense' }), false);
  assert.equal('meaning' in answered({ hits: [], matched: {}, meaning: 7 }), false);
  assert.equal('meaning' in answered([byWords]), false, 'the bare array of an older record');
  for (const m of ['fused', 'words', 'none', 'off', 'spent', 'failed']) assert.equal(answered({ hits: [], matched: {}, meaning: m }).meaning, m);
});

test('a list only meaning reached counts what arrived', () => {
  const out = groupsOf('vehicle cover', [byMeaning], undefined, {});
  assert.equal(out.groups[0]!.total, 1);
  assert.equal(out.hits[0]!.meaning, true);
  assert.equal(out.hits[0]!.detail, '');
});
