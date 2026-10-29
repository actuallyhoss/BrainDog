/** Over time: how the money has moved, the weeks behind drawn as one line. */

/**
 * THE MONEY OVER TIME, SINCE money-core 3.31.0: the hero draws the walk ahead, and nothing on Money's home said how the
 * money got here. Coin Fish's home opens on the same pair, the number and its line behind it ("fix the money page ...
 * similar visual appearance", 29 Oct).
 *
 * READ FROM THE FIGURE, NEVER WORKED OUT HERE: one cell of `net-worth` with its own remembered readings (`trend`, the
 * nightly `series.net-worth`: cash, what is owed to you and what you hold, less what you owe), so the line is the
 * figure's own past and changes with it. Its line starts the first night after money-core 3.31.0 is taken.
 *
 * THE WHOLE ROW, so the line has the width a chart wants; the app draws a one-cell stat with a trend as a chart on
 * Money's pages (`apps/web/src/lib/money/look.css`). Drawn only while there is an account to draw.
 */
/** A week of nights: net worth's line is drawn from this many on, and Cash's until then. */
const A_WEEK_OF_NIGHTS = 7;

export const OVER_TIME: Record<string, unknown>[] = [
  {
    /* CASH'S LINE UNTIL NET WORTH HAS A WEEK OF NIGHTS, SINCE money-core 3.32.0 (recheck of 30 October, N2): net worth's
       line starts the night after 3.31.0, so it said "The line fills in from tonight" over thirty nights Snapshots had
       kept, and lending it those nights' cash and bills would have drawn a drop from −£13k to −£27k that never happened.
       Cash has its own history (`series.cash-now`), so the tile draws that, said as Cash, until net worth can draw its own. */
    kind: 'stat',
    heading: 'Over time',
    icon: 'chart-line',
    span: 12,
    cells: [{ metric: 'cash-now', label: 'Cash, the last 12 weeks', trend: '12w', note: 'Net worth gets its own line once a week of nights is kept' }],
    when: { all: [{ metric: 'cash-accounts', gt: 0 }, { metric: 'net-worth-nights', lt: A_WEEK_OF_NIGHTS }] },
  },
  {
    kind: 'stat',
    heading: 'Over time',
    icon: 'chart-line',
    span: 12,
    cells: [{ metric: 'net-worth', label: 'Net worth, the last 12 weeks', trend: '12w', note: 'A plan still to pay counts once what it buys is counted' }],
    when: { all: [{ metric: 'cash-accounts', gt: 0 }, { metric: 'net-worth-nights', gte: A_WEEK_OF_NIGHTS }] },
  },
];
