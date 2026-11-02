/**
 * The rail, in three runs: the places, then the things a place holds, then the rest.
 *
 * THE PLACES ARE THE SEVEN A DAY RUNS THROUGH, Today and Decide first and then the declared sections in the order a
 * founder reaches for them (Work, a shop's Orders, Projects, Money, People, Agents), every other section after them in
 * the reader's order. Decide is a place whether or not anything waits: it is where a question goes, and a row that
 * comes and goes moves every row under it. Past seven, a place is under More with Activity.
 *
 * THE THINGS ARE A SECTION'S OWN ROWS, never its views. Projects holds a page per project (each `row`, a page made about
 * one thing), and each is drawn under the section's name. Work's other pages, Work page and Board, are views of Work,
 * so the rail does not draw them as places too: no place is in the rail twice.
 *
 * A VIEW IS DRAWN UNDER ITS PLACE, WHILE THAT PLACE IS HERE, as a saved view is under its list. Left out altogether,
 * Board and a section's second page (Team's Agent work) had no way in from the rail or the sidebar. The Work
 * screen's own page (`WORK_PAGE`) is the screen it opens, so it is no view of it, and a tabbed section's strip already
 * switches between its pages (`lib/page/tabs.ts`).
 *
 * PURE, AND NODE LOADS IT, so `rail.test.ts` holds the rule without a component.
 */
import type { Flat, FlatItem } from '../nav.ts';
import { WORK_PAGE } from '../work/page.ts';

/**
 * The places in the order the rail draws them, by the section's plain name. Any other section follows, in its order.
 *
 * A SHOP'S ORDERS COME STRAIGHT AFTER DECIDE (use case 6, step 7): they are what a shop opens the app for, and the
 * phone's bar is the rail's first five, so ranked after the founder's places they fell off it into More. The shop use
 * case names its section Shop today and Orders once it folds; both are here, so neither moves the other's rail. A
 * record with neither (his own) reads exactly as before.
 */
export const PLACES = ['work', 'orders', 'shop', 'projects', 'money', 'people', 'agents'];

/** How many places the rail draws, Today and Decide included. */
export const RAIL_MOST = 7;

/** Where Projects ranks on a starter's record (AL3): after every place that declares or is given a number. */
export const LATE = 999;

/** A phone bar's worth of places: the fewest projects that ever make Projects a place of its own on a starter's record. */
export const BAR_WORTH = 5;

/** How many projects Projects holds: the rows of its list (`holds`), else its project pages, since a project need not have one. */
const projectsOf = (item: FlatItem): number => item.holds ?? item.rows ?? 0;

/** How many things one place holds: the rows of the list it is named for, else its pages about one thing, else its pages. */
const itemsOf = (item: FlatItem): number => item.holds ?? item.rows ?? item.near.length;

/** How many things the starter's own places hold, the most of them: what Projects must outgrow to take a slot before them. */
export const starterItems = (own: readonly FlatItem[]): number => Math.max(0, ...own.map(itemsOf));

/**
 * WHETHER PROJECTS WAITS ITS TURN (AL3, RL6, RM10): on a starter's record, until the record holds a bar's worth of
 * projects and more projects than the starter's own place holds things, counted by the Projects list's rows and not its
 * pages. A fresh starter's first projects move nothing on its bar, and a Founder record with twenty projects (his own)
 * keeps Projects where the five put it. His own pick of the bar (`chosen`) is never ranked at all. `starter` is
 * `starterItems` of the starter's own places, `null` on a record with none.
 */
export const projectsLate = (item: FlatItem, name: string, starter: number | null): boolean =>
  starter !== null && name === 'projects' && (projectsOf(item) < BAR_WORTH || projectsOf(item) <= starter);

/** The rail, as it is drawn. */
export type Rail<T> = {
  /** Today, Decide, then the sections, seven at most. */
  places: FlatItem[];
  /** Each section's own rows (a project's page per project), under the section's name. */
  things: [string, T[]][];
  /** The places past seven, then Activity, drawn under More at the rail's foot. */
  rest: FlatItem[];
  /** Each place's views by its key (Board under Work), drawn under the place while it is here. */
  views: Readonly<Record<string, T[]>>;
};

const plainOf = (s: string): string => s.trim().toLowerCase();

/** Where each named place sits, the numbers their own modules declare (`nav.place`), for a section that says none. */
const PLACE_AT: Readonly<Record<string, number>> = { work: 10, orders: 20, shop: 20, projects: 30, money: 40, people: 50, agents: 60 };

/**
 * The rank a section is drawn at: the place its pages declare (`nav.place`), else the named place's own number, else
 * after them all. A STARTER'S OWN PLACE (Goals, Products, Studies, a team's Sprints, a founder's Dashboard) declares 20
 * or 25, so it sits after Work as the record orders it (`packages/record/src/places.ts`), and the phone's bar, which
 * takes its places in the same numbers (`tabsOf`), draws it too (FB4).
 */
function rankOf(item: FlatItem, starter: number | null): number {
  const name = plainOf(item.key === 'work' ? 'work' : item.key.replace(/^section:/u, ''));
  /* ON A STARTER'S RECORD A NEW PROJECTS COMES AFTER THE PLACES THAT RANK (AL3), as on the phone's bar (`atOf` in
     `nav.ts`): it is no place until the first project, and stepping in at 30 then moved Money and pushed the starter's
     own place past the seventh. A record whose projects outgrow the starter's own place keeps it at 30 (RL6, RM10). */
  if (projectsLate(item, name, starter)) return LATE;
  return item.place ?? PLACE_AT[name] ?? 1000;
}

