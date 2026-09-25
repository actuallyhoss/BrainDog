/**
 * `, or` between conditions, in the browser's engine, held against the record over the seed.
 *
 * THE RECORD LEARNED IT IN `packages/where/src/sentence.ts` AND THIS FILE IS THE OTHER HALF. Before
 * either did, `state is open, or due before today` was refused on both sides for naming a field called
 * `or` (`loop/research-m4-wave-two.md`, brief 7), so "open or overdue" over the obligations could not be
 * put to a page, a tile or a view in the words they are all written in.
 *
 * THE OR-GROUP IS NOT A FLAG OVER `clauses`, AND THIS FILE HOLDS THE READERS THAT SAY WHY. `clauses`
 * is read as a conjunction by nine lines outside `where.ts`, and three of them would say something
 * wrong about an "or": a window's end added into it (`endedAt`), one disjunct taken for a block's
 * project, a new row filled from both sides. So the group is `any`, beside `clauses`, which `matches`
 * reads and those lines do not, and the two in `metrics.ts` that would call a dated group undated read
 * it too. The record is driven, not described, as `where-compare.test.ts` drives it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { fill, openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import { NOW, ROWS } from './fixtures/sample.ts';
import { saidPlainly } from './blocks.ts';
import { read as readAt, withParam } from './metrics.ts';
import { compile, matches, registerHref } from './where.ts';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';
/* THE SAMPLE'S ROWS READ AT THE SAMPLE'S CLOCK, which `read` took for granted and now takes from its caller. */
const read: typeof readAt = (decl, now = NOW) => readAt(decl, now);

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

type Answer = { refused: string | null; seqs: number[] };

const askRecord = async (register: string, where: string): Promise<Answer> => {
  const k: Kernel = await record;
  const out = k.list({ register, where, limit: 500 });
  if (!out.ok) return { refused: 'refusal' in out ? out.refusal.fix : 'a conflict, which a read cannot give', seqs: [] };
  return { refused: null, seqs: out.value.rows.map((r) => r.seq ?? -1).sort((a, b) => a - b) };
};

const askBrowser = (register: string, sentence: string): Answer => {
  const w = compile(register, sentence);
  return w.bad.length
    ? { refused: w.bad[0] ?? '', seqs: [] }
    : { refused: null, seqs: (ROWS[register] ?? []).filter((e) => matches(e, w, NOW)).map((e) => e.seq).sort((a, b) => a - b) };
};

async function agree(register: string, sentence: string): Promise<Answer> {
  const theirs = await askRecord(register, sentence);
  const ours = askBrowser(register, sentence);
  assert.equal(
    ours.refused === null,
    theirs.refused === null,
    `${register}: "${sentence}": the record ${theirs.refused === null ? 'answered' : `refused: ${theirs.refused}`}, the browser ${ours.refused === null ? 'answered' : `refused: ${ours.refused}`}`,
  );
  assert.deepEqual(ours.seqs, theirs.seqs, `${register}: "${sentence}" drew different rows`);
  return theirs;
}

const seqsWhere = (register: string, sentence: string): number[] => askBrowser(register, sentence).seqs;

/* ── the probe ───────────────────────────────────────────────────────────── */

test('THE PROBE: open or overdue is the union of the two, in both engines, as the same rows', async () => {
  const said = await agree('obligations', 'state is open, or due before today');
  assert.equal(said.refused, null);
  /* THE UNION AND NOT EITHER HALF, measured on the seed: 24 open, 14 overdue, 3 both. */
  const open = seqsWhere('obligations', 'state is open');
  const overdue = seqsWhere('obligations', 'due before today');
  const union = [...new Set([...open, ...overdue])].sort((a, b) => a - b);
  assert.deepEqual(said.seqs, union);
  assert.ok(said.seqs.length > open.length && said.seqs.length > overdue.length, 'the group drew no more than one of its halves');
});

