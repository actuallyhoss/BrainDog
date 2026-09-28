/**
 * The claims, the links and the vocabulary, measured on the bytes this site actually serves.
 *
 * THIS APP HAD NO TEST AND NO `test` SCRIPT, so the root `pnpm -r run test` walked past it in
 * silence. That is not a test that cannot fail; it is the absence of one, which is the same silence
 * one level further out. The three gates that do read this app all measure the MARKUP: the shell
 * placeholder count, contrast and targets, overflow at every width. Every defect this app has
 * actually shipped has been in the CONTENT: a primary button naming a verb the product cannot
 * perform, a register that has never existed, seven dead links across four URLs, a changelog that
 * said nothing had shipped for six days after something had, and literal backticks in four
 * sentences because nothing here renders Markdown.
 *
 * IT READS `build/` AND NOT `src/`, for the reason `bundle.mjs` gives about itself: the source is
 * what somebody meant and the build is what a stranger is handed. A conditional that stops
 * rendering, an `{#if}` guard somebody deletes and a `null` interpolated into a string template are
 * all invisible in the source and all obvious in the served HTML.
 *
 * A MISSING BUILD IS A SKIP THAT SAYS SO. The gate suite's own rule, and the reason for it is that
 * a check with nothing to read is the same silence as no check at all: it has to be louder than a
 * pass, not quieter.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const BUILD = new URL('../build/', import.meta.url);

/**
 * The documents a build must have written for these checks to mean anything: one per page the header and the
 * footer name, the home page and the 404.
 *
 * `404.html` IS ONE OF THEM. It was left out while it had a test of its own three tests down, but
 * that test reads three lines of its shell and nothing else, so the page a stranger is most likely
 * to meet after a mistyped link was the one page here nobody checked for an em dash, a stray
 * backtick, a dead href or a missing picture. It is prerendered from `src/routes/404` through the
 * same layout as the rest, so it carries the same nav, the same footer and the same risks.
 */
const REQUIRED = [
  'index.html',
  'slash.html',
  'agents.html',
  'packs.html',
  'pricing.html',
  'docs.html',
  'changelog.html',
  'support.html',
  'security.html',
  'legal.html',
  '404.html',
] as const;

const absent = REQUIRED.filter((page) => !existsSync(new URL(page, BUILD)));

const NO_BUILD =
  absent.length === 0
    ? null
    : `apps/site/build is missing ${absent.join(', ')}. Run "pnpm --filter @braindog/site build" first: ` +
      'these checks read the served bytes, and a check with nothing to read is a pass that means nothing.';

/**
 * EVERY PAGE THE BUILD WROTE, not a list of them typed here. The site grew pages for each kind of person, the
 * docs, the packs and the legal texts, and a list kept by hand is the list that leaves the newest page out, so
 * the checks below walk `build/` for every `.html` outside SvelteKit's own `_app/`.
 */
const PAGES: readonly string[] = NO_BUILD
  ? []
  : readdirSync(BUILD, { recursive: true, encoding: 'utf8' })
      .map((rel) => rel.replaceAll('\\', '/'))
      .filter((rel) => rel.endsWith('.html') && !rel.startsWith('_app/'))
      .sort();

/** `{ skip: reason }` or nothing, because `exactOptionalPropertyTypes` refuses `{ skip: undefined }`. */
const when = (reason: string | null): { skip: string } | Record<string, never> => (reason ? { skip: reason } : {});

const read = (page: string): string => readFileSync(new URL(page, BUILD), 'utf8');

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (text: string): string =>
  text
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED[name.toLowerCase()] ?? whole);

const uncommented = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, ' ');

/**
 * The document's own text. Comments go first: the shell's head comments ship in the bytes on
 * purpose, they carry backticks, and nobody reads them but the next person editing this repository.
 */
const text = (html: string): string =>
  decode(
    uncommented(html)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );

/**
 * The sentences that live in an attribute rather than in the text. Alt strings are what a screen
 * reader user is told the picture shows, and a `<meta>` description is the whole of what somebody
 * who has not arrived yet is shown, so both are read by a person and both are checked.
 */
