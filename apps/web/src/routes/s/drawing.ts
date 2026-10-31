/**
 * HOW A SHARED BLOCK IS DRAWN: the way the app draws the same block, from the same render components (SL1).
 *
 * The app writes each block it reads into the renderer's own dialect, one fence and a row a line (`blocks.ts`
 * `drawSegments`), and hands the parse to `Block`: a project's figures are a `stat`, its cards a `cards` grid, its work a
 * `todo` or a `roadmap`, and a list with columns the renderer's `Table`, which on a phone is a card a row. The shared
 * page drew every one of them as a table of its own, so on a phone each row was a stack of labels over values.
 *
 * SO THIS WRITES THE SAME DIALECT from what the link was sent, and nothing else: each cell is said as the shared page
 * already says it (`cellSaid`, `figureSaid`), in the record's language, zone and home currency, and no row is given a
 * link, a reference or anything to press. A fence the renderer cannot read falls back to the renderer's table, so a
 * block is never lost to its drawing.
 */

import { dateSaid, kindSpec, parse, type Segment } from 'braindog-render';
import type { Column, TableRow } from 'braindog-render/svelte';

import { latestText, linesAndLatest, linesText } from '../../lib/record/measures.ts';
import { fieldSaid, type SharedColumn, type SharedPart, type SharedReading, type SharedRow } from '../../lib/record/share-write.ts';
import { cellSaid, figureSaid, moneySaid, plainSaid, trendLine, type Said, type Shown, type Where } from './reading.ts';

/** What one shared block draws: the renderer's segments, the renderer's table, or both (figures over a list). */
export type Drawing = { segments: Segment[]; table: { columns: Column[]; rows: TableRow[] } | null; authored: boolean };

/** A said value as one line of words. */
const textOf = (s: Said): string => ('money' in s ? s.money.text : s.text);

/**
 * A cell as the dialect holds one: one line, its own pipes and backslashes escaped, as `blocks.ts` writes a cell. AND
 * NEVER A LINE THAT CLOSES THE FENCE (RH15): a row whose first cell is three backticks or more read as the fence's end,
 * and every row after it as page words. The dialect has no escape for a backtick, so an invisible space goes after the
 * first one, and the cell still reads as written.
 */