test('THE SHAPE: `clauses` stays the conjunction and the or-group is `any`, one condition to a member', () => {
  const w = compile('obligations', 'state is open, or due before today');
  assert.deepEqual(w.bad, []);
  assert.deepEqual(w.clauses, [], 'an or-group leaked into the list every other reader takes as a conjunction');
  assert.deepEqual(w.any, [
    [{ field: 'state', op: 'is', values: ['open'] }],
    [{ field: 'due', op: 'before', day: 'today' }],
  ]);
  /* AND A SENTENCE WITH NO `or` HAS NO GROUP AT ALL, so nothing that reads `clauses` today sees a change. */
  assert.equal(compile('obligations', 'state is open, due before today').any, undefined);
  /* A RANGE OF DAYS IS TWO CLAUSES HERE, so it is one member of the group holding both ends. */
  assert.deepEqual(compile('obligations', 'due between today and +30d, or state is part').any, [
    [
      { field: 'due', op: 'gte', day: 'today' },
      { field: 'due', op: 'lte', day: '+30d' },
    ],
    [{ field: 'state', op: 'is', values: ['part'] }],
  ]);
});

test('EVERY OR-GROUP OVER THE SEED admits the same rows in both engines', async () => {
  for (const [register, sentence] of [
    ['obligations', 'state is open, or due before today'],
    ['obligations', 'state is open, OR due before today'],
    ['obligations', 'state is not open, or due after +7d'],
    ['obligations', 'due between today and +30d, or state is part'],
    ['obligations', 'amount at least GBP 2400, or what contains rent'],
    ['obligations', 'state is paid or part, or due is empty'],
    ['obligations', 'Status is open, or Paid on is set'],
    ['installments', 'number at least 10, or number at most 1'],
  ] as const) {
    const said = await agree(register, sentence);
    assert.equal(said.refused, null, `${register}: ${sentence}: ${said.refused}`);
    assert.ok(said.seqs.length > 0, `${register}: "${sentence}" found nothing, so it proves nothing about rows`);
  }
});

test('BOTH SEPARATORS IN ONE SENTENCE ARE REFUSED in both engines, in one sentence naming both readings', async () => {
  for (const sentence of ['state is open, due before today, or amount at least GBP 2400', 'state is open, or due before today, what contains rent']) {
    const theirs = await askRecord('obligations', sentence);
    const ours = askBrowser('obligations', sentence);
    assert.ok(theirs.refused, `the record answered ${sentence}`);
    assert.equal(ours.refused, theirs.refused, sentence);
  }
  assert.match(
    askBrowser('obligations', 'state is open, due before today, or amount at least GBP 2400').refused ?? '',
    /\(state is open and due before today\) or amount at least GBP 2400; or state is open and \(due before today or amount at least GBP 2400\)/,
  );
  /* AND `or` WITH NOTHING AFTER IT ASKS FOR THE CONDITION, on both sides alike. */
  const theirs = await askRecord('obligations', 'state is open, or');
  assert.equal(askBrowser('obligations', 'state is open, or').refused, theirs.refused);
  assert.match(theirs.refused ?? '', /or what\?$/);
});

/* ── the readers that must not see it, and the two that must ─────────────── */

test('A LINK FROM AN OR-GROUP OPENS THE LIST WIDE, because no chip carries an or', () => {
  assert.equal(registerHref('obligations', 'state is open, or due before today'), '/r/obligations');
});

test('A TILE OVER A DATED OR-GROUP IS NOT CALLED TIMELESS, and one over a fixed date says so', () => {
  const base = { metric: 'test', name: 'Test', source: 'register.obligations', value: { sum: 'amount' }, target: { lte: 1 }, window: '30d', compare: 'previous' } as const;
  /* `today` MOVES WITH THE CLOCK, so the window before is a different question and is measured. */
  const moving = read({ ...base, where: 'state is open, or due before today' });
  assert.doesNotMatch(moving.unmeasured ?? '', /nothing here is dated/, `a tile over a dated or-group was told: ${moving.unmeasured}`);
  /* AND IT IS MEASURED, NOT MERELY SPARED THE WRONG EXCUSE. With `resolvedAt` reading `clauses` alone the
     group resolved to `[]` at both clocks and the tile read `delta: null` under "this asks about one fixed
     date", which the line above lets through; measured on the seed it is `delta: 0`, 15,960,400 at both
     clocks, because no row that is not open fell due in the thirty days between them. */
  assert.equal(moving.unmeasured, null, `a tile over a dated or-group was told: ${moving.unmeasured}`);
  assert.equal(moving.delta, 0);
  /* A WRITTEN-OUT DAY DOES NOT, and the sentence under the tile names the day rather than denying one. */
  const fixed = read({ ...base, where: 'state is open, or due before 2026-10-01' });
  assert.match(fixed.unmeasured ?? '', /one fixed date/, `a tile over a fixed-date or-group was told: ${fixed.unmeasured}`);
  /* AND AN OR-GROUP THAT NAMES NO DAY IS STILL UNDATED. */
  const undated = read({ ...base, where: 'state is open, or state is part' });
  assert.match(undated.unmeasured ?? '', /nothing here is dated/);
});

