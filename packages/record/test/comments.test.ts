/**
 * Comments at the record: who may say something about a thing, who signs it, how long it may be, who resolves it, and
 * one thread for a question and the decision that settled it (`docs/20-COLLABORATION.md` §5).
 *
 * THE KERNEL'S TEST (`packages/kernel/src/api/comments.test.ts`) SAYS WHO MAY SEE A THING "IS NOT ASKED HERE". This is
 * where it is asked: every case goes through `createRecordApi` as a person or a token, so `sightOf`, `guard` and the
 * signature are the record's own.
 *
 * THE RULES. "anyone who can read may comment" (HD.382); "Comments: 280 chars" (HD.381); "no mentions or notifications
 * yet" (HD.383).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { OWNER, PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

const list = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
});

/** Two people invited as a host invites them: a reader of the tickets alone, and a writer on them. */
const READER = PEOPLE[3]!;
const WRITER = PEOPLE[2]!;

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
type Line = { id: string; by: string; at: string; body: string; reply_to: string | null; resolved: { as: string } | null };

const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as Out;
  assert.equal(x.ok, false, `expected a refusal, got ${JSON.stringify(x.value)}`);
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: owner.principal.id } }));
  value(await api.kernel.install([list('tickets', 'Tickets'), list('payables', 'Payables')]));
  value(await api.invite({ person: 'p_reader', name: READER.name, registers: { tickets: 'read' } } as never, owner));
  value(await api.invite({ person: 'p_writer', name: WRITER.name, registers: { tickets: 'write' } } as never, owner));
  /* BUILT THE WAY THE HOST BUILDS A MEMBER (`sessionContext`, `host/src/auth.ts`), from `kernel.access`. */
  const member = (id: string): CallContext => {
    const held = api.kernel.access(id)!;
    return {
      principal: { kind: 'person', id, level: held.level },
      ...(held.registers === null ? {} : { registers: held.registers }),
      ...(Object.keys(held.levels).length === 0 ? {} : { levels: held.levels }),
    } as CallContext;
  };
  const ticket = value<{ id: string }>(await api.create({ register: 'tickets', fields: { what: 'The upload page times out' } }, owner));
  const payable = value<{ id: string }>(await api.create({ register: 'payables', fields: { what: 'Studio rent for November' } }, owner));
  const nameOf = (id: string) => api.kernel.nameOf(id)!;
  return { sql, api, reader: member('p_reader'), writer: member('p_writer'), ticket: nameOf(ticket.id), payable: nameOf(payable.id) };
}

test('A READER OF A LIST COMMENTS ON ITS ROW, and a row on a list she cannot read answers as not there', async () => {
  const { api, reader, ticket, payable } = await record();
  const said = value<{ id: string }>(await api.comment({ on: ticket, body: 'It happens on the second upload too.' }, reader));
  const thread = value<Line[]>(await api.comments({ on: ticket }, owner));
  assert.deepEqual(thread.map((l) => [l.id, l.by, l.body]), [[said.id, 'p_reader', 'It happens on the second upload too.']], 'the owner reads her comment');

  const hidden = refused(await api.comment({ on: payable, body: 'Is this paid?' }, reader));
  const missing = refused(await api.comment({ on: 'P999', body: 'Is this paid?' }, reader));
  assert.equal(hidden.code, 'REF_UNKNOWN');
  assert.deepEqual(hidden, missing, 'a row she may not read is answered in the words a row that is not there gets');
  assert.deepEqual(refused(await api.comments({ on: payable }, reader)), refused(await api.comments({ on: 'P999' }, reader)));
  assert.equal(value<Line[]>(await api.comments({ on: payable }, owner)).length, 0, 'and nothing was written on it');
});

test('A TOKEN SIGNS AS ITS AGENT and never as the person who holds it', async () => {
  const { api, ticket } = await record();
  const token: CallContext = {
    principal: { kind: 'token', id: 't_helper', scope: 'propose', person: owner.principal.id, level: 'owner' },
    session: { agent: 'claude' },
  };
  value(await api.comment({ on: ticket, body: 'The timeout is the proxy, not the page.' }, token));
  const [line] = value<Line[]>(await api.comments({ on: ticket }, owner));
  assert.equal(line!.by, 'agent:claude');
  assert.notEqual(line!.by, owner.principal.id);

  /* A READ-ONLY TOKEN READS A THREAD AND WRITES NOTHING TO IT. */
  const reads: CallContext = { principal: { kind: 'token', id: 't_reads', scope: 'read', person: owner.principal.id, level: 'owner' } };
  assert.equal(value<Line[]>(await api.comments({ on: ticket }, reads)).length, 1);
  assert.equal((await api.comment({ on: ticket, body: 'One more.' }, reads)).ok, false);
});

test('A COMMENT IS 280 CHARACTERS: 281 are refused with the count over, and 280 are kept', async () => {
  const { api, reader, ticket } = await record();
  const no = refused(await api.comment({ on: ticket, body: 'a'.repeat(281) }, reader));
  assert.equal(no.at, 'body');
  assert.match(no.fix, /\b1 over\b/u, no.fix);
  assert.match(refused(await api.comment({ on: ticket, body: 'b'.repeat(300) }, reader)).fix, /\b20 over\b/u);
  /* BY CHARACTER, AS A PERSON COUNTS: 280 emoji are 560 UTF-16 units and still fit. */
  value(await api.comment({ on: ticket, body: '\u{1F600}'.repeat(280) }, reader));
  value(await api.comment({ on: ticket, body: 'c'.repeat(280) }, reader));
  assert.equal(value<Line[]>(await api.comments({ on: ticket }, owner)).length, 2);
});

