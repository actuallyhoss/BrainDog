/**
 * THE FREEZE WATCHDOG, driven through a window this file owns: the long-frame record, the long-task record, the timer of
 * last resort, and the one report it makes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { culpritsOf, drawingOf, fileOf, freezeSaid, FROZE_MS, TICK_MS, watchFreezes, type Freeze, type Host } from './watchdog.ts';

/** A window whose performance record holds what the test hands it, and whose timer runs when the test says. */
function host(types: readonly string[]) {
  const watchers: ((list: { getEntries(): readonly unknown[] }) => void)[] = [];
  const observed: { type: string; buffered?: boolean }[] = [];
  let disconnected = 0;
  let tick: (() => void) | null = null;
  let cleared = 0;
  const shown = new Set<() => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (_: 'visibilitychange', fn: () => void) => void shown.add(fn),
    removeEventListener: (_: 'visibilitychange', fn: () => void) => void shown.delete(fn),
  };
  class Observer {
    static supportedEntryTypes = types;
    constructor(cb: (list: { getEntries(): readonly unknown[] }) => void) {
      watchers.push(cb);
    }
    observe(o: { type: string; buffered?: boolean }) {
      observed.push(o);
    }
    disconnect() {
      disconnected++;
    }
  }
  const h: Host = {
    PerformanceObserver: Observer,
    setInterval: (fn) => ((tick = fn), 7),
    clearInterval: () => void cleared++,
    document: doc,
  };
  return {
    h,
    doc,
    observed,
    emit: (...entries: unknown[]) => watchers.forEach((w) => w({ getEntries: () => entries })),
    tick: () => tick?.(),
    /** The page put out of view, or back, as the browser says it: the state first, then the event. */
    show: (state: 'visible' | 'hidden') => {
      doc.visibilityState = state;
      shown.forEach((fn) => fn());
    },
    get listening() {
      return shown.size;
    },
    get disconnected() {
      return disconnected;
    },
    get cleared() {
      return cleared;
    },
    get timed() {
      return tick !== null;
    },
  };
}

const HERE = () => ({ route: '/p/portfolio', rendering: 'drawn, 10 blocks (4 table, 2 stat), 2,007 elements' });

test('a long frame over two seconds is said once, with the route, the drawing and the scripts that ran longest', () => {
  const w = host(['longtask', 'long-animation-frame']);
  const said: Freeze[] = [];
  watchFreezes(w.h, HERE, (f) => said.push(f));
  assert.deepEqual(w.observed, [{ type: 'long-animation-frame', buffered: true }], 'the frame record is not the one asked for, or not buffered');

  /* A FRAME UNDER THE LINE IS NOT A FREEZE. */
  w.emit({ entryType: 'long-animation-frame', duration: FROZE_MS - 1, scripts: [] });
  assert.equal(said.length, 0);

  w.emit({
    entryType: 'long-animation-frame',
    duration: 3_240,
    scripts: [
      { invoker: 'Response.json.then', sourceFunctionName: 'blockOf', sourceURL: 'https://brain.dog/app/_app/immutable/chunks/page-live.Bq1.js?v=2', sourceCharPosition: 4821, duration: 2_900 },
      { invoker: 'TimerHandler:setTimeout', sourceURL: 'https://brain.dog/app/_app/immutable/nodes/0.js', duration: 120 },
      { invoker: 'click', duration: 0 },
    ],
  });
  assert.equal(said.length, 1);
  const f = said[0]!;
  assert.equal(f.ms, 3_240);
  assert.equal(f.seen, 'frame');
  assert.equal(f.route, '/p/portfolio');
  assert.deepEqual(f.culprits, [
    { what: 'blockOf in page-live.Bq1.js:4821', ms: 2_900 },
    { what: 'TimerHandler:setTimeout in 0.js', ms: 120 },
  ]);
  /* NO HOST AND NO ADDRESS REACH THE REPORT: a script is its file's name. */
  assert.doesNotMatch(JSON.stringify(f), /brain\.dog|https?:|_app/u);

  /* ONCE, AND THEN IT STOPS LISTENING. */
  w.emit({ entryType: 'long-animation-frame', duration: 9_000, scripts: [] });
  assert.equal(said.length, 1, 'a second freeze was said');
  assert.equal(w.disconnected, 1, 'the watchdog kept listening after it spoke');
});

