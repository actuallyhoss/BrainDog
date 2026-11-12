/**
 * A project's shape in its page's own answer: `page({ slug, shape: true })` (READ+, `index.ts`), scope 2026-10-24 A20.
 *
 * WHY. A project's page declares the parts of its shape as blocks (`{ kind: project, parts }`, `kinds/project.ts` in the
 * kernel), and the kernel answers them as nothing: the host then read what they draw for itself, once the page was back
 * (`apps/web/src/lib/page/shape-read.ts`, now gone): the row, what was said of it, what points at it, its work, its
 * runs, its key number and five money figures. Seven reads and a wave after the page, each a turn of the record's one
 * thread. Here the record answers all of them with the page, in the same turn, and the parts take them from it
 * (`apps/web/src/lib/page/shape-answer.ts`), the way Today's tiles take theirs from `today` (`today.ts`).
 *
 * EACH PART IS ASKED AS ITS OWN METHOD ANSWERS IT, with the same caller, so every check, every list she may not read and
 * every hidden field is held exactly as it is when the part asks alone: nothing here reads a row by itself. A part the
 * record refuses is `null`, and the part then draws without it, as it did when its own read was refused.
 *
 * WHICH LISTS, BY WHAT THEY DECLARE, never by a name: a project is a row of a list that declares `scopes`; its work is the
 * list that hands its rows to someone (`hand`) and points at it with a state; its runs are the list whose rows are runs
 * (`seq_prefix`) heard from (`last_seen`), by the field that points at it or its `project`. Its money is asked by the
 * row's own name, as the figures are named (`project-in-month:Kiln`).
 */

import type { Result } from '@braindog/ports';
import { handOf } from '@braindog/declare/hand';
import { KPIS_KIND } from 'braindog-render';

import { runsListOf, turn } from './today.ts';

/** One method of the record, as the shape asks it: with the caller's own context, answered as it would be alone. */
type Ask = (args: never, ctx: never) => Promise<Result<unknown>>;

/** The methods the shape asks, the record's own after every wrapper is on (`index.ts`). */
export type ShapeAsks = { get: Ask; history: Ask; backlinks: Ask; list: Ask; metric: Ask; previewPage: Ask };

/** A list's declaration, as much of it as the shape reads. */
type Decl = {
  id: string;
  title?: string;
  fields: readonly { id: string; type: string; to?: string; values?: readonly string[] }[];
  state?: string;
  scopes?: unknown;
  seq_prefix?: string;
  hand?: unknown;
};

/** The most rows of its work read, as the hero, the Work tile and the path count them (`figures.ts` `WORK_READ`). */
export const SHAPE_WORK_READ = 500;
/** The most runs on it read, newest heard first. */
export const SHAPE_RUNS_READ = 40;
/** The most rows of each list that points at it, a page of what points here (`links-live.ts` `LINKS_PAGE`). */
export const SHAPE_LINKS_PAGE = 24;
/** The money figures a project's page draws, each asked by the project's name. */
export const SHAPE_FIGURES = ['project-in-month', 'project-out-month', 'project-owed', 'project-in-by-month', 'project-out-by-month'] as const;

/** The work list that points at a project and its rows on it, as `list` answers them. */
export type ShapeWork = { list: string; rows: unknown[]; cursor: unknown };
/** The runs on a project, newest heard first, and the field that names it, as `list` answers them. */
export type ShapeRuns = { list: string; field: string; rows: unknown[] };

/** A list that points at the project, the field it points by, and its rows on this project, as `list` answers them. */
export type ShapeRows = { list: string; field: string; rows: unknown[] };

/** The most readings of its numbers read, newest first: four months of a few daily measures. */
export const SHAPE_READINGS_READ = 2000;
/** The most services and repeating payments read. */
export const SHAPE_LINKED_READ = 100;
/** The most answered questions about it read, latest first. */
export const SHAPE_DECIDED_READ = 6;

