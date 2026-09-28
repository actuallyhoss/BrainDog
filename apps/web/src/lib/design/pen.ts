/**
 * The holding pen, as the web draws it: what the record offers, and the two offers the browser makes itself.
 *
 * `19 §3` and `29 §4`: every recommendation goes in the holding pen, is never applied, is one press to keep and one to
 * dismiss, and a dismissal is terminal on every device. The record sends its own offers on `boot` as `pen`, each carrying
 * the whole declaration keeping it writes (`packages/record/src/emergent.ts`). The browser adds two kinds the record has
 * no reason to compute: the navigation shape (`nav-shape.ts`, which reads the screen as well as the record) and an icon
 * for a page or a list that has none, drawn from the glyph set this build ships.
 *
 * GENERIC BY KIND. A kind the record adds later arrives with its title, its why and its whole declaration, and is drawn,
 * shown, kept and dismissed by the same code as a page, so a new kind of offer needs no change here.
 *
 * PLAIN TYPESCRIPT, so a test can load it in Node: the runes live in `nav-prefs.svelte.ts` and the screen.
 */

import { isGlyph, type IconName } from '../ui/icons.ts';
import type { NavShape, NavShapeRecommendation } from './nav-shape.ts';

/** One declaration, whole, as `setDeclaration` and `previewChange` take it. */
export type Decl = { id: string; kind: string; body: Record<string, unknown> };

/**
 * One offer in the pen, in the record's own shape (`PenItem`, contracts §7.4). `kind` is left open, because the record
 * adds kinds and this side draws every one the same way. `id` is the dismissal signature.
 */
export type PenItem = { id: string; kind: string; register: string; title: string; why: string; change: { to: Decl } };

/** The navigation shape as one more offer, which carries its own `id` and never a `PenItem`. */
export type ShapeOffer = { from: 'shape'; id: string; title: string; why: string; shape: NavShape };

/** What one row of the pen is: an offer with a declaration behind it, or the navigation shape, which has none. */
export type Offer = { from: 'change'; item: PenItem } | ShapeOffer;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * `boot`'s `pen`, held to the shape this side draws. A host older than the field sends none, and an item missing a part
 * is left out rather than drawn with a hole in it: an offer with no declaration behind it could not be kept.
 */
export function penOf(said: unknown): PenItem[] {
  if (!Array.isArray(said)) return [];
  return said.flatMap((raw: unknown): PenItem[] => {
    if (!isRecord(raw) || !text(raw.id) || !text(raw.kind) || !text(raw.title) || typeof raw.why !== 'string') return [];
    const to = isRecord(raw.change) ? raw.change.to : undefined;
    if (!isRecord(to) || !text(to.id) || !text(to.kind) || !isRecord(to.body)) return [];
    return [
      {
        id: raw.id,
        kind: raw.kind,
        register: typeof raw.register === 'string' ? raw.register : '',
        title: raw.title,
        why: raw.why,
        change: { to: { id: to.id, kind: to.kind, body: to.body } },
      },
    ];
  });
}

/**
 * The navigation shape's recommendation, as one more offer. Its id is `shape:<shape>:<reason>`, the signature the old
 * device store kept, so the exact recommendation dismissed is the one that stays gone and a record that changes enough
 * to earn a different one may say so again.
 */
export const shapeOffer = (rec: NavShapeRecommendation, title: string): ShapeOffer => ({
  from: 'shape',
  id: `shape:${rec.shape}:${rec.reason}`,
  title,
  why: rec.reason,
  shape: rec.shape,
});

/**
 * Words that name a glyph other than by its own name. Each target is checked against the set this build ships before it
 * is offered, so a name the set drops is an offer not made rather than a box drawn empty.
 */