export const escapeCell = (c: string): string =>
  c.replace(/\s*[\r\n]+\s*/gu, ' ').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replace(/^`(?=``)/u, '`\u200b');

/**
 * THE STATES A ROW IS FINISHED IN, which a shared `todo` ticks: the block's lists' own `done:`, as the record sends it
 * (SB2), the same list the app ticks by. Only a record that sends none is read by these words, the ones the seed's and
 * the packs' lists finish in; any other state is an open box.
 */
const finishedIn = (b: Shown['block']): ReadonlySet<string> => (b.done === null ? DONE : new Set(b.done));
const DONE = new Set(['done', 'paid', 'closed', 'cancelled', 'canceled', 'complete', 'completed', 'shipped', 'resolved', 'won', 'lost', 'retired', 'finished', 'archived']);

/**
 * A CARD'S COST OF NOTHING IS "Free", as the app says it (`freeSaid` in `page-live.ts`, AG22; AJ13): only a figure whose
 * field is named for what something costs and holds an amount of nought. A link read "£0" over "Cost".
 */
const freeOf = (row: SharedRow, c: SharedColumn, role: string): string | null => {
  if (role !== 'figure' || !/^(cost|price|fee)$/u.test(c.field)) return null;
  const cell = row.cells[c.field];
  const v = cell?.type === 'money' ? (cell.value as { amount?: unknown } | null) : null;
  return v !== null && typeof v === 'object' && v.amount === 0 ? 'Free' : null;
};

/** The kinds whose cells are a list's fields in the declared order, each a place (`projectRows` in `blocks.ts`). */
const PLACED: ReadonlySet<string> = new Set(['todo', 'steps', 'timeline', 'board', 'roadmap', 'lanes', 'calendar', 'spec', 'params', 'heat']);

/** The most of each card role a card may hold (`braindog-render`'s `cards.ts`): one of each, three facts. */
const ONE_ROLES = ['title', 'figure', 'trend', 'ring', 'who', 'when', 'mark', 'next', 'reply', 'hue', 'picture', 'quiet'] as const;

/** A block's own columns, every one, with the label the owner reads: a placed kind's cells are its places. */
const allColumns = (s: Shown): (SharedColumn & { label: string })[] =>
  s.block.columns.length > 0 ? s.block.columns.map((c) => ({ ...c, label: c.label ?? fieldSaid(c.field) })) : s.columns;

/** One fence, parsed as the app parses a page's (`page: true`), or `null` for one the renderer degraded. */
function fenced(head: string, rows: readonly string[]): Segment[] | null {
  const out = parse(['```' + head, ...rows, '```'].join('\n'), { page: true });
  return out.some((s) => s.type === 'degraded') || !out.some((s) => s.type === 'block') ? null : out;
}

/**
 * THE FIGURES AS THE APP'S `stat`: `label | value | note | trend`, the trend a run of whole numbers from three points
 * (`trendCell` in `blocks.ts`), money in whole units since the line's name reads its numbers out.
 */
function statRows(s: Shown, where: Where): string[] {
  return s.block.readings.map((r) => {
    const line = trendLine(r);
    const money = r.unit !== null && /^[A-Z]{3}$/u.test(r.unit);
    const run = line === null ? '' : ` | ${line.map((v) => (Number.isFinite(v) ? String(money ? Math.round(v / 100) : v) : '-')).join(' ')}`;
    return `${escapeCell(r.label ?? fieldSaid(r.metric))} | ${escapeCell(textOf(figureSaid(r, where)))} | ${run}`;
  });
}

/**
 * A CARD GRID AS THE APP'S: a head naming what each column is on a card (`role: label`), then a card a row. A column
 * with no role is a fact, the first text column names a card that has neither a title nor a person, and past what a
 * card holds (one of each, three facts) a column is left off rather than the grid degraded. EACH CARD'S TREND, when the
 * record sent one (`trends`), is the card's line, from three points.
 */
function cardRows(s: Shown, where: Where): string[] | null {
  const columns = allColumns(s);
  if (columns.length === 0) return null;
  const roles: (string | null)[] = columns.map((c) => (c.as && c.as !== 'chip' ? c.as : null));
  if (!roles.includes('title') && !roles.includes('who')) {
    const free = roles.findIndex((r) => r === null);
    if (free >= 0) roles[free] = 'title';
  }
  const seen = new Map<string, number>();
  const kept = roles.map((r) => {
    const role = r ?? 'fact';
    const n = (seen.get(role) ?? 0) + 1;
    seen.set(role, n);
    const most = (ONE_ROLES as readonly string[]).includes(role) ? 1 : role === 'fact' ? 3 : 0;
    return n <= most ? role : null;
  });
  const at = columns.flatMap((c, i) => (kept[i] === null ? [] : [{ c, role: kept[i]! }]));
  /* A LINE IS DRAWN UNDER ITS NAME (`cardTrend`), so a run the record sent with no name is no line. */
  const named = s.block.trendLabel ?? null;
  const trended = named !== null && !kept.includes('trend') && s.rows.some((r) => (r.trend?.filter((v) => v !== null).length ?? 0) >= 3);
  const head = [...at.map(({ c, role }) => escapeCell(`${role}: ${c.label}`)), ...(trended ? [escapeCell(`trend: ${named}`)] : [])].join(' | ');
  const rows = s.rows.map((row) => {
    const cells = at.map(({ c, role }) => escapeCell(freeOf(row, c, role) ?? textOf(cellSaid(row, c, where))));
    if (trended) {
      const run = row.trend ?? [];
      cells.push(run.filter((v) => v !== null).length >= 3 ? run.map((v) => (v === null ? '-' : String(v))).join(' ') : '');
    }
    return cells.join(' | ');
  });
  return [head, ...rows];
}

/** The kinds that place a row on a calendar by its day, which their drawer reads as `2026-09-12` (`calendar.ts`, `roadmap.ts`). */
const DATED: ReadonlySet<string> = new Set(['roadmap', 'calendar', 'lanes', 'heat']);

/** Seconds in each unit a duration is declared in, and the dialect's own letter for it (`roadmap.ts` `EFFORT`). */
const UNIT_SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };

/**
 * One cell as a dated kind's drawer reads it: a day as the day itself and a length of time in its field's unit, "0.2 d",
 * since the plan draws a task's window from them and "30 Aug" or "5 hours" is no window. Anything else as it is said.
 */
