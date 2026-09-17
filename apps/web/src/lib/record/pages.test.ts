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

import { applyFilters, page, pages, readBlock, type Filter } from './api.ts';
import { NOW, PAGES, REGISTERS, ROWS } from './data.ts';
import { draw, toSegments } from './blocks.ts';
import { fill, resolvePages, slugify } from './pages.ts';
import { compile, matches, registerHref } from './where.ts';
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
    /* A NOTE THAT IS THE ROW'S OWN DOCUMENT is what the row says, and a document writes its own `{{money:…}}` figures. */
    const text = JSON.stringify({ ...p, blocks: p.blocks.map((b) => (b.document ? { ...b, body: '' } : b)) });
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
  const decl = PAGES.money?.blocks.find((b) => b.source === 'forecast.runway' && b.kind === 'forecast');
  assert.ok(decl, 'the money page no longer draws a cash walk, so this proves nothing');
  /* The page draws the walk as a forecast, which shows every step; read as a table it is cut to twelve. */
  const walk = readBlock({ ...decl, kind: 'table', limit: 12, knobs: undefined, recorded: undefined } as never);
  /* The opening row is drawn and is not a step: `rows` is one longer than `shown`, deliberately. */
  assert.equal(walk.rows.length, walk.shown + 1, 'the walk lost its opening row, or started counting it');
  assert.ok(walk.total > walk.shown, 'the seeded walk no longer runs past its limit');
});

/* ── day one, over the real declarations ─────────────────────────────────── */

test('EVERY BLOCK BOUND TO AN EMPTY LIST SAYS "nothing here yet", not "nothing matched"', () => {
  /* The seeded record has no empty register, which is exactly why this survived: the state `19 §6`
     designs for day one could not be reached from any route in the build, so nothing on screen ever
     showed it being wrong. This empties one and walks every page that reads it.

     `services` because it is read by seven blocks across three pages, filtered and unfiltered. */
  const held = ROWS.services ?? [];
  const was = [...held];
  held.length = 0;
  try {
    let seen = 0;
    for (const slug of Object.keys(pages()))
      for (const block of page(slug)?.blocks ?? []) {
        if (block.register !== 'services' || block.refusals.length) continue;
        const decl = REGISTERS.services!;
        const { refusal } = draw(block, {
          rows: 0,
          name: decl.name,
          ...(decl.holds ? { holds: decl.holds } : {}),
          add: { href: '/r/services?new=1', label: 'Add the first row' },
        });
        /* NOT "every block refuses" — the claim is that whatever IS empty is not called a filter
           result. A kind that REDUCES has nothing to be empty: a `stat` over an empty list reads
           GBP 0.00 and a `gauge` reads GBP 0.00 of GBP 220.00, and both are true answers rather
           than absences. `19 §6`'s five states are about a list with nothing in it.

           THE NUMBER THIS USED TO QUOTE WAS THE BUG IT WAS ILLUSTRATING. It said "0 of 22,000",
           which is what the gauge printed when nothing matched — `total()` reports no currency over
           an empty set, so both figures fell out of `display()` and rendered as raw minor units.
           The claim was right and the evidence was the defect; the target is a declared constant of
           GBP 220.00 whether or not a row matches it. */
        if (!refusal) continue;
        assert.equal(refusal.kind, 'no-data-yet', `${slug}: "${block.heading}" called an empty list a filter result`);
        assert.ok(refusal.action, `${slug}: "${block.heading}" offered nothing to do about it`);
        assert.ok(refusal.title, `${slug}: "${block.heading}" said nothing at all`);
        seen++;
      }
    assert.ok(seen >= 3, `only ${seen} blocks read services, so this proves less than it should`);
  } finally {
    held.push(...was);
  }
});

/* ── two pages on one slug ───────────────────────────────────────────────── */

test('A SECOND COLLISION ON THE NUMBERED SLUG DELETED A PAGE', () => {
  /**
   * The fallback was `${base}-${row.seq}` and it was never checked against anything, while
   * `out[slug] = …` overwrites. A hand-written `kiln`, a hand-written `kiln-1` and a template row
   * titled "Kiln" at seq 1 all wanted `kiln-1`, and the template took it: "Kiln one, by hand" was
   * gone from the record's page list entirely. The record's own audit filed this as a page listed
   * and unreachable; here it is worse, because the page is not listed either.
   *
   * The fix counts up until the slug is free, which is the record's `claim`, copied.
   */
  const kiln = (ROWS.things ?? []).find((t) => t.fields.name === 'Kiln');
  assert.ok(kiln, 'the seed has no project called Kiln, so this proves nothing');

  const declared: Record<string, PageDecl> = {
    ...PAGES,
    kiln: { page: 'kiln', title: 'Kiln, by hand', blocks: [] } as unknown as PageDecl,
    'kiln-1': { page: 'kiln-1', title: 'Kiln one, by hand', blocks: [] } as unknown as PageDecl,
  };

  const out = resolvePages(declared);
  const titles = Object.values(out).map((p) => p.title);
  assert.equal(Object.keys(out).length, Object.keys(resolvePages(PAGES)).length + 2, 'a page was destroyed by a slug collision');
  for (const title of ['Kiln, by hand', 'Kiln one, by hand', 'Kiln'])
    assert.ok(titles.includes(title), `"${title}" is not in the page list`);

  /* AND EVERY ONE OF THEM IS REACHABLE UNDER THE SLUG IT IS FILED AT. A page in the list at an
     address that serves a different document is the milder half of the same defect. */
  assert.equal(new Set(Object.keys(out)).size, Object.keys(out).length);
  for (const [slug, decl] of Object.entries(out)) assert.equal(out[slug]?.title, decl.title);
});

