/**
 * The sidebar under the top bar (frame B, 23 October): the record's projects by this week, each with its own colour and
 * mark, a red "late" and a green working dot, and the ones not in play folded at its foot.
 *
 * GENERIC: whatever projects a record holds, found by what its list declares and never by a name. Pure, so
 * `side.test.ts` holds the order, the folds, the facts and the width without a component.
 */

/** One project as the sidebar draws it. */
export type SideProject = {
  key: string;
  name: string;
  href: string;
  mark: string;
  hue: number | null;
  lane: string;
  /** How many of its open tasks are past their day. */
  late: number;
  /** An agent is at work on it now. */
  working: boolean;
  /** Money came in for it this month. */
  moved: boolean;
  /** Pinned on this device, so it stays on top. */
  pinned: boolean;
};

/**
 * A PROJECT'S NAME AS THE SIDEBAR SAYS IT (the scope of 24 October, E2): a name typed as a slug, all small letters with
 * hyphens or underscores ("sam-site"), is said in words with a capital ("Sam site"), as it sat beside "Studio site".
 * Any other name is kept as written, so "Otters.gg", "iOS app" and "Encore" are never recased. Only what is drawn: the
 * row's own title is still what a figure or an agent's run names it by.
 */
const SLUG = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+$/u;
export const shownName = (name: string): string => {
  if (!SLUG.test(name)) return name;
  const words = name.replace(/[-_]+/gu, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The sidebar's width on a desk, dragged between these, and where it starts. */
export const SIDE_MIN = 220;
export const SIDE_MAX = 320;
export const SIDE_START = 248;

/** A width as the drag or the device gave it, kept inside the two ends; anything unreadable is the start. */
export const widthOf = (n: unknown): number => {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : Number.NaN;
  return Number.isFinite(v) ? Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, v))) : SIDE_START;
};

/**
 * BY THIS WEEK: pins first, then what is late, then what an agent is at work on, then where money moved, and the rest
 * in the order the record keeps them. A stable sort, so two of a kind keep the record's order.
 */
export function byWeek<P extends Pick<SideProject, 'pinned' | 'late' | 'working' | 'moved'>>(list: readonly P[]): P[] {
  const rank = (p: P): number => (p.pinned ? 0 : p.late > 0 ? 1 : p.working ? 2 : p.moved ? 3 : 4);
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p);
}

/** The lanes not in play, as the projects list declares them: a parked one, and the ones it calls done. */
export type Lanes = { parked: ReadonlySet<string>; finished: ReadonlySet<string> };

/** The lanes a list declares by its state field's values: `parked` is parked, the declared done states are finished. */
export function lanesOf(decl: { done?: readonly string[] | undefined } | undefined, values: readonly string[]): Lanes {
  const done = new Set(decl?.done ?? []);
  if (done.size === 0 && values.includes('retired')) done.add('retired');
  return { parked: new Set(values.filter((v) => v === 'parked' && !done.has(v))), finished: done };
}

/** The projects split into in play, parked and finished, each keeping the order it came in. */
export function splitOf<P extends Pick<SideProject, 'lane'>>(list: readonly P[], lanes: Lanes): { play: P[]; parked: P[]; finished: P[] } {
  const out = { play: [] as P[], parked: [] as P[], finished: [] as P[] };
  for (const p of list) (lanes.finished.has(p.lane) ? out.finished : lanes.parked.has(p.lane) ? out.parked : out.play).push(p);
  return out;
}

const digits = (n: number): string => n.toLocaleString('en-GB');

/**
 * THE ONE FACT A PROJECT SAYS ON THE PHONE'S PROJECTS TAB (frame C's line, brought to B): what is late first, then who
 * is on it, then money that moved; nothing for a quiet one. `tone` says which colour it is drawn in.
 */
export function factOf(p: Pick<SideProject, 'late' | 'working' | 'moved'>): { text: string; tone: 'late' | 'live' | 'quiet' } | null {
  if (p.late > 0) return { text: `${digits(p.late)} late`, tone: 'late' };
  if (p.working) return { text: 'An agent is on it', tone: 'live' };
  if (p.moved) return { text: 'Money in this month', tone: 'quiet' };
  return null;
}

