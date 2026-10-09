/**
 * The nightly walk for a key written in plain text (AGT-D01): `keys-in-text`, target nought.
 *
 * THE WRITE PATH CHECKS A VALUE ONLY AS IT IS WRITTEN (`coerce`), so nothing looked at what a record already held: a
 * row written before a shape was added to the check, a note, a question's body, a step a run left. This walk reads
 * every text a row, a note on a row, or a question holds, 500 a night, by a cursor the record keeps in `dog_meta`
 * (no migration), and counts what holds a key. A run's handoff is a field of its row, so the rows cover it.
 *
 * ONE CHECK, THE WRITE PATH'S. A value is asked of `coerce` as a `json` field, whose one refusal is `holdsKey`: every
 * string in it, an object's names included, through `looksLikeCredential` and its `KEY_SHAPES`. There is no second
 * pattern list here, so a shape added there is looked for here the next night.
 *
 * A FINDING NEVER HOLDS WHAT IT FOUND. It is where: the list's name and the row's number, a note on one, or a
 * question's number, so a person can open it and move the key to the vault. The figure's `why` says the first.
 *
 * THE COUNT IS ROLLING. A finding stays until its place is walked again and holds no key, and a pass that ends drops
 * what it did not see (a row deleted since). Before the first pass ends and with nothing found, the figure holds
 * nothing, never nought: a record not yet read is not a record with no key in it.
 */

import type { Result, Sql } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { coerce, type FieldDecl } from './coerce.ts';
import type { MetricDecl, Reading } from './metrics.ts';

/** The `dog_meta` row the walk keeps its cursor and its findings in. */
export const KEY_SCAN_META = 'key-scan';

/** How many texts a night reads. */
export const KEY_SCAN_NIGHT = 500;

/** The source word of `keys-in-text`, read by `readKeysInText`. */
export const RECORD_KEY_SCAN = 'record.key-scan';

