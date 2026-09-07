/**
 * Why a block is blank, which is the half the product never said.
 *
 * `empty:` reached the screen for `table` and for nothing else, so fifteen of the sixteen kinds drew
 * a heading over a blank rectangle. Three different things look identical when they are drawn that
 * way — the filter was not understood, the declaration contradicts itself, and the honest answer was
 * nothing — and only the third is not a fault. A reader who cannot tell them apart learns to
 * distrust every empty block on the page, including the ones that are right.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { draw, saidPlainly, toSegments } from './blocks.ts';
import { page } from './api.ts';
import { PAGES } from './data.ts';
import { KINDS } from 'braindog-render';
import type { BlockResult } from './api.ts';
import type { PageBlock } from './schema.ts';

/**
 * A block bound to a register, with whatever the test wants to change about it.
 *
 * `drop` rather than passing `undefined`: under `exactOptionalPropertyTypes` an optional property
 * set to `undefined` is not the same as an absent one, and it is the absent one being tested.
 */
const bound = (over: Partial<BlockResult> = {}, drop: (keyof BlockResult)[] = []): BlockResult => {
  // A table bound to a REGISTER: the money page's first one is the cash walk, which is bound to the
  // forecast and carries no register at all.
  const block = page('money')?.blocks.find((b) => b.kind === 'table' && b.register);
  assert.ok(block, 'the money page has no register-bound table to build on');
  const merged = { ...block, ...over } as Record<string, unknown>;
  for (const key of drop) delete merged[key as string];
  return merged as BlockResult;
};

/* ── a filter that was not understood ────────────────────────────────────── */

test('A BLOCK THAT COULD NOT READ ITS FILTER SAYS SO, AND QUOTES THE CLAUSE', () => {
  // `compile()` has always produced the sentence. Nothing carried it to the screen, so an agent
  // wrote `state is not done` against a register with no `done`, got a page that rendered, and had
  // no way to find out that every figure on it was about no rows at all.
  const { refusal } = draw(bound({ where: 'state is not done', refusals: ['state is not done — state has no value done'] }));
  assert.ok(refusal);
  assert.equal(refusal.kind, 'error', 'a broken filter is not the same state as an empty answer');
  assert.deepEqual(refusal.lines, ['state is not done — state has no value done']);
});

test('several bad clauses are several lines, because they are separate facts', () => {
  const { refusal } = draw(bound({ refusals: ['a — one', 'b — two'] }));
  assert.equal(refusal?.lines?.length, 2);
});

test('a filter that WAS understood and matched nothing is not an error', () => {
  const { refusal } = draw(bound({ rows: [], entries: [], matched: [], refusals: [], empty: 'You owe nobody anything.' }));
  assert.ok(refusal);
  assert.equal(refusal.kind, 'no-results');
  assert.equal(refusal.title, 'You owe nobody anything.', "the author's own sentence is the right words");
});

test('and a block with no `empty:` still says something rather than nothing', () => {
  const { refusal } = draw(bound({ rows: [], entries: [], matched: [], refusals: [] }, ['empty']));
  assert.ok(refusal?.title);
});

/* ── the contradiction ───────────────────────────────────────────────────── */

test('a source AND authored rows is refused out loud, not resolved quietly', () => {
  const { refusal, segments } = draw(bound({ authored: [{ cells: ['a', 'b'] }] }));
  assert.equal(refusal?.kind, 'error');
  assert.equal(segments.length, 0);
  assert.match(refusal?.body ?? '', /source|authored/);
});

/* ── all sixteen, not one ────────────────────────────────────────────────── */

test('EVERY KIND GETS THE SURFACE, which is the whole defect', () => {
  // `table` had it. The other fifteen drew a heading and a blank rectangle.
  for (const kind of Object.keys(KINDS)) {
    const { refusal } = draw(
      bound({ kind, rows: [], entries: [], matched: [], refusals: [], empty: 'Nothing matched.' }, ['authored', 'body', 'metrics']),
    );
    assert.ok(refusal, `${kind} drew nothing and said nothing`);
    assert.equal(refusal.kind, 'no-results', `${kind} reported an empty answer as a fault`);
  }
});

