/**
 * One ordered list of pages, grouped by the section each declares.
 *
 * ONE FUNCTION FOR BOTH NAVS. The rail and the phone's list of places are the same query over `page`
 * rows and were two different shapes — which is how the sheet came to render the declared pages and
 * not the registers under them, leaving a phone with no route to any list at all. Two copies of a
 * grouping is two places for the shapes to drift again.
 *
 * IT IS ITS OWN MODULE because the shell imports it, and the shell's entry chunk is what every
 * screen waits for: `record/api.ts` carries the whole synthetic record and pulling it in here is the
 * mistake `+layout.ts` already has a paragraph about.
 */

import { PLACES } from './nav/rail.ts';

/* NOT EXPORTED. Both callers want the ORDER as well as the grouping, and a bare `group` beside an
   `arrange` is an invitation to reach for the one that skips the reader's arrangement — which is
   exactly the mistake that left the phone's list of places ignoring an order the rail honoured. */
function group<T extends { section: string }>(entries: readonly T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const e of entries) {
    const at = out.get(e.section);
    if (at) at.push(e);
    else out.set(e.section, [e]);
  }
  return [...out];
}

/**
 * The nav in the order it is drawn: declared order inside each section, then the reader's own.
 *
 * TWO BUGS MET HERE AND EACH HID THE OTHER.
 *
 * `order` IS SCOPED TO A SECTION, and the rail sorted the flat list by it globally. Measured on the
 * seeded record: the declared list runs `Money:10 Estate:10 Work:10 Projects:10 Projects:11
 * Projects:12 Tracks:10 Tracks:11 Tracks:12`, and a global sort turns that into `… Projects:10
 * Tracks:10 Projects:11 Tracks:11 …` — two sections interleaved. Nothing on screen showed it,
 * because the sorted list was never rendered; it was only ever the list a MOVE was computed against,
 * so pressing Move up stored a sequence the reader had never seen.
 *
 * AND THE ARRANGEMENT NEVER REACHED THE DOM. The rail rendered `group(nav)` — the raw list — while
 * the ordering lived in a `$derived` read by nothing but the two move functions. So the preference
 * was written, survived a reload, and moved nothing, on a component whose own header says
 * *"position lives in a per-user store and wins"*.
 *
 * WITHIN A SECTION, NEVER ACROSS ONE. A section is a heading a page declares; moving an item out of
 * it would put a page under a title that is not its own. Sorting per bucket is also what makes the
 * flat list section-contiguous, which is what lets a move find its neighbour by walking one step.
 */
export function arrange<T extends { section: string; href: string; order: number }>(
  entries: readonly T[],
  arrangement: readonly string[],
): [string, T[]][] {
  const rank = new Map(arrangement.map((href, i) => [href, i]));
  return group(entries).map(([section, list]) => [
    section,
    /**
     * AN ENTRY THE ARRANGEMENT DOES NOT NAME SITS WHERE THE RECORD PUT IT, and it used to fall to
     * the end. The comment here has always said the first thing and the code did the second:
     * `rank.get(href) ?? Number.MAX_SAFE_INTEGER` ranks every unnamed entry after every named one,
     * so the declaration's own order only ever broke ties among the leftovers.
     *
     * Nothing could reach it today, because the arrangement names every page the seed declares.
     * The day a pack adds one, that page appears at the bottom of its section for everybody who has
     * ever reordered their rail: a new thing, buried, for the readers most likely to be looking.
     *
     * SO AN UNNAMED ENTRY TAKES THE PLACE OF THE NEIGHBOUR IT WAS DECLARED AFTER. Walking the list
     * in the record's own order and giving each unnamed entry a rank just past the last named one
     * puts it back beside the page it was written to sit beside, wherever the reader has since moved
     * that page to. An entry declared before any named one lands first, which is what its
     * declaration asked for.
     */
    list
      .map((e, i) => ({ e, i }))
      .sort((a, b) => a.e.order - b.e.order || a.i - b.i)
      .map(({ e, i }, declared, all) => {
        let at = rank.get(e.href);
        if (at === undefined) {
          /* The last named entry BEFORE this one in the record's order, plus a half, so it lands
             immediately after that neighbour and before whatever the reader put next. */
          let before = -1;
          for (let back = declared - 1; back >= 0; back -= 1) {
            const near = rank.get(all[back]!.e.href);
            if (near !== undefined) {
              before = near;
              break;
            }
          }
          at = before + 0.5;
        }
        return { e, at, i };
      })
      .sort((a, b) => a.at - b.at || a.e.order - b.e.order || a.i - b.i)
      .map((x) => x.e),
  ]);
}

