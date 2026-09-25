/**
 * The owner's choice of how Slash is run, `a` or `byo`, and the model name `byo` needs, without a browser.
 *
 * WHAT A BROWSER TEST WOULD MISS is what gets SENT. `configure` in `packages/slash/src/index.ts` checks `model.trim() === ''`
 * and then stores the name as it came, spaces and all, and the host posts that stored name to the endpoint as `model`
 * (`modelSent` in `packages/host/src/slash.ts`). So a name pasted with a trailing space saves with a green toast and then
 * fails on every ask, at an endpoint that serves no model called `llama3:8b `. The patch is the thing to hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { SlashSettings, SlashStatus } from '@braindog/client';
import { modelSaid, patchOf, startOf, words } from './slash-model.ts';

const RESETS = '2026-10-01T00:00:00.000Z';
const on = (tier: SlashStatus['tier'], model = 'glm-5.3-flash'): SlashStatus => ({ tier, model, asks: { used: 3, cap: 80, resets: RESETS } });
const saved = (tier: SlashSettings['tier'], model: string | null, ask_cap = 80): SlashSettings => ({
  tier,
  model,
  grant_id: null,
  ask_cap,
  updated_at: '2026-09-22T10:00:00.000Z',
});

test('on tier a the choice starts at the monthly limit with an empty name, not the routing name the status shows', () => {
  /* `glm-5.3-flash` is the package's short name for the job, not a model the owner's endpoint was asked to serve by that
     name, so offering it as the starting `byo` name would put the engine's word in the owner's field. */
  assert.deepEqual(startOf(on('a')), { kind: 'a', typed: '' });
});

test('on tier byo the choice starts at the endpoint, with the name the host is using', () => {
  assert.deepEqual(startOf(on('byo', 'llama3:8b')), { kind: 'byo', typed: 'llama3:8b' });
});

test('on tier b there is no choice to offer, because this row does not offer b and cannot say what it would switch from', () => {
  assert.equal(startOf(on('b', 'gpt-x')), null);
});

test('the name is sent trimmed, because the engine stores what it is given and the endpoint is asked for it verbatim', () => {
  assert.deepEqual(patchOf({ kind: 'a', typed: '' }, 'byo', '  llama3:8b \n'), { tier: 'byo', model: 'llama3:8b' });
});

test('byo with no name sends nothing, so there is nothing to press rather than a save the engine will refuse', () => {
  assert.equal(patchOf({ kind: 'a', typed: '' }, 'byo', ''), null);
  assert.equal(patchOf({ kind: 'a', typed: '' }, 'byo', '   '), null);
});

test('nothing changed sends nothing: the same kind, and on byo the same name once trimmed', () => {
  assert.equal(patchOf({ kind: 'a', typed: '' }, 'a', ''), null);
  assert.equal(patchOf({ kind: 'byo', typed: 'llama3:8b' }, 'byo', 'llama3:8b'), null);
  assert.equal(patchOf({ kind: 'byo', typed: 'llama3:8b' }, 'byo', ' llama3:8b '), null);
});

test('a new name on byo is sent with its tier, so the patch reads on its own', () => {
  assert.deepEqual(patchOf({ kind: 'byo', typed: 'llama3:8b' }, 'byo', 'qwen3:14b'), { tier: 'byo', model: 'qwen3:14b' });
});

test('back to the monthly limit sends the tier alone, whatever is still in the name field', () => {
  /* THE ENGINE CLEARS THE NAME ON TIER `a` ITSELF (`model: tier === 'a' ? null : model`), so sending the stale name would be
     sending a value the engine exists to throw away. */
  assert.deepEqual(patchOf({ kind: 'byo', typed: 'llama3:8b' }, 'a', 'llama3:8b'), { tier: 'a' });
});

test('what saving says names the model on byo, and the limit on a', () => {
  assert.equal(modelSaid(saved('byo', 'llama3:8b')), 'Slash asks llama3:8b on your own endpoint, with no monthly limit.');
  assert.equal(modelSaid(saved('a', null, 40)), 'Slash counts its asks against the monthly limit again, up to 40 a month.');
  assert.equal(modelSaid(saved('a', null, 1)), 'Slash counts its asks against the monthly limit again, up to 1 a month.');
  assert.equal(modelSaid(saved('a', null, 0)), 'Slash counts its asks against the monthly limit again, and the limit is zero, so it is off.');
});

test('the two choices are the two the brief offers, and neither is tier b', () => {
  assert.deepEqual(Object.keys(words.kinds), ['a', 'byo']);
});