const attributes = (html: string): string => {
  const bare = uncommented(html);
  const out: string[] = [];
  for (const m of bare.matchAll(/\s(?:alt|aria-label)="([^"]*)"/g)) out.push(m[1] ?? '');
  for (const m of bare.matchAll(/<meta\b[^>]*\scontent="([^"]*)"/gi)) out.push(m[1] ?? '');
  return decode(out.join('\n'));
};

/** Everything on the page a person reads, by either route into their eyes. */
const readable = (html: string): string => `${text(html)}\n${attributes(html)}`;

/** The same, without the code block: that is a specification, and an id in it is an id. */
const prose = (html: string): string => readable(html.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, ' '));

/** Every offending character, with enough either side to find the sentence it is in. */
const around = (haystack: string, needle: string): string[] => {
  const hits: string[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    hits.push(haystack.slice(Math.max(0, at - 60), at + 60).replace(/\s+/g, ' ').trim());
  }
  return hits;
};

/**
 * NO EM DASH ANYWHERE A PERSON READS. `copy.ts` states this as the fifth of its five voice rules and
 * `README.md` names `grep -c` as the check; nothing has ever run it. Fourteen sentences in the
 * deployment documents had one, which is how the rule got written in the first place.
 */
test('no em dash reaches the reader', when(NO_BUILD), () => {
  for (const page of PAGES) {
    const hits = around(readable(read(page)), '—');
    assert.equal(hits.length, 0, `${page} shows ${hits.length} em dash(es): ${hits.join(' | ')}`);
  }
});

/**
 * NOTHING ON THE SITE'S OWN PAGES RENDERS MARKDOWN. Every copy string reaches the page through a Svelte
 * expression, so a backtick in the source is a backtick on the page, and four sentences shipped with one.
 *
 * THE DOCS DO RENDER IT, and a page teaching the dialect shows its fences, backticks and all, as code. So code
 * is left out of what this reads: a `<pre>` block and an inline `<code>` are the one place a backtick is the
 * thing being shown, and the copy files never draw one.
 */
