/**
 * `GET /account/ops/people` (`src/people.ts`), a security path: who it opens to, on the Worker itself and over fakes, and
 * that what it answers holds nothing out of anybody's record, whatever the record holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PeopleLine, PeopleRead, PeopleRecord } from '@braindog/record/directory';

import { OPERATOR, startCloud } from './cloud-serve.ts';
import { PEOPLE_ASK_MOST, PEOPLE_CHUNK, PEOPLE_FRESH_MS, opsPeople, peopleOf, type PeopleDeps } from '../src/people.ts';

const KEY = 'operator-key-for-tests';
const NOW = Date.parse('2026-11-07T12:00:00Z');
const at = (headers: Record<string, string> = { authorization: `Bearer ${KEY}` }, method = 'GET'): Request =>
  new Request('https://example.dog/account/ops/people', { method, headers });

const record = (over: Partial<PeopleRecord> = {}): PeopleRecord => ({
  record: 'rec_one',
  slug: 'one',
  role: 'owner',
  members: 1,
  plan: 'free',
  pay: null,
  since: NOW - 86_400_000,
  name: null,
  agents: null,
  files: null,
  asked_at: null,
  agents_most: 3,
  files_most: 1_000,
  runs_7: 0,
  runs_30: 0,
  actions_30: 0,
  month: { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 },
  allowance: { runs: 1_000, requests: 10_000, bytes: 100, ms: 100 },
  asks: 0,
  credits: 20,
  asks_spent: false,
  ...over,
});

const person = (over: Partial<PeopleLine> = {}): PeopleLine => ({
  email: 'one@example.test',
  name: 'One',
  created_at: NOW - 86_400_000,
  suspended: false,
  passkeys: 0,
  seen: null,
  came: 'open',
  records: [],
  ...over,
});

const deps = (over: Partial<PeopleDeps> = {}): PeopleDeps => ({
  key: KEY,
  readLimit: async () => null,
  unauthorized: () => new Response('{}', { status: 401 }),
  read: () => ({ total: 0, records: 0, people: [] }),
  held: async () => ({ name: 'A name', agents: 1, files: 2 }),
  keep: () => {},
  now: () => NOW,
  ...over,
});

test('the guard is the funnel door\'s: 404 to anyone without the session or a key, GET only, 401 on a wrong key', async () => {
  let reads = 0;
  const counted = deps({ read: () => ((reads += 1), { total: 0, records: 0, people: [] }) });
  assert.equal((await opsPeople(at(), deps({ key: '' }))).status, 404, 'no key on this host');
  assert.equal((await opsPeople(at({}), counted)).status, 404, 'nobody');
  assert.equal((await opsPeople(at({}), deps({ operator: false }))).status, 404, 'a session that is not the operator');
  assert.equal((await opsPeople(at(undefined, 'POST'), counted)).status, 405);
  assert.equal((await opsPeople(at({ authorization: 'Bearer wrong' }), counted)).status, 401, 'a wrong key');
  assert.equal(reads, 0, 'none of them read anything');
  const limited = await opsPeople(at(), deps({ readLimit: async () => new Response('{}', { status: 429 }) }));
  assert.equal(limited.status, 429);
  assert.equal((await opsPeople(at({}), deps({ operator: true }))).status, 200);
  assert.equal((await opsPeople(at(), deps())).status, 200);
});

test('a bearer beside the operator\'s session is read as a bearer: the session does not excuse a wrong key', async () => {
  assert.equal((await opsPeople(at({ authorization: 'Bearer wrong' }), deps({ operator: true }))).status, 401);
});

test('what the Directory read holds past the named fields does not leave', async () => {
  const line = person({ records: [record({ name: 'Studio' })] });
  const planted = {
    ...line,
    id: 'p_SECRET',
    note: 'SECRET note',
    records: line.records.map((r) => ({ ...r, title: 'SECRET row', project: 'SECRET project', label: 'SECRET key label', cents: 4_800 })),
  } as unknown as PeopleLine;
  const read: PeopleRead = { total: 1, records: 1, people: [planted] };
  const body = await (await opsPeople(at(), deps({ read: () => read, held: async () => ({ name: 'Studio', agents: 1, files: 2 }) }))).text();
  assert.doesNotMatch(body, /SECRET|cents|rec_one/);
  assert.match(body, /Studio/);
});

test('a record is asked only when its answer has gone stale, twenty at a time and at most a hundred', async () => {
  const ids = Array.from({ length: PEOPLE_ASK_MOST + 15 }, (_, i) => `rec_${String(i)}`);
  let flying = 0;
  let most = 0;
  const asked: string[] = [];
  const kept: string[] = [];
  const read: PeopleRead = {
    total: ids.length + 1,
    records: ids.length + 1,
    people: [
      person({ email: 'fresh@example.test', records: [record({ record: 'rec_fresh', asked_at: NOW - PEOPLE_FRESH_MS + 1, agents: 4, files: 5 })] }),
      ...ids.map((id, i) => person({ email: `p${String(i)}@example.test`, seen: NOW - i, records: [record({ record: id })] })),
    ],
  };
  const out = await peopleOf(
    deps({
      read: () => read,
      held: async (id) => {
        flying += 1;
        most = Math.max(most, flying);
        asked.push(id);
        await new Promise((done) => setTimeout(done, 1));
        flying -= 1;
        return id === 'rec_3' ? null : { name: null, agents: 2, files: 0 };
      },
      keep: (rows) => void kept.push(...rows.map((r) => r.record)),
    }),
  );
  assert.equal(asked.length, PEOPLE_ASK_MOST);
  assert.equal(most, PEOPLE_CHUNK);
  assert.ok(!asked.includes('rec_fresh'), 'a fresh record stays asleep');
  assert.equal(out.asked, PEOPLE_ASK_MOST);
  assert.equal(out.missed, 1);
  assert.equal(out.waiting, 15);
  assert.equal(kept.length, PEOPLE_ASK_MOST - 1);
  assert.ok(!kept.includes('rec_3'), 'a record that could not say is not kept as having said');
  assert.equal(out.people[0]!.records[0]!.agents, 4);
});

test('a record shared by two people is asked once', async () => {
  let asked = 0;
  const shared = record({ record: 'rec_shared' });
  const out = await peopleOf(
    deps({
      read: () => ({ total: 2, records: 1, people: [person({ records: [{ ...shared }] }), person({ email: 'two@example.test', records: [{ ...shared, role: 'member' }] })] }),
      held: async () => ((asked += 1), { name: 'Shared', agents: 1, files: 0 }),
    }),
  );
  assert.equal(asked, 1);
  assert.deepEqual(out.people.map((p) => p.records[0]!.name), ['Shared', 'Shared']);
});

test('limits are read from the month and the plan, and nothing is called a limit that has not been reached', async () => {
  const out = await peopleOf(
    deps({
      read: () => ({
        total: 2,
        records: 2,
        people: [
          person({ records: [record({ record: 'a', asked_at: NOW, agents: 3, files: 1, asks: 20, asks_spent: true, month: { runs: 1_000, requests: 1, bytes: 1, ms: 1, failures: 0, held: 2 } })] }),
          person({ email: 'b@example.test', records: [record({ record: 'b', asked_at: NOW, agents: 2, files: 1, asks: 19, month: { runs: 999, requests: 1, bytes: 1, ms: 1, failures: 9, held: 0 } })] }),
        ],
      }),
    }),
  );
  assert.deepEqual(out.people[0]!.records[0]!.limits, ['runs', 'held', 'asks', 'agents']);
  assert.deepEqual(out.people[1]!.records[0]!.limits, []);
});

test('on the Worker: the operator reads it, nobody else does, and nothing of a record comes back', async () => {
  const MARK = 'ZZSECRET';
  const running = await startCloud({ env: { OPERATOR_EMAILS: 'boss@example.test', SESSION_SECRET: 'x'.repeat(40) } });
  try {
    const boss = await running.provision('boss@example.test', { slug: 'boss-record', name: 'Boss' });
    const other = await running.provision('other@example.test', { slug: 'other-record', name: 'Other' });
    /* A RECORD WITH THINGS IN IT THAT MUST STAY THERE: a project, a row and a key, each carrying the mark. */
    const send = async (name: string, body: unknown): Promise<Record<string, unknown>> => {
      const res = await running.ask(`/api/${name}`, { method: 'POST', cookie: other.cookie, body: JSON.stringify(body) });
      const out = (await res.json()) as { ok: boolean; value?: Record<string, unknown>; refusal?: { fix?: string } };
      assert.equal(out.ok, true, `${name}: ${out.refusal?.fix ?? ''}`);
      return out.value ?? {};
    };
    await send('propose', { question: `${MARK} a question`, body_kind: 'options', body: { context: `${MARK} context`, options: [{ id: 'a', label: `${MARK} option`, because: `${MARK} why` }, { id: 'b', label: 'No', because: 'No' }] } });
    await send('createToken', { label: `${MARK} key label`, scope: 'read', days: 30 });

    const door = '/account/ops/people';
    assert.equal((await running.ask(door)).status, 404, 'anonymous');
    assert.equal((await running.ask(door, { cookie: other.cookie })).status, 404, 'a person who is not the operator');
    assert.equal((await running.ask(door, { bearer: 'not-the-key' })).status, 401, 'a wrong bearer');
    /* A WRONG BEARER IS NOT FORGIVEN BY THE OPERATOR'S COOKIE BESIDE IT. */
    assert.equal((await running.ask(door, { bearer: 'not-the-key', cookie: boss.cookie })).status, 401);

    const seen = await running.ask(door, { cookie: boss.cookie });
    assert.equal(seen.status, 200, 'the operator\'s session');
    assert.equal(seen.headers.get('cache-control'), 'no-store');
    const text = await seen.text();
    assert.equal((await running.ask(door, { bearer: OPERATOR })).status, 200, 'the operator\'s key');

    assert.doesNotMatch(text, new RegExp(MARK), 'nothing typed into the record');
    assert.doesNotMatch(text, /rec_/, 'no record id');
    assert.doesNotMatch(text, /"p_/, 'no person id');
    assert.doesNotMatch(text, /cents|price|customer|cus_|sub_/, 'no money and no billing reference');

    const value = (JSON.parse(text) as { value: { total: number; records: number; asked: number; people: { email: string; records: { slug: string; agents: number | null; plan: string }[] }[] } }).value;
    assert.equal(value.total, 2);
    assert.equal(value.records, 2);
    const line = value.people.find((p) => p.email === 'other@example.test');
    assert.equal(line?.records[0]?.slug, 'other-record');
    assert.equal(line?.records[0]?.agents, 1, 'the key is counted and its label is not said');

    /* THE SECOND OPEN WAKES NOBODY: both records answered a moment ago. */
    const again = (await (await running.ask(door, { cookie: boss.cookie })).json()) as { value: { asked: number } };
    assert.equal(value.asked, 2);
    assert.equal(again.value.asked, 0);
  } finally {
    await running.close();
  }
});
