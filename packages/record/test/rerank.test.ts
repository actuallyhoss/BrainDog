/**
 * `src/rerank.ts`: the word hits put in order again by their vectors, and `fuse`, the reciprocal-rank fusion `near.ts`
 * uses to fold the rows a query's meaning found in with the words'.
 *
 * Over a fake `sql` that answers `entry_vec` lines from a map, so each case says exactly which hits have vectors.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Sql } from '@braindog/ports';

import { fuse, rerank, RRF_K } from '../src/rerank.ts';

/** An `entry_vec` that holds these vectors and nothing else, read the way `rerank` reads it. */
function vectors(held: Record<string, number[]>, model = 'fake'): Pick<Sql, 'all'> {
  return {
    all: (<T>(_q: string, ids: string) =>
      (JSON.parse(ids) as string[]).flatMap((id) => {
        const v = held[id];
        return v ? [{ id, model, dims: v.length, vec: new Uint8Array(Int8Array.from(v).buffer) }] : [];
      }) as T[]) as Sql['all'],
  };
}

const hits = (...ids: string[]) => ids.map((id, i) => ({ id, rank: -10 + i }));

test('HITS WITH NO VECTORS COME BACK UNCHANGED, in the words order, as a new array', () => {
  const words = hits('a', 'b', 'c', 'd');
  const out = rerank(vectors({}), words);
  assert.deepEqual(out, words);
  assert.notEqual(out, words);
  /* One hit with a vector has nothing to be compared with, so nothing moves either. */
  assert.deepEqual(rerank(vectors({ c: [90, 0] }), words), words);
});

test('HITS WITH VECTORS ARE SHUFFLED AMONG THEMSELVES by how near they lie to the best ones, the rest keep their places', () => {
  const words = hits('a', 'b', 'c', 'd', 'e', 'x');
  const held = { a: [90, 0], b: [90, 0], c: [0, 90], d: [90, 0], e: [90, 0] };
  const out = rerank(vectors(held), words).map((h) => h.id);
  /* `c` matched a word but means something else, so `d` rises above it; `x` has no vector and keeps the last place. */
  assert.deepEqual(out, ['a', 'b', 'd', 'c', 'e', 'x']);
});

test('FUSE ORDERS BY RECIPROCAL RANK at k = 60, ties keeping the words order, a near-only row marked as found by meaning', () => {
  assert.equal(RRF_K, 60);
  const words = hits('w1', 'w2', 'w3');
  const near = [{ id: 'n1' }, { id: 'w3' }, { id: 'w2' }];
  const out = fuse(words, near);
  /* w2 and w3 are each in both lists, one place apart in each, so they tie and keep the words order; w1 and n1 are
     each first in one list only and tie too, the word hit first. */
  assert.deepEqual(out, [words[1], words[2], words[0], { id: 'n1', rank: 0, by: 'meaning' }]);
  /* A row in both lists is answered once, as its word hit. */
  assert.equal(out.filter((h) => h.id === 'w3').length, 1);
  assert.equal('by' in (out[1] as object), false);
});

test('FUSE IS DETERMINISTIC and leaves its inputs alone', () => {
  const words = hits('a', 'b', 'c', 'd');
  const near = [{ id: 'z' }, { id: 'y' }, { id: 'c' }, { id: 'y' }];
  const before = JSON.stringify({ words, near });
  const once = fuse(words, near);
  assert.deepEqual(fuse(words, near), once);
  assert.equal(JSON.stringify({ words, near }), before);
  /* A near row named twice counts at its first place only. */
  assert.equal(once.filter((h) => h.id === 'y').length, 1);
  assert.deepEqual(fuse([], []), []);
  assert.deepEqual(fuse(words, []), words);
  assert.deepEqual(fuse([], [{ id: 'q' }]), [{ id: 'q', rank: 0, by: 'meaning' }]);
});
