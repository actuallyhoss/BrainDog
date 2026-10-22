/**
 * The nightly walk over what the record already holds ("understanding is the engine's first job"), from
 * Slash's daily run: the kernel's `backfill` links what it is sure of, and what it would not do on its own is filed on
 * Decide as one question each, once, and carried out when it is answered.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const DAY = 86_400_000;
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
    { id: 'domains', type: 'list', of: 'text' },
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
    { id: 'note', type: 'text' },
  ],
});

const SERVICES = register({
  id: 'services',
  name: 'Services',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'points_at', type: 'text' },
    { id: 'thing', type: 'ref', to: 'things' },
  ],
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([PROJECTS, ORGS, LEDGER, SERVICES]));
  const k = api.kernel;
  const tallow = value<Entry>(k.create('things', { name: 'Tallow', domains: ['tallow.example'] }, OWNER));
  const site = value<Entry>(k.create('things', { name: 'Tallow Site', domains: ['tallow.example'] }, OWNER));
  for (const what of ['LOWRY ST STUDIOS RENT AUG', 'LOWRY ST STUDIOS RENT SEP']) value(k.create('transactions', { what, amount: { amount: -1_250, currency: 'GBP' } }, OWNER));
  const sending = value<Entry>(k.create('services', { name: 'Sending domain', points_at: 'mail.tallow.example' }, OWNER));
  return { api, sql, clock, tallow, site, sending };
}

const waiting = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ id: string; body_kind: string; q: string }>(
    "SELECT s.id AS id, s.body_kind AS body_kind, e.to_v AS q FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' WHERE s.status = 'open' ORDER BY s.rowid",
  );

test('WHAT THE WALK WOULD NOT DO IS ASKED ONCE EACH, and answering it does it', async () => {
  const { api, sql, clock, tallow, sending } = await record();
  const ran = await api.slashTick();
  assert.ok(ran.ran);
  const asked = waiting(sql);
  const company = asked.find((q) => q.q === 'Is Lowry St Studios a company you pay or are paid by? 2 payments name it.');
  const which = asked.find((q) => q.q === 'Which project is Sending domain for: Tallow or Tallow Site?');
  assert.ok(company, JSON.stringify(asked));
  assert.ok(which, JSON.stringify(asked));
  assert.equal(which.body_kind, 'options');
  /* NO ID IN WHAT A PERSON READS. */
  const read = value<{ body: unknown }>(await api.governance({ register: 'suggestion', id: which.id }, owner));
  assert.doesNotMatch(JSON.stringify((read.body as { options: unknown }).options), /[0-9A-HJKMNP-TV-Z]{26}/u);

  /* YES MAKES THE COMPANY, BY THE KEY ITS PAYMENTS ARE KNOWN BY; THE PICK LINKS THE SERVICE. */
  value(await api.decide({ id: company.id, decide: { option: 'accept', reason: 'our studio' } }, owner));
  const lowry = value<{ rows: Entry[] }>(await api.list({ register: 'organisations' }, owner)).rows.find((r) => r.fields.name === 'Lowry St Studios');
  assert.ok(lowry);
  value(await api.decide({ id: which.id, decide: { option: 'p1', reason: '' } }, owner));
  assert.equal(api.kernel.get(sending.id)?.fields.thing, tallow.id);

  /* THE NEXT NIGHT LINKS THE PAYMENTS TO THE COMPANY NOW KNOWN, AND ASKS NOTHING TWICE. */
  clock.set(NOW + DAY);
  assert.ok((await api.slashTick()).ran);
  const lines = value<{ rows: Entry[] }>(await api.list({ register: 'transactions' }, owner)).rows;
  assert.deepEqual(lines.map((l) => l.fields.party), [lowry.id, lowry.id]);
  assert.equal(waiting(sql).filter((q) => /Lowry|Sending domain/u.test(q.q)).length, 0);
  sql.close();
});

test('A NO HOLDS: a question declined is never asked again', async () => {
  const { api, sql, clock } = await record();
  await api.slashTick();
  const company = waiting(sql).find((q) => q.q.startsWith('Is Lowry St Studios'))!;
  value(await api.decide({ id: company.id, resolved_as: 'wont-fix', reason: 'a landlord, not a company' }, owner));
  clock.set(NOW + DAY);
  await api.slashTick();
  assert.equal(waiting(sql).filter((q) => q.q.startsWith('Is Lowry St Studios')).length, 0);
  sql.close();
});