test('WHO RESOLVES: the author, and a writer on the list; a reader who is not the author is refused', async () => {
  const { api, reader, writer, ticket } = await record();
  const hers = value<{ id: string }>(await api.comment({ on: ticket, body: 'Still slow on Tuesday.' }, reader));
  const his = value<{ id: string }>(await api.comment({ on: ticket, body: 'I moved the upload to a queue.' }, writer));
  const other = value<{ id: string }>(await api.comment({ on: ticket, body: 'Only on the large files.' }, reader));

  const no = refused(await api.resolveComment({ id: his.id, as: 'addressed', why: 'Looks done.' }, reader));
  assert.equal(no.code, 'FORBIDDEN', 'she reads the list and did not write his comment');

  value(await api.resolveComment({ id: hers.id, as: 'addressed', why: 'It is fast now.' }, reader));
  value(await api.resolveComment({ id: other.id, as: 'wont-fix', why: 'Large files stay slow.' }, writer));
  const resolved = Object.fromEntries(value<Line[]>(await api.comments({ on: ticket }, owner)).map((l) => [l.id, l.resolved?.as ?? null]));
  assert.deepEqual(resolved, { [hers.id]: 'addressed', [his.id]: null, [other.id]: 'wont-fix' });
});

/** A question on the record, answered by the owner: the question's number and the decision's. */
async function settled(api: Awaited<ReturnType<typeof createRecordApi>>) {
  const asked = value<{ id: string }>(
    await api.propose(
      {
        question: 'Which week do we move the studio?',
        body_kind: 'options',
        body: { options: [{ id: 'early', label: 'The first week', because: 'Quieter.' }, { id: 'late', label: 'The last week', because: 'After the launch.' }] },
      } as never,
      owner,
    ),
  );
  const decided = value<{ decision: string }>(await api.decide({ id: asked.id, decide: { option: 'late', reason: 'After the launch.' } } as never, owner));
  return { question: asked.id, decision: decided.decision };
}

test('ONE THREAD: a word sent to a decision by its number is read under the question it settled', async () => {
  const { api } = await record();
  value(await api.invite({ person: 'p_guest', name: PEOPLE[4]!.name, level: 'read' } as never, owner));
  const guest: CallContext = { principal: { kind: 'person', id: 'p_guest', level: 'read' } };
  const { question, decision } = await settled(api);

  const first = value<{ id: string }>(await api.comment({ on: `suggestion:${question}`, body: 'The last week clashes with the audit.' }, guest));
  const second = value<{ id: string }>(await api.comment({ on: `decision:${decision}`, body: 'We can move the audit.' }, owner));
  const asQuestion = value<Line[]>(await api.comments({ on: `suggestion:${question}` }, owner));
  assert.deepEqual(asQuestion.map((l) => [l.id, l.by]), [[first.id, 'p_guest'], [second.id, 'p_owner']], 'two people, one thread');
  assert.deepEqual(value<Line[]>(await api.comments({ on: `decision:${decision}` }, guest)), asQuestion, 'read by the decision, it is the same thread');

  /* AND RESOLVED THERE: the author by herself, and the owner, who may decide, any of them. */
  value(await api.resolveComment({ id: first.id, as: 'addressed', why: 'The audit moved.' }, guest));
  assert.equal(refused(await api.resolveComment({ id: second.id, as: 'addressed', why: 'Done.' }, guest)).code, 'FORBIDDEN');
  value(await api.resolveComment({ id: second.id, as: 'addressed', why: 'Done.' }, owner));
});

test('WORDS KEPT ON A DECISION BEFORE IT SHARED ITS QUESTION\'S THREAD are read there, and a reply goes beside them', async () => {
  const { api } = await record();
  const { question, decision } = await settled(api);
  /* AS THE RECORD KEPT THEM BEFORE: on the decision's own target, which no screen reads. */
  const kept = value<{ id: string }>(api.kernel.writeComment({ target: `decision:${decision}`, body: 'Book the van early.', actor: 'p_owner' }));
  const reply = value<{ id: string }>(await api.comment({ on: `suggestion:${question}`, body: 'Booked.', reply_to: kept.id }, owner));
  const thread = value<Line[]>(await api.comments({ on: `suggestion:${question}` }, owner));
  assert.deepEqual(thread.map((l) => [l.id, l.reply_to]), [[kept.id, null], [reply.id, kept.id]]);
});

test('A DECISION THE LOG PAIRS WITH NO QUESTION keeps a thread of its own', async () => {
  const { api, sql } = await record();
  const { decision } = await settled(api);
  /* THE TWO LINES NO LONGER BESIDE EACH OTHER, as an imported log may hold them. */
  sql.exec("UPDATE event SET kind = 'note' WHERE kind = 'resolve' AND target LIKE 'suggestion:%'");
  const said = value<{ id: string }>(await api.comment({ on: `decision:${decision}`, body: 'Noted for next year.' }, owner));
  assert.deepEqual(value<Line[]>(await api.comments({ on: `decision:${decision}` }, owner)).map((l) => l.id), [said.id]);
});

test('NOTHING IS SENT: a body holding "@name" is kept as text and nothing is queued to anybody', async () => {
  const { api, sql, reader, ticket } = await record();
  const queued = () => sql.one<{ n: number }>('SELECT count(*) AS n FROM outbox')!.n;
  const before = queued();
  const body = `@${WRITER.handle} can you look at this before Friday? cc @${OWNER.handle}`;
  value(await api.comment({ on: ticket, body }, reader));
  assert.equal(queued(), before, 'the outbox holds what it held before');
  assert.equal(value<Line[]>(await api.comments({ on: ticket }, owner))[0]!.body, body, 'and the words are kept as written');
});
