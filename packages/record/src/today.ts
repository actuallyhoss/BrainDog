/**
 * Today's tiles in one read: `today({ body })` (READ+, `index.ts`), scope 2026-10-24 A12.
 *
 * WHY. Today drew its body with `previewPage`, and then each tile asked the record for its own part: what BrainDog did
 * by itself (`handled`), what is shared out (`sharedOut`), each project's late work (one `list` a list that falls due),
 * who worked on each last (the runs), and the key number each card leads with (a second `previewPage`). Batched, that
 * was still about a dozen reads and three waves of requests on one open, each a turn of the record's one thread. Here the
 * record answers all of them in one turn, and the app's tiles take their part from it (`apps/web/src/lib/home/today-read.ts`).
 *
 * EACH PART IS ASKED AS ITS OWN METHOD ANSWERS IT, with the same caller, so every check, every list she may not read and
 * every hidden field is held exactly as it is when the tile asks alone: nothing here reads a row by itself. A part the
 * record refuses is `null`, and the tile then asks for itself, as before. Only the body's own refusal refuses `today`,
 * since that is the page.
 *
 * WHICH LISTS, BY WHAT THEY DECLARE, never by a name: the projects list is the one that declares `scopes`; the work that
 * is late for a project is the list that hands its rows to someone (`hand`) and points at it with a state and a day it
 * falls due, and every list that holds money, points at it and has such a day; the runs are the list whose rows are
 * runs (`seq_prefix`) heard from (`last_seen`). The app counts them as it always has (`card-late.ts`, `card-life.ts`).
 */

import type { Result } from '@braindog/ports';
import { handOf } from '@braindog/declare/hand';
import { KPIS_KIND } from 'braindog-render';

/** One method of the record, as `today` asks it: with the caller's own context, answered as it would be alone. */
type Ask = (args: never, ctx: never) => Promise<Result<unknown>>;

/** The methods `today` asks, the record's own after every wrapper is on (`index.ts`). */
export type TodayAsks = {
  previewPage: Ask;
  handled: Ask;
  sharedOut: Ask;
  list: Ask;
  /** What Slash would add to Today from use (`methods/widgets.ts`), the one offer the board's last cell shows. */
  widgetSuggest?: Ask;
};

/** A list's declaration, as much of it as `today` reads. */
type Decl = {
  id: string;
  fields: readonly { id: string; type: string; to?: string; deadline?: boolean; values?: readonly string[] }[];
  state?: string;
  done?: readonly string[];
  scopes?: unknown;
  seq_prefix?: string;
  hand?: unknown;
  title?: string;
};

/** The most late rows of one list read: more than any record holds late (`card-late.ts` `LATE_READ`). */
export const TODAY_LATE_READ = 200;
/** The projects read for their ids, at the limit the desk, the sidebar and the pages read them at. */
export const TODAY_PROJECTS_READ = 500;
/** The most runs read, newest first (`card-life.ts` `RUNS_READ`). */
export const TODAY_RUNS_READ = 200;
/** The most key numbers asked for the cards (`card-kpis.ts` `MOST`). */
export const TODAY_LEADS_MOST = 200;

/** How a list points at the projects: its ref, its state and the finished states, and its day, as `figures.ts` `viaOf`. */
type Via = { field: string; state: string; done: readonly string[]; deadline: string | null };

function viaOf(work: Decl | undefined, projects: string): Via | null {
  if (!work?.state) return null;
  const field = work.fields.find((f) => f.type === 'ref' && f.to === projects);
  const state = work.fields.find((f) => f.id === work.state);
  if (!field || !state?.values?.length) return null;
  /* WORK KEPT FOR LATER IS NOT OPEN, as Work's Open counts it (`figures.ts` `viaOf`). */
  const later = state.values.includes('backlog') && !(work.done ?? []).includes('backlog') ? ['backlog'] : [];
  return { field: field.id, state: state.id, done: [...(work.done ?? []), ...later], deadline: work.fields.find((f) => f.deadline === true)?.id ?? null };
}

