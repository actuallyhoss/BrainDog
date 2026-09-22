/**
 * The `tags` every list takes is typed like a declared `list<text>` for every check that guards a field's type.
 *
 * MEASURED IN `loop/research-batch-thirty-four-audit.md` §4. `withTags` gives every list a `tags` where a value is written
 * and where a predicate is read, and on purpose not in the body `register(id)` hands back. `contradicted` read that body,
 * so when a list that never declared `tags`, with a row holding `["late","example"]`, declared its own `tags` as `text`,
 * `int` or `bool`, there was no `was` to compare it with and it installed over the arrays. From then on every `tag` and
 * `untag` on that list was refused `VALUE_MALFORMED` and `tags has` was `MATCH_OP_UNSUPPORTED`: the N3 failure of
 * `loop/research-shell-seed-next.md`, the one `withTags` was written to end, back by one declaration.
 *
 * THE CHOICE A LIST MAKES IS STILL ITS OWN WHERE NO ROW HOLDS A TAG, as for any declared field: a type change over values
 * nobody wrote breaks nothing that is stored, and `withTags` keeps a declared `tags` of another shape on purpose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const WHAT = { id: 'what', type: 'text', required: true };

const jobs = (...more: Record<string, unknown>[]): Declaration => ({
  id: 'register.jobs',
  kind: 'register',
  body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [WHAT, ...more] } as never,
});

async function record(tagged: boolean): Promise<{ k: Kernel; id: string }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([jobs()]);
  assert.ok(out.ok, fixOf(out));
  const row = k.create('jobs', tagged ? { what: 'x', tags: ['late', 'example'] } : { what: 'x' }, { actor: 'p_1' }) as { ok: boolean; value: { id: string } };
  assert.ok(row.ok);
  return { k, id: row.value.id };
}

for (const type of ['text', 'int', 'bool']) {
  test(`A LIST'S OWN tags OF ${type} IS A RETYPE OVER ROWS HOLDING TAGS, refused as a declared list<text> would be`, async () => {
    const { k, id } = await record(true);
    const out = await k.install([jobs({ id: 'tags', type })]);
    assert.equal(out.ok, false, `tags: ${type} installed over a row holding ["late","example"]`);
    assert.equal(codeOf(out), 'FIELD_TYPE_CHANGED');
    /* AND NOT THE ORDINARY RETYPE'S "retire the field", which for tags would turn every later tag into FIELD_UNKNOWN. */
    assert.match(fixOf(out), new RegExp(`every list takes tags as list<text>, and 1 row holds some, so ${type} would change`));
    assert.match(fixOf(out), /Leave tags out, or declare it as list<text>\./);
    assert.equal((out as { refusal?: { at?: string } }).refusal?.at, 'register.jobs.fields.tags.type');

    /* AND THE LIST STILL TAKES A TAG, which is what the refusal kept. */
    assert.deepEqual(k.get(id)?.fields.tags, ['late', 'example']);
    const tagged = k.write('jobs', id, { tags: ['late', 'example', 'urgent'] }, { actor: 'p_1' });
    assert.ok(tagged.ok, fixOf(tagged));
  });
}

test('A LIST THAT WRITES DOWN THE tags IT ALREADY TAKES, as list<text>, installs over the same rows', async () => {
  const { k } = await record(true);
  const out = await k.install([jobs({ id: 'tags', type: 'list', of: 'text' })]);
  assert.ok(out.ok, fixOf(out));
});

test("WITH NO ROW HOLDING A TAG, a tags of another shape is still the list's own choice and installs", async () => {
  const { k } = await record(false);
  const out = await k.install([jobs({ id: 'tags', type: 'text' })]);
  assert.ok(out.ok, fixOf(out));
  assert.equal(k.register('jobs')?.fields.find((f) => f.id === 'tags')?.type, 'text');
});
