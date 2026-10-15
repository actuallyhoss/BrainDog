/**
 * The host's half for the other pairs (ENG-B04 job 3), through the kernel end to end: tonight's `infer.resolve` job
 * hands a model two organisations of one name beside the people, by name and kind and never an address; the answer's
 * verdict on a pair of organisations files nothing and folds nothing, and is kept in the done job, where `pairsFor`
 * reads it. Read as two, the pair leaves the offers; read as one, it is kept first with `judged`; in doubt, it is
 * offered as if no model had spoken. A pair of people still settles as it always has: one question, signed by Slash.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, pairsFor, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
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

type Job = { pairs: { hash: string; kind?: string; a: { name: string; kind: string; seen: string[] }; b: { name: string; kind: string; seen: string[] } }[] };

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ORGS, PEOPLE]));
  return { k, sql };
}

/** Tonight's job, queued by the nightly sweep and leased as a host leases it. */
function tonight(k: Kernel): { id: string; leasedUntil: string; job: Job } {
  k.purge();
  const [leased] = k.leaseOutbox(['infer.resolve'], 5);
  assert.ok(leased, 'no infer.resolve job was queued or leased');
  return { id: leased.id, leasedUntil: leased.leasedUntil, job: JSON.parse(leased.payload) as Job };
}

const named = (job: Job, name: string) => job.pairs.find((p) => p.a.name === name);
const offered = (sql: NodeSql) => pairsFor(sql, NOW).pairs.map((p) => [`${p.a.name} + ${p.b.name}`, p.judged ?? null]);
const questions = (sql: NodeSql) => sql.all<{ opened_by: string; body: string }>('SELECT opened_by, body FROM suggestion ORDER BY rowid');
const folded = (sql: NodeSql) => sql.all<{ id: string }>("SELECT id FROM entry WHERE register = 'organisations' AND json_extract(fields, '$.merged_into') IS NOT NULL");

test('TONIGHT’S JOB HANDS TWO ORGANISATIONS OF ONE NAME beside the people, each with its kind and never an address', async () => {
  const { k, sql } = await record();
  value(k.create('organisations', { name: 'Lanternfish', kind: 'client', domain: 'lanternfish.example' }, OWNER));
  value(k.create('organisations', { name: 'Lanternfish', kind: 'vendor' }, OWNER));
  value(k.create('people', { name: 'Sam Ortiz', email: 'sam@one.example' }, OWNER));
  value(k.create('people', { name: 'Sam Ortiz', email: 'sortiz@two.example' }, OWNER));
  const { job } = tonight(k);
  assert.deepEqual(job.pairs.map((p) => [p.kind, p.a.kind, p.b.kind]), [['person', 'person', 'person'], ['organisation', 'organisation', 'organisation']]);
  const orgs = named(job, 'Lanternfish');
  assert.ok(orgs, 'the two organisations were not handed');
  assert.equal(orgs.b.name, 'Lanternfish');
  /* By name and where seen: no address, no domain, no row id anywhere a model reads. */
  assert.doesNotMatch(JSON.stringify(job.pairs), /@|[0-9A-HJKMNP-TV-Z]{26}/u);
  sql.close();
});

test('A MODEL WEEDS THE OFFERS: two leaves, one is kept first with judged, doubt is offered as today, and nothing is filed or folded for any', async () => {
  const { k, sql } = await record();
  value(k.create('organisations', { name: 'Lanternfish', kind: 'client' }, OWNER));
  value(k.create('organisations', { name: 'Lanternfish', kind: 'vendor' }, OWNER));
  value(k.create('organisations', { name: 'Harbour Mill' }, OWNER));
  value(k.create('organisations', { name: 'Harbour Mill' }, OWNER));
  value(k.create('organisations', { name: 'Quayside Ltd' }, OWNER));
  value(k.create('organisations', { name: 'Quayside' }, OWNER));
  value(k.create('people', { name: 'Sam Ortiz', email: 'sam@one.example' }, OWNER));
  value(k.create('people', { name: 'Sam Ortiz', email: 'sortiz@two.example' }, OWNER));
  /* Before any model speaks, the near name ranks last: the same name outranks it. */
  assert.deepEqual(offered(sql).map(([n]) => n), ['Lanternfish + Lanternfish', 'Harbour Mill + Harbour Mill', 'Quayside Ltd + Quayside']);

  const { id, leasedUntil, job } = tonight(k);
  const hash = (name: string) => named(job, name)!.hash;
  const person = job.pairs.find((p) => p.kind === 'person')!.hash;
  value(
    k.ackOutbox({
      id,
      state: 'done',
      leasedUntil,
      result: {
        verdicts: [
          { hash: hash('Lanternfish'), same: false, confidence: 0.1 },
          { hash: hash('Harbour Mill'), same: true, confidence: 0.7 },
          { hash: hash('Quayside Ltd'), same: true, confidence: 0.95 },
          { hash: person, same: true, confidence: 0.7 },
        ],
      },
    } as never),
  );

  /* Read as one ranks first and says its score; in doubt is offered as before; read as two is gone. */
  assert.deepEqual(offered(sql), [
    ['Quayside Ltd + Quayside', 0.95],
    ['Harbour Mill + Harbour Mill', null],
  ]);
  /* The person pair settles as it always has: one question, signed by Slash, about people. Nothing about organisations. */
  const asked = questions(sql);
  assert.equal(asked.length, 1, JSON.stringify(asked));
  assert.equal(asked[0]!.opened_by, 'slash');
  assert.equal((JSON.parse(asked[0]!.body) as { register: string }).register, 'people');
  assert.deepEqual(folded(sql), []);
  assert.equal(k.count('organisations'), 6);
  sql.close();
});

test('AN ANSWER ABOUT ORGANISATIONS IN THE TOP BAND FOLDS NOTHING, and an older answer with no band still settles its pairs', async () => {
  const { k, sql } = await record();
  value(k.create('organisations', { name: 'Tidewater' }, OWNER));
  value(k.create('organisations', { name: 'Tidewater' }, OWNER));
  const { id, leasedUntil, job } = tonight(k);
  const [pair] = job.pairs;
  assert.equal(pair?.kind, 'organisation');
  value(k.ackOutbox({ id, state: 'done', leasedUntil, result: { verdicts: [{ hash: pair.hash, same: true, confidence: 1 }] } } as never));
  assert.deepEqual(questions(sql), []);
  assert.deepEqual(folded(sql), []);
  assert.deepEqual(offered(sql), [['Tidewater + Tidewater', 1]]);

  /* A job answered before verdicts were kept names the pair and says no band: the pair is settled, as it was. */
  const kept = JSON.parse(sql.one<{ payload: string }>('SELECT payload FROM outbox WHERE id = ?', id)!.payload) as { judged?: unknown };
  delete kept.judged;
  sql.exec('UPDATE outbox SET payload = ? WHERE id = ?', JSON.stringify(kept), id);
  assert.deepEqual(offered(sql), []);
  sql.close();
});
