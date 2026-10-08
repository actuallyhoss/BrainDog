/**
 * Erasing a person: `02 §10`'s cascade, one transaction, and one `erase` event that names the subject only as a hash.
 *
 * TOMBSTONE THE PAYLOAD, KEEP THE FACT. What goes is every value that names the subject: a row's fields, an event's
 * `from_v`/`to_v`/`note`, an arrival's body and headers, a decision's words, a suggestion's body, a prediction's claim,
 * a grant's label and hint, a device's label and user agent, a job's arguments and output, an invitation's address, a
 * saved view's name, search and filter, a rule run's variables, words and step answers, a token's label, an uninstalled
 * pack's kept settings, and a grant's row rule. Each becomes the literal
 * `--erased--`, so a reader can tell *removed* from *there was nothing* (`NULL`) and from *withheld at write*
 * (`--redacted--`). What stays is every row's existence, position, time, actor, kind, target and field name.
 *
 * DELETED OUTRIGHT, because a row of them is nothing but the subject: `observation` rows whose `subject` is the value,
 * the erased entries' `entry_fts`, `entry_vec` and `entity_key` lines, and the person's `member` rows. Pending `schedule` and
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

/**
 * A JSON column's text with every string or number inside it that names a subject turned into `--erased--`, its shape
 * and its keys kept, so the reader that parses it still can. Keys are field, variable and setting names, which a person
 * chose for the record and which name nobody. Text that is not JSON goes whole.
 */
