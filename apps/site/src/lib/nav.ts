/**
 * The site's pages, in the order the header and the footer draw them, and which of them exist.
 *
 * ONE LIST FOR FOUR READERS: the header, the footer (`site/footer.ts`, which picks its groups from it), the 404's
 * list and `/sitemap.xml`, so a page is never named by one and missing from another. A page is shown only once its
 * route folder holds a `+page.svelte`, so adding a page never edits this file, and a link to
 * a page that does not exist yet can never be drawn, which would also stop the strict prerender.
 */
import { shell } from './copy/shell.ts';
import { cases } from './copy/cases.ts';
import { forPages } from './copy/for.ts';
import { PLUGINS, DOCS, SECURITY, SUPPORT } from './links.ts';
import { HELD, LAUNCH, NEVER_SHOWN, held } from './launch.ts';

export type Place = {
  path: string;
  label: string;
  /** Drawn in the header's row of links at 1440 and in the phone's menu. */
  header: boolean;
};

const place = (path: string, key: keyof typeof shell.nav, header: boolean): Place => ({
  path,
  label: shell.nav[key],
  header,
});

/* A PAGE WRITTEN FOR ONE KIND OF PERSON (`routes/for/`), at the address the drawn app's "More for" link
   opens, in the 404's list and the sitemap and never in the header's row. */
const person = (id: keyof typeof forPages.person.who): Place => ({
  path: cases.drawn.moreFor[id].href,
  label: forPages.person.who[id].nav,
  header: false,
});

/**
 * Every page a reader may be sent to, home aside. The legal texts under `/legal/` are not places: the footer links them
 * and the sitemap names them once `LAUNCH.legal` is on (`LEGAL_TEXTS` in `links.ts`).
 *
 * THE HEADER'S ROW (20 October; Slash left it on 3 November, its page and footer link kept): Agents, Pricing, Security,
 * Docs, then "Sign in" and "Get early
 * access", which `+layout.svelte` draws because they are not pages of this site. Packs left the row with that design;
 * it and the changelog are held until the site is public (`HELD` in `launch.ts`), and the changelog comes back to
 * the row's end the day `LAUNCH.public` is on (`reachable` below).
 */
export const PLACES: readonly Place[] = [
  place('/slash', 'slash', false),
  place('/agents', 'agents', true),
  place(PLUGINS, 'packs', false),
  place('/pricing', 'pricing', true),
  place(SECURITY, 'security', false),
  person('founder'),
  person('team'),
  person('personal'),
  person('student'),
  person('project'),
  place(DOCS, 'docs', true),
  place('/changelog', 'changelog', false),
  place(SUPPORT, 'support', false),
  place('/download', 'download', false),
  place('/legal', 'legal', false),
];

/**
 * The route folders this build has, read from the tree by Vite at build time.
 *
 * `null` UNDER PLAIN NODE, where Vite has not replaced `import.meta.env` and `import.meta.glob` does
 * not exist: a test imports this file to read `PLACES`, and there every place counts as live because the
 * test holds the list to the folders itself. The test is on `env` and not on `typeof glob`, because
 * Vite rewrites only the call, and in the browser `typeof import.meta.glob` would say none exists.
 * The glob is lazy, so it adds a loader per page and no page's code.
 */
const found: ReadonlySet<string> | null =
  import.meta.env
    ? new Set(
        Object.keys(import.meta.glob('../routes/**/+page.svelte')).map(
          (file) => file.slice('../routes'.length, -'/+page.svelte'.length) || '/',
        ),
      )
    : null;

/** Whether the site has a page at this path. */
export const exists = (path: string): boolean => found === null || found.has(path);

/**
 * The places a visitor may reach under these flags, in order: each that exists, less the ones `launch.ts` holds
 * until the site is public. Packs and the changelog are `PLACES` on every day, so flipping `LAUNCH.public` draws them
 * again and edits nothing here. Takes the flags so a test can pass a copy with one turned on.
 */
export const reachable = (launch: { public: boolean } = LAUNCH): readonly Place[] =>
  PLACES.filter((p) => exists(p.path) && !NEVER_SHOWN.includes(p.path) && !(held(launch) && (HELD as readonly string[]).includes(p.path)));

/** The places that exist today, in order. */
export const LIVE: readonly Place[] = reachable();

/** Home and every live place: what the 404 lists and the sitemap names. */
export const PAGES: readonly Place[] = [{ path: '/', label: shell.nav.home, header: false }, ...LIVE];
