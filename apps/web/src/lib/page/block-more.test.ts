/**
 * A list block reads its next rows past a cursor, and stops at the last. The record is a fake `io` here: the
 * record's own page read taking `cursor` is the host's half and is not in this tree yet.
 *
 * WHAT MATTERS: the cursor the last answer gave is the one asked with next, a `null` cursor asks nothing, a refusal
 * keeps the rows and the cursor as they were so the next scroll tries again, and a record that ignores the cursor
 * cannot make the page ask for the same rows forever.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { MORE_FAILED, MORE_PAGE, moreRows, pagerOf, withMore, type MoreIo, type MoreResult } from './block-more.ts';

type Row = { key: string; title: string };
const ALL: Row[] = Array.from({ length: 120 }, (_, i) => ({ key: `r${i + 1}`, title: `Glaze batch ${i + 1}` }));

/** A record of 120 rows in pages of `limit`, its cursor the next row's place, and every ask written down. */
function fakeRecord(answer?: (q: Parameters<MoreIo['read']>[0]) => MoreResult | Promise<MoreResult>) {
  const asked: Parameters<MoreIo['read']>[0][] = [];
  const io: MoreIo = {
    read: async (q) => {
      asked.push(q);
      if (answer) return answer(q);
      const from = Number(q.cursor);
      const to = Math.min(ALL.length, from + q.limit);
      return { ok: true, value: { rows: ALL.slice(from, to), cursor: to < ALL.length ? String(to) : null } };
    },
  };
  return { io, asked };
}

test('the cursor is passed on: each ask is past the last answer, MORE_PAGE at a time', async () => {
  const { io, asked } = fakeRecord();
  const first = await moreRows<Row>({ slug: 'studio', block: 'glazes', cursor: '20' }, io);
  assert.deepEqual(asked[0], { slug: 'studio', block: 'glazes', cursor: '20', limit: MORE_PAGE });
  assert.equal(first.rows.length, MORE_PAGE);
  assert.equal(first.rows[0]?.title, 'Glaze batch 21');
  assert.equal(first.cursor, '70');
  const second = await moreRows<Row>({ slug: 'studio', block: 'glazes', cursor: first.cursor }, io);
  assert.equal(asked[1]?.cursor, '70');
  assert.equal(second.rows.length, 50);
  assert.equal(second.cursor, null, 'the last page says so');
});

test('it stops at a null cursor, and asks nothing there', async () => {
  const { io, asked } = fakeRecord();
  assert.deepEqual(await moreRows({ slug: 'studio', block: 'glazes', cursor: null }, io), { rows: [], cursor: null });
  assert.deepEqual(await moreRows({ slug: 'studio', block: 'glazes', cursor: '' }, io), { rows: [], cursor: null });
  assert.equal(asked.length, 0);
});

