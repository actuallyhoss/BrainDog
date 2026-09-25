/**
 * The assistant is called Slash on every page this site serves, and Spark is named in one place only.
 *
 *   node --test --experimental-strip-types "apps/site/test/slash.test.ts"
 *
 * DIRECTION 31 RENAMED IT ON 25 SEPTEMBER, AND THE SITE IS WHERE A STRANGER MEETS THE NAME. Measured
 * on a fresh `vite build` of the tree as it stood that morning: `changelog.html` said `Spark` four
 * times, in two entry titles and one body, and no page said `Slash` at all. The changelog is the
 * page a visitor reads to decide whether the product is alive, and it was naming a thing that no
 * longer exists.
 *
 * ONE ENTRY IS ALLOWED TO SAY SPARK, BECAUSE IT HAS TO. A self-hoster whose environment still sets
 * `SPARK_ENDPOINT` gets no model after the rename and no error either, since the host reads only
 * `SLASH_*` now. The entry that tells him so cannot do it without both names, so this test finds
 * that entry in `entries.ts` by what it says, lifts its title and body out of every page, and then
 * asks for no `Spark` in what is left. Any other sentence naming Spark, on any page, is a failure.
 *
 * IT READS `build/` FOR THE REASON `content.test.ts` GIVES: the source is what somebody meant and
 * the build is what a stranger is handed. A missing build is a skip that says so.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { ENTRIES } from '../src/routes/changelog/entries.ts';

const BUILD = new URL('../build/', import.meta.url);
const PAGES = ['index.html', 'pricing.html', 'agents.html', 'changelog.html', 'legal.html', '404.html'] as const;

const absent = PAGES.filter((page) => !existsSync(new URL(page, BUILD)));
const when =
  absent.length === 0
    ? {}
    : { skip: `apps/site/build is missing ${absent.join(', ')}. Run "pnpm --filter @braindog/site build" first.` };

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** What a person reads on the page, tags and comments gone, entities decoded, runs of space as one. */
const words = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\s(?:alt|aria-label|content)="([^"]*)"/g, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, ' ');

/* `sparkline` IS A KIND OF CHART AND NOT THE NAME (DIRECTION 31, "Not renamed"), so it is not a hit. */
const SPARK = /spark(?!line)/gi;

const announcing = ENTRIES.filter((e) => /\bSlash\b/.test(e.title) && /SPARK_/.test(e.body) && /SLASH_/.test(e.body));

test('one changelog entry says Spark is now Slash, and names both settings a self-hoster has to rename', () => {
  assert.equal(
    announcing.length,
    1,
    `${announcing.length} entries in entries.ts announce the rename with both SPARK_ and SLASH_ in the body; one should`,
  );
});

test('no page this site serves names Spark outside the entry announcing the rename', when, () => {
  const allowed = announcing.flatMap((e) => [e.title, e.body]).map((s) => s.replace(/\s+/g, ' '));
  for (const page of PAGES) {
    let text = words(readFileSync(new URL(page, BUILD), 'utf8'));
    for (const said of allowed) text = text.split(said).join(' ');
    const hits = [...text.matchAll(SPARK)].map((m) => text.slice(Math.max(0, m.index - 50), m.index + 50).trim());
    assert.deepEqual(hits, [], `${page} still names Spark: ${hits.join(' | ')}`);
  }
});

test('the changelog calls the assistant Slash', when, () => {
  const text = words(readFileSync(new URL('changelog.html', BUILD), 'utf8'));
  /* `ok` AND NOT `match`, because a failed `match` prints the whole page as its `actual`. */
  assert.ok(/\bSlash\b/.test(text), 'changelog.html never says Slash');
});
