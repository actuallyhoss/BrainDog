/**
 * `openPage`, the one way a gate opens a page, held without a browser.
 *   node --test tools/gates/test/lib-open-page.test.mjs
 *
 * `pagePlan` is read whole, and `openPage` is driven against a stand-in that writes down every call, so the order is
 * held too: the record keeps the settings before the page loads, the clock is pinned before the page exists, and the
 * screen is waited for. No browser starts, so this runs in the tools leg.
 */

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { AREAS } from '../../../apps/web/src/routes/settings/[area]/place.ts';
import { budget, openPage, pagePlan, readiness } from '../lib.mjs';
import { clockOf, recordAt, startRecord } from '../record.mjs';
import { routesFor, routesOf } from '../routes.mjs';

const WEB = join(import.meta.dirname, '..', '..', '..', 'apps', 'web');

const NOW = Date.UTC(2026, 8, 3, 12);
const URL_ = 'http://localhost:1/today';

/** A stand-in record: its clock, and every setting it was asked to keep, in order. Each its own base, as each record is. */
let bases = 0;
function fakeRecord(log) {
  return { base: `http://127.0.0.1:${++bases}`, now: NOW, setPref: async (key, value) => log.push(['setPref', key, value]) };
}

/** A stand-in browser, context and page that write down what was asked of them. */
function fakeBrowser(log, { gotoThrows = false, timeouts = 0, refused = 0, lost = 0, lostAs = 'Failed to fetch dynamically imported module' } = {}) {
  const handlers = {};
  let quiet = 0;
  let loads = 0;
  const page = {
    on: (name, fn) => (handlers[name] = fn),
    goto: async (to, opts) => {
      log.push(['goto', to, opts.waitUntil]);
      if (gotoThrows || loads < refused) {
        loads++;
        throw new Error('page.goto: net::ERR_CONNECTION_REFUSED');
      }
      /* A LOAD THAT LOST ONE OF ITS OWN MODULES and settled anyway, as a loaded runner's first look can. */
      if (loads++ < refused + lost) handlers.pageerror?.(new Error(`${lostAs}: http://localhost:1/_app/immutable/nodes/3.js`));
      if (quiet++ < timeouts) {
        handlers.pageerror?.(new Error('Failed to fetch dynamically imported module'));
        throw Object.assign(new Error('page.goto: Timeout 30000ms exceeded.'), { name: 'TimeoutError' });
      }
      handlers.pageerror?.(new Error('boom'));
      handlers.console?.({ type: () => 'error', text: () => 'Failed to load resource' });
      handlers.console?.({ type: () => 'log', text: () => 'hello' });
      handlers.response?.({ ok: () => false, status: () => 404, url: () => 'http://localhost:1/api/get?register=jobs' });
      handlers.response?.({ ok: () => true, status: () => 200, url: () => 'http://localhost:1/api/boot' });
    },
  };
  const context = {
    clock: { setFixedTime: async (t) => log.push(['clock', t]) },
    newPage: async () => (log.push(['newPage']), page),
    addCookies: async (c) => log.push(['cookies', c]),
    addInitScript: async () => log.push(['init']),
    close: async () => log.push(['close']),
  };
  return { newContext: async (o) => (log.push(['newContext', o]), context) };
}

const ready = (log) => ({ settled: async (_page, prerendered) => (log.push(['settled', prerendered]), 'ready') });

test('the plan pins the record clock and keeps nothing unasked', () => {
  const plan = pagePlan(URL_, { width: 390, record: fakeRecord([]), touch: true });
  assert.equal(plan.clock, NOW);
  assert.deepEqual(plan.prefs, []);
  assert.deepEqual(plan.context.viewport, { width: 390, height: budget('layout').viewportHeightPx });
  assert.equal(plan.context.hasTouch, true);
  assert.equal(plan.context.isMobile, true);
  assert.equal(plan.context.reducedMotion, 'reduce');
  assert.equal('colorScheme' in plan.context, false);
  assert.equal(plan.waitUntil, 'domcontentloaded');
});