test('no backtick reaches the reader outside code', when(NO_BUILD), () => {
  for (const page of PAGES) {
    const words = readable(read(page).replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '));
    const hits = around(words, '`');
    assert.equal(hits.length, 0, `${page} shows ${hits.length} literal backtick(s): ${hits.join(' | ')}`);
  }
});

/**
 * EVERY LINK GOES SOMEWHERE. An audit of the live site counted seven rendered instances across four
 * URLs, every one a 404 to a stranger, including the only outbound action in the free plan and the
 * only one in the changelog's status block. `SOURCE`, `DOCS` and `BUILD` are `null` so that every
 * call site has to decide what to draw when there is no address; this is what checks that each one
 * still draws nothing rather than the word `null`.
 *
 * A PATH THE SITE HANDS TO THE APP GOES TO THE APP, NOT TO `build/`. Since push B2 "Open the app" is
 * `/app` on this site's own name, and this failed on it with "index.html has href="/app", and build/
 * holds none of app, app.html, app/index.html", which is true and beside the point: the site's
 * `run_worker_first` sends `/app` to its script and the script to the app. So a path on that list is
 * checked for the one thing the site owes it, `rel="external"`, without which the prerender crawler
 * follows it and the build stops at a 404. The list is read from `wrangler.jsonc` with the deploy
 * checker's own parser, by a runtime specifier because the script has no declaration.
 */
const checker = new URL('../../worker/scripts/provision-check.mjs', import.meta.url).href;
const { siteConfig, workerFirst } = (await import(checker)) as {
  siteConfig: () => { assets?: { run_worker_first?: string[] | boolean } };
  workerFirst: (entries: string[], path: string) => boolean;
};
const handed = siteConfig().assets?.run_worker_first;
const toApp = (path: string): boolean => Array.isArray(handed) && workerFirst(handed, path);

test('every href goes somewhere', when(NO_BUILD), () => {
  for (const page of PAGES) {
    const html = read(page);
    const ids = new Set([...uncommented(html).matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? ''));

    for (const m of uncommented(html).matchAll(/\shref="([^"]*)"/g)) {
      const href = m[1] ?? '';
      const where = `${page} has href="${href}"`;

      assert.equal(['', '#', 'null', 'undefined'].includes(href.trim()), false, `${where}, which is not an address`);
      assert.equal(/(^|\/)(null|undefined)(\/|$)/.test(href), false, `${where}, which has a null in the path`);

      // Somebody else's server answers for these, and this test does not reach the network.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;

      /* A FIGURE INSIDE THE DRAWN APP ANSWERS `#go:<page>`, which the window catches to open another page of
         the same example (`src/lib/app/page.ts`), so it is no anchor on this page. `examples.test.ts` holds
         each one to a page the example has. */
      if (href.startsWith('#go:')) continue;

      if (href.startsWith('#')) {
        assert.equal(ids.has(href.slice(1)), true, `${where}, and no element on that page carries the id`);
        continue;
      }

      const bare = (href.split('#')[0] ?? '').split('?')[0] ?? '';
      if (bare.startsWith('/') && toApp(bare)) {
        const text = uncommented(html);
        const tag = text.slice(text.lastIndexOf('<', m.index), text.indexOf('>', m.index) + 1);
        assert.match(tag, /\srel="[^"]*\bexternal\b/, `${where}, which is the app's, and the tag is not marked rel="external"`);
        continue;
      }
      const rel = bare.replace(/^\.\//, '').replace(/^\//, '');
      const tries = rel === '' ? ['index.html'] : [rel, `${rel}.html`, `${rel.replace(/\/$/, '')}/index.html`];
      const found = tries.some((candidate) => existsSync(new URL(candidate, BUILD)));
      assert.equal(found, true, `${where}, and build/ holds none of ${tries.join(', ')}`);
    }
  }
});

/**
 * THE LICENCE IS ON THE LEGAL PAGE AND NOT IN THE MARKETING. The owner's call, 2026-09-16: the pages
 * that sell say open source and point at the code, and the licence names live on /legal and in the
 * READMEs. Both halves are checked, so the disclaimer cannot quietly leave /legal either.
 */
test('the marketing pages name no licence, and /legal names both', when(NO_BUILD), () => {
  const LICENCE = /\bApache\b|\bMIT\b/;
  /* THE PAGES THAT SELL: the home page, Slash, pricing and the pages for each kind of person. The docs may name
     a licence where a reader looks one up, and a pack's page shows the licence its author chose. */
  const selling = PAGES.filter((page) => ['index.html', 'slash.html', 'pricing.html'].includes(page) || page.startsWith('for/'));
  assert.equal(selling.length >= 3, true, `only ${selling.join(', ')} of the selling pages are in the build`);
  for (const page of selling) {
    const hit = LICENCE.exec(readable(read(page)));
    assert.equal(hit, null, `${page} names a licence: ${hit ? around(readable(read(page)), hit[0]).join(' | ') : ''}`);
  }
  const legal = readable(read('legal.html'));
  assert.match(legal, /\bApache License 2\.0\b/, 'legal.html no longer names the Apache License 2.0');
  assert.match(legal, /\bMIT License\b/, 'legal.html no longer names the MIT License');
  assert.match(legal, /without warranty/, 'legal.html no longer says the software comes without warranty');
});

/**
 * THE GITHUB LINK IS IN THE NAV AND THE FOOTER of every page, and the footer reaches /legal.
 */
test('every page links GitHub and the legal page', when(NO_BUILD), () => {
  for (const page of PAGES) {
    const html = uncommented(read(page));
    assert.match(html, /href="https:\/\/github\.com\/actuallyhoss\/BrainDog"/, `${page} does not link the repository`);
    assert.match(html, /href="\/legal"/, `${page} does not link /legal`);
  }
});

