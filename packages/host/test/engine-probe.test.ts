/**
 * The engine's probe, the host's half (ENG-A08 job 3): one press asks each model of the answer route a fixed prompt.
 *
 * WHY THIS FILE EXISTS. After he mended a key he waited half an hour for the jobs' next try to know whether the model
 * answered. Each case hands the probe a canned wire (no real model, no real key) over Slash's real ledger, and reads both
 * what a person is told and the rows the ledger kept, since the engine's health and the jobs' wait are read from those.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Completion, type CompleteRequest, type Result } from '@braindog/ports';
import { NO_MODEL, PROBE_SYSTEM, PROBE_USER, engineProbeOf, probeRequest, probeWireOf, strictOf, type EngineProbeDeps } from '../src/engine-probe.ts';
import type { SlashInference } from '../src/slash.ts';
import { lastRows, type Candidate, type RouteFacts } from '../src/infer.ts';
import { core, openStore } from '../../slash/src/call.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 15, 9);

const FLASH: Candidate = { id: 'flash', model: 'flash-chat', tier: 'a', source: 'included' };
const SECOND: Candidate = { id: 'second', model: 'second-chat', tier: 'a', source: 'included' };
const KEY: Candidate = { id: 'key', model: 'her-model', tier: 'b', source: 'key' };

const CLOUD: RouteFacts = { form: 'included', models: { flash: FLASH, second: SECOND }, large: false, machine: false };

/* Built at run time, so no key-shaped literal sits in the tree; the shape is one `looksLikeCredential` knows. */
const SECRET = ['sk', 'proj', 'Zq7Lm2Xv9Rt4Wb8Nc1Hd6Kf3'].join('-');

const answer = (c: Candidate, text = '{"ready":true}'): Result<Completion> => ok({ text, model: c.model, usage: { in: 40, out: 4, neurons: 3 } });

type Wire = (c: Candidate, req: CompleteRequest) => Result<Completion> | Error;

/** Slash's own ledger, a clock the wire moves, and a wire that answers each candidate as `wire` says and keeps what it was sent. */
const bench = (wire: Wire, facts: RouteFacts | null = CLOUD, extra: Partial<EngineProbeDeps> = {}) => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  openStore(sql);
  const ledger = core(sql, clock, { complete: () => Promise.reject(new Error('unused')), embed: () => Promise.reject(new Error('unused')) });
  const sent: { candidate: string; req: CompleteRequest }[] = [];
  let loaded = 0;
  const probe = engineProbeOf({
    facts: () => facts ?? undefined,
    clock,
    ledger: () => {
      loaded++;
      return { reserve: ledger.reserve, account: ledger.account, release: ledger.release, last: (candidate) => lastRows(sql, candidate) };
    },
    complete: (c, req) => {
      sent.push({ candidate: c.id, req });
      clock.advance(1200);
      const out = wire(c, req);
      return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
    },
    ...extra,
  });
  const rows = () => sql.all<{ purpose: string; spends: string; status: string; candidate: string | null }>('SELECT purpose, spends, status, candidate FROM slash_call ORDER BY rowid').map((r) => ({ ...r }));
  return { probe, sent, rows, loaded: () => loaded };
};

test('A MODEL THAT ANSWERS IS NAMED WITH ITS TIME, one row each under `probe` that spends nobody\'s month', async () => {
  const b = bench((c) => answer(c));
  const out = await b.probe();
  assert.deepEqual(out.candidates, [
    { model: 'flash-chat', served: true, strict: true, ms: 1200 },
    { model: 'second-chat', served: true, strict: true, ms: 1200 },
  ]);
  assert.equal(out.said, 'Answered by flash-chat in 1.2 s.');
  assert.deepEqual(
    b.rows().map((r) => [r.purpose, r.spends, r.status, r.candidate]),
    [
      ['probe', 'none', 'ok', 'flash'],
      ['probe', 'none', 'ok', 'second'],
    ],
  );
});

test('THE PROMPT HOLDS NOTHING OF THE RECORD: every candidate is sent the same fixed words', async () => {
  const b = bench((c) => answer(c));
  await b.probe();
  assert.equal(b.sent.length, 2);
  for (const { req } of b.sent) {
    assert.deepEqual(
      req.messages.map((m) => m.content),
      [PROBE_SYSTEM, PROBE_USER],
    );
  }
});

test('A FIRST CANDIDATE THAT FAILS IS SAID IN PLAIN WORDS, and the second that answers is the one named', async () => {
  const b = bench((c) =>
    c.id === 'flash' ? no<Completion>('NOT_IN_THIS_BUILD', `No model answered for 'flash-chat': the provider does not serve it. ${SECRET}`, { at: 'model' }) : answer(c),
  );
  const out = await b.probe();
  assert.deepEqual(out.candidates[0], { model: 'flash-chat', served: false, strict: false, ms: 1200, why: 'Its provider does not serve this model now.' });
  assert.deepEqual(out.candidates[1], { model: 'second-chat', served: true, strict: true, ms: 1200 });
  assert.equal(out.said, 'Answered by second-chat in 1.2 s.');
});

test('NONE ANSWERS: the first candidate\'s reason is the sentence, never the wire\'s own words', async () => {
  const b = bench(() => new Error(`connect ECONNREFUSED at api.example.test with ${SECRET}`));
  const out = await b.probe();
  assert.equal(out.candidates.length, 2);
  assert.ok(out.candidates.every((c) => !c.served && c.why === 'It did not answer.'));
  assert.equal(out.said, 'No model answered.');
  assert.doesNotMatch(JSON.stringify(out), /ECONNREFUSED|example\.test/);
});

