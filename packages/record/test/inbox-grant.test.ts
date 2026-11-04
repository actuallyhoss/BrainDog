/**
 * An agent reads the money inbox when its owner grants it.
 *
 * WHAT WAS MEASURED BEFORE THIS. A token for the whole record, minted by the owner and carrying the `inbox` reach,
 * asked `inbox` and was refused `FORBIDDEN` with "This needs owner, and no token reaches it", in every state. So a
 * record whose agents triage the bank alerts no rule filed (`money_inbox`) could not have them do it.
 *
 * THE GRANT IS NARROW ON PURPOSE. It opens the read and nothing beside it: the token must be for the whole record, the
 * person behind it must still be an owner today, and it files and archives nothing. A token held to one list, a token
 * whose owner has since been moved down, a writer and a stranger are refused exactly as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type InboxPage } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 9);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** Six bank texts, one in each state an arrival can be in, so a count of one per state proves every state was counted. */
const STATES = ['untriaged', 'review', 'skipped', 'matched', 'proposed', 'ignored'] as const;

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const ids: string[] = [];
  for (const [n, state] of STATES.entries()) {
    const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Text ${n + 1}` }, body: `Debit ${n + 1}`, sha256: `s${n + 1}` });
    assert.ok(out.ok, JSON.stringify(out));
    sql.exec('UPDATE inbox_raw SET state = ? WHERE id = ?', state, out.value.raw);
    ids.push(out.value.raw);
  }
  return { sql, api, ids };
}

/** The owner's agent: a token for the whole record, minted by p_1, who is still the owner, with the `inbox` reach. */
const granted = (scope: 'read' | 'propose' | 'write' = 'read'): CallContext => ({
  principal: { kind: 'token', id: 't_inbox', scope, person: 'p_1', level: 'owner', reach: ['inbox'] },
});

const refusal = (r: { ok: boolean }): { code: string; fix: string } | null =>
  r.ok ? null : 'refusal' in r ? (r as unknown as { refusal: { code: string; fix: string } }).refusal : null;

test('A TOKEN THE OWNER MINTED WITH THE INBOX REACH READS THE INBOX IN EVERY STATE, with a count for each', async () => {
  const { api, sql } = await record();
  for (const scope of ['read', 'propose', 'write'] as const) {
    const waiting = await api.inbox(undefined, granted(scope));
    assert.ok(waiting.ok, `a ${scope} token with the reach was refused: ${JSON.stringify(refusal(waiting))}`);
    const page = waiting.value as InboxPage;
    assert.deepEqual(page.arrivals.map((a) => a.subject), ['Text 5', 'Text 2', 'Text 1'], 'the default is what waits on a person: untriaged, review and proposed');
    assert.deepEqual(page.counts, Object.fromEntries(STATES.map((s) => [s, 1])), 'a count for every state, on every page');
  }
  for (const [n, state] of STATES.entries()) {
    const one = await api.inbox({ state }, granted());
    assert.ok(one.ok, `${state} was refused: ${JSON.stringify(refusal(one))}`);
    assert.deepEqual((one.value as InboxPage).arrivals.map((a) => a.subject), [`Text ${n + 1}`], `${state} answered the wrong arrivals`);
  }
  const all = await api.inbox({ state: 'all' }, granted());
  assert.ok(all.ok);
  assert.equal((all.value as InboxPage).arrivals.length, STATES.length, 'all is every state together');
  sql.close();
});

test('THE REACH OPENS THE INBOX TO NOBODY ELSE: a scoped token, a demoted owner, a token without it, a writer and a stranger are refused FORBIDDEN', async () => {
  const { api, sql } = await record();
  const cases: [string, CallContext][] = [
    ['a token held to one list, with the reach', { ...granted(), registers: ['obligations'] }],
    ['a token with the reach whose person is a writer now', { principal: { kind: 'token', id: 't_inbox', scope: 'read', person: 'p_2', level: 'write', reach: ['inbox'] } }],
    ['a token with the reach whose person holds nothing on the record', { principal: { kind: 'token', id: 't_inbox', scope: 'read', person: 'p_3', level: null, reach: ['inbox'] } }],
    ['a record-wide token without the reach', { principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_1', level: 'owner' } }],
    ['a record-wide token with an empty reach', { principal: { kind: 'token', id: 't_3', scope: 'write', person: 'p_1', level: 'owner', reach: [] } }],
    /* A REACH THAT IS NOT A LIST IS NO REACH. `reach?.includes('inbox')` read the text "no-inbox" as a string search and
       let it in, and threw a TypeError out of the gate for the number 1. No host sets either today, but the host that
       will is reading a column back from SQLite, where a list is text until somebody parses it. */
    ['a token whose reach arrived as text', { principal: { kind: 'token', id: 't_4', scope: 'read', person: 'p_1', level: 'owner', reach: 'no-inbox' as never } }],
    ['a token whose reach arrived as a number', { principal: { kind: 'token', id: 't_5', scope: 'read', person: 'p_1', level: 'owner', reach: 1 as never } }],
    ['a writer', { principal: { kind: 'person', id: 'p_2', level: 'write' } }],
    ['a stranger', { principal: { kind: 'person', id: 'p_9', level: null } }],
  ];
  for (const [who, ctx] of cases) {
    for (const args of [undefined, { state: 'all' }]) {
      const out = await api.inbox(args, ctx);
      assert.equal(out.ok, false, `${who} read the inbox`);
      const no = refusal(out);
      assert.equal(no?.code, 'FORBIDDEN', `${who} was refused with ${no?.code}`);
      assert.ok((no?.fix.length ?? 0) > 20, `${who} was refused without a sentence`);
      assert.doesNotMatch(no?.fix ?? '', /Text \d|Debit/, `${who} was told what the inbox holds`);
    }
  }
  sql.close();
});

test("THE TWO OLDER VERBS STAY A PERSON'S: fileArrival and archiveArrival refuse a token with the reach, which files through triage", async () => {
  const { api, sql, ids } = await record();
  /* `NEEDS_BROWSER_SESSION`, WHICH IS `admin`'S ANSWER TO EVERY TOKEN. This asserted `FORBIDDEN` first and was wrong:
     the refusal is the one a token of any scope gets from any ADMIN method, which is the point, since the reach was
     never asked. */
  const filed = await api.fileArrival({ id: ids[0]!, register: 'obligations' }, granted('write'));
  assert.equal(refusal(filed)?.code, 'NEEDS_BROWSER_SESSION', 'a token filed an arrival');
  const archived = await api.archiveArrival({ id: ids[0]! }, granted('write'));
  assert.equal(refusal(archived)?.code, 'NEEDS_BROWSER_SESSION', 'a token archived an arrival');
  const after = await api.inbox({ state: 'untriaged' }, granted());
  assert.ok(after.ok);
  assert.deepEqual((after.value as InboxPage).arrivals.map((a) => a.subject), ['Text 1'], 'a refused triage moved the arrival anyway');
  sql.close();
});