/**
 * THE HOME PAGE DOES NOT USE THE WORD `register`.
 *
 * One sentence on the home page once taught a stranger the word by naming three of them, and this checked
 * each against the registers the seed declared. The sentence left on 2026-09-22 (`loop/research-site-now.md`
 * ranked a word of the product's plumbing on the first screen as the fault), and since 26 September the
 * product on the page is drawn from the example records in `src/lib/examples/`, which name no register and
 * are checked by `examples.test.ts`. So the half of the old check that walked the seed went, and what is
 * left is the half a reader meets: a word nobody on the page has defined.
 */
test('the home page does not use the word register', when(NO_BUILD), () => {
  const page = prose(read('index.html'));
  const used = /\bregisters?\b/i.exec(page);
  assert.equal(used, null, `index.html says "${used?.[0]}", which nothing on the page teaches: ${used ? around(page, used[0]).join(' | ') : ''}`);
});

/**
 * THE HOME PAGE NAMES NO ROW BY ITS ADDRESS.
 *
 * WHAT THIS USED TO CHECK, AND WHY IT TURNED ROUND. The ledger in the mechanism band named the record's own
 * rows the way the record writes them (`Moved tasks#12 from open to done`, `Created services#6`),
 * and this test held every `register#n` it served to a register the seed declares. It caught real
 * renames. What it could not catch was that the addresses were the fault: a stranger has no record,
 * `tasks#12` is a thing they cannot look up, and `loop/research-site-now.md` read the band as a
 * table of record ids, which is the "all records and text" of §19 in its purest form. The ledger
 * gave way to a drawn decision whose history names what changed in words, so the anchor this test
 * needed is gone on purpose, and the rule is the opposite one: no address at all.
 *
 * IT READS THE SERVED BYTES AND ALSO `site.decide`, because the scene's last row arrives after
 * load and a claim a reader is shown three seconds late is the same claim. An `#uc-personal` in an
 * href is not read, because `prose` reads text and the attributes a person hears, not links.
 */
test('the home page names no row by its address', when(NO_BUILD), async () => {
  const rowRef = /\b[a-z_]+#\d+\b/g;
  const served = [...prose(read('index.html')).matchAll(rowRef)].map((m) => m[0]);
  assert.deepEqual(served, [], `index.html shows a stranger the record's own row addresses: ${served.join(', ')}`);

  type Copy = { site: { decide?: unknown } };
  const { site } = (await import(new URL('../src/lib/copy.ts', import.meta.url).href)) as Copy;
  /* THE KEY IS ASKED FOR BY NAME, OR THE CHECK IS OF NOTHING. `strings(undefined)` is `[]`, so with
     `decide` renamed to `decideRenamed` in `copy.ts` this test passed while reading no scene at all
     (measured on 2026-09-22). An absent scene is a failure here, and so is one with no words in it. */
  assert.ok(site.decide && typeof site.decide === 'object', '`site.decide` is gone from copy.ts, so this test would read nothing: point it at the scene the home page draws now');
  const strings = (v: unknown): string[] =>
    typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];
  const lines = strings(site.decide);
  assert.ok(lines.length > 0, '`site.decide` holds no words, so the address check below would pass over nothing');
  const scripted = lines.flatMap((line) => [...line.matchAll(rowRef)].map((m) => m[0]));
  assert.deepEqual(scripted, [], `site.decide names rows by address, and the scene shows them after load: ${scripted.join(', ')}`);
});

/**
 * THE FIRST SCREEN'S SENTENCE SAYS WHAT A READER GETS, NOT HOW THE STORAGE WORKS.
 *
 * `hero.sub` read *Every change is an event, and the log only grows*: true, audited, and the most
 * technical words above the fold, on the one screen §19 is explicit about (*shows the value, not
 * what it does technically, at least not for the first blocks*). The words below are the ones that
 * sentence and its predecessors reached for. They are all still allowed further down, where the
 * mechanism band is about mechanism on purpose.
 */
