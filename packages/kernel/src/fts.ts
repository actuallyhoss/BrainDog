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

/**
 * The text one row is found by: its searchable fields, in declared order, one per line.
 *
 * A list is joined with spaces and whitespace is collapsed, so a value typed across two lines is one
 * run of words to the tokeniser. Empty values are dropped rather than leaving blank lines, because a
 * blank line in the projection is a token boundary that means nothing.
 */
export function projectedText(fields: readonly Searchable[], values: Record<string, Json>): string {
  const lines: string[] = [];
  for (const f of fields) {
    if (!f.search || f.retired) continue;
    const raw = values[f.id];
    if (raw === undefined || raw === null || raw === '') continue;
    const text = (Array.isArray(raw) ? raw.map((v) => String(v)).join(' ') : String(raw)).replace(/\s+/g, ' ').trim();
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

export type Hit = { id: string; register: string; rank: number };

/**
 * Rows whose text matches, best first, within the registers the caller may see.
 *
 * The ceiling is applied IN THE QUERY rather than to its results: filtering afterwards means a
 * caller with access to one register gets a short page whenever the matches were mostly in another,
 * and cannot tell that from there being no matches.
 */
export function search(
  sql: Sql,
  q: string,
  opts: { registers?: readonly string[] | undefined; limit?: number } = {},
): Hit[] {
  const query = ftsQuery(q);
  if (!query) return [];
  const limit = Math.min(Math.max(1, opts.limit ?? 20), 100);

  const scope = opts.registers?.length
    ? ` AND entry_fts.register IN (${opts.registers.map(() => '?').join(', ')})`
    : '';

  return sql.all<Hit>(
    `SELECT entry_fts.id AS id, entry_fts.register AS register, bm25(entry_fts) AS rank
       FROM entry_fts
       JOIN entry ON entry.rowid = entry_fts.rowid
      WHERE entry_fts MATCH ?${scope} AND entry.deleted_at IS NULL
      ORDER BY rank
      LIMIT ?`,
    query,
    ...((opts.registers ?? []) as string[]),
    limit,
  );
}

/** Every live row's line, rebuilt from nothing. What an import runs once at the end. */
export function rebuild(
  sql: Sql,
  fieldsOf: (register: string) => readonly Searchable[] | undefined,
  isSeries: (register: string) => boolean,
): number {
  sql.exec('DELETE FROM entry_fts');
  let n = 0;
  const rows = sql.all<{ rowid: number; id: string; register: string; fields: string }>(
    'SELECT rowid, id, register, fields FROM entry WHERE deleted_at IS NULL',
  );
  for (const row of rows) {
    if (isSeries(row.register)) continue;
    const fields = fieldsOf(row.register);
    if (!fields) continue;
    const text = projectedText(fields, JSON.parse(row.fields) as Record<string, Json>);
    if (!text) continue;
    sql.exec('INSERT INTO entry_fts (rowid, id, register, text) VALUES (?, ?, ?, ?)', row.rowid, row.id, row.register, text);
    n++;
  }
  return n;
}
