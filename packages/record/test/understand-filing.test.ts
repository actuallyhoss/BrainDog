/**
 * What the walk would not do on its own, filed in the order its answers matter (research-audit-22, batch 23's
 * leftovers): where runs belong before whether a payee is a company, so `SLASH_OPEN_CAP` never leaves every slot to
 * payees; a payee that may be an organisation the person holds is asked as one rowset giving it the key; a run question
 * that names no place is not filed, and says so; and a yes places only the places the walk asked about, never every run
 * sharing a last name.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext, type Understanding } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const HOUR = 3_600_000;
const OWNER = { actor: 'p_1' };
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const register = (body: Record<string, unknown>) => ({ id: `register.${body.id as string}`, kind: 'register' as const, body: body as never });

const PROJECTS = register({
  id: 'things',
  name: 'Projects',
  title: 'name',
  scopes: { repos: 'repos' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'repos', type: 'list', of: 'text' },
  ],
});

const ORGS = register({
  id: 'organisations',
  name: 'Organisations',
  title: 'name',
  org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'organisations' },
  ],
});

const LEDGER = register({
  id: 'transactions',
  name: 'Transactions',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'party', type: 'ref', to: 'organisations' },
    { id: 'counterparty_text', type: 'text' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/**
 * Two quiet runs in a checkout of `lantern`, one in `kiln` that says only its name, four people paid by name three times
 * each, and two payments to "AMAZON PRIME" beside Amazon, which the owner holds.
 */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS, ORGS, LEDGER]));
  const k = api.kernel;
  const run = (fields: Record<string, unknown>) => value<Entry>(k.create('session', { agent: 'claude', state: 'done', ...fields }, { ...OWNER, stamp: { project: '', last_seen: '2000-01-01T00:00:00.000Z' } })).id;
  const lanterns = [1, 2].map((n) => run({ doing: `Work ${n}`, remote: 'git@github.com:sam/lantern.git', repo: 'lantern' }));
  run({ doing: 'Bare', repo: 'kiln' });
  const lantern = value<Entry>(k.create('things', { name: 'Lantern', repos: ['lantern'] }, OWNER));
  value<Entry>(k.create('things', { name: 'Kiln', repos: ['kiln'] }, OWNER));
  const amazon = value<Entry>(k.create('organisations', { name: 'Amazon' }, OWNER));
  for (const payee of ['LAYLA AHMED', 'JO BLOGGS', 'SAM PRIME', 'LEE CHAN'])
    for (const month of ['AUG', 'SEP', 'OCT']) value(k.create('transactions', { what: `${payee} ${month}`, counterparty_text: payee, amount: { amount: -1_250, currency: 'GBP' } }, OWNER));
  const prime = ['AUG', 'SEP'].map((month) => value<Entry>(k.create('transactions', { what: `AMAZON PRIME ${month}`, counterparty_text: 'AMAZON PRIME', amount: { amount: -799, currency: 'GBP' } }, OWNER)).id);
  clock.set(NOW);
  return { api, sql, clock, run, lanterns, lantern, amazon, prime };
}

const open = (sql: NodeSql) =>
  sql.all<{ id: string; body_kind: string; body: string; q: string }>(
    "SELECT s.id AS id, s.body_kind AS body_kind, s.body AS body, e.to_v AS q FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' WHERE s.status = 'open' ORDER BY s.rowid",
  );

test('WHERE RUNS BELONG IS FILED FIRST, then a payee the person may hold, and payees as companies take what is left', async () => {
  const { api, sql } = await record();
  const done = value<Understanding>(await api.understand({}, owner));
  assert.deepEqual(
    done.filed?.map((f) => f.question),
    ['2 runs worked in lantern. Is that Lantern?', 'Are the 2 payments to Amazon Prime with Amazon?', 'Is Layla Ahmed a company you pay or are paid by? 3 payments name it.'],
  );
  /* THE REMOTE THE RUN QUESTION'S YES LISTS IS NOT ASKED A SECOND TIME. */
  assert.ok(open(sql).every((q) => !q.q.includes('Add it to Lantern')), open(sql).map((q) => q.q).join(' / '));
  /* THE REST WAIT FOR A LATER NIGHT, AND SAY SO. */
  assert.ok(done.dropped?.some((d) => d.startsWith('Is Jo Bloggs a company') && d.includes("Slash's questions are already waiting")), done.dropped?.join(' / '));
  sql.close();
});

