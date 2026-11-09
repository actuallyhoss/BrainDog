/**
 * THE PAGE EVERY LIST HAS: every page is declared and dynamic, the hand-written ones
 * included. `listPage` reads what a list says of itself and answers a page body in the keys the page grammar admits
 * today (`block-keys.ts`), so a list nobody wrote a page for is drawn by the page reader as any stored page is, a
 * person can arrange it, and an agent can propose a change to it.
 *
 * PURE: no clock and no database. It is handed the list's declaration and, where the caller has read it, how many the
 * list holds, and it answers the same page for the same two every time. The record composes it at each read, so the
 * count in its line is that read's; a page stored from it keeps its own words.
 *
 * IT NAMES NO LIST. Everything here is read from the declaration it is handed: the day it sorts by is the one the list
 * puts itself in order by, its lanes are its own state, its cards wear the mark it declares.
 *
 * WHAT THE GRAMMAR DOES NOT ADMIT YET IS LEFT OUT, never written ahead of it (PGS-A16 owes each): a table that reads
 * its next fifty (`more`), a reader's own sort, selection, editing in place, and one block drawn the way the reader
 * picks (`views`). Until `views`, the other ways to see a list are blocks of their own under one folded heading.
 */

import { FILTERS_MOST } from './block-keys.ts';
import type { FieldDecl } from './coerce.ts';

/** A field as a list declares it, with the three words about it this file reads beyond its type. */
export type ListPageField = FieldDecl & { retired?: boolean | undefined; deadline?: boolean | undefined };

/** What `listPage` reads of a list. A list's whole declaration is one of these, and so is a fixture of four keys. */
export type ListPageShape = {
  id: string;
  name: string;
  title: string;
  fields: readonly ListPageField[];
  state?: string | undefined;
  finished?: string | undefined;
  order?: { field: string; dir?: 'asc' | 'desc' | undefined } | undefined;
  identity?: { mark?: string | undefined; accent?: string | undefined; picture?: string | undefined } | undefined;
};

/** What the caller has read of the list, when it has: how many it holds. */
export type ListPageSaid = { count?: number | undefined };

export type ListPageColumn = { field: string; as?: string };
export type ListPageBlock = {
  key: string;
  kind: 'note' | 'table' | 'section' | 'board' | 'calendar' | 'cards';
  heading?: string;
  span?: number;
  lead?: true;
  body?: string;
  fold?: true;
  source?: string;
  columns?: ListPageColumn[];
  order?: { field: string; dir: 'asc' | 'desc' }[];
  limit?: number;
  back?: number;
  ahead?: number;
  empty?: string;
};
export type ListPageFilter = { field: string; control: 'chips' | 'segmented' };
export type ListPage = { page: string; title: string; requires: string[]; filters?: ListPageFilter[]; blocks: ListPageBlock[] };

/** How many a list's page reads at a time. */
export const LIST_PAGE_ROWS = 50;
/** The most columns the table opens on: a list's short form, the rest a click away on the thing itself. */
export const LIST_PAGE_COLUMNS = 6;
/** The most cards a board or a card grid reads, since neither reads its next page yet. */
const VIEW_ROWS = 100;
/** The fewest and the most values a state lays out as lanes: one is no order, and past twelve it is a table on its side. */
const LANES = [2, 12] as const;
/** A choice of this many values or fewer is one segmented control; more is a strip of chips. */
const SEGMENTS_MOST = 4;

/** The types too long, too private or too shapeless to be a column of a table. */
const NOT_A_COLUMN: ReadonlySet<string> = new Set(['document', 'json', 'secret', 'file', 'list']);
/** A field that holds an id, by its name: a person reads names, never ids. */
const ID_FIELD = /^(?:id|uid|uuid|ulid)$|_(?:id|uid|uuid|ulid)$/u;

