/**
 * The triage door, held on its own: the one door an agent files, sets aside and puts back an arrival through.
 *
 * WHY THIS FILE EXISTS. `triage` (`src/methods/agents.ts`) was built beside the `inbox` reach and no test asked it
 * anything: `inbox-grant.test.ts` holds the read and holds that the two older verbs stay a person's, and nothing held
 * what the door itself files, which tokens it lets in, or that a retried call files one row. An agent's owner gives
 * the reach so the agent can sort bank texts no rule filed, and this is the door those texts are sorted through.
 *
 * WHAT IS HELD. A filing with fields and one with none, a setting aside, a put back, the same call twice answering
 * one row, and the four tokens that must not file: one without the reach, which is told the door's own sentence; a
 * read token with the reach, which reads the inbox and files nothing; and a token held to one list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type InboxPage } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'payee', type: 'text' },
    ],
  } as never,
};

/** The door's own sentence for every token without the reach (`NO_REACH` in `src/methods/agents.ts`). */
const NO_REACH = 'Triage needs a token its owner gave the inbox reach. The owner mints one with braindog token create --inbox.';

/** A record with three bank texts waiting, each `untriaged`. */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  const ids: string[] = [];
  for (const n of [1, 2, 3]) {
    const out = api.kernel.arrive({ channel: 'webhook', headers: { From: 'BANK', Subject: `Water bill ${n}` }, body: `Debit ${n}00 to City Water`, sha256: `s${n}` });
    assert.ok(out.ok, JSON.stringify(out));
    ids.push(out.value.raw);
  }
  return { sql, api, ids };
}

/** The owner's agent: a token for the whole record, minted by p_1, who is still the owner, with the `inbox` reach. */
const agent = (scope: 'read' | 'propose' | 'write' = 'write'): CallContext => ({
  principal: { kind: 'token', id: 't_triage', scope, person: 'p_1', level: 'owner', reach: ['inbox'] },
  session: { agent: 'claude', client: 'triage-door-test' },
});

const refusal = (r: { ok: boolean }): { code: string; fix: string } | null =>
  r.ok ? null : 'refusal' in r ? (r as unknown as { refusal: { code: string; fix: string } }).refusal : null;

/** The obligations on the record, by their fields, as the owner lists them. */
async function obligations(api: Awaited<ReturnType<typeof record>>['api']) {
  const got = await api.list({ register: 'obligations' }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } });
  assert.ok(got.ok, JSON.stringify(got));
  return (got.value as { rows: { id: string; version: number; fields: Record<string, unknown> }[] }).rows;
}

/** One arrival's state, as the agent reads the whole inbox. */
async function stateOf(api: Awaited<ReturnType<typeof record>>['api'], id: string): Promise<string | undefined> {
  const all = await api.inbox({ state: 'all' }, agent('read'));
  assert.ok(all.ok, JSON.stringify(all));
  return (all.value as InboxPage).arrivals.find((a) => a.id === id)?.state;
}

test('A TOKEN WITH THE REACH FILES AN ARRIVAL WITH THE FIELDS IT GIVES, and the row and the arrival are signed by its run', async () => {
  const { api, sql, ids } = await record();
  const out = await api.triage({ arrival: ids[0]!, register: 'obligations', fields: { what: 'Water, October', payee: 'City Water' }, note: 'Monthly water bill.' }, agent());
  assert.ok(out.ok, JSON.stringify(refusal(out)));
  assert.equal(out.value.state, 'matched');
  assert.equal(out.value.already, false);
  const rows = await obligations(api);
  assert.equal(rows.length, 1);
  assert.deepEqual({ what: rows[0]!.fields.what, payee: rows[0]!.fields.payee }, { what: 'Water, October', payee: 'City Water' });
  assert.equal(await stateOf(api, ids[0]!), 'matched');
  /* SIGNED BY THE RUN, `S<n>`, and never by the token's id or the person behind it. */
  const by = (await api.inbox({ state: 'matched' }, agent('read'))) as { ok: true; value: InboxPage };
  assert.match(by.value.arrivals[0]!.settled?.by ?? '', /^S\d+$/, JSON.stringify(by.value.arrivals[0]!.settled));
  sql.close();
});

test('A FILING WITH NO FIELDS IS TITLED FROM THE ARRIVAL', async () => {
  const { api, sql, ids } = await record();
  const out = await api.triage({ arrival: ids[1]!, register: 'obligations' }, agent());
  assert.ok(out.ok, JSON.stringify(refusal(out)));
  const rows = await obligations(api);
  assert.equal(rows.length, 1);
  assert.equal(typeof rows[0]!.fields.what, 'string');
  assert.ok((rows[0]!.fields.what as string).length > 0, 'a row filed with no fields has no title');
  sql.close();
});

test('IGNORE SETS AN ARRIVAL ASIDE AND FILES NO ROW', async () => {
  const { api, sql, ids } = await record();
  const out = await api.triage({ arrival: ids[2]!, ignore: true }, agent());
  assert.ok(out.ok, JSON.stringify(refusal(out)));
  assert.equal(out.value.state, 'ignored');
  assert.deepEqual(await obligations(api), []);
  assert.equal(await stateOf(api, ids[2]!), 'ignored');
  sql.close();
});

