/**
 * `calendar`: the rows of a list on the days they fall, a few whole months at a time.
 *
 * OVER A LIST it names two columns, the title and the day (`columns: [title, due]`), and the day is a `day` or an
 * `instant` field. A THIRD COLUMN IS THE ROW'S AMOUNT (`columns: [title, due, amount]`), said at the right of its line in
 * the list the host draws, in the money writer's figure (`packages/render/src/money.ts`); it is a field of the list, any
 * type, and a row whose field is empty says none. It may instead write its rows out, each `{ cells: [title, day] }`. `back:` and `ahead:` are how many
 * whole months it shows before and after this one, up to `MONTHS_MOST` each, `BACK` and `AHEAD` when it says neither.
 *
 * OR A STRIP OF WEEKS: `weeks:` is how many whole weeks it shows from the Monday of this one, 1 to `WEEKS_MOST`, read
 * in the record's own zone as `today` is. It stands in place of `back:` and `ahead:`, never beside them, and the answer
 * says `weeks` so a host draws the strip and not the months (`packages/render/src/calendar.ts` `calendarStripPlan`).
 *
 * THE DEFAULTS ARE THE CONTRACT'S, IN THE ORDER IT NAMES THE KEYS: "`ahead`, `back` ... defaults 0 and 2", so a
 * calendar that says neither shows this month and the two before it. A calendar meant to look forward says `ahead:`.
 *
 * THE KERNEL READS THE MONTHS AND THE HOST DRAWS THEM. The answer carries `window`, the first day of the first month,
 * the last day of the last and today, all in the record's own zone, and every row whose day falls between the first
 * two, so a phone's agenda and a desk's month grid are drawn from one read and neither needs a second.
 *
 * OVER WHAT FALLS DUE it says `source: deadlines` and `columns: [title, day]`, or `[title, day, amount]` to say each
 * line's money, and reads what a table over that source reads (`sources/deadlines.ts`): every list's `deadline: true`
 * day fields that the record's cash walk moves, a row in one of its list's `done` states left out, and a list the reader
 * may not read left out whole. What differs is which days: a table reads from the
 * oldest overdue row to `horizon:` days ahead, and a calendar reads its months, so it is read here and `across` tells
 * `pages.ts` not to answer the source first.
 *
 * EVERY ROW OR NONE. A calendar that drew only the first rows it read would show empty days that are not empty, so
 * past `CALENDAR_MOST` it is refused, as a block that adds its rows up is (`pages.ts` `SUMS`), and it takes no `limit:`.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import { refused } from '@braindog/ports';
import type { Leaf, Predicate, Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps } from '../pages.ts';
import type { KindModule } from './index.ts';
import { KIND_KEYS } from './keys.ts';
import { authoredCells, invalid, listedFault, readListed } from './listed.ts';
/* A LEAF STILL: the source imports nothing of the kernel at run time, only `ports` and `where`, as this file does. */
import { legsOf, moneyValue, moneyWayOf, walkedOf } from '../sources/deadlines.ts';

/** The source that is every list's deadlines, as a page names it (`sources/deadlines.ts`). */
const ACROSS = 'deadlines';

/**
 * What a calendar over `deadlines` may name in `where:`, and its columns' types: the source's own words for one thing falling
 * due. `row` is the row's spoken id and `list` its list, so a page narrows with `list is <id>` here exactly as a table
 * over the source does.
 *
 * AND ITS MONEY, SINCE THE AUDIT OF 25 OCTOBER (Z14): the amount and the way it goes, read as the source reads them
 * (`moneyWayOf`), so Money's calendar of the next thirty days says `amount is set` and draws what Today's Due soon draws.
 */
const DUE: Schema = {
  register: ACROSS,
  fields: {
    list: { type: 'text' },
    row: { type: 'text' },
    title: { type: 'text' },
    day: { type: 'day' },
    amount: { type: 'money' },
    direction: { type: 'enum', values: ['in', 'out'] },
  },
};

/**
 * The columns of a calendar over `deadlines`: what falls due and its day, and its amount third if it is to say one. A
 * day's line is drawn from the first, and `row` and `list` are ids (`tasks#2`, `tasks`), which a person is never shown
 * in place of a name. They stay words of `where:`.
 */
const DUE_COLUMNS = ['title', 'day', 'amount'];
const DUE_SAID = 'A calendar over deadlines names what falls due and its day, and its amount third if it is to say one, as columns: [title, day] or [title, day, amount].';

const overDue = (fix: string, at: string): BlockResult['refusals'][number] => ({ code: 'OUT_OF_BOUNDS', fix, at });

/** The most rows a calendar draws. One read of the record's `list` answers this many at once. */
export const CALENDAR_MOST = 500;

/** How many whole months either way a calendar may show: a year each side. */
const MONTHS_MOST = 12;

/** How many whole weeks a strip may show: two months of them. */
const WEEKS_MOST = 8;

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