/** A name as a note may say it: braces and backticks would be read as a figure or as code. */
const plain = (text: string, most: number): string => text.replace(/[{}`]/gu, '').trim().slice(0, most);

/** The words a person reads for a field: its label, else its id with spaces. */
const labelOf = (field: ListPageField): string => plain(field.label ?? field.id.replace(/_/gu, ' '), 60);

/**
 * How the list comes, and whether that is newest first. The day the list puts itself in order by is its day, read
 * newest first whichever way the list reads it; a list in order by anything else keeps its own order; a list that
 * declares none comes newest made first.
 */
function orderOf(decl: ListPageShape, live: readonly ListPageField[]): { order: { field: string; dir: 'asc' | 'desc' }; newest: boolean; day?: ListPageField } {
  const own = decl.order ? live.find((f) => f.id === decl.order!.field) : undefined;
  if (own && (own.type === 'day' || own.type === 'instant')) return { order: { field: own.id, dir: 'desc' }, newest: true, day: own };
  if (own) return { order: { field: own.id, dir: decl.order!.dir ?? 'asc' }, newest: false };
  return { order: { field: 'created_at', dir: 'desc' }, newest: true };
}

/** The one line the page opens on. With a count it says it; with none it says nothing it did not read. */
function leadOf(name: string, said: ListPageSaid, newest: boolean): string {
  const n = said.count;
  const counted = typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (counted && n === 0) return `Nothing in ${name} yet.`;
  const tail = newest && n !== 1 ? ', newest first' : '';
  return `${counted ? n : 'Everything'} in ${name}${tail}.`;
}

/**
 * A list's page: its line, its rows, and the other ways to see it that the list itself has the shape for.
 *
 * A board where its state has an order (two to twelve values, and a fact for the card to say), a calendar where it has
 * a day, cards where it marks its things or holds a picture, and filters on its choice, link and yes-or-no fields.
 */
export function listPage(decl: ListPageShape, said: ListPageSaid = {}): ListPage {
  const source = `register.${decl.id}`;
  const name = plain(decl.name, 80) || decl.id;
  const live = decl.fields.filter((f) => f.retired !== true);
  const by = (id: string | undefined): ListPageField | undefined => (id === undefined ? undefined : live.find((f) => f.id === id));

  const title = by(decl.title);
  const state = by(decl.state);
  const mark = by(decl.identity?.mark);
  const accent = by(decl.identity?.accent);
  /* THE PICTURE A ROW IS DRAWN BY, where the list names one (`identity.picture`), else its first file. */
  const picture = (decl.identity?.picture === undefined ? undefined : by(decl.identity.picture)) ?? live.find((f) => f.type === 'file');
  const { order, newest, day: ownDay } = orderOf(decl, live);
  const days = live.filter((f) => f.type === 'day');
  const due = days.find((f) => f.deadline === true);
  const happened = ownDay ?? days.find((f) => f.deadline !== true) ?? due;
  const money = live.find((f) => f.type === 'money');

  /* THE SHORT FORM: what it is, where it stands, its day and its amount, then the rest in the order the list declares
     them. Never an id, a long text, a file, or the mark and colour a card wears. */
  const worn = new Set([mark?.id, accent?.id]);
  const column = (f: ListPageField | undefined): f is ListPageField => f !== undefined && !NOT_A_COLUMN.has(f.type) && !ID_FIELD.test(f.id) && !worn.has(f.id);
  const short = [...new Set([title, state, happened, money, ...live].filter(column))].slice(0, LIST_PAGE_COLUMNS);
  const facts = short.filter((f) => f !== title && f !== state);

  const blocks: ListPageBlock[] = [
    { key: 'lead', kind: 'note', lead: true, span: 12, body: leadOf(name, said, newest) },
    {
      key: 'rows',
      kind: 'table',
      span: 12,
      source,
      columns: short.map((f) => ({ field: f.id })),
      order: [order],
      limit: LIST_PAGE_ROWS,
      empty: `Nothing in ${name} yet.`,
    },
  ];

  const views: ListPageBlock[] = [];
  /* A BOARD ROW IS state | title | fact | fact, the second fact optional, so a list with nothing to say on a card but
     its name has no board. What a thing is due by leads the facts, as a board is read for what is next. */
  const lanes = state?.type === 'enum' ? (state.values?.length ?? 0) : 0;
  const onCard = [...new Set([due, ...facts].filter(column))].slice(0, 2);
  if (state && title && lanes >= LANES[0] && lanes <= LANES[1] && onCard.length > 0)
    views.push({
      key: 'board',
      kind: 'board',
      heading: `By ${labelOf(state)}`,
      span: 12,
      source,
      columns: [state, title, ...onCard].map((f) => ({ field: f.id })),
      order: [order],
      limit: VIEW_ROWS,
      empty: `Nothing in ${name} yet.`,
    });
  /* A CALENDAR READS EVERY THING IN ITS MONTHS, so it takes no limit. What is due looks ahead; what happened looks back. */
  const on = due ?? (happened?.type === 'day' ? happened : days[0]);
  if (on && title)
    views.push({
      key: 'calendar',
      kind: 'calendar',
      heading: `By ${labelOf(on)}`,
      span: 12,
      source,
      columns: [{ field: title.id }, { field: on.id }],
      ...(on === due ? { back: 0, ahead: 2 } : { back: 2, ahead: 0 }),
      empty: 'Nothing in these months.',
    });
  if (title && (mark || picture))
    views.push({
      key: 'cards',
      kind: 'cards',
      heading: 'As cards',
      span: 12,
      source,
      columns: [
        { field: title.id, as: 'title' },
        ...(mark ? [{ field: mark.id, as: 'mark' }] : []),
        ...(accent?.type === 'int' ? [{ field: accent.id, as: 'hue' }] : []),
        ...(picture ? [{ field: picture.id, as: 'picture' }] : []),
        ...[...(state ? [state] : []), ...facts].slice(0, 3).map((f) => ({ field: f.id, as: 'fact' })),
      ],
      order: [order],
      limit: VIEW_ROWS,
      empty: `Nothing in ${name} yet.`,
    });
  if (views.length > 0) blocks.push({ key: 'views', kind: 'section', heading: 'Other ways to see it', fold: true }, ...views);

  /* WHAT A READER PICKS BY: the state first, then each choice, link and yes-or-no field as the list declares them. */
  const picks = (f: ListPageField): boolean =>
    !worn.has(f.id) && (f.type === 'ref' || f.type === 'bool' || (f.type === 'enum' && (f.values?.length ?? 0) >= 2));
  const filters: ListPageFilter[] = [...new Set([state, ...live].filter((f): f is ListPageField => f !== undefined && picks(f)))]
    .slice(0, FILTERS_MOST)
    .map((f) => ({ field: f.id, control: f.type === 'bool' || (f.type === 'enum' && f.values!.length <= SEGMENTS_MOST) ? 'segmented' : 'chips' }));

  return { page: decl.id, title: name, requires: [source], ...(filters.length > 0 ? { filters } : {}), blocks };
}
