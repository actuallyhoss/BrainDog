/**
 * A colleague's automation runs bounded by what that colleague can see (sharing plan §2.12): a rule whose live version
 * a person put in who is not an owner now reads and writes through their lens, never the owner's, and once they can no
 * longer reach the record it stops, saying why. Both paths: a rule run inside the write, and a run of steps.
 *
 * THE MAKER IS AN OWNER MOVED DOWN, since only an owner accepts what runs unattended: Otto, a co-owner, turned both rules
 * on, then was held to Kiln by a share of his own, then lost it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 22, 12);
const until = new Date(NOW + 30 * 86_400_000).toISOString();

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({ id: `register.${id}`, kind: 'register' as const, body: { id, name, title, fields } as never });

const LISTS = [
  { id: 'register.things', kind: 'register' as const, body: { id: 'things', name: 'Things', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never },
  reg('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'thing', type: 'ref', to: 'things', scope: {} },
    { id: 'note', type: 'text' },
    { id: 'seen', type: 'text' },
  ]),
];

/* INSIDE THE WRITE: every new task is marked seen. */
const STAMP = { id: 'rule.stamp', kind: 'rule' as const, body: { rule: 'stamp', register: 'tasks', on: 'create', then: [{ set: { field: 'seen', to: 'yes' } }] } as never };
/* A RUN OF STEPS: every new task gets a note. */
const FOLLOW = {
  id: 'rule.follow',
  kind: 'rule' as const,
  body: { rule: 'follow', on: { written: { register: 'tasks', op: ['create'] } }, once_per: ['entry'], steps: [{ set: { field: 'note', to: 'followed up' } }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAG', slug: 'the-yard', name: 'The Yard', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.kernel.install(LISTS)).ok);
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_otto', 'otto@example.test', 'Otto', NULL)");
  assert.ok(((await api.invite({ person: 'p_otto', name: 'Otto', level: 'owner' }, owner)) as { ok: boolean }).ok);
  /* OTTO TURNS BOTH ON, as an owner. */
  const put = await api.kernel.install([STAMP, FOLLOW], undefined, { actor: 'p_otto' });
  assert.ok(put.ok, JSON.stringify(put));
  const kiln = api.kernel.create('things', { name: 'Kiln' }, { actor: 'p_1' });
  const mill = api.kernel.create('things', { name: 'Mill' }, { actor: 'p_1' });
  assert.ok(kiln.ok && mill.ok);
  const task = async (what: string, thing: string) => {
    const made = api.kernel.create('tasks', { what, thing }, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
    await api.kernel.drain();
    const row = sql.one<{ note: string | null; seen: string | null }>("SELECT json_extract(fields, '$.note') AS note, json_extract(fields, '$.seen') AS seen FROM entry WHERE id = ?", made.value.id)!;
    const run = sql.one<{ state: string; say: string | null }>("SELECT state, say FROM automation_run WHERE rule = 'follow' AND json_extract(trigger, '$.entry') = ?", made.value.id);
    return { ...row, run };
  };
  /* OTTO MOVED DOWN: no longer on the record by a role, and held to Kiln by a share, at edit, with what it holds. */
  const heldTo = async (share: Record<string, unknown>) => {
    sql.exec("DELETE FROM member WHERE person_id = 'p_otto'");
    const out = (await api.share({ share: { who: { kind: 'person', id: 'p_otto' }, what: { project: kiln.value.id }, can: 'edit', when: { until }, ...share } }, owner)) as { ok: boolean; value?: { id: string } };
    assert.ok(out.ok, JSON.stringify(out));
    api.kernel.accessChanged();
    return out.value!.id;
  };
  return { sql, api, task, heldTo, kiln: kiln.value.id, mill: mill.value.id };
}

test('WHILE OTTO IS AN OWNER, HIS RULES RUN AS THE RECORD DOES, on every task', async () => {
  const { sql, task, mill } = await record();
  const got = await task('Oil the wheel', mill);
  assert.equal(got.seen, 'yes');
  assert.equal(got.note, 'followed up');
  assert.equal(got.run?.state, 'done');
  sql.close();
});

test('HELD TO KILN, HIS RULES REACH KILN\'S TASKS AND NOT THE MILL\'S, and the run says why it was skipped', async () => {
  const { sql, task, heldTo, kiln, mill } = await record();
  await heldTo({});
  const inside = await task('Glaze test', kiln);
  assert.equal(inside.seen, 'yes', 'the rule inside the write did not run on a task Otto can edit');
  assert.equal(inside.note, 'followed up');
  assert.equal(inside.run?.state, 'done');

  const outside = await task('Oil the wheel', mill);
  assert.equal(outside.seen, null, "Otto's rule wrote on a task he cannot see");
  assert.equal(outside.note, null, "Otto's run wrote on a task he cannot see");
  assert.equal(outside.run?.state, 'cancelled');
  assert.equal(outside.run?.say, 'Skipped: the row it started for is not one Otto can see.');
  sql.close();
});

test('A FIELD HIDDEN FROM HIM IS ONE HIS RUN CANNOT WRITE, and a rule inside the write does not run on that list', async () => {
  const { sql, task, heldTo, kiln } = await record();
  await heldTo({ hide: { tasks: ['note'] } });
  const got = await task('Glaze test', kiln);
  assert.equal(got.note, null, 'the run wrote a field hidden from its maker');
  assert.equal(got.run?.state, 'failed');
  assert.match(got.run?.say ?? '', /Tasks has no field note that Otto can change\./u);
  assert.equal(got.seen, null, 'a rule ran inside the write over a list with a field hidden from its maker');
  sql.close();
});

test('ONCE HE CAN NO LONGER REACH THE RECORD, HIS RULES STOP, saying so in plain words', async () => {
  const { sql, api, task, heldTo, kiln } = await record();
  const share = await heldTo({});
  assert.ok(((await api.unshare({ id: share }, owner)) as { ok: boolean }).ok);
  api.kernel.accessChanged();
  const got = await task('Glaze test', kiln);
  assert.equal(got.seen, null);
  assert.equal(got.note, null);
  assert.equal(got.run?.state, 'cancelled');
  assert.equal(got.run?.say, 'Stopped: Otto, who turned this on, can no longer reach this record.');
  assert.doesNotMatch(got.run?.say ?? '', /p_otto|rule\./u);
  sql.close();
});

test('AN OWNER TURNING IT ON AGAIN MAKES IT THE RECORD\'S ONCE MORE', async () => {
  const { sql, api, task, heldTo, mill } = await record();
  await heldTo({});
  assert.ok((await api.kernel.install([STAMP, FOLLOW].map((d) => ({ ...d, body: { ...(d.body as object), name: 'Again' } as never })), undefined, { actor: 'p_1' })).ok);
  const got = await task('Oil the wheel', mill);
  assert.equal(got.seen, 'yes');
  assert.equal(got.note, 'followed up');
  sql.close();
});
