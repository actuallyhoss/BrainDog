/**
 * Search by meaning: the rows nearest a query's own vector, fused with the word hits (ENG-B18).
 *
 * `rerank.ts` only re-orders what the words found, so a query that shares no word with the right row finds nothing.
 * Here the query itself has a vector, and the rows whose vectors lie closest to it are answered beside the word hits.
 *
 * THE RECORD STILL NEVER CALLS A MODEL. The query's vector is asked of the host through `Meaning`, which answers no
 * (`off`, `spent`, `failed`) where consent is not given, the month's allowance is used, or the model is out; this file
 * only receives the answer. Pure over `sql`: no model, no clock.
 *
 * ASKED ONLY WHEN THE WORDS FALL SHORT. Five word hits or more answer as today, and the model is never asked, so a
 * search that words answer costs nothing and waits on nothing. With no `Meaning`, search behaves exactly as before.
 */

import type { Sql } from '@braindog/ports';

import { cosine, fuse, int8Of, rerank } from './rerank.ts';

/** A query's vector as the host's model built it: the model's name, its width, and the int8 values. */
export type QueryVector = { model: string; dims: number; vec: Int8Array };

/** The host's answer to "what does this query mean", or why it gave none. The host's `QueryMeaning` has this shape. */
export type MeaningAnswer = { ok: true; vector: QueryVector } | { ok: false; why: 'off' | 'spent' | 'failed' };

/** How this host turns a search into a vector. */
export type Meaning = (q: string) => Promise<MeaningAnswer>;

/** The most vectors one search reads, newest first. */
export const NEAR_MOST = 5_000;

/** The query's meaning is asked only when the words found fewer than this. */
export const NEAR_WHEN_FEWER = 5;

/** How many of the nearest rows one search answers. */
export const NEAR_TAKE = 10;

/** How alike a row must be to the query to be answered at all. A named first guess; the search suite sets it. */
export const NEAR_FLOOR = 0.45;

/**
 * The rows nearest `query`, best first, ties by id.
 *
 * ONE MODEL'S VECTORS COMPARE ONLY WITH EACH OTHER, so only vectors of the query's model and width are read. A row
 * deleted since its vector was built is passed by, and with `registers` only the rows of those lists are read: the
 * caller's ceiling is applied in the query, so a vector from a list they may not read is never even scored.
 *
 * AT MOST `most` VECTORS, NEWEST `built_at` FIRST, so a large record's search reads a bounded slice and the rows
 * written lately are the ones it reaches. `registers` is one bound array read through `json_each`, so a long list of
 * them needs no chunking and the `LIMIT` stays one limit over all of them.
 */
export function nearest(
  sql: Pick<Sql, 'all'>,
  query: QueryVector,
  opts: { registers?: readonly string[]; most?: number; take?: number; floor?: number } = {},
): { id: string; score: number }[] {
  const most = opts.most ?? NEAR_MOST;
  const take = opts.take ?? NEAR_TAKE;
  const floor = opts.floor ?? NEAR_FLOOR;
  if (query.vec.length !== query.dims || most <= 0 || take <= 0) return [];
  if (opts.registers !== undefined && opts.registers.length === 0) return [];

  const scoped = opts.registers !== undefined;
  const rows = sql.all<{ id: string; vec: unknown }>(
    `SELECT v.id AS id, v.vec AS vec FROM entry_vec v
       JOIN entry e ON e.id = v.id
      WHERE e.deleted_at IS NULL AND v.model = ? AND v.dims = ?${scoped ? ' AND e.register IN (SELECT value FROM json_each(?))' : ''}
      ORDER BY v.built_at DESC, v.id
      LIMIT ?`,
    ...(scoped ? [query.model, query.dims, JSON.stringify(opts.registers), most] : [query.model, query.dims, most]),
  );

  const scored: { id: string; score: number }[] = [];
  for (const row of rows) {
    const vec = int8Of(row.vec);
    if (vec === null || vec.length !== query.dims) continue;
    const score = cosine(query.vec, vec);
    if (score >= floor) scored.push({ id: row.id, score });
  }
  return scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, take);
}

/**
 * A search's word hits, and the rows its meaning finds where the words found few.
 *
 * What it answers says how the hits were found: `none` (this host has no way to ask), `words` (the words found
 * enough, or the query is blank and means nothing, and nothing was asked), `fused` (the meaning was asked and its rows fused in, each near-only row marked
 * `by: 'meaning'`), or the host's reason for giving no vector (`off`, `spent`, `failed`). In every case but `fused` the
 * hits are exactly the words' hits as `rerank` orders them.
 */
export async function byMeaning<T extends { id: string; rank: number }>(
  sql: Pick<Sql, 'all'>,
  meaning: Meaning | undefined,
  q: string,
  hits: readonly T[],
  opts: { registers?: readonly string[] },
): Promise<{ hits: (T | { id: string; rank: number; by: 'meaning' })[]; meaning: 'fused' | 'words' | 'none' | 'off' | 'spent' | 'failed' }> {
  const words = rerank(sql, hits);
  if (meaning === undefined) return { hits: words, meaning: 'none' };
  if (hits.length >= NEAR_WHEN_FEWER || q.trim() === '') return { hits: words, meaning: 'words' };

  let answer: MeaningAnswer;
  try {
    answer = await meaning(q);
  } catch {
    return { hits: words, meaning: 'failed' };
  }
  if (!answer.ok) return { hits: words, meaning: answer.why };
  if (answer.vector.vec.length !== answer.vector.dims) return { hits: words, meaning: 'failed' };

  const near = nearest(sql, answer.vector, opts.registers === undefined ? {} : { registers: opts.registers });
  return { hits: fuse(words, near), meaning: 'fused' };
}
