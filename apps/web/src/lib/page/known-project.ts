/**
 * THE PROJECTS THIS TAB HAS DRAWN, by the address each opens on, so a project's page opens in its own shape before the
 * record answers (F4 and fluid F2). The sidebar and the Projects cards already hold each one's
 * name, mark, colour and lane; the page opened from them drew a blank board, then a list skeleton that looked nothing
 * like a project, then a blank again, and only then the project.
 *
 * KEPT PER RECORD, by the address the record answers at, so another record's project of the same name is never drawn.
 * Nothing here is kept past the tab, and nothing is read: whoever draws a project says so (`knowProjects`).
 *
 * PURE, so `known-project.test.ts` holds it without a record.
 */

/** A project as its page's shape is drawn before the page answers. */
export type KnownProject = { name: string; mark: string; hue: number | null; lane: string; list?: string; picture?: string | null | undefined };

/** A project as a list of them names it: the address its page opens on, and its row in its list. */
export type ProjectSeen = Omit<KnownProject, 'list'> & { href: string; key: string };

const byHref = new Map<string, KnownProject>();
const byKey = new Map<string, KnownProject>();
const places = new Map<string, string>();

/** Keep what a list of projects drew, and where the projects' own place is when the drawer knows it. */
export function knowProjects(base: string, seen: readonly ProjectSeen[], place?: string | null): void {
  for (const p of seen) {
    if (p.name.trim() === '') continue;
    /* ITS LIST TOO, by its row (`things#3`), so the page while it opens says the lane in that list's words. */
    const list = p.key.includes('#') ? p.key.slice(0, p.key.indexOf('#')) : '';
    const one: KnownProject = { name: p.name, mark: p.mark, hue: p.hue, lane: p.lane, ...(list === '' ? {} : { list }), ...(p.picture ? { picture: p.picture } : {}) };
    byHref.set(`${base} ${p.href}`, one);
    byKey.set(`${base} ${p.key}`, one);
  }
  if (typeof place === 'string' && place !== '') places.set(base, place);
}

/** The project whose page opens at `href` (`/p/tidewater`), as this tab last drew it; `null` for one it has not. */
export const knownProject = (base: string, href: string): KnownProject | null => byHref.get(`${base} ${href}`) ?? null;

/** The same, by its row (`things#3`), for the shape a page about the row draws. */
export const knownRow = (base: string, key: string): KnownProject | null => byKey.get(`${base} ${key}`) ?? null;

/** The projects' own place (`/p/projects`), the way back a project's page draws, where a drawer said it. */
export const projectsPlace = (base: string): string | null => places.get(base) ?? null;

/** Forget every record's projects: a sign-out, and the tests. */
export function forgetProjects(): void {
  byHref.clear();
  byKey.clear();
  places.clear();
}
