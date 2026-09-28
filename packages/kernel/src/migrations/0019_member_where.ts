/**
 * The kernel schema, migration 19: `member.row_where`, a list grant narrowed to the rows matching one `where`
 * (`loop/finish/platform.md` §4.0 W, `loop/finish/contracts.md` X24, `20-COLLABORATION` §1).
 *
 * ONE NULLABLE COLUMN ON THE GRANT ROW. A member's grant on a list is one row of `member` (a person, a list, a level),
 * and the rows of that list the grant reaches are a property of the same grant, so the rule sits beside the level it
 * narrows. NULL is every row, which is what every grant meant before this migration, so no record changes on open.
 * A value is one `where` in the grammar `list` already takes (`34-GRAMMARS` §1), stored as its JSON text. A row on
 * `'*'`, the whole record, never holds one: a rule is about one list's fields, and the whole record has no fields.
 *
 * NO CHECK AND NO REBUILD. `member` keeps its CHECK on `level` exactly as migration 1 wrote it, and a CHECK over JSON
 * would make every new operator a rebuild of the table every access decision reads. The one writer, `invite` in
 * `members.ts`, reads the rule against its list before it stores it, and a rule the readers cannot read reaches no
 * row at all, so a bad value fails closed.
 *
 * NOT A FORMAT REVISION. `member` travels in a `.brain` file, and an older file imports without the column, which the
 * positional read in `brainl.ts` already takes, and reads it as NULL: every row, which is what that file meant.
 */
export default `
ALTER TABLE member ADD COLUMN row_where TEXT;
`;
