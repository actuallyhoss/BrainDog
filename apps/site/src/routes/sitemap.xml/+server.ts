/**
 * `/sitemap.xml`, written at build time from `nav.ts`, so a page is in it the day its route exists
 * and never before. `robots.txt` names this address.
 *
 * NO APP. The record app is on its own name, `app.brain.dog`, and the old `/app/`, `/api/`, `/auth/` and `/account/`
 * here only hand on to it behind authentication; `robots.txt` disallows the four, and a sitemap naming one would ask a
 * crawler for an address the same site forbids it. The 404 is out too. The three legal texts are in once
 * `LAUNCH.legal` says they are in force, and not before: until then each page is one sentence with `noindex`.
 *
 * A PLUGIN'S PAGE AND AN AUTHOR'S are in once the store is shown (`held` in `launch.ts`), the same list their routes
 * prerender from, each with the day the catalogue last changed.
 *
 * LASTMOD IS THE DAY THE WORDS LAST CHANGED, read from git while the site prerenders: a docs page's own file, and for
 * the site's pages the newest commit under `src/` other than the docs. Without git (a copy of the tree with no
 * history), it is the day of the build.
 */
import { execFileSync } from 'node:child_process';

import { PAGES } from '$lib/nav.ts';
import { DOCS } from '$lib/docs/index.ts';
import { LAUNCH, held } from '$lib/launch.ts';
import { LEGAL_TEXTS, PLUGINS } from '$lib/links.ts';
import { authorsOf, isPublic, slugOf } from '$lib/packs/catalogue.ts';
import { readEntries } from '$lib/packs/read.server.ts';

export const prerender = true;

const ORIGIN = 'https://brain.dog';
const TODAY = new Date().toISOString().slice(0, 10);

/** The day of the newest commit touching these paths, relative to `apps/site`, or the build's day. */
function changed(...paths: string[]): string {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : TODAY;
  } catch {
    return TODAY;
  }
}

/** Every plugin's page and every author's, while the store is shown; none while it is held. */
async function plugins(): Promise<string[]> {
  if (held()) return [];
  const listed = (await readEntries()).filter(isPublic);
  return [...listed.map((e) => `${PLUGINS}/${slugOf(e)}`), ...authorsOf(listed).map((a) => `${PLUGINS}/by/${a.slug}`)];
}

export const GET = async (): Promise<Response> => {
  const site = changed('src', ':(exclude)src/docs');
  const catalogue = changed('../web/static/catalogue');
  const entries = [
    ...PAGES.map((p) => ({ path: p.path, at: site })),
    /* A TEXT CHANGES IN `legal/`, beside `src`, so its day is that folder's. */
    ...(LAUNCH.legal ? LEGAL_TEXTS.map((path) => ({ path, at: changed(`legal/${path.slice('/legal/'.length)}.md`) })) : []),
    ...DOCS.map((d) => ({ path: d.path, at: changed(`src/docs/${d.file}`) })),
    ...(await plugins()).map((path) => ({ path, at: catalogue })),
  ];
  const urls = entries.map((e) => `  <url><loc>${ORIGIN}${e.path}</loc><lastmod>${e.at}</lastmod></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
