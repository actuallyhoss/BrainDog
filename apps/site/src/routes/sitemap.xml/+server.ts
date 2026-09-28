/**
 * `/sitemap.xml`, written at build time from `nav.ts`, so a page is in it the day its route exists
 * and never before. `robots.txt` names this address.
 *
 * NO APP. The record app is on this origin at `/app/`, with `/api/`, `/auth/` and `/account/` beside
 * it, all behind authentication, and `robots.txt` disallows the four: a sitemap naming one would ask a
 * crawler for an address the same site forbids it. `/legal/*` is out too, unlinked until its texts
 * arrive, and so is the 404.
 */
import { PAGES } from '$lib/nav.ts';

export const prerender = true;

const ORIGIN = 'https://brain.dog';

export const GET = (): Response => {
  const urls = PAGES.map((p) => `  <url><loc>${ORIGIN}${p.path}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
