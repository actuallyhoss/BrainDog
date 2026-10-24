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
 * THE ORDER IS SET: pages first, for a thing with no page as drawn and for a list that grows; then the blocks and
 * columns a list has earned; then icons, only when the host has handed the glyph names. A tier is never outranked by
 * one below it, so the order offers come in is their rank. THE NAVIGATION SHAPE IS NO LONGER WEIGHED (C11, 24 Oct): one
 * sidebar and one bar are drawn for everyone since nav A, so a shape offer would change nothing anyone sees.
 *
 * A THING THAT HAS A PAGE IS NEVER OFFERED ONE, and "has a page" is read off the pages as drawn: a page made for a row
 * from a template is that row's page (`DrawnPage.row`), whatever its template is titled.
 */

/** The two classes of question Slash files, each with its own `WAITING_MOST`: an arrangement, and who is who. */
export type OfferClass = 'arrange' | 'who';

/** A whole declaration an offer would write when the caller has one drafted. Opaque here: it is carried, never read. */
export type Draft = { id: string; kind: string; body: Record<string, unknown> };

/** What accepting an offer writes, said as what it is; `draft` is the declaration when the caller handed one. */
export type OfferChange =
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

/**
 * What an offer says it will do, in the shape of the kernel's `Prediction` (`kernel/src/govern.ts`): a claim, the figure
 * that grades it, the bound it reaches and when to look. Spelt here because the kernel does not export the type; it is
 * the same shape, so a filed body carries it as it is.
 *
 * `on_miss` IS ALWAYS `none`: a miss is counted on the Slash page and files nothing by itself.
 */
export type OfferPrediction = {
  claim: string;
  measure: { source: string; where?: unknown; value: unknown };
  target: { gte: number } | { lte: number };
  window: string;
  unit?: string;
  on_miss: 'none';
};

