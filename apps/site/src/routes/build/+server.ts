/**
 * `/build`: the address the guide to building a plugin was promised at, sent on to the pack docs.
 *
 * THE GUIDE IS THE DOCS, NOT A SECOND COPY OF THEM. The pack guide's pages
 * are in `src/docs/06-packs/`, so this address only has to arrive there. It is not a line in `nav.ts`, whose list is
 * final, and it asks not to be indexed, so a search engine keeps the docs page and never this one.
 *
 * AN ENDPOINT AND NOT A PAGE, for two tests that pull opposite ways. `src/lib/claims.test.ts` holds every top-level
 * `+page.svelte` to a line in `nav.ts`, which this address must not have; and SvelteKit prerenders a `redirect()` as
 * a bare file with a script and a meta refresh and nothing else, which `test/content.test.ts` refuses because every
 * page it finds in `build/` links the repository and `/legal`. So this answers the small page a prerendered redirect
 * would have been, written out: a meta refresh that works with scripting off, the link a reader follows if the
 * refresh is blocked, and the two links every page on this site carries.
 */
import { SOURCE } from '$lib/links.ts';

export const prerender = true;

/* The first page of the guide, `src/docs/06-packs/02-first-pack.md`, whose address `lib/docs/pages.ts` makes from its file name. */
const GUIDE = '/docs/packs/first-pack';

const words = {
  title: 'Building a plugin',
  /* Rests on `src/docs/06-packs/`, the pages this address sends a reader to. */
  lede: 'The guide to building a plugin is in the docs, from your first plugin to publishing it on the Kennel.',
  link: 'Build your first plugin',
  source: 'BrainDog on GitHub',
  legal: 'Legal',
};

export const GET = (): Response => {
  const source = SOURCE === null ? '' : ` <a href="${SOURCE}">${words.source}</a> ·`;
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${words.title}</title>`,
    '<meta name="robots" content="noindex">',
    `<meta http-equiv="refresh" content="0;url=${GUIDE}">`,
    `<link rel="canonical" href="https://brain.dog${GUIDE}">`,
    '</head>',
    '<body>',
    `<h1>${words.title}</h1>`,
    `<p>${words.lede}</p>`,
    `<p><a href="${GUIDE}">${words.link}</a></p>`,
    `<p>${source} <a href="/legal">${words.legal}</a></p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
};