/* ── the record's clock, everywhere ──────────────────────────────────────── */

test('a template expands on the RECORD’S clock, not the wall clock', () => {
  /**
   * `matches(e, w, Date.now())` was the one date in the browser that did not resolve against `NOW`.
   * A template filtering `due before today` therefore expanded against whatever day it happened to
   * be run on, while the blocks on the pages it produced filtered against the record's day: a page
   * existed that the record does not have, drew a heading and no rows, and the set drifted by one
   * every day while nothing else on the record moved.
   *
   * A RELATIVE WORD, NOT AN ISO LITERAL. An absolute date resolves the same on both clocks, so it
   * cannot reach this at all.
   */
  const declared: Record<string, PageDecl> = {
    ...PAGES,
    overdue: {
      page: 'overdue',
      title: '{{what}}',
      for: { register: 'obligations', where: 'state is open, due before today' },
      blocks: [],
    } as unknown as PageDecl,
  };

  const built = Object.values(resolvePages(declared)).filter((p) => p.param?.register === 'obligations');
  const w = compile('obligations', 'state is open, due before today');
  const wanted = (ROWS.obligations ?? []).filter((e) => matches(e, w, NOW));
  const wall = (ROWS.obligations ?? []).filter((e) => matches(e, w, Date.now()));

  assert.notEqual(wanted.length, wall.length, 'the two clocks agree today, so this proves nothing');
  assert.equal(built.length, wanted.length, `${built.length} pages for ${wanted.length} rows the record admits`);
  assert.deepEqual(built.map((p) => p.param?.seq).sort(), wanted.map((e) => e.seq).sort());
});

/* ── one missing optional key ────────────────────────────────────────────── */

test('a `cells:` entry with no `label:` does not take EVERY page off the rail', () => {
  /**
   * `fill(c.label, row)` handed `String.prototype.replace` an `undefined` and threw out of
   * `resolvePages`, which the rail, the router and every page listing call, above the per-block
   * `try/catch` that would have contained it. One optional key missing from one cell of one
   * declaration made every page in the record unlistable.
   *
   * A refusal is a value: the page draws, and the cell falls back to naming the metric it reads.
   */
  const declared: Record<string, PageDecl> = {
    ...PAGES,
    unlabelled: {
      page: 'unlabelled',
      title: '{{name}}',
      for: { register: 'things', where: 'lane is building or earning' },
      blocks: [{ kind: 'stat', heading: 'No label here', cells: [{ metric: 'project-open:{{name}}' }] }],
    } as unknown as PageDecl,
  };

  const out = resolvePages(declared);
  const shipped = resolvePages(PAGES);
  for (const slug of Object.keys(shipped))
    assert.ok(Object.values(out).some((p) => p.title === shipped[slug]?.title), `${slug} was lost`);

  const built = Object.values(out).filter((p) => p.blocks?.[0]?.heading === 'No label here');
  assert.ok(built.length > 1, 'the template produced no pages, so nothing was filled');
  for (const p of built) {
    const cell = p.blocks?.[0]?.cells?.[0];
    assert.ok(cell, 'the cell is gone');
    assert.ok(!cell.metric.includes('{{'), `${p.page}: the metric was not filled`);
    assert.equal(cell.label, cell.metric, `${p.page}: an unlabelled cell has no name to draw`);
  }
});

test('A LINK IN A LIST BLOCK READS AS THE ROW IT POINTS AT, as the table beside it does, never as a spoken id', () => {
  /* A LIVE RECORD'S LINK names a row this tab holds no copy of, so only the evaluator's cell knows its title. */
  const read = readBlock({ kind: 'steps', source: 'register.obligations', columns: [{ field: 'what' }, { field: 'party' }], limit: 1 } as never);
  const entry = read.entries[0]!;
  const block = { ...read, entries: [{ ...entry, fields: { ...entry.fields, party: 'people#999' } }], rows: [{ ...read.rows[0]!, cells: ['', 'Say what it is and who it is for'] }] };
  const text = JSON.stringify(toSegments(block));
  assert.doesNotMatch(text, /people#999/u);
  assert.match(text, /Say what it is and who it is for/u);
});

test('A SECTION THAT WROTE NO SENTENCE SAYS NOTHING when its list matched nothing, and one that wrote one still says it', () => {
  const shell = { heading: 'Parked and finished', register: 'things', rows: [], entries: [], matched: [], refusals: [], authored: [], columns: [], total: 0 };
  const quiet = draw({ ...shell, kind: 'section' } as never);
  assert.equal(quiet.refusal, null, 'a heading over blocks that say their own nothing says nothing itself');
  const said = draw({ ...shell, kind: 'section', empty: 'Nothing is parked yet.' } as never);
  assert.equal(said.refusal?.title, 'Nothing is parked yet.');
  /* A LIST BLOCK STILL SAYS ITS OWN. */
  const table = draw({ ...shell, kind: 'table', empty: 'Nothing is parked or finished.' } as never);
  assert.equal(table.refusal?.title, 'Nothing is parked or finished.');
});
