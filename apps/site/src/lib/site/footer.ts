/**
 * The footer's three groups of plain links (site 2a section 8, 20 October): Product, Who it's for, and Help.
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
import { cases } from '../copy/cases.ts';
import { DOCS, SECURITY, SOURCE, SUPPORT } from '../links.ts';
import { reachable } from '../nav.ts';

export type FootLink = { href: string; label: string; rel?: 'external' };
export type FootGroup = { title: string; links: FootLink[] };

type Flags = { legal: boolean; repo: boolean; public: boolean };

/** Where a developer is sent from the footer: connecting an AI tool, the docs' first page for them. */
export const DEVELOPERS = `${DOCS}/agents/connect`;

/** The footer's groups under these flags, each link in the order the design gives it. */
export const footerGroups = (launch: Flags = LAUNCH): FootGroup[] => {
  const live = new Map(reachable(launch).map((p) => [p.path, p.label]));
  const page = (path: string, label = live.get(path)): FootLink[] => (live.has(path) && label ? [{ href: path, label }] : []);
  const f = shell.footer;
  const forWho = cases.drawn.moreFor;
  return [
    {
      title: f.groups.product,
      links: [...page('/slash'), ...page('/agents'), ...page('/pricing'), ...page(SECURITY)],
    },
    {
      title: f.groups.who,
      links: [
        ...page(forWho.founder.href, f.small),
        ...page(forWho.team.href, f.teams),
        /* No "Personal use" here since the 3 November story: the site speaks to founders and teams, and personal money
           stays in the FAQ and the docs. */
        ...(live.has(DOCS) ? [{ href: DEVELOPERS, label: f.developers }] : []),
      ],
    },
    {
      title: f.groups.help,
      links: [
        ...page(DOCS),
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
