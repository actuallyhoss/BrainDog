/**
 * Which projects are cards on Today's desk, in what order, and what each card says.
 *
 * THE LIST IS FOUND BY WHAT IT DECLARES, NEVER BY NAME: the projects list is the one that declares `scopes`
 * (`isProject` in the project page's `project.ts`), so no list id is written here. A retired or parked project is not
 * a card; the lane is whatever the list's state field holds. Pure, so `project-cards.test.ts` holds the rules.
 */

import { cardLayout, dayShort, sinceWords, trendOf } from 'braindog-render';

import { briefFromNote } from '../record/brief.ts';
import { actor } from '../record/names.ts';
import { rowHref, rowScreen } from '../record/row-href.ts';
import { keptOrder } from '../shell/project-order.ts';
import { LANES_DEFAULT } from '../shell/side.ts';
import { hueFor, slotOf } from '../ui/face.ts';
import { pictureOf } from '../picture/picture.ts';

import type { CardKpi } from './card-kpi.ts';

/** What of a list's declaration decides its cards. */
export type CardDecl = {
  id: string;
  title: string;
  state?: string | undefined;
  identity?: { mark?: string | undefined; accent?: string | undefined; picture?: string | undefined } | undefined;
  scopes?: unknown;
  fields: readonly { id: string; type: string }[];
};

export type CardRow = { seq: number; id?: string | undefined; fields: Readonly<Record<string, unknown>>; created_at?: string | undefined; updated_at?: string | undefined };

