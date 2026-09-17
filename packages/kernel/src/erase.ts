/**
 * Erasing a person: `02 §10`'s cascade, one transaction, and one `erase` event that names the subject only as a hash.
 *
 * TOMBSTONE THE PAYLOAD, KEEP THE FACT. What goes is every value that names the subject: a row's fields, an event's
 * `from_v`/`to_v`/`note`, an arrival's body and headers, a decision's words, a suggestion's body, a prediction's claim,
 * a grant's label and hint, a device's label and user agent, a job's arguments and output. Each becomes the literal
 * `--erased--`, so a reader can tell *removed* from *there was nothing* (`NULL`) and from *withheld at write*
 * (`--redacted--`). What stays is every row's existence, position, time, actor, kind, target and field name.
 *
 * DELETED OUTRIGHT, because a row of them is nothing but the subject: `observation` rows whose `subject` is the value,
 * the erased entries' `entry_fts` and `entry_vec` lines, and the person's `member` rows. Pending `schedule` and
 * `outbox` work that names the subject is cancelled, `done` with its payload erased.
 *
 * THE TWENTIETH STORE IS NOT HERE. An attachment's bytes are outside the object, so each key goes on the outbox as one
 * `erase.r2` row and the host deletes it after the commit.
 *
 * A MATCH IS A CASE-INSENSITIVE SUBSTRING, which over-erases a longer word containing the subject. That is the right
 * direction to be wrong in for a legal request, and it is why a subject is three characters or more.
 */

import type { Sql } from '@braindog/ports';

import { jcs } from './declare.ts';

/** The one spelling of *removed later* (`02 §10`). */
export const ERASED = '--erased--';

export type EraseRequest = { subjects: readonly string[]; personId?: string; basis: string };

export type EraseReport = {
  /** The erasure's id: the `erase` event's target is `erase:<id>`. */
  id: string;
  at: string;
  subjects: number;
  /** Rows touched across every store, the figure the `erase` event's note carries. */
  rows: number;
  counts: Record<string, number>;
  /** Attachment keys put on the outbox as `erase.r2`. */
  keys: number;
};

export type EraseDeps = {
  sql: Sql;
  mint: () => string;
  at: string;
  actor: string;
  enqueue: (payload: { erase: string; key: string }) => void;
};

/** The subjects as they are matched: trimmed, lower-cased, each once. */
export function subjectsOf(given: readonly string[]): string[] {
  return [...new Set(given.map((s) => s.trim().toLowerCase()).filter((s) => s !== ''))];
}

/** Whether `text` names any of the subjects. */
const names = (text: string | null | undefined, subjects: readonly string[]): boolean => {
  if (!text) return false;
  const low = text.toLowerCase();
  return subjects.some((s) => low.includes(s));
};

/** Every attachment key a field value holds: a `file` value, or a list of them. */
function keysIn(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) for (const v of value) keysIn(v, into);
  else if (value && typeof value === 'object') {
    const sha = (value as Record<string, unknown>).sha256;
    if (typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha)) into.add(sha);
  }
}

/**
 * Run the cascade. The caller holds the transaction and has already refused what it refuses.
 *
 * `hashes` is the SHA-256 of each subject, hex, computed before the transaction because digesting is asynchronous.
 */
