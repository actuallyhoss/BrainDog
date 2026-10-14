/**
 * THE ONE RECOMMENDER AND THE ONE QUEUE (ENG-B14, decision 5 of `loop/scope/area-engine-b.md`).
 *
 * Three things recommended in three places under two caps: rules in the daily look (`slash.ts`), the pen (`emergent.ts`)
 * and two rules in the browser. On the owner's record that read "4 suggested" in the rail and seven on the Slash page, two
 * of them for things that already had a page. This file is the one place an arrangement is weighed, and the one place
 * that says which of them wait.
 *
 * IT READS WHAT IT IS HANDED AND FILES NOTHING. `recommend` answers every offer the signals earn, strongest first, and
 * `queueOf` says which three wait, which open ones are displaced and which have lapsed. Reading the record into signals
 * and filing a question are the caller's. Nothing here opens a table, asks a model or knows what day it is: the caller
 * says `nowMs`.
 *
 * THE ORDER IS THE DIRECTION'S: the navigation shape first, "before any page"; then pages, for a thing with no page as
 * drawn and for a list that grows; then the blocks and columns a list has earned; then icons, only when the host has
 * handed the glyph names. A tier is never outranked by one below it, so the order offers come in is their rank.
 *
 * A THING THAT HAS A PAGE IS NEVER OFFERED ONE, and "has a page" is read off the pages as drawn: a page made for a row
 * from a template is that row's page (`DrawnPage.row`), whatever its template is titled.
 */

/** The shapes the navigation takes, as the shell draws them. */
export type NavShape = 'rail' | 'bar' | 'menu';

/** The two classes of question Slash files, each with its own `WAITING_MOST`: an arrangement, and who is who. */
export type OfferClass = 'arrange' | 'who';

/** A whole declaration an offer would write when the caller has one drafted. Opaque here: it is carried, never read. */
export type Draft = { id: string; kind: string; body: Record<string, unknown> };

/** What accepting an offer writes, said as what it is; `draft` is the declaration when the caller handed one. */
export type OfferChange =
  | { kind: 'shape'; shape: NavShape }
  | { kind: 'page'; list: string; seq?: number; draft?: Draft }
  | { kind: 'block'; page: string; list: string; block: string; draft?: Draft }
  | { kind: 'column'; page: string; list: string; field: string; draft?: Draft }
  | { kind: 'icon'; page: string; glyph: string };

/** What the queue holds of an offer that waits: enough to cap, displace and lapse it. */
export type Held = {
  /** What it is about, stable across readings, and the pen's own signature where the pen makes one (`emergent.ts`). */
  key: string;
  class: OfferClass;
  /** How strong it is: the higher outranks. */
  rank: number;
  /** What it rests on, which a dismissal keeps: the offer is not made again until this moves (`basisMoved`). */
  basis: string;
  /** The last day it waits, as `YYYY-MM-DD`. */
  lapses: string;
};

export type Offer = Held & {
  /** What it is called on the screen. */
  title: string;
  /** One sentence in the record's words, saying why it is offered. */
  why: string;
  change: OfferChange;
};

/** A page as it is drawn: one somebody wrote, or one a template made for a row, which carries that row. */
export type DrawnPage = {
  slug: string;
  title: string;
  /** The lists it draws. */
  lists: readonly string[];
  /** The row a template made this page for. Absent on a page somebody wrote. */
  row?: { list: string; seq: number };
  /** Whether it sits in the navigation, and the glyph it carries there. Read only for an icon. */
  placed?: boolean;
  icon?: string | null;
};

/** Somebody or something the record names: met in dated lines, or named by entries in other lists. */
export type NamedThing = { list: string; listName: string; seq: number; name: string; met: number; linked: number; draft?: Draft };

export type GrowingList = {
  id: string;
  name: string;
  rows: number;
  /** Entries added in thirty days, and on how many separate days. */
  added30: number;
  addedDays30: number;
  draft?: Draft;
};

/**
 * A block or a column a list's shape asks of a page that draws it. THE SHAPE IS READ BY THE CALLER, which holds the
 * declarations and the counts (`emergent.ts`); what is weighed here is whether it is strong enough, and which one a page
 * is offered.
 */