test('the hero sentence names no mechanism', async () => {
  type Copy = { site: { hero: { sub: string } } };
  const { site } = (await import(new URL('../src/lib/copy.ts', import.meta.url).href)) as Copy;
  const MECHANISM = /\b(events?|log|logs|registers?|rows?|MCP|append|ledger|typed|overwritten)\b/i;
  const hit = MECHANISM.exec(site.hero.sub);
  assert.equal(hit, null, `hero.sub explains the storage on the first screen ("${hit?.[0]}"): ${site.hero.sub}`);
});

/**
 * EVERY KIND OF PERSON THE PRODUCT IS FOR IS NAMED ON THE HOME PAGE, and each can be reached.
 *
 * The owner's word, 2026-09-17 (`loop/DIRECTION.md` §11): the product is for everyone, and the site
 * read as a product for small businesses. Five use cases are named and none may quietly drop out.
 *
 * THE PHOTOGRAPHS ARE GONE ON PURPOSE and that half of this check went with them. Five screenshots
 * of five arrangements of the same application, each painted at about three quarters of full size,
 * were five pictures a reader could not read and could not tell apart, which made the point they
 * were there to make worse rather than better. One switcher does it instead: pressing a case
 * redraws the section in front of the reader. So what is checked now is that each case is still
 * named and still has a control of its own to press, under the id the old row carried.
 */
const USE_CASES = [
  ['personal', 'Personal'],
  ['student', 'Student'],
  ['founder', 'Solo founder'],
  ['team', 'Team'],
  ['project', 'New project'],
] as const;

test('the home page names all five use cases, each with a control of its own', when(NO_BUILD), () => {
  const html = uncommented(read('index.html'));
  const words = readable(read('index.html'));
  assert.match(html, /\srole="tablist"/, 'index.html no longer has the switcher the use cases are drawn in');
  for (const [id, title] of USE_CASES) {
    assert.match(words, new RegExp(`\\b${title}\\b`), `index.html no longer names the ${title} use case`);
    assert.match(html, new RegExp(`\\sid="uc-${id}"`), `index.html has no control for the ${title} use case (id="uc-${id}")`);
  }
});

/**
 * EVERY PICTURE A PAGE ASKS FOR IS ONE THE BUILD SERVES. `every href goes somewhere` walks links; a
 * `src` or a `srcset` that names a screenshot nobody took is the same broken promise, drawn as an
 * empty frame with a hairline round it.
 */
test('every image a page asks for is in the build', when(NO_BUILD), () => {
  for (const page of PAGES) {
    const html = uncommented(read(page));
    for (const m of html.matchAll(/\s(?:src|srcset)="(\/[^"]+)"/g)) {
      const path = (m[1] ?? '').split(/\s/)[0] ?? '';
      assert.equal(existsSync(new URL(path.slice(1), BUILD)), true, `${page} asks for ${path}, and build/ does not have it`);
    }
  }
});

/**
 * THE HOME PAGE COUNTS NONE OF THE PRODUCT'S OWN PARTS AT A STRANGER.
 *
 * The owner read the page on 2026-09-21 and named the figures on it: *less of those silly ai-looking
 * stats of tools, templates, etc.* (`loop/DIRECTION.md` §19). Four of them sat in a row under the
 * hero, `16 tools an agent can call`, `5 resource templates beside them`, `1 file holds your record`
 * and `30 nightly backups, either host`, and the sixteen tool names were drawn again as a grid two
 * bands down with five resource-template grammars as chips beside them.
 *
 * THIS IS A TEST AND NOT A NOTE IN A DESIGN DOCUMENT BECAUSE THE FIGURES WERE ALL TRUE. Every one
 * was counted off a real declaration, with the command recorded beside it, which is exactly what
 * makes them easy to put back: the next pass that wants a number under the headline will find a
 * correct one in about a minute. What is wrong with them is not arithmetic, and arithmetic is the
 * only thing the rest of this file checks, so the rule needs stating somewhere a build can read it.
 *
 * IT NAMES STRINGS AND ALSO A SHAPE. The five strings are the exact ones that were on the page, so
 * the test says what it caught. The regex is the general case: a bare figure immediately in front of
 * one of the product's own countable parts, which is the sentence pattern rather than the sentence.
 * `12d ago` and `4176` in the ledger are not that shape and are left alone deliberately, because the
 * ledger's figures are a record's own and not a brochure's.
 */