test('a clock given wins over the record, and a date is read as its instant', () => {
  const later = Date.UTC(2026, 9, 1);
  assert.equal(pagePlan(URL_, { width: 1512, record: fakeRecord([]), clock: new Date(later) }).clock, later);
  assert.equal(pagePlan(URL_, { width: 1512, clock: '2026-09-03T12:00:00.000Z' }).clock, NOW);
});

test('no clock is refused, and clock: null is said on purpose', () => {
  assert.throws(() => pagePlan(URL_, { width: 1512 }), /no clock/);
  assert.throws(() => pagePlan(URL_, { width: 1512, clock: 'not a date' }), /no clock/);
  assert.equal(pagePlan(URL_, { width: 1512, clock: null }).clock, null);
});

test("a record whose clock is not known is no clock, and only the call says clock: null", () => {
  assert.throws(() => pagePlan(URL_, { width: 390, record: { ...fakeRecord([]), now: null } }), /no clock/);
});

test('a setting with no record to keep it is refused, by its name', () => {
  assert.throws(() => pagePlan(URL_, { width: 390, clock: NOW, prefs: { 'nav.shape': 'bar' } }), /nav\.shape can only be kept by a record/);
});

test('a width that is not whole pixels is refused', () => {
  assert.throws(() => pagePlan(URL_, { clock: NOW }), /width/);
  assert.throws(() => pagePlan(URL_, { width: 390.5, clock: NOW }), /width/);
});

test('scheme, height and the wait are carried as given', () => {
  const plan = pagePlan(URL_, { width: 1512, height: 900, clock: NOW, scheme: 'dark', waitUntil: 'networkidle', prerendered: true });
  assert.equal(plan.context.colorScheme, 'dark');
  assert.equal(plan.context.viewport.height, 900);
  assert.equal(plan.waitUntil, 'networkidle');
  assert.equal(plan.prerendered, true);
});

test("the device's cookies and a worker block are carried as given, and left out when not given", () => {
  const plan = pagePlan(URL_, { width: 1440, clock: NOW, cookies: { bd_pref: '%7B%7D' }, serviceWorkers: 'block' });
  assert.deepEqual(plan.cookies, [{ name: 'bd_pref', value: '%7B%7D', url: 'http://localhost:1' }]);
  assert.equal(plan.context.serviceWorkers, 'block');
  const bare = pagePlan(URL_, { width: 1440, clock: NOW });
  assert.deepEqual(bare.cookies, []);
  assert.equal('serviceWorkers' in bare.context, false);
});

test('the cookies are on the context before the page exists', async () => {
  const log = [];
  const opened = await openPage(fakeBrowser(log), URL_, { width: 390, clock: NOW, cookies: { bd_pref: 'x' }, ready: ready(log) });
  const at = (name) => log.findIndex((l) => l[0] === name);
  assert.ok(at('cookies') >= 0 && at('cookies') < at('newPage'));
  assert.equal(opened.state, 'ready');
});

test('an init script is on the context before the page exists, so the first load runs it', async () => {
  const log = [];
  await openPage(fakeBrowser(log), URL_, { width: 390, clock: NOW, init: () => {}, ready: ready(log) });
  const at = (name) => log.findIndex((l) => l[0] === name);
  assert.ok(at('init') >= 0 && at('init') < at('newPage') && at('newPage') < at('goto'));
  const bare = [];
  await openPage(fakeBrowser(bare), URL_, { width: 390, clock: NOW, ready: ready(bare) });
  assert.equal(bare.some((l) => l[0] === 'init'), false);
});

test('openPage keeps the settings, pins the clock, then loads and waits, in that order', async () => {
  const log = [];
  const opened = await openPage(fakeBrowser(log), URL_, { width: 390, record: fakeRecord(log), prefs: { 'nav.shape': 'menu', 'look.scheme': null }, ready: ready(log) });
  assert.deepEqual(
    log.map((l) => l[0]),
    ['setPref', 'setPref', 'newContext', 'clock', 'newPage', 'goto', 'settled'],
  );
  assert.deepEqual(log[0], ['setPref', 'nav.shape', 'menu']);
  assert.deepEqual(log[1], ['setPref', 'look.scheme', null]);
  assert.deepEqual(log[3], ['clock', NOW]);
  assert.equal(opened.state, 'ready');
});

