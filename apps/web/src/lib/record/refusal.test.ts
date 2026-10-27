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
import { page, readBlock } from './fixtures/readers.ts';
import { KINDS } from 'braindog-render';
import type { BlockResult } from './api.ts';
import type { PageBlock } from './schema.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';

/**
 * A block bound to a register, with whatever the test wants to change about it.
 *
 * `drop` rather than passing `undefined`: under `exactOptionalPropertyTypes` an optional property
 * set to `undefined` is not the same as an absent one, and it is the absent one being tested.
 */
/**
 * WHAT MOVED AS A TABLE, READ BY HAND. Money-core 3.3.0 draws it as a calm list (`timeline`) and the page holds no
 * plain register table any more, so the table this file's `where:`, `seq` and misspelt-column cases mean is declared
 * here as the page declared it before, and the record reads it on its own (`readBlock`).
 */
const WHAT_MOVED = {
  kind: 'table',
  heading: 'What moved',
  span: 12,
  source: 'register.transactions',
  where: 'state is not void',
  columns: [
    { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
    { field: 'account', label: 'Account', width: 'minmax(10ch,16ch)' },
    { field: 'category', label: 'For', width: 'minmax(8ch,14ch)' },
    { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'out' } },
    { field: 'on', label: 'Date', width: '13ch', align: 'end' },
  ],
  order: [{ field: 'on', dir: 'desc' }],
  limit: 10,
  empty: 'Nothing has moved yet. Add what left the bank and this page starts from it.',
};
let movedRead: BlockResult | undefined;

const bound = (over: Partial<BlockResult> = {}, drop: (keyof BlockResult)[] = []): BlockResult => {
  const block = (movedRead ??= readBlock(WHAT_MOVED as unknown as PageBlock));
  assert.ok(block.register, 'What moved names no list to build on');
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
    /* A CAPTURE READS NO ROWS, so there is no empty answer for it to report: it draws its field, or
       the one line naming its list when the host cannot write (`packages/render/src/capture.ts`).
       A "Nothing matched." under an input would be a claim about rows it never asked for.

       SO IT IS HELD TO ITS OWN ANSWER HERE RATHER THAN SKIPPED. The skip was right while `draw()` had
       no capture branch, and it hid what `draw()` gave it then: a fence with no rows, which the parser
       degraded with "no into row" on every page that declared one (`capture-wire.test.ts`). Now the
       answer is the list the block names and no refusal, and this says so. */
    if (kind === 'capture') {
      /* THE LIST THE BLOCK NAMES, whichever that is: the money page's first list-bound table read Bills and invoices
         until money-core 3.0.0 and reads what moved since, and the capture names whatever list it was built on. */
      const base = bound({ kind, rows: [], entries: [], matched: [], refusals: [], empty: 'Nothing matched.' }, ['authored', 'body', 'metrics']);
      assert.ok(base.register, 'the block this is built on names no list');
      const { refusal, segments } = draw(base);
      assert.equal(refusal, null, 'a capture reported an empty answer about rows it never read');
      assert.deepEqual(
        segments.map((s) => (s.type === 'block' ? [s.kind, s.rows[0]?.cells[0], s.rows[0]?.cells[1]] : s.type)),
        [['capture', 'into', base.register]],
      );
      continue;
    }
    /* A FORM READS NO ROWS EITHER: it asks a few questions and adds one row, and its page kind draws its fields
       (`$lib/page/kinds/form.ts`). A "Nothing matched." over its questions would be a claim about rows it never read. */
    if (kind === 'form') {
      const { refusal } = draw(bound({ kind, rows: [], entries: [], matched: [], refusals: [], empty: 'Nothing matched.' }, ['authored', 'body', 'metrics']));
      assert.equal(refusal, null, 'a form reported an empty answer about rows it never read');
      continue;
    }
    /* A PROJECT'S SHAPE READS NO ROWS EITHER: its host draws its parts from the project the page is about
       (`$lib/page/kinds/project.ts`), so an empty answer is no claim about rows. */
    if (kind === 'project') {
      const { refusal } = draw(bound({ kind, rows: [], entries: [], matched: [], refusals: [], empty: 'Nothing matched.' }, ['authored', 'body', 'metrics']));
      assert.equal(refusal, null, 'a project block reported an empty answer about rows it never read');
      continue;
    }
    /* AN EMPTY ANSWER COUNTS NOTHING TOO: a section is drawn by its count, which the record sends without the rows. */
    const { refusal } = draw(
      bound({ kind, rows: [], entries: [], matched: [], shown: 0, total: 0, refusals: [], empty: 'Nothing matched.' }, ['authored', 'body', 'metrics']),
    );
    assert.ok(refusal, `${kind} drew nothing and said nothing`);
    assert.equal(refusal.kind, 'no-results', `${kind} reported an empty answer as a fault`);
  }
});

