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
const SEED = new URL('../../../packages/seed/src/index.ts', import.meta.url);
/* THE REGISTERS LIVE IN ONE FILE PER MODULE since the seed was split, so the declarations are read from all of them. */
const MODULES = new URL('../../../packages/seed/src/modules/', import.meta.url);
const seedSource = (): string =>
  readdirSync(MODULES)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => readFileSync(new URL(name, MODULES), 'utf8'))
    .join('\n');

/**
 * Every document the static adapter writes, under the names it writes them.
 *
 * `404.html` IS ONE OF THEM. It was left out while it had a test of its own three tests down, but
 * that test reads three lines of its shell and nothing else, so the page a stranger is most likely
 * to meet after a mistyped link was the one page here nobody checked for an em dash, a stray
 * backtick, a dead href or a missing picture. It is prerendered from `src/routes/404` through the
 * same layout as the rest, so it carries the same nav, the same footer and the same risks.
 */
const PAGES = ['index.html', 'pricing.html', 'agents.html', 'changelog.html', 'legal.html', '404.html'] as const;

const absent = PAGES.filter((page) => !existsSync(new URL(page, BUILD)));

const NO_BUILD =
  absent.length === 0
    ? null
    : `apps/site/build is missing ${absent.join(', ')}. Run "pnpm --filter @braindog/site build" first: ` +
      'these checks read the served bytes, and a check with nothing to read is a pass that means nothing.';

const NO_SEED = existsSync(SEED)
  ? null
  : 'packages/seed/src/index.ts is not readable from here, and it is where the registers are declared.';

/* The use cases are declared apart from the registers, and one check below imports them rather
   than reading them as text, so it needs its own reason to stand down. */
const USECASES = new URL('../../../packages/seed/src/usecases/index.ts', import.meta.url);

const NO_USECASES = existsSync(USECASES)
  ? null
  : 'packages/seed/src/usecases is not readable from here, and it is where the pages and the lists a setup ships are declared.';

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
 * NOTHING ON THIS SITE RENDERS MARKDOWN. Every string reaches the page through a Svelte expression,
 * so a backtick in the source is a backtick on the page, and four sentences shipped with one.
 */
test('no backtick reaches the reader', when(NO_BUILD), () => {
  for (const page of PAGES) {
    const hits = around(readable(read(page)), '`');
    assert.equal(hits.length, 0, `${page} shows ${hits.length} literal backtick(s): ${hits.join(' | ')}`);
  }
});