test('a browser with only the long-task record is watched through it, and says no scripts it was not told', () => {
  const w = host(['longtask']);
  const said: Freeze[] = [];
  watchFreezes(w.h, HERE, (f) => said.push(f));
  assert.deepEqual(w.observed, [{ type: 'longtask', buffered: true }]);
  w.emit({ entryType: 'longtask', duration: 2_500, attribution: [{ containerType: 'window' }] });
  assert.equal(said.length, 1);
  assert.equal(said[0]!.seen, 'task');
  assert.deepEqual(said[0]!.culprits, []);
  assert.equal(w.timed, false, 'a timer runs beside a record that already watches');
});

test('a browser that keeps neither record is watched by a timer that notices it came back late', () => {
  const w = host([]);
  let now = 1_000;
  const said: Freeze[] = [];
  const stop = watchFreezes(w.h, HERE, (f) => said.push(f), () => now);
  assert.equal(w.observed.length, 0);
  assert.ok(w.timed, 'no timer stands in for the missing records');

  /* ON TIME, AND A LITTLE LATE, ARE NOT FREEZES. */
  now += TICK_MS;
  w.tick();
  now += TICK_MS + 300;
  w.tick();
  assert.equal(said.length, 0);

  /* A TAB OUT OF VIEW IS NOT TIMED: a browser slows the timers of a tab nobody is looking at. */
  w.doc.visibilityState = 'hidden';
  now += 60_000;
  w.tick();
  w.doc.visibilityState = 'visible';
  now += 10_000;
  w.tick();
  assert.equal(said.length, 0, 'the tick after a hidden spell was taken for a freeze');

  /* BACK IN VIEW, A TICK THREE SECONDS LATE IS A FREEZE OF ABOUT THREE SECONDS. */
  now += TICK_MS;
  w.tick();
  now += TICK_MS + 3_000;
  w.tick();
  assert.equal(said.length, 1);
  assert.equal(said[0]!.seen, 'timer');
  assert.equal(said[0]!.ms, 3_000);
  assert.equal(w.cleared, 1, 'the timer kept running after it spoke');
  stop();
});

/**
 * A PHONE STOPS A PAGE'S TIMERS OUTRIGHT while another app is in front, so no tick lands while it is hidden, and the
 * first one back is late by the whole time away. Either order the browser hands them back in, the tick or the event
 * first, that is not a freeze.
 */
test('a page that was away, with no tick while it was, is not said as a freeze when it comes back', () => {
  const w = host([]);
  let now = 1_000;
  const said: Freeze[] = [];
  const stop = watchFreezes(w.h, HERE, (f) => said.push(f), () => now);
  assert.equal(w.listening, 1, 'the timer does not hear the page go out of view');

  now += TICK_MS;
  w.tick();
  /* THE EVENT BACK FIRST, then the late tick. */
  w.show('hidden');
  now += 45_000;
  w.show('visible');
  w.tick();
  /* THE LATE TICK FIRST, with the page already back, and its event after it. */
  w.show('hidden');
  now += 30_000;
  w.doc.visibilityState = 'visible';
  w.tick();
  w.show('visible');
  assert.equal(said.length, 0, 'a spell in another app was said as a freeze');

  /* AND A FREEZE IN VIEW AFTERWARDS IS STILL SAID. */
  now += TICK_MS;
  w.tick();
  now += TICK_MS + 2_500;
  w.tick();
  assert.equal(said.length, 1);
  assert.equal(said[0]!.ms, 2_500);
  assert.equal(w.listening, 0, 'the watchdog kept listening for the page going out of view after it spoke');
  stop();
});

test('a screen that cannot say where it was still has its freeze said', () => {
  const w = host(['long-animation-frame']);
  const said: Freeze[] = [];
  watchFreezes(
    w.h,
    () => {
      throw new Error('torn down');
    },
    (f) => said.push(f),
  );
  w.emit({ entryType: 'long-animation-frame', duration: 2_100, scripts: [] });
  assert.equal(said.length, 1);
  assert.equal(said[0]!.route, '');
});

