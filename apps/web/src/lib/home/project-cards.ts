/**
 * Which projects are cards on Today's desk, in what order, and what each card says.
 *
 * THE LIST IS FOUND BY WHAT IT DECLARES, NEVER BY NAME: the projects list is the one that declares `scopes`
 * (`isProject` in the project page's `project.ts`), so no list id is written here. A retired or parked project is not
 * a card; the lane is whatever the list's state field holds. Pure, so `project-cards.test.ts` holds the rules.
 */

import { cardLayout, dayShort, kpiView, trendOf, type KpiInput } from 'braindog-render';

import { briefFromNote } from '../record/brief.ts';
import { actor } from '../record/names.ts';
import { rowHref, rowScreen } from '../record/row-href.ts';
import { hueFor, slotOf } from '../ui/face.ts';

/** What of a list's declaration decides its cards. */
export type CardDecl = {
  id: string;
  title: string;
  state?: string | undefined;
  identity?: { mark: string; accent: string } | undefined;
  scopes?: unknown;
  fields: readonly { id: string; type: string }[];
};

export type CardRow = { seq: number; id?: string | undefined; fields: Readonly<Record<string, unknown>>; created_at?: string | undefined };

/** One project as a card: its name, mark, hue, one line, next step and, if it has money, one figure. */
export type ProjectCard = {
  key: string;
  name: string;
  mark: string;
  /** The row's own hue, else the one its name is drawn in everywhere (`hueOf`). */
  hue: number | null;
  lane: string;
  /** How it is going, the stored value (`on_track`, `at_risk`, `off_track`), or '' where nobody said. */
  health: string;
  /** How far along, 0 to 100, where the row says. */
  progress: number | null;
  /** The day it aims for, YYYY-MM-DD, where the row says. */
  aim: string | null;
  /** How much of its open work is late, where the page read it; 0 says nothing. */
  late: number;
  /** How long since anybody worked on it, as the record said it ("2 days"), and whether that is past its thirty days. */
  worked: { said: string; quiet: boolean } | null;
  /** What it is in a line: drawn on a draft's card only, since a project's page says it in its hero. */
  brief: string | null;
  next: string | null;
  figure: { minor: number; currency: string; field: string } | null;
  /** The key number the card leads with, where the project keeps one (`withKpis`); `figure` is then said nowhere. */
  kpi?: CardKpi | null;
  /** The row's id, which a key number names its project by. */
  id?: string | null;
  /** Where the card opens: the project's own page where its list made one, else the row's screen. */
  href: string;
  /** The row's own screen, where its fields are written and a draft is deleted, whatever page it has. */
  row: string;
  /** The row's number in its list, which the two presses on a draft write by. */
  seq: number;
  /** The record formed this from the agent's first session and the person has not kept it (`draft` on the row). */
  draft: boolean;
  /** When the row was made, so a draft just formed can be taken back without a question. */
  made: string | null;
};

/** How long a draft the record just formed can be said "not a project" without a question: the first run. */
export const FRESH_DRAFT_MS = 10 * 60_000;

/** Whether this card is a draft the record made inside the first run, so removing it asks nothing. */
export const takenBackFree = (card: Pick<ProjectCard, 'draft' | 'made'>, nowMs: number): boolean => {
  const at = card.made === null ? Number.NaN : Date.parse(card.made);
  return card.draft && Number.isFinite(at) && nowMs - at >= 0 && nowMs - at <= FRESH_DRAFT_MS;
};

/** The lanes that are not on the desk. */
export const OFF_DESK: ReadonlySet<string> = new Set(['retired', 'parked']);

/**
 * How many cards the desk draws; the rest are one link away. EVERY PROJECT IN PLAY, SINCE THE AUDIT OF 22 OCTOBER (U5):
 * eight were drawn of thirteen, so the lane bar said "In play 8" over a record, a Projects page and a sidebar that said
 * 13, and the five left off were the ones the order put last. A count is the record's, so the desk draws them all, up to
 * a page of them.
 */
export const DESK_MOST = 24;

/** The list that holds projects, by what it declares, or `null` where the record keeps none. */
export const projectsOf = <D extends Pick<CardDecl, 'scopes'>>(decls: readonly D[]): D | null => decls.find((d) => d.scopes !== undefined) ?? null;

