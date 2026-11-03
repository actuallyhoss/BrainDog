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
 * `erase.r2` row and the host deletes it after the commit: a row's file field, a visual's page, and an attached file's
 * bytes and the page its words were kept in.
 *
 * A MATCH IS A CASE-INSENSITIVE SUBSTRING, which over-erases a longer word containing the subject. That is the right
 * direction to be wrong in for a legal request, and it is why a subject is three characters or more.
 */

import type { Sql } from '@braindog/ports';

import { jcs } from './declare.ts';
import { missedCause } from './fault.ts';
import { bumpEpoch, revokeShare } from './shares.ts';
import { project, projectedText } from './fts.ts';

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
  enqueue: (payload: { erase: string; key: string; page?: true }) => void;
  /** The pages of visuals whose text names a subject, by their SHA-256: the host read them before the transaction. */
  pages?: ReadonlySet<string>;
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

/** The page a visual's version line names, or `null` for any other line. */
function pageOf(field: string | null, toV: string | null): string | null {
  if (field === null || !field.startsWith('visual:') || toV === null) return null;
  try {
    const said = JSON.parse(toV) as { page?: unknown };
    return typeof said.page === 'string' && /^[0-9a-f]{64}$/.test(said.page) ? said.page : null;
  } catch {
    return null;
  }
}