test('a block that HAS something to draw refuses nothing', () => {
  for (const block of page('money')?.blocks ?? []) {
    const { refusal, segments } = draw(block);
    if (refusal) continue;
    const drawn = block.kind === 'table' ? block.rows.length : segments.some((s) => s.type !== 'block' || s.rows.length > 0);
    assert.ok(drawn, `${block.heading} drew nothing and reported no reason`);
  }
});

test('the seeded pages refuse nothing at all, so no page ships a broken declaration', () => {
  for (const slug of ['money', 'estate', 'kiln']) {
    for (const block of page(slug)?.blocks ?? []) {
      assert.deepEqual(block.refusals, [], `${slug}: ${block.heading} has a filter the evaluator cannot read`);
      assert.notEqual(draw(block).refusal?.kind, 'error', `${slug}: ${block.heading} is a broken declaration`);
    }
  }
});

/* ── what the declaration said that this build does not read ─────────────── */

/**
 * The declaration is JSON from a pack somebody else wrote, so these are not type errors — they are
 * things an agent writes because `docs/` says to write them, and every one of them used to come back
 * as an empty block. That is the state reserved for "it asked and the answer was nothing", which
 * makes a documented feature that does not exist look like a register that is empty.
 */
const declared = (over: Record<string, unknown>): BlockResult => {
  const base = page('money')?.blocks.find((b) => b.kind === 'table' && b.register);
  assert.ok(base);
  const decl = PAGES.money?.blocks.find((b) => b.heading === base.heading);
  assert.ok(decl);
  const was = { ...decl };
  Object.assign(decl, over);
  try {
    const out = page('money')?.blocks.find((b) => b.heading === base.heading);
    assert.ok(out);
    return out;
  } finally {
    for (const key of Object.keys(over)) delete (decl as Record<string, unknown>)[key];
    Object.assign(decl, was);
  }
};

test('A `where:` WRITTEN AS THE PREDICATE TREE THE DOCS SHOW DOES NOT BLANK THE PAGE', () => {
  // `06-PAGES` §1.1 types `where` as a predicate and §1's worked example writes it as a tree;
  // `21-AUTHORING` §4.5 says the sentence is the read-only restatement. An agent following either
  // one is following the documentation. The tree arrived as an object, `.split` threw, and the
  // throw took every other block on the page with it — against the page route's own stated
  // invariant that six queries are six independent failures.
  const block = declared({ where: { all: [{ field: 'state', in: ['open'] }] } });
  assert.ok(block.refusals.length, 'the tree was accepted');
  assert.match(block.refusals[0] ?? '', /sentence/);
  assert.equal(draw(block).refusal?.kind, 'error');
  // And the rest of the page survived.
  const others = (page('money')?.blocks ?? []).filter((b) => b.heading !== block.heading);
  assert.ok(others.length > 3);
  assert.ok(others.some((b) => b.rows.length > 0 || b.metrics?.length), 'one bad block blanked the page');
});

test('a block that throws becomes a block that refuses, whatever threw', () => {
  const block = declared({ cells: 'not an array' });
  assert.ok(block.refusals.length, 'a throw was swallowed instead of being reported');
  assert.equal(draw(block).refusal?.kind, 'error');
});

test('a `source:` that resolves to nothing says which prefixes do', () => {
  // `06-PAGES` §1.1 documents `metric.<id>` and `block.<n>`; neither is implemented, and both used
  // to draw the author's own "nothing matched" sentence.
  for (const source of ['metric.overdue', 'block.0', 'nonsense']) {
    const block = declared({ source });
    assert.ok(block.refusals.some((r) => r.startsWith('source:')), `${source} was accepted`);
    assert.match(block.refusals.join(' '), /register\.<id>/);
  }
});

test('a misspelt column is named, the way a misspelt field in `where:` already was', () => {
  const block = declared({ columns: [{ field: 'amounnt' }, { field: 'what' }] });
  assert.ok(block.refusals.some((r) => r.includes('amounnt')), 'a column named a field that does not exist');
});