const COUNTED = [
  'tools an agent can call',
  'resource templates',
  'nightly backups',
  /* ONE TOOL NAME AND ONE TEMPLATE GRAMMAR, as proof the two grids are gone rather than reworded.
     `record_index` is the first `name:` key of `packages/mcp/src/index.ts` and `schema/{register}`
     is the first entry of its `TEMPLATES` array, so a grid rebuilt from the declaration in
     declaration order starts with these two whatever else it drops. */
  'record_index',
  'schema/{register}',
] as const;

test('the home page counts none of the product own parts at a stranger', when(NO_BUILD), () => {
  const words = readable(read('index.html'));

  for (const phrase of COUNTED) {
    const hits = around(words, phrase);
    assert.equal(hits.length, 0, `index.html counts the product's parts at a stranger: ${hits.join(' | ')}`);
  }

  const shape = /\b\d+\s+(tools?|resource templates?|templates?|backups?|gates?|packages?|registers?)\b/i.exec(words);
  assert.equal(
    shape,
    null,
    `index.html carries a counted figure of the product's own parts: ${shape ? around(words, shape[0]).join(' | ') : ''}`,
  );
});

/**
 * THE HOME PAGE IS AT MOST FIVE BANDS, THE PRODUCT IS IN THE FIRST ONE, AND IT IS DRAWN.
 *
 * Two measurements, one test, because they are the same complaint. `loop/DIRECTION.md` §19:
 * *i dont like how it's so long, and it's all records and text. i want it to be more graphical, and
 * shows the value, not what it does technically (at least not for the first blocks).*
 *
 * THE LENGTH, AS A NUMBER A BUILD CAN SEE. Driven over `apps/site/build` at 1440 by 900 at a device
 * scale of 1 with motion reduced, the page he complained about was 5,658px over seven bands of 904,
 * 966, 630, 726, 1,153, 573 and 397, and 7,042px at 390. Pixels need a browser and this file reads
 * bytes, so what is held here is the band count, which is the thing the pixels were made of: seven
 * bands is seven arguments, and a band added to be thorough is how a page gets to 5,658px one
 * reasonable decision at a time. Six would pass this and be a regression worth arguing about, which
 * is why the bound is the number the page actually has rather than a round one above it.
 *
 * THE ORDER, AS THE ONE THING IN THE MARKUP THAT SHOWS IT. The first band has to hold the product,
 * and since 22 September the product is the drawn app: its case tabs are the `role="tablist"` this
 * reads. It was once in the SECOND band, 235px of mark, heading and lead below the hairline that
 * opened it, with a five-row ledger and four counted figures in the first. There is no way to check
 * "graphical" from bytes, but there is a way to check that the product is not below the fold of the
 * argument, and that was the fault.
 *
 * AND NO PHOTOGRAPH OF IT. The owner said of the screenshots this page carried *i hate those
 * screenshots. they look terrible. dont just add scnreehots like that*. A `<picture>` or an `<img>`
 * coming back into the home page is that regression, so it fails here by name.
 */
/*
 * EIGHT BANDS FROM 26 SEPTEMBER, AND THE BOUND MOVED WITH THEM. The owner asked for the page under the hero to be
 * rebuilt and for Slash to have a section of its own (`loop/DIRECTION.md` §33), and each band now shows one thing the
 * product does, drawn, rather than a paragraph about it: Slash, agents, the inbox, pages, why it is yours, the plans
 * and the close. The complaint §19 answered was prose and length for their own sake, so the bound is the page as
 * built, and a ninth band is the argument to have first.
 */