const SAID: Readonly<Record<string, IconName | string>> = {
  finance: 'money',
  finances: 'money',
  budget: 'piggy-bank',
  savings: 'piggy-bank',
  expense: 'receipt-text',
  expenses: 'receipt-text',
  receipt: 'receipt-text',
  receipts: 'receipt-text',
  invoice: 'receipt-text',
  invoices: 'receipt-text',
  bill: 'receipt-text',
  bills: 'receipt-text',
  payment: 'credit-card',
  payments: 'credit-card',
  card: 'credit-card',
  cards: 'credit-card',
  income: 'hand-coins',
  sales: 'chart-line',
  revenue: 'chart-line',
  metrics: 'chart-line',
  stats: 'chart-column',
  reports: 'chart-column',
  event: 'calendar',
  events: 'calendar',
  meeting: 'calendar-days',
  meetings: 'calendar-days',
  schedule: 'calendar-days',
  appointment: 'calendar-clock',
  appointments: 'calendar-clock',
  booking: 'calendar-check',
  bookings: 'calendar-check',
  diary: 'notebook-pen',
  journal: 'notebook-pen',
  notes: 'notebook-pen',
  note: 'notebook-pen',
  contact: 'people',
  contacts: 'people',
  client: 'people',
  clients: 'people',
  customer: 'people',
  customers: 'people',
  team: 'people',
  staff: 'people',
  family: 'people',
  friends: 'people',
  leads: 'user-plus',
  todo: 'list-todo',
  todos: 'list-todo',
  chores: 'list-checks',
  checklist: 'list-checks',
  project: 'board',
  projects: 'board',
  pipeline: 'square-kanban',
  deals: 'square-kanban',
  company: 'building-2',
  companies: 'building-2',
  suppliers: 'building-2',
  vendors: 'building-2',
  message: 'message-square',
  messages: 'messages-square',
  email: 'mail-open',
  emails: 'mail-open',
  mail: 'mail-open',
  file: 'folder-open',
  files: 'folder-open',
  documents: 'file-text',
  document: 'file-text',
  photos: 'file-image',
  images: 'file-image',
  shopping: 'shopping-cart',
  groceries: 'shopping-cart',
  orders: 'shopping-bag',
  purchases: 'shopping-bag',
  health: 'heart-pulse',
  fitness: 'heart-pulse',
  workouts: 'heart-pulse',
  travel: 'train-front',
  trips: 'train-front',
  places: 'map-pin',
  locations: 'map-pin',
  books: 'book-open',
  reading: 'book-open',
  courses: 'graduation-cap',
  study: 'graduation-cap',
  garden: 'tree-pine',
  plants: 'tree-pine',
  subscriptions: 'rotate-cw',
  renewals: 'rotate-cw',
  reminders: 'alarm-clock',
  deadlines: 'clock-alert',
  passwords: 'lock',
  accounts: 'key',
  devices: 'hard-drive',
  code: 'code',
  releases: 'git-branch',
};

/**
 * The glyphs whose names are ordinary words and are the app's own controls, which a page named "Stop list" or "Back
 * office" should not be offered: an arrow or a close cross on a rail entry reads as a button.
 */
const CONTROLS: ReadonlySet<string> = new Set([
  'plus', 'close', 'check', 'filter', 'copy', 'link', 'arrow', 'back', 'external', 'stop', 'play', 'drag', 'grid', 'edit',
  'trash', 'eye', 'download', 'refresh', 'more', 'chevron', 'search', 'settings', 'home', 'ask', 'info', 'ban', 'alert',
  'decide', 'inbox', 'vault', 'packs', 'rows', 'doc', 'observe', 'history', 'session', 'sliders-horizontal',
]);

/**
 * A glyph for a name, and the word it was read from, or `null` when no word in the name says one.
 *
 * `19 §3`'s rule for the design agent holds here too: it never recommends what it cannot justify from the record, so a
 * name with no word that names a glyph gets no offer rather than a guess.
 */
