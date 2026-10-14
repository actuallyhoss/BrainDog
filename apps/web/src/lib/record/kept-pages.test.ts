/**
 * The last answer of each page this tab drew: kept when it was live, never when it was refused, the oldest going past
 * the most it holds, one per choice and one per record, and the reader answering it while its next read is out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { kept, keptPages, pageKey } from './kept-pages.ts';
import { pageReader, type Fetch, type Opened } from './page-live.ts';

const BASE = 'http://record.test/app/orchard';
const OTHER = 'http://record.test/app/harbour';

const live = (title: string): Opened => ({ from: 'live', now: 0, page: { page: { slug: 'ledger', title } as never, blocks: [] } });

test('a page put is the page got, by its key', () => {
  const store = keptPages();
  const key = pageKey(BASE, 'ledger');
  assert.equal(store.get(key), null);
  const answer = live('Ledger');
  store.put(key, answer);
  assert.equal(store.get(key), answer);
  store.drop(key);
  assert.equal(store.get(key), null);
});

test('a refused answer, or a page the record does not have, is never kept', () => {
  const store = keptPages();
  const key = pageKey(BASE, 'ledger');
  store.put(key, { from: 'refused', fix: 'The record could not be reached.' });
  store.put(key, { from: 'missing', held: [] });
  assert.equal(store.get(key), null);
  assert.equal(store.size, 0);
});

test('the thirteenth page lets the oldest go, and a page put again is the newest', () => {
  const store = keptPages();
  const keys = Array.from({ length: 13 }, (_, i) => pageKey(BASE, `shelf-${i}`));
  for (const key of keys.slice(0, 12)) store.put(key, live('Shelf'));
  store.put(keys[0]!, live('Shelf again'));
  store.put(keys[12]!, live('Shelf'));
  assert.equal(store.size, 12);
  assert.equal(store.get(keys[1]!), null, 'the page drawn longest ago went');
  assert.equal((store.get(keys[0]!) as Extract<Opened, { from: 'live' }>).page.page.title, 'Shelf again');
  assert.notEqual(store.get(keys[12]!), null);
  store.clear();
  assert.equal(store.size, 0);
});

test('two choices keep two answers, and the order a choice was made in does not matter', () => {
  const store = keptPages();
  store.put(pageKey(BASE, 'ledger', { kind: 'seeds' }), live('Seeds'));
  store.put(pageKey(BASE, 'ledger', { kind: 'tools' }), live('Tools'));
  assert.equal(store.size, 2);
  assert.equal(pageKey(BASE, 'ledger', { a: '1', b: '2' }), pageKey(BASE, 'ledger', { b: '2', a: '1' }));
  assert.equal(pageKey(BASE, 'ledger', {}), pageKey(BASE, 'ledger'), 'an empty choice is no choice');
  assert.equal(store.get(pageKey(BASE, 'ledger')), null, 'the whole page is not a narrowed one');
});

test('two records never share a page', () => {
  const store = keptPages();
  store.put(pageKey(BASE, 'ledger'), live('Orchard ledger'));
  assert.equal(store.get(pageKey(OTHER, 'ledger')), null);
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A record whose `page` answers wait until the test lets each go, so a read can be held out. */
function slowRecord(): { io: Fetch; release: (title: string) => void; refuse: () => void; waiting: () => number } {
  const held: ((r: Response) => void)[] = [];
  const io = (async (url: string | URL | Request) => {
    const method = new URL(String(url)).pathname.split('/').pop() ?? '';
    if (method === 'page') return new Promise<Response>((done) => held.push(done));
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return {
    io,
    release: (title) => held.shift()!(json(200, { ok: true, value: { slug: 'ledger', title, blocks: [] } })),
    refuse: () => held.shift()!(json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This key cannot read the ledger.' } })),
    waiting: () => held.length,
  };
}

const settle = () => new Promise((done) => setTimeout(done, 0));
const titleOf = (o: Opened | null) => (o?.from === 'live' ? o.page.page.title : null);

test('the reader answers the page it drew while the next read is out, and the new answer once it lands', async () => {
  kept.clear();
  const record = slowRecord();
  const reader = pageReader(BASE, record.io, () => 0);
  assert.equal(reader.kept('ledger'), null, 'nothing is kept before the first read');

  const first = reader.read('ledger');
  await settle();
  record.release('Ledger in spring');
  await first;
  assert.equal(titleOf(reader.kept('ledger')), 'Ledger in spring');

  const second = reader.read('ledger');
  await settle();
  assert.equal(record.waiting(), 1);
  assert.equal(titleOf(reader.kept('ledger')), 'Ledger in spring', 'the first answer stays while the second is out');
  assert.equal(titleOf(pageReader(BASE, record.io).kept('ledger')), 'Ledger in spring', 'a new reader on the tab sees it too');
  assert.equal(pageReader(OTHER, record.io).kept('ledger'), null, 'another record does not');
  record.release('Ledger in summer');
  await second;
  assert.equal(titleOf(reader.kept('ledger')), 'Ledger in summer');

  const third = reader.read('ledger');
  await settle();
  record.refuse();
  assert.equal((await third).from, 'refused');
  assert.equal(reader.kept('ledger'), null, 'a refusal lets the kept answer go');
  kept.clear();
});