/** The lists whose open rows past their day are a project's late work: the work list first, then each money list. */
export function lateListsOf(decls: readonly Decl[], projects: string): { id: string; where: string; field: string }[] {
  /* LATE IS LATE WORK, ONE DEFINITION EVERYWHERE (audit of 30 October, 6): the open tasks past their day, as Projects,
     a project's page and Work count them. A late bill pointing at a project is Money's to say, and counting it here made
     a card say "3 late" over a page that said "1 late". */
  const work = decls.find((d) => handOf(d as unknown as Record<string, unknown>) !== null && viaOf(d, projects) !== null);
  return (work && viaOf(work, projects)?.deadline ? [work] : []).map((d) => {
    const via = viaOf(d, projects)!;
    const open = via.done.length > 0 ? `${via.state} is not ${via.done.join(' or ')}, ` : '';
    return { id: d.id, where: `${open}${via.deadline} before today, ${via.field} is set`, field: via.field };
  });
}

/** The list whose rows are runs, and the field naming a run's project, as `card-life.ts` `runsListFor` finds them. */
export function runsListOf(decls: readonly Decl[], projects: string): { list: string; field: string } | null {
  const runs = decls.find((d) => d.seq_prefix !== undefined && d.fields.some((f) => f.id === 'last_seen'));
  if (!runs) return null;
  const field = (runs.fields.find((f) => f.type === 'ref' && f.to === projects) ?? runs.fields.find((f) => f.id === 'project'))?.id;
  return field ? { list: runs.id, field } : null;
}

/** The projects list a body draws as cards: one that declares `scopes`, read by a `cards` block of the body. */
function cardsOver(body: Record<string, unknown>, decls: readonly Decl[]): string | null {
  const projects = decls.find((d) => d.scopes !== undefined)?.id;
  if (!projects || !Array.isArray(body.blocks)) return null;
  const drawn = (body.blocks as unknown[]).some((b) => {
    const w = b as { kind?: unknown; source?: unknown; group?: unknown } | null;
    return w !== null && typeof w === 'object' && w.kind === 'cards' && w.source === `register.${projects}` && w.group === undefined;
  });
  return drawn ? projects : null;
}

/** The project cards' parts: each project's late work by its number, its runs as the record answers them, and its key number. */
export type TodayCards = {
  register: string;
  /** How many open rows past their day point at each project, by its number. */
  lates: Record<string, number>;
  /** The runs that name a project, newest heard first, as `list` answers them; `null` where the record keeps none. */
  runs: { list: string; field: string; rows: unknown[] } | null;
  /** The key numbers the cards lead with, as the `kpis` block `for: cards` answers them; `null` where it was refused. */
  leads: unknown[] | null;
  /** The day each project's row last changed, by its number: what a card with no other sign of life is quiet since. */
  moved: Record<string, string>;
};

/** What `today` answers: the page as `previewPage` draws it, and each tile's part, or `null` where that part was refused. */
export type TodayAnswer = {
  page: unknown;
  handled: unknown;
  shared: unknown;
  cards: TodayCards | null;
  /** Set when this is Today as it was last drawn and the record may have moved since: ask again with `fresh`. */
  behind?: true;
  /**
   * THE ONE WIDGET SLASH WOULD ADD FROM USE, for the board's last cell (widgets plan §6.3), or absent when there is none,
   * the person turned suggestions off, or one was answered today. Asked in this same read, so the cell costs no request.
   */
  widget?: unknown;
  /**
   * WHAT WAS ASKED, AS A DIGEST, on an answer to `last` (Today asked beside `boot` with the body this screen asked last
   * time): the SHA-256 of `[{ body } or { page }, offer]` as JSON. The app draws the answer only when the body it then
   * builds digests the same, and asks as it always did otherwise.
   */
  asked?: string;
  /** On an answer to `last`, the record's version for this reader as it was asked, so a tab that heard a newer one asks again. */
  version?: number;
};

