/**
 * `faults` and `retryFault`: what is not working in BrainDog itself, told to its owner and never asked as a question
 * (AGT-C06 job e, `src/methods/faults.ts`).
 *
 * TWO HALVES. The door's own rules (who reads a fault, who reads its raw error, what `retryFault` takes) are asserted
 * over the method file with a kernel that answers what `kernel/src/fault.ts` keeps, so they hold whichever of this
 * batch's halves lands first. Who is refused is asserted again through the real record and its real guards, and the
 * owner's read goes all the way down once the kernel has the verb.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Refusal, type Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods } from '../src/methods/faults.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'read', person: 'p_1', level: 'owner' }, session: { agent: 'claude' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' } };
const narrow: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'owner' }, registers: ['tasks'] };

const SAID = 'BrainDog could not check for people who are here twice. It tries again tonight.';
const RAW = 'No model answered: 401 key revoked';
const FAULT = { cause: 'outbox#infer.resolve', kind: 'infer.resolve', family: 'infer', said: SAID, count: 8, first_at: '2026-10-01T03:00:00Z', last_at: '2026-10-09T03:00:00Z', error: RAW };

/** The method file over a kernel holding one fault, with guards that refuse as the record's do. */
function door(host?: 'cloud' | 'self-host', verbs: boolean = true) {
  const retried: { actor: string; cause: string }[] = [];
  const kernel = verbs
    ? {
        faults: () => ok({ faults: [FAULT] }),
        retryFault: (w: { actor: string }, a: { cause: string }) => (retried.push({ actor: w.actor, cause: a.cause }), ok({ cause: a.cause, queued: 1 })),
      }
    : {};
  const refuse = (code: string, fix: string): Refusal => ({ code, fix, at: 'principal' });
  const deps = {
    kernel,
    scoped: (ctx: CallContext) => (ctx.principal.kind === 'share' ? refuse('FORBIDDEN', 'A link reads one page.') : null),
    admin: (ctx: CallContext) => (ctx.principal.kind === 'token' ? refuse('NEEDS_BROWSER_SESSION', 'Open this from the app.') : null),
    no,
    tail: async <T>(out: T) => out,
    ...(host === undefined ? {} : { host }),
  } as unknown as RecordDeps;
  return { api: methods(deps), retried };
}

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;

test('THE OWNER READS THE SENTENCE, HOW MANY TIMES AND SINCE WHEN, and on the Cloud never the raw error', async () => {
  for (const who of [owner, agent]) {
    const out = await door().api.faults({}, who);
    assert.ok(out.ok, JSON.stringify(out));
    assert.deepEqual(out.value.faults, [{ cause: 'outbox#infer.resolve', said: SAID, count: 8, since: '2026-10-01T03:00:00Z', last: '2026-10-09T03:00:00Z' }]);
    assert.doesNotMatch(JSON.stringify(out.value), /401|key revoked|infer\.resolve could not|attempts/u, 'no raw error, job name sentence or attempt count');
  }
});

test('THE RAW ERROR GOES ONLY TO A SELF-HOST’S OWNER IN PERSON, never to her agent or to the Cloud’s owner', async () => {
  const self = door('self-host').api;
  const own = await self.faults({}, owner);
  assert.ok(own.ok);
  assert.equal(own.value.faults[0]!.error, RAW);
  const hers = await self.faults({}, agent);
  assert.ok(hers.ok);
  assert.equal(hers.value.faults[0]!.error, undefined, 'an agent on her key reads the sentence only');
  const cloud = await door('cloud').api.faults({}, owner);
  assert.ok(cloud.ok);
  assert.equal(cloud.value.faults[0]!.error, undefined);
});

test('A MEMBER, OR AN OWNER HELD TO ONE LIST, IS REFUSED in one sentence that says who reads it', async () => {
  for (const who of [member, narrow]) {
    const out = await door('self-host').api.faults({}, who);
    assert.equal(out.ok, false);
    assert.equal(refusal(out).code, 'FORBIDDEN');
    assert.match(refusal(out).fix, /owner/u);
    assert.doesNotMatch(refusal(out).fix, /—/u);
  }
});

