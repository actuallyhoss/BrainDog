/**
 * Embeddings: the hourly sweep's half and the ack's half of `entry_vec` (`docs/45-SPEC-RECORD.md` §`purge` and the
 * `infer.embed` write-back, `docs/30-BLUEPRINT.md` §8).
 *
 * THE RECORD NEVER CALLS A MODEL, so a vector reaches `entry_vec` in two steps with a host between them. The sweep reads
 * the rows whose words changed since their vector was built and queues ONE `infer.embed` job carrying their search text;
 * the host's model pass (`packages/host/src/model-jobs.ts`) embeds the texts and acks the vectors; the ack writes them
 * here, in its own transaction. Off the write path on purpose: a model call inside a write is how a record becomes slow,
 * and `entry_vec` is a derived index that may lag an hour without anybody noticing.
 *
 * THE TEXT IS THE ROW'S FULL-TEXT PROJECTION, read from `entry_fts` by rowid, so a vector means exactly the words a
 * search matches on: the `search:` fields and the title, joined as `fts.ts` joins them, and never a `secret`.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/** The most rows one job carries, `45 §purge`'s hundred: one model call a job, and a batch the adapter accepts. */
export const EMBED_ROWS_MOST = 100;

/**
 * What an `infer.embed` job carries: the rows, their texts in the same order, and the instant the texts were read.
 *
 * `at` IS WHAT THE VECTORS ARE STAMPED WITH, and not the ack's clock. A row edited while its job waited for a model has
 * a newer `updated_at` than the text that was embedded, so stamping the vector with the reading instant leaves that row
 * older than its vector says and the next sweep queues it again. Stamped with the ack's clock, the edit would be lost.
 */
export type EmbedJob = { at: string; ids: string[]; texts: string[] };

/**
 * The next embedding job, or `null` when there is nothing to embed or a job is already out.
 *
 * ONE JOB IN FLIGHT, NEVER ONE AN HOUR. On a host with no model, or in a month whose allowance is spent, the job waits
 * `pending`, and a sweep that queued another every hour would pile up copies of the same hundred rows, each a model call
 * once the model is back. A `dead` job does not hold the next one back: its dead letter is on Decide, and the rows are
 * read afresh.
 */
export function embedJob(sql: Pick<Sql, 'one' | 'all'>, nowMs: number): EmbedJob | null {
  if (sql.one("SELECT 1 AS x FROM outbox WHERE kind = 'infer.embed' AND state IN ('pending', 'leased', 'failed') LIMIT 1")) return null;
  const rows = sql.all<{ id: string; text: string }>(
    `SELECT e.id, f.text FROM entry e
       JOIN entry_fts f ON f.rowid = e.rowid
       LEFT JOIN entry_vec v ON v.id = e.id
      WHERE e.deleted_at IS NULL AND f.text <> '' AND (v.id IS NULL OR v.built_at < e.updated_at)
      LIMIT ?`,
    EMBED_ROWS_MOST,
  );
  if (rows.length === 0) return null;
  return { at: new Date(nowMs).toISOString(), ids: rows.map((r) => r.id), texts: rows.map((r) => r.text) };
}

/** A vector as the ack carries it: an `Int8Array` in process, or an array of integers when it crossed JSON. */
function int8Of(v: unknown, dims: number): Int8Array | null {
  const out =
    v instanceof Int8Array
      ? v
      : Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= -128 && x <= 127)
        ? Int8Array.from(v as number[])
        : null;
  return out !== null && out.length === dims ? out : null;
}

/**
 * The ack's write-back: one `entry_vec` row per id the job named, by position.
 *
 * EVERY VECTOR IS CHECKED BEFORE ONE IS WRITTEN, because a refusal returned inside the ack's transaction commits what was
 * written before it. A count that does not match the ids cannot be salvaged: the vectors are matched to rows by position,
 * and one missing would put every vector after it on the wrong row.
 *
 * A ROW GONE SINCE THE JOB WAS QUEUED IS PASSED BY. Deleted or erased while the model was out, it has no vector to keep,
 * and one written would be an index line for nothing, which the purge would then have to find.
 */
export function writeEmbeddings(sql: Pick<Sql, 'one' | 'exec'>, jobId: string, payload: string, result: unknown): Result<null> {
  let job: Partial<EmbedJob>;
  try {
    job = JSON.parse(payload) as Partial<EmbedJob>;
  } catch {
    return ok(null);
  }
  const ids = Array.isArray(job.ids) ? job.ids.filter((id): id is string => typeof id === 'string') : [];
  const said = result as { model?: unknown; dims?: unknown; vectors?: unknown } | null | undefined;
  const model = typeof said?.model === 'string' && said.model !== '' ? said.model : null;
  const dims = typeof said?.dims === 'number' && Number.isInteger(said.dims) && said.dims > 0 ? said.dims : 0;
  const vectors = Array.isArray(said?.vectors) ? said.vectors.map((v) => int8Of(v, dims)) : [];
  if (model === null || dims === 0 || vectors.length !== ids.length || vectors.some((v) => v === null))
    return no<null>('VALUE_MALFORMED', `Job ${jobId} came back without one vector of one length for each of its ${ids.length} rows, so no embedding was written.`, {
      at: 'result',
    });

  const builtAt = typeof job.at === 'string' ? job.at : new Date(0).toISOString();
  ids.forEach((id, i) => {
    const row = sql.one<{ register: string }>('SELECT register FROM entry WHERE id = ? AND deleted_at IS NULL', id);
    if (!row) return;
    const v = vectors[i] as Int8Array;
    sql.exec(
      'INSERT OR REPLACE INTO entry_vec (id, register, dims, vec, model, built_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      row.register,
      dims,
      new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
      model,
      builtAt,
    );
  });
  return ok(null);
}