export type Earned = {
  kind: 'block' | 'column';
  page: string;
  pageTitle: string;
  list: string;
  listName: string;
  /** The block's kind, or the column's field. */
  what: string;
  /** A column's table, by its place among the page's blocks. */
  at?: number;
  /** The block's kind or the field's label, as a person reads it. */
  label: string;
  /** The entries of the list that back it, and for a column how many of them fill the field. */
  rows: number;
  filled?: number;
  title?: string;
  why?: string;
  draft?: Draft;
};

export type DesignSignals = {
  nowMs: number;
  /** The navigation as it stands. Absent, no shape is weighed. */
  nav?: {
    /** Pages and lists placed in the navigation, not counting the native spine. */
    entries: number;
    sections: number;
    /** Whether the person set the order by hand. */
    arranged: boolean;
    /** The shape somebody chose. Absent while nobody has, which is the rail. */
    chosen?: NavShape;
    /** How many of the entries were opened in sixty days. Absent, use is not weighed. */
    opened60?: number;
  };
  pages: readonly DrawnPage[];
  named?: readonly NamedThing[];
  lists?: readonly GrowingList[];
  earned?: readonly Earned[];
  /** The glyph names the host draws. Absent, no icon is offered. */
  glyphs?: readonly string[];
};

/** The most offers of one class that wait at once (HD.224, "max 3 waiting"). */
export const WAITING_MOST = 3;
/** The days an offer waits before it lapses (HD.579, "every proposal states a deadline"). */
export const LAPSE_DAYS = 14;
/** A measured basis has moved once it is this many times what it was: a list ten times the size is a different list. */
export const BASIS_GROWTH = 10;
/** Somebody or something earns a page once met this often, or named by this many entries (DIRECTION 38). */
export const NAMED_PAGE = { met: 5, linked: 3 } as const;
/** A list grows when it gains this many entries in thirty days, on this many separate days. */
export const GROWS = { rows: 5, days: 3 } as const;
/** A column is offered when its field is filled on this share of at least this many entries. */
export const COLUMN = { rows: 20, filled: 0.8 } as const;
/** The top bar's fixed slots before it hides the rest behind More (`TopBar.svelte`). */
const BAR_SLOTS = 4;

const DAY_MS = 86_400_000;
/** Where each kind of offer ranks: a tier's base, and up to 999 above it by its strength (`within`). */
export const TIER = { shape: 5000, page: 4000, block: 3000, column: 2000, icon: 1000 } as const;
/** The most strength lifts an offer within its tier. */
export const WITHIN_MOST = 999;
const within = (strength: number): number => Math.max(0, Math.min(WITHIN_MOST, Math.floor(strength)));
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const count = (n: number): string => n.toLocaleString('en');
/** The address a name makes, as Slash drafts one: its letters and digits, lower case, joined by hyphens. */
const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');

/* ── has a page ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Whether `thing` has a page as drawn: a page a template made for its row, a page somebody wrote under its name, or one
 * at the address its name makes. THE FIRST IS WHAT THE OLD RULE MISSED (`slash.ts` `entityDrafts` read titles only), and
 * it is why two things with a page were offered one.
 */
export function namedHasPage(pages: readonly DrawnPage[], thing: Pick<NamedThing, 'list' | 'seq' | 'name'>): boolean {
  const name = thing.name.trim().toLowerCase();
  const slug = slugOf(thing.name);
  return pages.some(
    (p) => (p.row !== undefined && p.row.list === thing.list && p.row.seq === thing.seq) || (name !== '' && p.title.trim().toLowerCase() === name) || (slug !== '' && p.slug === slug),
  );
}

/** Whether a page draws `list` whole. A page made for one row is that row's page, and not the list's. */
export const listHasPage = (pages: readonly DrawnPage[], list: string): boolean => pages.some((p) => p.row === undefined && p.lists.includes(list));

/* ── the navigation shape ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The shape that suits the navigation, its one sentence and the fact it rests on, or `null` when the shape drawn suits.
 *
 * THE WINDOW IS NOT READ HERE. The record recommends, and the browser's one job is to not show a shape offer under 900
 * pixels, where the tab bar is drawn whatever is chosen.
 *
 * NOBODY IS TALKED OFF THE DEFAULT RAIL INTO THE TOP BAR: the bar is a choice in Settings, and is offered only back to
 * somebody who chose a shape.
 */