/**
 * ONE LINE OF TODAY ASKED AS A STREAM (finish 3 Nov), before its answer: `head` says how many blocks the page has and the
 * key each is drawn under (and, for a kept Today, how it is declared, so its board is laid before a card is drawn);
 * `block` is one block as the page draws it, masked as the answer is, at its place. The whole answer follows as the
 * stream's last line and is the one that counts.
 */
export type TodayLine =
  | { head: { of: number; keys: string[]; declared?: unknown; declared_version?: number } }
  | { block: { i: number; value: unknown } };

const valueOf = (out: Result<unknown> | null): unknown => (out !== null && out.ok ? out.value : null);
/**
 * EACH PART ASKED ON A TURN OF ITS OWN (`turn`), so a call that came in while Today was being drawn, an agent's write or
 * read, is answered between its parts rather than after all of them: the record has one thread, and Today is the
 * longest thing it is asked.
 */
export const turn = (): Promise<void> => new Promise((done) => setTimeout(done, 0));
const asking = async <A>(ask: Ask, args: A, ctx: unknown): Promise<Result<unknown> | null> => {
  await turn();
  return ask(args as never, ctx as never).catch(() => null);
};

/**
 * Every part of Today, asked of the record one after another in this one call. `body` is what `previewPage` takes, and a
 * refusal of it is `today`'s; `decls` are the record's lists (the caller's ceiling is each part's own method's to hold).
 *
 * `offer: false` LEAVES THE WIDGET OFFER OUT (`widget`): it is the board's last cell, never the screen, and drawing it
 * cost every Today read about 0.2 s of the record's time, and 2 s on the first read after the record woke (30 Oct, his
 * record). The app asks `widgetSuggest` for it once Today has drawn.
 */
export async function todayOf(asks: TodayAsks, body: Record<string, unknown>, decls: readonly Decl[], ctx: unknown, { offer = true }: { offer?: boolean } = {}): Promise<Result<TodayAnswer>> {
  const page = await asks.previewPage({ body } as never, ctx as never);
  if (!page.ok) return page;
  const handled = valueOf(await asking(asks.handled, {}, ctx));
  const shared = valueOf(await asking(asks.sharedOut, {}, ctx));
  const projects = cardsOver(body, decls);
  const cards = projects === null ? null : await cardsOf(asks, projects, decls, ctx);
  const widget = !offer || asks.widgetSuggest === undefined ? null : offerOf(valueOf(await asking(asks.widgetSuggest, { board: boardRead(body, page.value), cell: true }, ctx)));
  return { ok: true, value: { page: page.value, handled, shared, cards, ...(widget === null ? {} : { widget }) } };
}

/** The first offer `widgetSuggest` answered, or `null`. */
const offerOf = (v: unknown): unknown => {
  const offers = (v as { offers?: unknown } | null)?.offers;
  return Array.isArray(offers) && offers.length > 0 ? offers[0] : null;
};

/**
 * THE BOARD AS THE WIDGET SIGNALS READ IT: each keyed block, what it reads, and whether it drew nothing, from the body and
 * the page `previewPage` drew of it, block for block.
 */
export function boardRead(body: Record<string, unknown>, page: unknown): { key: string; heading?: string; source?: string; where?: string; metric?: string; empty: boolean }[] {
  const declared = Array.isArray(body.blocks) ? (body.blocks as Record<string, unknown>[]) : [];
  const drawn = Array.isArray((page as { blocks?: unknown } | null)?.blocks) ? ((page as { blocks: Record<string, unknown>[] }).blocks) : [];
  return declared.flatMap((b, i) => {
    if (b === null || typeof b !== 'object' || typeof b.key !== 'string') return [];
    const d = drawn[i] ?? {};
    const cells = Array.isArray(b.cells) ? (b.cells as { metric?: unknown }[]) : [];
    const readings = Array.isArray(d.readings) ? (d.readings as { reading?: { value?: unknown } | null }[]) : [];
    const listed = ['rows', 'queue', 'feed', 'kpis'].some((k) => Array.isArray(d[k]) && (d[k] as unknown[]).length > 0);
    const figured = readings.some((r) => typeof r.reading?.value === 'number' && r.reading.value !== 0);
    return [
      {
        key: b.key,
        ...(typeof b.heading === 'string' ? { heading: b.heading } : {}),
        ...(typeof b.source === 'string' ? { source: b.source } : {}),
        ...(typeof b.where === 'string' ? { where: b.where } : {}),
        ...(typeof cells[0]?.metric === 'string' ? { metric: cells[0].metric } : {}),
        empty: !listed && !figured,
      },
    ];
  });
}