/**
 * THE SENTENCE OVER THE PHONE'S LIST: "13 in play: 7 earning, 6 building. 2 have something late." Each lane by the word
 * its list gives it, in the order the lanes first appear; the late half only when something is.
 */
export function playSaid(play: readonly Pick<SideProject, 'lane' | 'late'>[], label: (lane: string) => string): string {
  if (play.length === 0) return 'Nothing in play.';
  const counts = new Map<string, number>();
  for (const p of play) if (p.lane !== '') counts.set(p.lane, (counts.get(p.lane) ?? 0) + 1);
  const parts = [...counts].map(([lane, n]) => `${digits(n)} ${label(lane).toLowerCase()}`);
  const head = parts.length > 0 ? `${digits(play.length)} in play: ${parts.join(', ')}.` : `${digits(play.length)} in play.`;
  const late = play.filter((p) => p.late > 0).length;
  return late === 0 ? head : `${head} ${digits(late)} ${late === 1 ? 'has' : 'have'} something late.`;
}

/** The pins kept on this device, as the addresses of the projects pinned. */
export const PINS_KEY = 'bd_side_pins';
/** Whether the sidebar is hidden, and its width, on this device. */
export const SIDE_KEY = 'bd_side';

/** What this device keeps of the sidebar: hidden or not, and its width. Anything unreadable is the default. */
export function sideKept(raw: string | null): { hidden: boolean; width: number } {
  try {
    const v = raw ? (JSON.parse(raw) as { hidden?: unknown; width?: unknown }) : {};
    return { hidden: v.hidden === true, width: widthOf(v.width) };
  } catch {
    return { hidden: false, width: SIDE_START };
  }
}

/** The pins kept on this device: addresses only, each once. */
export function pinsKept(raw: string | null): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.startsWith('/')))] : [];
  } catch {
    return [];
  }
}

/** A row under Lists: where it goes, its words and glyph, and the count it carries, if any. */
export type SideLink = { href: string; label: string; icon: string; count?: number | undefined };

/** A group under Lists, folded until opened. A group of one is drawn as its row. */
export type SideGroup = { key: string; label: string; icon: string; items: SideLink[] };

/** A list as the sidebar groups it: the kernel's own (agent runs) and the ones that hold money are told apart. */
export type SideList = {
  id: string;
  name: string;
  icon: string;
  count: number;
  views: readonly { name: string; href: string }[];
  kernel: boolean;
  money: boolean;
};

/** The heading each kind of group is drawn under. */
export type SideHeads = Record<'money' | 'kernel' | 'lists' | 'views' | 'extras', { label: string; icon: string }>;

/**
 * THE LISTS PART OF THE SIDEBAR (frame A, 23 October), in the order the More sheet read them: the places the bar leaves
 * out (Work, People), then money's lists, the agents' own, the other lists, every saved view, and the tools. Empty groups
 * are left out. GENERIC: a list is money's by a money field it declares and the agents' by the kernel declaring it.
 */
export function groupsOf(places: readonly SideLink[], lists: readonly SideList[], views: readonly SideLink[], tools: readonly SideLink[], heads: SideHeads): SideGroup[] {
  const row = (l: SideList): SideLink => ({ href: `/r/${l.id}`, label: l.name, icon: l.icon, count: l.count });
  const group = (key: keyof SideHeads, items: SideLink[]): SideGroup[] => (items.length > 0 ? [{ key, ...heads[key], items }] : []);
  const saved = [...views, ...lists.flatMap((l) => l.views.map((v) => ({ href: v.href, label: v.name, icon: 'doc' })))];
  return [
    ...places.map((p) => ({ key: `place ${p.href}`, label: p.label, icon: p.icon, items: [p] })),
    ...group('money', lists.filter((l) => !l.kernel && l.money).map(row)),
    ...group('kernel', lists.filter((l) => l.kernel).map(row)),
    ...group('lists', lists.filter((l) => !l.kernel && !l.money).map(row)),
    ...group('views', saved),
    ...group('extras', [...tools]),
  ];
}
