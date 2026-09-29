/**
 * Every list takes `tags`, declared or not, the way every row takes an id.
 *
 * MEASURED. `tags` is the record's own marker field: the `example` marker, `formed`, the `tag` and `untag` rule actions
 * and Slash's "not an example" count all read or write it, and none of them names a field. It existed only because the
 * seed appends it to its own lists (`packages/seed/src/index.ts` `withTags`), so a list declared any other way had
 * none. Driven through `openRecord`, a list `jobs` without `tags` and a rule
 * `then: [{ tag: late }, { note: 'late one' }]`: the rule installed, fired, and its patch was refused `FIELD_UNKNOWN`,
 * which took the note in the same rule with it. The row had no tags, the log had only the `create`, and the one trace
 * was a `write.refused` observation counter nobody reads.
 *
 * THE DECLARED FIELD LIST STAYS WHAT SOMEBODY DECLARED. An agent reading `register(id)` to learn what a list holds should
 * not find a field nobody wrote down; the predicate vocabulary (`schemaOf`) is where `tags` appears, because a
 * `where:` over it has to compile and the value sits in `fields` exactly as a declared `list<text>` does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const jobs = (fields: Record<string, unknown>[]): Declaration => ({
  id: 'register.jobs',
  kind: 'register',
  body: { id: 'jobs', name: 'Jobs', title: 'what', fields } as never,
});

const WHAT = { id: 'what', type: 'text', required: true };
const DUE = { id: 'due', type: 'day' };

const LATE: Declaration = {
  id: 'rule.late',
  kind: 'rule',
  body: { rule: 'late', register: 'jobs', when: 'due before today', then: [{ tag: 'late' }, { note: 'late one' }] } as never,
};

async function record(...batch: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install(batch);
  assert.ok(out.ok, fixOf(out));
  return { k, sql };
}

const created = (out: unknown): { id: string; fields: Record<string, unknown> } => {
  const x = out as { ok: boolean; value: { id: string; fields: Record<string, unknown> }; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const events = (sql: NodeSql, id: string) =>
  sql
    .all<{ actor: string; kind: string; field: string | null; note: string | null }>(
      'SELECT actor, kind, field, note FROM event WHERE target = ? ORDER BY rowid',
      `entry:${id}`,
    )
    .map((e) => ({ ...e }));

test('A RULE TAGGING A ROW ON A LIST THAT NEVER DECLARED tags KEEPS ITS WHOLE WRITE, the tag and the note', async () => {
  const { k, sql } = await record(jobs([WHAT, DUE]), LATE);
  const row = created(k.create('jobs', { what: 'x', due: '2026-09-01' }, { actor: 'p_1' }));

  assert.deepEqual(k.get(row.id)?.fields, { what: 'x', due: '2026-09-01', tags: ['late'] });
  assert.deepEqual(
    events(sql, row.id).map((e) => [e.actor, e.kind, e.field, e.note]),
    [
      ['p_1', 'create', null, null],
      ['rule:late', 'tag', 'tags', null],
      ['rule:late', 'note', null, 'late one'],
    ],
  );
});

test('A PERSON MAY TAG A ROW OF ANY LIST, and the history says which tag arrived', async () => {
  const { k, sql } = await record(jobs([WHAT]));
  const row = created(k.create('jobs', { what: 'x' }, { actor: 'p_1' }));
  assert.ok(k.update('jobs', row.id, { tags: ['kiln', 'urgent'] }, { actor: 'p_1' }).ok);
  assert.deepEqual(
    events(sql, row.id).filter((e) => e.kind === 'tag').length,
    2,
  );
});

test('THE DECLARED FIELD LIST DOES NOT GROW A FIELD NOBODY DECLARED', async () => {
  const { k } = await record(jobs([WHAT, DUE]));
  assert.deepEqual(
    k.register('jobs')?.fields.map((f) => f.id),
    ['what', 'due'],
  );
});

test('tags has late READS ON A LIST THAT NEVER DECLARED tags, from a list and from a rule', async () => {
  const { k, sql } = await record(jobs([WHAT]), {
    id: 'rule.flag',
    kind: 'rule',
    body: { rule: 'flag', register: 'jobs', when: 'tags has late', then: [{ note: 'flagged' }] } as never,
  });
  const onTime = created(k.create('jobs', { what: 'on time' }, { actor: 'p_1' }));
  const late = created(k.create('jobs', { what: 'behind', tags: ['late'] }, { actor: 'p_1' }));

  const listed = k.list({ register: 'jobs', where: 'tags has late' }) as { ok: boolean; value: { rows: { id: string }[] } };
  assert.ok(listed.ok);
  assert.deepEqual(listed.value.rows.map((r) => r.id), [late.id]);
  assert.deepEqual(events(sql, late.id).filter((e) => e.kind === 'note').map((e) => [e.actor, e.note]), [['rule:flag', 'flagged']]);
  assert.deepEqual(events(sql, onTime.id).filter((e) => e.kind === 'note'), []);
});

test('A LIST THAT DECLARES ITS OWN tags KEEPS ITS DECLARATION, an enum refusing a value it does not take', async () => {
  const { k } = await record(jobs([WHAT, { id: 'tags', type: 'list', of: 'enum', values: ['late', 'early'] }]));
  assert.deepEqual(k.register('jobs')?.fields.map((f) => f.id), ['what', 'tags']);
  assert.ok(k.create('jobs', { what: 'x', tags: ['late'] }, { actor: 'p_1' }).ok);
  assert.equal(k.create('jobs', { what: 'y', tags: ['sideways'] }, { actor: 'p_1' }).ok, false);
});

/* THE LIST THAT USED TO DECLARE `tags` MAY STOP DECLARING IT. Measured: a list declaring `tags` as `list<text>` over
   one tagged row, changed to leave `tags` out, was refused `WOULD_ORPHAN` with "Mark it retired rather than leaving it
   out", though the field every list takes reads those values exactly as before. Following that fix made it worse: a
   retired `tags` is a choice the list made, so the next `tag` was `FIELD_UNKNOWN`. It also blocked the seed ever
   dropping the `tags` it appends to its own lists on a record with a tagged row. A `tags` of another shape is still a
   field the implicit one would misread, so a `text` one left out is still refused. */
test('LEAVING OUT A DECLARED tags THE IMPLICIT ONE READS IS NOT AN ORPHAN, and the row stays tagged and taggable', async () => {
  for (const declared of [
    { id: 'tags', type: 'list', of: 'text' },
    { id: 'tags', type: 'list', of: 'enum', values: ['late', 'early'] },
  ]) {
    const { k } = await record(jobs([WHAT, declared]));
    const row = created(k.create('jobs', { what: 'x', tags: ['late'] }, { actor: 'p_1' }));
    const out = await k.install([jobs([WHAT])]);
    assert.ok(out.ok, `${declared.of}: ${fixOf(out)}`);
    assert.ok(k.update('jobs', row.id, { tags: ['late', 'early'] }, { actor: 'p_1' }).ok);
    assert.deepEqual(k.get(row.id)?.fields.tags, ['late', 'early']);
  }

  const { k } = await record(jobs([WHAT, { id: 'tags', type: 'text' }]));
  created(k.create('jobs', { what: 'x', tags: 'late' }, { actor: 'p_1' }));
  assert.equal(codeOf(await k.install([jobs([WHAT])])), 'WOULD_ORPHAN');
});
