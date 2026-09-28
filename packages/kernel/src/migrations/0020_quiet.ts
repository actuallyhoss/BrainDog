/**
 * The kernel schema, migration 20: `record.quiet`, the record's quiet hours (`09 §5` rule 3, `loop/finish/contracts.md`
 * §12.1, decisions C74).
 *
 * ONE COLUMN ON THE RECORD, AND NOT A PERSON'S PREFERENCE. The digest is one schedule row for the whole record, and the
 * outbox has no column to hold a notice back per person, so a window kept per person would be a window nothing could
 * honour. The owner sets it in Settings > Notifications with `setQuietHours`.
 *
 * NULL READS AS 22:00 TO 08:00, so every record that has never been told otherwise behaves exactly as it did while the
 * window was a constant in `digest.ts`. `'off'` holds nothing back, and `{"from":"HH:MM","to":"HH:MM"}` is a window in
 * the record's own time zone (`record.tz`). `quietOf` in `digest.ts` is the one reader of what is stored here.
 *
 * NO CHECK AND NO REBUILD. The shape is held by the one method that writes it, and a CHECK over JSON would make a new
 * shape a table rebuild of the record row every other table points at, where a new shape in the reader is a line.
 */
export default `
ALTER TABLE record ADD COLUMN quiet TEXT;
`;
