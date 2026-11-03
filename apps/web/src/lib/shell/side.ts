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
  /** Its next step as the row says it, where it says one: what the phone's row says under its name beside the lane. */
  next?: string | undefined;
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
 * A PROJECT'S NAME AS THE SIDEBAR SAYS IT (the scope of 24 October): a name typed as a slug, all small letters with
 * hyphens or underscores ("kiln-site"), is said in words with a capital ("Kiln site"), as it sat beside "Glaze shop".
 * Any other name is kept as written, so "Clay.co", "iOS app" and "PotBoard" are never recased. Only what is drawn: the
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
 * A STEADY ORDER (Q47 of 29 October): pins first, then by name, whatever happened this week. It was by this week (late,
 * an agent at work, money moved), so Marsh.gg stood first in one load and 23rd ten minutes later and he hunted for the
 * same project every time. What is happening now is the row's dot and line, never its place. A stable sort, so two of
 * one name keep the record's order.
 */
export function byWeek<P extends Pick<SideProject, 'pinned' | 'name'>>(list: readonly P[]): P[] {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(b.p.pinned) - Number(a.p.pinned) || shownName(a.p.name).localeCompare(shownName(b.p.name), 'en', { sensitivity: 'base', numeric: true }) || a.i - b.i)
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

/** The lanes of a projects list that declares none of its own: `parked`, and `retired` as its done. */
export const LANES_DEFAULT: Lanes = lanesOf(undefined, ['parked', 'retired']);

/**
 * THE THREE WORDS EVERY SCREEN COUNTS PROJECTS BY, SAID IN ONE PLACE (live check of 30 October, 6): IN PLAY is neither
 * parked nor finished, EARNING is in play in the `earning` lane, and BUILDING is in play in any other. The sidebar, Today's
 * projects tile and the Projects board all read these.
 */
export const inPlayOf = (lane: string, lanes: Lanes = LANES_DEFAULT): boolean => !lanes.parked.has(lane) && !lanes.finished.has(lane);
export const EARNING_LANE = 'earning';
export const earningOf = (lane: string, lanes: Lanes = LANES_DEFAULT): boolean => lane === EARNING_LANE && inPlayOf(lane, lanes);
export const buildingOf = (lane: string, lanes: Lanes = LANES_DEFAULT): boolean => lane !== EARNING_LANE && inPlayOf(lane, lanes);

/** What a projects list calls each lane, by its value, as its state field labels it (Personal's `building` is "Active"). */
export type LaneLabels = Readonly<Record<string, string>>;

/** The labels a list's state field gives its lanes, or none. */
export function laneLabelsOf(decl: { state?: string | undefined; fields: readonly { id: string; labels?: LaneLabels | undefined }[] } | undefined): LaneLabels | undefined {
  return decl?.state ? decl.fields.find((f) => f.id === decl.state)?.labels : undefined;
}

/**
 * A LANE IN THE RECORD'S OWN WORDS, said once for every screen that names one (the sidebar's folds, the Projects board,
 * a card, a project's page while it opens): the label the list's state field gives the value, else `fallback`, else
 * the value with its first letter up. Personal's projects list calls `building` "Active", and screens said Building.
 */
export function laneSaid(labels: LaneLabels | undefined, lane: string, fallback?: string): string {
  const said = labels?.[lane];
  if (typeof said === 'string' && said.trim() !== '') return said.trim();
  if (fallback !== undefined) return fallback;
  return lane === '' ? '' : lane.charAt(0).toUpperCase() + lane.slice(1).replace(/_/gu, ' ');
}

/** A lane's word inside a sentence ("3 on hold"): its first letter down, unless the word is an initialism ("MVP"). */
export const laneInLine = (word: string): string => (/^\p{Lu}{2}/u.test(word) ? word : word.charAt(0).toLowerCase() + word.slice(1));

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
  if (p.moved) return { text: 'Paid this month', tone: 'quiet' };
  return null;
}

/**
 * WHAT A PROJECT'S ROW SAYS UNDER ITS NAME ON THE PHONE: its lane and its next step, as
 * the laptop's cards say them ("Building · Ship the first build"), where the phone drew a bare list of names. Either
 * alone where the other is not said, and nothing where neither is. `label` is the lane's own word, as its list says it.
 */
