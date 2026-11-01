/**
 * `deadlines`: every row of every list that falls due soon, overdue first.
 *
 * IT IS NOT A READ OF THE WHOLE RECORD, though it reads across it. Its rows are rows of named lists, so a reader who may
 * open every list that holds a deadline may be shown them all, and `registersOf` names those lists. AND IT IS ANSWERED
 * BEFORE ANY KIND READS THE BLOCK (`first`): a `table`, a `timeline` and a `todo` over it are handed the same rows, so
 * no kind module has to learn to read across the lists. Moved out of `pages.ts` with its answer unchanged
 * (`sources/index.ts`).
 */

import { refused } from '@braindog/ports';
import type { Predicate, Schema } from '@braindog/where';
import { evaluate } from '@braindog/where';

import type { Json } from '../coerce.ts';
import type { Leg } from '../forecast.ts';
import type { Entry } from '../index.ts';
import type { BlockResult, PageBlock, PageDeps, SourceKit } from '../pages.ts';
import type { Also, Source } from './index.ts';

/** The days ahead a `deadlines` block reads when it names no `horizon:`. */
const DEADLINES_HORIZON = 14;
/** The furthest ahead it reads: a year and a day, so a yearly renewal is in reach of a page that asks for it. */
const DEADLINES_HORIZON_MOST = 366;
/**
 * The rows read for each deadline field of each list, soonest first, and the most a block draws. Each list's soonest
 * rows are read, so the soonest across all of them are exact up to this many; the lists are the record's declarations.
 */
const DEADLINES_READ = 200;

/**
 * What a `deadlines` block's `where` and columns may name about one thing falling due.
 *
 * `row` IS THE ROW'S SPOKEN ID AND `list` ITS LIST, so a page narrows with `list is tasks or services` and a host opens
 * each row where it lives. `amount` and `direction` are empty on a list that holds no money.
 */
