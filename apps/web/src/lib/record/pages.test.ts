/**
 * One declaration, one page per row.
 *
 * The Kiln page was a declaration with the name typed into six predicates, three metric ids and five
 * sentences, and a second project meant a second copy of all of it. Worse, the page route stripped
 * the repeated clause back out with a string heuristic — which is the admission that the name should
 * never have been typed into the predicate in the first place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyFilters, page, pages, type Filter } from './api.ts';
import { PAGES, REGISTERS, ROWS } from './data.ts';
import { fill, resolvePages, slugify } from './pages.ts';
import { registerHref } from './where.ts';
import type { PageDecl } from './schema.ts';

const projects = () => Object.values(pages()).filter((p) => p.param?.register === 'things');

/* ── the expansion ───────────────────────────────────────────────────────── */

test('ONE DECLARATION BECOMES ONE PAGE PER ROW', () => {
  const template = PAGES.project;
  assert.ok(template?.for, 'the project page is no longer a template, so this proves nothing');

  const built = projects();
  const admitted = (ROWS.things ?? []).filter((t) => t.fields.lane === 'building' || t.fields.lane === 'earning');
  assert.equal(built.length, admitted.length, `${built.length} pages for ${admitted.length} projects`);
  assert.ok(built.length > 1, 'a template that produces one page is a page');
});

test('the slug comes from the row, so an existing link still works', () => {
  // `/p/kiln` was hand-written and is pasted into messages. A counter would have renamed every one
  // of those the first time somebody reordered the register.
  assert.ok(pages().kiln, '/p/kiln stopped existing');
  assert.equal(pages().kiln?.param?.title, 'Kiln');
  assert.equal(slugify('Marlow & Co'), 'marlow-co');
  assert.equal(slugify('  '), 'page', 'a row with no usable title still gets a slug');
});

test('a page carries its parameter and its identity, so it can wear the row’s colour', () => {
  for (const p of projects()) {
    assert.ok(p.param, `${p.page} has no parameter`);
    assert.deepEqual(p.identity, { register: p.param.register, seq: p.param.seq });
    assert.equal(p.title, p.param.title, 'the title is not the row it is about');
  }
});

test('a row the `for:` predicate excludes gets no page', () => {
  // A rail with a page for something nobody is working on is a rail you stop reading.
  const parked = (ROWS.things ?? []).filter((t) => t.fields.lane === 'parked' || t.fields.lane === 'retired');
  assert.ok(parked.length > 0, 'the seed has no parked project, so this proves nothing');
  const built = new Set(projects().map((p) => p.param?.seq));
  for (const t of parked) assert.ok(!built.has(t.seq), `${t.fields.name} is parked and has a page`);
});

/* ── substitution ────────────────────────────────────────────────────────── */

test('every `{{field}}` is filled, everywhere it can appear', () => {
  for (const p of projects()) {
    const text = JSON.stringify(p);
    assert.ok(!text.includes('{{'), `${p.page} still carries an unresolved field: ${text.slice(text.indexOf('{{') - 40, text.indexOf('{{') + 20)}`);
    assert.ok(text.includes(p.param!.title), `${p.page} does not mention the row it is about`);
  }
});

test('a name the row does not carry is LEFT AS IT WAS WRITTEN', () => {
  // So it reaches the block's refusal surface as the unresolved path it is, rather than as an empty
  // string that quietly matches everything.
  const row = (ROWS.things ?? [])[0]!;
  assert.equal(fill('thing is {{name}}', row), `thing is ${row.fields.name}`);
  assert.equal(fill('thing is {{nope}}', row), 'thing is {{nope}}');
});

test('it is a substitution and not a template language', () => {
  const row = (ROWS.things ?? [])[0]!;
  assert.equal(fill('{{name}} and {{name}}', row), `${row.fields.name} and ${row.fields.name}`);
  assert.equal(fill('{{ name }}', row), '{{ name }}', 'whitespace inside the braces is not a field');
  assert.equal(fill('no fields here', row), 'no fields here');
});

/* ── the pages actually work ─────────────────────────────────────────────── */

