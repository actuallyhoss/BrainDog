/**
 * Search, and the one line of text a row is searched by.
 *
 * NOT EVERY FIELD. A register says which of its fields are worth searching, with `search: true`, and
 * the reason is not cost — it is that an index over everything answers every query with everything.
 * A search that returns the row because its `note` happens to contain "invoice" is a search whose
 * results a person stops reading, and once they stop reading them they stop using it.
 *
 * THE PROJECTION IS REBUILT ON EVERY WRITE, in the same transaction as the row. An index updated
 * afterwards is an index that is wrong for however long "afterwards" takes, and the window is
 * exactly when somebody is looking for the thing they just wrote.
 *
 * A SERIES IS NOT SEARCHED. Its rows are points on a line — nobody looks for one by typing part of
 * it — and a million of them would be a million index entries buying nothing.
 */

import type { Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';

type Searchable = { id: string; type: string; search?: boolean; retired?: boolean };

/** The types a title is never indexed by: money and the two dates (ruling 441). */
const UNSPOKEN: ReadonlySet<string> = new Set(['money', 'day', 'instant']);

/**
 * The text one row is found by: its searchable fields, in declared order, one per line.
 *
 * A list is joined with spaces and whitespace is collapsed, so a value typed across two lines is one
 * run of words to the tokeniser. Empty values are dropped rather than leaving blank lines, because a
 * blank line in the projection is a token boundary that means nothing.
 *
 * AND THE TITLE IS ALWAYS ONE OF THEM, whatever its type and whether or not it says `search: true`.
 * A hit carries the row's title and nothing else of the row (`search` answers `{register, seq,
 * title, rank}`), so a row whose title is not in the index is a result a person can READ and never
 * REACH. Measured over every register this product declares, 14 in the first-party packs and 18
 * across the six use cases: 30 titles are `text` and already searchable, one is a `document`, and
 * one is an `enum`, `personal / budgets`, whose other two fields are a note and tags that nothing in
 * this product marks searchable. That register had nothing in the index at all, so every query a
 * personal record was asked answered nothing about its budgets.
 *
 * EXCEPT A TITLE MADE ONLY OF MONEY OR A DATE, which is left out (ruling 441, docs/04-PACKS.md
 * "Rulings"). An amount is stored as `{amount, currency}` and a day as an ISO string, so neither is
 * the row's words as the screen says them: one indexes as "[object Object]" and the other as digits
 * that match every query typed with a year in it. Such a row is reached by its other searchable
 * fields, or by the list it lives in. Held by packages/kernel/test/rulings.test.ts.
 */
export function projectedText(fields: readonly Searchable[], values: Record<string, Json>, title?: string): string {
  const lines: string[] = [];
  for (const f of fields) {
    if ((!f.search && f.id !== title) || f.retired) continue;
    if (f.id === title && UNSPOKEN.has(f.type)) continue;
    const raw = values[f.id];
    if (raw === undefined || raw === null || raw === '') continue;
    /* NFC HERE TOO, OR THE QUERY COMPOSES AND THE INDEX DOES NOT. `ftsQuery` normalises what was
       typed; `unicode61` normalises neither, and it folds NFD marks only where they ARE marks. Hangul
       jamo and kana voicing are letters, not marks — so a name stored decomposed became a different
       token from the same name typed composed, and was findable by nothing. One end normalised is
       worse than neither. */
    /* A U+0000 IS A GAP, as white space is: the port refuses a text holding one (`guard`), and a row written before it
       was must still be indexed when it is next written. */
    const text = (Array.isArray(raw) ? raw.map((v) => String(v)).join(' ') : String(raw))
      .normalize('NFC')
      .replace(/[\s\u0000]+/g, ' ')
      .trim();
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

/**
 * Put one row's line into the index, or take it out.
 *
 * DELETE THEN INSERT, always, because FTS5 has no upsert and a row whose searchable fields were all
 * cleared must leave no line behind — otherwise it stays findable by text it no longer holds, which
 * is the one search result nobody can explain.
 */
export function project(
  sql: Sql,
  row: { rowid: number; id: string; register: string; deleted: boolean },
  text: string,
): void {
  sql.exec('DELETE FROM entry_fts WHERE rowid = ?', row.rowid);
  if (!row.deleted && text)
    sql.exec('INSERT INTO entry_fts (rowid, id, register, text) VALUES (?, ?, ?, ?)', row.rowid, row.id, row.register, text);
}

/**
 * A query, as FTS5 will read it.
 *
 * EVERY WORD IS A PREFIX AND THE OPERATORS ARE STRIPPED. A person typing `invoice hal` means "rows
 * about an invoice and something starting hal", and they do not mean the FTS5 `NEAR` operator or a
 * column filter. Passing their words through raw makes a typed `"` a syntax error and a typed `-`
 * an exclusion they never asked for — an empty result, from a query that looked fine.
 */
export function ftsQuery(q: string): string | null {
  const words = q
    /**
     * NFC FIRST, because a combining mark is a token separator to `unicode61` and a person pasting
     * from a Mac does not know that.
     *
     * `unicode61` normalises nothing. A stored `mañana` — one codepoint for `ñ`, which is what every
     * database and every keyboard produces — tokenises to `manana` under `remove_diacritics 2`. The
     * same word typed or pasted DECOMPOSED is `n` + U+0303, and the mark is not a letter, so this
     * built `"man"* AND "ana"*`: two tokens, and no match for a query that is character-for-character
     * the stored value.
     *
     * macOS filenames are NFD by design, and several IMEs emit it. So the reachable case is somebody
     * pasting a name out of Finder into a search box and being told the record does not hold it.
     * Composing first makes the two spellings one query.
     */
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(' AND ');
}

/**
 * The same words as one phrase at the very start of a row's text: `^"bake gg"*`, which finds `crumb.gg` and `Crumb.gg` and
 * not `Servers, Crumb.gg`. `null` for a query with no words.
 */
export function startQuery(q: string): string | null {
  const words = searchWords(q);
  return words.length === 0 ? null : `^"${words.join(' ')}"*`;
}

/** The words of a search as the index reads them, for a list searched without it (`containsMatched`). */
export function searchWords(q: string): string[] {
  const query = ftsQuery(q);
  return query === null ? [] : [...query.matchAll(/"([^"]+)"\*/gu)].map((m) => m[1]!);
}

/**
 * A search over one list by `contains`, not the index: the rows where every word is inside one of
 * `fields`, newest first, and how many there are. For a caller from whom a searchable field of the list is hidden, so
 * the index, which holds that field's words, is never asked and a hit can never say what the hidden field holds. `admit`
 * is the clause her grant and the private rows hold the list to (`admitClause`). The rank is the hit's place.
 */
export function containsMatched(
  sql: Sql,
  words: readonly string[],
  list: { register: string; fields: readonly string[]; admit: { sql: string; params: readonly (string | number)[] } | null },
  limit: number,
  mask?: (text: string) => string,
): { hits: Hit[]; n: number } {
  if (words.length === 0 || list.fields.length === 0) return { hits: [], n: 0 };
  const like = (f: string) => `lower(CAST(json_extract(fields, '$.${f}') AS TEXT)) LIKE ? ESCAPE '\\'`;
  const each = `(${list.fields.map(like).join(' OR ')})`;
  const where = `register = ? AND deleted_at IS NULL AND ${words.map(() => each).join(' AND ')}${list.admit === null ? '' : ` AND (${list.admit.sql})`}`;
  const args = [list.register, ...words.flatMap((w) => list.fields.map(() => `%${w.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`)), ...(list.admit?.params ?? [])];
  /* A FIGURE ASKED BY A CALLER FROM WHOM AMOUNTS ARE HIDDEN is held to the fields' text with its amounts taken out
     (`maskedMatched`), so a row is never found by an amount she is shown as "£…". */
  if (mask !== undefined && words.some((w) => /\p{N}/u.test(w))) {
    const rows = sql.all<{ id: string; fields: string }>(`SELECT id, fields FROM entry WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, ...args, MASKED_CANDIDATES_MOST);
    const kept = rows.filter((r) => {
      const values = JSON.parse(r.fields) as Record<string, unknown>;
      const text = list.fields.map((f) => (values[f] === undefined || values[f] === null ? '' : String(values[f]))).join('\n');
      return figuresStillIn(text, words, mask, true);
    });
    return { hits: kept.slice(0, limit).map((r, i) => ({ id: r.id, register: list.register, rank: i + 1 })), n: kept.length };
  }
  const n = Number(sql.one<{ n: number }>(`SELECT count(*) AS n FROM entry WHERE ${where}`, ...args)?.n ?? 0);
  const rows = n === 0 ? [] : sql.all<{ id: string }>(`SELECT id FROM entry WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, ...args, limit);
  return { hits: rows.map((r, i) => ({ id: r.id, register: list.register, rank: i + 1 })), n };
}

export type Hit = { id: string; register: string; rank: number };

/** What a search is asked: the words, the registers the caller may see, and how many hits to draw. */
/* `viewer` LEAVES OUT THE ROWS SOMEBODY ELSE KEPT PRIVATE (migration 40), in the query, so hits and counts agree. */
/* `admits` HOLDS A LIST TO THE CALLER'S GRANT (leak matrix G5): the clause each narrowed list's rows meet, compiled by the
   kernel from `wheres` (`admitClause`), so the hits and `matched` are both the rows the caller is shown. */
type Admit = { register: string; sql: string; params: readonly (string | number)[] };
/* `perList` IS THE MOST HITS FROM ANY ONE LIST: asked as somebody types, where a hundred readings of one list used to fill the whole answer. */
type Ask = { registers?: readonly string[] | undefined; limit?: number; viewer?: string | undefined; admits?: readonly Admit[] | undefined; perList?: number | undefined };

/**
 * A search's whole answer: the page of hits, and how many rows there were to have.
 *
 * A BARE ARRAY CANNOT TELL A HUNDRED FROM A HUNDRED OF A HUNDRED AND FORTY, AND THE SCREEN PRINTED THE WRONG ONE.
 * Driven at a real record's size: `/search?q=revenue` drew **100** under the heading and **"All 100 in Datapoints"**
 * beside the group when 140 rows matched, counted against the record file itself. `the` matched 304 and said 100;
 * `oxbow` matched 577 and said 100. The clamp below is not the fault. `list` clamps above its own ceiling in silence
 * too, and says so at `packages/record/src/index.ts:2038`, but `list` answers a page with a cursor and a `matched`, so
 * a clamped read arrives downstream looking like one. This answered an array, so nothing that received it could know
 * what it was missing, and the surface that exists to find anything in 2,243 rows stated a number that was not true.
 *
 * SO THE COUNT TRAVELS WITH THE HITS, AND IT IS PER REGISTER RATHER THAN ONE NUMBER. The results
 * screen groups by register and prints a count per group, so a single grand total would fix the
 * heading and leave every group saying its own ceiling. Per register it also needs no new sentence
 * anywhere: `allIn(140, 'Datapoints')` and `showingOf(10, 140)` are already written and become true
 * the moment the number is. The grand total is the sum, and a second field holding it would be one
 * fact stored twice, which is one fact that can disagree with itself.
 *
 * NOT A CURSOR, and this was the tempting one. The order is `bm25`, which is not a resumable key:
 * rank is a float that repeats constantly on a record whose 1,224 readings are near-identical
 * sentences, and its value moves for every row when any row is written, because bm25 reads the whole
 * index's term statistics. "Everything after rank r" would therefore both repeat rows and skip them
 * between one page and the next. A cursor also answers a question nobody asked at a search box: the
 * person typing wants to know whether the record holds the thing, not to walk 577 readings.
 *
 * NOT AN AT-THE-CAP MARK EITHER. A mark buys "the first 100 of more", which needs a sentence written
 * for it and still leaves the reader to guess whether "more" is 3 or 477. The mark falls out of the
 * count anyway, as `sum(matched) > hits.length`.
 *
 * WHAT IT COSTS, MEASURED. One more query over the same MATCH, with no `bm25` and no `ORDER BY`. At a
 * measured size of 2,243 rows in `node:sqlite`, median of nine warm runs: the ranked page of 100 takes
 * 0.31 to 0.73 ms and the count takes 0.24 to 0.76 ms over five queries matching between 0 and 1,122
 * rows, so the count is cheaper than the page it counts on four of the five and the pair is about twice
 * one page. The whole `search` route measured 3 ms at that size.
 */
export type Searched = {
  /** The best matches, `limit` of them at most, best first. */
  hits: Hit[];
  /** How many live rows matched in each register in scope, whatever the ceiling cut. Sum it for the whole. */
  matched: Record<string, number>;
};

/**
 * The FROM and WHERE both queries share, or `null` for a search there is nothing to run.
 *
 * ONE FRAGMENT, BECAUSE A COUNT THAT DOES NOT COUNT THE PAGE IT IS BESIDE IS WORSE THAN NO COUNT.
 * Two copies of this clause would be two places to add the next condition, and the failure would be
 * a screen saying 140 over a page of rows drawn from a different 140.
 *
 * THE SCOPE IS APPLIED IN THE QUERY rather than to its results: filtering afterwards means a caller
 * who may read one register gets a short page whenever the matches were mostly in another, and
 * cannot tell that from there being no matches. The count inherits the same property, so it is a
 * count of what this caller could have seen and not of the record.
 *
 * AN EMPTY SCOPE IS AN EMPTY ANSWER, AND IT USED TO BE THE WHOLE RECORD. `opts.registers?.length`
 * read an empty array as though no scope had been passed, so a caller that COMPUTED a list of the
 * registers somebody may read and got none handed that person every row in the record. It is the
 * worst possible direction for a default to fail in, and it is one character away from the caller
 * doing everything right: `registers: reachable.filter(...)` is the correct shape and an empty
 * result is the correct answer to it.
 *
 * THE QUESTION IS WHETHER A SCOPE WAS GIVEN, not whether it has anything in it. `undefined` is a
 * caller who never asked to be scoped, which is the owner's own search; `[]` is a caller who asked
 * and holds nothing.
 */
function matching(q: string, registers: readonly string[] | undefined, viewer?: string, admits: readonly Admit[] = []): { from: string; args: (string | number)[] } | null {
  const query = ftsQuery(q);
  if (!query) return null;
  if (registers !== undefined && registers.length === 0) return null;
  const scope = registers ? ` AND entry.register IN (${registers.map(() => '?').join(', ')})` : '';
  const kept = viewer === undefined ? '' : ' AND entry.id NOT IN (SELECT entry_id FROM entry_private WHERE person_id <> ?)';
  /* A NARROWED LIST'S ROWS ARE THE ONES ITS CLAUSE ADMITS, asked in a statement of their own so the clause's bare names
     are that statement's `entry`, never the search's `entry_fts`, which has an `id` and a `register` too. */
  /* THE LIST BY ITS ID AS A LITERAL in the statement that finds its admitted rows, so a partial index on a field its rule
     reads (`entry_i_<list>__<field> ... WHERE register = '<list>'`) answers it, which a bound `?` does not show SQLite.
     An id is the grammar's (`^[a-z][a-z0-9_]{0,31}$`), checked before it is written in; anything else is bound. The
     index covers live rows only, so the statement says so: the search already leaves a deleted row out. */
  const literal = (register: string): boolean => /^[a-z][a-z0-9_]{0,31}$/u.test(register);
  /* A TEST A ROW OF A NARROWED LIST, ASKING ONLY ITS OWN LIST'S ADMITTED ROWS: a row of one is among the rows that list's
     rules admit, and a row of a list no rule applies to is not asked at all. Each list's rows are found once by rowid, and
     the row's own list is looked at first, so a row is checked against one set and not ten. A list with two rules meets
     both in its set. */
  const byList = new Map<string, Admit[]>();
  for (const a of admits) byList.set(a.register, [...(byList.get(a.register) ?? []), a]);
  const lists = [...byList.keys()];
  const named = (register: string): { sql: string; args: string[] } => (literal(register) ? { sql: `register = '${register}'`, args: [] } : { sql: 'register = ?', args: [register] });
  const terms = lists.map((register) => {
    const on = named(register);
    const rules = byList.get(register)!;
    return {
      sql: `(entry.${on.sql} AND entry.rowid IN (SELECT rowid FROM entry WHERE ${on.sql} AND deleted_at IS NULL AND ${rules.map((a) => `(${a.sql})`).join(' AND ')}))`,
      args: [...on.args, ...on.args, ...rules.flatMap((a) => a.params)],
    };
  });
  const held = lists.length === 0 ? '' : ` AND (entry.register NOT IN (SELECT value FROM json_each(?)) OR ${terms.map((t) => t.sql).join(' OR ')})`;
  const heldArgs: (string | number)[] = lists.length === 0 ? [] : [JSON.stringify(lists), ...terms.flatMap((t) => t.args)];
  return {
    from: `FROM entry_fts
       JOIN entry ON entry.rowid = entry_fts.rowid
      WHERE entry_fts MATCH ?${scope} AND entry.deleted_at IS NULL${kept}${held}`,
    args: [query, ...(registers ?? []), ...(viewer === undefined ? [] : [viewer]), ...heldArgs],
  };
}

/**
 * Rows whose text matches, best first, within the registers the caller may see.
 *
 * THIS IS THE SHAPE THAT PRINTED A CEILING AS A TOTAL, and it is kept only until its two callers
 * move to `searchMatched`: `packages/kernel/src/index.ts:3832` hands the array up and
 * `packages/record/src/index.ts:4347` puts it on the wire, and neither file was this change's to
 * edit. Anything that states a number to a person wants `searchMatched`, because nothing here can
 * tell a full page from a whole answer.
 */
export function search(sql: Sql, q: string, opts: Ask = {}): Hit[] {
  const m = matching(q, opts.registers, opts.viewer, opts.admits);
  if (!m) return [];
  /* THE CLAMP STAYS, and it is now visible rather than silent: a caller asking for 500 still gets
     100, and `matched` is what tells them so. */
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);
  const [, ...rest] = m.args;
  /* THE ROWS WHOSE TEXT OPENS WITH WHAT WAS TYPED COME FIRST. `bm25` punishes length, so a project with a long note sat
     under a thousand short readings: on his record (4 Nov) `crumb.gg` matched 1,297 rows, and the project Crumb.gg was not
     in the hundred sent back at all, behind "Servers, Crumb.gg" a hundred times. A row's title opens its text. */
  const opening = startQuery(q);
  const first = opening === null ? [] : sql.all<Hit>(`SELECT entry_fts.id AS id, entry_fts.register AS register, bm25(entry_fts) AS rank ${m.from} ORDER BY rank LIMIT ?`, opening, ...rest, limit);
  /* ONE LIST CANNOT FILL THE ANSWER WHEN `perList` IS ASKED: the record's own ranking per list, then best first over all. */
  const most = opts.perList;
  const ranked =
    most === undefined
      ? sql.all<Hit>(`SELECT entry_fts.id AS id, entry_fts.register AS register, bm25(entry_fts) AS rank ${m.from} ORDER BY rank LIMIT ?`, ...m.args, limit)
      : sql.all<Hit>(
          /* THE INDEX'S OWN `rank` COLUMN AND NOT `bm25()`, which SQLite refuses inside a window: the same number. */
          `SELECT id, register, score AS rank FROM (SELECT entry_fts.id AS id, entry_fts.register AS register, entry_fts.rank AS score, row_number() OVER (PARTITION BY entry.register ORDER BY entry_fts.rank) AS at ${m.from}) WHERE at <= ? ORDER BY score LIMIT ?`,
          ...m.args,
          most,
          limit,
        );
  if (first.length === 0) return ranked;
  const seen = new Set(first.map((h) => h.id));
  const joined = [...first, ...ranked.filter((h) => !seen.has(h.id))];
  if (most === undefined) return joined.slice(0, limit);
  const perList = new Map<string, number>();
  return joined
    .filter((h) => {
      const n = (perList.get(h.register) ?? 0) + 1;
      perList.set(h.register, n);
      return n <= most;
    })
    .slice(0, limit);
}

/** The same hits, with the count that makes them tellable from the whole answer. See `Searched`. */
export function searchMatched(sql: Sql, q: string, opts: Ask = {}): Searched {
  const m = matching(q, opts.registers, opts.viewer, opts.admits);
  if (!m) return { hits: [], matched: {} };
  const matched: Record<string, number> = {};
  for (const row of sql.all<{ register: string; n: number }>(
    `SELECT entry.register AS register, count(*) AS n
       ${m.from}
      GROUP BY entry.register`,
    ...m.args,
  ))
    matched[row.register] = row.n;
  return { hits: search(sql, q, opts), matched };
}

/**
 * THE MOST ROWS A SEARCH FOR A FIGURE READS BACK to hold against a text with its amounts taken out (`maskedMatched`).
 * Past it the rows after are not counted, which says less than there is and never more.
 */
export const MASKED_CANDIDATES_MOST = 2_000;

/** A word as the index folds it: composed, lower case, its marks taken off, as `unicode61 remove_diacritics 2` reads it. */
const folded = (s: string): string => s.normalize('NFC').toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');

/**
 * Whether every word of a search that holds a digit is still a word of `text` (as a prefix, as the index matches, or
 * anywhere in it with `inside`, as `containsMatched` matches) once
 * its amounts are taken out by `mask`. Only those words can stop matching: taking an amount out takes digits, never a
 * word with none.
 */
export function figuresStillIn(text: string, words: readonly string[], mask: (text: string) => string, inside = false): boolean {
  const figures = words.filter((w) => /\p{N}/u.test(w));
  if (figures.length === 0) return true;
  const shown = folded(mask(text));
  /* `inside` IS THE `contains` SEARCH'S OWN TEST, a word anywhere in the text, as its `LIKE` asks. */
  if (inside) return figures.every((w) => shown.includes(folded(w)));
  const tokens = shown.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return figures.every((w) => {
    const f = folded(w);
    return tokens.some((t) => t.startsWith(f));
  });
}

/**
 * THE SAME SEARCH FOR A CALLER FROM WHOM AMOUNTS ARE HIDDEN, when it asks for a figure ("Hide
 * amounts"): a row is a hit, and counted, only when the figure is still in its text once every amount written there is
 * taken out (`mask`, the kernel's `maskMoneyText`). The index holds "Paid £923.47 for clay", so asked for `923.47` it
 * found the row for a guest who is shown "Paid £… for clay", and its title said which row held the figure.
 *
 * The rows the index matches are read back with their text, best first, at most `MASKED_CANDIDATES_MOST`, and held to
 * the figure in JavaScript: a pattern in SQL cannot tell an amount from a room number. A search with no digit in it is
 * the plain one, since taking amounts out takes no other word.
 */
export function maskedMatched(sql: Sql, q: string, opts: Ask, mask: (text: string) => string): Searched {
  const words = searchWords(q);
  if (!words.some((w) => /\p{N}/u.test(w))) return searchMatched(sql, q, opts);
  const m = matching(q, opts.registers, opts.viewer, opts.admits);
  if (!m) return { hits: [], matched: {} };
  const rows = sql.all<Hit & { text: string }>(
    `SELECT entry_fts.id AS id, entry_fts.register AS register, entry_fts.text AS text, bm25(entry_fts) AS rank
       ${m.from}
      ORDER BY rank
      LIMIT ?`,
    ...m.args,
    MASKED_CANDIDATES_MOST,
  );
  const kept = rows.filter((r) => figuresStillIn(r.text, words, mask));
  const matched: Record<string, number> = {};
  for (const r of kept) matched[r.register] = (matched[r.register] ?? 0) + 1;
  const most = Math.min(Math.max(1, opts.limit ?? 20), 100);
  return { hits: kept.slice(0, most).map(({ id, register, rank }) => ({ id, register, rank })), matched };
}

/** Every live row's line, rebuilt from nothing. What an import runs once at the end. */
export function rebuild(
  sql: Sql,
  fieldsOf: (register: string) => { fields: readonly Searchable[]; title?: string } | undefined,
  isSeries: (register: string) => boolean,
): number {
  sql.exec('DELETE FROM entry_fts');
  let n = 0;
  const rows = sql.all<{ rowid: number; id: string; register: string; fields: string }>(
    'SELECT rowid, id, register, fields FROM entry WHERE deleted_at IS NULL',
  );
  for (const row of rows) {
    if (isSeries(row.register)) continue;
    const held = fieldsOf(row.register);
    if (!held) continue;
    const text = projectedText(held.fields, JSON.parse(row.fields) as Record<string, Json>, held.title);
    if (!text) continue;
    sql.exec('INSERT INTO entry_fts (rowid, id, register, text) VALUES (?, ?, ?, ?)', row.rowid, row.id, row.register, text);
    n++;
  }
  return n;
}