test('A PARAMETER INSIDE AN OR-GROUP IS NOT THE SCOPE, in the browser as in the record, and the two agree', async () => {
  /* `withParam` SPLIT THE SENTENCE ON THE COMMA AFTER `compile` HAD LEARNED `, or`, the kernel's `scopeOf` twin. Measured
     over the seed with Kiln as the parameter, before the repair:

       thing is {{it}}, or state is paid    within 'thing is Kiln'       rows 18, held 10
       state is paid, or thing is {{it}}    within ' or thing is Kiln'   rows 18, held 0

     The second compiled its scope to nothing, so `held === 0` beside eighteen matched rows, which `api.ts` reads as a list
     nobody has written to. An alternative widens the rows rather than naming which rows the figure is about, so `held`
     is the whole register, which is what the record answers for the same template through `fill`. */
  const k: Kernel = await record;
  const base = { metric: 'm', name: 'M', source: 'register.obligations', value: { count: 'id' }, target: { lte: 99 }, window: '30d', compare: 'none' } as const;
  for (const where of ['thing is {{it}}, or state is paid', 'state is paid, or thing is {{it}}']) {
    const decl = withParam({ ...base, where }, 'Kiln');
    assert.equal(decl.within, undefined, `${where}: an alternative is not a scope`);
    const web = read(decl);
    assert.deepEqual(web.refusals, [], `${where}: ${web.refusals.join('; ')}`);
    assert.equal(web.held, (ROWS.obligations ?? []).length, `${where}: the whole register`);
    assert.ok(web.held >= web.rows, `${where}: held ${web.held} under rows ${web.rows}`);
    const kernel = k.metric(fill({ ...base, where }, null, 'Kiln') as never);
    assert.ok(kernel.ok, `${where}, the record: ${JSON.stringify(kernel)}`);
    assert.equal(web.rows, kernel.value.rows, `${where}: what the predicate matched`);
    assert.equal(web.held, kernel.value.held, `${where}: how many rows the list holds`);
  }
  /* AND A CONJUNCTION STILL NARROWS, with `or` between one field's values beside the parameter. */
  assert.equal(withParam({ ...base, where: 'thing is {{it}}, state is open or part' }, 'Kiln').within, 'thing is Kiln');
});

test('A BLOCK SAYS BOTH SIDES OF AN OR-GROUP PLAINLY, and not the second in the dialect', () => {
  /* `saidPlainly` CUT THE SENTENCE ON THE COMMA AND TOOK `or due` FOR A FIELD, found none, and left the clause as written.
     Measured before the repair: `which way is Money in, or due before +30d`, the first half in the words the rows are read
     in and the second in the declaration's, which is the half-and-half line the printer exists never to draw. */
  assert.equal(saidPlainly('obligations', 'direction is owed_to_me, or due before +30d'), 'which way is Money in, or due before 30 days from now');
  assert.equal(saidPlainly('obligations', 'state is paid, OR direction is owed_to_me'), 'status is paid, or which way is Money in');
  /* AND A PLAIN COMMA IS SAID AS IT WAS. */
  assert.equal(saidPlainly('obligations', 'direction is owed_to_me, due before +30d'), 'which way is Money in, due before 30 days from now');
});
