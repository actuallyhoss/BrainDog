/**
 * The kernel schema, migration 3: `pack.disabled_at`.
 *
 * A disabled pack keeps its `pack` row, so `/packs` can still list it with its version, and its
 * declarations are retired as uninstall retires them. The column is the one fact uninstall has no
 * way to say: the pack is still here, and it is off.
 *
 * A COLUMN AND NOT A TABLE, and NULL on every existing row, because every pack installed before
 * this migration was enabled. An older `.brain` file has no such column and imports as enabled, which
 * is what it was when it was written.
 */
export default `
ALTER TABLE pack ADD COLUMN disabled_at TEXT;
`;
