/**
 * That pushing a toast is not a dependency: the stack is safe to write to from inside an effect.
 *
 * WHY THERE IS A SECOND TEST FILE FOR ONE MODULE, AND WHY IT IS NOT IN THE FIRST. Its own header
 * says what `toast.svelte.test.ts` cannot reach: compiled with `generate: 'server'`, `$state([])` is
 * a plain array, `this.items = next` is an assignment and nothing more, and there is no effect in the
 * process to count. That file states the gap out loud, "nothing here proves that an effect ever
 * runs", and this is the file that closes it. It compiles the same module for the CLIENT and runs a
 * real `$effect` inside a real `$effect.root`, because a re-run is the only evidence there is.
 *
 * THE DEFECT IT WAS WRITTEN AGAINST. `push` read `this.items` to apply the cap before it wrote them,
 * so an effect that pushed a toast took a dependency on the stack it had just written to and Svelte
 * scheduled it again. Measured here against Svelte 5.57 before the repair: an effect whose body was
 * one `toasts.push` ran 13 times with this file's own bound holding it there, and with the bound taken
 * off it ran until `effect_update_depth_exceeded`. After the repair it runs once.
 *
 * THE BOUND IS WHY THE FAILURE IS AN ASSERTION AND NOT A DEAD PROCESS. Svelte throws that error from
 * inside the batch it is processing, which is a microtask this test is not standing in, so nothing
 * here could catch it and the run ends with an uncaught exception instead of a count. Seen, on the
 * first red run. So the body under test stops pushing after `LIMIT`, the loop unwinds, and the count
 * is a number a message can be written about.
 *
 * THE `svelte` SPECIFIER IS REDIRECTED, AND WITHOUT THAT LINE THIS FILE IS A LIE IN BOTH DIRECTIONS.
 * Svelte 5.57 maps its `.` export to `index-client.js` under the `browser` condition and to
 * `index-server.js` under `default`, so plain Node hands out the SERVER runtime, whose `untrack` is
 * `fn()` and no more. Measured with that one: an effect doing an untracked read and then a write of
 * the same `$state` ran 25 times, exactly as if it had never been wrapped. With the client `untrack`
 * it ran once. A browser resolves `svelte` to the client build, so redirecting here is this file
 * doing what the app does rather than a convenience.
 *
 * AND THE CLOCK IS NOT MOCKED, WHICH IS THE OTHER DIFFERENCE FROM THE FILE NEXT DOOR. Svelte drains
 * its effect queue on real microtasks and this file waits for that drain on a real timer, so a mocked
 * `setTimeout` would stop the effects rather than the countdowns and every count below would be zero.
 * The stack is held instead: `hold()` clears every armed timer and `#arm` returns early while it is
 * set, so nothing pushed here keeps the process open for the ten seconds a toast lives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compileModule } from 'svelte/compiler';

/**
 * A component's two lines, without a component.
 *
 * `$effect.root` and `$effect` are compiler macros, so this cannot be written in the test file
 * itself: the test file is the entry, it is already loaded by the time it registers a hook, and
 * nothing would ever compile it. It is compiled from this string instead and resolved to a path
 * beside this file, which is what lets its own `svelte/internal/client` import find
 * `apps/web/node_modules`. Nothing is written to disk.
 */
const HARNESS_SOURCE = `
  export function root(body) {
    return $effect.root(() => {
      $effect(() => {
        body();
      });
    });
  }
`;