/** What the shape answers: each part as its own method answered it, `null` where that part was refused or has none. */
export type ShapeAnswer = {
  register: string;
  seq: number;
  /** The row, as `get` with its documents' values answers it. */
  row: unknown;
  /** What was said of it, as `history` answers. */
  history: unknown;
  /** What points at it, a page a list, as `backlinks` answers. */
  links: unknown;
  /** The work list that points here and its rows on this project, as `list` answers them. */
  work: ShapeWork | null;
  /** The runs on it, newest heard first, as `list` answers them. */
  runs: ShapeRuns | null;
  /** Its key numbers, as the `kpis` block `for: project` answers them. */
  kpis: unknown[] | null;
  /** Its money, each figure by its id (`project-in-month:Kiln`), as `metric` answers it. */
  figures: Record<string, unknown>;
  /**
   * WHAT ITS PAGE DRAWS BESIDE THE SHAPE'S FIRST PARTS (the project page of 27 October): what it runs on and when each
   * renews, the readings of its numbers in the last four months, the money that repeats on it, and what was decided
   * about it. Each list found by what it declares, each read as `list` answers it alone; `null` where the record keeps
   * no such list or refused the read.
   */
  services?: ShapeRows | null;
  readings?: ShapeRows | null;
  recurring?: ShapeRows | null;
  decided?: unknown[] | null;
};

/**
 * The first list that points at `projects` and declares every field in `ids`, by what it declares and never its name, and
 * none that hands work out (the work is read as work).
 */
export function linkedListOf(decls: readonly Decl[], projects: string, ids: readonly string[]): { list: string; field: string } | null {
  for (const d of decls) {
    if (d.id === projects || handOf(d as unknown as Record<string, unknown>) !== null) continue;
    const field = d.fields.find((f) => f.type === 'ref' && f.to === projects);
    if (field && ids.every((id) => d.fields.some((f) => f.id === id))) return { list: d.id, field: field.id };
  }
  return null;
}

/** The fields each linked list is known by. */
export const SHAPE_LINKED = { services: ['renews', 'provider'], readings: ['at', 'value', 'name'], recurring: ['every', 'next_due', 'direction'] } as const;

const valueOf = (out: Result<unknown> | null): unknown => (out !== null && out.ok ? out.value : null);
/* EACH PART ASKED ON A TURN OF ITS OWN (`turn`, `today.ts`), so a call waiting on the record's one thread is answered
   between the parts of a project's shape rather than after all of them. */
const asking = async <A>(ask: Ask, args: A, ctx: unknown): Promise<Result<unknown> | null> => {
  await turn();
  return ask(args as never, ctx as never).catch(() => null);
};

/** The work list of a projects list: one that hands its rows to someone and points at it with a state, as `figures.ts` `viaOf`. */
export function workListOf(decls: readonly Decl[], projects: string): { list: string; field: string } | null {
  for (const d of decls) {
    if (handOf(d as unknown as Record<string, unknown>) === null || !d.state) continue;
    const field = d.fields.find((f) => f.type === 'ref' && f.to === projects);
    const state = d.fields.find((f) => f.id === d.state);
    if (field && state?.values?.length) return { list: d.id, field: field.id };
  }
  return null;
}

/**
 * The key numbers of the project `spoken` as one of the page's own blocks drew them for this reader, or `null`.
 *
 * A PROJECT'S PAGE DRAWS ITS KEY NUMBERS IN A BLOCK AND THE SHAPE ASKED FOR THE SAME ONES AGAIN, every reading of every
 * number read twice in one call. Only a block that is the body the shape asks: all of this project's, with no `limit:`,
 * drawn and not refused. `blocks` are the page's as this reader is sent them, so nothing she is not shown is taken, and
 * the caller hands none of a page a filter narrowed, whose figures are the choice's and not the project's.
 */
export function kpisDrawnOn(blocks: readonly unknown[], spoken: string): unknown[] | null {
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue;
    const b = block as { kind?: unknown; source?: unknown; for?: unknown; about?: unknown; limit?: unknown; kpis?: unknown; refusals?: unknown; drawn?: unknown };
    if (b.kind !== KPIS_KIND || b.source !== KPIS_KIND || b.for !== 'project' || b.limit !== undefined || b.drawn === false) continue;
    if (b.about !== undefined && b.about !== '' && b.about !== spoken) continue;
    if (!Array.isArray(b.kpis) || (Array.isArray(b.refusals) && b.refusals.length > 0)) continue;
    return structuredClone(b.kpis) as unknown[];
  }
  return null;
}

/**
 * Every part of the project `register#seq`'s shape, asked of the record one after another in this one call, or `null`
 * where the row is not a project's. `decls` are the record's lists (the caller's ceiling is each part's own method's).
 */
