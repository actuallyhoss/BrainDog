/**
 * The holding pen, as the web draws it: what the record offers, and the one offer the browser may add.
 *
 * `19 §3` and `29 §4`: every recommendation goes in the holding pen, is never applied, is one press to keep and one to
 * dismiss, and a dismissal is terminal on every device. The record sends its own offers on `boot` as `pen`, each carrying
 * the whole declaration keeping it writes (`packages/record/src/emergent.ts`), already held to "max 3 waiting" (HD.224).
 *
 * ONE COUNT (ENG-B14). The record is the one recommender, icons included, so the browser makes no offer of its own.
 * THE NAVIGATION SHAPE IS NOT OFFERED (C11, 24 Oct): one sidebar and one bar are drawn for everyone since nav A, so a
 * shape offer would change nothing anyone sees, and one a host still sends is left out. `penCount` is the figure the
 * rail, the Slash page and Settings say.
 *
 * GENERIC BY KIND. A kind the record adds later arrives with its title, its why and its whole declaration, and is drawn,
 * shown, kept and dismissed by the same code as a page, so a new kind of offer needs no change here.
 *
 * PLAIN TYPESCRIPT, so a test can load it in Node: the runes live in `nav-prefs.svelte.ts` and the screen.
 */

import { isGlyph, type IconName } from '../ui/icons.ts';

/** One declaration, whole, as `setDeclaration` and `previewChange` take it. */
export type Decl = { id: string; kind: string; body: Record<string, unknown> };

/**
 * One offer in the pen, in the record's own shape (`PenItem`). `kind` is left open, because the record
 * adds kinds and this side draws every one the same way. `id` is the dismissal signature.
 */
export type PenItem = {
  id: string;
  kind: string;
  register: string;
  title: string;
  why: string;
  change: { to: Decl };
  /**
   * A page offer's list, by id, and the page keeping it makes (the same declaration as `change.to`): what the card on
   * that list's own screen reads (`offerFor`, `draftDrawing`). Absent on every other kind, and from a host older than it.
   */
  list?: string | undefined;
  draft?: Decl | undefined;
  /**
   * The day the offer stops waiting, `YYYY-MM-DD` ("every proposal states a deadline", HD.579). Absent from a host older
   * than it, and dropped when it is not a real day, so the row says nothing rather than a wrong date.
   */
  lapses?: string | undefined;
};

/** What one row of the pen is: an offer with a declaration behind it. */
export type Offer = { from: 'change'; item: PenItem };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * A calendar day as `YYYY-MM-DD` that names a real date (no 31 February), or `undefined`. Small on purpose, since `penOf`
 * is read by every screen: an invalid date throws from `toISOString`, and the round trip refuses any other spelling.
 */
export function dayOf(v: unknown): string | undefined {
  try {
    return typeof v === 'string' && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v ? v : undefined;
  } catch {
    return undefined;
  }
}

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
    const lapses = dayOf(raw.lapses);
    /* `drafted: true` IS A DRAFT THAT IS `change.to` ITSELF, which `boot` sends once (`penSent` in the record). */
    const draft = raw.drafted === true ? to : isRecord(raw.draft) && text(raw.draft.id) && text(raw.draft.kind) && isRecord(raw.draft.body) ? raw.draft : null;
    return [
      {
        id: raw.id,
        kind: raw.kind,
        register: typeof raw.register === 'string' ? raw.register : '',
        title: raw.title,
        why: raw.why,
        change: { to: { id: to.id, kind: to.kind, body: to.body } },
        ...(text(raw.list) ? { list: raw.list } : {}),
        ...(lapses ? { lapses } : {}),
        ...(draft ? { draft: { id: draft.id as string, kind: draft.kind as string, body: draft.body as Record<string, unknown> } } : {}),
      },
    ];
  });
}

/** The icon an offer would set, when it is an icon offer, for the row's glyph and the sheet that shows it. */
export function iconOf(item: PenItem): IconName | null {
  const icon = item.kind === 'icon' ? item.change.to.body.icon : undefined;
  return typeof icon === 'string' && isGlyph(icon) ? icon : null;
}

/** The glyph a row of the pen leads with: the icon itself for an icon offer, and a glyph for what kind of thing it adds. */
export function glyphOf(offer: Offer): IconName {
  const icon = iconOf(offer.item);
  if (icon !== null) return icon;
  return offer.item.kind === 'page' ? 'doc' : offer.item.kind === 'column' ? 'rows' : 'grid';
}