const DEADLINES: Schema = {
  register: 'deadlines',
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
 * THE ONE WORD A TABLE OVER WHAT FALLS DUE MAY GROUP BY: `when`, the stretch a row's day is in, counted from the record's
 * own today. Late, the next seven days, the seven after them, and later. Coming up drew those as four tables that said
 * "What When Amount" four times (next-money, M17); grouped, they are one table with a heading each, in that order,
 * which is the order the rows are read in (overdue first and then by day), so a group stands where its first row does.
 */
export const DEADLINES_GROUP = 'when' as const;

/** Each stretch's value and words, and the first day after it, in days from today (`null`: no end). */
const STRETCHES: readonly { value: string; name: string; before: number | null }[] = [
  { value: 'late', name: 'Late', before: 0 },
  { value: 'week', name: 'Next 7 days', before: 7 },
  { value: 'after', name: 'The 7 days after', before: 14 },
  { value: 'later', name: 'Later', before: null },
];

/** The stretch a day is in, counted from `today` (both `YYYY-MM-DD`). */
function stretchOf(day: string, today: string): { value: string; name: string } {
  const ahead = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const s = STRETCHES.find((x) => x.before === null || ahead < x.before)!;
  return { value: s.value, name: s.name };
}

/** Which field of a list is what falls due in money, and which way a row of it moves. */
type MoneyWay = { amount: string | null; way: (fields: Record<string, Json>) => 'in' | 'out' | null };

/**
 * Every leg a cash walk on this record reads, as it was written: the walks on its pages, and the figures that read a
 * walk (`source: forecast.runway` with `legs:`). What `moneyWayOf` learns a list's money from.
 */
export function legsOf(deps: PageDeps): unknown[] {
  const onPages = deps.pages().flatMap((p) =>
    (Array.isArray(p.blocks) ? p.blocks : []).flatMap((b) => (b !== null && typeof b === 'object' && b.source === 'forecast.runway' && Array.isArray(b.from) ? (b.from as unknown[]) : [])),
  );
  const inFigures = (deps.metrics?.() ?? []).flatMap((m) => (m.source === 'forecast.runway' && Array.isArray(m.legs) ? [...m.legs] : []));
  return [...onPages, ...inFigures];
}

/**
 * Which field of a list holds what falls due and which way it moves, from what the record already declares.
 *
 * A CASH WALK'S LEG OVER THE LIST SAYS BOTH (`forecast.ts` `Leg`): its `amount`, and in `incoming` the field and value
 * that mean money arriving, every other row of the leg going out. So a list the record walks is read here as the walk
 * reads it, and no module's own word for money in is written into the kernel. A list no walk reads has its one money
 * field as its amount, and says which way only by an enum of exactly `in` and `out`; any other way is `null`, never a
 * guess. A list with no money field, or several and no leg to choose, has neither.
 */
export function moneyWayOf(schema: Schema, legs: readonly unknown[]): MoneyWay {
  const money = Object.keys(schema.fields).filter((f) => schema.fields[f]!.type === 'money');
  const leg = legs.find(
    (l): l is Leg =>
      l !== null &&
      typeof l === 'object' &&
      (l as { register?: unknown }).register === schema.register &&
      typeof (l as { amount?: unknown }).amount === 'string' &&
      money.includes((l as { amount: string }).amount),
  );
  if (leg) {
    const said = leg.incoming as unknown;
    const incoming =
      said !== null && typeof said === 'object' && typeof (said as { field?: unknown }).field === 'string' && typeof (said as { is?: unknown }).is === 'string'
        ? (said as { field: string; is: string })
        : null;
    return { amount: leg.amount, way: (fields) => (incoming === null ? 'out' : fields[incoming.field] === incoming.is ? 'in' : 'out') };
  }
  const amount = money.length === 1 ? money[0]! : null;
  if (amount === null) return { amount: null, way: () => null };
  const sign = Object.keys(schema.fields).find((f) => {
    const values = schema.fields[f]!.type === 'enum' ? (schema.fields[f]!.values ?? []) : [];
    return values.length === 2 && values.includes('in') && values.includes('out');
  });
  return {
    amount,
    way: (fields) => {
      const v = sign === undefined ? undefined : fields[sign];
      return v === 'in' || v === 'out' ? v : null;
    },
  };
}

/**
 * Which rows of one list fall due on one of its day fields, as the record's cash walks say: the rows any leg over that
 * list and that day moves, or `[]` when no walk reads them, or one cannot be read here.
 *
 * WHAT THE WALK DOES NOT MOVE DOES NOT FALL DUE (the scope of 24 October). A repeating line that is paused is
 * not walked (`state is live`), and a bill that repeats is walked as its repeating line and not as itself, so listing
 * either as due said a paused fee was two weeks late and one premium twice in Due soon. Read off the legs the record
 * already declares, as `moneyWayOf` reads their money, so no module's own word for a live line is written here. A row
 * is due when ANY leg moves it, because a record walks one list in several ways (all of it, one book, the money out
 * alone), and a list no walk reads keeps every row that is not finished.
 */
export function walkedOf(schema: Schema, field: string, legs: readonly unknown[], deps: PageDeps, kit: Pick<SourceKit, 'predicateOf'>): Predicate[] {
  /* A LEG HELD BY A HOLE IS ONE PAGE'S PART OF A WALK, NOT THE RECORD'S: a book's page walks
     Money's legs held to that book, `book is {{name}}`, filled only on that page. Read here the hole names no book, and
     that one leg left the bill and its repeating line both due, one premium twice on Today. The walk it narrows is
     among the legs already. */
  const over = legs.filter(
    (l): l is Leg =>
      l !== null &&
      typeof l === 'object' &&
      (l as { register?: unknown }).register === schema.register &&
      (l as { on?: unknown }).on === field &&
      !(typeof (l as { where?: unknown }).where === 'string' && (l as { where: string }).where.includes('{{')),
  );
  if (over.length === 0) return [];
  const each: Predicate[] = [];
  for (const leg of over) {
    if (typeof leg.where !== 'string' || leg.where.trim() === '') return [];
    const said = kit.predicateOf(leg.where, schema, deps.ctx);
    if (said.bad.length || said.predicate === undefined) return [];
    each.push(said.predicate);
  }
  return [each.length === 1 ? each[0]! : { any: each }];
}

/**
 * What falls due in money on one row, its amount and currency and nothing else, or `null`.
 *
 * NOUGHT IS NO MONEY FALLING DUE (finish F1, 30 Oct): a renewal that costs nothing, a free certificate, read "£0.00" as a
 * bill on Coming up. Its day still falls due, so it stays a deadline, with no amount, and every list that asks
 * `amount is set` (Coming up, Money's calendar, Today's tile) leaves it out as one.
 */
export function moneyValue(v: Json | undefined): { amount: number; currency: string } | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && typeof v.amount === 'number' && v.amount !== 0 && typeof v.currency === 'string'
    ? { amount: v.amount, currency: v.currency }
    : null;
}

/**
 * A block over `deadlines`: every row of every list the reader may read that falls due on a field the list declares
 * `deadline: true`, is not in one of the list's `done` states, is moved by the record's cash walk where one reads that
 * day (`walkedOf`), and falls due by `horizon:` days from today, overdue
 * first and then by day.
 *
 * ONE ANSWER ACROSS THE LISTS, so Home says what is coming without naming a list: a task's `by`, a service's `renews`,
 * a bill's `due`. Each row is `{ list, row, title, day, amount, direction }`, and `state` is the row's own, so a host
 * tones it as the list's own grid does. The order is the record's, so `order:` is refused rather than ignored.
 *
 * A LIST THE READER MAY NOT READ IS LEFT OUT, when the host says who is reading (`EvalContext.reads`). When it does not,
 * every list is read and `registersOf` names each, so the record holds the block from anybody who may not read them all.
 */
