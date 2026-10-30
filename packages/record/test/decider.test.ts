/**
 * `setDecider`: the owner names the one person who decides a question.
 *
 * An owner, in a browser, hands a question to a member who holds Decides and takes it back with nobody. A member who
 * only reads is refused with her name in the sentence, a token is refused whatever level its holder has, and so is a
 * member who may decide but does not own the record. The kernel's half is `packages/kernel/test/decider.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no } from '@braindog/ports';

import { allows, createRecordApi, type CallContext } from '../src/index.ts';
import { methods } from '../src/methods/decider.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { deciderOf, handQuestion } from '../../kernel/src/govern.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 9);
const [OWNER, ADA, BEN, READER] = [PEOPLE[0]!, PEOPLE[3]!, PEOPLE[2]!, PEOPLE[6]!];

const person = (id: string, level: 'owner' | 'decide' | 'read'): CallContext => ({ principal: { kind: 'person', id, level }, credentialed: true });
const owner = person('p_owner', 'owner');
const ben = person('p_ben', 'decide');
const token: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'write', person: 'p_owner', level: 'owner' } };

const refusal = (out: { ok: boolean }) => {
  assert.equal(out.ok, false);
  return (out as unknown as { refusal: { code: string; fix: string; at?: string } }).refusal;
};

async function harness() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  for (const [id, p, level] of [
    ['p_owner', OWNER, 'owner'],
    ['p_ada', ADA, 'decide'],
    ['p_ben', BEN, 'decide'],
    ['p_reader', READER, 'read'],
  ] as const) {
    sql.exec('INSERT INTO person (id, email, name) VALUES (?, ?, ?)', id, p.email, p.name);
    sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', ?)", id, level);
  }
  const asked = api.kernel.propose(
    {
      question: 'Which supplier for the jars?',
      body_kind: 'options',
      body: { options: [{ id: 'north', label: 'Northgate', because: 'Cheaper.' }, { id: 'cedar', label: 'Cedar', because: 'Faster.' }] },
    },
    'p_owner',
  );
  assert.ok(asked.ok, JSON.stringify(asked));
  let n = 0;
  const kernelDeps = { sql, nowMs: NOW, mint: () => `01JZRECORDHAND000000${String(++n).padStart(6, '0')}` };
  /* THE OWNER'S GATE AS THE RECORD HOLDS IT (`admin` in `index.ts`): a token never, and otherwise the owner rung. */
  const admin = (ctx: CallContext, reads?: string) =>
    ctx.principal.kind === 'token' ? { code: 'NEEDS_BROWSER_SESSION', fix: `Open this from the app; a token cannot ${reads}.`, at: 'principal' } : allows(ctx, 'owner');
  const deps = { kernel: api.kernel, sql, admin, no, tail: async <T>(o: T) => o, clock: fixedClock(NOW) } as unknown as RecordDeps;
  const m = methods(deps, { handQuestion: (id, to, by) => handQuestion(kernelDeps, id, to, by) });
  return { sql, m, id: asked.value.id };
}

test('AN OWNER HANDS A QUESTION TO A MEMBER WHO DECIDES, AND TAKES IT BACK', async () => {
  const { sql, m, id } = await harness();
  const handed = await m.setDecider({ id, to: 'p_ada' }, owner);
  assert.deepEqual(handed, { ok: true, value: { id, decider: 'p_ada' } });
  assert.equal(deciderOf(sql, id), 'p_ada');
  const signed = sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'note' AND field = 'decider' AND target = ?", `suggestion:${id}`);
  assert.equal(signed?.actor, 'p_owner', 'History says who handed it');

  /* Handed to another owner is fine too: an owner decides everything. */
  assert.ok((await m.setDecider({ id, to: 'p_owner' }, owner)).ok);

  const back = await m.setDecider({ id }, owner);
  assert.deepEqual(back, { ok: true, value: { id, decider: null } });
  assert.equal(deciderOf(sql, id), null);
  assert.deepEqual(await m.setDecider({ id, to: null }, owner), { ok: true, value: { id, decider: null } });
});

test('A MEMBER WHO ONLY READS CANNOT BE HANDED ONE, AND IS NAMED IN THE SENTENCE', async () => {
  const { sql, m, id } = await harness();
  const r = refusal(await m.setDecider({ id, to: 'p_reader' }, owner));
  assert.equal(r.fix, `${READER.name} cannot decide here. Name somebody who can, or nobody.`);
  assert.equal(r.at, 'to');
  assert.ok(!/p_reader/.test(r.fix), 'a name, never an id');
  assert.equal(refusal(await m.setDecider({ id, to: 'p_nobody' }, owner)).fix, 'That person cannot decide here. Name somebody who can, or nobody.');
  assert.equal(refusal(await m.setDecider({ id, to: 7 }, owner)).at, 'to');
  assert.equal(refusal(await m.setDecider({ to: 'p_ada' }, owner)).at, 'id');
  assert.equal(deciderOf(sql, id), null, 'nothing was handed');
});

test('A TOKEN IS REFUSED, AND SO IS A MEMBER WHO DECIDES BUT DOES NOT OWN THE RECORD', async () => {
  const { sql, m, id } = await harness();
  assert.equal(refusal(await m.setDecider({ id, to: 'p_ada' }, token)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await m.setDecider({ id, to: 'p_ben' }, ben)).code, 'LEVEL_REQUIRED', 'Ben may decide, and may not hand questions out');
  assert.equal(deciderOf(sql, id), null);
});

test('A SETTLED QUESTION IS HANDED TO NOBODY', async () => {
  const { m, id, sql } = await harness();
  sql.exec("UPDATE suggestion SET status = 'resolved', resolved_as = 'wont-fix' WHERE id = ?", id);
  const r = refusal(await m.setDecider({ id, to: 'p_ada' }, owner));
  assert.equal(r.code, 'TRANSITION_ILLEGAL');
  assert.equal(r.fix, 'This question is already settled, so it cannot be handed to anybody.');
});

test('WITH NO KERNEL CALL HANDED IN, IT READS THE KERNEL, AND SAYS SO WHEN THE KERNEL HAS NONE', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_ada', ?, ?)", ADA.email, ADA.name);
  sql.exec("INSERT INTO member (person_id, register, level) VALUES ('p_ada', '*', 'decide')");
  const deps = { kernel: api.kernel, sql, admin: () => null, no, tail: async <T>(o: T) => o } as unknown as RecordDeps;
  const out = await methods(deps).setDecider({ id: 'SG1', to: 'p_ada' }, owner);
  if ('handQuestion' in api.kernel) assert.equal(refusal(out).code, 'OUT_OF_BOUNDS', 'the kernel carries it now: no such question');
  else assert.equal(refusal(out).code, 'NOT_IN_THIS_BUILD');
});
