/**
 * A rule stored before the inline lint, or written straight into the declaration row, is held to what the lint says.
 *
 * `loop/research-batch-forty-two-audit.md` FINDING 3, AND FORTY-ONE'S FINDING 3 WITH IT. `inlineFault` refuses a verb
 * only a step has in an inline `then:`, and `fillFault` a `move` or a `tag` that is not text, both at install. Nothing
 * asked either of a body already stored, and the pass acts on the first action each item carries. Measured by the audit
 * on 23 September with a lint-clean rule on Jobs installed and its `then` then rewritten in the row: `{ if: 'what is
 * Nothing', then: [], set: note }` set the note on a row the condition excluded, `{ wait: 1h, set: note }` wrote the note
 * at once, and `move: 5` beside a `set` left the row holding `what` alone, since the enum refused the 5 and the rule's
 * whole patch went with it. Forty-one measured the same drop for a stored `tag: 5`.
 *
 * SO THE ITEM IS LEFT UNDONE AND SAYS SO, and the rest of the rule still acts. Each case below rewrites the stored body
 * the way the audit's probe did, reopens the kernel so nothing cached answers for the row, and writes one row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'done'] },
    ],
  } as never,
};
const CLEAN = { rule: 'r', register: 'jobs', then: [{ set: { field: 'note', to: 'seen' } }] };

/** Install the clean rule, rewrite its stored `then`, reopen, and hand back the kernel over the rewritten row. */
async function stored(then: unknown[]): Promise<{ k: Kernel; sql: NodeSql; lint: string | null }> {
  const sql = openSqlite();
  const first = await openRecord(sql, fixedClock(NOW));
  const installed = await first.install([JOBS, { id: 'rule.r', kind: 'rule', body: CLEAN as never }]);
  assert.ok(installed.ok, JSON.stringify(installed));
  /* THE LINT STILL REFUSES THE BODY AT INSTALL, which is what makes each of these a rule from before it. */
  const again = await first.install([{ id: 'rule.r', kind: 'rule', body: { ...CLEAN, then } as never }]);
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'rule.r' AND superseded_at IS NULL", JSON.stringify({ ...CLEAN, then }));
  return { k: await openRecord(sql, fixedClock(NOW)), sql, lint: again.ok ? null : (codeOf(again) ?? '?') };
}

const written = (k: Kernel): Record<string, unknown> => {
  const made = k.create('jobs', { what: 'Water', state: 'open' }, { actor: 'p_1' });
  assert.ok(made.ok, JSON.stringify(made));
  return k.get(made.value.id)!.fields as Record<string, unknown>;
};

const observed = (sql: NodeSql): string[] =>
  sql.all<{ subject: string }>("SELECT subject FROM observation WHERE kind = 'write.refused' ORDER BY subject").map((r) => r.subject);

test('A STORED if BESIDE A set DOES NOT SET THE FIELD, whatever the condition says, and the skip is observed', async () => {
  const { k, sql, lint } = await stored([{ if: 'what is Nothing', then: [], set: { field: 'note', to: 'guarded' } }]);
  assert.equal(lint, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(written(k), { what: 'Water', state: 'open' });
  assert.deepEqual(observed(sql), ['jobs.rule.r.then[0].if:NOT_IN_THIS_BUILD']);
});

test('A STORED wait BESIDE A set WRITES NOTHING NOW, since the pass cannot wait', async () => {
  const { k, lint } = await stored([{ wait: '1h', set: { field: 'note', to: 'later' } }]);
  assert.equal(lint, 'NOT_IN_THIS_BUILD');
  assert.deepEqual(written(k), { what: 'Water', state: 'open' });
});

test('A STORED move: 5 IS LEFT UNDONE AND THE set AFTER IT IS STILL WRITTEN, rather than the whole patch going', async () => {
  const { k, sql, lint } = await stored([{ move: 5 }, { set: { field: 'note', to: 'seen' } }]);
  assert.equal(lint, 'DECLARATION_INVALID');
  assert.deepEqual(written(k), { what: 'Water', state: 'open', note: 'seen' });
  assert.deepEqual(observed(sql), ['jobs.rule.r.then[0].move:DECLARATION_INVALID']);
});

test('A STORED tag: 5 OR untag: 5 IS LEFT UNDONE AND THE set BESIDE IT IS STILL WRITTEN (audit forty-one, finding 3)', async () => {
  for (const verb of ['tag', 'untag'] as const) {
    const { k, lint } = await stored([{ [verb]: 5 }, { set: { field: 'note', to: 'seen' } }]);
    assert.equal(lint, 'DECLARATION_INVALID', verb);
    const row = written(k);
    assert.equal(row.note, 'seen', `${verb}: ${JSON.stringify(row)}`);
    assert.ok(!Array.isArray(row.tags) || !row.tags.includes(5), JSON.stringify(row));
  }
});

test('A BULK APPLY OF SUCH A RULE NAMES THE STEP IT LEFT, where the person applying it reads', async () => {
  /* A `tag` rather than a `set` beside it, since a bulk apply passes over a row whose set field already holds a value. */
  const { k } = await stored([{ move: 5 }, { tag: 'late' }]);
  assert.deepEqual(written(k).tags, ['late']);
  const applied = k.applyRule('rule.r');
  assert.ok(applied.ok, JSON.stringify(applied));
  assert.deepEqual(
    applied.value.refusals.map((r) => [r.code, r.at, r.fix]),
    [['DECLARATION_INVALID', 'then[0].move', "rule.r's then[0].move is 5, and a move's state is written as text. The rule was stored before install refused that, so this step was left out of what the rule wrote."]],
  );
});

test('A CLEAN STORED RULE STILL ACTS, and leaves nothing observed', async () => {
  const { k, sql, lint } = await stored(CLEAN.then);
  assert.equal(lint, null);
  assert.deepEqual(written(k), { what: 'Water', state: 'open', note: 'seen' });
  assert.deepEqual(observed(sql), []);
});
