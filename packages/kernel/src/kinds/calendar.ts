/**
 * `calendar`: the rows of a list on the days they fall, a few whole months at a time.
 *
 * OVER A LIST it names two columns, the title and the day (`columns: [title, due]`), and the day is a `day` or an
 * `instant` field. It may instead write its rows out, each `{ cells: [title, day] }`. `back:` and `ahead:` are how many
 * whole months it shows before and after this one, up to `MONTHS_MOST` each, `BACK` and `AHEAD` when it says neither.
 *
 * THE DEFAULTS ARE THE CONTRACT'S, IN THE ORDER IT NAMES THE KEYS. `loop/finish/contracts.md` §4.3 and
 * `loop/finish/pages.md` C4 both write "`ahead`, `back` ... defaults 0 and 2", so a calendar that says neither shows
 * this month and the two before it. A calendar meant to look forward says `ahead:`.
 *
 * THE KERNEL READS THE MONTHS AND THE HOST DRAWS THEM. The answer carries `window`, the first day of the first month,
 * the last day of the last and today, all in the record's own zone, and every row whose day falls between the first
 * two, so a phone's agenda and a desk's month grid are drawn from one read and neither needs a second
 * (`loop/finish/pages.md` C4).
 *
 * EVERY ROW OR NONE. A calendar that drew only the first rows it read would show empty days that are not empty, so
 * past `CALENDAR_MOST` it is refused, as a block that adds its rows up is (`pages.ts` `SUMS`), and it takes no `limit:`.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { Leaf } from '@braindog/where';

import type { KindModule } from './index.ts';
import { authoredCells, invalid, listedFault, readListed } from './listed.ts';

/** The most rows a calendar draws. One read of the record's `list` answers this many at once. */
export const CALENDAR_MOST = 500;

/** How many whole months either way a calendar may show: a year each side. */
const MONTHS_MOST = 12;

/** The months shown when the block does not say: this one, and the two before it. */
const AHEAD = 0;
const BACK = 2;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;

/** Whether a cell is a day that exists: `2026-02-30` has the shape and is no day. */
const isDay = (v: unknown): boolean => {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** A day `n` months from the month of `day`, on its first day (`edge: 'first'`) or its last. */
function monthEdge(day: string, n: number, edge: 'first' | 'last'): string {
  const m = DAY.exec(day);
  const year = m ? Number(m[1]) : 1970;
  const month = m ? Number(m[2]) - 1 : 0;
  /* DAY 0 OF THE MONTH AFTER IS THE LAST DAY OF THIS ONE, whatever its length, and `Date.UTC` carries a month past
     December into the next year, so no month is counted by hand here. */
  return new Date(edge === 'first' ? Date.UTC(year, month + n, 1) : Date.UTC(year, month + n + 1, 0)).toISOString().slice(0, 10);
}

export const calendar: KindModule = {
  /* SHARED: a `series` reads both and a `stat` or `lines` block reads `back`, each as buckets, where a calendar reads
     them as whole months (`block-keys.ts` `KEY_KINDS`). */
  keys: ['back', 'ahead'],

  validate(block, ctx) {
    for (const key of ['back', 'ahead'] as const) {
      const n = block[key];
      if (n !== undefined && !(typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MONTHS_MOST))
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `${key}: on a calendar is how many whole months it shows ${key === 'back' ? 'before' : 'after'} this one, from 0 to ${MONTHS_MOST}, and ${JSON.stringify(n)} is not.`,
          at: key,
        };
    }
    if (block.limit !== undefined)
      return invalid(
        `A calendar draws every row in its months, up to ${CALENDAR_MOST}, so it takes no limit:. Narrow it with where:, or show fewer months with back: and ahead:.`,
        'limit',
      );
    const shape = listedFault(block, 'calendar', { fewest: 2, most: 2, said: 'two columns, the title and the day each row falls on, such as columns: [title, due]' }, ctx.stage);
    if (shape) return shape;
    /* THE DAY IS CHECKED AND THE COUNT OF CELLS IS NOT: a row with a cell too many degrades where it is drawn, as
       `declare.ts` says every written-out row does (`05 §2.1`), and a row with no day has nowhere to be drawn at all. */
    for (const cells of authoredCells(block) ?? [])
      if (!isDay(cells[1]))
        return invalid('A calendar row written out is its title and then its day, such as { cells: [Rent, 2026-10-01] }.', 'authored');
    return null;
  },

  read(deps, block, base) {
    const kit = deps.kit;
    if (!kit) return { ...base, refusals: [...base.refusals, { code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read a calendar onto a page yet.', at: 'kind' }] };
    const today = kit.today();
    const window = {
      from: monthEdge(today, -(block.back ?? BACK), 'first'),
      to: monthEdge(today, block.ahead ?? AHEAD, 'last'),
      today,
    };
    /* ROWS WRITTEN OUT ARE THE AUTHOR'S, drawn as written: the window says which months the host draws them in. */
    if (!block.source) return { ...base, window };

    const day = block.columns?.[1]?.field ?? '';
    const from: Leaf = { field: day, gte: window.from };
    const to: Leaf = { field: day, lte: window.to };
    /* `matched` COUNTS EVERY ROW IN THE MONTHS, whatever was handed back, so a list with more than a calendar draws is
       told apart from one with exactly that many without asking for one past the ceiling. */
    const listed = readListed(deps, block, 'calendar', {
      rules: [null, { types: ['day', 'instant'], said: 'the day each row falls on, a day or an instant field' }],
      limit: CALENDAR_MOST,
      within: { all: [from, to] },
      order: [{ field: day, dir: 'asc' }],
    });
    if ('refusals' in listed) return { ...base, window, refusals: [...base.refusals, ...listed.refusals] };
    if (listed.matched > CALENDAR_MOST)
      return {
        ...base,
        window,
        refusals: [
          ...base.refusals,
          {
            code: 'OUT_OF_BOUNDS',
            fix: `A calendar draws every row in its months, and ${listed.register} has ${listed.matched} in these where a calendar draws ${CALENDAR_MOST}. Narrow it with where:, or show fewer months with back: and ahead:.`,
            at: 'where',
          },
        ],
      };
    return { ...base, window, rows: listed.rows, matched: listed.matched };
  },
};
