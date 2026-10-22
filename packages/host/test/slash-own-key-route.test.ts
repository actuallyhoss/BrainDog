/**
 * His own key is a route of one candidate (HD.324, "own key lifts monthly cap"): a record set to his key whose key will
 * not open is answered with `OWN_KEY_FAILED`'s sentence, and nothing is sent, and the included model is never asked in
 * its place, at the adapter, at the router and in the walk.
 *
 * Every model here is a fake that counts its calls. No key is real.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ok, type Result } from '@braindog/ports';
import { infer, lastRows, routeFor, PURPOSES, type Candidate, type InferDeps, type RouteFacts } from '../src/infer.ts';
import { OWN_KEY_FAILED, SlashKeyClosedError, slashOwnInference, slashOwnModel, type SlashHostDeps, type SlashOwnKey } from '../src/slash.ts';
import { core, openStore } from '../../slash/src/call.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 14, 9);
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const OWN: SlashOwnKey = { provider: 'anthropic', base_url: null, model: 'his-model', grant_id: GRANT };
const VAULT = [{ id: GRANT, label: 'kiln room key', revoked_at: null, kind: 'api_token' }];

const KEY: Candidate = { id: 'key', model: 'his-model', tier: 'b', source: 'key' };
const FLASH: Candidate = { id: 'flash', model: 'flash-chat', tier: 'a', source: 'included' };
const SECOND: Candidate = { id: 'second', model: 'second-chat', tier: 'a', source: 'included' };
const PROVIDER: Candidate = { id: 'provider', model: 'other-chat', tier: 'a', source: 'included' };
const SMALL: Candidate = { id: 'small', model: 'small-chat', tier: 'a', source: 'included' };
const ON_KEY: RouteFacts = { form: 'key', models: { key: KEY, flash: FLASH, second: SECOND, provider: PROVIDER, small: SMALL }, large: true, machine: false };

/** A wire that counts every request, and a vault whose key will not open: `null`, or a throw. */
const shut = (open: SlashHostDeps['openKey']) => {
  const sent: string[] = [];
  const deps: SlashHostDeps = {
    grants: () => VAULT,
    openKey: open,
    send: async (url) => (sent.push(url.href), new Response('{}', { status: 200 })),
  };
  return { sent, deps };
};

const CALL = { model: 'his-model', messages: [{ role: 'user' as const, content: 'Which firings are open?' }], maxTokens: 64, jsonSchema: {} };

const failed = (e: unknown): boolean => e instanceof SlashKeyClosedError && e.message === OWN_KEY_FAILED && e.sent === false;

test('OWN_KEY_FAILED IS HIS SENTENCE, plain, with no dash and no id', () => {
  assert.equal(OWN_KEY_FAILED, 'Your own key did not open. Put it back in Keys, or switch Slash to Included in Settings.');
  assert.ok(!/[—–]/u.test(OWN_KEY_FAILED));
});

test('A KEY THAT WILL NOT OPEN IS OWN_KEY_FAILED AT THE ADAPTER, and nothing is sent, for null and for a vault that throws', async () => {
  for (const open of [async () => null, async () => Promise.reject(new Error('sealed under another key'))]) {
    const { sent, deps } = shut(open);
    const inference = slashOwnInference(OWN, deps);
    assert.ok(inference, 'a live grant builds the adapter; the key is opened on the call');
    await assert.rejects(inference.complete(CALL), failed);
    const model = slashOwnModel(OWN, deps)!;
    await assert.rejects(model.draft({} as Parameters<typeof model.draft>[0]), failed);
    assert.deepEqual(sent, [], 'a request left with no key');
  }
});

test('HIS OWN KEY IS A ROUTE OF ONE CANDIDATE for every purpose but embedding, whatever else the host has', () => {
  for (const purpose of Object.keys(PURPOSES) as (keyof typeof PURPOSES)[]) {
    if (PURPOSES[purpose].class === 'embed') continue;
    assert.deepEqual(routeFor(purpose, ON_KEY).candidates.map((c) => c.id), ['key'], purpose);
  }
  /* AND A RECORD ON ITS KEY WITH NO KEY CANDIDATE HAS AN EMPTY ROUTE, not the included model. */
  assert.deepEqual(routeFor('ask', { ...ON_KEY, models: { flash: FLASH, second: SECOND } }).candidates, []);
});

test('A RECORD ON ITS OWN KEY WHOSE KEY WILL NOT OPEN IS ANSWERED WITH OWN_KEY_FAILED, and the fake included model is never called', async () => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  openStore(sql);
  const ledger = core(sql, clock, { complete: () => Promise.reject(new Error('unused')), embed: () => Promise.reject(new Error('unused')) });
  const rows: string[] = [];
  const deps: InferDeps = {
    facts: ON_KEY,
    clock,
    ledger: {
      reserve: ledger.reserve,
      account: (row) => (rows.push(row.candidate ?? '-'), ledger.account(row)),
      release: ledger.release,
      last: (candidate) => lastRows(sql, candidate),
    },
  };
  const { sent, deps: wire } = shut(async () => null);
  const own = slashOwnInference(OWN, wire)!;
  const included: string[] = [];
  type Reply = { text: string; model: string; usage: { in: number; out: number } };
  const run = async (candidate: Candidate): Promise<Result<Reply>> => {
    if (candidate.source === 'key') {
      const said = await own.complete(CALL);
      return ok({ text: said.text, model: candidate.model, usage: said.usage });
    }
    included.push(candidate.id);
    return ok({ text: 'yes', model: candidate.model, usage: { in: 1, out: 1 } });
  };
  for (const purpose of ['ask', 'plan', 'automation', 'compose', 'understand'] as const)
    await assert.rejects(infer(purpose, { hold: 'propose', kind: 'propose', run }, deps), failed, purpose);
  assert.deepEqual(included, [], 'the included model was asked in his key\'s place');
  assert.deepEqual(sent, [], 'a request left with no key');
  assert.deepEqual(rows, [], 'a ledger row for a call nothing sent');
});