async function cardsOf(asks: TodayAsks, projects: string, decls: readonly Decl[], ctx: unknown): Promise<TodayCards> {
  /* LATE WORK: one read a list for every project at once, counted for the project each row points at. */
  /* A LIST SHE MAY NOT READ SAYS NOTHING, as the card's own read of it says nothing (`card-late.ts`). */
  const lates: Record<string, number> = {};
  const links: string[] = [];
  for (const l of lateListsOf(decls, projects)) {
    const got = await asking(asks.list, { register: l.id, where: l.where, limit: TODAY_LATE_READ }, ctx);
    if (got === null || !got.ok) continue;
    for (const r of (got.value as { rows: { fields?: Record<string, unknown> }[] }).rows) {
      const v = r.fields?.[l.field];
      if (typeof v === 'string' && v !== '') links.push(v);
    }
  }
  /* THE PROJECTS THEMSELVES, read once by their name alone (`fields`): a row keeps its number and its days, which the late
     work is counted by and a quiet card says, and his projects' notes were most of 466 KB. */
  const title = decls.find((d) => d.id === projects)?.title ?? 'name';
  const all = await asking(asks.list, { register: projects, limit: TODAY_PROJECTS_READ, fields: [title] }, ctx);
  const rows = all !== null && all.ok ? (all.value as { rows: { id?: unknown; seq?: unknown; updated_at?: unknown }[] }).rows : [];
  const moved: Record<string, string> = {};
  for (const r of rows) if (typeof r.seq === 'number' && typeof r.updated_at === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(r.updated_at)) moved[String(r.seq)] = r.updated_at.slice(0, 10);
  if (links.length > 0) {
    const seqOf = new Map(rows.flatMap((r) => (typeof r.id === 'string' && typeof r.seq === 'number' ? [[r.id, r.seq] as const] : [])));
    const spoken = new RegExp(`^${projects}#(\\d+)$`, 'u');
    for (const link of links) {
      const m = spoken.exec(link);
      const seq = m ? Number(m[1]) : seqOf.get(link);
      if (seq !== undefined) lates[String(seq)] = (lates[String(seq)] ?? 0) + 1;
    }
  }
  /* THE RUNS, newest heard first, each project taking its newest in the app. */
  const on = runsListOf(decls, projects);
  let runs: TodayCards['runs'] = null;
  if (on !== null) {
    const got = await asking(asks.list, { register: on.list, where: `${on.field} is set`, order: [{ field: 'last_seen', dir: 'desc' }], limit: TODAY_RUNS_READ }, ctx);
    if (got !== null && got.ok) runs = { ...on, rows: (got.value as { rows: unknown[] }).rows };
  }
  /* THE KEY NUMBER EACH CARD LEADS WITH, the body `card-kpis.ts` asks for, drawn by the same method. */
  const kpis = await asking(asks.previewPage, { body: { page: 'key-numbers', title: 'Key numbers', blocks: [{ kind: KPIS_KIND, source: KPIS_KIND, for: 'cards', limit: TODAY_LEADS_MOST }] } }, ctx);
  const block = kpis !== null && kpis.ok ? ((kpis.value as { blocks?: { kpis?: unknown }[] }).blocks?.[0] ?? null) : null;
  const leads = block !== null && Array.isArray(block.kpis) ? (block.kpis as unknown[]) : null;
  return { register: projects, lates, runs, leads, moved };
}
