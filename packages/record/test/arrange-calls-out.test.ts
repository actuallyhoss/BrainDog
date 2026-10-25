/**
 * What an arrangement arms is filed the way Decide's one sentence reads it (audit 56, claim 5).
 *
 * An arrangement filed its calls as `calls`, a part's host and how often, which the kernel's `doesOf('install', body)`
 * does not read: it reads `calls_out`, each call with the key's label and what runs it. So the sentence under an add-on
 * that sends a key out said nothing. Both are filed now: `calls` beside each part, `calls_out` for the sentence.
 *
 * The add-ons are made up: "Stripe" here is a pack of this test's own, polling a host that answers nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { doesOf } from '@braindog/kernel';

import { arrangeUnion } from '../src/arrange.ts';
import { createRecordApi, type CallContext, type CatalogueEntry } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_owner', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
type Body = Record<string, unknown> & { calls?: Record<string, unknown>[]; calls_out?: Record<string, unknown>[] };

const base = { version: '1.0.0', author: 'Halden', license: 'MIT', requires: { format: 1, primitives: 1, packs: {} } };
const BOOKS = {
  ...base,
  pack: 'books',
  summary: 'Accounts.',
  declarations: [{ register: 'accounts', name: 'Accounts', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] }],
};
const STRIPE = {
  ...base,
  pack: 'stripe',
  summary: 'Charges, read once a day.',
  declarations: [
    { register: 'charges', name: 'Charges', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'amount', type: 'decimal' }] },
    { ingest: 'stripe_charges', channel: 'poll', url: 'https://api.stripe.com/v1/charges', every: '1d', grant: 'Stripe', map: { what: { value: 'Charge' }, amount: { path: 'amount', type: 'decimal' } }, writes: { register: 'charges' } },
  ],
};
const NOTES = { ...base, pack: 'notes', summary: 'Notes.', declarations: [{ register: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] }] };
/* A FEED THE PROPOSAL DECLARES ITSELF, with a key of its own, writing to a list already here. */
const FEED = {
  id: 'ingest.rates',
  kind: 'ingest',
  body: { ingest: 'rates', channel: 'poll', url: 'https://rates.example.org/latest', every: '1h', grant: 'Rates', map: { what: { value: 'Rate' }, note: { path: 'rate', type: 'text' } }, writes: { register: 'accounts' } },
};
const CATALOGUE: CatalogueEntry[] = [
  { id: 'books', kind: 'pack', title: 'Books', summary: BOOKS.summary, modules: [], doc: () => BOOKS },
  { id: 'stripe', kind: 'pack', title: 'Stripe', summary: STRIPE.summary, modules: [], doc: () => STRIPE },
  { id: 'notes', kind: 'pack', title: 'Notes', summary: NOTES.summary, modules: [], doc: () => NOTES },
];

/** A fresh record with Books in and both keys in the keychain. */
async function founder() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), catalogue: CATALOGUE });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  const planned = value<{ diff: { planHash: string; approve: string[] } }>(await api.planPack({ doc: BOOKS } as never, owner));
  value(await api.installPack({ doc: BOOKS, planHash: planned.diff.planHash, approve: planned.diff.approve } as never, owner));
  for (const [label, opens] of [['Stripe', 'api.stripe.com'], ['Rates', 'rates.example.org']] as const)
    assert.ok(api.kernel.bindGrant({ label, opens, kind: 'api_token', ciphertext: new Uint8Array([1]), nonce: new Uint8Array([2]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_1' } as never, 'p_owner').ok);
  return { api, sql };
}

test('AN ARRANGED ADD-ON THAT SENDS A KEY OUT FILES IT AS Decide READS IT: the key by its label, the host and how often', async () => {
  const { api, sql } = await founder();
  const asked = value<{ id: string }>(await api.propose({ question: 'Take card payments?', body_kind: 'arrange', body: { why: ['Card payments.'], packs: { install: ['stripe'] } } } as never, agent));
  const filed = value<{ body: Body }>(await api.governance({ id: asked.id }, owner)).body;

  assert.deepEqual(filed.calls_out, [{ part: 'install:stripe', host: 'api.stripe.com', every: '1d', trigger: 'schedule', per_day: null, grant: 'Stripe', change: 'new' }]);
  assert.equal(doesOf('install', filed), "Sends your key 'Stripe' to api.stripe.com every day.");
  /* WHAT READ `calls` STILL DOES: the same call beside its part. */
  assert.deepEqual(filed.calls, [{ part: 'install:stripe', host: 'api.stripe.com', every: '1d', per_day: null }]);

  /* AND THE BODY AS FILED IS STILL THE ONE THE PRESS INSTALLS. */
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'yes' } }, owner));
  assert.ok(api.kernel.packs().some((p) => p.id === 'stripe'));
  sql.close();
});

