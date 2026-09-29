/**
 * The kernel schema, migration 16: Spark is called Slash, in the rows that hold the name.
 *
 * The old name was found in six columns and inside two kinds of declaration body, and in no table, column, index or
 * CHECK: no schema changes. Each value below is read by the new name after the rename, so a record that kept the old
 * one lost its assistant's switch and last day, the audit log's "agent" label on its events, the vault key its included
 * model opens, and the resume of a run parked on an `ask_spark` step (`test/slash-rename.test.ts`).
 *
 * THE OLD NAMES ARE WRITTEN OUT BECAUSE THEY ARE WHAT AN OLDER RECORD HOLDS, and this text is checksummed once applied,
 * so it is never edited to match a later rename either.
 *
 * THE TWO DECLARATION BODIES ARE NOT HERE. A rule's `ask_spark` step and a digest's `prose: spark` live inside JCS bodies
 * whose `checksum` is SHA-256 of the body, which SQL cannot compute, so `renameDeclarations` below rewrites them
 * in TypeScript after the migrations run. `event.from_v` and `event.to_v` copies of old bodies are history and stay.
 *
 * `pref` KEYS BEFORE ITS PERSON, because the key statement finds its rows by the old person id.
 *
 * AND THE SAME TWO NAMES INSIDE A SUGGESTION'S BODY, which section 2.1 missed: a `change` whose `to` holds such a rule
 * or digest, or a `pack` whose `doc` does, was refused when accepted, because the install lints what it lands. A
 * suggestion's body has no checksum, so SQL can rename it. `"ask_spark":` with its colon is only ever a key, since a
 * JSON string followed by a colon is one, and one escaped inside somebody's question has a backslash before its closing
 * quote. `"prose":"spark"` is narrowed to those two kinds of body, so a row a `rowset` proposes with a field called
 * `prose` keeps what was typed into it. Every status, as `opened_by` is, so no row holds the old name.
 *
 * AN IMPORT RUNS IT TOO, as it runs `SEAT_SESSION`: a file written before the rename lands in a record whose ledger
 * already says this migration ran, so nothing else would rename what it carries.
 *
 * NOT A FORMAT REVISION: values change, and no table or column does.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from '../coerce.ts';
import { digest, jcs } from '../declare.ts';

export const RENAME_SLASH = `
UPDATE event SET actor = 'slash' WHERE actor = 'spark';
UPDATE suggestion SET opened_by = 'slash' WHERE opened_by = 'spark';
UPDATE pref SET key = 'slash.' || substr(key, 7) WHERE person_id = 'spark' AND key IN ('spark.daily', 'spark.last');
UPDATE pref SET person_id = 'slash' WHERE person_id = 'spark';
UPDATE "grant" SET label = 'slash' WHERE label = 'spark';
UPDATE automation_step SET kind = 'ask_slash' WHERE kind = 'ask_spark';
UPDATE suggestion SET body = replace(body, '"ask_spark":', '"ask_slash":') WHERE body_kind IN ('change', 'pack') AND instr(body, '"ask_spark":') > 0;
UPDATE suggestion SET body = replace(body, '"prose":"spark"', '"prose":"slash"') WHERE body_kind IN ('change', 'pack') AND instr(body, '"prose":"spark"') > 0;
`;

export default RENAME_SLASH;

/** A declaration body as parsed JSON, walked by `renamed`. */
type Body = null | boolean | number | string | Body[] | { [key: string]: Body };

/**
 * A body with the old step verb renamed wherever it is a key, and a digest's `prose: spark` renamed at the top.
 *
 * WALKED AND NOT STRING-REPLACED, because the verb is a key at any depth (`if`'s `then` and `else`, a loop's steps) and
 * the text between a rule's quotes is somebody's question. Re-serialised by `jcs`, so the result is canonical whatever
 * order the renamed key now sorts in.
 */
function renamed(body: Body, top = true): Body {
  if (Array.isArray(body)) return body.map((b) => renamed(b, false));
  if (body === null || typeof body !== 'object') return body;
  const out: { [key: string]: Body } = {};
  for (const [key, value] of Object.entries(body))
    out[key === 'ask_spark' ? 'ask_slash' : key] = top && key === 'prose' && value === 'spark' ? 'slash' : renamed(value, false);
  return out;
}

/**
 * The half of this migration SQL cannot do: every declaration body holding the old names, rewritten with its checksum.
 *
 * EVERY VERSION AND NOT ONLY THE ACTIVE ONE. A superseded rule comes back by a rollback, and one holding `ask_spark` would
 * then fail the lint it passed when it was written; the log's own copies in `event` are what history reads.
 *
 * RUN ON EVERY OPEN AND AFTER EVERY IMPORT, AND IDEMPOTENT, because it cannot share the migration's transaction:
 * SHA-256 is asynchronous and a transaction here is synchronous. Keyed on the ledger instead, a process that died
 * between migration 16's commit and this write would have left those bodies unrenamed for good. What every open pays
 * for it is one read of `declaration` filtered by `LIKE`, measured over the test port on a record holding 200
 * declarations, 100 of them rules of about 1 KB each, with nothing to rewrite: 1.6 milliseconds at the median and 2.3
 * at the 90th percentile over 1,000 runs. A Durable Object opens its record once per instance, so that is paid once.
 *
 * Answers how many rows it rewrote.
 */
export async function renameDeclarations(sql: Sql): Promise<number> {
  const rows = sql.all<{ id: string; version: number; body: string }>(
    `SELECT id, version, body FROM declaration WHERE kind IN ('rule', 'digest') AND (body LIKE '%"ask_spark"%' OR body LIKE '%"prose":"spark"%')`,
  );
  if (rows.length === 0) return 0;
  const next = await Promise.all(
    rows.map(async (r) => {
      const body = jcs(renamed(JSON.parse(r.body) as Body) as Json);
      return { ...r, body, checksum: await digest(body) };
    }),
  );
  sql.transactionSync(() => {
    for (const r of next) sql.exec('UPDATE declaration SET body = ?, checksum = ? WHERE id = ? AND version = ?', r.body, r.checksum, r.id, r.version);
  });
  return next.length;
}