test('BACK PUTS A FILED ARRIVAL BACK IN THE INBOX, archiving the row at the version the agent read', async () => {
  const { api, sql, ids } = await record();
  const filed = await api.triage({ arrival: ids[0]!, register: 'obligations', fields: { what: 'Water, October' } }, agent());
  assert.ok(filed.ok, JSON.stringify(refusal(filed)));
  const [row] = await obligations(api);
  /* WITHOUT THE VERSION, the door asks for it: the row was filed, and archiving it needs the one the agent read. */
  const bare = await api.triage({ arrival: ids[0]!, back: true }, agent());
  assert.equal(refusal(bare)?.code, 'REQUIRED_MISSING');
  const back = await api.triage({ arrival: ids[0]!, back: true, version: row!.version }, agent());
  assert.ok(back.ok, JSON.stringify(refusal(back)));
  assert.equal(back.value.state, 'untriaged');
  assert.equal(await stateOf(api, ids[0]!), 'untriaged');
  assert.deepEqual(await obligations(api), [], 'the row a put back archives is still listed');
  /* AND A SET-ASIDE ONE COMES BACK TOO, with no version, since it made no row. */
  assert.ok((await api.triage({ arrival: ids[1]!, ignore: true }, agent())).ok);
  const unset = await api.triage({ arrival: ids[1]!, back: true }, agent());
  assert.ok(unset.ok, JSON.stringify(refusal(unset)));
  assert.equal(await stateOf(api, ids[1]!), 'untriaged');
  sql.close();
});

test('THE SAME CALL TWICE IS ONE ROW: the second answers the first row and writes nothing', async () => {
  const { api, sql, ids } = await record();
  const call = { arrival: ids[0]!, register: 'obligations', fields: { what: 'Water, October' } };
  const first = await api.triage(call, agent());
  const second = await api.triage(call, agent());
  assert.ok(first.ok && second.ok, JSON.stringify([refusal(first), refusal(second)]));
  assert.equal(first.value.already, false);
  assert.equal(second.value.already, true, 'the retry did not say the arrival was already filed');
  assert.equal(second.value.entry?.id, first.value.entry?.id, 'the retry answered a different row');
  assert.equal((await obligations(api)).length, 1, 'a retried filing made a second row');
  sql.close();
});

test("A TOKEN WITHOUT THE REACH IS REFUSED IN THE DOOR'S OWN SENTENCE, and nothing moves", async () => {
  const { api, sql, ids } = await record();
  const without: [string, CallContext][] = [
    ['a write token for the whole record', { principal: { kind: 'token', id: 't_2', scope: 'write', person: 'p_1', level: 'owner' } }],
    ['a token with an empty reach', { principal: { kind: 'token', id: 't_3', scope: 'write', person: 'p_1', level: 'owner', reach: [] } }],
    ['a token whose reach arrived as text', { principal: { kind: 'token', id: 't_4', scope: 'write', person: 'p_1', level: 'owner', reach: 'no-inbox' as never } }],
    ['a token with the reach whose person is a writer now', { principal: { kind: 'token', id: 't_5', scope: 'write', person: 'p_2', level: 'write', reach: ['inbox'] } }],
  ];
  for (const [who, ctx] of without) {
    for (const args of [{ arrival: ids[0]!, register: 'obligations' }, { arrival: ids[0]!, ignore: true as const }, { arrival: ids[0]!, back: true as const }]) {
      const out = await api.triage(args, ctx);
      const no = refusal(out);
      assert.equal(no?.code, 'FORBIDDEN', `${who} was answered ${JSON.stringify(no)}`);
      assert.equal(no?.fix, NO_REACH, `${who} was told something other than the door's sentence`);
    }
  }
  assert.equal(await stateOf(api, ids[0]!), 'untriaged');
  assert.deepEqual(await obligations(api), []);
  sql.close();
});

test('A READ TOKEN WITH THE REACH READS THE INBOX AND FILES NOTHING', async () => {
  const { api, sql, ids } = await record();
  const read = await api.inbox(undefined, agent('read'));
  assert.ok(read.ok, JSON.stringify(refusal(read)));
  assert.equal((read.value as InboxPage).arrivals.length, 3);
  for (const args of [{ arrival: ids[0]!, register: 'obligations' }, { arrival: ids[0]!, ignore: true as const }, { arrival: ids[0]!, back: true as const }]) {
    const out = await api.triage(args, agent('read'));
    assert.equal(out.ok, false, `a read token triaged with ${JSON.stringify(args)}`);
    assert.equal(refusal(out)?.code, 'FORBIDDEN', JSON.stringify(refusal(out)));
  }
  assert.equal(await stateOf(api, ids[0]!), 'untriaged');
  assert.deepEqual(await obligations(api), []);
  sql.close();
});

test('A TOKEN HELD TO ONE LIST IS REFUSED, reach or no reach: the inbox is the whole record’s', async () => {
  const { api, sql, ids } = await record();
  const held: CallContext = { ...agent(), registers: ['obligations'] };
  const out = await api.triage({ arrival: ids[0]!, register: 'obligations' }, held);
  assert.equal(refusal(out)?.code, 'FORBIDDEN', JSON.stringify(refusal(out)));
  assert.match(refusal(out)?.fix ?? '', /all of this BrainDog/);
  assert.doesNotMatch(refusal(out)?.fix ?? '', /Debit|Water bill/, 'the refusal told a held token what the inbox holds');
  assert.equal(await stateOf(api, ids[0]!), 'untriaged');
  assert.deepEqual(await obligations(api), []);
  sql.close();
});