test('EVERY RESOLVED PAGE DRAWS, AND NONE OF THEM REFUSES', () => {
  // The measurement that matters: three pages over one declaration, each with its own rows.
  for (const p of projects()) {
    const read = page(p.page);
    assert.ok(read, `${p.page} does not resolve`);
    for (const b of read.blocks) assert.deepEqual(b.refusals, [], `${p.page} · ${b.heading}: ${b.refusals[0]}`);
    assert.ok(
      read.blocks.some((b) => b.total > 0),
      `${p.page} drew nothing at all`,
    );
  }
});

test('two projects do not draw the same rows', () => {
  // The failure a substitution bug would produce: every page showing Kiln's numbers.
  const seen = new Map<string, string>();
  for (const p of projects()) {
    const table = page(p.page)?.blocks.find((b) => b.kind === 'table');
    const key = (table?.matched ?? []).map((e) => e.seq).join(',');
    if (!key) continue;
    const already = seen.get(key);
    assert.ok(!already, `${p.page} draws exactly the rows ${already} does`);
    seen.set(key, p.page);
  }
});

test('each page carries the register’s own numbers, narrowed to its row', () => {
  for (const p of projects()) {
    const table = page(p.page)?.blocks.find((b) => b.kind === 'table' && b.register === 'obligations');
    if (!table) continue;
    for (const e of table.matched)
      assert.equal(e.fields.thing, p.param!.seq, `${p.page} shows an obligation belonging to another project`);
  }
});

test('the nav lists them all, each at its own place', () => {
  const nav = projects().filter((p) => p.nav);
  assert.ok(nav.length > 1);
  const orders = nav.map((p) => p.nav!.order);
  assert.equal(new Set(orders).size, orders.length, 'two project pages claim the same place in the rail');
});

/* ── the resolver refuses rather than guessing ───────────────────────────── */

test('a template whose own `for:` predicate cannot be read produces NO pages', () => {
  // The same rule as everywhere else: an unreadable filter matches nothing. One per row of the
  // register would be a rail full of pages nobody asked for.
  const broken: Record<string, PageDecl> = {
    x: { ...PAGES.project!, for: { register: 'things', where: 'lane is nonsense' } },
  };
  assert.deepEqual(Object.keys(resolvePages(broken)), []);
});

test('a template over a register that does not exist produces no pages', () => {
  const broken: Record<string, PageDecl> = { x: { ...PAGES.project!, for: { register: 'atlantis' } } };
  assert.deepEqual(Object.keys(resolvePages(broken)), []);
});

test('a declared page is untouched, and a template never replaces one', () => {
  const all = pages();
  for (const slug of ['money', 'estate', 'work']) {
    assert.ok(all[slug], `${slug} disappeared`);
    assert.equal(all[slug]?.param, undefined, `${slug} was treated as a template`);
  }
  // Two rows with the same title are two pages, and neither silently replaces the other.
  const title = REGISTERS.things?.title ?? 'name';
  const rows = ROWS.things ?? [];
  const first = rows[0]!;
  const was = rows[1]!.fields[title];
  rows[1]!.fields[title] = String(first.fields[title]);
  try {
    const built = Object.values(resolvePages({ p: PAGES.project! }));
    const admitted = rows.filter((t) => t.fields.lane === 'building' || t.fields.lane === 'earning').length;
    assert.equal(built.length, admitted, 'a duplicate title lost a page');
    assert.equal(new Set(built.map((p) => p.page)).size, admitted, 'two pages share a slug');
    // The second one keeps its number, so it is findable rather than merely distinct.
    assert.ok(built.some((p) => p.page === `kiln-${rows[1]!.seq}`), 'the duplicate did not keep its row number');
  } finally {
    if (was === undefined) delete rows[1]!.fields[title];
    else rows[1]!.fields[title] = was;
  }
});

/* ── a block that is showing a slice, and the way to the rest ────────────── */

/** The register route's own reading of `?f=` chips, verbatim, so this proves the round trip. */
const chipsOf = (href: string): Filter[] =>
  new URL(href, 'https://x').searchParams.getAll('f').map((raw) => {
    const [field = '', op = 'is', values = ''] = raw.split(':');
    return { field, op, values: values.split(',').map(decodeURIComponent) };
  });

const cut = () =>
  Object.keys(pages()).flatMap((slug) =>
    (page(slug)?.blocks ?? [])
      .filter((b) => b.register && b.total > b.shown)
      .map((b) => ({ slug, block: b })),
  );

