/**
 * The site's pages, in the order the header and the footer draw them, and which of them exist.
 *
 * ONE LIST FOR FOUR READERS: the header, the footer, the 404's list and `/sitemap.xml`, so a page is
 * never named by one and missing from another. A page is shown only once its
 * route folder holds a `+page.svelte`, so adding a page never edits this file, and a link to
 * a page that does not exist yet can never be drawn, which would also stop the strict prerender.
 */
import { shell } from './copy/shell.ts';
import { cases } from './copy/cases.ts';
import { forPages } from './copy/for.ts';
import { DOCS, PACKS, SECURITY, SUPPORT } from './links.ts';

export type Group = 'product' | 'build' | 'trust';

export type Place = {
  path: string;
  label: string;
  /** Drawn in the header's row of links at 1440 and in the phone's menu. */
  header: boolean;
  group: Group;
};

const place = (path: string, key: keyof typeof shell.nav, group: Group, header: boolean): Place => ({
  path,
  label: shell.nav[key],
  header,
  group,
});

/* A PAGE WRITTEN FOR ONE KIND OF PERSON (`routes/for/`), at the address the drawn app's "More for" link
   opens, in the footer's Product group and never in the header's row. */
const person = (id: keyof typeof forPages.person.who): Place => ({
  path: cases.drawn.moreFor[id].href,
  label: forPages.person.who[id].nav,
  header: false,
  group: 'product',
});

/**
 * Every page a reader may be sent to, home aside. `/legal/*` stays out: those pages are unlinked until their texts arrive.
 *
 * THE HEADER'S ROW IS FINAL: Slash, For agents, Packs, Pricing, Docs, Changelog, and then GitHub, which
 * `+layout.svelte` adds from `SOURCE` in `links.ts` because it is not a page of this site. Slash leads
 * because it has a page of its own since the redesign of 26 September.
 */
export const PLACES: readonly Place[] = [
  place('/slash', 'slash', 'product', true),
  place('/agents', 'agents', 'build', true),
  place(PACKS, 'packs', 'product', true),
  place('/pricing', 'pricing', 'product', true),
  person('personal'),
  person('student'),
  person('founder'),
  person('team'),
  person('project'),
  place(DOCS, 'docs', 'build', true),
  place('/changelog', 'changelog', 'product', true),
  place(SUPPORT, 'support', 'trust', false),
  place(SECURITY, 'security', 'trust', false),
  place('/legal', 'legal', 'trust', false),
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

/** The places that exist today, in order. */
export const LIVE: readonly Place[] = PLACES.filter((p) => exists(p.path));

/** Home and every live place: what the 404 lists and the sitemap names. */
export const PAGES: readonly Place[] = [{ path: '/', label: shell.nav.home, header: false, group: 'product' }, ...LIVE];