export function phoneLine(p: Pick<SideProject, 'lane' | 'next'>, label: (lane: string) => string): string | null {
  const parts = [p.lane === '' ? '' : label(p.lane).trim(), (p.next ?? '').trim()].filter((x) => x !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
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

/** A row of the sidebar: where it goes, its words and glyph, and the count it carries, if any. */
export type SideLink = {
  href: string;
  label: string;
  icon: string;
  count?: number | undefined;
  /** Other addresses the row answers for, where it stands for a row of the same name (Money's Accounts page for its list). */
  near?: string[] | undefined;
  /** The list whose pages about a row this row stands for (`rowsAsLists`), so a page past the ones the boot sent lights it. */
  of?: string | undefined;
};

/**
 * WHETHER THE SIDEBAR OPENS ON ITS PROJECTS: only once the record holds one. "Projects 0 in
 * play" headed the sidebar of a new shop, which keeps orders and not projects; a record's first project is added on its
 * Projects page, which says how.
 */
export const holdsProjects = (read: { rows: readonly unknown[] } | null): boolean => read !== null && read.rows.length > 0;

/* ── Every place, and the one home of each list ───────────────────────────── */

/** A place as the shell's nav hands it: its row, the addresses it answers to, and its count where it carries one. */
export type NavPlace = {
  key: string;
  href: string;
  label: string;
  icon: string;
  count?: number | undefined;
  near: readonly string[];
  exact?: true | undefined;
  /** An agent is at work: the place wears the live dot. */
  live?: boolean | undefined;
};

/** What a list's declaration says about where it belongs, once the record has said it. */
export type ListFacts = {
  /** The add-on that declares it, if any. */
  pack?: string | undefined;
  /** It holds money: a money field. */
  money: boolean;
  /** It keeps people or organisations: it declares their roles. */
  folk: boolean;
  /** It is the projects list itself, the one that declares scopes. */
  projects: boolean;
  /** It links to the projects list. */
  ofProjects: boolean;
};

/** A list as the sidebar places it: the shell's count, its saved views, the kernel's own marked, and what it declares. */
export type SideList = {
  id: string;
  name: string;
  icon: string;
  count: number;
  /** How many of its rows are still open, on a list whose rows finish; absent on one whose rows never do. */
  open?: number;
  views: readonly { name: string; href: string }[];
  kernel: boolean;
  facts: ListFacts | null;
};

/**
 * THE NUMBER BESIDE A LIST IN THE RAIL IS WHAT IS STILL OPEN ON IT (Q35 of 29 October): "Agent runs 949", "Keys 176"
 * and "Numbers 2,527" counted every row ever kept, which reads as a database. A list whose rows finish shows its open
 * ones; a list whose rows never finish (numbers, snapshots) shows none.
 */
export const shownCount = (l: Pick<SideList, 'open'>): { count?: number } => (typeof l.open === 'number' && l.open > 0 ? { count: l.open } : {});

/**
 * WHAT THE RECORD KEEPS FOR ITSELF IS NO ROW UNDER A PLACE (audit of 30 October, 40): Money's More read "Snapshots" and
 * "Filing rules" among the pages a person opens Money for. The nights it keeps are drawn by Over time, and the filing
 * rules open from the Ledger they file; both stay a search or an address away.
 */
const TUCKED: ReadonlySet<string> = new Set(['/r/snapshots', '/r/filing_rules', '/p/money-rules']);

/** The home a list has when it is under no place: the projects' part, or More lists. */
export const IN_PROJECTS = '#projects';
export const IN_MORE = '#more';

const word = (s: string): string => s.trim().toLowerCase();

/**
 * THE ONE HOME OF EACH LIST: under the place it belongs to, under the projects, or under More lists. GENERIC, read off
 * what each list declares and never off its name, first what it is and then what it holds: the kernel's own go to the
 * agents' place, a list that keeps people to the place it is named as, a list from an add-on named for a place to that
 * place; then one that links to the projects goes under them, and one that holds money to Money. Each tier lends its home
 * to the other lists of the same add-on before the next tier is read, so an add-on's lists stay together. A list whose
 * declaration has not been read yet keeps the home given in `kept`, and whatever is left is under More lists.
 */
export function homesOf(
  lists: readonly SideList[],
  places: readonly Pick<NavPlace, 'key' | 'label'>[],
  at: { agents: string | null; money: string | null },
  kept: Readonly<Record<string, string>> = {},
): Map<string, string> {
  const keys = new Set([...places.map((p) => p.key), IN_PROJECTS, IN_MORE]);
  const byName = new Map(places.map((p) => [word(p.label), p.key] as const));
  /* A PLACE THE ADD-ON IS NAMED FOR: `money-core` is Money's, `crew-skills` the Crew's. */
  const namedFor = (pack: string | undefined): string | null => {
    const parts = pack ? word(pack).split(/[^a-z0-9]+/u) : [];
    return places.find((p) => word(p.label) !== '' && parts.includes(word(p.label)))?.key ?? null;
  };
  /* FIRST WHAT A LIST IS: the kernel's own, a list of people, an add-on named for a place. THEN WHAT IT HOLDS: a link
     to the projects, money. Each tier lends its home to the rest of the add-on's lists before the next is read. */
  const sure = (l: SideList): string | null =>
    l.kernel ? at.agents : l.facts === null ? null : l.facts.folk ? (byName.get(word(l.name)) ?? null) : namedFor(l.facts.pack);
  const held = (l: SideList): string | null => (l.facts === null ? null : l.facts.ofProjects ? IN_PROJECTS : l.facts.money ? at.money : null);
  const lend = (home: (l: SideList) => string | null): Map<string, string> => {
    const out = new Map<string, string>();
    for (const l of lists) {
      const h = home(l);
      if (h !== null && l.facts?.pack && !out.has(l.facts.pack)) out.set(l.facts.pack, h);
    }
    return out;
  };
  const firstPack = lend(sure);
  const nextPack = lend(held);
  const out = new Map<string, string>();
  for (const l of lists) {
    const pack = l.facts?.pack;
    const home =
      sure(l) ??
      (pack ? firstPack.get(pack) : undefined) ??
      held(l) ??
      (pack ? nextPack.get(pack) : undefined) ??
      (l.facts === null ? kept[l.id] : undefined) ??
      IN_MORE;
    out.set(l.id, keys.has(home) ? home : IN_MORE);
  }
  return out;
}

/** The order the places stand in the sidebar: the rail's, with the agents' place straight after money's. */
export function sideOrder<P extends { key: string }>(places: readonly P[], at: { agents: string | null; money: string | null }): P[] {
  const agents = places.find((p) => p.key === at.agents);
  const money = places.findIndex((p) => p.key === at.money);
  if (!agents || money < 0) return [...places];
  const rest = places.filter((p) => p !== agents);
  const after = rest.findIndex((p) => p.key === at.money);
  return [...rest.slice(0, after + 1), agents, ...rest.slice(after + 1)];
}

/** A place as the sidebar draws it: its row, what it counts, and the lists that unfold under it while you are there. */
export type SidePlace = NavPlace & {
  /** The list whose rows its count says, where it is named as one (Work's tasks, People's people). */
  list?: string | undefined;
  /** The lists, views and tools that are this place's own. */
  kids: SideLink[];
  /**
   * HOW MANY OF `kids` STAND OPEN, where a place keeps the rest under its own More (Money: its pages first, its lists
   * folded). Left out, every kid stands open as before.
   */
  lead?: number | undefined;
};

/** The whole sidebar, from the shell's nav and the record's lists: every place, the projects' part, More lists, the foot. */
export type SideModel = {
  places: SidePlace[];
  /** Where the projects' heading opens (the portfolio page), the projects' own pages, and the lists under them. */
  projects: { href: string | null; label: string; things: readonly SideLink[]; kids: SideLink[] } | null;
  more: SideLink[];
  foot: SideLink[];
};

/**
 * THE SIDEBAR AS ONE MODEL (the shell's frame of 27 October): each place with its own lists under it, the projects with
 * theirs, whatever has no place under More lists, and the foot. A list named as a place, or as one of the sections under
 * More, is that row and carries its count, so one word is never two rows; the list a place counts (`counted`) is that
 * place's row too.
 */
export function sideModel(o: {
  places: readonly NavPlace[];
  /** The sections past the places (Services, a dashboard), drawn under More lists. */
  others: readonly NavPlace[];
  projects: { href: string; label: string; things: readonly SideLink[] } | null;
  lists: readonly SideList[];
  homes: ReadonlyMap<string, string>;
  /** Each place's own views (Board under Work), by its key. */
  views: Readonly<Record<string, readonly SideLink[]>>;
  /** Tools that belong to a place (automations, keys), by the place's key. */
  tools: readonly (SideLink & { home: string })[];
  foot: readonly SideLink[];
  /** The list a place counts, by the place's key (Work's tasks). */
  counted: Readonly<Record<string, string>>;
  /**
   * THE ROWS A PLACE KEEPS OPEN, by the place's key and in this order; every other row of it folds under its More and
   * carries no count, since a list's size is not something that needs you (Money's Snapshots 31, Categories 15).
   */
  leads?: Readonly<Record<string, readonly string[]>>;
  /**
   * PAGES HELD OFF THE RAIL WHILE THEIR LISTS ARE EMPTY (`waits` in `boot-live.ts`), by the place they go under, or
   * `IN_MORE` where their section is no place: an add-on just installed is drawn somewhere (audit 31 Oct f, AF7).
   * `section` is the section the page files itself under, which names its row under More lists (`Life`, polish-i PI2).
   */
  waiting?: readonly (SideLink & { home: string; section?: string | undefined })[];
}): SideModel {
  const named = new Map([...o.places, ...o.others].map((p) => [word(p.label), p.key] as const));
  const folded = new Map<string, SideList>();
  for (const l of o.lists) {
    if (l.facts?.projects) continue;
    const by = Object.entries(o.counted).find(([, id]) => id === l.id)?.[0] ?? (l.kernel ? undefined : named.get(word(l.name)));
    if (by !== undefined && !folded.has(by)) folded.set(by, l);
  }
  const taken = new Set([...folded.values()].map((l) => l.id));
  /* A LIST WHOSE PAGE ALREADY STANDS UNDER A PLACE IS THAT ROW, NOT ONE MORE UNDER MORE LISTS (pages pass, 2 Nov): the
     Profiles add-on files its page under Agents and its list has no place of its own, so the rail said Profiles under
     Agents and Profiles again under More lists. Such a list goes home to the place whose page bears its name, where
     `once` keeps the page as the row and the list as an address it answers for. Only a list More lists would have held,
     and only by a row the place already draws, so a list with no other place is never dropped. */
  const pageAt = new Map<string, string>();
  for (const p of o.places) for (const r of [...(o.views[p.key] ?? []), ...o.tools.filter((t) => t.home === p.key)]) if (!pageAt.has(word(r.label))) pageAt.set(word(r.label), p.key);
  const homeOf = (l: SideList): string | undefined => {
    const home = o.homes.get(l.id);
    return home === IN_MORE ? (pageAt.get(word(l.name)) ?? home) : home;
  };
  const rows = (home: string): SideLink[] =>
    o.lists
      .filter((l) => !taken.has(l.id) && !l.facts?.projects && homeOf(l) === home)
      .flatMap((l) => [{ href: `/r/${l.id}`, label: l.name, icon: l.icon, ...shownCount(l) }, ...l.views.map((v) => ({ href: v.href, label: v.name, icon: 'doc' }))]);
  const own = (key: string): SideLink[] => [...o.tools, ...(o.waiting ?? []).map(({ section: _, ...w }) => w)].filter((t) => t.home === key).map(({ home: _, ...t }) => t);
  const viewsOf = (l: SideList | undefined): SideLink[] => (l ? l.views.map((v) => ({ href: v.href, label: v.name, icon: 'doc' })) : []);
  /* ONE ROW FOR ONE WORD UNDER A PLACE: a page the place declares (Money's Accounts, Ledger, Filing rules) and the list
     of the same name were two rows. The page is the row, and its list is a tap away on it. */
  /* AND THE ROW KEPT ANSWERS FOR THE ONE LEFT OUT (F33): Money's Accounts page stood for the Accounts list, so an
     account's own page, whose crumb is placed by its list (`upTrail`), found no row and read "Accounts › HSBC" with no
     Money before it. */
  const once = (rows: readonly SideLink[]): SideLink[] => {
    const seen = new Map<string, SideLink>();
    const out: SideLink[] = [];
    for (const r of rows) {
      const at = word(r.label);
      const kept = seen.get(at);
      if (kept === undefined) {
        const row = { ...r };
        seen.set(at, row);
        out.push(row);
      } else {
        /* AND THE ADDRESSES THE ROW LEFT OUT ANSWERED FOR, so Trips stands for each trip's page too (`rowsAsLists`). */
        const more = [...(r.href !== kept.href ? [r.href] : []), ...(r.near ?? [])].filter((h) => h !== kept.href && !(kept.near ?? []).includes(h));
        if (more.length > 0) kept.near = [...(kept.near ?? []), ...more];
        /* AND THE LIST IT STANDS FOR (`of`), so a page past the boot's first five still finds it (`litOfUp`). */
        if (r.of !== undefined && kept.of === undefined) kept.of = r.of;
      }
    }
    return out;
  };
  const places = o.places.map((p): SidePlace => {
    const l = folded.get(p.key);
    const kids = once([...(o.views[p.key] ?? []), ...viewsOf(l), ...rows(p.key), ...own(p.key)]).filter((k) => !TUCKED.has(k.href));
    const lead = o.leads?.[p.key];
    const split = lead ? leadFirst(kids, lead) : null;
    return {
      ...p,
      /* A PLACE KEEPS ITS LIST'S WHOLE COUNT WHERE THE ROWS NEVER FINISH: People 11 is eleven people. */
      ...(p.count === undefined && l ? (typeof l.open === 'number' ? shownCount(l) : { count: l.count }) : {}),
      ...(l ? { list: l.id } : {}),
      kids: split ? split.kids : kids,
      ...(split && split.lead < split.kids.length ? { lead: split.lead } : {}),
    };
  });
  const others = o.others.map((p): SideLink => {
    const l = folded.get(p.key);
    return { href: p.href, label: p.label, icon: p.icon, ...(p.count !== undefined ? { count: p.count } : l ? shownCount(l) : {}) };
  });
  /* A WAITING PAGE WHOSE SECTION IS NO PLACE IS DRAWN AS ITS SECTION (polish-i, PI2), as the section is once the page
     holds something: Weather files itself under "Life", so More lists has a Life row that opens Weather, and the bar
     says "Life › Weather" (`placed`). A second page of the section answers to the same row, and a section already
     drawn under More takes the page as one of its own. */
  const sections: SideLink[] = [];
  for (const w of o.waiting ?? []) {
    if (w.home !== IN_MORE) continue;
    const { home: _, section, ...link } = w;
    const named = section?.trim() ? section.trim() : link.label;
    const held = [...others, ...sections].find((r) => word(r.label) === word(named));
    if (held) held.near = [...(held.near ?? []), link.href];
    else sections.push({ ...link, label: named });
  }
  return {
    places,
    projects: o.projects ? { ...o.projects, kids: rows(IN_PROJECTS) } : null,
    more: [...others, ...o.others.flatMap((p) => viewsOf(folded.get(p.key))), ...rows(IN_MORE), ...sections],
    foot: [...o.foot],
  };
}

/** An address a row answers to: itself and anything under it, or itself alone. */
type Answering = { href: string; near?: readonly string[] | undefined; exact?: true | boolean | undefined };

/**
 * THE ONE LIT ROW: of every row the sidebar draws, the one whose address the page is on most closely, so a list under
 * Money lights the list and not Money, and a project's page lights the project and not Projects. A row's own address
 * beats one it merely answers to, and a row drawn deeper beats its place on a tie. `null` for a page no row leads to.
 */
export function litOf(path: string, m: SideModel): string | null {
  const rows: Answering[] = [
    ...m.foot,
    ...m.more,
    ...(m.projects ? [...m.projects.things, ...m.projects.kids] : []),
    ...m.places.flatMap((p) => p.kids),
    /* A PLACE ANSWERS FOR THE ROWS OF THE LIST IT COUNTS (audit of 30 October, 25): a person's page, `/r/people/4`, lit
       nothing, so the desk's bar was empty over it and the phone's said the name the heading under it said again. */
    ...m.places.map((p) => (p.list ? { ...p, near: [...(p.near ?? []), `/r/${p.list}`] } : p)),
    ...(m.projects?.href ? [{ href: m.projects.href }] : []),
  ];
  let best: string | null = null;
  let score = 0;
  for (const r of rows) {
    for (const h of [r.href, ...(r.near ?? [])]) {
      const exact = path === h;
      if (!exact && (r.exact || !path.startsWith(h.endsWith('/') ? h : `${h}/`))) continue;
      const s = h.length * 4 + (exact ? 2 : 0) + (h === r.href ? 1 : 0);
      if (s > score) {
        score = s;
        best = r.href;
      }
    }
  }
  return best;
}

/** One step of the crumb: its words, and where it goes when it is not the page you are on. */
export type Crumb = { label: string; href?: string | undefined };

/**
 * WHERE YOU ARE, IN WORDS (the bar's crumb): the lit row's place, the lit row, and the page's own name when the page is
 * below that row ("Money › Ledger", "Projects › Kiln", "Money › Ledger › Rent"). Each step before the last is a link.
 *
 * THE BAR SAYS THE PAGE'S TITLE ONCE, so the last step is the page's own words where it has them: `heading` ends the crumb
 * in place of the row's word (Today says "Good afternoon, Mara"). A page whose name is its content (a question, a row)
 * gives no title, and the crumb ends at the place it sits in, still a link back there.
 */
export function crumbOf(path: string, m: SideModel, lit: string | null, title: string | null, heading: string | null = null, up: Crumb | null = null): Crumb[] {
  const steps = upFirst(path, m, lit, up) && up?.href ? upTrail(m, up.label, up.href, title) : placed(path, m, lit, title);
  const h = heading?.trim() ?? '';
  const last = steps[steps.length - 1];
  if (h !== '' && last) last.label = h;
  return h !== '' && !last ? [{ label: h }] : steps;
}

/**
 * WHETHER THE LIT ROW IS THE PAGE'S OWN: its address, or one the row stands for (`near`), and not a row the page merely
 * sits under by the start of its address.
 */
export function litExactly(path: string, lit: string, m: SideModel): boolean {
  if (path === lit) return true;
  const rows: readonly { href: string; near?: readonly string[] | undefined }[] = [
    ...m.foot,
    ...m.more,
    ...(m.projects ? [...m.projects.things, ...m.projects.kids] : []),
    ...m.places.flatMap((p) => p.kids),
    ...m.places,
  ];
  return rows.some((r) => r.href === lit && (r.near ?? []).includes(path));
}

/**
 * THE WAY BACK A PAGE DECLARES (`up`) WINS OVER A ROW LIT ONLY BY THE START OF THE ADDRESS (3 Nov): a plugin's page said
 * "Projects › HSBC Egypt alerts" because a row under Projects answered to its address, while the page itself said it
 * sits under Plugins. A row lit as the page's own still wins.
 */
export function upFirst(path: string, m: SideModel, lit: string | null, up: Crumb | null): boolean {
  if (!up?.href || up.label.trim() === '' || path === up.href) return false;
  return lit === null || !litExactly(path, lit, m);
}

/**
 * A PAGE ABOUT A ROW SITS WHERE ITS LIST SITS (Q38 of the 29 Oct audit). An account's, a bill's or a service's own page,
 * and a row of a list no sidebar row leads to, lit nothing, so the bar said the row's name alone, or nothing at all,
 * while a person's said "People" and an organisation's "People › Organisations". The list the page's head names (`up`)
 * is placed as the sidebar places it, every step a way back, and the page's own name ends it.
 */
function upTrail(m: SideModel, label: string, href: string, title: string | null): Crumb[] {
  const t = title?.trim() ?? '';
  const upLit = litOf(href, m);
  const trail: Crumb[] = upLit === null ? [{ label, href }] : placed(href, m, upLit, null).map((c) => ({ ...c, href: c.href ?? upLit }));
  return t !== '' && word(t) !== word(trail[trail.length - 1]?.label ?? '') ? [...trail, { label: t }] : trail;
}

function placed(path: string, m: SideModel, lit: string | null, title: string | null): Crumb[] {
  const t = title?.trim() ?? '';
  if (lit === null) return t === '' ? [] : [{ label: t }];
  const place = m.places.find((p) => p.href === lit || p.kids.some((k) => k.href === lit));
  const inProjects = m.projects && (m.projects.href === lit || m.projects.things.some((k) => k.href === lit) || m.projects.kids.some((k) => k.href === lit));
  const row = [...m.places, ...m.places.flatMap((p) => p.kids), ...(m.projects ? [...m.projects.things, ...m.projects.kids] : []), ...m.more, ...m.foot].find((r) => r.href === lit);
  const head: Crumb[] = [];
  if (place && place.href !== lit) head.push({ label: place.label, href: place.href });
  else if (inProjects && m.projects && m.projects.href !== lit) head.push({ label: m.projects.label, ...(m.projects.href ? { href: m.projects.href } : {}) });
  const label = row?.label ?? (m.projects?.href === lit ? m.projects.label : '');
  /* A SECTION WHOSE ROW IS A PAGE OF ANOTHER NAME (an add-on's Weather under "Life", a place or a row under More): on
     that page the crumb is the section and then the page's own name, the section no link to the page you are on, and
     the phone's bar says "Weather" where it said "Life". Before, the page's name was said nowhere once the bar took it
     from the head. A row under a place or a project is the page's own name already, and is left as it is. */
  const owned = m.places.some((p) => p.kids.some((k) => k.href === lit)) || Boolean(inProjects);
  const leads = path === lit && lit.startsWith('/p/') && !owned && t !== '' && word(t) !== word(label);
  const steps: Crumb[] = [...head, leads ? { label } : { label, href: lit }];
  if ((path !== lit || leads) && t !== '' && word(t) !== word(label)) steps.push({ label: t });
  /* THE LAST STEP IS WHERE YOU ARE, never a link to itself; the place a titleless page sits in stays a way back to it. */
  const last = steps[steps.length - 1];
  if (last && (t !== '' || path === lit)) delete last.href;
  return steps.filter((s) => s.label !== '');
}

/** The counts this device last drew for the places it reads them for, by place key, so a read never blanks a number. */
export const COUNTS_KEY = 'bd_side_counts';
/** Bump when the kept shape changes. Before 2 it was every record's counts by base alone, for whoever was signed in. */
export const COUNTS_VERSION = 2;

const bag = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * THE COUNTS KEPT FOR `base` AND `person`, by place key, read safely: whole numbers not under zero, `{}` for another
 * record's. `null` for an entry to drop: the old shape, another person's, one with nobody to draw it for (no shell kept
 * beside it, `keptPerson`), or one that does not read. ONE ENTRY, FOR ONE RECORD AND ONE PERSON, as the sidebar's list
 * and week are: kept by record alone, the next person to sign in on a shared device was drawn the last one's counts
 * (review 3, P1).
 */
export function countsKept(raw: string | null, base: string, person: string | null): Record<string, number> | null {
  if (raw === null) return {};
  try {
    const e: unknown = JSON.parse(raw);
    if (!bag(e) || e.v !== COUNTS_VERSION || typeof e.base !== 'string' || typeof e.person !== 'string' || !bag(e.counts)) return null;
    if (e.base !== base) return {};
    if (person === null || e.person !== person) return null;
    return Object.fromEntries(Object.entries(e.counts).filter((kv): kv is [string, number] => typeof kv[1] === 'number' && Number.isSafeInteger(kv[1]) && kv[1] >= 0));
  } catch {
    return null;
  }
}

/** The entry to keep for `base` and `person`: what was kept for them, with `now` over it. */
export function countsEntry(raw: string | null, base: string, person: string, now: Record<string, number>): string {
  return JSON.stringify({ v: COUNTS_VERSION, base, person, counts: { ...(countsKept(raw, base, person) ?? {}), ...now } });
}

/** What this device keeps of the lists' facts, by record and list, so the next draw places each list at once. */
export const FACTS_KEY = 'bd_side_facts';

/** The kept facts of one record, read safely; anything unreadable is nothing kept. */
export function factsKept(raw: string | null, base: string): Record<string, ListFacts> {
  try {
    const v = (raw ? JSON.parse(raw) : {}) as Record<string, Record<string, unknown>>;
    const mine = v[base];
    if (typeof mine !== 'object' || mine === null) return {};
    const out: Record<string, ListFacts> = {};
    for (const [id, f] of Object.entries(mine)) {
      if (typeof f !== 'object' || f === null) continue;
      const g = f as Record<string, unknown>;
      out[id] = { ...(typeof g.pack === 'string' ? { pack: g.pack } : {}), money: g.money === true, folk: g.folk === true, projects: g.projects === true, ofProjects: g.ofProjects === true };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * A place's rows with the ones it keeps open first, in the order asked, and the rest after them without their counts.
 * `lead` is how many stand open. PURE, so `side.test.ts` can hold it.
 */
export function leadFirst(kids: readonly SideLink[], hrefs: readonly string[]): { kids: SideLink[]; lead: number } {
  const open = hrefs.flatMap((h) => kids.filter((k) => k.href === h));
  const rest = kids.filter((k) => !hrefs.includes(k.href)).map(({ count: _, ...k }) => k);
  return { kids: [...open, ...rest], lead: open.length };
}

/**
 * How many of Money's own pages stand open under it in the sidebar; its lists and the rest of its pages fold under More.
 * FOUR (plan F3): at six, with More, its rows pushed Projects 196px down the rail on every Money page.
 */
export const MONEY_LEAD_MOST = 4;

/**
 * HOW MANY ROWS ANY PLACE STANDS OPEN BEFORE THE REST FOLD UNDER ITS MORE, where it names none of its own (`lead`), and
 * the most it may hold open with no More at all: five rows open is no taller than four and a More.
 */
export const PLACE_LEAD_MOST = 4;
export const PLACE_OPEN_MOST = 5;

/** How many of a place's rows stand open: all of them up to `PLACE_OPEN_MOST`, else its own lead capped at four. */
export const leadOf = (p: { kids: readonly unknown[]; lead?: number | undefined }): number =>
  p.kids.length <= PLACE_OPEN_MOST ? p.kids.length : Math.min(p.lead ?? p.kids.length, PLACE_LEAD_MOST);

/**
 * THE PAGES THAT STAND OPEN UNDER MONEY: the first of the place's own pages, in the order their declarations give them
 * (`nav.order`), less the place's own page, so no page is named here. Money's own come first (Accounts, Ledger, Budgets,
 * Coming up) because they declare the lowest orders; an add-on's page declares a later one.
 */
export function moneyLead(views: readonly { href: string }[] | undefined, own: string | undefined): string[] {
  return (views ?? [])
    .filter((v) => v.href !== own)
    .slice(0, MONEY_LEAD_MOST)
    .map((v) => v.href);
}

/**
 * A PLACE'S PAGES ABOUT ONE ROW AS ONE ROW FOR THEIR LIST (his call, 2 Nov): each trip and each plan had a row of its own
 * under Money, thirty and more on a full record, where a project's page sits under Projects for a reason Money's do not
 * have. Each list's pages are now one row, its page where the place has one of that name (Trips) and else its list
 * (Plans), which answers for every one of them, so a trip's page still lights Trips and its crumb still reads Money.
 * A page whose list is not said keeps its own row.
 */
export function rowsAsLists(
  rows: readonly { href: string; title: string; register?: string | undefined }[],
  views: readonly { href: string; title: string }[],
  lists: readonly { id: string; name: string; icon?: string | undefined }[],
): SideLink[] {
  const out: SideLink[] = [];
  const byList = new Map<string, string[]>();
  for (const r of rows) {
    if (typeof r.register !== 'string' || r.register === '') out.push({ href: r.href, label: r.title, icon: 'doc' });
    else byList.set(r.register, [...(byList.get(r.register) ?? []), r.href]);
  }
  for (const [id, hrefs] of byList) {
    const list = lists.find((l) => l.id === id);
    const name = list?.name ?? id;
    const page = views.find((v) => word(v.title) === word(name));
    out.push({ href: page?.href ?? `/r/${id}`, label: page?.title ?? name, icon: list?.icon ?? 'doc', near: hrefs, of: id });
  }
  return out;
}

/**
 * THE ROW A PAGE ABOUT A ROW LIGHTS, from the way back its head says (`frame.up`, `/r/<list>`): the place's row that
 * stands for that list's pages (`rowsAsLists`, `of`) before any other row answering to the list. The record's boot sends
 * only the first five pages of each kind, so a sixth trip (Kyoto) was in no row's `near`, and its way back lit Trips
 * under More lists rather than Money's Trips (add-ons pass 3, 2 Nov).
 */
export function litOfUp(up: string, m: SideModel): string | null {
  const id = /^\/r\/([^/?#]+)$/u.exec(up)?.[1];
  const kid = id === undefined ? undefined : m.places.flatMap((p) => p.kids as readonly { href: string; of?: string | undefined }[]).find((k) => k.of === id);
  return kid?.href ?? litOf(up, m);
}
