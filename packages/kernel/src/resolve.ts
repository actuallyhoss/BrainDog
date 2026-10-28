/**
 * The other pairs: what the record may hold twice that is not a person, and a name it has seen with
 * nothing that identifies it beside the one row that name reads as.
 *
 * TWO KINDS OF PAIR, AND BOTH REST ON A NAME. Two live rows of ONE list, organisations or projects, whose names agree:
 * the same name once it is read as a `name:` key is (`how: 'name'`), or the same once spaces, hyphens and, for an
 * organisation, its company form are dropped (`how: 'near'`: `Lanternfish Ltd` beside `Lanternfish`, `North Bank`
 * beside `Northbank`). And a name kept in `entity_mention` that no live row is called, beside the ONE row of its kind it
 * reads as (`how: 'seen'`). Every sighting of that name, however it was spelled, is the one pair, so a name seen thirty
 * times is settled once.
 *
 * A NAME PROPOSES AND NEVER DECIDES (`identity-keys.ts`'s `WEAK_KINDS`). So nothing here folds, asks or writes: a pair
 * is something for a caller to show or to put to a model, ranked, with one sentence saying why. A strong key decides
 * the other way: two rows that each hold a key of one kind and share none (two sites, two repositories) are two things
 * of one name, and are not a pair at all.
 *
 * ONE LIST AT A TIME. A project called Northbank and the organisation called Northbank are two things by construction,
 * and a name seen as a project's is read beside projects only. A kind no list holds (a thing, today) has no row to sit
 * beside, and pairs with nothing.
 *
 * SETTLED ONCE. A pair is left out when a question names it (both rows as the record speaks them, as the pairs of two
 * persons are found again, or the pair's own `hash` under `pair` in a question's body), when a fold of the two was
 * undone, and when a nightly job that was answered spoke about it. The hash of two rows is the one a nightly job
 * already names a pair by, so a pair shown under either reader is the same pair.
 *
 * A MODEL WEEDS, AND NEVER DECIDES. A nightly job that was answered keeps each verdict in its band
 * (`people.ts` `answeredOnly`): a pair read as two things, or under the low band, is settled and left out; one in the
 * top band is kept with `judged`, its score, and ranks first; one between is offered as if no model had spoken. A job
 * answered before verdicts were kept says no band, and every pair it spoke about is settled, as before. Nothing is
 * folded or asked on a verdict here either: the offer still waits on his press.
 *
 * PURE OVER THE TABLES AS THEY ARE. No column, no table and no write: the lists are read from the live declarations, as
 * a figure reads them, and every read is bounded, so the nightly slice costs the same on a record of any size.
 */

import type { Sql } from '@braindog/ports';

import type { AboutKind } from './about.ts';
import { entityLists, mentionKindOf, mergeFieldOf, nameKey, rowKeys, type EntityDecl, type EntityList } from './entities.ts';
import { isWeakKey, kindOfKey, valueOfKey } from './identity-keys.ts';

/** The most pairs one read answers, whatever it is asked for: the nightly slice. */
export const PAIRS_MOST = 50;
/** How many rows of one list, and how many sightings of one kind, one read looks at: the newest. */
const ROWS_READ = 2000;
/** How many rows of one name are compared with each other: forty rows all called Web are not 780 questions. */
const BUCKET_MOST = 12;
/** How many candidates are checked against what was already settled before the read stops looking. */
const CHECKED_MOST = 400;
/** How long a sighting counts as fresh. */
const FRESH_MS = 30 * 86_400_000;

/** One side of a pair as anybody may read it: a handle and a name, and never an id. */
export type PairSide = { h: string; name: string };

/** How the two agree: the same name, a name that is the same once its form is dropped, or a name seen beside a row. */
export type PairHow = 'name' | 'near' | 'seen';

