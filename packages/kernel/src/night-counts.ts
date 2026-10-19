/**
 * What the night counts of the record itself, a point a night, for the two built-in figures that read it back
 * (`built-in-figures.ts`, `readListsShrunk` and `readDeadPaths`).
 *
 * `countLists`: how many rows each list holds, live and deleted, kept as `counts:<list>:live` and `counts:<list>:deleted`
 * (REC-A17 job 3). Nothing counted his rows across a deploy, so a list that lost what nobody deleted would only be seen
 * when he looked for something and it was gone. `lists-shrunk` compares two nights.
 *
 * `deadPaths`: how many `{{...}}` placeholders in the record's documents name nothing here, kept as `paths:dead`
 * (REC-A13 job 1). His project notes held 67 placeholders and nothing read a note's paths until a page drew it. The walk
 * reads a bounded number of rows a night, from where the last night stopped, by the rule `checkPaths` answers a
 * document with (record `methods/pages-census.ts`): `pathsOf` finds the paths, a field of the row's own list is named,
 * and the record's own read (`unnamed`) says which of the rest name nothing.
 *
 * BOTH ARE THE RECORD WRITING OF ITSELF, so the points carry the source `night.counts` or `night.paths`, and an arrival's
 * numbers are never these (`signs.ts`, its numbers sign). Only `index.ts` imports this file: it reads `pages.ts`, which
 * reaches `metrics.ts`, so the figures' words live in `built-in-figures.ts` and come in from there.
 */

import { unprivate } from '@braindog/where';
import type { Sql } from '@braindog/ports';

import { DEAD_PATHS_SERIES, countsSeries } from './built-in-figures.ts';
import { pathsOf, type PageBlock } from './pages.ts';

/** The source the night's counts are written under. */
export const NIGHT_COUNTS_SOURCE = 'night.counts';

/** The source the night's dead placeholders are written under. */
export const NIGHT_PATHS_SOURCE = 'night.paths';

/** The `dog_meta` row the walk keeps its place and its findings in. */
export const DEAD_PATHS_META = 'dead-paths';

/** How many rows with a document a night reads. */
export const DEAD_PATHS_NIGHT = 300;