function datedCell(row: SharedRow, c: SharedColumn, where: Where): string {
  const cell = row.cells[c.field];
  if (cell?.type === 'day' && typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(cell.value)) return cell.value;
  if (cell?.type === 'duration' && typeof cell.value === 'number' && Number.isFinite(cell.value)) {
    const unit = cell.unit !== undefined && Object.hasOwn(UNIT_SECONDS, cell.unit) ? cell.unit : 'd';
    return `${Math.round((cell.value / UNIT_SECONDS[unit]!) * 100) / 100} ${unit}`;
  }
  return textOf(cellSaid(row, c, where));
}

/** A placed kind's rows, each field in its place and a `todo`'s box ticked where its row is finished. */
function placedRows(s: Shown, cells: number, checkbox: boolean, where: Where): string[] {
  const columns = allColumns(s).slice(0, cells);
  const dated = DATED.has(s.block.kind);
  const finished = finishedIn(s.block);
  return s.rows.map((row) => {
    const out = Array.from({ length: cells }, (_, n) => {
      const c = columns[n];
      return c === undefined ? '' : escapeCell(dated ? datedCell(row, c, where) : textOf(cellSaid(row, c, where)));
    });
    if (checkbox) out[0] = `[${row.state !== null && finished.has(row.state) ? 'x' : ' '}] ${out[0] ?? ''}`;
    return out.join(' | ');
  });
}

/** Whether a column holds figures, by what its cells hold: an amount, a number, a count or a length of time. */
const figured = (s: Shown, c: SharedColumn): boolean =>
  s.rows.some((r) => ['money', 'int', 'decimal', 'quantity', 'duration'].includes(r.cells[c.field]?.type ?? ''));

/**
 * THE RENDERER'S TABLE, as the app draws a list with columns: a grid at a desk, a card a row on a phone (`rowsAsCards`).
 * A column of figures ends and never truncates, as the app's money and counts do; words start.
 */
function tableOf(s: Shown, where: Where): Drawing['table'] {
  if (s.columns.length === 0 || s.rows.length === 0) return null;
  const columns: Column[] = s.columns.map((c, i) => {
    const figure = figured(s, c);
    return { field: c.field, label: c.label, width: i === 0 ? 'minmax(0, 2fr)' : figure ? 'minmax(max-content, 1fr)' : 'minmax(0, 1fr)', align: figure ? 'end' : 'start', truncate: figure ? 'never' : 'end' };
  });
  /* A COLUMN OF AMOUNTS IS WRITTEN ALIKE (`moneySet`): all whole and none shows its pence, "EGP 1,350" over "EGP 600";
     one with pence and every one shows two places, so the digits line up. A link wrote "EGP 1,350.00" on every line. */
  const pence = new Set(
    s.columns
      .filter((c) => s.rows.some((r) => { const said = cellSaid(r, c, where); return 'money' in said && said.money.fraction !== ''; }))
      .map((c) => c.field),
  );
  const finished = finishedIn(s.block);
  const today = todayIn(where);
  const rows: TableRow[] = s.rows.map((row, n) => ({
    key: `r${n}`,
    cells: s.columns.map((c) => dueSaid(row, c, finished, today) ?? (textOf(cellSaid(row, c, pence.has(c.field) ? { ...where, pence: true } : where)) || null)),
  }));
  return { columns, rows };
}

/**
 * A ROW DUE SOON SAYS WHEN IN ITS DEADLINE'S CELL, as the app's table says it (`soonSaid` in `page-live.ts`): "Due today",
 * "Due tomorrow" or "Due in 6 days" for a row not finished and due in the next two weeks, where a link said "6 Nov". A
 * late row and one further off keep their day. `null` for any other cell.
 */
