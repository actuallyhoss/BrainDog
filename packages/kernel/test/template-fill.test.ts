/**
 * A template's pages, filled from rows whose names hold the grammar's own marks, a capture that presets a link, and the
 * order a template's pages come in (`loop/research-dynamic-layouts.md` section 7, measured while building
 * `packs/launch-desk`).
 *
 * A NAME IS ONE VALUE, WHATEVER IT HOLDS. `fill` wrote a row's name into a block's `where` as it stood, so a part called
 * `Wax, wick and scent` made `part is Wax, wick and scent` two clauses, and every block filtered by the part on its page
 * was refused `FIELD_UNKNOWN`: "parts has no field called wick". A name with ` or ` in it widened to two values, and one
 * starting with `not` turned the filter over.
 *
 * Every row here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseWhere, quoteValue, type Schema } from '@braindog/where';

import { fill, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = { actor: 'p_1' };

const PARTS: Declaration = {
  id: 'register.parts',
  kind: 'register',
  body: { id: 'parts', name: 'Parts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'what', type: 'text' }] } as never,
};

const STEPS: Declaration = {
  id: 'register.steps',
  kind: 'register',
  body: {
    id: 'steps',
    name: 'Steps',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'part', type: 'ref', to: 'parts' },
      { id: 'done', type: 'bool' },
      { id: 'rank', type: 'int' },
    ],
    steps: { of: 'part', done: 'done', order: 'rank' },
  } as never,
};

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'text',
    fields: [
      { id: 'text', type: 'text', required: true },
      { id: 'about', type: 'ref' },
      { id: 'part', type: 'ref', to: 'parts' },
      { id: 'mood', type: 'enum', values: ['calm', 'busy'] },
    ],
  } as never,
};

/** A page per part: its steps, itself by name, and a pad that presets which part a note is about. */
const PART: Declaration = {
  id: 'page.part',
  kind: 'page',
  body: {
    page: 'part',
    title: '{{name}}',
    for: { register: 'parts' },
    nav: { section: 'Launch', order: 20, tabs: true },
    requires: ['register.parts', 'register.steps', 'register.notes'],
    blocks: [
      { kind: 'note', heading: '{{name}}', body: 'About {{name}}.' },
      { kind: 'table', heading: 'Steps', source: 'register.steps', where: 'part is {{name}}', columns: [{ field: 'what' }], empty: 'No steps.' },
      { kind: 'table', heading: 'Itself', source: 'register.parts', where: 'name is {{name}}', columns: [{ field: 'name' }], empty: 'Not listed.' },
      { kind: 'table', heading: 'Not it', source: 'register.parts', where: 'name is not {{name}}', columns: [{ field: 'name' }], empty: 'No other part.' },
      { kind: 'capture', heading: 'A thought', register: 'notes', where: 'about is {{spoken}}' },
    ],
  } as never,
};

/** A page per step, which is a list that declares its own order. */
const STEP: Declaration = {
  id: 'page.step',
  kind: 'page',
  body: {
    page: 'step',
    title: '{{what}}',
    for: { register: 'steps' },
    nav: { section: 'Path', order: 10 },
    requires: ['register.steps'],
    blocks: [{ kind: 'note', body: '{{what}}' }],
  } as never,
};

/* THE NAMES THAT BROKE IT, and the words the grammar reads: a comma, both quote marks, `and`, `or`, `not`, and a value
   the grammar has an operator for. */
const NAMES = ['Wax, wick and scent', 'Say "hi", then go', "The maker's mark, first", 'Salt or sugar', 'not now', 'empty', 'More than words'];

