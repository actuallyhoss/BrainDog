/**
 * The owner's choice of how Slash is run, "Included" or "Your own key" on every host, without a browser.
 *
 * WHAT A BROWSER TEST WOULD MISS is what gets SENT. A name pasted with a trailing space once saved with a green toast and
 * then failed on every ask, and his own key is four fields where one left out keeps a stale address or sends none. The
 * patch is the thing to hold, and the picker's list: a password in it would be a list of mistakes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { SlashSettings } from '@braindog/client';
import { chosen, endpointSaid, keysOf, kindsOn, modelOn, modelSaid, nowSaid, patchOf, startOf, words, type Start } from './slash-model.ts';

const GRANT = '01M33H56ZCMM62YT38ARN8JRM8';
const saved = (over: Partial<SlashSettings> = {}): SlashSettings => ({
  tier: 'a',
  model: null,
  grant_id: null,
  ask_cap: 80,
  updated_at: '2026-09-22T10:00:00.000Z',
  ...over,
});
const included: Start = { kind: 'included', provider: 'anthropic', base_url: '', model: '', grant_id: null };
const keyed: Start = { kind: 'key', provider: 'anthropic', base_url: '', model: 'claude-x', grant_id: GRANT };

test('every host offers the same two, Included and his own key', () => {
  assert.deepEqual(kindsOn('cloud'), ['included', 'key']);
  assert.deepEqual(kindsOn('self-host'), ['included', 'key']);
  assert.deepEqual(kindsOn(undefined), ['included', 'key']);
});

test("the model field under Included is a self-host's alone", () => {
  assert.equal(modelOn('cloud'), false);
  assert.equal(modelOn('self-host'), true);
});

test('no word of the old third form is left on the form', () => {
  const said = JSON.stringify(words);
  assert.equal(/\bbyo\b|no limit, it is my endpoint|counts nothing/iu.test(said), false);
  assert.equal(said.includes('\u2014'), false);
});

test('the form starts as it was saved, his own key with its provider, address, model and key', () => {
  assert.deepEqual(startOf(saved()), included);
  assert.deepEqual(startOf(saved({ tier: 'b', provider: 'openai', base_url: 'https://api.example.com/v1', model: 'm', grant_id: GRANT })), {
    kind: 'key',
    provider: 'openai',
    base_url: 'https://api.example.com/v1',
    model: 'm',
    grant_id: GRANT,
  });
});

test('a record on its own key from before there were two providers reads as chat completions', () => {
  assert.equal(startOf(saved({ tier: 'b', model: 'm', grant_id: GRANT })).provider, 'openai');
});

test('his own key sends all four, the name trimmed and an empty address as the provider default', () => {
  assert.deepEqual(patchOf(included, { ...keyed, model: '  claude-x \n' }), {
    source: 'key',
    provider: 'anthropic',
    base_url: null,
    model: 'claude-x',
    grant_id: GRANT,
  });
});

test('his own key with no key picked, or no model, sends nothing rather than a save the engine refuses', () => {
  assert.equal(patchOf(included, { ...keyed, grant_id: null }), null);
  assert.equal(patchOf(included, { ...keyed, model: '   ' }), null);
});

test('nothing changed sends nothing, on every kind', () => {
  assert.equal(patchOf(included, included), null);
  assert.equal(patchOf(keyed, { ...keyed }), null);
  assert.equal(patchOf({ ...included, model: 'llama3:8b' }, { ...included, model: ' llama3:8b ' }, true), null);
});

test('back to Included sends the source alone, whatever is still in the fields', () => {
  assert.deepEqual(patchOf(keyed, { ...keyed, kind: 'included' }), { source: 'included' });
});

test('a name under Included on a self-host is sent with the source, trimmed, and never the old tier', () => {
  assert.deepEqual(patchOf(included, { ...included, model: '  llama3:8b \n' }, true), { source: 'included', model: 'llama3:8b' });
  assert.deepEqual(patchOf({ ...included, model: 'llama3:8b' }, included, true), { source: 'included', model: null });
  assert.deepEqual(patchOf(keyed, { ...keyed, kind: 'included', model: '' }, true), { source: 'included' });
});

test('on the Cloud a name under Included is never sent', () => {
  assert.equal(patchOf(included, { ...included, model: 'llama3:8b' }), null);
});

test('a record kept on the old third form reads as Included with its model name in the field', () => {
  const start = startOf(saved({ source: 'included', tier: 'byo', model: 'llama3:8b' }));
  assert.deepEqual(start, { ...included, model: 'llama3:8b' });
  assert.equal(nowSaid(start), 'Now: the included model, llama3:8b.');
  assert.equal(startOf(saved({ tier: 'byo', model: 'llama3:8b' })).kind, 'included');
});

test("picking a kind puts that kind's own saved name in the field, never the other kind's", () => {
  assert.equal(chosen(keyed, keyed, 'included').model, '');
  assert.equal(chosen(keyed, { ...keyed, kind: 'included', model: '' }, 'key').model, 'claude-x');
  const hosted = { ...included, model: 'llama3:8b' };
  assert.equal(chosen(hosted, { ...hosted, kind: 'key', model: '' }, 'included').model, 'llama3:8b');
});

test("Included on a self-host names the endpoint boot gives, or says the host's own model", () => {
  assert.equal(endpointSaid(undefined), "This host's own model");
  assert.equal(endpointSaid('  '), "This host's own model");
  assert.equal(endpointSaid('http://10.0.0.5:11434/v1'), "This host's own model");
  assert.equal(endpointSaid('gpu-box.local:11434'), "This host's own model");
  assert.equal(endpointSaid('10.0.0.5'), "This host's own model");
  assert.equal(endpointSaid('gpu-box.local'), "This host's own model");
  assert.equal(endpointSaid('Ollama'), "This host's endpoint: Ollama");
});

test('the picker offers live API tokens only, by label, never a password or a revoked key', () => {
  const grants = [
    { id: 'g3', label: 'zeta', kind: 'api_token', revoked_at: null },
    { id: 'g1', label: 'bank', kind: 'password', revoked_at: null },
    { id: 'g2', label: 'alpha', kind: 'api_token', revoked_at: null },
    { id: 'g4', label: 'old', kind: 'api_token', revoked_at: '2026-09-01T00:00:00.000Z' },
  ];
  assert.deepEqual(keysOf(grants), [
    { id: 'g2', label: 'alpha' },
    { id: 'g3', label: 'zeta' },
  ]);
});

test('what saving says names the model and provider on his key, and the limit on Included', () => {
  assert.equal(
    modelSaid(saved({ tier: 'b', provider: 'anthropic', model: 'claude-x', grant_id: GRANT })),
    'Slash answers on your own key now: claude-x, through Anthropic Messages.',
  );
  assert.equal(
    modelSaid(saved({ source: 'included', model: 'llama3:8b' })),
    'Slash answers on the included model, llama3:8b, counted against the monthly limit, up to 80 a month.',
  );
  assert.equal(modelSaid(saved({ ask_cap: 40 })), 'Slash answers on the included model, counted against the monthly limit, up to 40 a month.');
  assert.equal(modelSaid(saved({ ask_cap: 0 })), 'Slash answers on the included model, counted against the monthly limit, and the limit is zero, so it is off.');
});

test('the line above the form says what answers now', () => {
  assert.equal(nowSaid(included), 'Now: the included model.');
  assert.equal(nowSaid(keyed), 'Now: your own key, claude-x through Anthropic Messages.');
});
