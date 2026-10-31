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

import { kindSpec, parse, type Segment } from 'braindog-render';
import type { Column, TableRow } from 'braindog-render/svelte';

import { fieldSaid, type SharedColumn, type SharedRow } from '../../lib/record/share-write.ts';
import { cellSaid, figureSaid, plainSaid, trendLine, type Said, type Shown, type Where } from './reading.ts';

/** What one shared block draws: the renderer's segments, the renderer's table, or both (figures over a list). */
export type Drawing = { segments: Segment[]; table: { columns: Column[]; rows: TableRow[] } | null; authored: boolean };

/** A said value as one line of words. */
const textOf = (s: Said): string => ('money' in s ? s.money.text : s.text);

/** A cell as the dialect holds one: one line, its own pipes and backslashes escaped, as `blocks.ts` writes a cell. */
export const escapeCell = (c: string): string => c.replace(/\s*[\r\n]+\s*/gu, ' ').replaceAll('\\', '\\\\').replaceAll('|', '\\|');

/**
 * THE STATES A ROW IS FINISHED IN, which a shared `todo` ticks. The link sends a row's state and not its list's `done:`,
 * so the words the seed's and the packs' lists finish in are read here; any other state is an open box.
 */
const DONE = new Set(['done', 'paid', 'closed', 'cancelled', 'canceled', 'complete', 'completed', 'shipped', 'resolved', 'won', 'lost', 'retired', 'finished', 'archived']);

/** The kinds whose cells are a list's fields in the declared order, each a place (`projectRows` in `blocks.ts`). */
const PLACED: ReadonlySet<string> = new Set(['todo', 'steps', 'timeline', 'board', 'roadmap', 'lanes', 'calendar', 'spec', 'params']);

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
    const cells = at.map(({ c }) => escapeCell(textOf(cellSaid(row, c, where))));
    if (trended) {
      const run = row.trend ?? [];
      cells.push(run.filter((v) => v !== null).length >= 3 ? run.map((v) => (v === null ? '-' : String(v))).join(' ') : '');
    }
    return cells.join(' | ');
  });
  return [head, ...rows];
}

/** The kinds that place a row on a calendar by its day, which their drawer reads as `2026-09-12` (`calendar.ts`, `roadmap.ts`). */
const DATED: ReadonlySet<string> = new Set(['roadmap', 'calendar', 'lanes']);

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
  return s.rows.map((row) => {
    const out = Array.from({ length: cells }, (_, n) => {
      const c = columns[n];
      return c === undefined ? '' : escapeCell(dated ? datedCell(row, c, where) : textOf(cellSaid(row, c, where)));
    });
    if (checkbox) out[0] = `[${row.state !== null && DONE.has(row.state) ? 'x' : ' '}] ${out[0] ?? ''}`;
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
  const rows: TableRow[] = s.rows.map((row, n) => ({ key: `r${n}`, cells: s.columns.map((c) => textOf(cellSaid(row, c, where)) || null) }));
  return { columns, rows };
}

/** One shared block as the app would draw it. */
export function drawingOf(s: Shown, where: Where): Drawing {
  const b = s.block;
  const segments: Segment[] = [];
  let table: Drawing['table'] = null;
  let authored = false;

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