function shapeFor(nav: NonNullable<DesignSignals['nav']>): { shape: NavShape; why: string; basis: string } | null {
  const { entries, sections, arranged, chosen, opened60 } = nav;
  const drawn: NavShape = chosen ?? 'rail';
  let best: { shape: NavShape; why: string; basis: string };
  if (entries <= 1) {
    best =
      entries <= 0
        ? { shape: 'menu', basis: 'nothing-placed', why: 'Nothing is placed in your navigation yet, so a menu takes the least room until there is something to show.' }
        : { shape: 'menu', basis: 'one-page', why: 'Only one page is placed in your navigation, so a menu takes less room than a rail around it.' };
    /* AN ORDER SET BY HAND is somebody caring how it reads, and a menu shows it only after a press. */
    if (arranged) best = { shape: 'rail', basis: 'arranged', why: 'You set the order of your navigation by hand, so a rail keeps that order in view where a menu would hide it.' };
  } else if (entries <= BAR_SLOTS) {
    best = { shape: 'bar', basis: 'fits-bar', why: `You have ${entries} pages in your navigation, few enough for a top bar to show all of them with nothing behind More.` };
  } else if (!arranged && opened60 !== undefined && opened60 >= 2 && opened60 <= BAR_SLOTS) {
    best = {
      shape: 'bar',
      basis: 'few-opened',
      why: `You opened ${opened60} of your ${entries} pages in the last sixty days, few enough for a top bar to show the ones you use.`,
    };
  } else {
    const hidden = entries - BAR_SLOTS;
    best = {
      shape: 'rail',
      basis: 'past-bar',
      why:
        sections > 1
          ? `You have ${entries} pages in ${sections} sections, and a top bar shows four of them with the other ${hidden} behind More.`
          : `You have ${entries} pages in your navigation, and a top bar shows four of them with the other ${hidden} behind More.`,
    };
  }
  if (best.shape === drawn) return null;
  if (chosen === undefined && best.shape === 'bar') return null;
  return best;
}

const SHAPE_TITLE: Record<NavShape, string> = { rail: 'A rail for your pages', bar: 'A top bar for your pages', menu: 'A menu for your pages' };

/* ── the offers ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every offer the signals earn, strongest first: the shape, pages, blocks and columns, icons. NOT CUT TO THREE, which is
 * `queueOf`'s, so the caller can see what waits behind the three.
 */