const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/* Lanes that earn come first, then those being built, then anything else the list calls a lane. */
const RANK: Readonly<Record<string, number>> = { earning: 0, building: 1 };

/** The figure a project leads with: its first money field holding more than nothing, the same on its card and its page. */
export function figureOf(decl: Pick<CardDecl, 'fields'>, fields: Readonly<Record<string, unknown>>): ProjectCard['figure'] {
  for (const f of decl.fields) {
    if (f.type !== 'money') continue;
    const v = fields[f.id];
    if (typeof v !== 'object' || v === null) continue;
    const { amount, currency } = v as { amount?: unknown; currency?: unknown };
    if (typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && typeof currency === 'string' && currency !== '') {
      return { minor: amount, currency, field: f.id };
    }
  }
  return null;
}

/**
 * A PROJECT'S COLOUR IS ITS SLOT (SPEC 1.3): the stored hue picks the nearest of the eight category slots, and `--ph` and
 * `--ph-tint` are that slot's pair, solved to 4.5:1 in light and dark. Written on the element a card, a hero or a page's
 * charts are drawn inside, so the bars, the ring, the meter and the arrow all take it. No hue is the neutral slot.
 */
export const slotStyle = (hue: number | null | undefined): string => {
  const s = slotOf(hue);
  return `--ph:var(--cat-${s});--ph-tint:var(--cat-${s}-tint)`;
};

/** The day a card says, short and without the year: "20 Sep". */
export const daySaid = (day: string): string => dayShort(day.slice(0, 10));

/** How it is going, in words, and whether it carries the warning mark: On track says nothing, the others say themselves. */
export const HEALTH: Readonly<Record<string, { word: string; tone: 'warn' | 'off' }>> = {
  at_risk: { word: 'At risk', tone: 'warn' },
  off_track: { word: 'Off track', tone: 'off' },
};

/**
 * HOW LONG SINCE ANYBODY WORKED ON IT, said on the card's foot (proj section 4, Row E): "Worked on 2 days ago", or "Quiet
 * for 40 days" in the red once past its thirty days. `said` is the record's reading ("2 days", "today").
 */
export function workedSaid(w: { said: string; quiet: boolean }): string {
  const t = w.said.trim();
  if (w.quiet) return `Quiet for ${t.replace(/\s+ago$/u, '')}`;
  if (/^(today|yesterday)$/iu.test(t)) return `Worked on ${t.toLowerCase()}`;
  return `Worked on ${/ago$/u.test(t) ? t : `${t} ago`}`;
}

/**
 * The row's hue where it holds a number, else the hue its name is drawn in on the rail and in Today's tasks (`hueFor`);
 * an empty field is not hue 0. EVERY PROJECT IN ITS OWN COLOUR, SINCE the audit of 22 October (U5, U-B13): most
 * projects on a record keep no hue, so five of eight cards on Today were grey on grey, and a project's dot in a task
 * was not its card's colour. Only a row with no name is drawn in none.
 */
export function hueOf(decl: Pick<CardDecl, 'identity'> & { title?: string | undefined }, fields: Readonly<Record<string, unknown>>): number | null {
  const v = fields[decl.identity?.accent ?? 'hue'];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  if (Number.isFinite(n)) return n;
  const name = decl.title ? said(fields[decl.title]) : '';
  return name === '' ? null : hueFor(name);
}

/**
 * The cards for the desk, in order: earning, building, the rest, each by number; and how many were left off the end.
 * `kept` keeps the rows in the order they came, for a page whose own block already ordered them (Projects' In play),
 * and `parked` keeps the parked ones, for a page whose lane bar has a Parked choice; never a finished one.
 */