/**
 * How many things the record's starter's own places hold (`starterItems`), or `null` for a record with none: a section
 * that declares where it sits and is none of `PLACES`.
 */
const starterOf = (items: readonly FlatItem[]): number | null => {
  const own = items.filter((i) => i.key.startsWith('section:') && typeof i.place === 'number' && !PLACES.includes(plainOf(i.key.replace(/^section:/u, ''))));
  return own.length > 0 ? starterItems(own) : null;
};

/**
 * The rail, from the flat nav (`flatNav`): its rows and the rows it put under More are one list again, ordered by
 * `PLACES`, and its groups keep only a page about one thing.
 */
export function railOf<T extends { href: string; row?: boolean | undefined; tabs?: boolean | undefined }>(flat: Flat<T>, decideWord: string): Rail<T> {
  const all = [...flat.main, ...flat.more];
  const today = all.find((i) => i.key === 'today');
  const activity = all.find((i) => i.key === 'activity');
  const decide: FlatItem = all.find((i) => i.key === 'decide') ?? { key: 'decide', href: '/decide', label: decideWord, icon: 'decide', near: ['/decide'] };
  /* A STABLE SORT, so the sections none of the places name keep the reader's order among themselves. */
  const starter = starterOf(all);
  const sections = all
    .filter((i) => i.key === 'work' || i.key.startsWith('section:'))
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rankOf(a.item, starter) - rankOf(b.item, starter) || a.i - b.i)
    .map((x) => x.item);
  const things = flat.groups.flatMap(([section, list]): [string, T[]][] => {
    const rows = list.filter((e) => e.row === true);
    return rows.length > 0 ? [[section, rows]] : [];
  });
  /* ONE "HERE" AT A TIME. On Kiln's page the rail marks Kiln, under Projects, and not Projects as well: a section's own
     things are taken out of the addresses its place answers to. */
  const own = new Set(things.flatMap(([, list]) => list.map((e) => e.href)));
  /* AND A SECTION'S VIEWS ARE ITS OWN PLACE: on Board, Work is here, since Board is Work looked at another way. */
  const views = new Map(flat.groups.map(([section, list]) => [section, list.filter((e) => e.row !== true)]));
  const placed = (item: FlatItem): FlatItem => {
    const near = [...new Set([...item.near, ...(views.get(item.label) ?? []).map((e) => e.href)])].filter((h) => !own.has(h));
    return near.length === item.near.length && near.every((h, i) => h === item.near[i]) ? item : { ...item, near };
  };
  const lead = [...(today ? [today] : []), decide];
  const room = Math.max(0, RAIL_MOST - lead.length);
  const places = [...lead, ...sections.slice(0, room).map(placed)];
  const rest = [...sections.slice(room).map(placed), ...(activity ? [activity] : [])];
  const drawn = Object.fromEntries(
    sections.flatMap((item): [string, T[]][] => {
      const list = (views.get(item.label) ?? []).filter((e) => e.tabs !== true && !(item.key === 'work' && e.href === `/p/${WORK_PAGE}`));
      return list.length > 0 ? [[item.key, list]] : [];
    }),
  );
  return { places, things, rest, views: drawn };
}

/** Where the agents work is read, when the record has no Agents place: the page the agents pack declares. */
export const AGENTS_PAGE = '/p/agents';

/** Where agents are connected and set, on every BrainDog: Settings › Agents. */
export const AGENTS_SETTINGS = '/settings/agents';

/**
 * A PACK'S PAGE IS LINKED ONLY WHERE THE RECORD HOLDS IT (empty states, 2 Nov). A new BrainDog does not install the
 * agents pack, and sixteen links in the app sent a person to `/p/agents`, which answered "No page called agents". Each
 * asks here: the page's address where the record's pages (`shell.pages`, the slugs it declares) hold it, else `null`,
 * and the caller then sends the link somewhere that does exist, or draws none.
 */
export const heldPage = (pages: readonly string[] | null | undefined, slug: string): string | null =>
  pages?.includes(slug) === true ? `/p/${slug}` : null;

/**
 * An address as a link may go to it: as it is, unless it names a declared page (`/p/<slug>`, its query and fragment
 * aside) the record does not hold, which is `null`, no link.
 */
export function heldHref(pages: readonly string[] | null | undefined, href: string): string | null {
  const slug = /^\/p\/([^/?#]+)/u.exec(href)?.[1];
  if (slug === undefined) return href;
  /* A ROW'S OWN PAGE (`/p/session%23904`, `pagesByRow`) is not among the declared pages, and goes as it is. */
  if (slug.includes('%23')) return href;
  return heldPage(pages, slug) === null ? null : href;
}

/**
 * Where a link to the agents goes: their page where the record holds it, else Settings › Agents, where one is
 * connected. Every BrainDog has that.
 */
export const agentsPlace = (pages: readonly string[] | null | undefined): string => heldPage(pages, 'agents') ?? AGENTS_SETTINGS;

/**
 * Where the rail's "2 working" row goes: the Agents place, wherever the rail put it (among the seven or under More), by
 * the same plain name `PLACES` ranks it at, else the agents pack's own page where the record holds it, else Settings ›
 * Agents (`agentsPlace`).
 */
export function agentsHref(items: readonly FlatItem[], pages?: readonly string[] | null): string {
  const place = items.find((i) => plainOf(i.key.replace(/^section:/u, '')) === 'agents' || i.href === AGENTS_PAGE);
  return place?.href ?? (pages === undefined ? AGENTS_PAGE : agentsPlace(pages));
}