export function glyphFor(name: string): { icon: IconName; word: string } | null {
  for (const word of name.toLowerCase().split(/[^a-z]+/u)) {
    if (word.length < 3) continue;
    const said = Object.hasOwn(SAID, word) ? SAID[word] : undefined;
    const tries = [said, word, word.endsWith('s') ? word.slice(0, -1) : undefined];
    for (const t of tries) if (t !== undefined && !CONTROLS.has(t) && isGlyph(t)) return { icon: t, word };
  }
  return null;
}

/** A page this record declares, whole, as `pagesReader.read()` answers it. */
export type HeldPage = { slug: string; title: string; body: Record<string, unknown> };
/** A list, whole, as `schema` answers its body. */
export type HeldList = { id: string; name: string; body: Record<string, unknown> };

/** The why an icon offer carries, in the words `words.ts` keeps. */
export type IconWhy = (name: string, word: string) => string;

/**
 * An icon for every rail page and every list that has none, each a whole declaration with the icon set.
 *
 * ONLY A PAGE IN THE RAIL, because the icon is drawn nowhere else: a page reached only from a link would be offered a
 * glyph nobody sees. A page drawn once per row is one declaration, so it is offered once. AN ICON THE SET DOES NOT HAVE
 * COUNTS AS NONE, since the rail already draws the fallback for it.
 */
export function iconOffers(pages: readonly HeldPage[], lists: readonly HeldList[], why: IconWhy): PenItem[] {
  const out: PenItem[] = [];
  for (const p of pages) {
    if (!isRecord(p.body.nav)) continue;
    if (typeof p.body.icon === 'string' && isGlyph(p.body.icon)) continue;
    const got = glyphFor(p.title);
    if (got === null) continue;
    const page = typeof p.body.page === 'string' ? p.body.page : p.slug;
    out.push({
      id: `icon:page:${p.slug}`,
      kind: 'icon',
      register: typeof p.body.derived_from === 'string' ? p.body.derived_from.replace(/^register\./u, '') : '',
      title: p.title,
      why: why(p.title, got.word),
      change: { to: { id: `page.${page}`, kind: 'page', body: { ...p.body, icon: got.icon } } },
    });
  }
  for (const l of lists) {
    if (typeof l.body.icon === 'string' && isGlyph(l.body.icon)) continue;
    const got = glyphFor(l.name);
    if (got === null) continue;
    out.push({
      id: `icon:list:${l.id}`,
      kind: 'icon',
      register: l.id,
      title: l.name,
      why: why(l.name, got.word),
      change: { to: { id: `register.${l.id}`, kind: 'register', body: { ...l.body, icon: got.icon } } },
    });
  }
  return out;
}

/** The icon an offer would set, when it is an icon offer, for the row's glyph and the sheet that shows it. */
export function iconOf(item: PenItem): IconName | null {
  const icon = item.kind === 'icon' ? item.change.to.body.icon : undefined;
  return typeof icon === 'string' && isGlyph(icon) ? icon : null;
}

/** The glyph a row of the pen leads with: the icon itself for an icon offer, and a glyph for what kind of thing it adds. */
export function glyphOf(offer: Offer): IconName {
  if (offer.from === 'shape') return 'learning';
  const icon = iconOf(offer.item);
  if (icon !== null) return icon;
  return offer.item.kind === 'page' ? 'doc' : offer.item.kind === 'column' ? 'rows' : 'grid';
}

/**
 * Every offer still waiting, in the order the pen draws them: the shape first, since it changes the thing the others are
 * placed in, then the record's, strongest first as it sent them, then the icons. A dismissed offer is gone here as well
 * as on the record, so a dismissal holds before `boot` is read again.
 */
export function waiting(shape: ShapeOffer | null, record: readonly PenItem[], icons: readonly PenItem[], gone: (id: string) => boolean): Offer[] {
  const out: Offer[] = [];
  if (shape !== null && !gone(shape.id)) out.push(shape);
  const seen = new Set<string>();
  for (const item of [...record, ...icons]) {
    if (gone(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ from: 'change', item });
  }
  return out;
}