test('a refusal leaves the rows as they were, keeps the cursor and says why', async () => {
  const { io } = fakeRecord(() => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner for Glazes.' } }));
  const held = ALL.slice(0, 20);
  const got = await moreRows<Row>({ slug: 'studio', block: 'glazes', cursor: '20' }, io);
  assert.deepEqual(got, { rows: [], cursor: '20', refused: 'Ask the owner for Glazes.' });
  assert.equal(withMore(held, got, (r) => r.key), held, 'the very same rows, so nothing is drawn again');
});

test('a read that throws, or an answer without the block, is a refusal in the page words', async () => {
  const thrown = await moreRows({ slug: 'studio', block: 'glazes', cursor: '5' }, { read: async () => Promise.reject(new Error('offline')) });
  assert.deepEqual(thrown, { rows: [], cursor: '5', refused: MORE_FAILED });
  const odd = await moreRows({ slug: 'studio', block: 'glazes', cursor: '5' }, fakeRecord(() => ({ ok: true, value: { blocks: [] } })).io);
  assert.equal(odd.refused, MORE_FAILED);
  const bare = await moreRows({ slug: 'studio', block: 'glazes', cursor: '5' }, fakeRecord(() => ({ ok: false })).io);
  assert.equal(bare.refused, MORE_FAILED);
  assert.doesNotMatch(MORE_FAILED, /—|\brows?\b|\bentity\b/u, 'plain words, no dash');
});

test('an answer that is the whole page finds the block by its key', async () => {
  const { io } = fakeRecord(() => ({
    ok: true,
    value: { blocks: [{ key: 'kilns', rows: [{ key: 'k1', title: 'Front kiln' }] }, { key: 'glazes', rows: ALL.slice(5, 8), cursor: '8' }] },
  }));
  const got = await moreRows<Row>({ slug: 'studio', block: 'glazes', cursor: '5' }, io);
  assert.deepEqual(got.rows.map((r) => r.title), ['Glaze batch 6', 'Glaze batch 7', 'Glaze batch 8']);
  assert.equal(got.cursor, '8');
});

test('a record that ignores the cursor stops after one ask, and its rows already held are not drawn twice', async () => {
  const { io } = fakeRecord(() => ({ ok: true, value: { rows: ALL.slice(0, 20), cursor: '20' } }));
  const held = ALL.slice(0, 20);
  const got = await moreRows<Row>({ slug: 'studio', block: 'glazes', cursor: '20' }, io);
  assert.equal(got.cursor, null, 'the same cursor back is the last page');
  assert.equal(withMore(held, got, (r) => r.key), held);
});

test('withMore appends what is new in order and drops a row read twice', () => {
  const held = ALL.slice(0, 3);
  const next = withMore(held, { rows: [ALL[2]!, ALL[3]!, ALL[3]!, ALL[4]!], cursor: '5' }, (r) => r.key);
  assert.deepEqual(next.map((r) => r.key), ['r1', 'r2', 'r3', 'r4', 'r5']);
  assert.equal(withMore(held, { rows: [], cursor: null }, (r) => r.key), held);
});

test('the pager walks to the end, asks once while an ask is on its way, and asks nothing once done', async () => {
  const { io, asked } = fakeRecord();
  const pager = pagerOf<Row>({ slug: 'studio', block: 'glazes', cursor: '0' }, io);
  const [a, b] = [pager.more(), pager.more()];
  assert.equal(a, b, 'a second press while the first is out is the same ask');
  let held: readonly Row[] = (await a).rows;
  assert.equal(asked.length, 1);
  while (!pager.done) held = withMore(held, await pager.more(), (r) => r.key);
  assert.equal(held.length, ALL.length);
  assert.equal(asked.length, 3, '0 to 50, 50 to 100, 100 to the end');
  assert.deepEqual(await pager.more(), { rows: [], cursor: null });
  assert.equal(asked.length, 3);
});

test('a refused page can be asked again from the same cursor', async () => {
  let fail = true;
  const { io, asked } = fakeRecord((q) => (fail ? ((fail = false), { ok: false }) : { ok: true, value: { rows: ALL.slice(Number(q.cursor), 60), cursor: null } }));
  const pager = pagerOf<Row>({ slug: 'studio', block: 'glazes', cursor: '50' }, io);
  assert.equal((await pager.more()).refused, MORE_FAILED);
  assert.equal(pager.cursor, '50');
  assert.equal((await pager.more()).rows.length, 10);
  assert.deepEqual(asked.map((q) => q.cursor), ['50', '50']);
  assert.equal(pager.done, true);
});

test('nothing every screen loads imports this file: it is reached by import() only', () => {
  const entry = ['../../routes/+layout.svelte', '../../routes/+layout.ts', '../shell/AppFrame.svelte'].map((p) => new URL(p, import.meta.url));
  for (const url of entry) if (existsSync(url)) assert.doesNotMatch(readFileSync(url, 'utf8'), /block-more/u);
});
