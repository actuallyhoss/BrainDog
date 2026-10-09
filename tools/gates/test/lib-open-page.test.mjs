/**
 * `openPage`, the one way a gate opens a page (PRF-B04 job 1), held without a browser.
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
import { budget, openPage, pagePlan } from '../lib.mjs';
import { clockOf, recordAt, startRecord } from '../record.mjs';
import { routesFor, routesOf } from '../routes.mjs';

const WEB = join(import.meta.dirname, '..', '..', '..', 'apps', 'web');

const NOW = Date.UTC(2026, 8, 3, 12);
const URL_ = 'http://localhost:1/app/today';

/** A stand-in record: its clock, and every setting it was asked to keep, in order. Each its own base, as each record is. */
let bases = 0;
function fakeRecord(log) {
  return { base: `http://127.0.0.1:${++bases}`, now: NOW, setPref: async (key, value) => log.push(['setPref', key, value]) };
}

/** A stand-in browser, context and page that write down what was asked of them. */
function fakeBrowser(log, { gotoThrows = false } = {}) {
  const handlers = {};
  const page = {
    on: (name, fn) => (handlers[name] = fn),
    goto: async (to, opts) => {
      log.push(['goto', to, opts.waitUntil]);
      if (gotoThrows) throw new Error('net::ERR_CONNECTION_REFUSED');
      handlers.pageerror?.(new Error('boom'));
      handlers.console?.({ type: () => 'error', text: () => 'Failed to load resource' });
      handlers.console?.({ type: () => 'log', text: () => 'hello' });
    },
  };
  const context = {
    clock: { setFixedTime: async (t) => log.push(['clock', t]) },
    newPage: async () => (log.push(['newPage']), page),
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
  assert.equal(await opened.goto('http://localhost:1/app/usage'), 'ready');
  assert.equal(opened.errors.length, 2, 'the second load collected its own two, not four');
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
  for (const r of ['/SG10', '/decide/SG10', '/automations/rule.close_follow_ups', '/packs/agents', '/packs/browse/personal', '/v/obligations.open', '/p/money', '/r/obligations', '/r/obligations/4'])
    assert.ok(routes.includes(r), `${r} is not among ${routes.join(' ')}`);
  assert.equal(routes.includes('/automations/SG5'), false, 'an automation is opened by its own id');
  assert.deepEqual(unseen.sort(), ['/jobs/j_none', '/scripts/no-script', '/t/2']);
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
