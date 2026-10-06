/**
 * Batch 17's understanding layer, wired end to end through the kernel: a rule meets the sender of a mail by the parts the
 * door read, an organisation by a payee key, a bare name as a mention; a subagent's run is placed where its parent is;
 * the nightly pairs a model left out are asked again; and a merge question hands the queue its names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, pairHash, type Declaration, type Entry, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never,
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', kind: 'kind', domain: 'domain', keys: 'keys', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['company', 'employer', 'client', 'vendor', 'merchant', 'bank', 'other'] },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  } as never,
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', org: 'org' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'org', type: 'ref', to: 'organisations' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things', scope: {} }] } as never,
};

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

async function record(...more: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ORGS, PEOPLE, TASKS, ...more]));
  return { k, sql };
}

const steps = (sql: NodeSql, rule: string) =>
  sql.all<{ state: string; answer: string | null }>(
    "SELECT s.state, s.answer FROM automation_step s JOIN automation_run r ON r.id = s.run WHERE r.rule = ? AND s.kind = 'meet' ORDER BY r.rowid, s.n",
    rule,
  );

test('THE org: ROLE INSTALLS ON A LIST, and a second list declaring it is refused', async () => {
  const { k, sql } = await record();
  assert.equal(k.orgsList()?.register, 'organisations');
  const second = await k.install([{ ...ORGS, id: 'register.companies', body: { ...(ORGS.body as object), id: 'companies', fields: (ORGS.body as { fields: object[] }).fields.map((f) => ((f as { id: string }).id === 'merged_into' ? { ...f, to: 'companies' } : f)) } as never }]);
  assert.equal(second.ok, false);
  assert.match((second as { refusal: { fix: string } }).refusal.fix, /already declares org:/);
  sql.close();
});

test('A MAIL IS READ BY ITS PARTS IN A RULE: {{trigger.body.from_address}} meets the sender, and a bare name is only a mention', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'meet-senders',
      on: { arrival: { channel: 'email' } },
      steps: [{ meet: { email: '{{trigger.body.from_address}}', name: '{{trigger.body.from_name}}', where: 'mail: {{trigger.body.subject}}', source: 'mail from {{trigger.body.from_domain}}' } }],
    }),
    rule({ rule: 'note-names', on: { arrival: { channel: 'email' } }, steps: [{ meet: { name: '{{trigger.body.from_name}}', where: 'mail' } }] }),
  );
  value(k.arrive({ channel: 'email', headers: { from: '"Sara Ali" <Sara@Halden.example>', subject: 'The kiln' }, body: 'Hello.', sha256: 'm1', verified: true }));
  await k.drain();
  const sara = k.list({ register: 'people' });
  assert.ok(sara.ok);
  assert.deepEqual(sara.value.rows.map((r) => [r.fields.name, r.fields.email]), [['Sara Ali', 'sara@halden.example']]);
  assert.deepEqual(steps(sql, 'meet-senders').map((s) => s.state), ['done']);
  /* The run's history names her, never her row's id. */
  assert.deepEqual(steps(sql, 'meet-senders').map((s) => s.answer), ['Sara Ali, added']);
  /* A name alone adds nobody, and the run says so. */
  const named = steps(sql, 'note-names');
  assert.equal(named[0]?.state, 'skipped');
  assert.equal(k.count('people'), 1);
  sql.close();
});

test('A RULE MEETS AS UNTRUSTED WHATEVER ITS SOURCE SAYS: a stranger who looks like someone known is asked about, never added', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'meet-inbox',
      on: { arrival: { channel: 'email' } },
      steps: [{ meet: { email: '{{trigger.body.from_address}}', name: '{{trigger.body.from_name}}', where: 'the inbox', source: 'the inbox' } }],
    }),
  );
  value(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  value(k.arrive({ channel: 'email', headers: { from: '"Ada Lovelace" <ada@elsewhere.example>' }, body: 'Hi.', sha256: 'u1', verified: true }));
  await k.drain();
  assert.equal(k.count('people'), 1, 'a source worded "the inbox" is still text anybody could have written');
  assert.deepEqual(steps(sql, 'meet-inbox').map((s) => s.answer), ['Nobody added: they look like someone already known, and a question asks whether the new address is theirs.']);
  const asked = sql.all<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE status = 'open' AND body_kind = 'rowset'");
  assert.equal(asked[0]?.n, 1);
  /* HER OWN ADDRESS IS STILL HER: an exact key is met as before. */
  value(k.arrive({ channel: 'email', headers: { from: 'Ada Lovelace <ada@example.com>' }, body: 'Again.', sha256: 'u2', verified: true }));
  await k.drain();
  assert.equal(k.count('people'), 1);
  assert.equal(steps(sql, 'meet-inbox').at(-1)?.answer, 'Ada Lovelace');
  sql.close();
});