/** Whether an offer a host sent is a navigation shape, which the pen no longer draws (C11). */
export const isShapeItem = (item: PenItem): boolean => item.kind === 'shape' || item.id.startsWith('shape:');

/**
 * Every offer still waiting, in the order the pen draws them: the record's, strongest first as it sent them. A dismissed
 * offer is gone here as well as on the record, so a dismissal holds before `boot` is read again. A navigation shape a
 * host still sends is left out (C11), and the browser makes no offer of its own (ENG-B14).
 */
export function waiting(record: readonly PenItem[], gone: (id: string) => boolean): Offer[] {
  const out: Offer[] = [];
  const seen = new Set<string>();
  for (const item of record) {
    if (isShapeItem(item) || gone(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push({ from: 'change', item });
  }
  return out;
}

/** THE HOLDING PEN'S ROW: how many offers wait, in the rail's words and the sidebar's alike. */
export const suggested = (n: number): string => `${n} suggested`;

/**
 * THE ONE COUNT the rail, the Slash page and Settings say: the record's offers still waiting. It is `waiting`'s own
 * length, so the number and the list beside it never differ, and it is never more than the record sent.
 */
export const penCount = (record: readonly PenItem[], gone: (id: string) => boolean): number => waiting(record, gone).length;

/* ── the offer on a list's own screen (USE-B03: an offer is shown where the person is) ─────────────────────────────── */

/** The card's own words (a unit's new words live in a module it owns, never in `copy.ts`). */
export const offerWords = {
  /** Who made the offer, beside Slash's mark: an offer drawn from use is Slash's (ENG-B17). */
  noticed: 'Slash noticed',
  make: 'Make it',
  /** A place offered for a view he already uses (`place:`, USE-B13): Keep writes it as it stands, so nothing is made. */
  keep: 'Keep it',
  making: 'Making it',
  notNow: 'Not now',
  /** What the small drawing is, for a screen reader: the page the offer would make. */
  drawing: (title: string) => `What ${title} would hold`,
  /** A block of figures, named without a number, since the drawing has read none. */
  figures: 'Figures',
} as const;

/** The card's make button: Keep it for a place offer (`place:`), Make it for the rest. */
export const makeLabel = (item: Pick<PenItem, 'id'>): string => (item.id.startsWith('place:') ? offerWords.keep : offerWords.make);

/** What the card is told about the person's choices: the pen's switch, and whether an offer is gone (dismissed or made). */
export type OfferHeld = { suggest: boolean; gone: (id: string) => boolean };

/**
 * Whether an offer is one Slash drew from use: the record's week page (`week:<list>`, `weeksOffered` in `emergent.ts`),
 * which the record never makes in its first `PEN_YOUNG_DAYS` days.
 *
 * THE PLAIN PAGE OFFER IS NOT ONE. `page:<list>` is made the day a list holds a row and no page reads it, whatever the
 * record's age, so drawn here it put "Slash noticed" on a list made an hour ago: the card in her first fortnight, which
 * ENG-B17 and the onboarding's step 7 ("later") both forbid. It stays where it was, in the rail's count and Settings.
 */
export const drawnFromUse = (item: PenItem): boolean => item.id.startsWith('week:');

/**
 * The one offer for the list being read, or `null`: the first offer drawn from use the record sent for that list with a
 * draft behind it, in the pen's own order. With the pen's switch off, or the offer dismissed or made, there is none.
 *
 * ONE OFFER A SCREEN. Two lines on one screen is the sign USE-B03 names for an offer that reads as a nag.
 */
export function offerFor(pen: readonly PenItem[], list: string, held: OfferHeld): PenItem | null {
  if (!held.suggest || list === '') return null;
  return pen.find((p) => p.kind === 'page' && p.list === list && p.draft !== undefined && drawnFromUse(p) && !held.gone(p.id)) ?? null;
}

/** One block of the drawing: its kind, for the shape it is drawn as, and its name, the words a person reads. */
export type DrawnBlock = { kind: string; name: string; cells: number };

/** The names the grammar's blocks are drawn under when the block itself says none. */
const BLOCK_NAMES: Readonly<Record<string, string>> = {
  stat: offerWords.figures,
  figure: offerWords.figures,
  table: 'Entries',
  calendar: 'Calendar',
  board: 'Board',
  gallery: 'Pictures',
  chart: 'Chart',
  lines: 'Over time',
  path: 'Steps',
  text: 'Note',
};

/**
 * The page the draft would make, as the card draws it: its title, and its blocks by name, in order. A block's name is its
 * own heading or title when it has one, else the name of its kind. NO NUMBER IS DRAWN, since the drawing reads nothing:
 * the figures are drawn as empty cells, as many as the block holds, at most three.
 */
export function draftDrawing(item: PenItem): { title: string; blocks: DrawnBlock[] } {
  const body = item.draft?.body ?? item.change.to.body;
  const title = typeof body.title === 'string' && body.title !== '' ? body.title : item.title;
  const blocks = (Array.isArray(body.blocks) ? body.blocks : []).flatMap((b: unknown): DrawnBlock[] => {
    if (!isRecord(b) || !text(b.kind)) return [];
    const own = text(b.heading) ? b.heading : text(b.title) ? b.title : undefined;
    const name = own ?? (Object.hasOwn(BLOCK_NAMES, b.kind) ? BLOCK_NAMES[b.kind]! : null);
    if (name === null) return [];
    const cells = Array.isArray(b.cells) ? Math.min(Math.max(b.cells.length, 1), 3) : 0;
    return [{ kind: b.kind, name, cells }];
  });
  return { title, blocks };
}

/** The slug of the page an offer makes, for the address the card goes to once it is made. */
export function slugOfDraft(item: PenItem): string {
  const to = item.draft ?? item.change.to;
  return typeof to.body.page === 'string' && to.body.page !== '' ? to.body.page : to.id.replace(/^page\./u, '');
}

/** What keeping or dismissing came to, in the shapes `keep.ts` and `nav-prefs.svelte.ts` answer. */
type Answered = { from: string; fix?: string };

/** What the card's two presses reach: the pen's own keep and dismissal, the move to the page, and the toast. */
export type OfferDeps = {
  /** The pen's keep (`keepOffer`), the same write Settings, Navigation makes. */
  keep: (item: PenItem) => Promise<Answered>;
  /** The dismissal, written into `pen.dismissed` (`navPrefs.dismiss`), terminal on every device. */
  dismiss: (id: string) => Promise<Answered>;
  /** To the page just made. */
  go: (slug: string) => Promise<void> | void;
  /** A toast: the record's own refusal is a warning, the rest is said plainly. */
  say: (text: string, warn?: boolean) => void;
  /** Told whenever what the card shows changes, so a screen can redraw from `hidden` and `busy`. */
  changed?: () => void;
  words: { made: (title: string) => string; dismissed: (title: string) => string; notReached: string };
};

/**
 * The card's two presses, held apart from the screen so a test can press them in Node.
 *
 * ONE MAKE AT A TIME, so a double press writes once. NOT NOW HIDES AT ONCE and is put back only if the record refuses
 * it, since the dismissal is the promise and the person should not wait on the network to see it kept.
 */
export function offerActs(deps: OfferDeps) {
  const gone = new Set<string>();
  let busy: string | null = null;
  const changed = () => deps.changed?.();
  return {
    hidden: (id: string): boolean => gone.has(id),
    busy: (): string | null => busy,
    async make(item: PenItem): Promise<boolean> {
      /* MADE ONCE: a second press while the first is out, or on a card not yet redrawn after it, writes nothing. */
      if (busy !== null || gone.has(item.id)) return false;
      busy = item.id;
      changed();
      try {
        const out = await deps.keep(item);
        if (out.from === 'refused') {
          deps.say(out.fix ?? deps.words.notReached, true);
          return false;
        }
        gone.add(item.id);
        deps.say(deps.words.made(draftDrawing(item).title));
        await deps.go(slugOfDraft(item));
        return true;
      } catch {
        deps.say(deps.words.notReached, true);
        return false;
      } finally {
        busy = null;
        changed();
      }
    },
    async notNow(item: PenItem): Promise<void> {
      if (gone.has(item.id)) return;
      gone.add(item.id);
      changed();
      const saved = await deps.dismiss(item.id).catch((): Answered => ({ from: 'refused', fix: deps.words.notReached }));
      if (saved.from === 'refused') {
        gone.delete(item.id);
        changed();
        deps.say(saved.fix ?? deps.words.notReached, true);
        return;
      }
      deps.say(deps.words.dismissed(item.title));
    },
  };
}

export type OfferActs = ReturnType<typeof offerActs>;