test('A FEED AN ARRANGEMENT DECLARES ITSELF IS SAID TOO, after the add-on, and one that calls nothing files none', async () => {
  const { api, sql } = await founder();
  const both = { why: ['Card payments, and the rate.'], packs: { install: ['stripe'] }, declarations: [FEED] };
  const asked = value<{ id: string }>(await api.propose({ question: 'Take card payments?', body_kind: 'arrange', body: both } as never, agent));
  const filed = value<{ body: Body }>(await api.governance({ id: asked.id }, owner)).body;
  assert.deepEqual(filed.calls_out?.map((c) => [c.grant, c.host, c.every]), [['Stripe', 'api.stripe.com', '1d'], ['Rates', 'rates.example.org', '1h']]);
  assert.equal(doesOf('install', filed), "Sends your key 'Stripe' to api.stripe.com every day. Sends your key 'Rates' to rates.example.org every hour.");

  const quiet = value<{ id: string }>(await api.propose({ question: 'Keep notes?', body_kind: 'arrange', body: { why: ['Somewhere for notes.'], packs: { install: ['notes'] } } } as never, agent));
  const none = value<{ body: Body }>(await api.governance({ id: quiet.id }, owner)).body;
  assert.equal('calls_out' in none, false, 'an arrangement that calls nothing filed calls');
  assert.equal(doesOf('install', none), '');
  sql.close();
});

test('TWO ARRANGEMENTS MADE ONE SAY EACH CALL ONCE', () => {
  const stripe = { part: 'install:stripe', host: 'api.stripe.com', every: '1d', trigger: 'schedule', per_day: null, grant: 'Stripe', change: 'new' };
  const rates = { part: 'declaration:ingest.rates', host: 'rates.example.org', every: '1h', trigger: 'schedule', per_day: null, grant: 'Rates', change: 'new' };
  const one = arrangeUnion({ why: ['Card payments.'], packs: { install: ['stripe'] }, calls_out: [stripe] }, { why: ['The rate.'], packs: { install: ['stripe'] }, calls_out: [stripe, rates] }) as Body;
  assert.deepEqual(one.calls_out, [stripe, rates]);
  assert.equal(doesOf('install', one), "Sends your key 'Stripe' to api.stripe.com every day. Sends your key 'Rates' to rates.example.org every hour.");
});

/* THE KERNEL'S HALF (calls-out-59, `cutArrangement` and `mergeArrangement` in `packages/kernel/src/govern.ts`): a yes to
   one part cuts the sentence's calls as it cuts `calls`, so what is still open says only what is still to arm. */
test('A YES TO ONE PART LEAVES ONLY THE CALLS STILL TO ARM, in the sentence as beside the parts', async () => {
  const { api, sql } = await founder();
  const both = { why: ['Card payments, and the rate.'], packs: { install: ['stripe'] }, declarations: [FEED] };
  const asked = value<{ id: string }>(await api.propose({ question: 'Take card payments?', body_kind: 'arrange', body: both } as never, agent));
  value(await api.decide({ id: asked.id, decide: { option: 'accept', reason: 'the add-on first', parts: ['install:stripe'] } }, owner));
  assert.ok(api.kernel.packs().some((p) => p.id === 'stripe'));

  const left = value<{ status: string; body: Body }>(await api.governance({ id: asked.id }, owner));
  assert.equal(left.status, 'open');
  assert.deepEqual(left.body.calls?.map((c) => c.host), ['rates.example.org']);
  assert.deepEqual(left.body.calls_out?.map((c) => [c.grant, c.host, c.every]), [['Rates', 'rates.example.org', '1h']]);
  assert.equal(doesOf('install', left.body), "Sends your key 'Rates' to rates.example.org every hour.");
  sql.close();
});