test('`seq` is a column even though no register declares it', () => {
  // It is on the row rather than in its fields, and `toRows` renders it as `#4`. Every seeded page
  // uses it, so getting this wrong refuses four real blocks.
  const block = declared({ columns: [{ field: 'seq' }, { field: 'what' }] });
  assert.deepEqual(block.refusals, []);
});

test('A BLOCK DRAWS ONLY WHEN ITS CONDITION IS TRUE, which is what `when:` is for', () => {
  /* `when:` is in `06-PAGES` §1.1 and was read nowhere, so a note the doc's own worked example
     writes — one that does not render when the figure is zero — drew every time. A permanent alarm
     is an alarm nobody reads. */
  assert.equal(declared({ when: { metric: 'overdue', gt: 0 } }).drawn, true, 'the seed has overdue rows');
  assert.equal(declared({ when: { metric: 'overdue', lt: 0 } }).drawn, false);

  // A figure nobody declared, and a condition with no test in it, are both "do not draw": the
  // block's condition is unknown, and drawing on an unknown is guessing.
  assert.equal(declared({ when: { metric: 'nothing-declared', gt: 0 } }).drawn, false);
  assert.equal(declared({ when: { metric: 'overdue' } }).drawn, false);

  // And it is a key the reader knows about now, so it is not reported as one it cannot read.
  assert.deepEqual(declared({ when: { metric: 'overdue', gt: 0 } }).refusals, []);
});

/* ── a bound `todo` has a tick ───────────────────────────────────────────── */

test('A REGISTER-BOUND `todo` CAN SHOW A TICK, and it comes from the register', () => {
  // `todo` and the parser have always read `[ ]` and `[x]` at the head of a line; the projection
  // never wrote one, so a bound todo drew a list with no checkboxes at all and no way to tell a
  // finished row from an open one. Nothing was added to the declaration: a register already says
  // which of its states are terminal, in `done:`.
  const rows = (where: string) => {
    const decl = { kind: 'todo', heading: 'T', span: 3, source: 'register.tasks', columns: [{ field: 'what' }, { field: 'by' }], where, limit: 4, empty: 'x' };
    /* `blocks` is `readonly` on the declaration and this is a mock whose seed is module state, so
       the cast is the honest way to add one for the length of a test. */
    const blocks = PAGES.money?.blocks as PageBlock[] | undefined;
    assert.ok(blocks);
    blocks.push(decl as unknown as PageBlock);
    try {
      const block = page('money')?.blocks.at(-1);
      assert.ok(block);
      return toSegments(block).flatMap((s) => ('rows' in s ? (s.rows as { cells: string[]; done?: boolean }[]) : []));
    } finally {
      blocks.pop();
    }
  };

  const done = rows('state is done');
  assert.ok(done.length > 0, 'the seed needs a finished task for this to mean anything');
  for (const r of done) assert.equal(r.done, true, `${r.cells[0]} is done and is drawn unticked`);

  const open = rows('state is open');
  assert.ok(open.length > 0);
  for (const r of open) assert.equal(r.done, false, `${r.cells[0]} is open and is drawn ticked`);

  // And the tick is not left in the text.
  for (const r of [...done, ...open]) assert.ok(!r.cells[0]?.startsWith('['), `${r.cells[0]} kept its brackets`);
});

/* ── day one, which is the state that could never be reached ─────────────── */

const EMPTY_LIST = { rows: 0, name: 'Obligations', holds: 'money owed either way' };

test('AN EMPTY LIST IS `no-data-yet` EVEN THOUGH THE AUTHOR WROTE AN `empty:`', () => {
  /* THE ORDER USED TO BE THE OTHER WAY ROUND, and `empty:` is MANDATORY on every source-bound block
     (06 §1.1, `schema.ts`, and `arrange.test.ts` asserts it) — so the check for it always passed and
     `no-data-yet` was unreachable from a declared page. Across forty-two routes of the seeded
     record, four of the five states `19 §6` requires be told apart rendered zero times.

     And the author's sentence is WRONG on that day, not merely less specific: "You owe nobody
     anything" is a claim about a filter that ran, and on a list that has never held a row none did. */
  const { refusal } = draw(
    bound({ rows: [], entries: [], matched: [], refusals: [], where: 'state is open', empty: 'You owe nobody anything.' }),
    EMPTY_LIST,
  );
  assert.equal(refusal?.kind, 'no-data-yet', 'the author’s sentence outranked the fact');
  assert.equal(refusal?.title, 'Nothing in Obligations yet.');
  assert.equal(refusal?.body, 'Obligations holds money owed either way.', '19 §6: be specific about what will be here');
});