export type Offer = Held & {
  /** What it is called on the screen. */
  title: string;
  /** One sentence in the record's words, saying why it is offered. */
  why: string;
  change: OfferChange;
  /**
   * How it is graded later, only where it rests on a figure the kernel can read again (`predictionOf`). Never invented:
   * an offer over nothing the kernel counts carries none.
   */
  prediction?: OfferPrediction;
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
/** Somebody or something earns a page once met this often, or named by this many entries. */
export const NAMED_PAGE = { met: 5, linked: 3 } as const;
/** A list grows when it gains this many entries in thirty days, on this many separate days. */
export const GROWS = { rows: 5, days: 3 } as const;
/** A column is offered when its field is filled on this share of at least this many entries. */
export const COLUMN = { rows: 20, filled: 0.8 } as const;

const DAY_MS = 86_400_000;
/** Where each kind of offer ranks: a tier's base, and up to 999 above it by its strength (`within`). */
export const TIER = { page: 4000, block: 3000, column: 2000, icon: 1000 } as const;
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

/** The window an offer's prediction is read over: the thirty days its basis was counted in. */
export const PREDICTION_WINDOW = '30d';
/** A list id the kernel reads a figure over (`events.<list>`), as the record's own rules write one. */
const LIST_ID = /^[a-z][a-z0-9_]*$/u;

/**
 * The prediction a growing list's page offer carries: the entries made in the list in the thirty days after it has a
 * page rise past the thirty days before. THE FIGURE IS THE ONE THE OFFER RESTS ON (`added30`), read again by the kernel
 * as `events.<list>` `{ count: made }` over the same window, so the grade is the same count the offer was made from. The
 * target is one more than it was, since a prediction the record already meets grades nothing (govern.ts refuses it).
 * `null` for a list id the kernel would not read.
 */
export function predictionOf(l: Pick<GrowingList, 'id' | 'name' | 'added30'>): OfferPrediction | null {
  if (!LIST_ID.test(l.id) || !Number.isInteger(l.added30) || l.added30 < 0) return null;
  return {
    claim: `More is added to ${l.name} in the thirty days after it has a page than the ${count(l.added30)} in the thirty before.`,
    measure: { source: `events.${l.id}`, value: { count: 'made' } },
    target: { gte: l.added30 + 1 },
    window: PREDICTION_WINDOW,
    unit: 'count',
    on_miss: 'none',
  };
}

/** The last day an offer made at `nowMs` waits, `LAPSE_DAYS` on (HD.579, "every proposal states a deadline"). */
export const lapsesFrom = (nowMs: number): string => dayOf(nowMs + LAPSE_DAYS * DAY_MS);

/* ── the offers ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every offer the signals earn, strongest first: pages, blocks and columns, icons. NOT CUT TO THREE, which is
 * `queueOf`'s, so the caller can see what waits behind the three.
 */
export function recommend(signals: DesignSignals): Offer[] {
  const { pages } = signals;
  const lapses = lapsesFrom(signals.nowMs);
  const out: Offer[] = [];
  const offer = (o: Omit<Offer, 'class' | 'lapses'>): void => void out.push({ ...o, class: 'arrange', lapses });
  const drafted = (draft: Draft | undefined): { draft?: Draft } => (draft === undefined ? {} : { draft });
  /* A PREDICTION ONLY WHERE THE OFFER RESTS ON A FIGURE THE KERNEL READS AGAIN: a growing list's count. Somebody met in
     dated lines, a block or column a list earned and an icon rest on nothing it can grade, so carry none. */
  const predicted = (p: OfferPrediction | null): { prediction?: OfferPrediction } => (p === null ? {} : { prediction: p });

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
      ...predicted(predictionOf(l)),
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

/* ── filing through the queue ───────────────────────────────────────────────────────────────────────────────────── */

/** The most rank a filed arrangement may say: the kernel's scale (`kernel/src/govern.ts` `RANK_MOST`), not the tiers'. */
export const FILED_RANK_MOST = 1000;
/**
 * The kernel's scale cut into one band a tier, the lowest band for a rank under every tier (an ask no rule weighed).
 * SIX BANDS STILL, the shape's top one left empty since it went (C11), so a rank filed before reads on the same scale.
 */
const BAND = Math.floor(FILED_RANK_MOST / 6);

/**
 * A rank as a filed arrangement says it, on the kernel's scale, in the same order, so the kernel's "outranks"
 * (`makeRoom`) reads what the queue meant. EACH TIER HAS A BAND OF ITS OWN, so a tier is never level with the one below
 * it; within a band two a few points apart may come out level, and a tie keeps the older.
 */
export const filedRank = (rank: number): number => {
  /* A TIER IS ITS BASE AND UP TO `WITHIN_MOST` ABOVE IT, so the tiers sit `WITHIN_MOST + 1` apart. */
  const step = WITHIN_MOST + 1;
  const r = Math.max(0, Math.min(TIER.page + WITHIN_MOST, Math.floor(rank)));
  return Math.floor(r / step) * BAND + Math.floor(((r % step) * (BAND - 1)) / WITHIN_MOST);
};

/**
 * Which of a filer's asks it files now and which wait their turn: the strongest first, while what already waits leaves
 * room under `WAITING_MOST`.
 *
 * `waiting` IS THE ONE COUNT: every arrangement offer that waits on the person, wherever, the pen's and every filer's
 * open on Decide, so Slash's and the pen's never sum past three. NOTHING OPEN GIVES WAY HERE: an ask stronger than one
 * waiting waits too, and a lapse stays a computed state (`queueOf`), never a take-back by itself.
 */
export function roomFor<T extends { rank: number }>(asks: readonly T[], waiting: number): { file: T[]; wait: T[] } {
  const room = Math.max(0, WAITING_MOST - Math.max(0, waiting));
  /* A STABLE SORT, so two of one strength keep the order they were drafted in. */
  const ranked = [...asks].sort((a, b) => b.rank - a.rank);
  return { file: ranked.slice(0, room), wait: ranked.slice(room) };
}

/* ── what BrainDog draws unasked ───────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT IT DRAWS UNASKED (§45 "Who designs": "I drew the payroll as a calendar. Keep it?"). The tiers above arrange;
 * this one draws: a visual offered for a thing that has data for one and no picture of it, filed as a draft in the
 * page's one reserved slot and kept or thrown away there. AT MOST ONE A DAY AND ONE AT A TIME (`DREW_A_DAY`), so a
 * person is asked one "Keep it?" a day at most, never a queue of them, and A NO IS TERMINAL: a key once asked is never
 * offered again, whatever was answered.
 *
 * TWO SIGNALS, each read by the caller and handed in, and neither names a list or a project:
 * - `dated`: a page somebody wrote that draws a list whose entries have a day, with no calendar, lanes, timeline or
 *   roadmap of it, so nothing on the page shows them by day;
 * - `plan`: a project whose plan reads best in another shape than the one it is drawn in (`planShapeOf`): its stages as
 *   a path, its dated work as a roadmap, its milestones as a timeline, its undated work as a board.
 *
 * THE DRAFT IS THE CALLER'S, as every tier's is: what keeping it writes, checked by the design check before it is filed.
 */
export type Unpictured =
  | { kind: 'dated'; page: string; pageTitle: string; list: string; listName: string; rows: number; draft?: Draft }
  | { kind: 'plan'; list: string; seq: number; name: string; shape: PlanShape; was: PlanShape | null; rows: number; draft?: Draft };

/* ── when the rules cannot draw it: the model ──────────────────────────────────────────────────────────────────── */

/**
 * THE MODEL STEP (C14, §45 "Thinking and cost"): a thing that earned a drawing whose rules' draft the design check
 * refused, or that the rules could not draft at all, is asked of the model once, in these words, about its page. What
 * comes back is held to the same check before it is filed (`describe`), and the offer says what it cost.
 *
 * ONCE A KEY, whatever the model answered: `drewOffer` is handed every key the model was asked as asked, so a thing the
 * model could not draw either never costs a second ask, and the next drawing is offered in its place.
 */
export function drewAsk(u: Unpictured): string {
  if (u.kind === 'dated') return `Draw ${u.listName} on ${u.pageTitle} by day, so the days its entries fall on can be read at a glance. Keep everything else on the page as it is.`;
  return `Draw the plan of ${u.name} as ${PLAN_SAY[u.shape]}, from what it holds.`;
}

/** What a model-made drawing says beside its reason: what asking cost (`slash.ts` `costSaid`). */
export const drewCostWhy = (why: string, cost: string | null): string[] => (cost === null ? [why] : [why, cost]);

/** The most "I drew X. Keep it?" a day, and at once. */
export const DREW_A_DAY = 1;

/** How a drawing ranks among its own: a plan above a list, each lifted by how much it draws. */
export const DREW_TIER = { plan: 2000, dated: 1000 } as const;

/** What a plan shape is called in a sentence. */
const PLAN_SAY: Readonly<Record<PlanShape, string>> = { path: 'a path of stages', roadmap: 'a roadmap', timeline: 'a timeline', board: 'a board' };

/** What a kept plan shape is said as once the project holds nothing it draws. */
const WAS_SAY: Readonly<Record<PlanShape, string>> = {
  path: 'its stages, and it has none now',
  roadmap: 'a roadmap, and nothing open on it has a day now',
  timeline: 'a timeline, and nothing open on it falls on a day now',
  board: 'a board, and nothing on it is open now',
};

/** The key a drawing is asked under, which is never asked again once filed. */
export const drewKey = (u: Unpictured): string =>
  u.kind === 'dated' ? `drew:${u.page}:calendar:${u.list}` : `drew:plan:${u.list}#${u.seq}:${u.was === null ? '' : `from-${u.was}:`}${u.shape}`;

/**
 * The one drawing to offer today, or `null`: none while one waits or once one was filed today, none for a key asked
 * before, and otherwise the strongest. `filedOn` is every day one was filed, `asked` every key ever filed.
 */
export function drewOffer(signals: { nowMs: number; unpictured: readonly Unpictured[]; filedOn: readonly string[]; waiting: number; asked: ReadonlySet<string> }): Offer | null {
  const today = dayOf(signals.nowMs);
  if (signals.waiting >= DREW_A_DAY || signals.filedOn.filter((d) => d === today).length >= DREW_A_DAY) return null;
  const lapses = lapsesFrom(signals.nowMs);
  const offers = signals.unpictured
    .filter((u) => u.rows > 0 && !signals.asked.has(drewKey(u)))
    .map((u): Offer => {
      const drafted = u.draft === undefined ? {} : { draft: u.draft };
      if (u.kind === 'dated')
        return {
          key: drewKey(u),
          class: 'arrange',
          rank: DREW_TIER.dated + within(u.rows),
          basis: `dated@${u.rows}`,
          lapses,
          title: `I drew ${u.listName} on ${u.pageTitle} as a calendar. Keep it?`,
          why: `${count(u.rows)} entries in ${u.listName} have a day, and nothing on ${u.pageTitle} shows them by day.`,
          change: { kind: 'block', page: u.page, list: u.list, block: 'calendar', ...drafted },
        };
      return {
        key: drewKey(u),
        class: 'arrange',
        rank: DREW_TIER.plan + within(u.rows),
        basis: `${u.shape}@${u.rows}`,
        lapses,
        title: `I drew ${u.name}'s plan as ${PLAN_SAY[u.shape]}. Keep it?`,
        why: u.was === null ? planWhy(u.name, u.shape, u.rows) : `${u.name}'s plan was kept as ${WAS_SAY[u.was]}. ${planWhy(u.name, u.shape, u.rows)}`,
        change: { kind: 'block', page: `${u.list}#${u.seq}`, list: u.list, block: u.shape, ...drafted },
      };
    })
    .sort((a, b) => b.rank - a.rank);
  return offers[0] ?? null;
}

/* ── a project's plan, shaped for that project ─────────────────────────────────────────────────────────────────── */

/** The shapes a project's plan is drawn in. */
export type PlanShape = 'path' | 'roadmap' | 'timeline' | 'board';
export const PLAN_SHAPES: readonly PlanShape[] = ['path', 'roadmap', 'timeline', 'board'];

/** What a project's plan holds, as the caller counted it: its stages, and its open work by what it says of time. */
export type PlanFacts = {
  /** Its stages: entries of a list of steps that point at it. */
  stages: number;
  /** Its open work with a day and an effort, so each is a window on a time axis. */
  spans: number;
  /** Its open work with a day and no effort, so each is a moment. */
  moments: number;
  /** Its open work with no day. */
  undated: number;
};

/** A stage path wants at least this many stages; fewer is a step, not a road. */
export const PLAN_STAGES_LEAST = 2;
/** Work drawn on a time axis or a board wants at least this much of it. */
export const PLAN_WORK_LEAST = 3;

/**
 * The shape a project's plan reads best in, from what it holds, or `null` when it holds too little to draw.
 *
 * STAGES FIRST: a project that says its stages has a road, and the road is its plan (§45 "A roadmap is drawn, not
 * listed: its stages, each one's done-when line, and where it stands"). Then its dated work: windows as a roadmap,
 * moments (releases, launches, due days) as a timeline. Undated work alone is a board by its state. So two projects
 * that keep different things draw different plans, with nothing here knowing either one.
 */
export function planShapeOf(f: PlanFacts): PlanShape | null {
  if (f.stages >= PLAN_STAGES_LEAST) return 'path';
  const dated = f.spans + f.moments;
  if (dated >= PLAN_WORK_LEAST) return f.spans >= f.moments ? 'roadmap' : 'timeline';
  if (f.undated >= PLAN_WORK_LEAST) return 'board';
  return null;
}

/** The weight of what a plan shape draws: how many of the project's things it puts on the screen. */
export function planRows(f: PlanFacts, shape: PlanShape): number {
  if (shape === 'path') return f.stages;
  if (shape === 'roadmap' || shape === 'timeline') return f.spans + f.moments;
  return f.undated;
}

/**
 * What a project's page draws its plan as, from what it holds and the shape kept for it: the kept shape, else its road
 * where it has stages, its roadmap where it has dated work, BOTH where it has both, and nothing where it has neither
 * (`packages/seed/src/modules/portfolio.ts` `projectTemplate`, whose road and roadmap each step aside only for the other
 * kept alone).
 */
export const planDrawnOf = (f: PlanFacts, chosen: PlanShape | null): PlanShape | 'both' | null => {
  if (chosen !== null) return chosen;
  const road = f.stages > 0;
  const dated = f.spans + f.moments > 0;
  return road && dated ? 'both' : road ? 'path' : dated ? 'roadmap' : null;
};

/** Whether a plan kept in `shape` draws anything of what the project holds now. */
const planDraws = (f: PlanFacts, shape: PlanShape): boolean => planRows(f, shape) > 0;

/**
 * A shape the project list cannot keep, said as the nearest one it can: moments on a timeline are lines on their day
 * in a roadmap, which draws work with no effort that way. A board has no nearer shape, so none.
 */
const NEARER: Readonly<Record<PlanShape, PlanShape | null>> = { path: null, roadmap: null, timeline: 'roadmap', board: null };

/**
 * THE ONE PLAN THE DESIGN AGENT WOULD DRAW FOR THIS PROJECT, or `null` when what it draws now is what it would (C19,
 * §45 "Each project's roadmap is designed for that project"). Read from that project's own facts and nothing else, so
 * Marsh, with its stages, is offered its road and Encore, with its releases on days, its roadmap.
 *
 * TWO CASES, and only these:
 * - NOTHING KEPT, DRAWN BOTH WAYS: the shape that reads best, its road where its stages say the most (`PLAN_STAGES_LEAST`),
 *   else its dated work.
 * - KEPT, AND THE PROJECT CHANGED SHAPE UNDER IT: a plan kept as its road with no stages left, or as a roadmap with no
 *   dated work left, draws nothing at all, so the shape it holds now is offered in its place, with `was` saying what was
 *   kept (§45: "It is redesigned only when the thing changes shape"). A kept shape that still draws holds still.
 *
 * `keeps` is the shapes the project list can hold: a shape outside it goes to its nearer one, or is not offered.
 */
export function planOffered(f: PlanFacts, chosen: PlanShape | null, keeps: readonly PlanShape[]): { shape: PlanShape; was: PlanShape | null } | null {
  const kept = (s: PlanShape | null): PlanShape | null => (s === null ? null : keeps.includes(s) ? s : NEARER[s] !== null && keeps.includes(NEARER[s]!) ? NEARER[s] : null);
  if (chosen !== null) {
    if (planDraws(f, chosen)) return null;
    const now = kept(planShapeOf(f));
    return now !== null && now !== chosen && planDraws(f, now) ? { shape: now, was: chosen } : null;
  }
  if (planDrawnOf(f, null) !== 'both') return null;
  const best = kept(f.stages >= PLAN_STAGES_LEAST ? 'path' : planShapeOf({ ...f, stages: 0 }));
  return best === null ? null : { shape: best, was: null };
}

/** Why a plan is drawn in its shape, in one sentence. */
function planWhy(name: string, shape: PlanShape, rows: number): string {
  if (shape === 'path') return `${name} has ${count(rows)} stages, so its plan reads as where it stands on them and what each one is done when.`;
  if (shape === 'roadmap') return `${count(rows)} things on ${name} have a day and an effort, so its plan reads as windows on a time axis.`;
  if (shape === 'timeline') return `${count(rows)} things on ${name} fall on a day without a span, so its plan reads as moments on a timeline.`;
  return `${count(rows)} things on ${name} are open with no day, so its plan reads as a board of what is open, doing and done.`;
}
