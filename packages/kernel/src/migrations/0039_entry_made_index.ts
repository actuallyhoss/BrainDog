/**
 * The kernel schema, migration 39: `entry_made`, the index under a list read in its default order.
 *
 * A LIST THAT DECLARES NO ORDER COMES BACK NEWEST MADE FIRST (PGS-B06): `ORDER BY created_at DESC, id DESC` in `list`.
 * The one index a list had was migration 1's `entry_live (register, updated_at DESC)`, from when the default was last
 * changed first, so since the default moved every such read found the list's rows and then sorted all of them to hand
 * back the first page. On a list of a few hundred rows nobody sees it; on a ledger of tens of thousands it is every
 * open of the page.
 *
 * `(register, created_at DESC, id DESC)`, THE SORT ITSELF, so the first page is the first rows of the index and the
 * read stops there. PARTIAL ON `deleted_at IS NULL`, as `entry_live` and `entry_state` are: a default read asks for
 * live rows only, and a deleted row has no place in it.
 *
 * `entry_live` STAYS. The cursor is still keyset on `updated_at`, and `observe.ts` and the changed-since reads lead on
 * it.
 *
 * AN INDEX AND NOTHING ELSE: no table, no column, no row changed, so every row a record holds is still there after it,
 * and a file carries no index, so the format is still 1.
 *
 * DROPPED FIRST, AND THEN MADE, so it can run twice: `migrate.test.ts` rewinds the ledger and applies this again over
 * itself, and a bare `CREATE INDEX` is refused the second time. Dropped rather than `IF NOT EXISTS`, so what stands
 * after it is always this definition and never an older one of the same name.
 */
export default `
DROP INDEX IF EXISTS entry_made;
CREATE INDEX entry_made ON entry(register, created_at DESC, id DESC) WHERE deleted_at IS NULL;
`;
