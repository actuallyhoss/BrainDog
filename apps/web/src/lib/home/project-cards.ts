/**
 * Which projects are cards on Today's desk, in what order, and what each card says.
 *
 * THE LIST IS FOUND BY WHAT IT DECLARES, NEVER BY NAME: the projects list is the one that declares `scopes`
 * (`isProject` in the project page's `project.ts`), so no list id is written here. A retired or parked project is not
 * a card; the lane is whatever the list's state field holds. Pure, so `project-cards.test.ts` holds the rules.
 */

import { briefFromNote } from '../record/brief.ts';

/** What of a list's declaration decides its cards. */
export type CardDecl = {
  id: string;
  title: string;
  state?: string | undefined;
  identity?: { mark: string; accent: string } | undefined;
  scopes?: unknown;
  fields: readonly { id: string; type: string }[];
};

export type CardRow = { seq: number; fields: Readonly<Record<string, unknown>>; created_at?: string | undefined };

/** One project as a card: its name, mark, hue, one line, next step and, if it has money, one figure. */
export type ProjectCard = {
  key: string;
  name: string;
  mark: string;
  /** The row's own hue, or `null` where it has none: the card is then drawn in no colour rather than a made-up one. */
  hue: number | null;
  lane: string;
  brief: string | null;
  next: string | null;
  figure: { minor: number; currency: string; field: string } | null;
  href: string;
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

/** How many cards the desk draws; the rest are one link away. */
export const DESK_MOST = 8;

/** The list that holds projects, by what it declares, or `null` where the record keeps none. */
export const projectsOf = <D extends Pick<CardDecl, 'scopes'>>(decls: readonly D[]): D | null => decls.find((d) => d.scopes !== undefined) ?? null;

const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/* Lanes that earn come first, then those being built, then anything else the list calls a lane. */
const RANK: Readonly<Record<string, number>> = { earning: 0, building: 1 };

function moneyOf(decl: CardDecl, fields: Readonly<Record<string, unknown>>): ProjectCard['figure'] {
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

/** The row's hue where it holds a number, else `null`; an empty field is not hue 0. */
function hueOf(decl: CardDecl, fields: Readonly<Record<string, unknown>>): number | null {
  const v = fields[decl.identity?.accent ?? 'hue'];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** The cards for the desk, in order: earning, building, the rest, each by number; and how many were left off the end. */
export function cardsOf(decl: CardDecl, rows: readonly CardRow[], most = DESK_MOST): { cards: ProjectCard[]; more: number } {
  const live = rows.flatMap((r) => {
    const name = said(r.fields[decl.title]);
    const lane = decl.state ? said(r.fields[decl.state]) : '';
    return name === '' || OFF_DESK.has(lane) ? [] : [{ r, name, lane }];
  });
  /* A DRAFT COMES FIRST: it is the one thing on the desk waiting for a press. */
  const drafty = (r: CardRow): number => (r.fields.draft === true ? 0 : 1);
  live.sort((a, b) => drafty(a.r) - drafty(b.r) || (RANK[a.lane] ?? 2) - (RANK[b.lane] ?? 2) || a.r.seq - b.r.seq);
  const cards = live.slice(0, most).map(({ r, name, lane }): ProjectCard => {
    const f = r.fields;
    const about = said(f.about);
    return {
      key: `${decl.id}#${r.seq}`,
      name,
      mark: decl.identity ? said(f[decl.identity.mark]) : '',
      hue: hueOf(decl, f),
      lane,
      brief: about !== '' ? about : (briefFromNote(said(f.note), name, 1)[0] ?? null),
      next: said(f.next) || null,
      figure: moneyOf(decl, f),
      href: `/r/${decl.id}/${r.seq}`,
      seq: r.seq,
      draft: f.draft === true,
      made: typeof r.created_at === 'string' ? r.created_at : null,
    };
  });
  return { cards, more: Math.max(0, live.length - cards.length) };
}
