/**
 * Somebody invited to one list, reading the parts of the record that are not rows: the decisions, the read mark, and a
 * page's activity block.
 *
 * Batch fourteen's audit drove each of these against a real record through a member holding a grant on ONE list and
 * found four ways through. Every test here builds that member the way the host does, from `kernel.access`, and asks
 * what they can learn about the list they were not invited to. The answer has to be nothing, including a timestamp.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type HistoryPage } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const LOG = {
  id: 'page.log',
  kind: 'page' as const,
  body: { page: 'log', title: 'Log', blocks: [{ kind: 'feed', source: 'activity', since: 'seen', empty: 'Nothing yet.' }] } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY, LOG])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  return { api, sql, clock };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A colleague invited to read Obligations and nothing else, built the way the host builds them. */
async function wren(api: Awaited<ReturnType<typeof record>>['api']): Promise<CallContext> {
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { obligations: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  assert.equal(held.level, null, 'the member this file is about holds nothing on the record');
  return { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
}

/** Ask a question about one list and answer it as the owner, with a reason that must stay on that list. */
async function settle(api: Awaited<ReturnType<typeof record>>['api'], register: string, question: string, reason: string): Promise<string> {
  const rows = register === 'diary' ? [{ body: 'Dinner with the auditor' }] : [{ what: 'Invoice 41', state: 'open' }];
  const asked = value<{ id: string }>(await api.propose({ question, body_kind: 'rowset', body: { register, rows } } as never, agent));
  const done = value<{ decision: string }>(await api.decide({ id: asked.id, decide: { option: 'accept', reason } }, owner));
  return done.decision;
}

test('A DECISION ABOUT A LIST SOMEBODY CANNOT READ IS NOT THEIRS TO READ, its question and its reason included', async () => {
  const { api, sql } = await record();
  const reader = await wren(api);
  const hidden = await settle(api, 'diary', 'File the diary entry about the auditor?', 'The auditor must not know');
  const theirs = await settle(api, 'obligations', 'File invoice 41?', 'It is ours');

  /* THE SUGGESTION WAS ALREADY HELD BACK, and its decision was not: the audit read the question and the reason of the
     diary one straight off the list. */
  const decisions = value<{ id: string; question: string; reason: string }[]>(await api.governance({ register: 'decision' }, reader));
  assert.deepEqual(decisions.map((d) => d.id), [theirs], 'a scoped member read a decision about a list they were not invited to');
  assert.equal(value(await api.governance({ register: 'decision', id: hidden }, reader)), null, 'and one by id walked straight past the filter');

  /* THE OWNER STILL READS BOTH, so the filter is about sight and not a decision table that went missing. */
  assert.deepEqual(value<{ id: string }[]>(await api.governance({ register: 'decision' }, owner)).map((d) => d.id).sort(), [hidden, theirs].sort());

  /* AND THE LOG ASKS THE SAME QUESTION ONE EVENT AT A TIME: the `decide` line carried the question as its title. */
  const lines = value<HistoryPage>(await api.recentHistory(undefined, reader)).events;
  assert.ok(!lines.some((e) => e.target === `decision:${hidden}`), 'the history named the hidden decision');
  assert.ok(lines.some((e) => e.target === `decision:${theirs}`), 'and it must still name the one they may see');

  /* AND THE COUNT IS OF WHAT THEY MAY READ. Boot handed them the table's count, 2, for a list that shows them 1, and the
     Decisions screen draws that number as how many there are to page through. */
  type Counted = { counts: { decided: number } };
  assert.equal(value<Counted>(await api.boot(reader)).counts.decided, 1, 'boot counted a decision the list holds back');
  assert.equal(value<Counted>(await api.boot(owner)).counts.decided, 2);
  sql.close();
});

test('A READ MARK TELLS A SCOPED MEMBER NOTHING ABOUT AN EVENT THEY CANNOT SEE', async () => {
  const { api, sql, clock } = await record();
  const reader = await wren(api);
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const visible = value<HistoryPage>(await api.recentHistory(undefined, reader)).events[0]!;
  clock.advance(3_600_000);
  value(await api.create({ register: 'diary', fields: { body: 'Dinner with the auditor' } }, owner));
  const secret = value<HistoryPage>(await api.recentHistory(undefined, owner)).events[0]!;
  assert.equal(secret.target_kind, 'entry');
  assert.notEqual(secret.ts, visible.ts, 'the probe needs two instants to tell apart');

  /* NAMED OUTRIGHT, the hidden event's number came back with its exact time: one call per rowid read the whole log's
     clock, which is when the owner wrote in a list this member was never shown. */
  const named = value<{ upTo: number | null; seen_at: string | null }>(await api.markRead({ upTo: secret.rowid }, reader));
  assert.notEqual(named.seen_at, secret.ts, 'markRead answered the time of an event the read half hides');
  assert.equal(named.seen_at, visible.ts, 'the mark is the newest event they may see at or below what they asked for');
  assert.equal(named.upTo, visible.rowid);

  /* AND WITH NO ARGUMENT, which means the newest event, and the newest is the hidden one. */
  const all = value<{ seen_at: string | null }>(await api.markRead(undefined, reader));
  assert.equal(all.seen_at, visible.ts);

  /* THE OWNER SEES BOTH, so their mark still reaches the newest. */
  assert.equal(value<{ seen_at: string | null }>(await api.markRead(undefined, owner)).seen_at, secret.ts);
  sql.close();
});

test('`markRead` REFUSES AN `upTo` THAT IS NOT AN EVENT, as `whatsNew` refuses a cursor that is not one', async () => {
  /* THE ROUTE PASSES THE BODY THROUGH, so `{ "upTo": true }` reached the SQL binding and came out a 500, where the same
     mistake in `whatsNew`'s cursor is a 422 with a sentence. */
  const { api, sql } = await record();
  const reader = await wren(api);
  const cursor = (await api.whatsNew({ cursor: true } as never, reader)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(cursor.refusal?.code, 'VALUE_MALFORMED');
  for (const upTo of [true, 'twelve', 0, -3, 1.5]) {
    const out = (await api.markRead({ upTo } as never, reader)) as { ok: boolean; refusal?: { code: string; at?: string } };
    assert.equal(out.ok, false, `upTo ${JSON.stringify(upTo)} was taken`);
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED', `upTo ${JSON.stringify(upTo)}`);
    assert.equal(out.refusal?.at, 'upTo');
  }
  sql.close();
});

test("A TOKEN'S ACTIVITY FEED READS ITS PERSON'S MARK, not a mark nobody could ever set", async () => {
  /* THE BLOCK LOOKED THE MARK UP BY `principal.id`, which for a token is `t_1`, and no member row has that id. So a
     person's agent drew every line of the feed as unread however far the person had read, while `whatsNew` for the
     same token read the person's mark and agreed with them. */
  const { api, sql } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } }, owner));
  const marked = value<{ seen_at: string | null }>(await api.markRead(undefined, owner));
  assert.ok(marked.seen_at);
  const reading: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'read', person: 'p_1', level: 'owner' } };
  type Feed = { blocks: { seen?: string | null; refusals?: unknown[] }[] };
  const block = value<Feed>(await api.page({ slug: 'log' }, reading)).blocks[0]!;
  assert.deepEqual(block.refusals ?? [], [], 'the token must be one that may read the activity block at all');
  assert.equal(block.seen, marked.seen_at, "the token's feed drew every line as unread");
  sql.close();
});