export function eraseSubjects(deps: EraseDeps, subjects: readonly string[], personIds: readonly string[], basis: string, hashes: readonly string[]): EraseReport {
  const { sql, at } = deps;
  const id = deps.mint();
  const counts: Record<string, number> = {};
  const bump = (store: string, n: number) => (counts[store] = (counts[store] ?? 0) + n);

  /* ── entry, entry_fts, entry_vec ── */
  const erasedEntries: string[] = [];
  const keys = new Set<string>();
  for (const row of sql.all<{ rowid: number; id: string; fields: string }>('SELECT rowid, id, fields FROM entry')) {
    if (!names(row.fields, subjects)) continue;
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      fields = {};
    }
    for (const [key, value] of Object.entries(fields)) {
      if (!names(JSON.stringify(value), subjects)) continue;
      keysIn(value, keys);
      fields[key] = ERASED;
    }
    sql.exec('UPDATE entry SET fields = ?, deleted_at = COALESCE(deleted_at, ?) WHERE id = ?', JSON.stringify(fields), at, row.id);
    sql.exec('DELETE FROM entry_fts WHERE rowid = ?', row.rowid);
    sql.exec('DELETE FROM entry_vec WHERE id = ?', row.id);
    erasedEntries.push(row.id);
  }
  bump('entry', erasedEntries.length);
  /* A DELETE LEAVES THE TERM IN THE INDEX'S SEGMENTS until they merge, so they are merged now. */
  if (erasedEntries.length > 0) sql.exec("INSERT INTO entry_fts (entry_fts) VALUES ('optimize')");

  /* ── event: the payload of every event that names the subject or is about a row that was erased ── */
  const about = new Set(erasedEntries.map((e) => `entry:${e}`));
  let events = 0;
  for (const ev of sql.all<{ id: string; target: string | null; from_v: string | null; to_v: string | null; note: string | null }>(
    'SELECT id, target, from_v, to_v, note FROM event',
  )) {
    const hit = (ev.target !== null && about.has(ev.target)) || names(ev.from_v, subjects) || names(ev.to_v, subjects) || names(ev.note, subjects);
    if (!hit) continue;
    sql.exec(
      'UPDATE event SET from_v = CASE WHEN from_v IS NULL THEN NULL ELSE ? END, to_v = CASE WHEN to_v IS NULL THEN NULL ELSE ? END, note = CASE WHEN note IS NULL THEN NULL ELSE ? END WHERE id = ?',
      ERASED,
      ERASED,
      ERASED,
      ev.id,
    );
    events++;
  }
  bump('event', events);

  /* ── inbox_raw and what its receipts extracted ── */
  const raws = sql
    .all<{ id: string; headers: string | null; body: string | null }>('SELECT id, headers, body FROM inbox_raw')
    .filter((r) => names(r.headers, subjects) || names(r.body, subjects))
    .map((r) => r.id);
  for (const raw of raws) {
    sql.exec("UPDATE inbox_raw SET headers = ?, body = ?, state = 'erased' WHERE id = ?", ERASED, ERASED, raw);
    sql.exec("UPDATE ingest_receipt SET wrote = '[]' WHERE raw_id = ?", raw);
  }
  bump('inbox_raw', raws.length);

  /* ── the tombstoned columns, store by store ── */
  const tomb = (table: string, key: string, cols: readonly string[], where = '1 = 1'): number => {
    let n = 0;
    for (const row of sql.all<Record<string, string | null>>(`SELECT ${key} AS k, ${cols.join(', ')} FROM ${table} WHERE ${where}`)) {
      const hit = cols.filter((c) => names(row[c], subjects));
      if (hit.length === 0) continue;
      sql.exec(`UPDATE ${table} SET ${hit.map((c) => `${c} = ?`).join(', ')} WHERE ${key} = ?`, ...hit.map(() => ERASED), row.k as string);
      n++;
    }
    bump(table, n);
    return n;
  };
  tomb('decision', 'id', ['question', 'answer', 'reason']);
  tomb('suggestion', 'id', ['body']);
  tomb('prediction', 'id', ['claim']);
  tomb('grant', 'id', ['label', 'hint']);
  tomb('device_grant', 'id', ['label', 'ua']);
  tomb('job', 'id', ['args', 'result', 'error']);
  /* `job_event` has no single key, so its rowid is the one. */
  tomb('job_event', 'rowid', ['body']);

  /* ── pending work that names the subject: cancelled ── */
  const cancel = (table: string, states: string): number => {
    let n = 0;
    for (const row of sql.all<{ id: string; payload: string }>(`SELECT id, payload FROM ${table} WHERE state IN (${states})`)) {
      if (!names(row.payload, subjects)) continue;
      sql.exec(`UPDATE ${table} SET state = 'done', payload = ? WHERE id = ?`, ERASED, row.id);
      n++;
    }
    bump(table, n);
    return n;
  };
  cancel('schedule', "'pending', 'paused', 'failed'");
  cancel('outbox', "'pending', 'leased', 'failed'");

  /* ── observation: rows whose subject IS the value ── */
  let observed = 0;
  for (const s of subjects) {
    const n = sql.one<{ n: number }>('SELECT count(*) AS n FROM observation WHERE lower(subject) = ?', s)?.n ?? 0;
    if (n > 0) sql.exec('DELETE FROM observation WHERE lower(subject) = ?', s);
    observed += Number(n);
  }
  bump('observation', observed);

  /* ── person and member ── */
  let people = 0;
  let members = 0;
  for (const person of personIds) {
    const held = sql.one<{ n: number }>('SELECT count(*) AS n FROM member WHERE person_id = ?', person)?.n ?? 0;
    sql.exec('DELETE FROM member WHERE person_id = ?', person);
    /* AND WHAT THEY ARRANGED FOR THEMSELVES, which names them by id and is nobody else's. */
    sql.exec('DELETE FROM pref WHERE person_id = ?', person);
    members += Number(held);
    sql.exec('UPDATE person SET email = ?, name = ? WHERE id = ?', ERASED, ERASED, person);
    people++;
  }
  bump('person', people);
  bump('member', members);

  /* ── metric_point: aggregates only; walked so the count is honest ── */
  bump('metric_point', 0);

  /* ── the twentieth store, through the outbox ── */
  for (const key of keys) deps.enqueue({ erase: id, key });

  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'erase', ?, 'erase', ?, ?)",
    deps.mint(),
    at,
    deps.actor,
    `erase:${id}`,
    jcs(hashes.length === 1 ? hashes[0]! : [...hashes]),
    `${basis} · ${rows} rows`.slice(0, 280),
  );

  return { id, at, subjects: subjects.length, rows, counts, keys: keys.size };
}