test('A meet STEP TAKES kind AND keys: a payee meets one organisation, and a key that fills with nothing is dropped', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'meet-payee',
      on: { arrival: { channel: 'webhook' } },
      steps: [{ meet: { kind: 'organisation', name: '{{trigger.body.payee}}', keys: ['bank:{{trigger.body.payee}}'], role: 'merchant', where: 'bank text' } }],
    }),
  );
  value(k.arrive({ channel: 'webhook', body: JSON.stringify({ payee: 'GEIDEA*CHILLOUT 0423 CAIRO EG' }), sha256: 'w1', verified: true }));
  value(k.arrive({ channel: 'webhook', body: JSON.stringify({ payee: 'Chill Out' }), sha256: 'w2', verified: true }));
  value(k.arrive({ channel: 'webhook', body: JSON.stringify({ other: 1 }), sha256: 'w3', verified: true }));
  await k.drain();
  assert.equal(k.count('organisations'), 1, 'one merchant by its payee, however the bank printed it');
  assert.deepEqual(steps(sql, 'meet-payee').map((s) => s.state), ['done', 'done', 'skipped']);

  /* The lint reads the same keys: a kind that is neither is refused, and keys alone say who. */
  const odd = await k.install([rule({ rule: 'odd', on: { arrival: { channel: 'webhook' } }, steps: [{ meet: { kind: 'robot', keys: ['bank:x'], where: 'x' } }] })]);
  assert.equal((odd as { refusal?: { at?: string } }).refusal?.at, 'steps[0].meet.kind');
  value(await k.install([rule({ rule: 'keyed', on: { arrival: { channel: 'webhook' } }, steps: [{ meet: { keys: 'domain:{{trigger.body.site}}', kind: 'organisation', where: 'x' } }] })]));
  sql.close();
});

test('A SUBAGENT’S RUN IS PLACED WHERE ITS PARENT IS, once, when nothing else places it', async () => {
  const { k, sql } = await record();
  const project = value<Entry>(k.create('things', { name: 'BrainDog', repos: ['github.com/acme/braindog'] }, OWNER));
  const as = (session: Record<string, string>): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session });
  value(k.create('tasks', { what: 'Lead' }, as({ client_id: 'cc-1', remote: 'git@github.com:acme/braindog.git' })));
  assert.equal(k.get('S1')?.fields.project, `things#${project.seq}`);
  /* The subagent works in a scratch folder that names no project. */
  const made = value<Entry>(k.create('tasks', { what: 'Helper' }, as({ client_id: 'cc-2', cwd: '/private/tmp/scratch', parent: 'S1' })));
  assert.equal(k.get('S2')?.fields.project, `things#${project.seq}`);
  assert.equal(made.fields.thing, project.id);
  sql.close();
});

test('THE NIGHT’S PAIRS A MODEL LEFT OUT ARE ASKED AGAIN, and the ones it answered are not', async () => {
  const { k, sql } = await record();
  for (const [name, email] of [
    ['Sam Ortiz', 'sam@one.example'],
    ['Sam Ortiz', 'sortiz@two.example'],
    ['Lee Park', 'lee@one.example'],
    ['Lee Park', 'lpark@two.example'],
  ] as const)
    value(k.create('people', { name, email }, OWNER));
  const nightly = () => sql.all<{ id: string; payload: string }>("SELECT id, payload FROM outbox WHERE kind = 'infer.resolve' ORDER BY rowid");
  /* The nightly sweep queues it (`sweepRecord`, which `purge` runs). */
  k.purge();
  const [job] = k.leaseOutbox(['infer.resolve'], 5);
  assert.ok(job, 'no infer.resolve job was queued or leased');
  const pairs = (JSON.parse(job.payload) as { pairs: { hash: string }[] }).pairs;
  assert.equal(pairs.length, 2);
  /* The host showed the model one pair and said nothing of the other. */
  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { verdicts: [{ hash: pairs[0]!.hash, same: false, confidence: 0.2 }] } } as never));
  const kept = JSON.parse(nightly()[0]!.payload) as { pairs: { hash: string }[] };
  assert.deepEqual(kept.pairs.map((p) => p.hash), [pairs[0]!.hash]);
  assert.ok(pairHash('a', 'b') === pairHash('b', 'a'));
  sql.close();
});

test('AN ANSWER WITH NO VERDICTS SPENDS NO PAIR: the job is done, the refusal says why, and its pairs are handed again', async () => {
  const { k, sql } = await record();
  for (const [name, email] of [
    ['Sam Ortiz', 'sam@one.example'],
    ['Sam Ortiz', 'sortiz@two.example'],
  ] as const)
    value(k.create('people', { name, email }, OWNER));
  k.purge();
  const [job] = k.leaseOutbox(['infer.resolve'], 5);
  assert.ok(job, 'no infer.resolve job was queued or leased');
  /* Before, the refusal came back before the job was cut to the pairs answered, so a done job kept every pair and none
     was ever handed again. */
  const out = k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { verdict: 'same' } } as never) as { ok: boolean };
  assert.equal(out.ok, false);
  const row = sql.one<{ state: string; payload: string }>('SELECT state, payload FROM outbox WHERE id = ?', job.id);
  assert.equal(row?.state, 'done');
  assert.deepEqual((JSON.parse(row!.payload) as { pairs: unknown[] }).pairs, [], 'a pair nobody answered was spent');
  sql.close();
});

test('A DONE ANSWER CARRYING NOTHING SPENDS NO PAIR either', async () => {
  const { k, sql } = await record();
  for (const [name, email] of [
    ['Sam Ortiz', 'sam@one.example'],
    ['Sam Ortiz', 'sortiz@two.example'],
  ] as const)
    value(k.create('people', { name, email }, OWNER));
  k.purge();
  const [job] = k.leaseOutbox(['infer.resolve'], 5);
  assert.ok(job, 'no infer.resolve job was queued or leased');
  value(k.ackOutbox({ id: job.id, state: 'done', leasedUntil: job.leasedUntil } as never));
  const row = sql.one<{ payload: string }>('SELECT payload FROM outbox WHERE id = ?', job.id);
  assert.deepEqual((JSON.parse(row!.payload) as { pairs: unknown[] }).pairs, [], 'a pair nobody answered was spent');
  sql.close();
});