test('RETRYFAULT QUEUES THE DEAD JOB AGAIN for the owner, signed by her, and takes only a cause', async () => {
  const { api, retried } = door();
  const out = await api.retryFault({ cause: 'outbox#infer.resolve' }, owner);
  assert.deepEqual(out, { ok: true, value: { cause: 'outbox#infer.resolve', queued: 1 } });
  assert.deepEqual(retried, [{ actor: 'p_1', cause: 'outbox#infer.resolve' }]);
  assert.equal(refusal(await api.retryFault({}, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.retryFault({ cause: 'no hash here' }, owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.retryFault({ cause: 'outbox#infer.resolve' }, agent)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(retried.length, 1, 'nothing refused reached the kernel');
});

test('A KERNEL WITHOUT THE VERBS ANSWERS NOT_IN_THIS_BUILD with a sentence, never a throw', async () => {
  const { api } = door(undefined, false);
  for (const out of [await api.faults({}, owner), await api.retryFault({ cause: 'outbox#infer.resolve' }, owner)]) {
    assert.equal(refusal(out).code, 'NOT_IN_THIS_BUILD');
    assert.doesNotMatch(refusal(out).fix, /—/u);
  }
});

test('THROUGH THE REAL RECORD: a member is refused, her agent may not retry, and the owner reads what the kernel keeps', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.equal(refusal(await api.faults({}, member)).code, 'FORBIDDEN');
  assert.equal(refusal(await api.retryFault({ cause: 'outbox#infer.resolve' }, agent)).code, 'NEEDS_BROWSER_SESSION');
  const memberAgent: CallContext = { principal: { kind: 'token', id: 'tok_2', scope: 'read', person: 'p_2', level: 'write' } };
  assert.equal(refusal(await api.faults({}, memberAgent)).code, 'FORBIDDEN', "a member's read key is refused too");
  const out = await api.faults({}, owner);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value.faults, [], 'a fresh record has nothing broken');
  sql.close();
});

test('A FAULT THE KERNEL RAISED IS READ BY THE OWNER through the real record: its sentence, once, and no raw error', async () => {
  const { raiseFault } = await import('../../kernel/src/fault.ts');
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', RAW, NOW - 3_600_000);
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', RAW, NOW);
  for (const who of [owner, agent]) {
    const out = await api.faults({}, who);
    assert.ok(out.ok, JSON.stringify(out));
    assert.equal(out.value.faults.length, 1);
    const [f] = out.value.faults;
    assert.equal(f!.said, SAID);
    assert.equal(f!.count, 2);
    assert.equal(f!.since, new Date(NOW - 3_600_000).toISOString());
    assert.equal(f!.error, undefined, 'a record opened with no host is the Cloud, and the Cloud holds the error back');
  }
  assert.equal(refusal(await api.faults({}, member)).code, 'FORBIDDEN');
  sql.close();
});

test('A FAILED NIGHT SAYS WHY IN PLAIN WORDS to the owner and her agent, and never the raw reason (A22)', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const raw = 'snapshot over 40 MiB: this record dumped 52428800 bytes and the Worker signs the whole file in memory. Raise the ceiling or stream it (51 §10).';
  api.kernel.copyFailed(raw);
  for (const who of [owner, agent]) {
    const out = await api.faults({}, who);
    assert.ok(out.ok, JSON.stringify(out));
    const night = out.value.faults.find((f) => f.cause === 'night#export.night');
    assert.ok(night, 'the failed night is a fault');
    assert.equal(night.why, 'Your record was too large to copy in one piece.');
    assert.equal(night.error, undefined);
    assert.ok(!JSON.stringify(out.value).includes('MiB'), 'nothing of the raw reason reaches the answer');
  }
  sql.close();
});