test('A REPLY IN ANOTHER SHAPE IS SERVED BUT NOT STRICT, and said so', async () => {
  const b = bench((c) => answer(c, 'Yes, I am here.'), { form: 'included', models: { flash: FLASH }, large: false, machine: false });
  const out = await b.probe();
  assert.deepEqual(out.candidates.map((c) => [c.served, c.strict]), [[true, false]]);
  assert.equal(out.said, 'Answered by flash-chat in 1.2 s, but not in the shape BrainDog asks for, so its answers would be set aside.');
  assert.equal(strictOf(' {"ready": true} '), true);
  assert.equal(strictOf('{"ready":false}'), false);
});

test('A REPLY THAT BROKE OFF IS NOT "Answered by": it was served on the ledger, but no ask could use it', async () => {
  const cut = Object.assign(new Error(`stream closed by upstream ${SECRET}`), { answered: true, usage: { in: 40, out: 2 } });
  const b = bench(() => cut, { form: 'included', models: { flash: FLASH }, large: false, machine: false });
  const out = await b.probe();
  assert.deepEqual(out.candidates, [{ model: 'flash-chat', served: true, strict: false, ms: 1200, why: 'It began to answer and broke off before the end.' }]);
  assert.equal(out.said, 'No model answered. It began to answer and broke off before the end.');
  assert.ok(!JSON.stringify(out).includes(SECRET));
});

test('NO MODEL SET UP: "No model is set up." and no call, no ledger', async () => {
  const b = bench(() => assert.fail('no call'), null);
  assert.deepEqual(await b.probe(), { candidates: [], said: NO_MODEL });
  assert.equal(b.sent.length, 0);
  assert.equal(b.loaded(), 0);
  const empty = bench(() => assert.fail('no call'), { form: 'included', models: {}, large: false, machine: false });
  assert.deepEqual(await empty.probe(), { candidates: [], said: NO_MODEL });
});

test('NO CONSENT: with Slash reading switched off nothing is sent and no row is written', async () => {
  const b = bench(() => assert.fail('no call'), CLOUD, { reads: () => false });
  const out = await b.probe();
  assert.deepEqual(out.candidates, []);
  assert.match(out.said, /switched off, so nothing was sent to a model/);
  assert.equal(b.sent.length, 0);
  assert.equal(b.loaded(), 0);
  const unread = bench(() => assert.fail('no call'), CLOUD, { reads: () => Promise.reject(new Error('down')) });
  assert.equal((await unread.probe()).candidates.length, 0);
});

test('NO SECRET IN ANY ANSWER: a model named like a key and a refusal that quotes one are never repeated', async () => {
  const keyed: Candidate = { ...KEY, model: SECRET };
  const b = bench(() => no<Completion>('UNREACHABLE', `upstream said: invalid api key ${SECRET}`, { at: 'model' }), {
    form: 'key',
    models: { key: keyed },
    large: false,
    machine: false,
  });
  const out = await b.probe();
  assert.equal(out.candidates.length, 1);
  assert.equal(out.candidates[0]?.model, 'the model');
  assert.equal(out.candidates[0]?.served, false);
  assert.ok(!JSON.stringify(out).includes(SECRET));
  assert.ok(!JSON.stringify(out).includes('upstream'));
});

test('HIS OWN KEY THAT WILL NOT OPEN is said so, and nothing is sent', async () => {
  const closed = Object.assign(new Error(`vault: ${SECRET}`), { name: 'SlashKeyClosedError' });
  const b = bench(() => closed, { form: 'key', models: { key: KEY }, large: false, machine: false });
  const out = await b.probe();
  assert.deepEqual(out.candidates, [{ model: 'her-model', served: false, strict: false, ms: 1200, why: 'Your own key would not open, so it was not asked.' }]);
  assert.ok(!JSON.stringify(out).includes(SECRET));
});

test("THE HOST'S OWN ADAPTERS ARE THE WIRE: the schema is handed as the adapter takes it, and a model with no wire is no call", async () => {
  const calls: { model: string; jsonSchema: object }[] = [];
  const included: SlashInference = {
    complete: async (call) => (calls.push({ model: call.model, jsonSchema: call.jsonSchema }), { text: '{"ready":true}', usage: { in: 30, out: 3 } }),
  };
  const complete = probeWireOf((c) => (c.id === 'flash' ? included : undefined));
  const served = await complete(FLASH, probeRequest(FLASH.model));
  assert.deepEqual(served, ok({ text: '{"ready":true}', model: 'flash-chat', usage: { in: 30, out: 3, neurons: null } }));
  assert.deepEqual(calls, [{ model: 'flash-chat', jsonSchema: probeRequest('flash-chat').schema }]);
  const none = await complete(SECOND, probeRequest(SECOND.model));
  assert.equal(none.ok, false);
  assert.equal(calls.length, 1);
});

test('THE WIRE IN THE PROBE: a throwing adapter is "It did not answer.", and its words are never repeated', async () => {
  const sql = openSqlite();
  const clock = fixedClock(T0);
  openStore(sql);
  const ledger = core(sql, clock, { complete: () => Promise.reject(new Error('unused')), embed: () => Promise.reject(new Error('unused')) });
  const broken: SlashInference = { complete: () => Promise.reject(new Error(`401 from upstream: ${SECRET}`)) };
  const probe = engineProbeOf({
    facts: () => ({ form: 'included', models: { flash: FLASH }, large: false, machine: false }),
    clock,
    ledger: () => ({ reserve: ledger.reserve, account: ledger.account, release: ledger.release, last: () => [] }),
    complete: probeWireOf(() => broken),
  });
  const out = await probe();
  assert.deepEqual(out.candidates, [{ model: 'flash-chat', served: false, strict: false, ms: 0, why: 'It did not answer.' }]);
  assert.ok(!JSON.stringify(out).includes(SECRET));
});
