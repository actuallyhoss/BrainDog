/**
 * `nav-prefs.svelte.ts`: the rail's order and hidden pages, kept for the person on a record and on the device without.
 *
 * COMPILED ON THE WAY IN, as `a11y/keys.svelte.test.ts` explains: the module constructs its instance at load, and a rune
 * has no runtime binding under a plain `node --test`. Compiled for the server a `$state` field is a plain field, so these
 * tests hold the values and the sends, not reactivity.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { NavPrefs } = await import('./nav-prefs.svelte.ts');
type Prefs = import('./nav-prefs.svelte.ts').Prefs;

type Sent = { key: string; value: string[] | string | boolean };

const recorder = (answer: (s: Sent) => { from: 'kept' } | { from: 'refused'; fix: string } = () => ({ from: 'kept' })) => {
  const sent: Sent[] = [];
  return {
    sent,
    send: async (key: keyof Prefs, value: string[] | string | boolean) => {
      const s = { key, value };
      sent.push(s);
      return answer(s);
    },
  };
};

test('ON A RECORD, WHAT BOOT SAID IS ADOPTED ONCE, and a hide and a show are each sent as the whole list', async () => {
  const prefs = new NavPrefs({ order: ['/p/device'], hidden: ['/p/device'] });
  const io = recorder();
  prefs.adopt({ 'nav.hidden': ['/p/money'] }, 'https://app.example', io.send);
  assert.deepEqual(prefs.hidden, ['/p/money'], "this device's copy stood over the record's");
  assert.deepEqual(prefs.order, ['/p/device'], 'a record with no order of its own wiped the one on screen');
  assert.equal(prefs.kept, true);

  assert.deepEqual(await prefs.hide('/p/kiln'), { from: 'kept' });
  assert.deepEqual(await prefs.hide('/p/kiln'), { from: 'kept' });
  assert.deepEqual(prefs.hidden, ['/p/money', '/p/kiln'], 'a page hidden twice was listed twice');
  await prefs.show('/p/money');
  assert.deepEqual(io.sent, [
    { key: 'nav.hidden', value: ['/p/money', '/p/kiln'] },
    { key: 'nav.hidden', value: ['/p/money', '/p/kiln'] },
    { key: 'nav.hidden', value: ['/p/kiln'] },
  ]);

  /* A LATER BOOT, which the tab keeps from when it opened, does not put the old rail back. */
  prefs.adopt({ 'nav.hidden': ['/p/money'] }, 'https://app.example', io.send);
  assert.deepEqual(prefs.hidden, ['/p/kiln']);
});

test('READING BOOT WRITES NOTHING, even where the record keeps no shape or switch of its own', () => {
  const prefs = new NavPrefs({ order: [], hidden: [], shape: 'menu', suggest: false });
  prefs.adopt({}, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  prefs.adopt({ 'nav.shape': 'bar', 'pen.suggest': true }, 'https://app.example', recorder(() => assert.fail('a second boot sent one')).send);
  assert.equal(prefs.kept, true);
});

test('A REFUSED CHANGE IS PUT BACK, and says the record sentence', async () => {
  const prefs = new NavPrefs({ order: [], hidden: [] });
  prefs.adopt({}, 'https://app.example', recorder(() => ({ from: 'refused', fix: 'Sign in again.' })).send);
  assert.deepEqual(await prefs.hide('/p/money'), { from: 'refused', fix: 'Sign in again.' });
  assert.deepEqual(prefs.hidden, [], 'the rail kept a hide the record refused');
  assert.deepEqual(await prefs.setOrder(['/p/b', '/p/a']), { from: 'refused', fix: 'Sign in again.' });
  assert.deepEqual(prefs.order, []);
});

test('WITH NO RECORD, NOTHING IS SENT and the change stays on this device', async () => {
  const prefs = new NavPrefs({ order: [], hidden: [] });
  prefs.adopt(undefined, 'https://app.example', recorder(() => assert.fail('the sample sent a preference')).send);
  assert.equal(prefs.kept, false);
  assert.deepEqual(await prefs.hide('/p/money'), { from: 'device' });
  assert.deepEqual(prefs.hidden, ['/p/money']);
});

test('TWO QUICK MOVES ARRIVE IN THE ORDER THEY WERE MADE', async () => {
  const prefs = new NavPrefs({ order: [], hidden: [] });
  const sent: string[][] = [];
  let slow = true;
  prefs.adopt({}, 'https://app.example', async (_key, value) => {
    if (slow) {
      slow = false;
      await new Promise((r) => setTimeout(r, 20));
    }
    sent.push(value as string[]);
    return { from: 'kept' };
  });
  await Promise.all([prefs.setOrder(['/p/a', '/p/b']), prefs.setOrder(['/p/b', '/p/a'])]);
  assert.deepEqual(sent, [['/p/a', '/p/b'], ['/p/b', '/p/a']]);
  assert.deepEqual(prefs.order, ['/p/b', '/p/a']);
});

test("THE RECORD'S `rail` IS NOBODY'S CHOICE, and a rail chosen now is kept as `side`", () => {
  const old = new NavPrefs({ order: [], hidden: [] });
  old.adopt({ 'nav.shape': 'rail' }, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  assert.equal(old.shape, 'bar');

  const chosen = new NavPrefs({ order: [], hidden: [] });
  chosen.adopt({ 'nav.shape': 'side' }, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  assert.equal(chosen.shape, 'rail');
});