/** The record's day for `at`, `YYYY-MM-DD`, in its own zone. */
function dayIn(at: number, tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/** One day's point of one series, written again when the night runs twice. */
function keep(sql: Sql, series: string, day: string, value: number, n: number, source: string, at: number): void {
  sql.exec(
    `INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'day', ?, ?, '', ?, ?, ?)
     ON CONFLICT (series, grain, at) DO UPDATE SET value = excluded.value, n = excluded.n, source = excluded.source, wrote_at = excluded.wrote_at`,
    series,
    day,
    value,
    n,
    source,
    new Date(at).toISOString(),
  );
}

/** What one night counted: each list by id, live and deleted. */
export type ListCounts = Record<string, { live: number; deleted: number }>;

/**
 * Each list's live and deleted totals tonight, written as two points of the day `at` falls on. EVERY DECLARED LIST IS
 * COUNTED, an empty one as nought, so a list emptied by a fault reads nought and not a night missing. A list that holds
 * rows and is declared no longer is counted too: its rows are still his.
 */
export function countLists(sql: Sql, at: number, tz?: string): ListCounts {
  const out: ListCounts = {};
  for (const r of sql.all<{ list: unknown }>(
    "SELECT DISTINCT json_extract(body, '$.id') AS list FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)",
  ))
    if (typeof r.list === 'string' && r.list !== '') out[r.list] = { live: 0, deleted: 0 };
  for (const r of sql.all<{ register: string; live: number; deleted: number }>(
    /* A STORED SERIES IS SHARED, so it counts as nobody (`''`): a row its maker kept private is in no point. */
    `SELECT register, SUM(deleted_at IS NULL) AS live, SUM(deleted_at IS NOT NULL) AS deleted FROM entry WHERE ${unprivate()} GROUP BY register`,
    '',
  ))
    out[r.register] = { live: Number(r.live ?? 0), deleted: Number(r.deleted ?? 0) };
  const day = dayIn(at, tz);
  for (const [list, c] of Object.entries(out)) {
    keep(sql, countsSeries(list, 'live'), day, c.live, c.live, NIGHT_COUNTS_SOURCE, at);
    keep(sql, countsSeries(list, 'deleted'), day, c.deleted, c.deleted, NIGHT_COUNTS_SOURCE, at);
  }
  return out;
}

/** What the walk needs of the record: the lists with their fields, and which paths of a block name nothing. */
export type DeadPathsDeps = {
  sql: Sql;
  nowMs: number;
  tz?: string | undefined;
  /** Each list's declared fields, by list id: the walk reads the fields of type `document`. */
  registers: ReadonlyMap<string, { fields: readonly { id: string; type: string }[] }>;
  /** The paths of a block the record has nothing by that name for, as `block` answers them (`unnamed`). */
  unnamed: (block: PageBlock) => readonly string[] | undefined;
};

/** One night of the walk: rows read, placeholders that name nothing by the walk so far, whether a pass ended, where it stopped. */
export type DeadPaths = { read: number; dead: number; finished: boolean; next: number };

/** A row that holds dead placeholders: its rowid, how many, and the pass that saw it. */
type Found = [at: number, dead: number, pass: number];

/** The walk's state, one JSON value in `dog_meta`. */
type WalkState = { after: number; pass: number; passes: number; found: Found[] };

function readWalk(sql: Sql): WalkState {
  const raw = sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', DEAD_PATHS_META)?.value;
  let s: Partial<WalkState> | null = null;
  try {
    s = raw === undefined ? null : (JSON.parse(raw) as Partial<WalkState>);
  } catch {
    s = null;
  }
  if (s === null || typeof s !== 'object') return { after: 0, pass: 1, passes: 0, found: [] };
  const found = Array.isArray(s.found) ? s.found.filter((f): f is Found => Array.isArray(f) && f.length === 3 && f.every((n) => typeof n === 'number')) : [];
  return { after: Number(s.after) || 0, pass: Number(s.pass) || 1, passes: Number(s.passes) || 0, found };
}

/** The placeholders of one document that name nothing: not a field of its own list, and unnamed by the record. */
function deadIn(deps: DeadPathsDeps, text: string, own: ReadonlySet<string>): number {
  const block = { kind: 'note', body: text } as unknown as PageBlock;
  const paths = pathsOf(block);
  if (paths.length === 0) return 0;
  let unnamed: ReadonlySet<string>;
  try {
    unnamed = new Set(deps.unnamed(block) ?? []);
  } catch {
    /* A NOTE THE RECORD COULD NOT READ NAMES NOTHING it can vouch for, as `checkPaths` says it. */
    unnamed = new Set(paths);
  }
  return paths.filter((p) => !own.has(p) && unnamed.has(p)).length;
}

/**
 * One night of the walk over the rows that hold a document: at most `most` live rows, in rowid order, from `cursor` on,
 * or from where the last night stopped when `cursor` is `null`. A pass that reaches the last row ends there, and what it
 * did not see again (a row deleted, a note rewritten clean) leaves the count. Once a pass has ended, every night keeps
 * `paths:dead` for its day; before that nothing is kept, so the figure says nothing rather than nought.
 */
export function deadPaths(deps: DeadPathsDeps, cursor: number | null = null, most: number = DEAD_PATHS_NIGHT): DeadPaths {
  const { sql } = deps;
  const s = readWalk(sql);
  if (cursor !== null) s.after = cursor;
  const docs = new Map<string, { own: Set<string>; fields: string[] }>();
  for (const [list, decl] of deps.registers) {
    const fields = decl.fields.filter((f) => f.type === 'document').map((f) => f.id);
    if (fields.length > 0) docs.set(list, { own: new Set(decl.fields.map((f) => f.id)), fields });
  }
  const limit = Math.max(1, Math.floor(most));
  /* ONE MORE THAN THE NIGHT READS, so a night that reads the last row knows it and ends the pass there. */
  const fetched =
    docs.size === 0
      ? []
      : sql.all<{ at: number; register: string; fields: string }>(
          `SELECT rowid AS at, register, fields FROM entry
            WHERE rowid > ? AND deleted_at IS NULL AND register IN (SELECT value FROM json_each(?)) ORDER BY rowid LIMIT ?`,
          s.after,
          JSON.stringify([...docs.keys()]),
          limit + 1,
        );
  const rows = fetched.slice(0, limit);
  for (const row of rows) {
    s.after = Number(row.at);
    s.found = s.found.filter((f) => f[0] !== s.after);
    const doc = docs.get(row.register);
    let fields: Record<string, unknown> = {};
    try {
      fields = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!doc) continue;
    let dead = 0;
    for (const id of doc.fields) {
      const text = fields[id];
      if (typeof text === 'string' && text.includes('{{')) dead += deadIn(deps, text, doc.own);
    }
    if (dead > 0) s.found.push([s.after, dead, s.pass]);
  }
  const finished = fetched.length <= limit;
  if (finished) {
    s.found = s.found.filter((f) => f[2] === s.pass);
    s.passes++;
    s.pass++;
    s.after = 0;
  }
  sql.exec(
    'INSERT INTO dog_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    DEAD_PATHS_META,
    JSON.stringify(s),
  );
  const dead = s.found.reduce((n, f) => n + f[1], 0);
  if (s.passes > 0) keep(sql, DEAD_PATHS_SERIES, dayIn(deps.nowMs, deps.tz), dead, rows.length, NIGHT_PATHS_SOURCE, deps.nowMs);
  return { read: rows.length, dead, finished, next: s.after };
}
