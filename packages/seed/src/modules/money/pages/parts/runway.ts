/** Lasts, and Runs out: how long the money lasts, beside the walk, calm while there is cash and red once there is none. */

/* THE CELL BOTH TILES DRAW: the day the money runs out on what is due, with the days left under it. */
const ON_WHAT_IS_DUE = { metric: 'runs-out-on', label: 'With what is due', note: 'In {{runway-days}}' };

/* AND HOW LONG IT LASTS IF NOTHING COMES IN, beside it in the one tile (the UI pass of 20 October, money F3): the line
   over the page said "19 days with no income" while this tile said "30 Oct, in 57 days", two answers to one question
   a screen apart, neither saying what the other assumed. Now both are here, each named by what it assumes, and the
   line says what there is. */
const NOTHING_IN = { metric: 'lasts-no-income', label: 'If nothing comes in' };

/**
 * HOW LONG THE MONEY LASTS, CALM, SINCE money-core 3.17.0 (REC-B07 step 8, "runway in info colour, danger only below
 * zero"). Drawn while Cash now is at or above nought, so a record whose money lasts the year reads "Lasts past 7 Oct
 * 2027" (the walk's `beyond`, drawn by the app as an answer and not as a missing figure), and one whose money runs out
 * on what is due reads the day, "30 Oct", with "In 23 days" under it. "LASTS PAST" WAITS ON THE KERNEL: until
 * `compose.ts` `drewNothing` and `drawn.ts` idle read `beyond`, a figure with no value is a block that drew nothing and
 * the rules' look hides it, so today only the day is drawn. NO TONE: money that will run out while there is
 * still cash is a thing to know, not the danger colour. AND ONCE THERE IS AN ACCOUNT, as the side column's accounts are:
 * a record holding none reads a Cash now of nought, which is not money that lasts.
 *
 * THE FIGURES ARE THE ONES RUNS OUT HAS READ SINCE money-core 3.12.0, by the same ids, so nothing moves on a record
 * that holds them: only the tile's heading, its glyph, its tone and the figure its `when:` reads.
 */
export const LASTS: Record<string, unknown>[] = [
  {
    kind: 'stat',
    heading: 'Lasts',
    icon: 'calendar',
    span: 12,
    area: 'rail',
    cells: [{ ...ON_WHAT_IS_DUE }, { ...NOTHING_IN }],
    when: { all: [{ metric: 'cash-accounts', gt: 0 }, { metric: 'cash-now', gte: 0 }] },
  },
];

/**
 * WHEN THE MONEY HAS RUN OUT, IN THE DANGER COLOUR, SINCE money-core 3.11.0, and only while Cash now is under nought
 * since 3.17.0, where it was drawn whenever the walk went under. Below nought the walk opens under and the day is
 * today, so the tile says the one thing on the page that needs the person now. A host draws a missed target in the
 * block's tone where it declares one. THE HEADING IS THE ONE IT HAD, so the block keeps its key (`defaultBlockKey`)
 * and a look that placed it still finds it.
 *
 * NOT PLACED ON MONEY YET: the page declares twenty-four blocks, the most a page may (`BLOCK_CEILING` in
 * `packages/kernel/src/declare.ts`), and a twenty-fifth refuses the whole pack at install. It is placed beside Lasts
 * (`...RUNWAY, ...RUNS_OUT`) once a block makes room, and `money-lasts-tile.test.ts` holds the pair on a page that
 * has done so.
 */
export const RUNS_OUT: Record<string, unknown>[] = [
  {
    kind: 'stat',
    heading: 'Runs out',
    icon: 'alert',
    span: 12,
    area: 'rail',
    tone: 'bad',
    cells: [{ ...ON_WHAT_IS_DUE }],
    when: { metric: 'cash-now', lt: 0 },
  },
];

/** What Money places in the side column above the accounts: the calm tile, until the page has room for Runs out. */
export const RUNWAY: Record<string, unknown>[] = [...LASTS];
