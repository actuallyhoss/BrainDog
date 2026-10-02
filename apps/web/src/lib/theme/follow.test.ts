/**
 * The person's look adopted from `boot`, once per tab, and nothing adopted for nobody.
 *
 * ONCE IS THE CASE THAT MATTERS. The root layout's load hands `draw` the kept `boot` on every navigation, so a second
 * adopt would put back the look as the tab opened over a scheme picked in Settings since.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as pref from '../pref.ts';
import { follow, prefsOf } from './follow.ts';

function page(initial = '') {
  (globalThis as { document?: unknown }).document = {
    get cookie() {
      return initial;
    },
    set cookie(next: string) {
      initial = next.split(';')[0] ?? '';
    },
    documentElement: { setAttribute() {}, removeAttribute() {} },
  };
}

const boot = (prefs?: Record<string, unknown>) => ({ registers: [], me: prefs ? { person: 'p', prefs } : { person: 'p' } });

test('prefsOf reads me.prefs and nothing else', () => {
  assert.equal(prefsOf(null), undefined);
  assert.equal(prefsOf({ me: {} }), undefined);
  assert.equal(prefsOf({ me: { prefs: ['look.scheme'] } }), undefined);
  assert.deepEqual(prefsOf(boot({ 'look.scheme': 'dark' })), { 'look.scheme': 'dark' });
});

test('nobody signed in adopts nothing and sends nothing; a person is adopted once', async () => {
  page();
  const sent: string[] = [];
  const send: pref.Send = async (key) => (sent.push(key), { from: 'kept' });

  follow(boot(), send);
  follow(null, send);
  assert.equal(pref.follows(), false, 'a boot with no person in it started sending');

  follow(boot({ 'look.scheme': 'dark', 'look.accent': 'House' }), send);
  assert.equal(pref.read().scheme, 'dark');
  assert.equal(pref.follows(), true);

  pref.apply('scheme', 'light');
  follow(boot({ 'look.scheme': 'dark' }), send);
  assert.equal(pref.read().scheme, 'light', 'the kept boot put back the scheme the tab opened with');

  await pref.settled();
  assert.deepEqual(sent, ['look.scheme']);
  pref.follow(null);
});