function deadlinesBlock(deps: PageDeps, block: PageBlock, base: BlockResult, also: Also, kit: SourceKit): BlockResult {
  const { predicateOf, localDays, readableZone } = kit;
  if (!deps.lists)
    return { ...base, refusals: also({ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read what falls due across its lists onto a page yet.', at: 'source' }) };
  const horizon = block.horizon ?? DEADLINES_HORIZON;
  if (typeof horizon !== 'number' || !Number.isInteger(horizon) || horizon < 0 || horizon > DEADLINES_HORIZON_MOST)
    return {
      ...base,
      refusals: also({ code: 'OUT_OF_BOUNDS', fix: `horizon: on deadlines is a whole number of days ahead, from 0 to ${DEADLINES_HORIZON_MOST}.`, at: 'horizon' }),
    };
  if (block.order?.length)
    return { ...base, refusals: also({ code: 'DECLARATION_INVALID', fix: 'deadlines come overdue first and then by day, so it takes no order:.', at: 'order' }) };
  const unknown = (block.columns ?? []).map((c) => c.field).filter((f) => !Object.hasOwn(DEADLINES.fields, f));
  if (unknown.length)
    return {
      ...base,
      refusals: also({ code: 'FIELD_UNKNOWN', fix: `A deadline has no field called ${unknown.join(', ')}.`, at: 'columns', allowed: Object.keys(DEADLINES.fields) }),
    };
  const said = predicateOf(block.where, DEADLINES, deps.ctx);
  if (said.bad.length) return { ...base, refusals: also(...said.bad) };
  const limit = block.limit === undefined ? 50 : Math.min(DEADLINES_READ, Math.max(0, Math.floor(block.limit)));

  /* TODAY IS THE RECORD'S LOCAL DAY, as every `today` a predicate names is (`metrics.ts` `clockOf`). */
  const today = localDays(readableZone(deps.ctx.tz ?? deps.tz))(deps.ctx.asOfMs ?? deps.ctx.nowMs);
  const last = new Date(Date.parse(`${today}T00:00:00Z`) + horizon * 86_400_000).toISOString().slice(0, 10);
  const legs = legsOf(deps);
  const found: { day: string; list: string; seq: number; entry: Entry }[] = [];
  let counted = 0;
  for (const list of deps.lists()) {
    if (deps.ctx.reads !== undefined && !deps.ctx.reads(list.id)) continue;
    const schema = deps.schemaOf(list.id);
    if (!schema) continue;
    const dated = Object.keys(schema.fields).filter((f) => schema.fields[f]!.deadline === true && schema.fields[f]!.type === 'day');
    if (dated.length === 0) continue;
    const money = moneyWayOf(schema, legs);
    const title = deps.titleOf(list.id);
    const done = list.done ?? [];
    /* NOT FINISHED IS THE LIST'S OWN `done` STATES, read off the field it mirrors onto the state column. A row with no
       state yet is open. */
    const open: Predicate[] = schema.state !== undefined && done.length > 0 ? [{ field: schema.state, not_in: [...done] }] : [];
    for (const field of dated) {
      const walked = walkedOf(schema, field, legs, deps, kit);
      const got = deps.list({ register: list.id, where: { all: [{ field, lte: last }, ...open, ...walked] }, limit: DEADLINES_READ, order: [{ field, dir: 'asc' }] });
      if (!got.ok) return { ...base, refusals: refused(got) ? also(got.refusal) : also() };
      counted += got.value.matched;
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
            register: DEADLINES.register,
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
  /* OVERDUE FIRST AND THEN BY DAY is one order, the day's: every overdue day is before today. The list and the row's
     number settle a tie, so two reads of one record answer the same order. */
  found.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.list < b.list ? -1 : a.list > b.list ? 1 : a.seq - b.seq));
  const kept = found.map((f) => f.entry).filter((e) => evaluate(said.predicate, e.fields, DEADLINES));
  /* WITH NO `where` THE COUNT IS EVERY ROW DUE, as each list counted them; with one it is the rows read that it kept. */
  const rows = kept.slice(0, limit);
  /* GROUPED BY THE STRETCH EACH DAY IS IN, where the block says `group: when` (`DEADLINES_GROUP`), each row saying its
     own as a grouped table's row does (`PageRow.group`), so a host draws the headings where it draws any table's. */
  const grouped = block.group === DEADLINES_GROUP ? rows.map((r) => ({ ...r, group: stretchOf(String(r.fields.day), today) })) : rows;
  return { ...base, rows: grouped, matched: said.predicate === undefined ? counted : kept.length };
}

export const deadlines: Source = { first: true, read: deadlinesBlock };
