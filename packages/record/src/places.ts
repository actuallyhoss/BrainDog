/**
 * The rail's places as data: the ordered places a person's rail draws, each with the page it opens, its
 * glyph, its name and who put it there, so the web shell draws them and holds no order of its own.
 *
 * THE AIM: "The fixed part is small: the frame.", and "how dynamic is everything?". The web ranked
 * the rail by a list of section names it wrote itself (`apps/web/src/lib/nav/rail.ts` `PLACES`), so a stranger's add-on
 * whose section is not one of those seven words sat after every one of them, whatever it asked. Here nothing is
 * spelled: the order is read off what the declarations say.
 *
 * THE ORDER, ONE STEP AT A TIME:
 *   1. Today and Decide, the frame's. They are no add-on's and no declaration moves them, so they lead every rail.
 *   2. The person's pinned places, in the order they pinned them. What a person pins always wins.
 *   3. Each section an add-on declares (`nav: { section, order }`), one place a section, opening on its first page by
 *      `order`. A section whose pages declare where it sits on the rail (`nav.place`, the lowest of its pages') comes by
 *      that number; a section that says nothing follows them, in the order its add-ons were installed.
 *   4. Any other section a page asks a place for, one a person or the engine wrote, in the order the pages come.
 * `most` places at most, Today and Decide among them; the rest are in `more`, in the same order. Activity stays the
 * frame's and is in neither.
 *
 * A PAGE ABOUT ONE THING IS NO PLACE. A project's own page is a thing under its section (`about` set), and a section's
 * second page (Board beside Work) is a view of its place, so no page is in the rail twice. A page whose every list is a
 * starter set nobody touched waits (`lists: null`, as `Boot.pages` says it), and is no place until one holds something.
 *
 * PURE: no record read, so `places.test.ts` holds each rule and `boot` hands it what it already read.
 */

/** Who put a place on the rail: an add-on's declaration, the person (a pin, a page they wrote), or the engine's frame. */
export type PlaceBy = 'addon' | 'person' | 'engine';

/** One place on the rail. `page` is the page it opens, by its id; `section` the declared section it stands for. */
export type Place = { page: string; icon: string | null; name: string; by: PlaceBy; section: string | null };

/** A page as `boot` lists it: the pages the caller may open, with its place in a section when it declares one. */
export type PlacePage = {
  slug: string;
  title: string;
  icon: string | null;
  /** `place` is where the section sits on the rail, a whole number, lowest first. A page may leave it off. */
  nav: { section: string; order: number; place?: number; tabs?: true } | null;
  /** Set on a page made about one thing (a project's own page): it is a thing under its section, never a place. */
  about?: unknown;
  /** `null` while every list the page reads is a starter set nobody touched: the place waits. */
  lists?: readonly string[] | null;
};

/** An installed add-on and the pages it declares, in the order the add-ons were installed. */
export type AddonNav = { addon: string; pages: readonly string[] };

/** The rail: the places drawn, `most` at most, and the rest, drawn under More. */
export type Places = { places: Place[]; more: Place[] };

/** How many places the rail draws, Today and Decide included. */
export const PLACES_MOST = 7;

/** The frame's two places, the pages every record holds. The web says their names in its own words. */
export const FRAME_PLACES: readonly Place[] = [
  { page: 'today', icon: 'today', name: 'Today', by: 'engine', section: null },
  { page: 'decide', icon: 'decide', name: 'Decide', by: 'engine', section: null },
];

type Section = { name: string; lead: PlacePage; place: number; installed: number; first: number; addon: boolean };

/**
 * The ordered places of the rail. `pages` are the pages the caller may open, `navs` the installed add-ons in the order
 * they were installed, `pinned` the pages the person pinned, by id, in their order.
 */
export function placesOf({
  pages,
  navs,
  pinned = [],
  most = PLACES_MOST,
}: {
  pages: readonly PlacePage[];
  navs: readonly AddonNav[];
  pinned?: readonly string[];
  most?: number;
}): Places {
  const frame = new Set(FRAME_PLACES.map((p) => p.page));
  /* A PAGE THAT NAMES ITS PLACE NEVER WAITS (audit 31 Oct h, AH4), as the web's rail has it: a starter's own page is a
     place from the first minute, even over lists that hold only what the starter planted. */
  const open = pages.filter((p) => (p.lists !== null || typeof p.nav?.place === 'number') && (p.about === undefined || p.about === null) && !frame.has(p.slug));
  /* THE ADD-ON THAT PUT EACH PAGE THERE, the first to install it. A page no add-on declares is a person's or the
     engine's, and its section follows every add-on's. */
  const installedAt = new Map<string, number>();
  navs.forEach((n, i) => n.pages.forEach((slug) => installedAt.has(slug) || installedAt.set(slug, i)));

  const out: Place[] = [...FRAME_PLACES];
  const placed = new Set<string>();
  for (const slug of pinned) {
    const page = open.find((p) => p.slug === slug);
    if (!page || placed.has(slug)) continue;
    placed.add(slug);
    out.push({ page: slug, icon: page.icon, name: page.title, by: 'person', section: page.nav?.section ?? null });
  }

  const sections = new Map<string, Section>();
  open.forEach((page, i) => {
    if (!page.nav) return;
    const at = installedAt.get(page.slug);
    const place = typeof page.nav.place === 'number' && Number.isFinite(page.nav.place) ? page.nav.place : Infinity;
    const held = sections.get(page.nav.section);
    if (!held) {
      const installed = at ?? Infinity;
      sections.set(page.nav.section, { name: page.nav.section, lead: page, place, installed, first: i, addon: at !== undefined });
      return;
    }
    held.place = Math.min(held.place, place);
    held.installed = Math.min(held.installed, at ?? Infinity);
    held.addon ||= at !== undefined;
    /* THE SECTION OPENS ON ITS FIRST PAGE BY `order`, the earlier page on a tie, as `arrange` in the web sorts it. */
    if (page.nav.order < (held.lead.nav?.order ?? Infinity)) held.lead = page;
  });
  const ranked = [...sections.values()].sort((a, b) => cmp(a.place, b.place) || cmp(a.installed, b.installed) || a.first - b.first);
  for (const s of ranked) {
    if (placed.has(s.lead.slug)) continue;
    placed.add(s.lead.slug);
    out.push({ page: s.lead.slug, icon: s.lead.icon, name: s.name, by: s.addon ? 'addon' : 'person', section: s.name });
  }
  const room = Math.max(FRAME_PLACES.length, Math.floor(most));
  return { places: out.slice(0, room), more: out.slice(room) };
}

/** Lowest first, with two unranked equal, so a stable sort keeps their own order. */
const cmp = (a: number, b: number): number => (a === b ? 0 : a < b ? -1 : 1);
