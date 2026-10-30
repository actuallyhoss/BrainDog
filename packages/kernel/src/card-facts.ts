/**
 * A CARD'S FACT OVER A FIGURE (where a project stands is said): `{ metric: 'project-open:{{name}}', as: 'fact',
 * label: 'Open' }` on a cards block, read once a card with `{{field}}` filled from the card's own row, so a list of
 * projects says how many things each has open without anybody typing it.
 *
 * WHAT WAS MEASURED BEFORE IT: a cards block could name a figure only as its trend or its when (`declare.ts`, "which only
 * a card's trend or its when reads"), so a project card said nothing a figure knew unless it was a line or a day. Every
 * fact on a card was a field somebody had to type, and on a record nobody typed them Projects said nothing at all.
 *
 * IT IS THE WHEN'S READ, ONE NUMBER A CARD (`pages.ts` `whensOf`), widened to say a count or money as it stands: a figure
 * that reads nothing, is refused, or whose hole the card's row cannot fill says nothing on that card, never nought, and
 * money in two currencies is never added into one fact.
 */

import { isCurrencyCode } from './coerce.ts';
import { fill } from './fill.ts';
import type { Entry } from './index.ts';
import type { MetricDecl } from './metrics.ts';
import type { PageBlock, PageDeps } from './pages.ts';

/** How many facts a card takes, figures and fields together: `declare.ts`'s `CARD_FACTS`. */
export const CARD_FIGURE_FACTS_MOST = 3;

/** `declare.ts`'s `METRIC_ID`: a figure's id as it is installed. */
const METRIC_ID = /^[a-z][a-z0-9_-]{0,31}$/u;

/** A fact's figure, `project-open:{{name}}`, as the figure it names and the parameter after the first colon, unfilled. */
export const figureNamed = (metric: string): { id: string; param: string | null } => {
  const at = metric.indexOf(':');
  return at < 0 ? { id: metric, param: null } : { id: metric.slice(0, at), param: metric.slice(at + 1) };
};

/** What one fact over a figure says on a card: a count, money in its own currency, or nothing. */
export type CardFact = number | { amount: number; currency: string } | null;

type ColumnSaid = { field?: unknown; or?: unknown; as?: unknown; metric?: unknown; label?: unknown; edit?: unknown };

/** Whether a declared column is a fact over a figure. */
const isFigureFact = (column: unknown): column is ColumnSaid & { metric: unknown } =>
  column !== null && typeof column === 'object' && (column as ColumnSaid).as === 'fact' && (column as ColumnSaid).metric !== undefined;

/**
 * Why a `{ metric, as: 'fact', label }` column cannot be installed, as the sentence `declare.ts` refuses it with, or
 * `null` when it can (or is not a fact over a figure at all). Asked of the declaration alone, before a figure is read.
 *
 * THE LABEL IS REQUIRED because a number alone on a card is "4" of nothing: a field fact is named by its field, and a
 * figure fact has no field to be named by.
 */
export function cardFactFault(id: string, at: string | number, column: unknown, blockKind: unknown): string | null {
  if (!isFigureFact(column)) return null;
  if (blockKind !== 'cards')
    return `${id}.${at} gives a column a metric:, which only a card's fact, trend or when reads: { metric, as: fact, label } on a cards block.`;
  if (column.field !== undefined) return `${id}.${at} gives a fact both a field and a metric. A fact over a figure names the figure alone.`;
  if (column.or !== undefined) return `${id}.${at} gives a fact over a figure an or:, which is a second field to read. A fact over a figure names the figure alone.`;
  if (column.edit !== undefined && column.edit !== false)
    return `${id}.${at} gives a fact over a figure edit: ${JSON.stringify(column.edit)}, and a figure is worked out by BrainDog, never typed. Take edit: off the fact.`;
  if (typeof column.metric !== 'string' || !METRIC_ID.test(figureNamed(column.metric).id))
    return `${id}.${at}'s fact names a figure by its id, with {{field}} after a colon for a figure of each card, as project-open:{{name}}.`;
  if (typeof column.label !== 'string' || column.label.trim() === '')
    return `${id}.${at}'s fact over ${figureNamed(column.metric).id} has no label, and a number alone on a card says nothing. Give it a label:, as label: Open.`;
  return null;
}

/**
 * Why a cards block's columns hold more facts than a card takes, or `null`: `as: fact` and `as: scope` on a field, and
 * facts over a figure, counted together against `CARD_FIGURE_FACTS_MOST`, as `declare.ts` counts them in its `roles`.
 * A column with no role is not counted: the renderer may yet make it the card's title or its figure (`cardRoles`).
 */
export function cardFactsOver(id: string, at: string | number, columns: readonly unknown[]): string | null {
  const n = columns.filter((c) => {
    if (c === null || typeof c !== 'object') return false;
    const role = (c as ColumnSaid).as;
    return role === 'fact' || role === 'scope';
  }).length;
  return n > CARD_FIGURE_FACTS_MOST
    ? `${id}.${at} has ${n} columns as fact. A card takes one of each role, one figure among them, and at most ${CARD_FIGURE_FACTS_MOST} facts.`
    : null;
}

/** A cards block's facts over a figure, in column order, at most a card's worth. */
const figureFacts = (block: PageBlock) =>
  block.kind === 'cards' ? (block.columns ?? []).filter((c) => c.as === 'fact' && typeof c.metric === 'string').slice(0, CARD_FIGURE_FACTS_MOST) : [];

/** One figure's reading as a card's fact: a number as it stands, money with its currency, and anything else nothing. */
function factOf(deps: Pick<PageDeps, 'metric' | 'read'>, metric: string, row: Entry): CardFact {
  const filled = String(fill(metric, row));
  if (filled.includes('{{')) return null;
  const { id, param } = figureNamed(filled);
  const decl = deps.metric(id);
  /* A figure read in parts is no one number a card. */
  if (!decl || decl.group_by !== undefined || decl.bucket !== undefined) return null;
  const read = deps.read(param === null ? decl : (fill(decl, null, param) as MetricDecl));
  if (!read.ok) return null;
  const { value, unit, parts, unsaid } = read.value;
  /* NO ROW SAID THE FIELD THE FIGURE ADDS UP: "Owed 0" over a field nobody filled is not a nought, as a stat tile leaves it out. */
  if (unsaid) return null;
  /* TWO CURRENCIES THAT COULD NOT BE CONVERTED come back as parts and no value: never added here either. */
  if (parts !== undefined && parts.length > 1) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const currency = typeof unit === 'string' ? unit.trim().toUpperCase() : '';
  return currency !== '' && isCurrencyCode(currency) ? { amount: Math.round(value), currency } : value;
}

/**
 * EACH CARD'S FACTS OVER A FIGURE: one entry a card, holding one fact a figure column in column order, each the figure
 * its column names with `{{field}}` filled from the card's own row and read as the project page's own tile reads it.
 */
export function factsOf(deps: Pick<PageDeps, 'metric' | 'read'>, block: PageBlock, rows: readonly Entry[]): { facts?: CardFact[][] } {
  const columns = figureFacts(block);
  if (columns.length === 0) return {};
  return { facts: rows.map((row) => columns.map((c) => factOf(deps, c.metric!, row))) };
}