test('a block that HAS something to draw refuses nothing', () => {
  /* THIS USED TO RECOMPUTE `draw()`'s OWN PREDICATE AND COULD NOT FAIL. The `drawn` expression was
     character for character the test `draw()` applies to decide whether to hand back a refusal, so
     `if (refusal) continue` guaranteed the assertion under it: a tautology dressed as a check, on
     the one claim that matters here.

     WHAT IT ASKS NOW IS ABOUT THE BLOCK, not about the function. A block carries its own evidence -
     rows for a table, readings for a stat, a walk for a forecast, fenced text for everything else -
     and that evidence exists or it does not, independently of anything `draw()` believes. The two
     answers disagreeing is exactly the defect worth catching. */
  let asked = 0;
  for (const block of page('money')?.blocks ?? []) {
    /* A block whose `when:` is false is not on the page, and holds nothing on purpose: Add an account, once there is one. */
    if (block.drawn === false) continue;
    if (block.kind === 'section') continue;
    const { refusal } = draw(block);
    if (refusal) continue;
    asked += 1;
    /* Every key a block can carry its content in: a table has rows, a chips or bar block has
       entries, a stat has its read metrics, a forecast has a walk, a series has its bars, a queue its questions, a
       capture the list it writes into, a kind drawn from the record's own answer (a calendar) the rows in that answer,
       a progress over two figures by plan the tracks it was handed as authored rows (Money's Instalments),
       and everything else has the fenced text it was written with. */
    const held = block as unknown as Record<string, unknown>;
    const many = (key: string) => Array.isArray(held[key]) && (held[key] as unknown[]).length > 0;
    const drawn =
      many('rows') ||
      many('entries') ||
      many('metrics') ||
      many('readings') ||
      many('authored') ||
      many('queue') ||
      (held.kind === 'capture' && typeof held.register === 'string' && held.register !== '') ||
      ((held.answer as { rows?: unknown[] } | undefined)?.rows?.length ?? 0) > 0 ||
      ((held.walk as { steps?: unknown[] } | undefined)?.steps?.length ?? 0) > 0 ||
      ((held.bars as { keys?: unknown[] } | undefined)?.keys?.length ?? 0) > 0 ||
      ((held.parts as { groups?: unknown[] } | undefined)?.groups?.length ?? 0) > 0 ||
      String(held.body ?? '').trim() !== '';
    assert.ok(drawn, `${block.heading} refused nothing and holds nothing to draw`);
  }
  assert.ok(asked > 0, 'every block on the money page refused, so the loop above asserted nothing');
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
/**
 * What moved, as a table the record reads, declared with `over` on top.
 *
 * THE RECORD READS THE DECLARATION, AND IT CANNOT BE WRITTEN TO HERE. This changed the sample's `PAGES` and read the
 * page back, which reached the browser's page expander; now the fixture's `page` asks a kernel seeded once and
 * never written to, so the change reached nothing. The record's `block`, which reads one declaration without a page
 * around it (`readBlock` in `fixtures/readers.ts`), is handed the changed declaration instead.
 */
const declared = (over: Record<string, unknown>): BlockResult => readBlock({ ...WHAT_MOVED, ...over } as unknown as PageBlock);

test('A `where:` WRITTEN AS THE PREDICATE TREE THE DOCS SHOW DOES NOT BLANK THE PAGE', () => {
  // `06-PAGES` §1.1 types `where` as a predicate and §1's worked example writes it as a tree;
  // `21-AUTHORING` §4.5 says the sentence is the read-only restatement. An agent following either
  // one is following the documentation. The tree arrived as an object, `.split` threw, and the
  // throw took every other block on the page with it — against the page route's own stated
  // invariant that six queries are six independent failures.
  /* THE RECORD READS THE TREE (`where: Predicate | string`), where the browser refused it for not being a
     sentence. So a tree over values the list holds draws its rows, and one naming a value it does not hold is refused
     on its own block in the record's words, the page around it drawn. */
  const read = declared({ where: { all: [{ field: 'state', in: ['cleared'] }] } });
  assert.deepEqual(read.refusals, [], 'a tree the documentation shows was refused');
  assert.ok(read.rows.length > 0, 'the tree matched nothing, so this asks nothing');
  const block = declared({ where: { all: [{ field: 'state', in: ['nowhere'] }] } });
  assert.ok(block.refusals.length, 'a tree naming a value the list does not hold was accepted');
  assert.match(block.refusals[0] ?? '', /nowhere/);
  assert.equal(draw(block).refusal?.kind, 'error');
  // And the rest of the page survived.
  const others = (page('money')?.blocks ?? []).filter((b) => b.heading !== WHAT_MOVED.heading);
  assert.ok(others.length > 3);
  assert.ok(others.some((b) => b.rows.length > 0 || b.metrics?.length), 'one bad block blanked the page');
});

test('a block that throws becomes a block that refuses, whatever threw', () => {
  let block: BlockResult;
  try {
    block = declared({ cells: 'not an array' });
  } catch (e) {
    assert.fail(`the record threw instead of refusing the block: ${String(e)}`);
  }
  assert.ok(block.refusals.length, 'a throw was swallowed instead of being reported');
  assert.equal(draw(block).refusal?.kind, 'error');
});

test('a `source:` that resolves to nothing says it is not one the record reads', () => {
  // `06-PAGES` §1.1 documents `metric.<id>` and `block.<n>`. `block.<n>` is not implemented, and used to draw the
  // author's own "nothing matched" sentence; `metric.<id>` is read by a bar or a split only, and says so on a table.
  /* IN THE RECORD'S WORDS, which name the source and do not list the prefixes the browser's sentence did. */
  assert.match(declared({ source: 'metric.overdue' }).refusals.join(' '), /a bar or a split does/u);
  for (const source of ['block.0', 'nonsense']) {
    const block = declared({ source });
    assert.ok(block.refusals.some((r) => r.startsWith(source)), `${source} was accepted`);
    assert.match(block.refusals.join(' '), /is not a source this record reads/u);
    assert.equal(draw(block).refusal?.kind, 'error');
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
    /* READ BY THE RECORD AS ONE BLOCK, since the sample's `PAGES` no longer reach the page it draws. */
    const block = readBlock(decl as unknown as PageBlock);
    return toSegments(block).flatMap((s) => ('rows' in s ? (s.rows as { cells: string[]; done?: boolean }[]) : []));
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
  /* An empty list says who fills it (the night's empty states: the agent), where it used to say what the list holds. */
  assert.equal(refusal?.body, 'Your agent fills this as it works.', '19 §6: say what will be here and who puts it there');
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
     reader who pressed a chip labelled "Money in" was shown `direction is owed_to_me` and asked to
     check a filter in a spelling they had never seen. */
  /* `which way`, WHICH IS WHAT THE COLUMN IS CALLED NOW. The printer reads `decl.label`, so the
     sentence follows the label rather than the field id: that is the whole mechanism, and it means
     a pack that renames a field renames every filter sentence about it. */
  assert.equal(saidPlainly('obligations', 'direction is owed_to_me'), 'which way is Money in');
  /* `status is paid` AND IT WAS `state is paid`, WHICH IS THE MECHANISM WORKING RATHER THAN
     BREAKING. This field carried no label, so it stood here as the case where the sentence and
     the field id are the same string. Five registers headed the column `State` while `things`
     headed its own `Status`, so all six carry `label: 'Status'` now and every filter sentence
     about the field followed without a line of printer code changing — which is exactly what
     "a pack that renames a field renames every filter sentence about it" means. */
  /* AND THE VALUE IS ITS LABEL, `Paid`, since money-core 3.0.0 labels the enum's values: the same mechanism, one word on. */
  assert.equal(saidPlainly('obligations', 'state is paid'), 'status is Paid');
  /* AND A FIELD THAT STILL CARRIES NO LABEL IS STILL ITS OWN ID, which is the half the line above
     used to hold on its own: `labelOf` falls back to the id with its underscores taken out. */
  assert.equal(saidPlainly('obligations', 'note is x'), 'note is x');
  /* A relative day becomes the phrase, for the same reason: `+30d` is not something anybody typed. */
  assert.equal(saidPlainly('services', 'renews before +30d'), 'renews before 30 days from now');
  /* And a field the register does not declare passes through rather than being invented. */
  assert.equal(saidPlainly('obligations', 'nonsense is x'), 'nonsense is x');
});