function scrubbed(text: string, subjects: readonly string[]): string {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return ERASED;
  }
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    if ((typeof v === 'string' || typeof v === 'number') && names(String(v), subjects)) return ERASED;
    return v;
  };
  return JSON.stringify(walk(value));
}

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
    /* AND THE IDENTITIES THE ROW ANSWERED TO, which hold its addresses and logins (`entities.ts`). */
    sql.exec('DELETE FROM entity_key WHERE row_id = ?', row.id);
    erasedEntries.push(row.id);
  }
  bump('entry', erasedEntries.length);

  /* ── entity_key, entity_mention: any identity or bare name still saying who they were ──
     A key folded into a survivor that was not erased, or a name met with nothing that identified it, names the subject
     in a table no row holds. Matched on the text, as every other table here is. */
  let identities = 0;
  for (const { key } of sql.all<{ key: string }>('SELECT key FROM entity_key')) {
    if (!names(key, subjects)) continue;
    sql.exec('DELETE FROM entity_key WHERE key = ?', key);
    identities++;
  }
  for (const m of sql.all<{ name_key: string; kind: string; project: string; source: string; name: string }>('SELECT name_key, kind, project, source, name FROM entity_mention')) {
    if (!names(`${m.name} ${m.source}`, subjects)) continue;
    sql.exec('DELETE FROM entity_mention WHERE name_key = ? AND kind = ? AND project = ? AND source = ?', m.name_key, m.kind, m.project, m.source);
    identities++;
  }
  if (identities > 0) bump('entity_key', identities);
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
  /* `json` names the columns a reader parses, which keep their shape: each value inside that names the subject goes,
     and the column stays JSON, because a whole-column `--erased--` there would throw in the reader instead. */
  const tomb = (table: string, key: string, cols: readonly string[], json: readonly string[] = []): number => {
    let n = 0;
    for (const row of sql.all<Record<string, string | null>>(`SELECT ${key} AS k, ${cols.join(', ')} FROM ${table}`)) {
      const sets: [string, string][] = [];
      for (const c of cols) {
        const was = row[c];
        if (!names(was, subjects)) continue;
        const now = json.includes(c) ? scrubbed(was as string, subjects) : ERASED;
        if (now !== was) sets.push([c, now]);
      }
      if (sets.length === 0) continue;
      sql.exec(`UPDATE ${table} SET ${sets.map(([c]) => `${c} = ?`).join(', ')} WHERE ${key} = ?`, ...sets.map(([, v]) => v), row.k as string);
      n++;
    }
    bump(table, n);
    return n;
  };
  tomb('decision', 'id', ['question', 'answer', 'reason']);
  tomb('suggestion', 'id', ['body']);
  /* A CAUSE A FILER TYPED CAN CARRY A NAME (`call-mara-quill`), read with its separators as spaces. A decision's goes
     to the tombstone like its words (migration 31's trigger lets it); a question's is let go, since two open questions
     both tombstoned to one cause would break the index that holds one open question to a cause. */
  const causeNames = (cause: string | null): boolean => cause !== null && (names(cause, subjects) || names(cause.replace(/[-_.#:/@]+/gu, ' '), subjects));
  for (const [table, to] of [['decision', ERASED], ['suggestion', null]] as const)
    for (const r of sql.all<{ id: string; cause: string | null }>(`SELECT id, cause FROM ${table} WHERE cause IS NOT NULL AND cause <> ?`, ERASED))
      if (causeNames(r.cause)) sql.exec(`UPDATE ${table} SET cause = ? WHERE id = ?`, to, r.id);
  tomb('prediction', 'id', ['claim']);
  tomb('grant', 'id', ['label', 'hint']);
  tomb('device_grant', 'id', ['label', 'ua']);
  tomb('job', 'id', ['args', 'result', 'error']);
  /* `job_event` has no single key, so its rowid is the one. */
  tomb('job_event', 'rowid', ['body']);
  /* THE LAST SIX. An invitation is an address; a saved view keeps a name, a search and a filter somebody typed; a
     rule's run keeps its variables and what it said, and each step what it was answered; an agent token keeps the label
     its maker gave it; an uninstalled pack keeps the settings chosen for it for thirty days. An invitation whose
     address goes can no longer be accepted, since acceptance matches the address. */
  tomb('invitation', 'id', ['email']);
  tomb('view', 'rowid', ['name', 'search', 'filter'], ['filter']);
  tomb('automation_run', 'id', ['vars', 'say'], ['vars']);
  tomb('automation_step', 'rowid', ['answer']);
  tomb('token', 'id', ['label']);
  tomb('pack_removed', 'pack', ['settings'], ['settings']);

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
  let phones = 0;
  for (const person of personIds) {
    const held = sql.one<{ n: number }>('SELECT count(*) AS n FROM member WHERE person_id = ?', person)?.n ?? 0;
    sql.exec('DELETE FROM member WHERE person_id = ?', person);
    /* AND WHAT THEY ARRANGED FOR THEMSELVES, which names them by id and is nobody else's. */
    sql.exec('DELETE FROM pref WHERE person_id = ?', person);
    /* AND EVERY PHONE THAT ASKED TO BE TOLD ON THEIR BEHALF (`push_sub`, migration 14). The substring scan above never
       reaches it, because an endpoint is a push service's address and names nobody; kept, it was a live way to ring a
       person the record had just erased, measured by `push.test.ts` before this line. Counted, because a deleted row
       is a row the erasure touched. */
    const rung = sql.one<{ n: number }>('SELECT count(*) AS n FROM push_sub WHERE person_id = ?', person)?.n ?? 0;
    sql.exec('DELETE FROM push_sub WHERE person_id = ?', person);
    phones += Number(rung);
    members += Number(held);
    sql.exec('UPDATE person SET email = ?, name = ? WHERE id = ?', ERASED, ERASED, person);
    people++;
  }
  bump('person', people);
  bump('member', members);
  bump('push_sub', phones);
  /* AND ANOTHER MEMBER'S GRANT NARROWED BY A RULE THAT NAMES THEM (`member.row_where`, migration 19). Walked after the
     person's own rows are deleted, so none is counted twice. The whole rule goes, not the value inside it: a rule that
     is not JSON reaches no row (`members.ts`), which fails closed, where a rule matching `--erased--` would reach the
     very rows this erasure just tombstoned. */
  tomb('member', 'rowid', ['row_where']);

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