async function record(): Promise<{ k: Kernel; sql: NodeSql; parts: { id: string; seq: number | null }[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([PARTS, STEPS, NOTES, PART, STEP]);
  assert.ok(out.ok, JSON.stringify(out));
  const made = (register: string, fields: Record<string, unknown>) => {
    const r = k.create(register, fields, OWNER);
    assert.ok(r.ok, JSON.stringify(r));
    return r.value;
  };
  const parts = NAMES.map((name, i) => {
    const part = made('parts', { name, what: `Part ${i + 1}` });
    made('steps', { what: `First for ${name}`, part: part.id, rank: 2 * i + 2 });
    return part;
  });
  return { k, sql, parts };
}

type Block = { kind: string; heading?: string; rows: { fields: Record<string, unknown> }[]; refusals: { code: string; fix: string }[]; fills?: Record<string, string> };
const blocksOf = (k: Kernel, slug: string): Block[] => {
  const out = k.page(slug);
  assert.ok(out.ok, JSON.stringify(out));
  return (out.value as unknown as { blocks: Block[] }).blocks;
};

/* ── one value ─────────────────────────────────────────────────────────── */

test('A NAME HOLDING A COMMA, A QUOTE, AND, OR OR NOT IS ONE VALUE on its page, and every block filtered by it answers', async () => {
  const { k, sql, parts } = await record();
  for (const [i, name] of NAMES.entries()) {
    const slug = k.pages().find((p) => p.title === name)?.slug;
    assert.ok(slug, `no page for ${name}`);
    const blocks = blocksOf(k, slug);
    for (const b of blocks) assert.deepEqual(b.refusals, [], `${name}: ${b.heading ?? b.kind} was refused`);
    const by = (heading: string) => blocks.find((b) => b.heading === heading)!;
    assert.deepEqual(by('Steps').rows.map((r) => r.fields.what), [`First for ${name}`], name);
    assert.deepEqual(by('Itself').rows.map((r) => r.fields.name), [name], name);
    assert.equal(by('Not it').rows.length, NAMES.length - 1, name);
    /* THE PROSE IS THE NAME AS WRITTEN: quoting is the filter's, never a heading's. */
    assert.equal(blocks[0]!.heading, name);
    assert.equal((blocks[0] as unknown as { body: string }).body, `About ${name}.`);
    assert.ok(parts[i]);
  }
  sql.close();
});

test('A PLAIN NAME IS WRITTEN BARE, so the filters a page prints back are the ones it always printed', () => {
  const filled = fill({ where: 'part is {{name}}', heading: '{{name}}' }, { id: 'x', register: 'parts', seq: 1, fields: { name: 'The box' } } as never) as Record<string, string>;
  assert.equal(filled.where, 'part is The box');
  const odd = fill({ where: 'part is {{name}}', heading: '{{name}}' }, { id: 'x', register: 'parts', seq: 1, fields: { name: 'Wax, wick and scent' } } as never) as Record<string, string>;
  assert.equal(odd.where, 'part is "Wax, wick and scent"');
  assert.equal(odd.heading, 'Wax, wick and scent');
});

test('A PARAMETER IS ONE VALUE TOO: a figure over one part, named with a comma, counts that part', () => {
  const filled = fill({ metric: 'm', where: 'part is {{it}}, done is no' }, null, 'Wax, wick and scent') as { where: string; within: string };
  assert.equal(filled.where, 'part is "Wax, wick and scent", done is no');
  assert.equal(filled.within, 'part is "Wax, wick and scent"');
});

test('THE GRAMMAR READS BACK EVERY VALUE `quoteValue` WRITES, as exactly that one value, beside another clause', () => {
  const schema: Schema = { register: 'parts', fields: { name: { type: 'text' }, n: { type: 'int' } } };
  const deps = { nowMs: NOW };
  const odd = [...NAMES, 'a "b" c', '“curly”, too', "it's 'quoted', twice", 'x" , y', ' padded ', 'is not', 'or'];
  for (const v of odd) {
    const said = parseWhere(`name is ${quoteValue(v)}, n is 1`, schema, deps);
    assert.deepEqual(said.bad, [], v);
    assert.deepEqual(said.predicate, { all: [{ field: 'name', is: v }, { field: 'n', is: 1 }] }, v);
    const not = parseWhere(`name is not ${quoteValue(v)}`, schema, deps);
    assert.deepEqual(not.predicate, { field: 'name', not: v }, v);
  }
});

/* ── a capture presets a link ──────────────────────────────────────────── */

test('A CAPTURE PRESETS A LINK named by its spoken id or its row id, and never one named by a title', async () => {
  const { k, sql, parts } = await record();
  const [wax] = parts;
  const slug = k.pages().find((p) => p.title === NAMES[0])!.slug;
  const capture = blocksOf(k, slug).find((b) => b.kind === 'capture')!;
  assert.deepEqual(capture.fills, { about: wax!.id }, 'the pad on a part page does not preset which part a note is about');

  const read = (where: string) => k.block({ kind: 'capture', register: 'notes', where } as never) as unknown as Block;
  assert.deepEqual(read(`about is ${wax!.id}`).fills, { about: wax!.id });
  assert.deepEqual(read(`part is parts#${wax!.seq}, mood is calm`).fills, { part: wax!.id, mood: 'calm' });
  /* A TITLE IS A GUESS AT A ROW, and a note written under it would be stored against whichever row the title found. */
  const titled = read('part is "Wax, wick and scent", mood is busy');
  assert.deepEqual(titled.refusals, []);
  assert.deepEqual(titled.fills, { mood: 'busy' });
  /* AND A SET IS NOT ONE ROW. */
  assert.deepEqual(read(`part is parts#1 or parts#2`).fills, {});
  sql.close();
});

/* ── a template's pages keep their order ───────────────────────────────── */

test("A TEMPLATE'S PAGES KEEP THE ORDER THE ROWS WERE WRITTEN IN, however recently one of them was edited", async () => {
  const { k, sql, parts } = await record();
  const titles = () => k.pages().filter((p) => p.nav?.section === 'Launch').map((p) => p.title);
  assert.deepEqual(titles(), NAMES);
  assert.ok(k.update('parts', parts[0]!.id, { what: 'Edited last' }, OWNER).ok);
  assert.ok(k.update('parts', parts[3]!.id, { what: 'Edited too' }, OWNER).ok);
  assert.deepEqual(titles(), NAMES, 'editing a part moved its tab');
  sql.close();
});

test("A TEMPLATE OVER A LIST OF STEPS KEEPS THE LIST'S OWN ORDER, and a step with no rank comes after the ranked ones", async () => {
  const { k, sql } = await record();
  const part = k.create('parts', { name: 'Late' }, OWNER);
  assert.ok(part.ok);
  assert.ok(k.create('steps', { what: 'Unranked', part: part.value.id }, OWNER).ok);
  assert.ok(k.create('steps', { what: 'Ranked first', part: part.value.id, rank: 1 }, OWNER).ok);
  const titles = k.pages().filter((p) => p.nav?.section === 'Path').map((p) => p.title);
  assert.deepEqual(titles, ['Ranked first', ...NAMES.map((n) => `First for ${n}`), 'Unranked']);
  sql.close();
});