test('the home page is at most eight bands, opens on the drawn product, and holds no screenshot', when(NO_BUILD), () => {
  const html = uncommented(read('index.html'));

  const bands = [...html.matchAll(/<section class="band\b/g)];
  assert.equal(
    bands.length <= 8,
    true,
    `index.html draws ${bands.length} bands. Eight is the page as rebuilt on 26 September, and a ` +
      'band that exists to be thorough is what this bound is against.',
  );
  assert.equal(bands.length >= 4, true, `index.html draws ${bands.length} bands, so this check is reading a page it does not recognise`);

  const first = html.slice(bands[0]?.index ?? 0, bands[1]?.index ?? html.length);
  assert.match(
    first,
    /\srole="tablist"/,
    'the first band of index.html does not hold the drawn app, so the page opens on words again. The ' +
      'product is the best thing this page has, and the fault it was once part of was being used as ' +
      'an illustration beside prose further down.',
  );

  const pictures = [...html.matchAll(/<(?:picture|img)\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(pictures, [], 'index.html draws a photograph again, where the product on this page is drawn in HTML and CSS');
});

/**
 * NO LICENCE NAME AND NO EM DASH IN THE COPY FILES EITHER. The served-bytes checks above only see
 * what a page renders today, and a key added for a section not drawn yet slips past them.
 *
 * IT READS EVERY FILE UNDER `src/lib/copy/`, so an area file added tomorrow is scanned the day it
 * lands. The licence names are excused in `trust.ts`'s `legal:` section and nowhere else, which is the
 * owner's split of 2026-09-16 that the served-bytes test above measures from the other side. The em
 * dash rule has no exception: `copy.ts` states it as the fifth of its five voice rules.
 */
test('the copy files hold no em dash, and name a licence only in the legal section', () => {
  const folder = new URL('../src/lib/copy/', import.meta.url);
  const files = readdirSync(folder).filter((name) => name.endsWith('.ts'));
  assert.equal(files.includes('trust.ts'), true, `src/lib/copy/ holds no trust.ts, so this check cannot tell where the licence names are allowed. It holds: ${files.join(', ')}`);

  const quoted = (region: string): string =>
    [...region.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '').join('\n');

  let legal = '';
  let rest = '';
  for (const name of files) {
    const source = readFileSync(new URL(name, folder), 'utf8');
    if (name !== 'trust.ts') {
      rest += `\n${quoted(source)}`;
      continue;
    }
    /* The `legal:` section runs from its key to the next key at the same two-space indent. */
    const from = source.search(/^ {2}legal: \{$/m);
    assert.equal(from !== -1, true, 'trust.ts declares no "legal" section at two spaces of indent');
    const next = source.slice(from + 1).search(/^ {2}[A-Za-z]+: \{$|^\} as const;$/m);
    const to = next === -1 ? source.length : from + 1 + next;
    legal = quoted(source.slice(from, to));
    rest += `\n${quoted(source.slice(0, from) + source.slice(to))}`;
  }

  /* THE LEGAL SECTION STILL NAMES BOTH LICENCES, which is what proves the split landed where this
     test thinks it did. A silent pass over an empty string is not one of the outcomes. */
  assert.match(legal, /\bApache\b/, 'the legal section no longer names the Apache licence');
  assert.match(legal, /\bMIT\b/, 'the legal section no longer names the MIT licence');

  const licence = /\bApache\b|\bMIT\b/.exec(rest);
  assert.equal(licence, null, `a copy file names a licence outside the legal section: ${licence ? around(rest, licence[0]).join(' | ') : ''}`);

  const dashes = around(`${rest}\n${legal}`, '—');
  assert.equal(dashes.length, 0, `the copy files have ${dashes.length} em dash(es) in their strings: ${dashes.join(' | ')}`);
});

/**
 * A MISTYPED ADDRESS GETS THE SITE'S OWN 404 PAGE, not a blank one: the Worker's assets answer a
 * path with no file with `404.html`, and the build writes it. Both environments say so.
 */
test('the Worker serves a prerendered 404 page for a path with no file', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal(config.match(/"not_found_handling": "404-page"/g)?.length, 2, 'production and alpha both name the 404 page');
  assert.ok(existsSync(new URL('../src/routes/404/+page.svelte', import.meta.url)), 'there is no 404 route to prerender');
});

/* `404.html` is in `PAGES` now, so its absence is already what `NO_BUILD` says and the separate
   reason this test used to carry would only ever repeat it. What is left here is the part the
   shared loops cannot see: that this particular document is the 404 page and asks not to be
   indexed, rather than some other page that happens to have been written under that name. */
test('the build writes 404.html, in the site shell and not indexed', when(NO_BUILD), () => {
  const html = read('404.html');
  assert.match(html, /There is no page here/);
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /href="\/pricing"/);
});

/** THE HASHED FILES ARE CACHED FOR GOOD and the screenshots for a day; they were served max-age=0. */
test('_headers caches hashed assets immutably and the screenshots for a day', () => {
  const rules = readFileSync(new URL('../static/_headers', import.meta.url), 'utf8');
  assert.match(rules, /^\/_app\/immutable\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
  assert.match(rules, /^\/shots\/\*\n {2}Cache-Control: public, max-age=86400\b/m);
});

/**
 * /AGENTS COUNTS THE MCP SURFACE OFF THE MCP'S OWN ARRAYS, NOT OFF WHOEVER LAST COUNTED IT.
 *
 * It said "And five addresses a client can read directly" and listed five, under a comment naming
 * `RESOURCES` as the array it came from. The array is `TEMPLATES` (`RESOURCES` does not exist; the
 * fixed resources are `FIXED`), and it held six: the count was true on 21 September when it was
 * written, and `braindog:automation/{id}` landed the next day without the page hearing of it
 * (`loop/research-batch-forty-audit.md` §10). Nothing failed, because the page was a hand count and
 * nothing compared it with the code.
 *
 * SO THIS IMPORTS THE ARRAYS THEMSELVES. The addresses are held to `TEMPLATES` in order, the read
 * and write names to `TOOLS` split on `writes`, and each title's number word to the length it
 * claims to be, so the next template or tool added fails here until the page says it.
 */
test('/agents names every MCP tool and template the MCP declares, and counts them right', async () => {
  type Mcp = { mcp: { title: string; reads: readonly string[]; writes: readonly string[]; resourcesTitle: string; resources: readonly { uri: string }[] } };
  const { site } = (await import(new URL('../src/lib/copy.ts', import.meta.url).href)) as { site: { agents: Mcp } };
  const { TEMPLATES, TOOLS } = (await import(new URL('../../../packages/mcp/src/index.ts', import.meta.url).href)) as {
    TEMPLATES: readonly { uriTemplate: string }[];
    TOOLS: readonly { name: string; writes: boolean }[];
  };
  const page = site.agents.mcp;
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const word = (n: number): string => WORDS[n] ?? String(n);
  const says = (line: string, n: number): boolean => new RegExp(`\\b${word(n)}\\b`, 'i').test(line);

  assert.deepEqual(
    page.resources.map((r) => r.uri),
    TEMPLATES.map((t) => t.uriTemplate),
    '/agents lists other addresses than TEMPLATES in packages/mcp/src/index.ts declares',
  );
  assert.ok(says(page.resourcesTitle, TEMPLATES.length), `"${page.resourcesTitle}" and TEMPLATES holds ${TEMPLATES.length}`);

  const reads = TOOLS.filter((t) => !t.writes).map((t) => t.name);
  const writes = TOOLS.filter((t) => t.writes).map((t) => t.name);
  assert.deepEqual(page.reads, reads, '/agents lists other read tools than TOOLS declares');
  assert.deepEqual(page.writes, writes, '/agents lists other write tools than TOOLS declares');
  assert.ok(says(page.title, TOOLS.length) && says(page.title, reads.length), `"${page.title}" and TOOLS holds ${TOOLS.length}, ${reads.length} of them reads`);
});