test('A BLOCK THAT DRAWS A SLICE IS A BLOCK THAT SAYS SO', () => {
  /* `limit:` is a reading cap and every page in the seed declares one. Nothing rendered admitted it:
     `/p/marlow-co`'s Money drew 8 of that client's 12 obligations under a heading that reads as the
     complete answer. This test does not assert a sentence — the route renders that — it asserts the
     two numbers the sentence is made of are both present and both true. */
  const slices = cut();
  assert.ok(slices.length > 0, 'nothing in the seed truncates, so the surface cannot be checked here');

  for (const { slug, block } of slices) {
    assert.equal(block.rows.length, block.shown, `${slug}: the drawn rows and the drawn count disagree`);
    assert.equal(block.shown, block.limit ?? 50, `${slug}: a block was cut somewhere other than its limit`);
    /* THE TOTAL IS THE WHOLE ANSWER, not the page. A count that is also capped is a count that
       cannot tell a short list from a narrow one, which is the reason the line exists at all. */
    assert.ok(block.total > block.shown, `${slug}: total did not survive the cut`);
    assert.equal(block.total, block.matched.length, `${slug}: total is not what the predicate admitted`);
  }
});

test('and the register it points at holds every row the block did not draw', () => {
  /* THE LADDER, END TO END. The line says "8 of 12" and offers the register; if that address does
     not open those twelve rows the line is worse than saying nothing, because it has now promised
     somewhere to find them. The block's predicate goes out as `?f=` chips and comes back through
     the register route's own parser and the same evaluator. */
  for (const { slug, block } of cut()) {
    const href = registerHref(block.register!, block.where);
    const opened = applyFilters(block.register!, ROWS[block.register!] ?? [], chipsOf(href));
    assert.equal(
      opened.length,
      block.total,
      `${slug}: "${block.heading}" says ${block.total} rows and its link opens ${opened.length}`,
    );
    const drawn = new Set(block.entries.map((e) => e.seq));
    for (const seq of drawn)
      assert.ok(opened.some((e) => e.seq === seq), `${slug}: a row the block drew is not in the list it links to`);
  }
});

test('an unfiltered block still links to its register, and every link is one the app can route', () => {
  for (const slug of Object.keys(pages()))
    for (const block of page(slug)?.blocks ?? []) {
      if (!block.register) continue;
      const href = registerHref(block.register, block.where);
      assert.match(href, /^\/r\/[a-z_]+(\?|$)/, `${slug}: ${href} is not a register address`);
      assert.ok(!href.includes(' '), `${slug}: a raw space reached a URL`);
    }
});

test('EVERY block counts what it is showing, in the unit its total is in', () => {
  /* "Showing 0 of 58" over thirteen visible rows, on `/p/money`'s cash walk, one hour after the line
     shipped. `entries` is a register row and a step of a walk is not one, so `forecast.runway` left
     it empty; `rows` was no better, because the walk's first row is the opening balance — a header
     wearing a row's clothes, and not one of the 58. The count is now stated by whoever builds the
     block, and this is the assertion that it always is. */
  for (const slug of Object.keys(pages()))
    for (const block of page(slug)?.blocks ?? []) {
      if (block.refusals.length) continue;
      assert.equal(typeof block.shown, 'number', `${slug}: a block with no count of what it draws`);
      assert.ok(block.shown <= block.total, `${slug}: "${block.heading}" draws ${block.shown} of ${block.total}`);
      /* A BLOCK THAT SHOWS NOTHING AND HOLDS SOMETHING IS THE BUG THIS TEST IS NAMED AFTER. */
      if (block.total > 0) assert.ok(block.shown > 0, `${slug}: "${block.heading}" holds ${block.total} rows and admits to drawing none`);
    }
});

test('and the walk counts steps, not the opening balance beside them', () => {
  const walk = (page('money')?.blocks ?? []).find((b) => b.source === 'forecast.runway');
  assert.ok(walk, 'the money page no longer draws a cash walk, so this proves nothing');
  /* The opening row is drawn and is not a step: `rows` is one longer than `shown`, deliberately. */
  assert.equal(walk.rows.length, walk.shown + 1, 'the walk lost its opening row, or started counting it');
  assert.ok(walk.total > walk.shown, 'the seeded walk no longer runs past its limit');
});