/**
 * The lists in the order the reader's arrangement names them, `/r/<id>` by `/r/<id>`.
 *
 * THE LISTS ARE NOT A DECLARED SECTION, so `arrange` never saw them, and the record keeps no install order: a use case
 * installed on a second record drew its lists in id order (Coursework before Modules). The arrangement a shared use case
 * carries is written into the same preference the rail's Move up writes, and read here.
 *
 * ONLY THE NAMED ONES MOVE, AND ONLY AMONG THEMSELVES. A list the arrangement does not name keeps its place, so a list a
 * later pack adds is not pushed to the end for somebody who once reordered.
 */
export function orderLists<T extends { id: string }>(lists: readonly T[], arrangement: readonly string[]): T[] {
  const rank = new Map(arrangement.map((href, i) => [href, i]));
  const slots = lists.flatMap((l, i) => (rank.has(`/r/${l.id}`) ? [i] : []));
  const named = slots.map((i) => lists[i]!).sort((a, b) => rank.get(`/r/${a.id}`)! - rank.get(`/r/${b.id}`)!);
  const out = [...lists];
  slots.forEach((slot, i) => (out[slot] = named[i]!));
  return out;
}

/**
 * A shared use case's rail order laid over the reader's own: the file's addresses first, in its order, then every address
 * the reader had arranged that the file does not name, in theirs. `arrange` and `orderLists` rank by position, so only
 * the relative order of the file's own pages and lists changes; anything else keeps its place beside its neighbour.
 */
export function withOrder(carried: readonly string[], arrangement: readonly string[]): string[] {
  const named = new Set(carried);
  return [...carried, ...arrangement.filter((href) => !named.has(href))];
}

/* ── the flat list ─────────────────────────────────────────────────────── */

/**
 * One row of the flat nav: where it goes, what it says, its glyph, a count when it carries one, and the addresses that
 * mean "you are here" on it (`near`), each compared as itself or anything under it (`exact` for Today's `/`).
 */
export type FlatItem = { key: string; href: string; label: string; icon: string; count?: number; near: readonly string[]; exact?: true };

/** The words the fixed rows say, handed in so this module stays pure and the words stay in `copy`. */
export type FlatWords = { today: string; activity: string; decide: string };

/**
 * The flat nav: the rows drawn in the one list, the sections that did not fit (drawn under More), and the other pages of
 * every section that are not a row's own page (also under More).
 *
 * `groups` IS THE RAIL'S MORE, section by section: every page a section holds past the one its row opens, a row's own
 * page included, in the reader's arrangement. The rail has the room to name a project and folds each section on its
 * own (`railShut`); the sheet and the top bar keep to `pages`.
 */
export type Flat<T> = { main: FlatItem[]; more: FlatItem[]; pages: T[]; groups: [string, T[]][] };

/**
 * THE MOST ROWS THE LIST HOLDS, Today, Activity and Decide included. The owner's old tool had six in one bar and read them
 * without thinking; past seven a list is something to read rather than to glance at.
 */
export const FLAT_MOST = 7;

/* THE SECTIONS A FOUNDER'S DAY RUNS THROUGH COME FIRST, the ones a record may also hold come after them, and a section
   Today stands in for goes under More. A section none of these name sits after the first three, in the reader's order. */
const FIRST = ['work', 'projects', 'money'];
const AFTER = ['people', 'services'];
const UNDER = ['dashboard', 'views'];

const plainOf = (s: string): string => s.trim().toLowerCase();

/** The page a section opens on: its Overview when it has one, else its first page that is not a row's own. */
function leadOf<T extends { title: string; row?: boolean | undefined }>(entries: readonly T[]): T | undefined {
  return entries.find((e) => plainOf(e.title) === 'overview') ?? entries.find((e) => !e.row) ?? entries[0];
}