export function cardsOf(decl: CardDecl, rows: readonly CardRow[], most = DESK_MOST, kept = false, parked = false): { cards: ProjectCard[]; more: number } {
  const live = rows.flatMap((r) => {
    const name = said(r.fields[decl.title]);
    const lane = decl.state ? said(r.fields[decl.state]) : '';
    return name === '' || (OFF_DESK.has(lane) && !(parked && lane === 'parked')) ? [] : [{ r, name, lane }];
  });
  /* A DRAFT COMES FIRST: it is the one thing on the desk waiting for a press. */
  const drafty = (r: CardRow): number => (r.fields.draft === true ? 0 : 1);
  if (!kept) live.sort((a, b) => drafty(a.r) - drafty(b.r) || (RANK[a.lane] ?? 2) - (RANK[b.lane] ?? 2) || a.r.seq - b.r.seq);
  const cards = live.slice(0, most).map(({ r, name, lane }): ProjectCard => {
    const f = r.fields;
    const about = said(f.about);
    const progress = typeof f.progress === 'number' ? f.progress : typeof f.progress === 'string' && f.progress.trim() !== '' ? Number(f.progress) : Number.NaN;
    return {
      key: `${decl.id}#${r.seq}`,
      name,
      mark: decl.identity ? said(f[decl.identity.mark]) : '',
      hue: hueOf(decl, f),
      lane,
      health: said(f.health),
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null,
      aim: /^\d{4}-\d{2}-\d{2}/u.test(said(f.aim)) ? said(f.aim).slice(0, 10) : null,
      late: 0,
      worked: null,
      brief: about !== '' ? about : (briefFromNote(said(f.note), name, 1)[0] ?? null),
      next: said(f.next) || null,
      figure: figureOf(decl, f),
      kpi: null,
      id: typeof r.id === 'string' && r.id !== '' ? r.id : null,
      /* THE PROJECT'S PAGE, where its path, money and work are drawn (the plan of 20 October, batch 3d), never its row. */
      href: rowHref(`${decl.id}#${r.seq}`) ?? `/r/${decl.id}/${r.seq}`,
      row: rowScreen(decl.id, r.seq),
      seq: r.seq,
      draft: f.draft === true,
      made: typeof r.created_at === 'string' ? r.created_at : null,
    };
  });
  return { cards, more: Math.max(0, live.length - cards.length) };
}

/** The agents working on a project now, once each: the kind its mark is drawn from and the name a person reads. */
export function agentsOn(name: string, working: readonly { agent: string; project: string | null }[]): { agent: string; name: string }[] {
  const out = new Map<string, { agent: string; name: string }>();
  for (const w of working) if (name !== '' && w.project === name && !out.has(w.agent)) out.set(w.agent, { agent: w.agent, name: actor(w.agent).name });
  return [...out.values()];
}

/**
 * THE LINE EACH CARD OF A DECLARED CARDS BLOCK DRAWS (`as: trend`), by the row's number: its numbers, oldest first, and
 * its column's label. The block's drawing names what each column is in its first row (`cardLayout`), so the line is
 * read where the page put it. Only a labelled line with three points or more, since a bare line says nothing.
 */
export function trendsOf(rows: readonly { cells: readonly string[]; ref?: { seq: number } | null | undefined }[]): Map<number, { values: number[]; label: string }> {
  const out = new Map<number, { values: number[]; label: string }>();
  const L = cardLayout([...(rows[0]?.cells ?? [])]);
  const label = L.trend >= 0 ? (L.labels[L.trend] ?? '').trim() : '';
  if (label === '') return out;
  for (const r of rows.slice(1)) {
    const t = r.ref ? trendOf(r.cells[L.trend] ?? '') : null;
    const values = (t?.said ?? []).map((v) => Number(v.replace(/−/gu, '-').replace(/,/gu, ''))).filter((n) => Number.isFinite(n));
    if (r.ref && values.length >= 3) out.set(r.ref.seq, { values, label });
  }
  return out;
}

/**
 * WHAT A DECLARED CARDS BLOCK SAYS OF EACH PROJECT BESIDE ITS FIELDS, by the row's number (proj F4): how long since
 * anybody worked on it, from its `when` column ("2 days", quiet once past the thirty days a project in play may go
 * without a word), and how much of its open work is late, from a column labelled Late. Read where the page put them, as
 * `trendsOf` reads the line.
 */