/** One project as a card: its name, mark, hue, one line, next step and, if it has money, one figure. */
export type ProjectCard = {
  key: string;
  name: string;
  mark: string;
  /** The row's own hue, else the one its name is drawn in everywhere (`hueOf`). */
  hue: number | null;
  /** Its picture, its logo, by hash, where it holds one: drawn in place of the mark. */
  picture?: string | null | undefined;
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
  /** Who worked on it last and how long ago, from the runs (`card-life.ts`), where one named it. */
  last?: { agent: string; name: string; said: string } | null;
  /** The record's one figure said who and when (`lifeFromWorked`), so no run read beside it says otherwise. */
  told?: boolean;
  /** The day the row itself last changed, YYYY-MM-DD: what a card with no other sign of life is quiet since. */
  moved?: string | null;
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

/** The lanes that are not on the desk: the ones not in play, as the sidebar and Projects count them (`side.ts`). */
export const OFF_DESK: ReadonlySet<string> = new Set([...LANES_DEFAULT.finished, ...LANES_DEFAULT.parked]);

/**
 * How many cards the desk draws; the rest are one link away. EVERY PROJECT IN PLAY:
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
 * `--ph-fill` is the slot as a bar or a dot (colour lane, 2 Nov): in light the yellow and lime words colours are olive, and
 * a meter or a stack drawn in them read muddy; the fill is the same slot held at 3:1 (`cat-<slot>-fill`).
 */
export const slotStyle = (hue: number | null | undefined): string => {
  const s = slotOf(hue);
  return `--ph:var(--cat-${s});--ph-tint:var(--cat-${s}-tint);--ph-fill:var(--cat-${s}-fill)`;
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
  if (/^(today|yesterday|just now)$/iu.test(t)) return `Worked on ${t.toLowerCase()}`;
  return `Worked on ${/ago$/u.test(t) ? t : `${t} ago`}`;
}

/** When a project was last worked on, as the record's figure `project-worked` says it: the moment, whose run, if quiet. */
export type WorkedAt = { at: string; by: string | null; quiet: boolean };

/**
 * A CARD'S WHO AND WHEN FROM THE RECORD'S ONE FIGURE: who worked on it last and how long
 * ago where the newest sign of work was a run ("Claude worked on it 20 minutes ago"), else how long since its tasks
 * moved ("Worked on 2 days ago"), and quiet past its thirty days. Projects read the tasks alone and Today the runs alone,
 * so one project said "4 days ago" on one and "20 minutes ago" on the other; both draw this now. `now` is the record's
 * clock, so a pinned record says its own "ago".
 */
export function lifeFromWorked(w: WorkedAt, now: number): Pick<ProjectCard, 'last' | 'worked'> {
  const said = sinceWords(w.at, now);
  if (w.by !== null && !w.quiet) return { last: { agent: w.by, name: actor(w.by).name, said }, worked: null };
  return { last: null, worked: { said, quiet: w.quiet } };
}

/**
 * Each card with its who and when from the figure, where the block's when column read one for it (`lastWorked`, aligned
 * with the block's entries); a card it read nothing for is as it was.
 */
export function withWorked<C extends Pick<ProjectCard, 'seq'>>(
  cards: readonly C[],
  entries: readonly { seq?: unknown }[] | undefined,
  lastWorked: readonly (WorkedAt | null)[] | undefined,
  now: number,
): (C & Partial<Pick<ProjectCard, 'last' | 'worked' | 'told'>>)[] {
  const bySeq = new Map<number, WorkedAt>();
  (entries ?? []).forEach((e, n) => {
    const w = lastWorked?.[n];
    if (typeof e.seq === 'number' && w) bySeq.set(e.seq, w);
  });
  return cards.map((c) => {
    const w = bySeq.get(c.seq);
    return w ? { ...c, ...lifeFromWorked(w, now), told: true } : c;
  });
}

/**
 * THE ONE LIVE LINE AT A CARD'S FOOT: who is on it now, else who worked on it last
 * from the runs ("Claude worked on it 2 hours ago"), else how long since its work moved ("Worked on 2 days ago"), else
 * the day the project itself last changed ("Quiet since 28 Sep"). Six of eight cards said a name and a lane and nothing
 * else, so a card with no number, money or next step now says the newest sign of life the record holds, and every card
 * says one. `null` only for a draft's card, which says what it is in its own words.
 */
export type Life =
  | { kind: 'working'; said: string }
  | { kind: 'run'; said: string; agent: string }
  | { kind: 'worked'; said: string; quiet: boolean }
  | { kind: 'quiet'; said: string };

export function lifeOf(card: Pick<ProjectCard, 'worked' | 'last' | 'moved'>, agents: readonly { name: string }[]): Life | null {
  const names = [...new Set(agents.map((a) => a.name))];
  if (names.length > 0) return { kind: 'working', said: `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]} working` };
  if (card.last) return { kind: 'run', said: `Worked on ${card.last.said}`, agent: card.last.agent };
  if (card.worked) return { kind: 'worked', said: workedSaid(card.worked), quiet: card.worked.quiet };
  if (card.moved) return { kind: 'quiet', said: `Nothing changed since ${daySaid(card.moved)}` };
  return null;
}

/**
 * The read of every project the sidebar draws, by the fields a row of it is drawn from: its name, mark, hue, picture,
 * lane and next step, each row keeping its number and id. Read whole, his 27 projects were 468 KB at every open, nearly all of it
 * their notes. ONE SHAPE FOR THE SIDEBAR AND THE WEEK'S LATE WORK (`card-late.ts`), which reads the same rows for their
 * ids, so the two are one read kept by the version, as they were while both read the rows whole.
 */
export function drawnRead(decl: Pick<CardDecl, 'id' | 'title' | 'state' | 'identity' | 'fields'>, limit: number): { register: string; limit: number; fields?: string[] } {
  const drawn = [decl.title, decl.identity?.mark, decl.identity?.accent ?? 'hue', decl.identity?.picture, decl.state, 'next'];
  const fields = [...new Set(drawn)].filter((f): f is string => typeof f === 'string' && decl.fields.some((d) => d.id === f));
  return { register: decl.id, limit, ...(fields.length > 0 ? { fields } : {}) };
}

/**
 * The row's hue where it holds a number, else the hue its name is drawn in on the rail and in Today's tasks (`hueFor`);
 * an empty field is not hue 0. EVERY PROJECT IN ITS OWN COLOUR: most
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
  /* A DRAFT COMES FIRST: it is the one thing on the desk waiting for a press. THEN THE SIDEBAR'S ORDER, by this week,
     where it has drawn this record (`project-order.ts`), so the projects stand in one order everywhere; a project it has
     not drawn yet, and every project before it has drawn, by lane and then by number. */
  const drafty = (r: CardRow): number => (r.fields.draft === true ? 0 : 1);
  const order = kept ? [] : keptOrder();
  const placed = (r: CardRow): number => {
    const i = order.indexOf(`${decl.id}#${r.seq}`);
    return i < 0 ? order.length : i;
  };
  if (!kept) live.sort((a, b) => drafty(a.r) - drafty(b.r) || placed(a.r) - placed(b.r) || (RANK[a.lane] ?? 2) - (RANK[b.lane] ?? 2) || a.r.seq - b.r.seq);
  const cards = live.slice(0, most).map(({ r, name, lane }): ProjectCard => {
    const f = r.fields;
    const about = said(f.about);
    const progress = typeof f.progress === 'number' ? f.progress : typeof f.progress === 'string' && f.progress.trim() !== '' ? Number(f.progress) : Number.NaN;
    return {
      key: `${decl.id}#${r.seq}`,
      name,
      mark: decl.identity?.mark ? said(f[decl.identity.mark]) : '',
      hue: hueOf(decl, f),
      picture: decl.identity?.picture ? pictureOf(f[decl.identity.picture]) : null,
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
      moved: typeof r.updated_at === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(r.updated_at) ? r.updated_at.slice(0, 10) : null,
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