/* THE PLACES THE SHELL DRAWS WITH ITS OWN GLYPH, whatever the lead page declares, so the
   rail's Projects is the same picture on every record. Any other section wears its lead page's glyph. */
const SECTION_ICONS: Readonly<Record<string, string>> = { projects: 'projects', work: 'work' };

function sectionItem<T extends { href: string; icon: string }>(section: string, lead: T, entries: readonly T[]): FlatItem {
  const icon = SECTION_ICONS[plainOf(section)] ?? lead.icon;
  return { key: `section:${section}`, href: lead.href, label: section, icon, near: entries.map((e) => e.href) };
}

/**
 * The declared sections, in the reader's arrangement (`arrange`), as one flat list.
 *
 * ONE ROW A SECTION, opening on its lead page, so a project's own page is never a row: the Projects page lists them.
 * Today leads, Activity and Decide follow the first sections (Decide only while something waits on it), and the list
 * stops at `FLAT_MOST`: what does not fit is a row under More, the sections that come last going first.
 */
export function flatNav<T extends { title: string; href: string; icon: string; row?: boolean | undefined }>(
  sections: readonly (readonly [string, readonly T[]])[],
  open: number,
  words: FlatWords,
  { work = null }: { work?: string | null } = {},
): Flat<T> {
  type Row = { section: string; lead: T | undefined; entries: readonly T[]; item: FlatItem; screen?: true };
  const rows: Row[] = sections.flatMap(([section, entries]) => {
    const lead = leadOf(entries);
    return lead ? [{ section, lead, entries, item: sectionItem(section, lead, entries) }] : [];
  });
  /* THE WORK SCREEN, ON A RECORD THAT HOLDS TASKS (`lib/work/Work.svelte`). Its row is the Work section's, opening on the
     screen, and the section's own pages go under More with the others; a record with tasks and no Work section gets
     the row all the same, where Work sits among the sections a day runs through. */
  if (work !== null) {
    const item: FlatItem = { key: 'work', href: work, label: WORK_WORD, icon: 'work', near: [work] };
    const held = rows.find((r) => plainOf(r.section) === 'work');
    if (held) Object.assign(held, { item: { ...item, label: held.section }, screen: true });
    else rows.unshift({ section: WORK_WORD, lead: undefined, entries: [], item, screen: true });
  }
  const rank = (section: string, list: readonly string[]) => list.indexOf(plainOf(section));
  const first = rows.filter((r) => rank(r.section, FIRST) >= 0).sort((a, b) => rank(a.section, FIRST) - rank(b.section, FIRST));
  const others = rows.filter((r) => rank(r.section, FIRST) < 0 && rank(r.section, AFTER) < 0 && rank(r.section, UNDER) < 0);
  const after = rows.filter((r) => rank(r.section, AFTER) >= 0).sort((a, b) => rank(a.section, AFTER) - rank(b.section, AFTER));
  const under = rows.filter((r) => rank(r.section, UNDER) >= 0);

  const today: FlatItem = { key: 'today', href: '/', label: words.today, icon: 'today', near: ['/'], exact: true };
  const activity: FlatItem = { key: 'activity', href: '/audit', label: words.activity, icon: 'activity', near: ['/audit'] };
  const decide: FlatItem[] = open > 0 ? [{ key: 'decide', href: '/decide', label: words.decide, icon: 'decide', count: open, near: ['/decide'] }] : [];

  const body = [...first, ...others];
  let room = FLAT_MOST - 2 - decide.length;
  const bodyIn = body.slice(0, Math.max(0, room));
  room -= bodyIn.length;
  const afterIn = after.slice(0, Math.max(0, room));
  const shown = new Set([...bodyIn, ...afterIn]);

  const main = [today, ...bodyIn.map((r) => r.item), activity, ...decide, ...afterIn.map((r) => r.item)];
  const more = [...body, ...after, ...under].filter((r) => !shown.has(r)).map((r) => r.item);
  /* THE OTHER PAGES A SECTION HOLDS, a Board beside Work, and never a row's own page (`row`), which its list's page opens.
     A section whose row opens the Work screen keeps its lead page here too, called "Work page" so it is not a second
     "Work" under More. */
  const past = (r: Row): T[] => r.entries.flatMap((e) => (e !== r.lead ? [e] : r.screen ? [{ ...e, title: `${e.title} page` }] : []));
  const pages = rows.flatMap((r) => past(r).filter((e) => !e.row));
  /* IN THE ORDER THE SECTIONS ARE DRAWN, so More reads down the way the list above it does. */
  const groups = [...body, ...after, ...under].flatMap((r): [string, T[]][] => {
    const held = past(r);
    return held.length > 0 ? [[r.section, held]] : [];
  });
  return { main, more, pages, groups };
}

