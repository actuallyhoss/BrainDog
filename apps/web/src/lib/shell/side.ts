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
export type SideLink = { href: string; label: string; icon: string; count?: number | undefined };

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
  views: readonly { name: string; href: string }[];
  kernel: boolean;
  facts: ListFacts | null;
};

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
}): SideModel {
  const named = new Map([...o.places, ...o.others].map((p) => [word(p.label), p.key] as const));
  const folded = new Map<string, SideList>();
  for (const l of o.lists) {
    if (l.facts?.projects) continue;
    const by = Object.entries(o.counted).find(([, id]) => id === l.id)?.[0] ?? (l.kernel ? undefined : named.get(word(l.name)));
    if (by !== undefined && !folded.has(by)) folded.set(by, l);
  }
  const taken = new Set([...folded.values()].map((l) => l.id));
  const rows = (home: string): SideLink[] =>
    o.lists
      .filter((l) => !taken.has(l.id) && !l.facts?.projects && o.homes.get(l.id) === home)
      .flatMap((l) => [{ href: `/r/${l.id}`, label: l.name, icon: l.icon, count: l.count }, ...l.views.map((v) => ({ href: v.href, label: v.name, icon: 'doc' }))]);
  const own = (key: string): SideLink[] => o.tools.filter((t) => t.home === key).map(({ home: _, ...t }) => t);
  const viewsOf = (l: SideList | undefined): SideLink[] => (l ? l.views.map((v) => ({ href: v.href, label: v.name, icon: 'doc' })) : []);
  /* ONE ROW FOR ONE WORD UNDER A PLACE: a page the place declares (Money's Accounts, Ledger, Filing rules) and the list
     of the same name were two rows. The page is the row, and its list is a tap away on it. */
  const once = (rows: readonly SideLink[]): SideLink[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const at = word(r.label);
      if (seen.has(at)) return false;
      seen.add(at);
      return true;
    });
  };
  const places = o.places.map((p): SidePlace => {
    const l = folded.get(p.key);
    return {
      ...p,
      ...(p.count === undefined && l ? { count: l.count } : {}),
      ...(l ? { list: l.id } : {}),
      kids: once([...(o.views[p.key] ?? []), ...viewsOf(l), ...rows(p.key), ...own(p.key)]),
    };
  });
  const others = o.others.map((p): SideLink => {
    const l = folded.get(p.key);
    return { href: p.href, label: p.label, icon: p.icon, ...(p.count !== undefined ? { count: p.count } : l ? { count: l.count } : {}) };
  });
  return {
    places,
    projects: o.projects ? { ...o.projects, kids: rows(IN_PROJECTS) } : null,
    more: [...others, ...o.others.flatMap((p) => viewsOf(folded.get(p.key))), ...rows(IN_MORE)],
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
    ...m.places,
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
 */
export function crumbOf(path: string, m: SideModel, lit: string | null, title: string | null): Crumb[] {
  const t = title?.trim() ?? '';
  if (lit === null) return t === '' ? [] : [{ label: t }];
  const place = m.places.find((p) => p.href === lit || p.kids.some((k) => k.href === lit));
  const inProjects = m.projects && (m.projects.href === lit || m.projects.things.some((k) => k.href === lit) || m.projects.kids.some((k) => k.href === lit));
  const row = [...m.places, ...m.places.flatMap((p) => p.kids), ...(m.projects ? [...m.projects.things, ...m.projects.kids] : []), ...m.more, ...m.foot].find((r) => r.href === lit);
  const head: Crumb[] = [];
  if (place && place.href !== lit) head.push({ label: place.label, href: place.href });
  else if (inProjects && m.projects && m.projects.href !== lit) head.push({ label: m.projects.label, ...(m.projects.href ? { href: m.projects.href } : {}) });
  const label = row?.label ?? (m.projects?.href === lit ? m.projects.label : '');
  const steps: Crumb[] = [...head, { label, href: lit }];
  if (path !== lit && t !== '' && word(t) !== word(label)) steps.push({ label: t });
  /* THE LAST STEP IS WHERE YOU ARE, never a link to itself. */
  const last = steps[steps.length - 1];
  if (last) delete last.href;
  return steps.filter((s) => s.label !== '');
}

/** The counts this device last drew for the places it reads them for, by place key, so a read never blanks a number. */
export const COUNTS_KEY = 'bd_side_counts';

/** A kept count, read safely: a whole number not under zero, else nothing. */
export function countKept(raw: string | null, base: string, key: string): number | null {
  try {
    const v = (raw ? JSON.parse(raw) : {}) as Record<string, Record<string, unknown>>;
    const n = v[base]?.[key];
    return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
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