test('A RUN QUESTION THAT NAMES NO PLACE IS NOT FILED, and the log says why', async () => {
  const { api, sql } = await record();
  const done = value<Understanding>(await api.understand({}, owner));
  assert.ok(!done.filed?.some((f) => f.question.includes('Kiln')));
  assert.ok(
    done.dropped?.includes("A run worked in kiln. Is that Kiln? was not filed: its runs say only a repository's name and not where it is, so a yes would place nothing."),
    done.dropped?.join(' / '),
  );
  sql.close();
});

test('A PAYEE THAT MAY BE AN ORGANISATION THE PERSON HOLDS IS ONE ROWSET, AND A YES GIVES IT THE KEY', async () => {
  const { api, sql, amazon, prime } = await record();
  await api.understand({}, owner);
  const asked = open(sql).find((q) => q.q === 'Are the 2 payments to Amazon Prime with Amazon?');
  assert.ok(asked, open(sql).map((q) => q.q).join(' / '));
  assert.equal(asked.body_kind, 'rowset');
  const body = JSON.parse(asked.body) as { register: string; rows: { at: string; patch: Record<string, unknown> }[] };
  assert.equal(body.register, 'organisations');
  assert.deepEqual(body.rows[0]?.patch, { keys: ['bank:amazonprime'] });
  /* NOTHING IS LINKED BEFORE THE ANSWER. */
  for (const id of prime) assert.equal(api.kernel.get(id)?.fields.party ?? null, null);
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: '' } }, owner));
  assert.deepEqual(api.kernel.get(amazon.id)?.fields.keys, ['bank:amazonprime']);
  sql.close();
});

test('A YES PLACES ONLY THE PLACES THE WALK ASKED ABOUT, and a choice kept without them places nothing', async () => {
  const { api, sql, clock, run, lanterns, lantern } = await record();
  await api.understand({}, owner);
  const asked = open(sql).find((q) => q.q === '2 runs worked in lantern. Is that Lantern?')!;
  /* ANOTHER CHECKOUT CALLED lantern, IN A FOLDER OF ITS OWN, NOT ASKED ABOUT. */
  clock.set(NOW - 48 * HOUR);
  const other = run({ doing: 'Elsewhere', cwd: '/Users/sam/forks/lantern', repo: 'lantern' });
  clock.set(NOW);

  /* A CHOICE KEPT WITH NO PLACES IS NEVER READ AGAIN FROM ITS LAST NAME. */
  const kept = api.kernel.prefsOf('understand:asked')[asked.id] as Record<string, unknown>;
  const { wheres: _places, ...bare } = kept;
  api.kernel.setPref('understand:asked', asked.id, bare);
  value(await api.decide({ id: asked.id, decide: { option: 'p1', reason: '' } }, owner));
  for (const id of [...lanterns, other]) assert.equal(api.kernel.get(id)?.fields.project, '', 'nothing is placed');
  assert.deepEqual(api.kernel.get(lantern.id)?.fields.repos, ['lantern']);
  sql.close();
});

test('A YES WITH ITS PLACES LEAVES ANOTHER CHECKOUT OF THE SAME NAME WHERE IT IS', async () => {
  const { api, sql, clock, run, lanterns, lantern } = await record();
  await api.understand({}, owner);
  const asked = open(sql).find((q) => q.q === '2 runs worked in lantern. Is that Lantern?')!;
  clock.set(NOW - 48 * HOUR);
  const other = run({ doing: 'Elsewhere', cwd: '/Users/sam/forks/lantern', repo: 'lantern' });
  clock.set(NOW);
  value(await api.decide({ id: asked.id, decide: { option: 'p1', reason: '' } }, owner));
  const spoken = api.kernel.nameOf(lantern.id);
  for (const id of lanterns) assert.equal(api.kernel.get(id)?.fields.project, spoken);
  assert.equal(api.kernel.get(other)?.fields.project, '');
  assert.deepEqual(api.kernel.get(lantern.id)?.fields.repos, ['lantern', 'git@github.com:sam/lantern.git']);
  sql.close();
});
