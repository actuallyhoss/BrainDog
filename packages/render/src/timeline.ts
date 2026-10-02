/**
 * Which rows of a `timeline` start a day, decided once for both renderers.
 *
 * A LEDGER READ NEWEST FIRST REPEATS ITS DAY DOWN THE COLUMN. Money's "What moved" drew `1 Oct` beside four payments in
 * a row, and the eye had to read the same date four times to find where the next day began. Where two rows next to
 * each other share a day, the timeline is grouped: each day is said once, as a small heading over its rows, and the
 * rows under it leave their own date blank so their titles still start on one line.
 *
 * ONLY WHEN SOMETHING REPEATS. A timeline whose every row has a day of its own (`3h ago`, `2d ago`) is already as short
 * as it can be, and a heading over each row would double its height to say nothing new, so it is drawn as it always
 * was. The day is the first cell as written, compared trimmed: the host wrote it, and two rows the host wrote the same
 * day for are on the same day. A blank day starts no group, and its row sits under the day above it.
 */

/** For each row, the day to say over it, or null where it carries on the day above it (or the timeline is not grouped). */
export function timelineDays(rows: readonly { cells: readonly string[] }[]): (string | null)[] {
  /* Each row's day against the last day said above it, so a blank between two rows of one day does not say it twice. */
  const days = rows.map((r) => (r.cells[0] ?? '').trim());
  let last = '';
  const starts = days.map((d) => {
    const starts = d !== '' && d !== last;
    if (d !== '') last = d;
    return starts;
  });
  const grouped = days.some((d, i) => d !== '' && !starts[i]);
  if (!grouped) return days.map(() => null);
  return days.map((_, i) => (starts[i] ? (rows[i]!.cells[0] ?? '') : null));
}