test("one page's settings are handed back before the next page of the same record opens", async () => {
  const log = [];
  const record = fakeRecord(log);
  await openPage(fakeBrowser([]), URL_, { width: 390, record, prefs: { 'nav.shape': 'menu', 'look.scheme': 'dark' }, ready: ready([]) });
  log.length = 0;
  await openPage(fakeBrowser([]), URL_, { width: 390, record, prefs: { 'look.scheme': 'light' }, ready: ready([]) });
  assert.deepEqual(log, [['setPref', 'nav.shape', null], ['setPref', 'look.scheme', 'light']]);
  log.length = 0;
  await openPage(fakeBrowser([]), URL_, { width: 390, record, ready: ready([]) });
  assert.deepEqual(log, [['setPref', 'look.scheme', null]]);
});

test('the page errors are collected, console errors only, and a second load starts afresh', async () => {
  const log = [];
  const opened = await openPage(fakeBrowser(log), URL_, { width: 390, record: fakeRecord(log), ready: ready(log) });
  assert.deepEqual(opened.errors, [
    { kind: 'uncaught', text: 'boom' },
    { kind: 'console', text: 'Failed to load resource' },
  ]);
  assert.equal(await opened.goto('http://localhost:1/usage'), 'ready');
  assert.equal(opened.errors.length, 2, 'the second load collected its own two, not four');
  assert.deepEqual(opened.failed, [{ status: 404, path: '/api/get' }], 'only an answer that was not ok, by its path, once a load');
});

test('clock: null leaves the page unpinned', async () => {
  const log = [];
  await openPage(fakeBrowser(log), URL_, { width: 390, clock: null, ready: ready(log) });
  assert.equal(log.some((l) => l[0] === 'clock'), false);
});

test('no readiness is refused before anything opens', async () => {
  const log = [];
  await assert.rejects(openPage(fakeBrowser(log), URL_, { width: 390, record: fakeRecord(log) }), /no readiness/);
  assert.deepEqual(log, []);
});

test('a load that throws hands the context back', async () => {
  const log = [];
  await assert.rejects(openPage(fakeBrowser(log, { gotoThrows: true }), URL_, { width: 390, record: fakeRecord(log), ready: ready(log) }), /ERR_CONNECTION_REFUSED/);
  assert.equal(log.at(-1)[0], 'close');
});

test('a load that never goes quiet is opened once more, afresh, and not thrown', async () => {
  const log = [];
  const opened = await openPage(fakeBrowser(log, { timeouts: 1 }), URL_, { width: 390, clock: NOW, waitUntil: 'networkidle', ready: ready(log) });
  assert.deepEqual(log.filter((l) => l[0] === 'goto' || l[0] === 'settled').map((l) => l[0]), ['goto', 'goto', 'settled']);
  assert.equal(opened.state, 'ready');
  assert.equal(opened.errors.some((e) => /dynamically imported/.test(e.text)), false, 'the dead first load said nothing about the screen');
});

test('a load that never goes quiet twice is a page never settled, null, and the gate goes on', async () => {
  const log = [];
  const opened = await openPage(fakeBrowser(log, { timeouts: 2 }), URL_, { width: 390, clock: NOW, waitUntil: 'networkidle', ready: ready(log) });
  assert.equal(opened.state, null);
  assert.equal(log.some((l) => l[0] === 'settled'), false);
});

/* ── `again`: a load lost under a full run's load is opened once more (layout) ── */

const again = (why) => ({ ms: 0, said: (w) => why.push(w) });

