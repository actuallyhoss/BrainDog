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

const { NavPrefs, moved } = await import('./nav-prefs.svelte.ts');
type Prefs = import('./nav-prefs.svelte.ts').Prefs;

type Value = string[] | string | boolean | Record<string, string> | import('./page/shelf.ts').Shelved[] | null;
type Sent = { key: string; value: Value };

const recorder = (answer: (s: Sent) => { from: 'kept' } | { from: 'refused'; fix: string } = () => ({ from: 'kept' })) => {
  const sent: Sent[] = [];
  return {
    sent,
    send: async (key: keyof Prefs, value: Value) => {
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

test('NOBODY CHOSE, SO THE TOP BAR: the default shell is the bar of 19 October, on a record and off one', () => {
  const fresh = new NavPrefs({ order: [], hidden: [] });
  assert.equal(fresh.shape, 'bar');
  assert.equal(fresh.chosen, undefined);
  fresh.adopt({}, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  assert.equal(fresh.shape, 'bar', 'a record that keeps no shape drew something other than the top bar');
  assert.equal(fresh.chosen, undefined, 'the default was taken for a choice');

  const offline = new NavPrefs({ order: [], hidden: [] });
  offline.adopt(undefined, 'https://app.example', recorder(() => assert.fail('the sample sent a preference')).send);
  assert.equal(offline.shape, 'bar');
});

test("THE RECORD'S `rail` AND `side` ARE NOBODY'S CHOICE NOW AND DRAW THE DEFAULT TOP BAR", async () => {
  const old = new NavPrefs({ order: [], hidden: [] });
  old.adopt({ 'nav.shape': 'rail' }, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  assert.equal(old.shape, 'bar', 'a legacy rail was read as somebody choosing the rail');
  assert.equal(old.chosen, undefined, 'a rail nobody picked was read as a choice');

  const chosen = new NavPrefs({ order: [], hidden: [] });
  chosen.adopt({ 'nav.shape': 'side' }, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  assert.deepEqual([chosen.shape, chosen.chosen], ['bar', undefined], 'a rail kept by an older build drew something other than the top bar');

  const io = recorder();
  const picking = new NavPrefs({ order: [], hidden: [] });
  picking.adopt({ 'nav.shape': 'menu' }, 'https://app.example', io.send);
  assert.equal(picking.shape, 'menu');
  await picking.setShape('bar');
  assert.deepEqual(io.sent, [{ key: 'nav.shape', value: 'bar' }]);
});

test('A REFUSED SHAPE PUTS BACK NO CHOICE AT ALL, so the default stays the default', async () => {
  const prefs = new NavPrefs({ order: [], hidden: [] });
  prefs.adopt({}, 'https://app.example', recorder(() => ({ from: 'refused', fix: 'Sign in again.' })).send);
  assert.deepEqual(await prefs.setShape('menu'), { from: 'refused', fix: 'Sign in again.' });
  assert.deepEqual([prefs.shape, prefs.chosen], ['bar', undefined]);
});

test("AN UNDO BACK TO NO CHOICE GOES AS THE RECORD'S `rail`, which every device reads as the default again", async () => {
  const io = recorder();
  const prefs = new NavPrefs({ order: [], hidden: [] });
  prefs.adopt({}, 'https://app.example', io.send);
  const before = prefs.chosen;
  await prefs.setShape('menu');
  await prefs.setShape(before);
  assert.deepEqual([prefs.shape, prefs.chosen], ['bar', undefined], 'the undo left a shape somebody picked');
  assert.deepEqual(io.sent, [
    { key: 'nav.shape', value: 'menu' },
    { key: 'nav.shape', value: 'rail' },
  ]);

  const other = new NavPrefs({ order: [], hidden: [], shape: 'menu' });
  other.adopt({ 'nav.shape': 'rail' }, 'https://app.example', recorder(() => assert.fail('adopting boot sent a preference')).send);
  assert.deepEqual([other.shape, other.chosen], ['bar', undefined], 'another device kept the menu it last heard of');
});

test("A LEGACY `rail` IS NOT BROUGHT BACK BY THE COOKIE, AND THE TOP BAR'S OLD `bar` COPY IS NOBODY'S CHOICE", () => {
  const g = globalThis as { document?: { cookie: string } };
  /* A cookie jar that keeps what is written, so the copy left for the next first paint can be read back. */
  const jar = (shape: string) => {
    let held = `bd_pref=${encodeURIComponent(JSON.stringify({ shape }))}`;
    g.document = {
      get cookie() {
        return held;
      },
      set cookie(next: string) {
        held = next.split(';')[0] ?? '';
      },
    };
  };
  const quiet = () => recorder(() => assert.fail('adopting boot sent a preference')).send;
  const copy = () => JSON.parse(decodeURIComponent(g.document!.cookie.slice('bd_pref='.length))).shape as unknown;
  try {
    /* `new NavPrefs()` READS THE DEVICE, as the tab's own copy does before `boot` answers. */
    jar('menu');
    const legacy = new NavPrefs();
    assert.equal(legacy.shape, 'menu', "the cookie's copy did not draw the first paint");
    legacy.adopt({ 'nav.shape': 'rail' }, 'https://app.example', quiet());
    assert.equal(legacy.shape, 'bar', "a legacy rail was read as the cookie's menu");

    /* EVERY BOOT OF THE TOP-BAR BUILDS WROTE `bar` into the cookie, chosen or not, and a top bar somebody chose on a
       record is the record's to say. So a `bar` copy beside a record with no shape is the default's, and goes. */
    jar('bar');
    const old = new NavPrefs();
    assert.equal(old.shape, 'bar', 'the first paint is still the copy, before the record answers');
    old.adopt({}, 'https://app.example', quiet());
    assert.deepEqual([old.shape, old.chosen], ['bar', undefined]);
    assert.equal(copy(), undefined, 'the old default stayed in the cookie for the next first paint');

    jar('bar');
    const kept = new NavPrefs();
    kept.adopt({ 'nav.shape': 'bar' }, 'https://app.example', quiet());
    assert.deepEqual([kept.shape, copy()], ['bar', 'bar'], "a top bar the record keeps lost to the old default's rule");

    /* ANY OTHER SHAPE THE DEVICE HOLDS IS ITS OWN, and stays while the record says nothing. */
    jar('menu');
    const device = new NavPrefs();
    device.adopt({}, 'https://app.example', quiet());
    assert.deepEqual([device.shape, copy()], ['menu', 'menu'], 'a device with a menu and a record with no shape lost the menu');

    jar('rail');
    const unset = new NavPrefs();
    unset.adopt({}, 'https://app.example', quiet());
    assert.equal(unset.shape, 'bar', 'a rail an older build left on the device was drawn as a choice');

    /* AND WITH NO RECORD THE COOKIE IS THE WHOLE ANSWER, a top bar included: nobody else could have written it. */
    jar('bar');
    const sample = new NavPrefs();
    sample.adopt(undefined, 'https://app.example', quiet());
    assert.deepEqual([sample.shape, sample.chosen], ['bar', 'bar']);
  } finally {
    delete g.document;
  }
});

/* ── moving, the home page and the names ──────────────────────────────── */

const RAIL = [
  ['Money', [{ href: '/p/money' }, { href: '/p/bills' }, { href: '/p/tax' }]],
  ['Work', [{ href: '/p/work' }, { href: '/p/board' }]],
] as const;

test('A PAGE MOVES ONE PLACE INSIDE ITS HEADING, and never across one', () => {
  assert.deepEqual(moved(RAIL, '/p/bills', -1), ['/p/bills', '/p/money', '/p/tax', '/p/work', '/p/board']);
  assert.deepEqual(moved(RAIL, '/p/bills', 1), ['/p/money', '/p/tax', '/p/bills', '/p/work', '/p/board']);
  assert.equal(moved(RAIL, '/p/tax', 1), null, 'the last page of Money moved into Work');
  assert.equal(moved(RAIL, '/p/work', -1), null, 'the first page of Work moved into Money');
  assert.equal(moved(RAIL, '/p/nowhere', 1), null);
  /* A HIDDEN NEIGHBOUR IS PASSED OVER, so a press always moves the page past one the person can see. */
  assert.deepEqual(moved(RAIL, '/p/money', 1, (h) => h === '/p/bills'), ['/p/tax', '/p/bills', '/p/money', '/p/work', '/p/board']);
  assert.equal(moved(RAIL, '/p/bills', 1, (h) => h === '/p/tax'), null);
});

test('A MOVE KEEPS THE LISTS WHERE THEY WERE, after the pages it names', async () => {
  const prefs = new NavPrefs({ order: ['/r/clients', '/p/money', '/r/tasks'], hidden: [] });
  const io = recorder();
  prefs.adopt({}, 'https://app.example', io.send);
  assert.equal(prefs.move(RAIL, '/p/money', -1), null, 'a press at the edge sent something');
  assert.deepEqual(await prefs.move(RAIL, '/p/money', 1), { from: 'kept' });
  assert.deepEqual(prefs.order, ['/p/bills', '/p/money', '/p/tax', '/p/work', '/p/board', '/r/clients', '/r/tasks']);
  assert.deepEqual(io.sent, [{ key: 'nav.order', value: prefs.order }]);
});

test('THE HOME PAGE IS AN ADDRESS, and Today is no choice at all', async () => {
  const prefs = new NavPrefs({ order: [], hidden: [] });
  const io = recorder();
  prefs.adopt({ 'home.page': '/p/money' }, 'https://app.example', io.send);
  assert.equal(prefs.home, '/p/money');
  await prefs.setHome('/?work');
  await prefs.setHome('/');
  assert.equal(prefs.home, null);
  assert.deepEqual(io.sent, [
    { key: 'home.page', value: '/?work' },
    { key: 'home.page', value: '/' },
  ]);
});

test('TODAY PUT BACK ON ONE DEVICE IS TODAY ON THE NEXT, not the page that device last heard of', () => {
  const g = globalThis as { localStorage?: Storage };
  const held = new Map<string, string>([['bd_nav_home', JSON.stringify('/p/money')]]);
  g.localStorage = {
    getItem: (k: string) => held.get(k) ?? null,
    setItem: (k: string, v: string) => void held.set(k, v),
    removeItem: (k: string) => void held.delete(k),
  } as Storage;
  try {
    const prefs = new NavPrefs({ order: [], hidden: [], home: '/p/money' });
    prefs.adopt({ 'home.page': '/' }, 'https://app.example', recorder().send);
    assert.equal(prefs.home, null);
    assert.equal(held.has('bd_nav_home'), false);
  } finally {
    delete g.localStorage;
  }
});

test('A RECORD THAT DOES NOT KEEP THE HOME PAGE YET PUTS IT BACK, and says why', async () => {
  const prefs = new NavPrefs({ order: [], hidden: [], home: null });
  prefs.adopt({}, 'https://app.example', recorder(() => ({ from: 'refused', fix: 'key is one of nav.order.' })).send);
  assert.deepEqual(await prefs.setHome('/p/money'), { from: 'refused', fix: 'key is one of nav.order.' });
  assert.equal(prefs.home, null);
});

test("A NAME IS THE PERSON'S OWN, and the page's own title or nothing takes it away", async () => {
  const prefs = new NavPrefs({ order: [], hidden: [] });
  const io = recorder();
  prefs.adopt({ 'nav.labels': { '/p/money': 'Cash', bad: 'x', '/p/x': 3 } as unknown as Record<string, string> }, 'https://app.example', io.send);
  assert.deepEqual(prefs.labels, { '/p/money': 'Cash' }, 'a name that is not an address to text was kept');
  assert.equal(prefs.labelOf('/p/money', 'Money'), 'Cash');
  assert.equal(prefs.labelOf('/p/tax', 'Tax'), 'Tax');
  assert.deepEqual(prefs.relabel([{ href: '/p/money', title: 'Money', section: 'A' }]), [{ href: '/p/money', title: 'Cash', section: 'A' }]);

  await prefs.setLabel('/p/tax', '  VAT and tax  ', 'Tax');
  await prefs.setLabel('/p/money', 'Money', 'Money');
  await prefs.setLabel('/p/tax', '', 'Tax');
  assert.deepEqual(prefs.labels, {});
  assert.deepEqual(io.sent, [
    { key: 'nav.labels', value: { '/p/money': 'Cash', '/p/tax': 'VAT and tax' } },
    { key: 'nav.labels', value: { '/p/tax': 'VAT and tax' } },
    { key: 'nav.labels', value: {} },
  ]);
});