function dueSaid(row: SharedRow, c: SharedColumn, finished: ReadonlySet<string>, today: string): string | null {
  const cell = row.cells[c.field];
  if (c.deadline !== true || cell?.type !== 'day' || typeof cell.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(cell.value)) return null;
  if (row.state !== null && finished.has(row.state)) return null;
  const days = Math.round((Date.parse(`${cell.value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0 || days >= 14) return null;
  return days === 0 ? DUE_WORDS.today : days === 1 ? DUE_WORDS.tomorrow : DUE_WORDS.inDays(days);
}

/** A close deadline's words, the app's (`DUE_WORDS` in `page-live.ts`). */
const DUE_WORDS = { today: 'Due today', tomorrow: 'Due tomorrow', inDays: (n: number): string => `Due in ${n} days` } as const;

const CURRENCY = /^[A-Z]{3}$/u;

/** A part's words: the record's label, else its key with a capital where it was typed all in small letters (`page-live.ts`). */
const partName = (g: SharedPart): string => g.label?.trim() || (/\p{Lu}/u.test(g.key) ? g.key : g.key.charAt(0).toUpperCase() + g.key.slice(1));

/** An amount in minor units as a cell says it ("£7,000", "−£1,240"), or `null` where the unit is no currency. */
const amountSaid = (minor: number, unit: string | null | undefined, where: Where): string | null =>
  typeof unit === 'string' && CURRENCY.test(unit) ? (moneySaid(Math.round(minor), unit, 'exact', where.home ?? null)?.text ?? null) : null;

/**
 * A BAR OVER A FIGURE CUT INTO PARTS AS THE APP'S (`partsRows` in `blocks.ts`, AL12): an account a row with its own
 * amount, largest first as the record sent them, where a link drew the figure's whole, "What each account holds £32,610",
 * under a Cash now of £33,850 with no word that the card's bill is taken off it. Each account now says its own amount,
 * the card's in its minus. `null` for a block that is not one.
 */
function partsDrawn(s: Shown, where: Where): string[] | null {
  const b = s.block;
  if ((b.kind !== 'bar' && b.kind !== 'split') || s.rows.length > 0 || b.readings.length !== 1) return null;
  const r = b.readings[0]!;
  const parts = (r.groups ?? []).filter((g): g is SharedPart & { value: number } => g.value !== null);
  if (parts.length === 0) return null;
  return parts.map((g) => `${escapeCell(partName(g))} | ${escapeCell(amountSaid(g.value, r.unit, where) ?? textOf(figureSaid({ ...r, value: g.value }, where)))} | `);
}

/**
 * A BUDGET AS THE APP DRAWS ONE (`progressRows` in `blocks.ts`, AL6): each category's spending this month against its
 * limit, "£0 of £7,000" and "£7,000 left", from what the record matched to each row (`spent`). A link drew the spending
 * figure's whole as a bare "0" over a table headed "Most to spend" whose limits read as money spent.
 */
function budgetDrawn(s: Shown, where: Where): string[] | null {
  const b = s.block;
  if (b.kind !== 'progress' || b.toward === true || s.rows.length === 0 || !s.rows.some((r) => r.spent !== undefined)) return null;
  const [name, limit] = allColumns(s);
  if (name === undefined || limit === undefined) return null;
  const rows = s.rows.flatMap((row) => {
    const cap = row.cells[limit.field];
    const own = cap?.type === 'money' && cap.value !== null && typeof cap.value === 'object' ? (cap.value as { currency?: unknown }).currency : undefined;
    const unit = b.readings[0]?.unit ?? (typeof own === 'string' ? own : null);
    const spent = amountSaid(row.spent ?? 0, unit, where);
    const most = textOf(cellSaid(row, limit, where));
    return spent === null || most === '' ? [] : [`${escapeCell(textOf(cellSaid(row, name, where)))} | ${escapeCell(spent)} | ${escapeCell(most)} | `];
  });
  return rows.length > 0 ? rows : null;
}

/**
 * GOALS AS THE APP DRAWS THEM (`progressRows` in `blocks.ts`, a goal's reading): each goal's aim against what was logged
 * toward it, "29.5 of 100" over "km", from what the record matched to each row (`spent`, `toward`). A link drew the
 * figure's whole, "Logged this week, by goal 11.5", over a table of aims, so a habit's week read as every run logged.
 */
function goalsDrawn(s: Shown, where: Where): string[] | null {
  const b = s.block;
  if (b.kind !== 'progress' || b.toward !== true || s.rows.length === 0) return null;
  const [name, aim, note] = allColumns(s);
  if (name === undefined || aim === undefined) return null;
  const unit = b.readings[0]?.unit ?? null;
  const rows = s.rows.map((row) => {
    const part = row.spent ?? 0;
    const own = row.cells[aim.field];
    const currency = unit !== null && CURRENCY.test(unit) ? unit : own?.type === 'money' && isAmount(own.value) ? own.value.currency : null;
    const logged = currency === null ? String(Math.round(part * 100) / 100) : (amountSaid(part, currency, where) ?? String(part));
    const noted = note === undefined ? '' : textOf(cellSaid(row, note, where));
    return `${escapeCell(textOf(cellSaid(row, name, where)))} | ${escapeCell(logged)} | ${escapeCell(textOf(cellSaid(row, aim, where)))} | ${escapeCell(noted)}`;
  });
  return rows.length > 0 ? rows : null;
}

/** Whether a value is an amount as a money cell holds one. */
const isAmount = (v: unknown): v is { amount: number; currency: string } =>
  v !== null && typeof v === 'object' && typeof (v as { amount?: unknown }).amount === 'number' && typeof (v as { currency?: unknown }).currency === 'string';

/**
 * A COUNT AS THE APP DRAWS IT (`progressRows` in `blocks.ts`, the third reading): the rows grouped by the first column,
 * each group filled by how many say yes in the second, or are in a state the list counts finished. "Garden shed 2 of 4"
 * and "Sprint 14 1 of 5", where a link drew a table of "No, No, Yes, Yes" under "Done".
 */
function countsDrawn(s: Shown, where: Where): string[] | null {
  const b = s.block;
  if (b.kind !== 'progress' || b.toward === true || b.rows.length === 0 || b.rows.some((r) => r.spent !== undefined)) return null;
  const [label, value] = allColumns(s);
  if (label === undefined || value === undefined) return null;
  const finished = finishedIn(b);
  const kinds = new Set(b.rows.map((r) => r.cells[value.field]?.type ?? typeof r.fields[value.field]));
  const yes = (r: SharedRow): boolean | null => {
    const v = r.cells[value.field]?.value ?? r.fields[value.field];
    if (typeof v === 'boolean') return v;
    return kinds.has('enum') && typeof v === 'string' ? finished.has(v) : null;
  };
  if (!b.rows.every((r) => yes(r) !== null || (r.cells[value.field] === undefined && r.fields[value.field] === undefined))) return null;
  if (!kinds.has('bool') && !kinds.has('boolean') && !kinds.has('enum')) return null;
  const groups = new Map<string, { done: number; all: number }>();
  for (const r of b.rows) {
    const key = textOf(cellSaid(r, label, where)).trim() || (b.heading ?? '');
    const g = groups.get(key) ?? { done: 0, all: 0 };
    g.all += 1;
    if (yes(r) === true) g.done += 1;
    groups.set(key, g);
  }
  return [...groups].map(([key, g]) => `${escapeCell(key)} | ${g.done} | ${g.all} | `);
}

/** Today in the record's zone, `YYYY-MM-DD`. */
function todayIn(where: Where): string {
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: where.zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(where.now);
    const of = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${of('year')}-${of('month')}-${of('day')}`;
  } catch {
    return new Date(where.now).toISOString().slice(0, 10);
  }
}

/**
 * WHAT IS BEING PAID IN PARTS AS THE APP DRAWS IT (`blockOf` in `page-live.ts`, AL12): a track a plan, its parts paid of
 * its parts in all ("4 of 8"), and under it the next part, "Next £1,875 on 3 Sep". A link drew the five figures behind
 * the tracks as five bare tiles, "Paid 4, Parts 8, Next due 3 Sep, Left £7,500, Left after £5,625".
 *
 * THE FIRST TWO FIGURES ARE THE COUNTS, by plan; after them, when the link keeps them, the day of each plan's next part
 * and, on a link with money, what is left before and after it. A link with money off says the day alone. The plans
 * still being paid come first, and six at most, as the app's tile.
 */
function plansDrawn(s: Shown, where: Where): string[] | null {
  const b = s.block;
  const [paid, parts, ...rest] = b.readings;
  if (b.kind !== 'progress' || s.rows.length > 0 || paid === undefined || parts === undefined) return null;
  if (!b.readings.every((r) => Array.isArray(r.groups)) || paid.unit !== null || parts.unit !== null) return null;
  const by = (r: SharedReading | undefined) => new Map((r?.groups ?? []).map((g) => [g.key, g.value]));
  const done = by(paid);
  const days = by(rest.find((r) => r.format === 'day'));
  const [leftR, afterR] = rest.filter((r) => r.unit !== null && CURRENCY.test(r.unit));
  const left = by(leftR);
  const after = by(afterR);
  const today = todayIn(where);
  const nextOf = (key: string): string => {
    const at = days.get(key);
    if (typeof at !== 'number' || !Number.isFinite(at)) return '';
    const iso = new Date(Math.round(at) * 86_400_000).toISOString().slice(0, 10);
    const on = dateSaid(iso, where.now);
    const l = left.get(key);
    const a = after.get(key);
    const part = typeof l === 'number' && typeof a === 'number' && l > a ? amountSaid(l - a, leftR?.unit, where) : null;
    if (iso < today) {
      const late = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000));
      return `${part === null ? '' : `${part} `}{{bad:${late.toLocaleString('en')} ${late === 1 ? 'day' : 'days'} late}}, due ${on}`;
    }
    return part === null ? `Next on ${on}` : `Next ${part} on ${on}`;
  };
  const plans = (parts.groups ?? []).map((g) => ({ key: g.key, name: partName(g), paid: done.get(g.key) ?? 0, of: g.value ?? 0 }));
  if (plans.length === 0) return null;
  const open = (p: (typeof plans)[number]): boolean => (p.paid ?? 0) < p.of;
  return [...plans.filter(open), ...plans.filter((p) => !open(p))].slice(0, 6).map((p) => {
    const said = open(p) ? nextOf(p.key) : '';
    return `${escapeCell(p.name)} | ${p.paid ?? 0} | ${p.of} | ${said}`;
  });
}