test('a load that lost one of its modules is opened once more, afresh, when the gate asks', async () => {
  const log = [];
  const why = [];
  const opened = await openPage(fakeBrowser(log, { lost: 1 }), URL_, { width: 390, clock: NOW, ready: ready(log), again: again(why) });
  assert.deepEqual(log.filter((l) => l[0] === 'goto' || l[0] === 'settled').map((l) => l[0]), ['goto', 'settled', 'goto', 'settled']);
  assert.deepEqual(why, ['lost']);
  assert.equal(opened.state, 'ready');
  assert.equal(opened.errors.some((e) => /dynamically imported/.test(e.text)), false, 'the lost load said nothing about the screen');
});

test("WebKit's words for a lost module are a lost module too", async () => {
  const why = [];
  await openPage(fakeBrowser([], { lost: 1, lostAs: 'Importing a module script failed.' }), URL_, { width: 390, clock: NOW, ready: ready([]), again: again(why) });
  assert.deepEqual(why, ['lost']);
});

test('a module lost twice is the answer, and the printed rule reads it', async () => {
  const why = [];
  const opened = await openPage(fakeBrowser([], { lost: 2 }), URL_, { width: 390, clock: NOW, ready: ready([]), again: again(why) });
  assert.deepEqual(why, ['lost'], 'one more look and no third');
  assert.ok(opened.errors.some((e) => /dynamically imported/.test(e.text)));
});

test('a port not answering yet is opened once more, after the wait, and not thrown', async () => {
  const log = [];
  const why = [];
  const opened = await openPage(fakeBrowser(log, { refused: 1 }), URL_, { width: 390, clock: NOW, ready: ready(log), again: again(why) });
  assert.deepEqual(why, ['unreached']);
  assert.equal(opened.state, 'ready');
  assert.deepEqual(log.filter((l) => l[0] === 'goto' || l[0] === 'settled').map((l) => l[0]), ['goto', 'goto', 'settled']);
});

test('a port still not answering on the second try is a page never settled, null, and the gate goes on', async () => {
  const opened = await openPage(fakeBrowser([], { refused: 2 }), URL_, { width: 390, clock: NOW, ready: ready([]), again: again([]) });
  assert.equal(opened.state, null);
});

test('without `again` a lost module is read on the first look and a refused port still throws', async () => {
  const opened = await openPage(fakeBrowser([], { lost: 1 }), URL_, { width: 390, clock: NOW, ready: ready([]) });
  assert.ok(opened.errors.some((e) => /dynamically imported/.test(e.text)));
  await assert.rejects(openPage(fakeBrowser([], { refused: 1 }), URL_, { width: 390, clock: NOW, ready: ready([]) }), /ERR_CONNECTION_REFUSED/);
});

test('a load that failed for any other reason is thrown, retry or not', async () => {
  const browser = fakeBrowser([]);
  const context = await browser.newContext();
  const page = await context.newPage();
  page.goto = async () => {
    throw new Error('page.goto: net::ERR_ABORTED');
  };
  await assert.rejects(openPage(browser, URL_, { width: 390, clock: NOW, ready: ready([]), again: again([]) }), /ERR_ABORTED/);
});

test("a screen settled on its second look reports that look's errors, not the first's", async () => {
  /* `readiness` itself, over a page that draws nothing on its first look and draws on the reload. */
  const errors = [{ kind: 'uncaught', text: 'Failed to fetch dynamically imported module' }];
  const failed = [{ status: 404, path: '/_app/immutable/nodes/0.js' }];
  let looks = 0;
  const page = {
    waitForSelector: async () => (looks++ === 0 ? Promise.reject(new Error('timeout')) : {}),
    evaluate: async () => undefined,
    reload: async () => {},
    url: () => URL_,
  };
  const ready = readiness('t', 10, join(import.meta.dirname, 'no-such-build'));
  const state = await ready.settled(page, false, () => {
    errors.length = 0;
    failed.length = 0;
  });
  assert.equal(looks, 2);
  assert.notEqual(state, null);
  assert.equal(ready.retried(), 1);
  assert.deepEqual(errors, [], 'what the reloaded document said went with it');
  assert.deepEqual(failed, []);
});

