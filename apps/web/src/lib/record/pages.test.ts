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

import { page, pages } from './api.ts';
import { PAGES, REGISTERS, ROWS } from './data.ts';
import { fill, resolvePages, slugify } from './pages.ts';
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