export function recommend(signals: DesignSignals): Offer[] {
  const { pages } = signals;
  const lapses = dayOf(signals.nowMs + LAPSE_DAYS * DAY_MS);
  const out: Offer[] = [];
  const offer = (o: Omit<Offer, 'class' | 'lapses'>): void => void out.push({ ...o, class: 'arrange', lapses });
  const drafted = (draft: Draft | undefined): { draft?: Draft } => (draft === undefined ? {} : { draft });

  const shape = signals.nav ? shapeFor(signals.nav) : null;
  if (shape) offer({ key: `shape:${shape.shape}`, rank: TIER.shape, basis: shape.basis, title: SHAPE_TITLE[shape.shape], why: shape.why, change: { kind: 'shape', shape: shape.shape } });

  /* A LIST THAT GROWS and no page draws whole. */
  for (const l of signals.lists ?? []) {
    if (l.added30 < GROWS.rows || l.addedDays30 < GROWS.days || listHasPage(pages, l.id)) continue;
    offer({
      key: `page:${l.id}`,
      rank: TIER.page + within(l.added30),
      basis: `grows@${l.rows}`,
      title: `A page for ${l.name}`,
      why: `${l.name} grew by ${count(l.added30)} in the last thirty days, and no page shows it yet.`,
      change: { kind: 'page', list: l.id, ...drafted(l.draft) },
    });
  }

  /* SOMEBODY OR SOMETHING THAT COMES UP OFTEN and has no page as drawn. */
  for (const n of signals.named ?? []) {
    const met = n.met >= NAMED_PAGE.met;
    const linked = n.linked >= NAMED_PAGE.linked;
    if ((!met && !linked) || n.name.trim() === '' || namedHasPage(pages, n)) continue;
    const because = [...(met ? [`came up ${count(n.met)} times`] : []), ...(linked ? [`is named by ${count(n.linked)} entries here`] : [])].join(' and ');
    offer({
      key: `page:${n.list}#${n.seq}`,
      rank: TIER.page + within(n.met + n.linked),
      basis: `${met ? 'met' : ''}${met && linked ? '+' : ''}${linked ? 'linked' : ''}@${n.met + n.linked}`,
      title: `A page for ${n.name}`,
      why: `${n.name} ${because}, and there is no page for ${n.name} yet.`,
      change: { kind: 'page', list: n.list, seq: n.seq, ...drafted(n.draft) },
    });
  }

  /* WHAT A LIST HAS EARNED ON A PAGE THAT DRAWS IT. ONE A PAGE, its strongest: each is the page's whole declaration with
     one thing added, so two kept in turn would each be written without the other (`emergent.ts` `shapesOffered`). */
  const perPage = new Map<string, Offer>();
  for (const e of signals.earned ?? []) {
    if (e.rows <= 0) continue;
    let made: Omit<Offer, 'class' | 'lapses'>;
    if (e.kind === 'block') {
      made = {
        key: `block:${e.page}:${e.what}:${e.list}`,
        rank: TIER.block + within(e.rows),
        basis: `${e.what}@${e.rows}`,
        title: e.title ?? `A ${e.label} of ${e.listName}`,
        why: e.why ?? `${e.listName} holds ${count(e.rows)} entries, and ${e.pageTitle} has no ${e.label} of them.`,
        change: { kind: 'block', page: e.page, list: e.list, block: e.what, ...drafted(e.draft) },
      };
    } else {
      const filled = e.filled ?? 0;
      if (e.rows < COLUMN.rows || filled < e.rows * COLUMN.filled) continue;
      made = {
        key: `column:${e.page}:${e.at ?? 0}:${e.what}`,
        rank: TIER.column + within(e.rows),
        basis: `filled@${e.rows}`,
        title: e.title ?? `${e.label} on ${e.pageTitle}`,
        why: e.why ?? `${e.label} is filled on ${Math.floor((filled / e.rows) * 100)}% of the ${count(e.rows)} entries in ${e.listName}, and the table on ${e.pageTitle} does not show it.`,
        change: { kind: 'column', page: e.page, list: e.list, field: e.what, ...drafted(e.draft) },
      };
    }
    const best = perPage.get(e.page);
    if (best === undefined || made.rank > best.rank) perPage.set(e.page, { ...made, class: 'arrange', lapses });
  }
  out.push(...perPage.values());

  /* AN ICON, only when the host has handed the glyph names: a placed page with none, and a glyph that is a word of its
     title, in the one or the many. */
  const glyphs = signals.glyphs ?? [];
  if (glyphs.length > 0)
    for (const p of pages) {
      if (p.placed !== true || (typeof p.icon === 'string' && p.icon !== '')) continue;
      const words = p.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '');
      const glyph = glyphs.find((g) => words.some((w) => w === g || w === `${g}s` || `${w}s` === g));
      if (glyph === undefined) continue;
      offer({
        key: `icon:${p.slug}`,
        rank: TIER.icon,
        basis: `glyph:${glyph}`,
        title: `An icon for ${p.title}`,
        why: `${p.title} has no icon in your navigation, and there is one called ${glyph}.`,
        change: { kind: 'icon', page: p.slug, glyph },
      });
    }

  /* A STABLE SORT, so two of one strength keep the order they were made in, and the same signals answer the same offers. */
  return out.sort((a, b) => b.rank - a.rank);
}

/* ── the queue ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Whether what an offer rests on has moved since `was`. A basis is a fact, or a fact and a measure (`grows@35`): it has
 * moved when the fact is another, or the measure is `BASIS_GROWTH` times what it was. A LIST THAT GROWS A LITTLE MORE
 * HAS NOT MOVED, which is the scope's own check: "Dismiss one and grow that list again: it does not return."
 */