test('and it carries the one action `19 §6` gives that state', () => {
  const add = { href: '/r/obligations?new=1', label: 'Add the first row' };
  const { refusal } = draw(
    bound({ rows: [], entries: [], matched: [], refusals: [], where: 'state is open' }),
    { ...EMPTY_LIST, add },
  );
  assert.deepEqual(refusal?.action, add, 'the state whose whole point is that somebody can act had no way to');
  /* A REAL ADDRESS, because `13 §5.2` asks the CTA to be a link or button "so it joins the tab
     order" — and because the form lives on another route, which a block cannot open from here. */
  assert.match(refusal?.action?.href ?? '', /^\/r\/[a-z_]+\?new=1$/);
});

test('a surface with nowhere to send anybody offers no button rather than a dead one', () => {
  /* The shared page: read-only, scoped to one page, no list to open. It still gets the right STATE,
     because a reader with no account is not owed less of the truth than one with. */
  const { refusal } = draw(bound({ rows: [], entries: [], matched: [], refusals: [], where: 'state is open' }), EMPTY_LIST);
  assert.equal(refusal?.kind, 'no-data-yet');
  assert.equal(refusal?.action, undefined);
});

test('AN UNFILTERED BLOCK KEEPS THE AUTHOR’S SENTENCE, because it is about this state', () => {
  /* A block with no `where:` draws every row its list holds, so it can only be empty when the list
     is — which makes `no-results` unreachable for it and its `empty:` a day-one sentence whether the
     author meant it that way or not. Three in the seed are exactly that: "Nobody yet." and "Nothing
     here yet." twice. Deriving over them would leave three written sentences rendering nowhere. */
  const { refusal } = draw(
    bound({ rows: [], entries: [], matched: [], refusals: [], empty: 'Nobody yet.' }, ['where']),
    { rows: 0, name: 'People' },
  );
  assert.equal(refusal?.kind, 'no-data-yet', 'the kind is decided by the count, not by the wording');
  assert.equal(refusal?.title, 'Nobody yet.');
});

test('a list that HAS rows and matched none is still the filter’s answer', () => {
  /* The case the author wrote the sentence for, and the one that must not change. */
  const { refusal } = draw(
    bound({ rows: [], entries: [], matched: [], refusals: [], where: 'state is open', empty: 'You owe nobody anything.' }),
    { rows: 38, name: 'Obligations' },
  );
  assert.equal(refusal?.kind, 'no-results');
  assert.equal(refusal?.title, 'You owe nobody anything.');
  assert.equal(refusal?.action, undefined, 'the way out of a filter is the filter already on screen');
});

/* ── and the query the empty state quotes ────────────────────────────────── */

test('THE QUOTED QUERY IS THE READER’S WORDS, not the column’s', () => {
  /* `19 §6` asks a `no-results` state to quote the query verbatim, and the register quoted
     `whereOf(filters)` — the sentence the EVALUATOR reads, which spells the stored value. So a
     reader who pressed a chip labelled "owed to me" was shown `direction is owed_to_me` and asked to
     check a filter in a spelling they had never seen. */
  assert.equal(saidPlainly('obligations', 'direction is owed_to_me'), 'direction is owed to me');
  assert.equal(saidPlainly('obligations', 'state is paid'), 'state is paid');
  /* A relative day becomes the phrase, for the same reason: `+30d` is not something anybody typed. */
  assert.equal(saidPlainly('services', 'renews before +30d'), 'renews before 30 days from now');
  /* And a field the register does not declare passes through rather than being invented. */
  assert.equal(saidPlainly('obligations', 'nonsense is x'), 'nonsense is x');
});
