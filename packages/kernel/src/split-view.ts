/**
 * The view a split row is read through (`row-parts.ts`), and the way back from a statement read over it
 * (`pastSplitView`, for `sql-reads.ts`). PURE, and Node loads it.
 */

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
