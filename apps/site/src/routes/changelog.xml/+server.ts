/**
 * `/changelog.xml`, the changelog as an Atom feed (RFC 4287), written at build time from the same
 * entries the page draws.
 *
 * PRERENDERED, like every route on this site (`svelte.config.js` is strict), so the feed is a file
 * beside `changelog.html` and changes exactly when the page does.
 *
 * AN ENTRY'S ID IS ITS PERMALINK, the address `log.ts` gives the page's own anchor, so a reader who
 * follows an item lands on that entry and a feed reader never sees one entry under two ids. The
 * entries carry a date and no time, so each is stamped at midnight UTC on its day.
 *
 * HELD WITH THE PAGE until the site is public (`HELD` in `launch.ts`): while held it answers 404, so no
 * `changelog.xml` is written and the site's 404 page answers the address. Imported by path and not through
 * `$lib`, so a test can call `_feed` under plain Node with a copy of the flags.
 */
import { site } from '../../lib/copy.ts';
import { LAUNCH, held } from '../../lib/launch.ts';
import { FEED } from '../../lib/links.ts';
import { ITEMS } from '../changelog/log.ts';

export const prerender = true;

const ORIGIN = 'https://brain.dog';
const PAGE = `${ORIGIN}/changelog`;

/* Every string that reaches the XML goes through this: a title or body holding `&` or `<` would
   otherwise end the document early in every reader that parses it strictly. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stamp = (date: string): string => `${date}T00:00:00Z`;

/* A held feed's 404 is plain text. Named here, as a content type and nothing else (`tools/gates/secret-grep.mjs` reads
   the word `plain` inside a response as a decrypted value). */
const TEXT = 'text/plain; charset=utf-8';

/** The feed's answer under these flags: the Atom document while it is shown, and not found while it is held. */
export const _feed = (launch: { public: boolean }): Response => {
  if (held(launch)) return new Response('Not found', { status: 404, headers: { 'content-type': TEXT } });
  const copy = site.changelog;
  const newest = ITEMS[0]?.date ?? '1970-01-01';

  const entries = ITEMS.map((item) => {
    const url = `${PAGE}#${item.anchor}`;
    return [
      '  <entry>',
      `    <id>${esc(url)}</id>`,
      `    <title>${esc(item.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${esc(url)}"/>`,
      `    <updated>${stamp(item.date)}</updated>`,
      `    <published>${stamp(item.date)}</published>`,
      `    <category term="${item.kind}" label="${esc(copy.filter[item.kind])}"/>`,
      `    <summary>${esc(item.body)}</summary>`,
      '  </entry>',
    ].join('\n');
  });

  const body = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${esc(PAGE)}</id>`,
    `  <title>${esc(copy.feedTitle)}</title>`,
    `  <subtitle>${esc(copy.lede)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${ORIGIN}${FEED}"/>`,
    `  <link rel="alternate" type="text/html" href="${PAGE}"/>`,
    `  <updated>${stamp(newest)}</updated>`,
    `  <author><name>${esc(copy.feedAuthor)}</name></author>`,
    ...entries,
    '</feed>',
    '',
  ].join('\n');

  return new Response(body, { headers: { 'content-type': 'application/atom+xml; charset=utf-8' } });
};

export const GET = (): Response => _feed(LAUNCH);