export async function shapeAnswerOf(
  asks: ShapeAsks,
  register: string,
  seq: number,
  decls: readonly Decl[],
  ctx: unknown,
  /** Its key numbers as the page's own block already drew them in this read (`kpisDrawnOn`), which are then not drawn again. */
  drawnKpis: unknown[] | null = null,
): Promise<ShapeAnswer | null> {
  const decl = decls.find((d) => d.id === register);
  if (decl?.scopes === undefined || !Number.isInteger(seq) || seq < 1) return null;
  const spoken = `${register}#${seq}`;
  const row = valueOf(await asking(asks.get, { register, seq, values: true }, ctx));
  const history = valueOf(await asking(asks.history, { register, seq }, ctx));
  const links = valueOf(await asking(asks.backlinks, { register, seq, limit: SHAPE_LINKS_PAGE }, ctx));
  /* ITS WORK: every row of the work list that points here, finished or not, which the hero, the tile and the path count. */
  const on = workListOf(decls, register);
  let work: ShapeWork | null = null;
  if (on !== null) {
    const got = valueOf(await asking(asks.list, { register: on.list, where: `${on.field} is ${spoken}`, limit: SHAPE_WORK_READ }, ctx)) as { rows?: unknown[]; cursor?: unknown } | null;
    if (got !== null && Array.isArray(got.rows)) work = { list: on.list, rows: got.rows, cursor: got.cursor ?? null };
  }
  /* ITS RUNS, newest heard first. */
  const runsOn = runsListOf(decls as never, register);
  let runs: ShapeRuns | null = null;
  if (runsOn !== null) {
    const got = valueOf(
      await asking(asks.list, { register: runsOn.list, where: `${runsOn.field} is ${spoken}`, limit: SHAPE_RUNS_READ, order: [{ field: 'last_seen', dir: 'desc' }] }, ctx),
    ) as { rows?: unknown[] } | null;
    if (got !== null && Array.isArray(got.rows)) runs = { ...runsOn, rows: got.rows };
  }
  /* ITS KEY NUMBERS, the body `card-kpis.ts` asks for one project, drawn by the same method. */
  let kpis = drawnKpis;
  if (kpis === null) {
    const body = { page: 'key-numbers', title: 'Key numbers', blocks: [{ kind: KPIS_KIND, source: KPIS_KIND, for: 'project', about: spoken }] };
    const drawn = valueOf(await asking(asks.previewPage, { body }, ctx)) as { blocks?: { kpis?: unknown }[] } | null;
    kpis = Array.isArray(drawn?.blocks?.[0]?.kpis) ? (drawn.blocks[0].kpis as unknown[]) : null;
  }
  /* ITS MONEY, BY ITS NAME as the row holds it now: a row she may not read has no name, and no money is asked. */
  const fields = (row as { fields?: Record<string, unknown> } | null)?.fields;
  const name = typeof fields?.[decl.title ?? ''] === 'string' ? String(fields[decl.title!]).trim() : '';
  const figures: Record<string, unknown> = {};
  if (name !== '')
    for (const f of SHAPE_FIGURES) {
      const id = `${f}:${name}`;
      const got = valueOf(await asking(asks.metric, { metric: id }, ctx));
      if (got !== null) figures[id] = got;
    }
  /* WHAT IT RUNS ON, ITS READINGS AND ITS REPEATING MONEY, each list read alone on this project. */
  const linked = async (ids: readonly string[], extra: Record<string, unknown>): Promise<ShapeRows | null> => {
    const on = linkedListOf(decls, register, ids);
    if (on === null) return null;
    const got = valueOf(await asking(asks.list, { register: on.list, where: `${on.field} is ${spoken}`, ...extra }, ctx)) as { rows?: unknown[] } | null;
    return got !== null && Array.isArray(got.rows) ? { ...on, rows: got.rows } : null;
  };
  const services = await linked(SHAPE_LINKED.services, { limit: SHAPE_LINKED_READ });
  const readings = await linked(SHAPE_LINKED.readings, { limit: SHAPE_READINGS_READ, order: [{ field: 'at', dir: 'desc' }] });
  const recurring = await linked(SHAPE_LINKED.recurring, { limit: SHAPE_LINKED_READ });
  /* WHAT WAS DECIDED ABOUT IT, the body a `governance.decided` block over this row asks, drawn by the same method. It
     names no columns: the source answers every field a decision has, whatever the kernel calls them, and a page keeps
     every field of a row it sends. */
  const asked = { page: 'decided', title: 'Decided', blocks: [{ kind: 'table', source: 'governance.decided', where: `about is ${spoken}`, limit: SHAPE_DECIDED_READ }] };
  const said = valueOf(await asking(asks.previewPage, { body: asked }, ctx)) as { blocks?: { rows?: unknown }[] } | null;
  const decided = Array.isArray(said?.blocks?.[0]?.rows) ? (said.blocks[0].rows as unknown[]) : null;
  return { register, seq, row, history, links, work, runs, kpis, figures, services, readings, recurring, decided };
}
