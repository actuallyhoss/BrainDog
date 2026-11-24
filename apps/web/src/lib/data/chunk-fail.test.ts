/**
 * A file of the app's own code that did not arrive reloads the page once, by itself (`chunk-fail.ts`): never twice in
 * 30 seconds, never without a tab that can keep the mark, onto the address a navigation was going to, and never under
 * the pointer for a link's code asked for ahead of a press.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGAIN_AFTER_MS, RELOADED, START_AGAIN, START_AGAIN_MS, START_TRIES, handled, isChunkFailure, recovery } from './chunk-fail.ts';

/** A tab: its storage, where it is, the clock, and what it did. */
function tab(at = 'https://brain.dog/acme/', store: Map<string, string> | null = new Map()) {
  const did: string[] = [];
  const marks: string[] = [];
  const waits: number[] = [];
  let now = 1_000_000;
  /* `error.html`'s box when it is drawn: its state, and the press its button hands on. */
  const box = { drawn: false, state: null as string | null, press: null as ((e: { preventDefault(): void }) => void) | null };
  const env = {
    store: () =>
      store === null
        ? null
        : { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
    here: () => ({ href: at, reload: () => void did.push(`reload ${at}`), assign: (u: string) => void did.push(`assign ${u}`) }),
    now: () => now,
    body: () => ({ setAttribute: (name: string) => void marks.push(name) }),
    start: () =>
      box.drawn
        ? {
            getAttribute: () => box.state,
            setAttribute: (_: string, v: string) => void (box.state = v),
            querySelector: () => ({ addEventListener: (_: 'click', fn: (e: { preventDefault(): void }) => void) => void (box.press = fn) }),
          }
        : null,
    later: (fn: () => void, ms: number) => {
      waits.push(ms);
      fn();
    },
  };
  return { env, did, marks, waits, box, store, later: (ms: number) => void (now += ms) };
}

test('EVERY ENGINE SAYS A FAILED IMPORT ITS OWN WAY, and each is a file that did not arrive', () => {
  for (const said of [
    'Failed to fetch dynamically imported module: https://app.brain.dog/_app/immutable/chunks/Dd9Miro6.js',
    'error loading dynamically imported module: https://app.brain.dog/_app/immutable/nodes/3.js',
    'Importing a module script failed.',
    "'text/html' is not a valid JavaScript MIME type.",
    'Unable to preload CSS for /_app/immutable/assets/0.css',
  ])
    assert.ok(isChunkFailure(new TypeError(said)), said);
  assert.equal(isChunkFailure(new TypeError("Cannot read properties of undefined (reading 'rows')")), false);
  assert.equal(isChunkFailure(null), false);
});

test('ONCE IN 30 SECONDS: the first failure reloads, a second inside the window does not, and one after it does', () => {
  const a = tab();
  const first = recovery(a.env);
  assert.equal(first.reloadOnce(), true);
  assert.equal(first.reloading(), true);
  assert.equal(first.reloadOnce(), true, 'the same document asked twice is still the one reload');
  assert.deepEqual(a.did, ['reload https://brain.dog/acme/']);
  assert.equal(a.store?.get(RELOADED), '1000000');

  /* The next document, a few seconds on, fails again: it is drawn, not reloaded. */
  a.later(5_000);
  const second = recovery(a.env);
  assert.equal(second.reloadOnce(), false);
  assert.equal(second.reloading(), false);

  a.later(AGAIN_AFTER_MS);
  assert.equal(recovery(a.env).reloadOnce(), true);
  assert.equal(a.did.length, 2);
});

test('A TAB THAT CANNOT KEEP THE MARK NEVER RELOADS BY ITSELF, since nothing would stop the next one', () => {
  const a = tab('https://brain.dog/', null);
  assert.equal(recovery(a.env).reloadOnce(), false);
  const throws = tab();
  throws.env.store = () => {
    throw new Error('SecurityError');
  };
  assert.equal(recovery(throws.env).reloadOnce(), false);
  assert.deepEqual([...a.did, ...throws.did], []);
});

test('A NAVIGATION THAT FAILED LANDS ON ITS OWN ADDRESS, and the address it is at is reloaded rather than reassigned', () => {
  const a = tab('https://brain.dog/acme/#top');
  recovery(a.env).preloadFailed(new TypeError('Failed to fetch dynamically imported module: x/_app/immutable/nodes/19.js'), new URL('https://brain.dog/acme/decide'));
  assert.deepEqual(a.did, ['assign https://brain.dog/acme/decide']);

  const b = tab('https://brain.dog/acme/r/tasks#row-4');
  recovery(b.env).reloadOnce('https://brain.dog/acme/r/tasks');
  assert.deepEqual(b.did, ['reload https://brain.dog/acme/r/tasks#row-4']);
});

test("A LINK'S CODE ASKED FOR AHEAD OF A PRESS DOES NOT RELOAD UNDER THE POINTER: the next press loads its page whole", () => {
  const a = tab();
  const r = recovery(a.env);
  r.preloadFailed(new TypeError('Failed to fetch dynamically imported module: https://brain.dog/_app/immutable/nodes/19.Cci1BMKM.js'), null);
  assert.deepEqual(a.did, []);
  assert.deepEqual(a.marks, ['data-sveltekit-reload']);
  assert.equal(r.reloading(), false);

  /* A lazy block's own file, with no navigation under way, reloads where it is. */
  r.preloadFailed(new TypeError('Failed to fetch dynamically imported module: https://brain.dog/_app/immutable/chunks/Dd9Miro6.js'), null);
  assert.deepEqual(a.did, ['reload https://brain.dog/acme/']);
});

test("THE ROUTER'S ERROR IS MARKED chunk ONLY FOR A FILE THAT DID NOT ARRIVE, and keeps SvelteKit's message", (t) => {
  t.mock.method(console, 'error', () => undefined);
  assert.deepEqual(handled(new TypeError('Failed to fetch dynamically imported module: x'), 'Internal Error'), { message: 'Internal Error', chunk: true });
  assert.deepEqual(handled(new Error('boom'), 'Internal Error'), { message: 'Internal Error' });
});

test('A FAILED START TRIES AGAIN THREE TIMES, 1.5 SECONDS APART, THEN SAYS SO; a start that works clears the count', () => {
  const a = tab();
  assert.equal(recovery(a.env).startFailed(), 'none', 'no error.html on screen, nothing to do');
  const states: string[] = [];
  for (let i = 0; i < START_AGAIN + 1; i += 1) {
    a.box.drawn = true;
    a.box.state = null;
    states.push(recovery(a.env).startFailed());
  }
  assert.deepEqual(states, ['again', 'again', 'again', 'failed']);
  assert.deepEqual(a.waits, [START_AGAIN_MS, START_AGAIN_MS, START_AGAIN_MS]);
  assert.equal(a.did.length, START_AGAIN);
  assert.equal(a.box.state, 'failed');

  /* Its Try again reloads the address, once pressed, and the form under it is not sent. */
  let prevented = false;
  a.box.press?.({ preventDefault: () => void (prevented = true) });
  assert.ok(prevented);
  assert.equal(a.did.length, START_AGAIN + 1);

  /* The same page asked twice is decided once. */
  assert.equal(recovery(a.env).startFailed(), 'none');

  recovery(a.env).started();
  assert.equal(a.store?.has(START_TRIES), false);
  a.box.state = null;
  assert.equal(recovery(a.env).startFailed(), 'again');
});

test('A TAB THAT CANNOT COUNT ITS TRIES SAYS THE START FAILED AT ONCE, rather than reload for ever', () => {
  const a = tab('https://brain.dog/', null);
  a.box.drawn = true;
  assert.equal(recovery(a.env).startFailed(), 'failed');
  assert.deepEqual(a.did, []);
});
