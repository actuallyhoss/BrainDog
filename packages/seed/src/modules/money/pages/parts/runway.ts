/** Lasts, and Runs out: how long the money lasts, beside the walk, calm while there is cash and red once there is none. */

/* THE CELL BOTH TILES DRAW: the day the money runs out on what is due, with the days left under it. */
export const ON_WHAT_IS_DUE = { metric: 'runs-out-on', label: 'With what is due and expected', note: 'In {{runway-days}}' };

/**
 * HOW LONG IT LASTS IF NOTHING COMES IN, the one tile's (money F3): the line over the
 * page said "19 days with no income" while this tile said "30 Oct, in 57 days", two answers to one question a screen
 * apart. The line says what there is, and this tile how long it lasts.
 *
 * ONE FIGURE AND THE SENTENCE THAT SAYS WHY, SINCE money-core 3.27.0. The tile drew "Lasts past" a day a year away
 * beside "79 days", two answers to one question with nothing saying what each assumed or what happens on the day the
 * shorter one ends. Now it is the days the money lasts with nothing coming in, and under it the day that ends on and
 * what falls due then (`lasts-no-income.on`, `.because`), naming the repeating money in that stops
 * (`every-month-in.names`). Only while the walk with what is due and expected also goes under inside the year is that
 * day said, as a sentence of its own; while it does not, the sentence goes whole (`noteOf`).
 */
export const LASTS_SAID = {
  metric: 'lasts-no-income',
  label: 'With no money coming in',
  note:
    'If all money in stopped, {{every-month-in.names}} too, it lasts to {{lasts-no-income.on}}, when {{lasts-no-income.because}} is due. ' +
    'With what comes in it still runs out on {{runs-out-on}}.',
};

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
    cells: [{ ...LASTS_SAID }],
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
 * PLACED BESIDE LASTS, when the box that took today's balance under Heads up went (its
 * old balance line says Update balances, which opens the same form) and made room on a page of twenty-four blocks, the
 * most a page may (`BLOCK_CEILING` in `packages/kernel/src/declare.ts`). `money-lasts-tile.test.ts` holds the pair.
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

/** What Money places in the side column above the accounts: the calm tile while there is cash, Runs out while none. */
export const RUNWAY: Record<string, unknown>[] = [...LASTS, ...RUNS_OUT];