/**
 * EVERY LINK GOES SOMEWHERE. An audit of the live site counted seven rendered instances across four
 * URLs, every one a 404 to a stranger, including the only outbound action in the free plan and the
 * only one in the changelog's status block. `SOURCE`, `DOCS` and `BUILD` are `null` so that every
 * call site has to decide what to draw when there is no address; this is what checks that each one
 * still draws nothing rather than the word `null`.
 */
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

      if (href.startsWith('#')) {
        assert.equal(ids.has(href.slice(1)), true, `${where}, and no element on that page carries the id`);
        continue;
      }

      const bare = (href.split('#')[0] ?? '').split('?')[0] ?? '';
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
  for (const page of ['index.html', 'pricing.html']) {
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
 * THE REGISTERS THE COPY NAMES BY EXAMPLE ARE REGISTERS THAT EXIST, AND THE WORD IS NOT USED UNTAUGHT.
 *
 * One sentence on the home page taught a stranger the word `register` by naming three of them, and
 * for some time one of the three was `domains`, which has never been a register in this product:
 * `domain` is one of four values of the `kind` field on `services`. That is the cheapest class of
 * defect to catch and the one that keeps recurring, because the registers get renamed in the seed
 * and the marketing copy is not next to them.
 *
 * THE SENTENCE LEFT THE PAGE ON 2026-09-22, AND THIS CHECK USED TO THROW WHEN IT DID. The
 * mechanism band opened on it, which asked a reader to learn a word of the product's plumbing before anything
 * else in the band, and `loop/research-site-now.md` ranked taking it out as part of the page's
 * value-first rewrite. The throw was right for the page it was written for: the sentence going
 * missing while the word stayed would leave a stranger reading a term nobody had defined. So that
 * is what it asks now. If `register` is on the home page, the sentence that teaches it must be too,
 * and every example it names must be declared. If neither is there, there is nothing to get wrong.
 */
test('every register the copy names by example is one the seed declares', when(NO_BUILD ?? NO_SEED), () => {
  const page = prose(read('index.html'));
  const sentence = /A register is a typed collection:([^.]*)\./.exec(page);
  if (!sentence) {
    const used = /\bregisters?\b/i.exec(page);
    assert.equal(
      used,
      null,
      `index.html says "${used?.[0]}" and no longer teaches what one is: ${used ? around(page, used[0]).join(' | ') : ''}`,
    );
    return;
  }

  const source = seedSource();
  const blocks = [...source.matchAll(/^export const [A-Z_]*REGISTERS\b/gm)].map((m) => {
    const rest = source.slice(m.index ?? 0);
    const closes = rest.indexOf('\nexport const ', 1);
    return closes === -1 ? rest : rest.slice(0, closes);
  });
  assert.notEqual(blocks.length, 0, 'packages/seed/src/modules no longer exports any REGISTERS, so this check reads nothing');
  const block = blocks.join('\n');

  /* The id, the name a person is shown and the singular, at the indentation a register declares
     them at. Field declarations sit two levels deeper and are deliberately out of reach. */
  const declared = new Set<string>();
  for (const m of block.matchAll(/^ {2}([a-z_]+): \{$/gm)) declared.add(m[1] ?? '');
  for (const m of block.matchAll(/^ {4}name: '([^']+)',$/gm)) declared.add((m[1] ?? '').toLowerCase());
  for (const m of block.matchAll(/^ {4}one: '([^']+)',$/gm)) {
    declared.add(m[1] ?? '');
    declared.add(`${m[1] ?? ''}s`);
  }
  assert.equal(declared.size > 8, true, `only ${declared.size} register words parsed out of the seed; its shape has changed`);

  const named = (sentence[1] ?? '')
    .split(/,|\band\b/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0);
  assert.equal(named.length >= 2, true, `the teaching sentence names ${named.length} register(s): "${sentence[0]}"`);

  for (const word of named) {
    assert.equal(
      declared.has(word),
      true,
      `the home page teaches "${word}" as a register and packages/seed declares no such thing. ` +
        `The seed declares: ${[...declared].sort().join(', ')}`,
    );
  }
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
  ['guide', 'New project'],
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
 * EVERY PAGE AND EVERY LIST THE RAIL SAYS A RECORD HOLDS IS ONE THE SETUP ACTUALLY SHIPS.
 *
 * `copy.ts` states this contract over `arrange.cases` itself: `holds` is the pages and the lists
 * that setup ships, each under the name the record itself gives it, so a reader can check this list
 * against the screen they get after Make my record. That is about forty names typed by hand beside
 * a seed that renames things, and nothing measured them. An audit found two wrong: the Personal
 * rail listed both `Money` and `Bills` for the one register, and the Team rail listed `Work`.
 *
 * IT IMPORTS THE SEED INSTEAD OF READING IT AS TEXT, which is what every other seed check in this
 * file does, and the reason is that these names are not written in the seed. `Bills` is the
 * `obligations` register of `money-core`, declared as `Money` and renamed by the `labels` map the
 * Personal use case carries. A regex would have to reimplement `pagesOf`, `listsOf`, the label
 * overrides and the module expansion, and a reimplementation of the thing under test is not a test
 * of it. This does not make the site depend on the seed: the site's own rule is about what the
 * BUNDLE may reach for, and `apps/site` still builds with `packages/seed` deleted. A test may know
 * more than a bundle may.
 *
 * WHAT COUNTS AS SHIPPED, per case: the title of its own Home page, the titles of the pages it
 * declares, the names of the lists it declares, and the same two out of every first-party module it
 * installs, with every list name put through that use case's `labels` first.
 *
 * A NAV SECTION IS NOT A PAGE, and leaving sections out is exactly what catches the second of the
 * two. `Work` is a heading over two pages titled Overview and Board. A reader told their record
 * holds Work goes looking for it and finds neither, which is the whole defect this measures.
 *
 * ONE DIRECTION ONLY. `holds` is an editorial shortlist and not an inventory: Personal also ships
 * `Project steps` and `Exchange rates`, and the rail is right not to recite them. So every name in
 * `holds` must be shipped, and not every shipped name need be in `holds`.
 */
test('every page and list the rail says a record holds is one the seed ships', when(NO_USECASES), async () => {
  /* The shapes this reads out of the three modules. Written out rather than inferred because a
     check that reaches into a sibling package should say what it expects to find there, and go
     red at the cast when that changes rather than quietly measuring nothing. */
  type Body = Record<string, unknown>;
  type Seeded = { usecase: string; modules: readonly string[]; labels: Record<string, string>; pack: { declarations?: readonly Body[] } | null };
  type Seed = { useCase: (id: string) => Seeded | undefined; pagesOf: (u: Seeded) => readonly { page: string; title: string }[]; listsOf: (u: Seeded) => readonly { id: string; name: string }[] };
  type Share = { modulesToInstall: (u: Seeded) => readonly string[] };
  type Packs = { FIRST_PARTY: readonly string[]; firstPartyDocument: (id: string) => { declarations: readonly Body[] } };
  type Copy = { site: { arrange: { cases: readonly { id: string; holds: readonly string[] }[] } } };

  const seed = (await import(USECASES.href)) as Seed;
  const share = (await import(new URL('share.ts', USECASES).href)) as Share;
  const packs = (await import(new URL('../packs/first-party.ts', USECASES).href)) as Packs;
  const { site } = (await import(new URL('../src/lib/copy.ts', import.meta.url).href)) as Copy;

  /** Every name a reader could meet on the rail after this use case is installed. */
  const shipped = (u: Seeded): Set<string> => {
    const names = new Set<string>();

    /* Home is not in `pagesOf`: it REPLACES the house Home rather than adding a rail entry. The
       rail still names it, as `Day to day`, `Today` and `Your project`, so it is counted here. */
    const home = (u.pack?.declarations ?? []).find((d) => d.page === `home-${u.usecase}`);
    if (typeof home?.title === 'string') names.add(home.title);

    for (const page of seed.pagesOf(u)) names.add(page.title);
    for (const list of seed.listsOf(u)) names.add(u.labels[list.id] ?? list.name);

    for (const id of share.modulesToInstall(u)) {
      assert.equal(
        packs.FIRST_PARTY.includes(id),
        true,
        `the ${u.usecase} setup installs a module named "${id}" that packs/first-party.ts does not ` +
          'declare, so this check cannot see what that module ships and would pass by not looking',
      );
      for (const d of packs.firstPartyDocument(id).declarations) {
        const register = typeof d.register === 'string' ? d.register : null;
        if (register !== null && d.page === undefined && d.rule === undefined) {
          names.add(u.labels[register] ?? (typeof d.name === 'string' ? d.name : register));
        }
        /* A `for:` page is drawn once per row and titled out of the row (`{{name}}`), so it has no
           one name a rail could print. */
        if (typeof d.page === 'string' && d.for === undefined && typeof d.title === 'string') names.add(d.title);
      }
    }
    return names;
  };

  const cases = site.arrange.cases;
  assert.equal(cases.length, USE_CASES.length, `copy.ts arranges ${cases.length} cases and the home page names ${USE_CASES.length}`);

  const wrong: string[] = [];
  for (const one of cases) {
    const u = seed.useCase(one.id);
    if (!u) {
      wrong.push(`the rail offers a case called "${one.id}" and the seed declares no such use case`);
      continue;
    }
    assert.equal(one.holds.length > 0, true, `the ${one.id} case holds nothing, so this check has nothing to read for it`);

    const ships = shipped(u);
    assert.equal(ships.size > 0, true, `the ${one.id} setup ships no pages and no lists at all; the seed's shape has changed under this check`);

    for (const name of one.holds) {
      if (ships.has(name)) continue;
      wrong.push(
        `the ${one.id} rail says a record holds "${name}", and that setup ships no page and no list ` +
          `under that name. It ships: ${[...ships].sort().join(', ')}`,
      );
    }
  }

  assert.equal(wrong.length, 0, `${wrong.length} name(s) on the rail are not things a record will have:\n  - ${wrong.join('\n  - ')}`);
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
test('the home page is at most five bands, opens on the drawn product, and holds no screenshot', when(NO_BUILD), () => {
  const html = uncommented(read('index.html'));

  const bands = [...html.matchAll(/<section class="band\b/g)];
  assert.equal(
    bands.length <= 5,
    true,
    `index.html draws ${bands.length} bands. Seven was the page the owner called too long, and a ` +
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
 * NO LICENCE NAME AND NO EM DASH IN THE COPY FILE EITHER. The served-bytes checks above only see
 * what a page renders today, and a key added for a section not drawn yet slips past them.
 *
 * IT USED TO READ A PREFIX AND NOW IT READS THE WHOLE OBJECT. The line was
 * `source.slice(indexOf('export const site'), indexOf('\n  legal: {'))`, which measured everything
 * declared ABOVE `legal:` and nothing below it. That is not a rule about what is marketing copy, it
 * is an accident of key order: `changelog` and `footer` sit after `legal` and were unscanned, and
 * moving any section past `legal:` would have dropped it out of the check without a word. So the
 * sections are read out of the file by their indentation and every one of them is scanned.
 *
 * THE LICENCE NAMES ARE EXCUSED IN `legal:` AND NOWHERE ELSE, which is the owner's split of
 * 2026-09-16 that the served-bytes test above measures from the other side. The em dash rule has no
 * exception: `copy.ts` states it as the fifth of its five voice rules, and a reader on /legal is
 * still a reader.
 */
test('copy.ts holds no em dash, and names a licence only in its legal section', () => {
  const source = readFileSync(new URL('../src/lib/copy.ts', import.meta.url), 'utf8');
  const opens = source.indexOf('export const site');
  const closes = source.indexOf('\n} as const;', opens);
  assert.equal(opens !== -1 && closes !== -1, true, 'copy.ts no longer holds one `export const site` object, so this check reads nothing');
  const site = source.slice(opens, closes);

  /* The sections, at the two-space indent a top-level key of `site` is declared at. Reading them
     out of the file rather than naming them here is the whole point: a section added tomorrow is
     scanned the day it lands, and no ordering of them can put one out of reach. */
  const sections = [...site.matchAll(/^ {2}([A-Za-z]+): \{$/gm)];
  const named = sections.map((m) => m[1] ?? '');
  assert.equal(named.length > 8, true, `only ${named.length} sections parsed out of copy.ts; its shape has changed`);
  assert.equal(named.includes('legal'), true, `copy.ts declares no "legal" section, so this check cannot tell where the licence names are allowed. It declares: ${named.join(', ')}`);

  const at = named.indexOf('legal');
  const from = sections[at]?.index ?? 0;
  const to = sections[at + 1]?.index ?? site.length;

  const quoted = (region: string): string =>
    [...region.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '').join('\n');

  const legal = quoted(site.slice(from, to));
  const rest = quoted(site.slice(0, from) + site.slice(to));

  /* THE LEGAL SECTION STILL NAMES BOTH LICENCES, which is what proves the two regions above landed
     where this test thinks they did. If the split misfired, either this goes red or the licence
     assertion below does, and a silent pass over an empty string is not one of the outcomes. */
  assert.match(legal, /\bApache\b/, 'the legal section of copy.ts no longer names the Apache licence');
  assert.match(legal, /\bMIT\b/, 'the legal section of copy.ts no longer names the MIT licence');

  const licence = /\bApache\b|\bMIT\b/.exec(rest);
  assert.equal(licence, null, `copy.ts names a licence outside its legal section: ${licence ? around(rest, licence[0]).join(' | ') : ''}`);

  const dashes = around(`${rest}\n${legal}`, '—');
  assert.equal(dashes.length, 0, `copy.ts has ${dashes.length} em dash(es) in its strings: ${dashes.join(' | ')}`);
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
