/**
 * The kernel schema, migration 41: `entry_private` travels in the `data` section with the rows it marks.
 *
 * MIGRATION 40 LEFT THE MARKS OUT OF EVERY FILE, so a record exported and put back kept every row and lost who had kept
 * it to themselves: each private row came back open to the whole team. The marks now ride beside `entry` in an export,
 * and an import writes them back. A build that does not know the table skips it, as it skips any table it has no shape
 * for, so an older reader opens the file and the format is still 1.
 *
 * `OR REPLACE`, so it can run twice, as `migrate.test.ts` runs every migration over itself.
 */
export default `
INSERT OR REPLACE INTO dog_section (table_name, section) VALUES ('entry_private', 'data');
`;