/** The Monday on or before `day`, the first day of its week, as `buckets.ts` and `render/src/days.ts` start one. */
function mondayOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const at = Number.isFinite(t) ? new Date(t) : new Date(0);
  return new Date(at.getTime() - ((at.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

/** A day `n` days after `day`. */
const daysAfter = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The block's `weeks:`, which `PageBlock` does not name yet, read as whatever was written. */
const weeksOf = (block: PageBlock | Readonly<Record<string, unknown>>): unknown => (block as { weeks?: unknown }).weeks;

/** How a calendar too full for its window is told to show less: by the form it was written in. */
const fewer = (block: PageBlock | Readonly<Record<string, unknown>>): string => (weeksOf(block) === undefined ? 'show fewer months with back: and ahead:' : 'show fewer weeks with weeks:');

/**
 * The months of a calendar over `deadlines`: every row of every list the reader may read whose deadline falls inside
 * `window` and that is not finished, by day.
 *
 * THE SAME ROWS AS THE SOURCE'S, IN ITS SHAPE (`sources/deadlines.ts`): one `{ list, row, title, day }` a deadline
 * field, the row's own `state` beside it, so a host tones and opens each as it does under a table. A row holding two
 * deadlines is drawn on both days.
 *
 * A LIST THE READER MAY NOT READ IS LEFT OUT, when the host says who is reading (`EvalContext.reads`). When it does
 * not, every list is read and `registersOf` names each (`pages.ts` `acrossLists`), so the record holds the block from
 * anybody who may not read them all.
 */
function readAcross(deps: PageDeps, block: PageBlock, base: BlockResult, window: { from: string; to: string; today: string }): BlockResult {
  const stop = (...more: BlockResult['refusals']): BlockResult => ({ ...base, window, refusals: [...base.refusals, ...more] });
  const kit = deps.kit;
  if (!kit || !deps.lists) return stop({ code: 'NOT_IN_THIS_BUILD', fix: 'This record does not read what falls due across its lists onto a calendar yet.', at: 'source' });
  const said = kit.predicateOf(block.where, DUE, deps.ctx);
  if (said.bad.length) return stop(...said.bad);

  const found: { day: string; list: string; seq: number; entry: Entry }[] = [];
  let counted = 0;
  /* THE CASH WALK'S LEGS, read once, as the source reads them: which rows the walk moves, and the money on each. */
  const legs = legsOf(deps);
  for (const list of deps.lists()) {
    if (deps.ctx.reads !== undefined && !deps.ctx.reads(list.id)) continue;
    const schema = deps.schemaOf(list.id);
    if (!schema) continue;
    const dated = Object.keys(schema.fields).filter((f) => schema.fields[f]!.deadline === true && schema.fields[f]!.type === 'day');
    if (dated.length === 0) continue;
    const title = deps.titleOf(list.id);
    const done = list.done ?? [];
    const money = moneyWayOf(schema, legs);
    /* NOT FINISHED IS THE LIST'S OWN `done` STATES, as the source reads it. A row with no state yet is open. */
    const open: Predicate[] = schema.state !== undefined && done.length > 0 ? [{ field: schema.state, not_in: [...done] }] : [];
    for (const field of dated) {
      /* WHAT THE WALK DOES NOT MOVE DOES NOT FALL DUE, as on Due soon (the audit of 25 October, Z14): a bill that repeats
         is drawn once, on its line, and a paused line not at all. */
      const walked = walkedOf(schema, field, legs, deps, kit);
      const got = deps.list({
        register: list.id,
        where: { all: [{ field, gte: window.from }, { field, lte: window.to }, ...open, ...walked] },
        limit: CALENDAR_MOST,
        order: [{ field, dir: 'asc' }],
      });
      if (!got.ok) return stop(...(refused(got) ? [got.refusal] : []));
      counted += got.value.matched;
      /* PAST THE CEILING BEFORE `where:` IS ASKED, because the sentence is read over the rows in hand and these are
         not all of them: a calendar that narrowed a part of a list would show empty days that are not empty. */
      if (counted > CALENDAR_MOST)
        return stop(
          overDue(
            `A calendar draws every row in its days, and more than ${CALENDAR_MOST} things fall due in these. Narrow it with where:, or ${fewer(block)}.`,
            'source',
          ),
        );
      for (const r of got.value.rows) {
        const day = r.fields[field];
        if (typeof day !== 'string' || r.seq === null) continue;
        const named = title !== null && Object.hasOwn(r.fields, title) ? r.fields[title] : undefined;
        const amount = money.amount !== null && Object.hasOwn(r.fields, money.amount) ? moneyValue(r.fields[money.amount]) : null;
        found.push({
          day: day.slice(0, 10),
          list: list.id,
          seq: r.seq,
          entry: {
            id: `${r.id}:${field}`,
            register: ACROSS,
            seq: null,
            fields: {
              list: list.id,
              row: `${list.id}#${r.seq}`,
              title: typeof named === 'string' ? named : typeof named === 'number' || typeof named === 'boolean' ? String(named) : '',
              day: day.slice(0, 10),
              amount,
              direction: amount === null ? null : money.way(r.fields),
            },
            state: r.state,
            version: r.version,
            created_at: r.created_at,
            updated_at: r.updated_at,
            deleted_at: null,
          },
        });
      }
    }
  }
  /* BY DAY, the list and the row's number settling a tie, so two reads of one record answer the same order. */
  found.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.list < b.list ? -1 : a.list > b.list ? 1 : a.seq - b.seq));
  const rows = found.map((f) => f.entry).filter((e) => evaluate(said.predicate, e.fields, DUE));
  return { ...base, window, rows, matched: rows.length };
}

/**
 * `across` IS THE SOURCES THIS KIND READS ITSELF THOUGH EACH SAYS `first` (`sources/index.ts`): `pages.ts` answers a
 * `first` source before any kind is asked, which hands a calendar a table's days and no `window`, so it asks here.
 */
export const calendar: KindModule & { across: readonly string[] } = {
  across: [ACROSS],

  /* SHARED: a `series` reads both and a `stat` or `lines` block reads `back`, each as buckets, where a calendar reads
     them as whole months (`block-keys.ts` `KEY_KINDS`). */
  keys: KIND_KEYS.calendar,

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
    const weeks = weeksOf(block);
    if (weeks !== undefined) {
      if (!(typeof weeks === 'number' && Number.isInteger(weeks) && weeks >= 1 && weeks <= WEEKS_MOST))
        return {
          code: 'OUT_OF_BOUNDS',
          fix: `weeks: on a calendar is how many whole weeks it shows from this one, from 1 to ${WEEKS_MOST}, and ${JSON.stringify(weeks)} is not.`,
          at: 'weeks',
        };
      /* ONE FORM OR THE OTHER: a strip from this week and months either side of this one are two calendars, and a block
         saying both would draw neither as its author meant. */
      if (block.back !== undefined || block.ahead !== undefined)
        return invalid(
          'A calendar shows whole months with back: and ahead:, or whole weeks from this one with weeks:, and this one says both. Take one off.',
          block.back !== undefined ? 'back' : 'ahead',
        );
    }
    if (block.limit !== undefined)
      return invalid(
        `A calendar draws every row in its days, up to ${CALENDAR_MOST}, so it takes no limit:. Narrow it with where:, or ${fewer(block)}.`,
        'limit',
      );
    /* OVER `deadlines` THE SHARED CHECK IS ASKED ABOUT THE KEYS ALONE, since it knows a source only as a list: it is
       handed the block as one that names no list, and the source's own columns are checked here. */
    const across = block.source === ACROSS;
    const shape = listedFault(
      across ? { ...block, source: undefined, authored: [] } : block,
      'calendar',
      { fewest: 2, most: 3, said: 'two or three columns, the title, the day each row falls on and, if it is to say one, an amount, such as columns: [title, due, amount]' },
      ctx.stage,
    );
    if (shape) return shape;
    if (across) {
      const named = Array.isArray(block.columns) ? (block.columns as unknown[]).map((c) => (c !== null && typeof c === 'object' ? (c as { field?: unknown }).field : undefined)) : [];
      if (named.length < 2 || named.length > 3 || named.some((f, i) => f !== DUE_COLUMNS[i])) return invalid(DUE_SAID, 'columns', DUE_COLUMNS);
      if (Array.isArray(block.order) && block.order.length > 0) return invalid('A calendar over deadlines comes by day, so it takes no order:.', 'order');
      if (block.authored !== undefined) return invalid('A calendar reads deadlines or writes its rows out with authored:, and this one does both. Take one off.', 'authored');
    }
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
    const weeks = weeksOf(block);
    /* A STRIP IS WHOLE WEEKS FROM THIS MONDAY, the days of this week already gone among them, so the week reads whole
       and today sits on its own weekday; months are whole months either side of this one. */
    const strip = typeof weeks === 'number' ? weeks : null;
    const window =
      strip === null
        ? { from: monthEdge(today, -(block.back ?? BACK), 'first'), to: monthEdge(today, block.ahead ?? AHEAD, 'last'), today }
        : { from: mondayOf(today), to: daysAfter(mondayOf(today), 7 * strip - 1), today };
    /* THE ANSWER SAYS `weeks`, so a host draws the strip from it and never works out the form from the window. */
    const said = (out: BlockResult): BlockResult => (strip === null ? out : Object.assign(out, { weeks: strip }));
    /* ROWS WRITTEN OUT ARE THE AUTHOR'S, drawn as written: the window says which days the host draws them in. */
    if (!block.source) return said({ ...base, window });
    if (block.source === ACROSS) return said(readAcross(deps, block, base, window));

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
    if ('refusals' in listed) return said({ ...base, window, refusals: [...base.refusals, ...listed.refusals] });
    if (listed.matched > CALENDAR_MOST)
      return said({
        ...base,
        window,
        refusals: [
          ...base.refusals,
          {
            code: 'OUT_OF_BOUNDS',
            fix: `A calendar draws every row in its days, and ${listed.register} has ${listed.matched} in these where a calendar draws ${CALENDAR_MOST}. Narrow it with where:, or ${fewer(block)}.`,
            at: 'where',
          },
        ],
      });
    return said({ ...base, window, rows: listed.rows, matched: listed.matched });
  },
};
