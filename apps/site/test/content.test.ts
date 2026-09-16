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
import { existsSync, readFileSync } from 'node:fs';

const BUILD = new URL('../build/', import.meta.url);
const SEED = new URL('../../../packages/seed/src/index.ts', import.meta.url);

/** The four routes the static adapter writes, under the names it writes them. */
const PAGES = ['index.html', 'pricing.html', 'changelog.html', 'legal.html'] as const;

const absent = PAGES.filter((page) => !existsSync(new URL(page, BUILD)));

const NO_BUILD =
  absent.length === 0
    ? null
    : `apps/site/build is missing ${absent.join(', ')}. Run "pnpm --filter @braindog/site build" first: ` +
      'these checks read the served bytes, and a check with nothing to read is a pass that means nothing.';

const NO_SEED = existsSync(SEED)
  ? null
  : 'packages/seed/src/index.ts is not readable from here, and it is where the registers are declared.';

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
 * THE REGISTERS THE COPY NAMES BY EXAMPLE ARE REGISTERS THAT EXIST.
 *
 * One sentence on the home page teaches a stranger the word `register` by naming three of them, and
 * for some time one of the three was `domains`, which has never been a register in this product:
 * `domain` is one of four values of the `kind` field on `services`. That is the cheapest class of
 * defect to catch and the one that keeps recurring, because the registers get renamed in the seed
 * and the marketing copy is not next to them.
 *
 * The examples are read back out of the built page rather than out of `copy.ts`, and the sentence
 * going missing is a FAILURE rather than a quiet pass, because a check that stops finding what it
 * measures has stopped measuring.
 */
test('every register the copy names by example is one the seed declares', when(NO_BUILD ?? NO_SEED), () => {
  const source = readFileSync(SEED, 'utf8');
  const opens = source.indexOf('export const REGISTERS');
  assert.notEqual(opens, -1, 'packages/seed/src/index.ts no longer exports REGISTERS, so this check reads nothing');

  const rest = source.slice(opens);
  const closes = rest.indexOf('\nexport const ', 1);
  const block = closes === -1 ? rest : rest.slice(0, closes);

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

  const sentence = /A register is a typed collection:([^.]*)\./.exec(prose(read('index.html')));
  if (!sentence) {
    throw new Error(
      'the sentence that teaches a stranger what a register is has gone from the home page. ' +
        'It is the one place the copy names registers by example, and this check has nothing left to read.',
    );
  }

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
 * THE FIELDS THE FIGURE DRAWS ARE FIELDS THE SEED DECLARES.
 *
 * The home page draws one row of the money register beside the types its fields hold, and that
 * figure is the only thing on this site that names a FIELD. It is the same class of defect as the
 * sentence above and one step more likely: field labels get renamed more often than registers do.
 * `Party` became `Who`, `Direction` became `Which way` and `State` became `Status` in a single
 * pass this week, and the marketing copy is not next to the declaration that moved.
 *
 * A field's displayed name is its `label` where it has one and its id where it does not, so both
 * are accepted. And the figure going missing is a FAILURE rather than a quiet pass, for the
 * reason the register check gives about itself: a check that stops finding what it measures has
 * stopped measuring.
 */
test('every field the home page draws is one the money register declares', when(NO_BUILD ?? NO_SEED), () => {
  const source = readFileSync(SEED, 'utf8');
  const opens = source.indexOf('  obligations: {');
  assert.notEqual(opens, -1, 'packages/seed/src/index.ts no longer declares the obligations register');

  /* The register's own block, ended at the next declaration at its indentation. `fields:` sits
     inside it and nowhere else, which is what keeps a neighbouring register's labels out. */
  const rest = source.slice(opens + 2);
  const closes = rest.search(/\n {2}[a-z_]+: \{$/m);
  const block = closes === -1 ? rest : rest.slice(0, closes);

  const declared = new Set<string>();
  for (const m of block.matchAll(/\bid: '([^']+)'/g)) declared.add((m[1] ?? '').toLowerCase());
  for (const m of block.matchAll(/\blabel: '([^']+)'/g)) declared.add((m[1] ?? '').toLowerCase());
  assert.equal(declared.size > 6, true, `only ${declared.size} field words parsed out of the seed; its shape has changed`);

  const html = uncommented(read('index.html'));
  const drawn = [...html.matchAll(/<dt class="label[^"]*">([^<]*)<\/dt>/g)].map((m) => decode(m[1] ?? '').trim());
  if (drawn.length === 0) {
    throw new Error(
      'the figure that draws a typed row has gone from the home page. It is the one place the ' +
        'copy names fields, and this check has nothing left to read.',
    );
  }

  for (const label of drawn) {
    assert.equal(
      declared.has(label.toLowerCase()),
      true,
      `the home page draws a field called "${label}" and packages/seed declares no such field on ` +
        `the money register. It declares: ${[...declared].sort().join(', ')}`,
    );
  }
});
