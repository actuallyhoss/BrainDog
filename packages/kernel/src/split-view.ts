/**
 * The view a split row is read through (`row-parts.ts`), and the way back from a statement read over it
 * (`pastSplitView`, for `sql-reads.ts`). PURE, and Node loads it.
 */

import type { Sql } from '@braindog/ports';

const COLUMNS = 'id, register, seq, fields, state, version, created_at, updated_at, deleted_at';

/**
 * A view of `entry` in which each split row of `register` is one row per part, every other row as it is: the part's
 * keys merged over the row's fields (`json_patch`), the row's id, number and stamps kept, and `rowid` kept for a walk
 * that breaks ties by it. Placed in front of a statement as a `WITH` named `entry`, it is what the statement reads, and
 * `main.entry` inside it is the table.
 *
 * EVERY ROW OF IT KEEPS ITS ROW'S LIST, in both halves, so a read of it held to one list by `register` reads that list's
 * rows of the table and no other's (`pastSplitView`).
 */
export function splitView(register: string, field: string): string {
  const reg = register.replace(/'/gu, "''");
  const path = `$.${field}`.replace(/'/gu, "''");
  return (
    `entry AS (SELECT rowid AS rowid, ${COLUMNS} FROM main.entry WHERE register <> '${reg}' OR json_type(fields, '${path}') IS NOT 'array' ` +
    `UNION ALL SELECT e.rowid AS rowid, e.id, e.register, e.seq, json_patch(e.fields, p.value) AS fields, e.state, e.version, e.created_at, e.updated_at, e.deleted_at ` +
    `FROM main.entry AS e, json_each(e.fields, '${path}') AS p WHERE e.register = '${reg}' AND json_type(e.fields, '${path}') = 'array')`
  );
}

/** A list's or a field's id as the grammar has it: the one kind of name written into these statements unbound. */
const NAME = /^[a-z][a-z0-9_]{0,63}$/u;

/** The index that holds the rows of a list that are split, and no others (`splitIndex`). */
export const splitIndexName = (register: string, field: string): string => `entry_i_${register}__${field}__split`;

/**
 * THE INDEX THAT SAYS WHETHER ANY ROW OF A LIST IS SPLIT. It holds exactly the rows the view reads as parts, deleted ones
 * too, as the view does. SQLite keeps it in the transaction of every write there is, the kernel's, a repair's, an import's
 * or a rollback's, so what it says is the rows and no kept flag that could go stale.
 *
 * NOT A MIGRATION, AND SAFE TO LEAVE BEHIND: `CREATE ... IF NOT EXISTS` at the record's open and at each install of the
 * list (`declare.ts`, `indexesFor`), and a build before this one reads past an index it does not know. It is named as a
 * list's own indexes are, so declaring the list again drops it and makes it again. `null` for a name this will not write.
 */
export function splitIndex(register: string, field: string): string | null {
  if (!NAME.test(register) || !NAME.test(field)) return null;
  return `CREATE INDEX IF NOT EXISTS ${splitIndexName(register, field)} ON entry (register) WHERE register = '${register}' AND json_type(fields, '$.${field}') = 'array'`;
}

/**
 * WHETHER A READ OF THIS LIST HAS ANY SPLIT ROW TO SEE, asked of the rows each time and kept nowhere, so it cannot go stale.
 *
 * ANYTHING THAT IS NOT A PLAIN NO IS A YES. With no index to ask (a record that has not been opened by this build, a list
 * declared again by an older one), or a name this will not write, or any error, the read goes through the view as it always
 * did: slower and never wrong.
 */
export function holdsSplit(sql: Pick<Sql, 'one'>, register: string, field: string): boolean {
  if (!NAME.test(register) || !NAME.test(field)) return true;
  try {
    return sql.one(`SELECT 1 AS y FROM main.entry INDEXED BY ${splitIndexName(register, field)} WHERE register = '${register}' AND json_type(fields, '$.${field}') = 'array' LIMIT 1`) !== undefined;
  } catch {
    return true;
  }
}

/** The head of a statement read over the view: its list and its path, each as SQL quotes them. */
const HEAD = /^WITH(\s+RECURSIVE)? entry AS \(SELECT rowid AS rowid, [a-z_, ]+ FROM main\.entry WHERE register <> '((?:[^']|'')*)' OR json_type\(fields, '\$\.((?:[^']|'')*)'\)/u;

/**
 * The statement a read over the view was (`splitView` placed in front of it), with its own `WITH` if it had one, or
 * `null` for a statement that does not begin with the view exactly as `splitView` writes it. The view keeps each row's
 * list, so what the statement reads of `entry` is what it reads of the table.
 */
export function pastSplitView(text: string): string | null {
  const m = HEAD.exec(text);
  if (m === null) return null;
  const unquote = (s: string): string => s.replace(/''/gu, "'");
  const head = `WITH${m[1] ?? ''} ${splitView(unquote(m[2]!), unquote(m[3]!))}`;
  if (!text.startsWith(head)) return null;
  const rest = text.slice(head.length);
  if (rest.startsWith(', ')) return `WITH${m[1] ?? ''} ${rest.slice(2)}`;
  return rest.startsWith(' ') ? rest.slice(1) : null;
}
