/**
 * `search`'s full-text hits, put in order again by what they mean, where the rows have vectors (PLT-11).
 *
 * THE RECORD NEVER EMBEDS A QUERY (`docs/45-SPEC-RECORD.md` §13 #9), so the query's vector is the hits' own: the mean of
 * the vectors of the few hits the words ranked best. Each hit is then scored by how close its vector is to that mean, and
 * the two orders, the words' and the meaning's, are fused by reciprocal rank (`k` = 60, as `45 §read` step 3 fuses them).
 * A hit that matched a word in passing sinks below one about the same thing as the best matches.
 *
 * NO VECTORS, NO CHANGE. A hit with no vector, or one built by another model, keeps its place exactly, and only the
 * places held by hits with vectors are shuffled among themselves. A record the sweep has not embedded yet, or a host with
 * no model, answers exactly as the words alone ranked it.
 */

import type { Sql } from '@braindog/ports';

/** How many of the best word matches the query's vector is the mean of. */
const SEEDS = 3;

/** Reciprocal-rank fusion's constant, the one `45 §read` names. */
const RRF_K = 60;

/** How many ids one `IN (…)` names, as `45 §read` chunks them. */
const CHUNK = 64;

type Vec = { model: string; vec: Int8Array };

/** A blob as the adapter hands it back: an `ArrayBuffer` in a Durable Object, a `Uint8Array` under `node:sqlite`. */
function int8Of(blob: unknown): Int8Array | null {
  if (blob instanceof ArrayBuffer) return new Int8Array(blob);
  if (ArrayBuffer.isView(blob)) return new Int8Array(blob.buffer, blob.byteOffset, blob.byteLength);
  return null;
}

function cosine(a: Float64Array, b: Int8Array): number {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    aa += x * x;
    bb += y * y;
  }
  return aa === 0 || bb === 0 ? 0 : dot / Math.sqrt(aa * bb);
}

export function rerank<T extends { id: string }>(sql: Pick<Sql, 'all'>, hits: readonly T[]): T[] {
  if (hits.length < 2) return [...hits];

  const vecs = new Map<string, Vec>();
  for (let i = 0; i < hits.length; i += CHUNK) {
    const ids = hits.slice(i, i + CHUNK).map((h) => h.id);
    for (const row of sql.all<{ id: string; model: string; dims: number; vec: unknown }>(
      `SELECT id, model, dims, vec FROM entry_vec WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ...ids,
    )) {
      const vec = int8Of(row.vec);
      if (vec !== null && vec.length === row.dims) vecs.set(row.id, { model: row.model, vec });
    }
  }

  /* ONE MODEL'S VECTORS COMPARE ONLY WITH EACH OTHER: the best-ranked hit with a vector names the model, and a hit whose
     vector another model built is treated as having none, since the two spaces do not share a meaning. */
  const first = hits.map((h) => vecs.get(h.id)).find((v) => v !== undefined);
  if (first === undefined) return [...hits];
  const same = (h: T): Vec | undefined => {
    const v = vecs.get(h.id);
    return v !== undefined && v.model === first.model && v.vec.length === first.vec.length ? v : undefined;
  };
  const slots = hits.flatMap((h, at) => (same(h) ? [at] : []));
  if (slots.length < 2) return [...hits];

  const mean = new Float64Array(first.vec.length);
  for (const at of slots.slice(0, SEEDS)) {
    const v = (same(hits[at] as T) as Vec).vec;
    for (let i = 0; i < mean.length; i++) mean[i] = (mean[i] as number) + (v[i] as number);
  }

  const near = slots
    .map((at) => ({ at, score: cosine(mean, (same(hits[at] as T) as Vec).vec) }))
    .sort((a, b) => b.score - a.score || a.at - b.at);
  const meaningRank = new Map(near.map((n, i) => [n.at, i]));
  const fused = slots
    .map((at, wordRank) => ({ at, score: 1 / (RRF_K + wordRank + 1) + 1 / (RRF_K + (meaningRank.get(at) as number) + 1) }))
    .sort((a, b) => b.score - a.score || a.at - b.at);

  const out = [...hits];
  slots.forEach((slot, i) => {
    out[slot] = hits[(fused[i] as { at: number }).at] as T;
  });
  return out;
}
