/**
 * The kernel schema, migration 40: `entry_private`, the rows a member keeps to themselves.
 *
 * A TABLE BESIDE `entry` AND NOT A COLUMN ON IT, so no file carries it and the format is still 1: privacy is about who is
 * looking at this copy of the record, and a `.brain` file opened by somebody else is not a place it should travel.
 * One row names a row and the person who made it private; every read that is handed a viewer leaves out a private row
 * whose person is not that viewer.
 *
 * `IF NOT EXISTS`, so it can run twice, as `migrate.test.ts` runs every migration over itself.
 */
export default `
CREATE TABLE IF NOT EXISTS entry_private (
  entry_id  TEXT PRIMARY KEY,
  person_id TEXT NOT NULL
);
`;