export function cardFactsOf(rows: readonly { cells: readonly string[]; ref?: { seq: number } | null | undefined }[]): Map<number, { worked: { said: string; quiet: boolean } | null; late: number }> {
  const out = new Map<number, { worked: { said: string; quiet: boolean } | null; late: number }>();
  const L = cardLayout([...(rows[0]?.cells ?? [])]);
  const lateAt = L.labels.findIndex((l) => l.trim().toLowerCase() === 'late');
  for (const r of rows.slice(1)) {
    if (!r.ref) continue;
    const said = L.when >= 0 ? (r.cells[L.when] ?? '').trim() : '';
    const days = Number(/(\d+)\s*days?/u.exec(said)?.[1] ?? Number.NaN);
    const late = lateAt >= 0 ? Number((r.cells[lateAt] ?? '').replace(/[^\d]/gu, '')) : 0;
    out.set(r.ref.seq, { worked: said === '' ? null : { said, quiet: Number.isFinite(days) && days > 30 }, late: Number.isFinite(late) ? late : 0 });
  }
  return out;
}

/* ── the key number a card leads with ─────────────────────────────────────── */

/**
 * THE KEY NUMBER A PROJECT'S CARD AND HERO LEAD WITH (the KPI plan of 21 October, 2.5, decided 3): the one he marked to
 * lead the card, else its project's top one by Today's score (`kpiHeadline` in the kernel), as the `kpis` source answers
 * it `for: cards`. Planned by the renderer's own `kpiView`, so the card, the hero and Today say one number one way: the
 * figure (a flow its last whole month), its name, how it moved on the period before, and its line.
 *
 * ITS LINE IS ITS OWN READINGS, never tasks done by week beside a money figure; from three points, as every chart.
 * A STALE ONE SAYS SO IN THE WARN COLOUR, with the words, never red: red on a card is for what is late.
 */
export type CardKpi = {
  key: string;
  /** Its name, said small beside the figure: "Licence revenue". */
  name: string;
  /** The figure, said short as a tile says one, its unit word left to the name: "£1,900", "1,240". */
  figure: string;
  /** How it moved on the period before, in words, and whether that was the good way: "Up 36% on Aug". */
  move: { said: string; tone: 'good' | 'warn' | null } | null;
  /** "Not updated since 3 Oct", where it has stopped arriving; the move is not said then. */
  stale: string | null;
  /** Its line in the renderer's `0 0 1000 100` box: the line, the fill under a flow, its last dot, the month still running. */
  line: { line: string; area: string; end: string; partial: string } | null;
  /** The whole of it in one sentence, for a screen reader. */
  sentence: string;
};

/** A key number as the `kpis` source answers it: the renderer's input, and the project it is of. */
export type KpiAnswered = KpiInput & { thing?: string | undefined; project?: string | undefined };

/**
 * One key number as a card draws it, or `null` when nothing has arrived for it: a number with no value is no figure,
 * and the card then says what it says without one.
 */
export function cardKpiOf(a: KpiAnswered, opts: { home?: string | null; now?: number } = {}): CardKpi | null {
  const v = kpiView(a, opts);
  if (!v.figure) return null;
  const stale = v.stale ? v.stale.said : null;
  const drawn = v.chart && (v.chart.form === 'line' || v.chart.form === 'area') && v.chart.line !== '' ? v.chart : null;
  return {
    key: v.key,
    name: v.name,
    /* THE NUMBER WITHOUT ITS UNIT WORD, since the name beside it says what it counts ("251", Specimen downloads): money
       keeps its code, which is what says the currency. */
    figure: v.figure.after === '' || /^[A-Z]{3}$/u.test(v.figure.after) ? v.figure.text : v.figure.main,
    move: !stale && v.change ? { said: `${v.change.said} ${v.change.against}`.trim(), tone: v.change.tone } : null,
    stale,
    line: drawn ? { line: drawn.line, area: drawn.area, end: drawn.end, partial: drawn.partial } : null,
    sentence: v.sentence,
  };
}

/**
 * Each card with the key number its project leads with, matched by the project's row id, else by its name. A card
 * whose project keeps none, or whose number has no value yet, keeps what it said: its money figure, else how far along.
 */
export function withKpis<C extends Pick<ProjectCard, 'name' | 'id' | 'kpi'>>(cards: readonly C[], answers: readonly KpiAnswered[], opts: { home?: string | null; now?: number } = {}): C[] {
  if (answers.length === 0) return [...cards];
  return cards.map((c) => {
    const a = answers.find((x) => (c.id && x.thing ? x.thing === c.id : x.project === c.name));
    const kpi = a ? cardKpiOf(a, opts) : null;
    return kpi ? { ...c, kpi } : c;
  });
}