/** Keys written in plain text, found by the nightly walk. */
export const KEYS_IN_TEXT: MetricDecl = {
  metric: 'keys-in-text',
  name: 'Keys written in plain text',
  source: RECORD_KEY_SCAN,
  value: { count: 'id' },
  target: { lte: 0 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

/** Where a text was: a row (its handoff included), a note on a row, or a question. In walking order. */
export type KeyPlace = 'row' | 'note' | 'question';
const ORDER: readonly KeyPlace[] = ['row', 'note', 'question'];

/** A place that holds a key: what a person needs to open it, and never the text. */
export type KeyFinding = { in: KeyPlace; list: string | null; number: number | null };

/** A finding as kept: its place's rowid, so the next pass can clear it, and the pass that last saw it. */
type Kept = KeyFinding & { at: number; pass: number };

/** The walk's state, one JSON value in `dog_meta`. */
type ScanState = { in: KeyPlace; after: number; pass: number; passes: number; finished_at: string | null; findings: Kept[] };

const FRESH: ScanState = { in: 'row', after: 0, pass: 1, passes: 0, finished_at: null, findings: [] };

/** The probe: a `json` field's only refusal in `coerce` is the key check. */
const PROBE: FieldDecl = { id: 'text', type: 'json' };
const holdsKey = (value: unknown): boolean => !coerce(PROBE, value).ok;

/** A stored JSON text as its value, or the text itself when it does not parse, so a broken one is still read. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readState(sql: Sql): ScanState {
  const raw = sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', KEY_SCAN_META)?.value;
  if (raw === undefined) return { ...FRESH, findings: [] };
  const s = parsed(raw) as Partial<ScanState> | null;
  if (s === null || typeof s !== 'object' || !ORDER.includes(s.in as KeyPlace)) return { ...FRESH, findings: [] };
  return {
    in: s.in as KeyPlace,
    after: Number(s.after) || 0,
    pass: Number(s.pass) || 1,
    passes: Number(s.passes) || 0,
    finished_at: typeof s.finished_at === 'string' ? s.finished_at : null,
    findings: Array.isArray(s.findings) ? s.findings : [],
  };
}

function writeState(sql: Sql, s: ScanState): void {
  sql.exec(
    'INSERT INTO dog_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    KEY_SCAN_META,
    JSON.stringify(s),
  );
}

/** One text to read: its place's rowid, the row it belongs to, and the stored text. */
type Text = { at: number; register: string | null; seq: number | null; text: string | null };

/**
 * The next texts of one place after a rowid, in rowid order. A note names the row it is on, and a question its own
 * number (`SG23` is 23). A deleted row is not read: nobody can open it to move the key.
 */
function textsOf(sql: Sql, place: KeyPlace, after: number, limit: number): Text[] {
  if (place === 'row')
    return sql.all<Text>(
      'SELECT rowid AS at, register, seq, fields AS text FROM entry WHERE rowid > ? AND deleted_at IS NULL ORDER BY rowid LIMIT ?',
      after,
      limit,
    );
  if (place === 'note')
    return sql.all<Text>(
      `SELECT ev.rowid AS at, n.register AS register, n.seq AS seq, ev.note AS text FROM event ev
         LEFT JOIN entry n ON substr(ev.target, 1, 6) = 'entry:' AND n.id = substr(ev.target, 7)
         WHERE ev.kind = 'note' AND ev.rowid > ? ORDER BY ev.rowid LIMIT ?`,
      after,
      limit,
    );
  return sql.all<Text>(
    "SELECT rowid AS at, NULL AS register, CAST(substr(id, 3) AS INTEGER) AS seq, body AS text FROM suggestion WHERE rowid > ? ORDER BY rowid LIMIT ?",
    after,
    limit,
  );
}

/** What a person calls a list: its declared name, or its id with `_` as a space. */
function listName(sql: Sql, register: string, names: Map<string, string>): string {
  const known = names.get(register);
  if (known !== undefined) return known;
  const body = sql.one<{ name: unknown }>(
    "SELECT json_extract(body, '$.name') AS name FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND json_valid(body) AND json_extract(body, '$.id') = ?",
    register,
  );
  const words = register.replace(/_/g, ' ');
  const name = typeof body?.name === 'string' && body.name.trim() !== '' ? body.name.trim() : words.charAt(0).toUpperCase() + words.slice(1);
  names.set(register, name);
  return name;
}

/** What one night did: how many texts it read, how many places hold a key now, and whether a pass ended. */
export type KeyScan = { read: number; found: number; finished: boolean };

/**
 * One night's walk: up to `budget` texts from the cursor on, rows first, then notes, then questions. A pass that
 * reaches the end of the questions ends there for the night, so the next night starts a fresh pass at the first row.
 */
export function scanKeys(sql: Sql, nowMs: number, budget = KEY_SCAN_NIGHT): KeyScan {
  const s = readState(sql);
  const names = new Map<string, string>();
  let left = budget;
  let read = 0;
  let finished = false;
  while (left > 0) {
    const texts = textsOf(sql, s.in, s.after, left);
    for (const t of texts) {
      s.after = t.at;
      left--;
      read++;
      s.findings = s.findings.filter((f) => !(f.in === s.in && f.at === t.at));
      if (t.text === null || !holdsKey(s.in === 'note' ? t.text : parsed(t.text))) continue;
      const list = s.in === 'question' ? null : t.register === null ? null : listName(sql, t.register, names);
      s.findings.push({ in: s.in, list, number: t.seq === null ? null : Number(t.seq), at: t.at, pass: s.pass });
    }
    if (left > 0) {
      const next = ORDER.indexOf(s.in) + 1;
      if (next < ORDER.length) {
        s.in = ORDER[next]!;
        s.after = 0;
        continue;
      }
      /* THE PASS ENDS: what it did not see again is gone from the record, so it is gone from the count. */
      s.findings = s.findings.filter((f) => f.pass === s.pass);
      s.passes++;
      s.pass++;
      s.finished_at = new Date(nowMs).toISOString();
      s.in = 'row';
      s.after = 0;
      finished = true;
      break;
    }
  }
  writeState(sql, s);
  return { read, found: s.findings.length, finished };
}

/** The places that hold a key now, in walking order, or `null` while the first pass runs and has found nothing. */
export function keysInText(sql: Sql): KeyFinding[] | null {
  const s = readState(sql);
  if (s.passes === 0 && s.findings.length === 0) return null;
  return [...s.findings].sort((a, b) => ORDER.indexOf(a.in) - ORDER.indexOf(b.in) || a.at - b.at).map(({ in: place, list, number }) => ({ in: place, list, number }));
}

/** Where a finding is, in words a person reads, and never what it holds: "an entry", never "a row" (audit 43-44 #4). */
export function placeOf(f: KeyFinding): string {
  const entry = f.list === null ? 'an entry' : f.number === null ? `an entry of ${f.list}` : `${f.list} number ${f.number}`;
  if (f.in === 'question') return f.number === null ? 'a question' : `question ${f.number}`;
  return f.in === 'note' ? (f.list === null ? 'a note' : `a note on ${entry}`) : entry;
}

/** `keys-in-text`: how many places hold a key, by the last walk. Nothing, never nought, before the first pass ends. */
export function readKeysInText(sql: Sql, _ctx: unknown, decl: MetricDecl): Result<Reading> {
  const found = keysInText(sql);
  const value = found === null ? null : found.length;
  const why =
    found === null
      ? 'the first walk over this record has not finished'
      : found.length === 0
        ? 'no text on this record holds a key'
        : `${found.length === 1 ? 'one place holds' : `${found.length} places hold`} what looks like a key, the first in ${placeOf(found[0]!)}`;
  const t = decl.target;
  const met = value === null || t === undefined ? null : 'lte' in t ? value <= t.lte : value >= t.gte;
  return ok({ value, unit: null, rows: value ?? 0, held: value === null ? 0 : 1, delta: null, why, met, refusals: [] });
}
