/**
 * The rail as DIRECTION §39 draws it: the places, then the things a place holds, then the rest.
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
 * Board and a section's second page (Team's Agent work) had no way in from the rail or the phone's More sheet. The Work
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

/** The rail, as it is drawn. */
export type Rail<T> = {
  /** Today, Decide, then the sections, seven at most. */
  places: FlatItem[];
  /** Each section's own rows (a project's page per project), under the section's name. */
  things: [string, T[]][];
  /** The places past seven, then Activity, drawn under More at the foot. */
  more: FlatItem[];
  /** Each place's views by its key (Board under Work), drawn under the place while it is here. */
  views: Readonly<Record<string, T[]>>;
};

const plainOf = (s: string): string => s.trim().toLowerCase();

/** The rank a section is drawn at, by its key's name: one of the named places, else after them. */
function rankOf(item: FlatItem): number {
  const name = plainOf(item.key === 'work' ? 'work' : item.key.replace(/^section:/u, ''));
  const at = PLACES.indexOf(name);
  return at < 0 ? PLACES.length : at;
}

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
  const sections = all
    .filter((i) => i.key === 'work' || i.key.startsWith('section:'))
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.i - b.i)
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
  const more = [...sections.slice(room).map(placed), ...(activity ? [activity] : [])];
  const drawn = Object.fromEntries(
    sections.flatMap((item): [string, T[]][] => {
      const list = (views.get(item.label) ?? []).filter((e) => e.tabs !== true && !(item.key === 'work' && e.href === `/p/${WORK_PAGE}`));
      return list.length > 0 ? [[item.key, list]] : [];
    }),
  );
  return { places, things, more, views: drawn };
}

/** Where the agents work is read, when the record has no Agents place: the page the agents pack declares. */
export const AGENTS_PAGE = '/p/agents';

/**
 * Where the rail's "2 working" row goes: the Agents place, wherever the rail put it (among the seven or under More), by
 * the same plain name `PLACES` ranks it at, else the agents pack's own page.
 */
export function agentsHref(items: readonly FlatItem[]): string {
  const place = items.find((i) => plainOf(i.key.replace(/^section:/u, '')) === 'agents' || i.href === AGENTS_PAGE);
  return place?.href ?? AGENTS_PAGE;
}