/** The bytes and the words one attachment version line names, by hash, or `null` for any other line. */
function attachedBodyOf(toV: string | null): { sha256: string; bytes: number; text: { sha256: string; chars: number } | null } | null {
  if (toV === null) return null;
  try {
    const o = JSON.parse(toV) as { sha256?: unknown; bytes?: unknown; text?: { sha256?: unknown; chars?: unknown } };
    if (typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(o.sha256)) return null;
    const t = o.text;
    const text = t && typeof t.sha256 === 'string' && /^[0-9a-f]{64}$/.test(t.sha256) ? { sha256: t.sha256, chars: typeof t.chars === 'number' ? t.chars : 0 } : null;
    return { sha256: o.sha256, bytes: typeof o.bytes === 'number' ? o.bytes : 0, text };
  } catch {
    return null;
  }
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
  for (const row of sql.all<{ rowid: number; id: string; register: string; fields: string; deleted_at: string | null }>('SELECT rowid, id, register, fields, deleted_at FROM entry')) {
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
    /* ONLY WHAT NAMES THEM GOES, AND THE ENTRY STAYS (ruling 437): a payment whose note named her is still a payment, and
       the balance it is part of is still true. An entry whose title WAS their name leaves every read. A kept entry's
       search line is written again from what it still holds, so nothing erased stays findable. */
    const decl = JSON.parse(sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL', `register.${row.register}`)?.body ?? '{}') as {
      title?: string;
      fields?: Parameters<typeof projectedText>[0];
    };
    const gone = decl.title !== undefined && fields[decl.title] === ERASED;
    if (gone) sql.exec('UPDATE entry SET fields = ?, deleted_at = COALESCE(deleted_at, ?) WHERE id = ?', JSON.stringify(fields), at, row.id);
    else sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify(fields), row.id);
    project(
      sql,
      { rowid: row.rowid, id: row.id, register: row.register, deleted: gone || row.deleted_at !== null },
      projectedText(decl.fields ?? [], fields as Parameters<typeof projectedText>[1], decl.title),
    );
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

  /* ── share, share_group_member: what they were given, ended ──
     A guest holds the record through shares alone, so deleting their member rows below revoked nothing: every share to
     an erased person or to an erased address ends here, with whatever was shared onward from it, and an address waiting
     to be claimed goes to the tombstone. Before the event scrub, so the revocations' own events are scrubbed too. */
  const erasedPeople = new Set(personIds);
  let shares = 0;
  for (const sh of sql.all<{ id: string; who_kind: string; who: string }>("SELECT id, who_kind, who FROM share WHERE who_kind IN ('person', 'email')"))
    if (sh.who_kind === 'person' ? erasedPeople.has(sh.who) : names(sh.who, subjects)) shares += revokeShare({ sql, at, mint: deps.mint }, deps.actor, sh.id, 'erased').length;
  for (const sh of sql.all<{ id: string; who: string }>("SELECT id, who FROM share WHERE who_kind = 'email'"))
    if (names(sh.who, subjects)) sql.exec('UPDATE share SET who = ? WHERE id = ?', ERASED, sh.id);
  for (const person of personIds) {
    const n = sql.one<{ n: number }>('SELECT count(*) AS n FROM share_group_member WHERE person_id = ?', person)?.n ?? 0;
    sql.exec('DELETE FROM share_group_member WHERE person_id = ?', person);
    shares += Number(n);
  }
  if (shares > 0) bumpEpoch(sql);
  bump('share', shares);

  /* ── event: the payload of every event that names the subject or is about a row that was erased ── */
  const about = new Set(erasedEntries.map((e) => `entry:${e}`));
  /* AN ATTACHMENT'S BYTES AND ITS WORDS ARE KEPT OUTSIDE THE FILE TOO (`attachment.ts`), and its lines name them by hash.
     Read before the scrub below tombstones those lines, or the hashes would be lost with the names. One goes whole, every
     version, when any line of it names a subject (its name, its note), when its words do (the host read them, as it
     reads a visual's page), or when it is on a row erased above. Its bytes and its words are queued to go, and every
     other line that names those bytes is tombstoned with it, so nothing is left pointing at a file that is gone. */
  const attachedFiles = new Map<string, number>();
  const attachedPages = new Map<string, number>();
  {
    const groups = new Map<string, { target: string; lines: { to_v: string | null; note: string | null }[] }>();
    for (const l of sql.all<{ target: string | null; field: string; to_v: string | null; note: string | null }>(
      "SELECT target, field, to_v, note FROM event WHERE kind = 'note' AND field GLOB 'attached:*' ORDER BY rowid",
    )) {
      if (l.target === null) continue;
      const key = `${l.target}\u0000${l.field}`;
      const g = groups.get(key) ?? { target: l.target, lines: [] };
      g.lines.push({ to_v: l.to_v, note: l.note });
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const bodies = g.lines.map((l) => attachedBodyOf(l.to_v)).filter((b) => b !== null);
      const hit =
        about.has(g.target) ||
        /* A FILE NAME IS WRITTEN WITH ITS WORDS RUN TOGETHER (`mara-quill-contract.pdf`), so it is read with its
           separators as spaces too, as a cause is below. */
        g.lines.some((l) => names(l.to_v, subjects) || names(l.note, subjects) || names(l.to_v?.replace(/[-_.]+/gu, ' '), subjects)) ||
        bodies.some((b) => b.text !== null && (deps.pages?.has(b.text.sha256) ?? false));
      if (!hit) continue;
      for (const b of bodies) {
        attachedFiles.set(b.sha256, b.bytes);
        if (b.text !== null) attachedPages.set(b.text.sha256, b.text.chars);
      }
      bump('attachment', 1);
    }
  }
  const namesErasedFile = (field: string | null, toV: string | null): boolean => {
    if (field === null || !field.startsWith('attached:') || toV === null || (attachedFiles.size === 0 && attachedPages.size === 0)) return false;
    const b = attachedBodyOf(toV);
    return b !== null && (attachedFiles.has(b.sha256) || (b.text !== null && attachedPages.has(b.text.sha256)));
  };
  /* A VISUAL'S PAGE IS TEXT KEPT OUTSIDE THE FILE, which the scan of columns never reads. One the host found naming a
     subject has its version line tombstoned here, so it is never served again, and its bytes deleted after the commit. */
  const pagesErased = new Set<string>();
  let events = 0;
  for (const ev of sql.all<{ id: string; target: string | null; field: string | null; from_v: string | null; to_v: string | null; note: string | null }>(
    'SELECT id, target, field, from_v, to_v, note FROM event',
  )) {
    const page = pageOf(ev.field, ev.to_v);
    const pageHit = page !== null && (deps.pages?.has(page) ?? false);
    if (pageHit) pagesErased.add(page);
    const hit = pageHit || namesErasedFile(ev.field, ev.to_v) || (ev.target !== null && about.has(ev.target)) || names(ev.field, subjects) || names(ev.from_v, subjects) || names(ev.to_v, subjects) || names(ev.note, subjects);
    if (!hit) continue;
    sql.exec(
      'UPDATE event SET field = CASE WHEN field IS NULL OR NOT ? THEN field ELSE ? END, from_v = CASE WHEN from_v IS NULL THEN NULL ELSE ? END, to_v = CASE WHEN to_v IS NULL THEN NULL ELSE ? END, note = CASE WHEN note IS NULL THEN NULL ELSE ? END WHERE id = ?',
      names(ev.field, subjects) ? 1 : 0,
      ERASED,
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
    .all<{ id: string; headers: string | null; body: string | null; reason: string | null }>('SELECT id, headers, body, reason FROM inbox_raw')
    .filter((r) => names(r.headers, subjects) || names(r.body, subjects) || names(r.reason, subjects))
    .map((r) => r.id);
  for (const raw of raws) {
    /* THE REASON TOO: a held arrival's says which row it resembled, by that row's title. */
    sql.exec("UPDATE inbox_raw SET headers = ?, body = ?, reason = CASE WHEN reason IS NULL THEN NULL ELSE ? END, state = 'erased' WHERE id = ?", ERASED, ERASED, ERASED, raw);
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
  /* A QUESTION PUT OFF KEEPS THE WORDS SAID WHY, which name whoever it waits on. */
  tomb('suggestion', 'id', ['body', 'defer_why']);
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
  /* A job's machine and profile are names a person may be in (`adas-mbp`, `~/.claude-ada`), as a machine's label is. */
  tomb('job_place', 'job_id', ['machine', 'seat', 'ran_on']);
  /* THE LAST SIX. An invitation is an address; a saved view keeps a name, a search and a filter somebody typed; a
     rule's run keeps its variables and what it said, and each step what it was answered; an agent token keeps the label
     its maker gave it; an uninstalled pack keeps the settings chosen for it for thirty days. An invitation whose
     address goes can no longer be accepted, since acceptance matches the address. */
  tomb('invitation', 'id', ['email']);
  tomb('view', 'rowid', ['name', 'search', 'filter'], ['filter']);
  /* A RULE'S RUN STILL TO FINISH THAT WAS HANDED THE SUBJECT IS STOPPED, before its words go. Its trigger is what a
     later step fills its templates from, so a run waiting out an hour wrote the erased name back into the activity
     after the erasure said it was gone. */
  for (const r of sql.all<{ id: string; trigger: string; vars: string }>("SELECT id, trigger, vars FROM automation_run WHERE state IN ('pending', 'running', 'waiting')"))
    if (names(r.trigger, subjects) || names(r.vars, subjects)) sql.exec("UPDATE automation_run SET state = 'cancelled', finished_at = ? WHERE id = ?", at, r.id);
  tomb('automation_run', 'id', ['trigger', 'vars', 'say'], ['trigger', 'vars']);
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
    /* AND THE SAME SUBJECT COUNTED PER PERSON (migration 47): the same value, so it goes with them. */
    sql.exec('DELETE FROM observation_who WHERE lower(subject) = ?', s);
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
    /* AND WHAT THEY OPENED, counted as theirs (`observation_who`, migration 47). */
    sql.exec('DELETE FROM observation_who WHERE who = ?', person);
    /* AND EVERY PHONE THAT ASKED TO BE TOLD ON THEIR BEHALF (`push_sub`, migration 14). The substring scan above never
       reaches it, because an endpoint is a push service's address and names nobody; kept, it was a live way to ring a
       person the record had just erased, measured by `push.test.ts` before this line. Counted, because a deleted row
       is a row the erasure touched. */
    const rung = sql.one<{ n: number }>('SELECT count(*) AS n FROM push_sub WHERE person_id = ?', person)?.n ?? 0;
    sql.exec('DELETE FROM push_sub WHERE person_id = ?', person);
    /* AND HEALTH'S LINE THAT THEY MISSED A MAIL, which says their name (RM9). */
    sql.exec('DELETE FROM fault WHERE cause = ?', missedCause(person));
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
  for (const key of attachedFiles.keys()) keys.add(key);
  for (const key of attachedPages.keys()) pagesErased.add(key);
  for (const key of keys) deps.enqueue({ erase: id, key });
  for (const key of pagesErased) deps.enqueue({ erase: id, key, page: true });
  if (pagesErased.size > 0) bump('visual_page', pagesErased.size);
  /* AND THE WEIGHT THEY WERE COUNTED AT GOES WITH THEM (`attachment-bytes`), so the room an erasure frees is room again. */
  const freed = [...attachedFiles.values(), ...attachedPages.values()].reduce((a, b) => a + b, 0);
  if (freed > 0) sql.exec("UPDATE counter SET next = max(0, next - ?) WHERE name = 'attachment-bytes'", freed);

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