/* ── the addresses it is given, and the record it reads (jobs 2 and 3) ── */

test('every Settings area the place declares is an address, all sixteen and not a hand-typed fourteen', async () => {
  const { routes, unsampled } = await routesOf(WEB);
  assert.deepEqual(unsampled, []);
  for (const area of AREAS.keys()) assert.ok(routes.includes(`/settings/${area}`), `/settings/${area} is not swept`);
});

test('the record names the ids, and what it has nothing for is said, not invented', async () => {
  const answers = {
    boot: { registers: [{ id: 'session', count: 0 }, { id: 'obligations', count: 3 }], pages: [{ slug: 'money' }, { slug: 'kiln' }] },
    governance: [{ id: 'SG9', status: 'decided' }, { id: 'SG10', status: 'open' }],
    automations: [{ id: 'rule.close_follow_ups' }],
    scripts: [],
    listJobs: { jobs: [] },
    packs: [{ id: 'agents' }],
    arrangement: { offer: [{ id: 'usecase-personal' }] },
    views: [{ register: 'obligations', id: 'open' }],
  };
  const record = {
    ask: async (name, args) => {
      if (name === 'list') return args.register === 'obligations' ? { ok: true, value: { rows: [{ seq: 4 }] } } : { ok: false, refusal: { code: 'REGISTER_UNKNOWN' } };
      return name in answers ? { ok: true, value: answers[name] } : { ok: false, refusal: { code: 'ROUTE_UNKNOWN' } };
    },
  };
  const { routes, unsampled, unseen } = await routesFor(WEB, record);
  assert.deepEqual(unsampled, []);
  for (const r of ['/SG10', '/decide/SG10', '/automations/rule.close_follow_ups', '/plugins/agents', '/plugins/personal', '/v/obligations.open', '/p/money', '/r/obligations', '/r/obligations/4'])
    assert.ok(routes.includes(r), `${r} is not among ${routes.join(' ')}`);
  assert.equal(routes.includes('/automations/SG5'), false, 'an automation is opened by its own id');
  assert.deepEqual(unseen.sort(), ['/jobs/j_none', '/scripts/no-script']);
  /* AND WHAT IS DRAWN AS NOT FOUND ON PURPOSE: the unseen. The shared page is `/s`, static, its link in the fragment. */
  assert.deepEqual((await routesFor(WEB, record)).missing.sort(), ['/jobs/j_none', '/scripts/no-script']);
  assert.ok(routes.includes('/s'), 'the shared page is swept at its one address');
  assert.ok(!routes.includes('/p/kiln'), 'one page unless every page is asked for');
  assert.ok((await routesFor(WEB, record, { every: true })).routes.includes('/p/kiln'));
});

test("the gates' record keeps a setting through its own door, reads it back in boot, and hands back its clock", async () => {
  const record = await startRecord(0);
  try {
    assert.equal(record.now, Date.UTC(2026, 8, 3, 12));
    assert.equal(recordAt(record.base).now, clockOf(record.base));
    await record.setPref('nav.shape', 'menu');
    assert.equal((await record.ask('boot')).value.me.prefs['nav.shape'], 'menu');
    await assert.rejects(record.setPref('nav.shape', 'sideways'), /would not keep nav\.shape/);
    /* A PAGE'S SETTING IS HANDED BACK to what the record held before it, here the `menu` kept above. */
    const prefsNow = async () => (await record.ask('boot')).value.me.prefs;
    await openPage(fakeBrowser([]), URL_, { width: 390, record, prefs: { 'nav.shape': 'bar' }, ready: ready([]) });
    assert.equal((await prefsNow())['nav.shape'], 'bar');
    await openPage(fakeBrowser([]), URL_, { width: 390, record, ready: ready([]) });
    assert.equal((await prefsNow())['nav.shape'], 'menu');
    const { unsampled } = await routesFor(WEB, record);
    assert.deepEqual(unsampled, []);
  } finally {
    await record.close();
  }
  assert.equal(clockOf(record.base), null, 'a closed record has no clock');
});
