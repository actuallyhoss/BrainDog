/**
 * The footer's three groups, as the site design draws them (DIRECTION §47): Product, Learn and Company.
 *
 * A PLAIN FUNCTION OF THE FLAGS, so `test/shell.test.ts` asks it under a copy of `LAUNCH` with one turned on and never
 * edits `launch.ts`. Terms and Privacy are drawn only once his texts are live (`LAUNCH.legal`), and GitHub only once
 * the repository is public (`LAUNCH.repo`): until then no page links it. `/legal` is drawn on every day, because every
 * page links it.
 *
 * A PAGE OF THIS SITE IS DRAWN ONLY ONCE IT EXISTS and is not held (`reachable` in `nav.ts`), so a link here can never
 * stop the strict prerender.
 */
import { shell } from '../copy/shell.ts';
import { LAUNCH } from '../launch.ts';
import { DOCS, SECURITY, SOURCE, SUPPORT } from '../links.ts';
import { reachable } from '../nav.ts';

export type FootLink = { href: string; label: string; rel?: 'external' };
export type FootGroup = { title: string; links: FootLink[] };

type Flags = { legal: boolean; repo: boolean; public: boolean };

/**
 * The first docs page, "Get started": the lowest `NN-section/NN-page.md` under `src/docs/`, which is the order the docs
 * are read in (`byOrder` in `docs/pages.ts`). Only the names of the files are read, never their text: the glob is lazy,
 * so a page's text is a chunk nothing loads, and `docs/index.ts` (which holds every page's text) stays out of the
 * shell's script. `?raw` because a `.md` file is not a module. Under plain Node, where there is no glob, it is the
 * docs' own page.
 */
const FILE = /^\/src\/docs\/\d{2}-([a-z0-9-]+)\/\d{2}-([a-z0-9-]+)\.md$/;
const firstDoc = (): string => {
  const keys = import.meta.env ? Object.keys(import.meta.glob('/src/docs/**/*.md', { query: '?raw', import: 'default' })).sort() : [];
  const m = keys.map((k) => FILE.exec(k)).find((hit) => hit !== null);
  return m ? `/docs/${m[1]}/${m[2]}` : DOCS;
};

export const START = firstDoc();

/** The footer's groups under these flags, each link in the order the design gives it. */
export const footerGroups = (launch: Flags = LAUNCH, start: string = START): FootGroup[] => {
  const live = new Map(reachable(launch).map((p) => [p.path, p.label]));
  const page = (path: string, label = live.get(path)): FootLink[] => (live.has(path) && label ? [{ href: path, label }] : []);
  const f = shell.footer;
  return [
    {
      title: f.groups.product,
      links: [...page('/agents'), ...page('/slash'), ...page('/pricing'), ...page(SECURITY)],
    },
    {
      title: f.groups.learn,
      links: [
        ...(live.has(DOCS) ? [{ href: start, label: f.start }] : []),
        ...page('/agents', f.connect),
        ...page(DOCS),
      ],
    },
    {
      title: f.groups.company,
      links: [
        ...page(SUPPORT),
        /* Always, whatever the tree says: every page links `/legal` (`test/content.test.ts`). */
        { href: '/legal', label: shell.nav.legal },
        ...(launch.legal
          ? [
              { href: '/legal/terms', label: f.terms },
              { href: '/legal/privacy', label: f.privacy },
            ]
          : []),
        ...(launch.repo && SOURCE ? [{ href: SOURCE, label: shell.nav.source, rel: 'external' as const }] : []),
      ],
    },
  ].filter((g) => g.links.length > 0);
};