/**
 * A pair. `a` is the row that would be kept, the older of two, and `b` the other row or the name seen. `seen` is in how
 * many places the name was seen, nought for two rows. `shared` is what the two both list, when they list one, and `tie`
 * the name of a project both are tied to.
 */
export type Pair = {
  hash: string;
  kind: AboutKind;
  a: PairSide;
  b: PairSide;
  how: PairHow;
  score: number;
  seen: number;
  shared?: 'repository' | 'site' | 'folder' | 'key';
  tie?: string;
  /** A model's score for the two being one, when an answered nightly job read them in the top band. */
  judged?: number;
};

/** The band a model's verdict on a pair fell in: read as two, in doubt, or as one (`people.ts` `bandOf`). */
export type JudgedBand = 'two' | 'doubt' | 'one';

/** What an answered nightly job keeps of its verdict on one pair: the band, and the score it was said with. */
export type Judged = { band: JudgedBand; score: number };

/** What a handle stands for, kept by the caller and never shown: a row, or the spellings of a name that was seen. */
export type PairRow = { register: string; id?: string; names?: string[] };

/** Tonight's pairs, best first, and what each handle in them stands for. */
export type Pairs = { pairs: Pair[]; rows: Record<string, PairRow> };

const KIND: Readonly<Record<EntityList['role'], AboutKind>> = { meets: 'person', org: 'org', project: 'project' };
const SHARED_WORD: Readonly<Record<string, NonNullable<Pair['shared']>>> = { remote: 'repository', domain: 'site', folder: 'folder' };

/** The words that say what form a company takes, which two spellings of one company differ by. */
const FORMS = new Set([
  'ltd', 'limited', 'inc', 'incorporated', 'llc', 'llp', 'plc', 'gmbh', 'corp', 'corporation', 'co', 'company', 'sarl', 'srl', 'bv', 'pty',
]);

const ADDRESS = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u;
/** A row's id, as the record mints one. */
const ROW_ID = /(?<![0-9A-Za-z])[0-9A-HJKMNP-TV-Z]{26}(?![0-9A-Za-z])/i;

const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);

/** A name as it may be shown, or `null` for one that is an address, an id or nothing. */
function shown(name: string): string | null {
  const out = name.replace(/\s+/g, ' ').trim();
  return out === '' || ADDRESS.test(out) || ROW_ID.test(out) ? null : out.slice(0, 80);
}