test('the stop the shell holds stops every way of watching', () => {
  const frame = host(['long-animation-frame']);
  watchFreezes(frame.h, HERE, () => assert.fail('said after it was stopped'))();
  assert.equal(frame.disconnected, 1);
  const timer = host([]);
  watchFreezes(timer.h, HERE, () => assert.fail('said after it was stopped'))();
  assert.equal(timer.cleared, 1);
  assert.equal(timer.listening, 0, 'the stop left the page’s visibility heard');
});

test('the sentence names the time, the place, what was drawing and what ran, in words', () => {
  const said = freezeSaid({
    ms: 3_240,
    route: '/p/portfolio',
    rendering: 'drawn, 10 blocks (4 table, 2 stat), 2,007 elements',
    culprits: [{ what: 'blockOf in page-live.Bq1.js:4821', ms: 2_900 }],
    seen: 'frame',
  });
  assert.equal(
    said,
    'BrainDog froze for 3.2 s on /p/portfolio. The screen: drawn, 10 blocks (4 table, 2 stat), 2,007 elements. Longest: blockOf in page-live.Bq1.js:4821 (2.9 s).',
  );
  assert.equal(freezeSaid({ ms: 2_050, route: '', rendering: '', culprits: [], seen: 'timer' }), 'BrainDog froze for 2.1 s.');
  assert.doesNotMatch(said, /—/u, 'an em dash in the sentence');
});

test('a script is named by its file, never its address', () => {
  assert.equal(fileOf('https://brain.dog/app/_app/immutable/chunks/x.js?v=1#a'), 'x.js');
  assert.equal(fileOf(''), '');
  assert.equal(fileOf(undefined), '');
  assert.deepEqual(culpritsOf({ scripts: [{ invoker: 'click', duration: 50 }] }), [{ what: 'click', ms: 50 }]);
  assert.deepEqual(culpritsOf({}), []);
});

test('what the screen was drawing is read off the page as drawn', () => {
  const el = (attrs: Record<string, string>) => ({ getAttribute: (k: string) => attrs[k] ?? null });
  const blocks = [el({ 'data-kind': 'table' }), el({ 'data-kind': 'stat' }), el({ 'data-kind': 'table' })];
  const main = {
    getAttribute: (k: string) => (k === 'data-screen' ? 'ready' : null),
    querySelectorAll: (q: string) => (q === '*' ? new Array(2007) : q === '.block[data-kind]' ? blocks : []),
  };
  const doc = { querySelector: (q: string) => (q === '#main' ? main : null), querySelectorAll: () => [] } as unknown as Pick<Document, 'querySelector' | 'querySelectorAll'>;
  assert.equal(drawingOf(doc), 'drawn, 3 blocks (2 table, 1 stat), 2,007 elements');

  const reading = { ...main, getAttribute: () => null, querySelectorAll: (q: string) => (q === '*' ? new Array(40) : []) };
  assert.equal(drawingOf({ querySelector: () => reading, querySelectorAll: () => [] } as unknown as Pick<Document, 'querySelector' | 'querySelectorAll'>), 'still reading, 40 elements');
  assert.equal(drawingOf(undefined), '');
});

/**
 * THE SHELL STARTS IT, and after the first paint: the module is asked for as the shell mounts, as the palette is, so it
 * is never in the way of the first screen. A source read, because there is no DOM harness in this app.
 */
test('the shell starts the watchdog once, after the first paint, with the route and what was drawing', () => {
  const layout = readFileSync(fileURLToPath(new URL('../routes/+layout.svelte', import.meta.url)), 'utf8');
  assert.match(layout, /import\('\$lib\/watchdog\.ts'\)/u, 'the shell does not load the watchdog');
  assert.doesNotMatch(layout, /^\s*import [^;]*from '\$lib\/watchdog\.ts'/mu, 'the watchdog is in the shell’s first chunk');
  assert.match(layout, /watchFreezes\(window,/u, 'the shell does not start the watchdog on its window');
  assert.match(layout, /drawingOf\(document\)/u, 'the report does not say what was drawing');
});