/** What the Work screen's row says on a record whose sections do not name Work. */
const WORK_WORD = 'Work';

/**
 * The old Overview address, which draws Today now and is in no nav. KEPT ONLY FOR `settings/[area]/areas/Pages.svelte`,
 * which still imports it: a missing export fails that module as it loads. Delete it in the same change that drops it there.
 */
export const OVERVIEW = '/?overview';

/**
 * THE WORK SCREEN, at a word in the query: every top-level folder is a word no record may be named (`APP_WORDS` in
 * `lib/at.ts`, and the Directory's own list), and a record somebody already called "work" must still open.
 */
export const WORK = '/?work';

/**
 * THE PHONE'S MENU, at a word in the query as Work is: the sidebar drawn as a page, every place, the projects and every
 * list, for the tab bar's fifth tab. From 900px up the sidebar is on screen and the address draws Today.
 */
export const MENU = '/?menu';

/**
 * Where the reader is, for the rows to compare against: the address inside the record, with the Work screen and the
 * phone's Menu as places of their own. `/?overview` and `/?classic` draw Today, so they count as Today.
 */
export const placeOf = (path: string, search: URLSearchParams): string => (path === '/' && search.has('work') ? WORK : path === '/' && search.has('menu') ? MENU : path);

/** Whether `path`, read inside the record, is on this row: one of its addresses or one under it, or exactly `/` for Today. */
export function isHere(item: Pick<FlatItem, 'near' | 'exact'>, path: string): boolean {
  return item.near.some((h) => path === h || (!item.exact && path.startsWith(`${h}/`)));
}

/**
 * THE FIVE PLACES OF 19 OCTOBER, after Today and Needs you, by the section's plain name: Projects, Money, Agents (his
 * call 2, 20 October). Work lives in Projects and on Today, and everything else is under More. A shop's Orders come
 * first, as on the rail (`lib/nav/rail.ts`): they are what a shop opens the app for.
 */
const FIVE = PLACES.filter((name) => name !== 'work' && name !== 'people');

/** A place's plain name, its section's or its own key's. */
const placeName = (i: FlatItem): string => plainOf(i.key.replace(/^section:/u, ''));

/**
 * The five places, on the phone's tab bar and in the top bar: Today, Needs you, Projects, Money and Agents. A record
 * without one of the three fills its slot with its next place in the rail's order, so the bar is never short while
 * the record has places to show. The rest are behind More with everything else.
 */
export function tabsOf(main: readonly FlatItem[], most = 5, chosen: readonly string[] = []): FlatItem[] {
  /* HIS FIVE WIN: Today first, then the pages he put on the bar in his order. A pick that is gone from the rail is
     skipped, and none left at all is the default below. */
  const picked = chosen.flatMap((href) => main.filter((i) => i.href === href && i !== main[0]));
  if (picked.length > 0 && main[0]) return [main[0], ...picked].slice(0, most);
  const decide = main.find((i) => i.key === 'decide');
  const rest = main.filter((i) => i !== decide && i.key !== 'activity');
  const [lead, ...tail] = rest;
  if (lead === undefined) return [];
  const named = FIVE.flatMap((name) => tail.filter((i) => placeName(i) === name));
  const others = tail.filter((i) => !named.includes(i));
  return [lead, ...(decide ? [decide] : []), ...named, ...others].slice(0, most);
}