const HARNESS_SPECIFIER = 'virtual:toast-effect-root';
const HARNESS_URL = new URL('./__effect-root.svelte.ts', import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === HARNESS_SPECIFIER) return { url: HARNESS_URL, format: 'module', shortCircuit: true };
    /* The header's third paragraph: the module under test asks for `untrack` and a browser gets the
       client one. `svelte/internal/client` is where both builds re-export it from. */
    if (specifier === 'svelte') return next('svelte/internal/client', context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === HARNESS_URL) {
      const { js } = compileModule(HARNESS_SOURCE, { generate: 'client', filename: fileURLToPath(url) });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'client', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* AFTER THE HOOK, AND THAT IS WHY BOTH ARE DYNAMIC, for the same reason the file next door gives:
   a static import is evaluated before this file's body runs, so each module would load before the
   hook that makes it loadable was registered. The specifier is held in a constant because there is
   no such file for a typechecker to resolve; the hook above is the only thing that answers for it. */
const { root } = (await import(HARNESS_SPECIFIER)) as { root: (body: () => void) => () => void };
const { toasts } = await import('./toast.svelte.ts');

/** Enough runs to tell a loop from a single pass, and far enough under Svelte's own guard to unwind. */
const LIMIT = 12;

/** Every effect Svelte has queued, run. A timer fires after the microtask queue has drained. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** A stack with nothing in it and no countdown armed on it. See the header's last paragraph. */
function fresh(): void {
  for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
  toasts.hold();
}

/**
 * How many times an effect with this body ran, once Svelte has finished with it.
 *
 * The body stops being called after `LIMIT`, so a body that depends on itself unwinds into a count
 * instead of the uncatchable throw the header describes.
 */
async function runsOf(body: () => void): Promise<number> {
  let runs = 0;
  const stop = root(() => {
    runs++;
    if (runs <= LIMIT) body();
  });
  try {
    await settle();
  } finally {
    stop();
  }
  return runs;
}

/* ── 1. the harness, before it is believed about anything ────────────────── */

test('AN EFFECT THAT TOUCHES NOTHING RUNS ONCE, which is what makes every count below mean something', async () => {
  fresh();

  /* THE GUARD AGAINST A VACUOUS PASS. `1` is the answer this file reports as healthy, and an effect
     queue that never drained at all would answer `0`, while a harness that somehow re-ran on its own
     would put every test after this one beyond reach. Both are ruled out here rather than assumed. */
  assert.equal(await runsOf(() => {}), 1, 'the effect queue did not drain, so no count in this file is evidence of anything');
});

/* ── 2. the stack is safe to push to from inside an effect ───────────────── */

test('A TOAST PUSHED FROM INSIDE AN EFFECT DOES NOT SCHEDULE THAT EFFECT AGAIN', async () => {
  fresh();

  /* The shape `+layout.svelte` has: something the shell noticed on mount is said on the stack. The
     saying is not a dependency, and before the repair it was one. */
  const runs = await runsOf(() => void toasts.push('Archived obligations#2', { intent: 'warn' }));

  assert.equal(runs, 1, 'the effect took a dependency on the stack it pushed to, so Svelte ran it again for its own toast');
  /* AND THE PUSH ACTUALLY LANDED. A `push` that had quietly become a no-op would satisfy the count
     above perfectly, and it is the one repair that would be worse than the defect. */
  assert.equal(toasts.items.length, 1, 'the effect ran once because nothing was pushed at all');
});

test('and neither does pushing past the cap, which is the eviction path through `dismiss`', async () => {
  fresh();

  /* Six pushes over four: the fifth and sixth each evict through `dismiss`, which reads `items` of
     its own. One run of the effect covers both reads. */
  let pushed = 0;
  const runs = await runsOf(() => {
    for (let n = 1; n <= 6; n++) toasts.push(`Archived obligations#${n}`);
    pushed++;
  });

  assert.equal(runs, 1, 'evicting the oldest toast made the effect depend on the stack, so it pushed six more');
  assert.equal(pushed, 1);
  assert.equal(toasts.items.length, 4, 'the cap did not hold inside an effect');
});

test('and dismissing a toast from inside an effect does not schedule it again either', async () => {
  fresh();
  const id = toasts.push('Archived obligations#2');

  const runs = await runsOf(() => toasts.dismiss(id));

  assert.equal(runs, 1, 'a dismiss from inside an effect made the effect depend on the stack it cleared');
  assert.deepEqual(toasts.items, [], 'the dismiss did not happen, so the count above is about nothing');
});

test('and neither does the undo shortcut, which reads the whole stack to find its offer', async () => {
  fresh();
  let restored = 0;
  toasts.push('Archived obligations#2', { undo: () => restored++ });

  /* `undoLast` is what `Palette.svelte:761` calls, and `run` underneath it reads `items` to find the
     offer. A second run here would apply an undo twice, which is the one failure in this module that
     loses a row rather than showing the wrong colour. */
  const runs = await runsOf(() => void toasts.undoLast());

  assert.equal(runs, 1, 'the undo shortcut made the effect depend on the stack, so the effect pressed undo again');
  assert.equal(restored, 1, 'the undo ran a number of times other than once from inside one effect');
});

test('and neither does `run` reached directly, which is the only way in that `undoLast` does not cover', async () => {
  fresh();
  let restored = 0;
  const id = toasts.push('Archived obligations#2', { undo: () => restored++ });

  /* THE TEST ABOVE CANNOT SEE THE WRAPPER ON `run`, WHICH IS WHY THIS ONE EXISTS. `undoLast` calls
     `run` from inside its own `untrack`, so by the time `run` is entered the reads in it are already
     suppressed by somebody else and taking its wrapper off changes nothing that the undo shortcut
     measures. Measured: with `run` unwrapped the test above still passed and this one ran 13 times.
     `Toasts.svelte:46` is the caller that does not go through `undoLast`, the undo button itself.

     AND 13 RATHER THAN 2, BECAUSE `dismiss` ASSIGNS A FRESH ARRAY WHETHER OR NOT IT REMOVED
     ANYTHING. The second pass finds no toast with this id, applies no undo, and still writes
     `items = items.filter(...)`, a new array that is not the old one, so Svelte notified a reader of
     a stack it had already emptied and the effect went round again until this file's bound stopped
     it. The undo itself ran once throughout, which is what makes the defect invisible without a
     count: nothing is lost, the process just will not settle. */
  const runs = await runsOf(() => toasts.run(id));

  assert.equal(runs, 1, '`run` reached directly made the effect depend on the stack it spends');
  assert.equal(restored, 1, 'the undo ran a number of times other than once from inside one effect');
  assert.deepEqual(toasts.items, [], 'the offer was not spent, so the count above is about nothing');
});

test('and holding the stack runs once with no wrapper at all, which is why `hold` carries none', async () => {
  fresh();
  toasts.push('Archived obligations#2');
  /* Released so the `held = true` inside the effect is a change and not a write of the same value,
     which Svelte drops before it notifies anybody. Without this line the test proves nothing. */
  toasts.release();

  const runs = await runsOf(() => toasts.hold());

  /* THE ONE METHOD IN THE MODULE THAT IS LEFT UNTRACKED, MEASURED RATHER THAN ARGUED. `hold` reads no
     reactive state, and a write whose value nothing in the same effect read back does not schedule
     that effect: this is the evidence behind the note on it. */
  assert.equal(runs, 1, 'a write with no read of its own scheduled the effect that made it, so `hold` needs the wrapper as well');
  assert.equal(toasts.held, true, 'the hold did not take, so the count above is about nothing');
});

test('and releasing a held stack does not schedule the effect that released it either', async () => {
  fresh();
  toasts.push('Archived obligations#2');

  /* HELD ALREADY, BY `fresh`, AND THAT IS THE WHOLE SETUP. `release` writes `held = false` and then
     `#arm` reads `held` back to decide whether to arm anything, so the effect depends on the value it
     just wrote. On a stack that was not held the write is `false` over `false`, Svelte drops it before
     it notifies anybody, and an unwrapped `release` looks perfectly safe: the test would pass against
     the defect. Measured with `release` unwrapped and the stack held first: 2 runs, not 13, because
     the second pass writes `false` over `false` and that one is dropped. Two is still one too many
     and it is the count this asserts on. */
  const runs = await runsOf(() => toasts.release());

  assert.equal(runs, 1, 'the release made the effect depend on the `held` it had just cleared');
  assert.equal(toasts.held, false, 'the release did not take, so the count above is about nothing');

  /* The re-armed countdowns, put back out. See the header's last paragraph: a live ten second timer
     here holds the process open long after the assertions above have been made. */
  toasts.hold();
});

/* ── 3. and the stack is still the thing a component draws ───────────────── */

test('A READER OF THE STACK IS STILL WOKEN BY A TOAST, because an untracked write is still a write', async () => {
  fresh();

  /**
   * THE COUNTER-TEST, AND THE REPAIR IS WORTHLESS WITHOUT IT. `Toasts.svelte` exists to re-render
   * when `items` changes, and a repair that stopped `push` notifying anybody would pass every test
   * above it in this file and ship a stack that never appears on screen. What the repair untracks is
   * what `push` READS. What it writes is unchanged, and this is that difference measured.
   */
  let seen = -1;
  let runs = 0;
  const stop = root(() => {
    runs++;
    seen = toasts.items.length;
  });
  try {
    await settle();
    assert.equal(runs, 1);
    assert.equal(seen, 0, 'the reader did not see the empty stack it started over');

    /* From outside the effect, which is where nearly every toast in the product comes from: a click. */
    toasts.push('Archived obligations#2');
    await settle();

    assert.equal(runs, 2, 'a toast arrived and nothing that draws the stack was told, so the stack would never appear');
    assert.equal(seen, 1, 'the reader re-ran and read a stack that did not hold the new toast');
  } finally {
    stop();
  }
});