/** A stable name for a pair, the same whichever way round: FNV-1a over the two, sorted, as a nightly job names one. */
function hashOf(a: string, b: string): string {
  const text = [a, b].sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * A name as two near spellings of it share it: its company form dropped from the end, for an organisation, then run
 * together. A name too short to say anything once run together is only ever itself.
 */
function looseOf(role: EntityList['role'], words: string): string {
  const parts = words.split(' ').filter((w) => w !== '');
  if (role === 'org') while (parts.length > 1 && FORMS.has(parts.at(-1)!)) parts.pop();
  const run = parts.join('').replace(/['-]/g, '');
  return run.length >= 3 ? run : `=${words}`;
}

type Row = { id: string; seq: number | null; fields: Record<string, unknown>; name: string; exact: Set<string>; loose: Set<string> };
type Read = { list: EntityList; prefix: string | null; rows: Row[]; buckets: Map<string, Row[]>; exact: Set<string> };

const parsed = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The names a row answers to, each as a `name:` key reads one. */
function namesOf(list: EntityList, fields: Record<string, unknown>): string[] {
  if (list.role === 'project') return rowKeys(list, fields).filter(isWeakKey).map(valueOfKey);
  const at = list.fields as { name: string; aliases?: string };
  const said = [textOf(fields[at.name]), ...(at.aliases === undefined ? [] : listOf(fields[at.aliases]))];
  return said.map(nameKey).filter((k) => k !== '');
}

/** One list's live rows that are folded into nothing, the newest `ROWS_READ`, said oldest first and filed by name. */
function readList(sql: Pick<Sql, 'all'>, list: EntityList, prefix: string | null): Read {
  const merged = mergeFieldOf(list);
  const title = (list.fields as { name?: string }).name;
  const rows: Row[] = [];
  const found = sql.all<{ id: string; seq: number | null; fields: string }>(
    'SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq DESC, id LIMIT ?',
    list.register,
    ROWS_READ,
  );
  for (const r of found.reverse()) {
    const fields = parsed(r.fields);
    if (merged !== undefined && textOf(fields[merged]) !== '') continue;
    const name = title === undefined ? null : shown(textOf(fields[title]));
    const exact = new Set(namesOf(list, fields));
    if (name === null || exact.size === 0) continue;
    rows.push({ id: r.id, seq: r.seq, fields, name, exact, loose: new Set([...exact].map((w) => looseOf(list.role, w))) });
  }
  const buckets = new Map<string, Row[]>();
  for (const row of rows) for (const key of row.loose) buckets.set(key, [...(buckets.get(key) ?? []), row]);
  return { list, prefix, rows, buckets, exact: new Set(rows.flatMap((r) => [...r.exact])) };
}

/** The strong keys a row holds: what its fields carry, and for a row that holds keys alone, what `entity_key` kept for it. */
function strongKeys(sql: Pick<Sql, 'all'>, list: EntityList, row: Row): string[] {
  const held = list.role === 'project' ? [] : sql.all<{ key: string }>('SELECT key FROM entity_key WHERE row_id = ? AND register = ?', row.id, list.register).map((k) => k.key);
  return [...new Set([...rowKeys(list, row.fields), ...held])].filter((k) => !isWeakKey(k));
}

/**
 * Whether two rows' strong keys disagree, and what they both list when they agree. THEY DISAGREE when each holds a key
 * of one kind and they share none of that kind. A folder is left out of that: one project is checked out in two places.
 */
function compare(sql: Pick<Sql, 'all'>, list: EntityList, a: Row, b: Row): { conflict: boolean; shared?: NonNullable<Pair['shared']> } {
  const [x, y] = [strongKeys(sql, list, a), new Set(strongKeys(sql, list, b))];
  const both = x.filter((k) => y.has(k));
  const kinds = new Set(x.map(kindOfKey).filter((kind) => kind !== 'folder'));
  for (const kind of kinds)
    if ([...y].some((k) => kindOfKey(k) === kind) && !both.some((k) => kindOfKey(k) === kind)) return { conflict: true };
  /* A REPOSITORY OR A SITE IS SAID BEFORE A FOLDER: it is the stronger thing to share. */
  const first = both.find((k) => kindOfKey(k) !== 'folder') ?? both[0];
  return first === undefined ? { conflict: false } : { conflict: false, shared: SHARED_WORD[kindOfKey(first)] ?? 'key' };
}

/**
 * What was already settled, read once: the pairs a nightly job was answered about or a question names, and of the pairs
 * a job read in the top band, the score it said.
 */
type Settled = { hashes: Set<string>; asked: Map<string, Set<unknown>[]>; judged: Map<string, number> };

/** A kept verdict as it may be read, or `null` for none: an older job's, or one nobody can read. */
function judgedOf(v: unknown): Judged | null {
  if (typeof v !== 'object' || v === null) return null;
  const { band, score } = v as { band?: unknown; score?: unknown };
  if ((band !== 'two' && band !== 'doubt' && band !== 'one') || typeof score !== 'number' || !Number.isFinite(score)) return null;
  return { band, score };
}

function settledIn(sql: Pick<Sql, 'all'>): Settled {
  const hashes = new Set<string>();
  const judged = new Map<string, number>();
  /* ONLY A JOB THAT WAS ANSWERED COUNTS, as `resolveJob` reads them: its payload is cut to the pairs its answer spoke
     about. A pair read as one or in doubt is not settled by it; anything else it spoke about is. */
  for (const { payload } of sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.resolve' AND state = 'done'"))
  {
    const job = parsed(payload);
    const kept = typeof job.judged === 'object' && job.judged !== null ? (job.judged as Record<string, unknown>) : {};
    if (typeof job.rows !== 'object' || job.rows === null) continue;
    for (const hash of Object.keys(job.rows)) {
      const said = judgedOf(kept[hash]);
      if (said?.band === 'one') judged.set(hash, Math.max(said.score, judged.get(hash) ?? 0));
      else if (said?.band !== 'doubt') hashes.add(hash);
    }
  }
  /* TWO JOBS THAT DISAGREE ARE SETTLED BY THE ONE THAT SAID TWO: nothing a model said twice over is offered on its word. */
  for (const hash of hashes) judged.delete(hash);
  const asked = new Map<string, Set<unknown>[]>();
  for (const { body } of sql.all<{ body: string }>("SELECT body FROM suggestion WHERE body_kind = 'rowset'")) {
    const b = parsed(body) as { register?: unknown; pair?: unknown; rows?: unknown };
    if (typeof b.pair === 'string') hashes.add(b.pair);
    if (typeof b.register !== 'string' || !Array.isArray(b.rows)) continue;
    const named = new Set<unknown>();
    for (const r of b.rows as { at?: unknown; patch?: unknown }[]) {
      named.add(r?.at);
      if (typeof r?.patch === 'object' && r.patch !== null) for (const v of Object.values(r.patch)) named.add(v);
    }
    asked.set(b.register, [...(asked.get(b.register) ?? []), named]);
  }
  return { hashes, asked, judged };
}

/** A row as a question's body names it: its list's prefix and its number. */
const spoken = (read: Read, row: Row): string =>
  row.seq === null ? row.id : read.prefix === null ? `${read.list.register}#${row.seq}` : `${read.prefix}${row.seq}`;

/** Whether a question names both rows, answered or not. */
function asked(settled: Settled, read: Read, a: Row, b: Row): boolean {
  const [x, y] = [spoken(read, a), spoken(read, b)];
  return (settled.asked.get(read.list.register) ?? []).some((named) => named.has(x) && named.has(y));
}

/** Whether the two were folded and the fold undone: a `merged_into` that went from one of them back to nothing. */
function undone(sql: Pick<Sql, 'one'>, read: Read, a: Row, b: Row): boolean {
  const merged = mergeFieldOf(read.list);
  if (merged === undefined) return false;
  return sql.one<{ n: number }>(
    `SELECT 1 AS n FROM event WHERE kind = 'edit' AND field = ? AND to_v IS NULL
       AND ((target = ? AND instr(from_v, ?) > 0) OR (target = ? AND instr(from_v, ?) > 0)) LIMIT 1`,
    merged,
    `entry:${a.id}`,
    b.id,
    `entry:${b.id}`,
    a.id,
  ) !== undefined;
}

/** A pair before it is checked: who it is between, how they agree, and what it is ranked by. */
type Found = { read: Read; a: Row; b: Row | { name: string; names: string[]; seen: number }; how: PairHow; hash: string; score: number; judged?: number };

const isRow = (b: Found['b']): b is Row => 'id' in b;

/** Every two rows of one list that share a name, each pair once, the older row first. */
function rowPairs(read: Read): Found[] {
  const out = new Map<string, Found>();
  for (const held of read.buckets.values()) {
    const rows = held.slice(0, BUCKET_MOST);
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) {
        const [a, b] = [rows[i]!, rows[j]!];
        const hash = hashOf(a.id, b.id);
        if (a === b || out.has(hash)) continue;
        const same = [...a.exact].some((k) => b.exact.has(k));
        out.set(hash, { read, a, b, how: same ? 'name' : 'near', hash, score: same ? 0.6 : 0.45 });
      }
  }
  return [...out.values()];
}

/**
 * Every name seen that no live row is called, beside the one row it reads as. A name two rows read as is left: those
 * two are a pair of their own, and the name waits on them.
 */
function seenPairs(sql: Pick<Sql, 'all'>, read: Read, nowMs: number): Found[] {
  const lines = sql.all<{ name_key: string; name: string; source: string; at: string }>(
    'SELECT name_key, name, source, at FROM entity_mention WHERE kind = ? ORDER BY at DESC, source LIMIT ?',
    mentionKindOf(read.list.role),
    ROWS_READ,
  );
  const groups = new Map<string, { name: string; names: Set<string>; sources: Set<string>; at: string }>();
  for (const line of lines) {
    const name = shown(line.name);
    if (name === null || read.exact.has(line.name_key)) continue;
    const key = looseOf(read.list.role, line.name_key);
    const group = groups.get(key) ?? { name, names: new Set<string>(), sources: new Set<string>(), at: line.at };
    group.names.add(line.name_key);
    group.sources.add(line.source);
    groups.set(key, group);
  }
  const out: Found[] = [];
  for (const [key, group] of groups) {
    const rows = read.buckets.get(key) ?? [];
    if (rows.length !== 1) continue;
    const seen = group.sources.size;
    const fresh = nowMs - Date.parse(group.at) <= FRESH_MS;
    out.push({
      read,
      a: rows[0]!,
      b: { name: group.name, names: [...group.names].sort(), seen },
      how: 'seen',
      hash: hashOf(rows[0]!.id, `${mentionKindOf(read.list.role)}:${key}`),
      score: 0.3 + 0.05 * Math.min(seen, 5) + (fresh ? 0.05 : 0),
    });
  }
  return out;
}

/** The name of a project both rows are tied to, when their list ties a row to projects and they share one. */
function tieOf(reads: readonly Read[], read: Read, a: Row, b: Row): string | undefined {
  const field = (read.list.fields as { projects?: string }).projects;
  const projects = reads.find((r) => r.list.role === 'project');
  if (field === undefined || projects === undefined) return undefined;
  const theirs = new Set(listOf(b.fields[field]));
  const both = listOf(a.fields[field]).find((id) => theirs.has(id));
  return both === undefined ? undefined : projects.rows.find((r) => r.id === both)?.name;
}

/* A PAIR A MODEL READ AS ONE RANKS FIRST, the surer before the less sure, and then every pair by its own score. */
const order = (x: Found, y: Found): number =>
  (y.judged ?? -1) - (x.judged ?? -1) ||
  y.score - x.score || (x.a.seq ?? Infinity) - (y.a.seq ?? Infinity) || (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0);

/**
 * Tonight's pairs, best first: at most `limit` of them and never more than `PAIRS_MOST`. Two organisations or two
 * projects of one name, and each name seen beside the one row it reads as. A pair whose strong keys disagree, a deleted
 * or folded row, and a pair already settled are not among them. `nowMs` is the instant it is read at: a name seen in
 * the last thirty days ranks above one seen before, and a pair a nightly model read as one is first of all, with
 * `judged`.
 *
 * READS ONLY. Nothing is asked, folded or kept: what is done with a pair is its caller's.
 */
export function pairsFor(sql: Pick<Sql, 'all' | 'one'>, nowMs: number, limit: number = PAIRS_MOST): Pairs {
  /* A LIMIT THAT IS NO NUMBER IS THE WHOLE SLICE AND NEVER MORE: nothing compares with it, so it would bound nothing. */
  const most = Number.isNaN(limit) ? PAIRS_MOST : Math.max(0, Math.min(Math.floor(limit), PAIRS_MOST));
  const out: Pairs = { pairs: [], rows: {} };
  if (most === 0) return out;
  type Body = EntityDecl & { seq_prefix?: unknown };
  const bodies = sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)")
    .map((r) => parsed(r.body) as unknown as Body)
    .filter((b) => typeof b.id === 'string');
  const reads = entityLists(bodies).map((list) => {
    const prefix = bodies.find((b) => b.id === list.register)?.seq_prefix;
    return readList(sql, list, typeof prefix === 'string' && prefix !== '' && prefix !== '#' ? prefix : null);
  });
  if (reads.length === 0) return out;

  /* TWO PERSONS ARE NOT PAIRED HERE: their rules are their own, and are kept where a person is met. A name seen is. */
  /* WHAT A QUESTION OR A JOB ALREADY NAMED GOES FIRST, so a record with many settled pairs still reaches its new ones. */
  const settled = settledIn(sql);
  const found = reads
    .flatMap((read) => [...(read.list.role === 'meets' ? [] : rowPairs(read)), ...seenPairs(sql, read, nowMs)])
    .filter((f) => !settled.hashes.has(f.hash) && !(isRow(f.b) && asked(settled, f.read, f.a, f.b)))
    .map((f) => (settled.judged.has(f.hash) ? { ...f, judged: settled.judged.get(f.hash)! } : f));
  const ranked: (Found & { shared?: NonNullable<Pair['shared']>; tie?: string })[] = [];
  for (const f of found.sort(order).slice(0, CHECKED_MOST)) {
    if (!isRow(f.b)) {
      ranked.push(f);
      continue;
    }
    const { conflict, shared } = compare(sql, f.read.list, f.a, f.b);
    if (conflict) continue;
    const tie = tieOf(reads, f.read, f.a, f.b);
    const score = Math.min(0.95, f.score + (shared === undefined ? 0 : 0.25) + (tie === undefined ? 0 : 0.1));
    ranked.push({ ...f, score, ...(shared === undefined ? {} : { shared }), ...(tie === undefined ? {} : { tie }) });
  }

  for (const f of ranked.sort(order)) {
    if (out.pairs.length >= most) break;
    if (isRow(f.b) && undone(sql, f.read, f.a, f.b)) continue;
    const [a, b] = [`${f.hash}.a`, `${f.hash}.b`];
    out.pairs.push({
      hash: f.hash,
      kind: KIND[f.read.list.role],
      a: { h: a, name: f.a.name },
      b: { h: b, name: f.b.name },
      how: f.how,
      score: Math.round(f.score * 100) / 100,
      seen: isRow(f.b) ? 0 : f.b.seen,
      ...(f.shared === undefined ? {} : { shared: f.shared }),
      ...(f.tie === undefined ? {} : { tie: f.tie }),
      ...(f.judged === undefined ? {} : { judged: f.judged }),
    });
    out.rows[a] = { register: f.read.list.register, id: f.a.id };
    out.rows[b] = isRow(f.b) ? { register: f.read.list.register, id: f.b.id } : { register: f.read.list.register, names: f.b.names };
  }
  return out;
}

/**
 * Why a pair is one, in one sentence anybody may read: names, and what the two share, and never an id, an address or
 * the place a name was seen in.
 */
export function evidenceOf(pair: Pair): string {
  if (pair.how === 'seen') {
    const times = pair.seen === 1 ? 'once' : `${pair.seen} times`;
    return `${pair.b.name} was seen ${times} with nothing that says ${pair.kind === 'person' ? 'who' : 'what'} it is, and reads as ${pair.a.name}.`;
  }
  /* TWO ROWS MAY AGREE ON A NAME NEITHER IS TITLED BY (another name one answers to), and are then not both called it. */
  const lead =
    pair.how === 'near'
      ? `${pair.a.name} and ${pair.b.name} read as one name`
      : nameKey(pair.a.name) === nameKey(pair.b.name)
        ? `Both are called ${pair.a.name}`
        : `${pair.a.name} and ${pair.b.name} answer to one name`;
  const tail =
    pair.shared !== undefined
      ? `both list one ${pair.shared}`
      : pair.tie !== undefined
        ? `both are tied to ${pair.tie}`
        : 'nothing kept about either says they are two';
  return `${lead}, and ${tail}.`;
}
