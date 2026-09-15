/**
 * `/search` against the record: the live answer drawn, the sample when there is no record, the
 * record's sentence for any other refusal, and nothing sent for a query with no words in it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { REGISTERS, search } from './api.ts';
import { searcher, type Fetch } from './search-live.ts';

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
  assert.match(page, /<Empty kind="error" title=\{answer\.fix\} \/>/u);
});