export function basisMoved(was: string, now: string): boolean {
  const part = (basis: string): { fact: string; n: number | null } => {
    const at = basis.lastIndexOf('@');
    const n = at < 0 ? Number.NaN : Number(basis.slice(at + 1));
    return Number.isFinite(n) ? { fact: basis.slice(0, at), n } : { fact: basis, n: null };
  };
  const a = part(was);
  const b = part(now);
  if (a.fact !== b.fact || (a.n === null) !== (b.n === null)) return true;
  return a.n !== null && b.n !== null && b.n >= Math.max(1, a.n) * BASIS_GROWTH;
}

export type Queue = {
  /** What waits now, arrangements before who is who, each class strongest first and `WAITING_MOST` at most. */
  waiting: (Offer | Held)[];
  /** Open ones a stronger offer took the place of. Not a decline: the caller closes each as displaced. */
  displaced: Held[];
  /** Open ones past their day. Not a decline: the caller closes each as lapsed, and keeps its basis as a dismissal. */
  lapsed: Held[];
  /** The ones in `waiting` that were not open, which is what the caller files. */
  fresh: Offer[];
};

const CLASSES: readonly OfferClass[] = ['arrange', 'who'];

/**
 * Which offers wait. `offers` is what the recommender (or another filer, for who is who) would ask now, `open` what
 * already waits, and `dismissed` every key turned down or lapsed with the basis it had then.
 *
 * AN OPEN OFFER KEEPS ITS PLACE ON A TIE, so a fourth is kept only when it outranks the weakest, and it keeps the day it
 * was given: waiting does not push its day out. One that is offered again is weighed by its rank today.
 */
export function queueOf(offers: readonly Offer[], open: readonly Held[], dismissed: readonly Pick<Held, 'key' | 'basis'>[], nowMs: number): Queue {
  const today = dayOf(nowMs);
  const lapsed = open.filter((o) => o.lapses < today);
  const still = open.filter((o) => o.lapses >= today);
  const stillKeys = new Set(still.map((o) => o.key));
  const again = new Map(offers.map((o) => [o.key, o]));
  /* WHAT WAS TURNED DOWN, and what lapsed this minute: neither is made again until its basis moves. */
  const down = [...dismissed, ...lapsed];
  const blocked = (o: Offer): boolean => down.some((d) => d.key === o.key && !basisMoved(d.basis, o.basis));

  const waiting: (Offer | Held)[] = [];
  const displaced: Held[] = [];
  const fresh: Offer[] = [];
  for (const cls of CLASSES) {
    const kept: { item: Offer | Held; was: Held | null }[] = still
      .filter((o) => o.class === cls)
      .map((o) => {
        const now = again.get(o.key);
        return { item: now ? { ...now, class: cls, lapses: o.lapses } : o, was: o };
      });
    const made = offers.filter((o, i) => o.class === cls && !stillKeys.has(o.key) && !blocked(o) && offers.findIndex((x) => x.key === o.key) === i);
    /* A STABLE SORT with the open ones first, so on a tie the one that waits stays. */
    const all = [...kept, ...made.map((item) => ({ item, was: null }))].sort((a, b) => b.item.rank - a.item.rank);
    all.forEach(({ item, was }, at) => {
      if (at < WAITING_MOST) {
        waiting.push(item);
        if (was === null) fresh.push(item as Offer);
      } else if (was !== null) displaced.push(was);
    });
  }
  return { waiting, displaced, lapsed, fresh };
}

/**
 * The open page offers whose thing has a page now, each with the reason it closes by. These are not declined and not
 * displaced: the question answered itself. Only a key the recommender makes for a page is read.
 */
export function answeredAlready(open: readonly Pick<Held, 'key'>[], signals: Pick<DesignSignals, 'pages' | 'named'>): { key: string; reason: string }[] {
  const out: { key: string; reason: string }[] = [];
  for (const { key } of open) {
    if (!key.startsWith('page:')) continue;
    const subject = key.slice('page:'.length);
    const row = /^(.+)#(\d+)$/u.exec(subject);
    let has: boolean;
    if (row) {
      const [list, seq] = [row[1]!, Number(row[2])];
      const name = signals.named?.find((n) => n.list === list && n.seq === seq)?.name ?? '';
      has = namedHasPage(signals.pages, { list, seq, name });
    } else has = listHasPage(signals.pages, subject);
    if (has) out.push({ key, reason: 'already has a page' });
  }
  return out;
}