/** One shared block as the app would draw it. */
export function drawingOf(s: Shown, where: Where): Drawing {
  const b = s.block;
  const segments: Segment[] = [];
  let table: Drawing['table'] = null;
  let authored = false;

  /* A FIGURE CUT INTO PARTS, A BUDGET AND A PLAN PAID IN PARTS ARE DRAWN AS THE APP DRAWS THEM, their figures as bars and
     tracks and never as tiles of their own (AL6, AL12). */
  const parts = partsDrawn(s, where);
  if (parts !== null) {
    const drawn = fenced(b.kind, parts);
    if (drawn) return { segments: drawn, table: null, authored: false };
  }
  const plans = plansDrawn(s, where);
  if (plans !== null) {
    const drawn = fenced('progress', plans);
    if (drawn) return { segments: drawn, table: null, authored: false };
  }
  const budget = budgetDrawn(s, where);
  if (budget !== null) {
    const drawn = fenced('progress budget', budget);
    if (drawn) return { segments: drawn, table: null, authored: false };
  }
  for (const rows of [goalsDrawn(s, where), countsDrawn(s, where)]) {
    if (rows === null) continue;
    const drawn = fenced('progress', rows);
    if (drawn) return { segments: drawn, table: null, authored: false };
  }

  /* A LINE A MEASURE, AS THE APP DRAWS A `lines` BLOCK (`linesAndLatest` in `blocks.ts`): the period as the line, the
     period before as the dashed one, and a measure read once said once under them. A link drew nothing where Team's
     Home draws its open tickets each morning. */
  if (b.kind === 'lines' && b.measures !== undefined && b.measures.length > 0) {
    const { lines, latest } = linesAndLatest(b.measures);
    const text = [linesText(lines, latest, b.heading ?? null), latestText(latest, lines.length > 0, lines)].filter((t) => t !== '').join('\n\n');
    const drawn = parse(text, { page: true }).filter((seg) => seg.type !== 'degraded');
    if (drawn.length > 0) return { segments: drawn, table: null, authored: false };
  }

  /* THE FIGURES, as a `stat`. */
  if (b.readings.length > 0) segments.push(...(fenced('stat', statRows(s, where)) ?? []));

  /* WHAT THE BLOCK WRITES OUT ITSELF, cell by cell, as its own kind's rows, as the app writes `authored`. */
  if (b.authored.some((cells) => cells.some((c) => plainSaid(c, where) !== ''))) {
    const drawn = fenced(b.kind, b.authored.map((cells) => cells.map((c) => escapeCell(plainSaid(c, where))).join(' | ')));
    if (drawn) segments.push(...drawn);
    else authored = true;
  }

  if (s.rows.length > 0) {
    const spec = kindSpec(b.kind);
    const drawn =
      b.kind === 'cards'
        ? ((rows) => (rows === null ? null : fenced('cards', rows)))(cardRows(s, where))
        : PLACED.has(b.kind) && spec !== undefined && spec.cells > 0
          ? fenced(b.kind, placedRows(s, spec.cells, spec.checkbox === true, where))
          : null;
    if (drawn) segments.push(...drawn);
    else table = tableOf(s, where);
  }
  return { segments, table, authored };
}
