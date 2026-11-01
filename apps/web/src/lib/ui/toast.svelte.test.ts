/**
 * The undo offer: that it reverses, that it is spent once, and that it expires with its toast.
 *
 * This module is the product's answer to the confirmation dialog, and its own header says so: a
 * destructive action here is not confirmed, it is undone. That makes `undoLast` and `run` the two
 * functions in the app where being wrong loses a row rather than showing the wrong colour. An undo
 * that runs twice puts the row back twice. An undo that is still reachable after the toast is gone
 * restores a row the person archived ten minutes ago. Neither had a reader before this file.
 *
 * WHY THIS FILE COMPILES THE MODULE IT TESTS. `toast.svelte.ts` ends with
 * `export const toasts = new Toasts()`, so `items = $state([])` and `held = $state(false)` are
 * evaluated on load. A rune is a compiler macro with no runtime binding, so a plain `node --test`
 * import fails with `ReferenceError: $state is not defined`. The runes in the FIELDS alone would
 * have been harmless: a class nobody instantiates at load time imports fine. It is the instance on
 * the last line that has to be compiled away. Same hook, same reason, as
 * `lib/a11y/keys.svelte.test.ts` and `lib/data/record.test.ts`.
 *
 * WHAT `generate: 'server'` LEAVES UNCOVERED, STATED SO NOBODY READS MORE INTO A GREEN RUN THAN IS
 * THERE. Compiled for the server, `$state([])` is a plain array and `this.items = [...]` is an
 * assignment and nothing more. Every toast below therefore holds the right VALUE, and none of it is
 * reactive. Nothing here proves that `Toasts.svelte` re-renders when the stack changes, that the
 * live region announces, or that an effect ever runs. A `items` that had quietly stopped being
 * reactive would pass this entire file. The reactivity is the browser gates' claim; the stack
 * arithmetic, the undo and the countdown are this file's.
 *
 * THE CLOCK IS MOCKED IN EVERY TEST, not only the ones about expiry. The life of a toast is five or
 * eight seconds of real time, and a test that pushed one and left it would hold the process open for
 * that long after the last assertion.
 */

import { test, type TestContext } from 'node:test';
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

/* AFTER THE HOOK, AND THAT IS WHY IT IS DYNAMIC. A static import is evaluated before this file's
   body runs, so the module would load before the hook that makes it loadable was registered. */
const { toasts } = await import('./toast.svelte.ts');

/** The life of a toast that offers its Undo: eight seconds. */
const LIFE = 8_000;
/** And of one that only reports: five. */
const REPORT = 5_000;

/**
 * A stack with nothing in it and no hold on it, on a clock this test owns.
 *
 * The module exports one instance for the whole app, so every test starts by emptying it. Dismissing
 * rather than reassigning `items` on purpose: `dismiss` is what clears the pending timer, and a test
 * that left one armed would expire a toast belonging to the test after it.
 */
function fresh(t: TestContext): void {
  /* EMPTIED BEFORE THE CLOCK IS TAKEN OVER, AND THAT ORDER IS LOAD BEARING. A toast left by the test
     before holds a handle from that test's mocked clock, and handing one of those to the clearTimeout
     of a NEW mocked clock leaves the new one unable to fire timers it accepted. That cost an hour on
     the clipboard file, where the symptom was a test that hung rather than failed. Emptied first,
     under the real clock, only real handles are ever cleared by the real clearTimeout. */
  for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
  toasts.release();
  t.mock.timers.enable({ apis: ['setTimeout'] });
}

/**
 * A register with rows in it and an archive beside it, which is the state an undo is offered over.
 *
 * `restore` appends, so an undo that ran twice leaves the row in `rows` twice and a deep comparison
 * says so. That is the point of modelling it rather than counting calls: double-apply is a fact
 * about the data the person gets back, not about how many times a function was entered.
 */
function register() {
  const rows = ['alpha', 'beta', 'gamma'];
  const archived: string[] = [];
  return {
    rows,
    archived,
    archive(row: string) {
      rows.splice(rows.indexOf(row), 1);
      archived.push(row);
    },
    restore(row: string) {
      archived.splice(archived.indexOf(row), 1);
      rows.push(row);
    },
  };
}

/* ── 1. the undo reverses ────────────────────────────────────────────────── */

test('AN UNDO PUTS THE ROW BACK, which is the thing a confirmation dialog cannot do', (t) => {
  fresh(t);
  const reg = register();

  reg.archive('beta');
  toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });
  assert.deepEqual(reg.rows, ['alpha', 'gamma'], 'the row was never archived, so the undo below proves nothing');

  assert.equal(toasts.undoLast(), true, 'an offered undo reported that it had nothing to undo');
  assert.deepEqual(reg.rows.toSorted(), ['alpha', 'beta', 'gamma'], 'undo ran and the row did not come back');
  assert.deepEqual(reg.archived, [], 'the row came back to the register and stayed archived as well');
});

test('and the spent offer leaves the stack with it, so there is nothing left to press', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('beta');
  const id = toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });

  toasts.undoLast();
  assert.equal(
    toasts.items.some((toast) => toast.id === id),
    false,
    'the undo ran and its toast is still on screen offering an undo that has already happened',
  );
});

/* ── 2. it does not run twice ────────────────────────────────────────────── */

test('A SECOND PRESS DOES NOT APPLY THE UNDO AGAIN, and the register is not left holding the row twice', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('beta');
  toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });

  assert.equal(toasts.undoLast(), true);
  /* The reflex: the toast has gone, so the person presses the shortcut again to be sure. */
  assert.equal(toasts.undoLast(), false, 'a second undo with nothing left to undo claimed it had undone something');
  assert.deepEqual(reg.rows.toSorted(), ['alpha', 'beta', 'gamma'], 'the row was restored twice by two presses of one offer');
});

test('and neither does pressing the toast’s own button twice', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('beta');
  const id = toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });

  /* `run` is what the button in `Toasts.svelte` calls. A double click, or a click landing while the
     stack is mid render, must not reach the closure a second time. */
  toasts.run(id);
  toasts.run(id);
  assert.deepEqual(reg.rows.toSorted(), ['alpha', 'beta', 'gamma'], 'two clicks on one undo button restored the row twice');
});

/* ── 3. which offer a press reaches ──────────────────────────────────────── */

test('UNDO REACHES PAST A TOAST THAT ONLY REPORTS, rather than doing nothing over the top of it', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('beta');
  toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });
  /* The case the header names: a copy happens after the archive, and it has no undo of its own. */
  const copied = toasts.push('Copied obligations#2.');

  assert.equal(toasts.undoLast(), true, 'undo stopped at a toast that only reports and told the person there was nothing to undo');
  assert.deepEqual(reg.rows.toSorted(), ['alpha', 'beta', 'gamma'], 'the archive the person was thinking of was not the one undone');
  assert.equal(
    toasts.items.some((toast) => toast.id === copied),
    true,
    'undoing the archive underneath it also cleared the report it reached past',
  );
});

test('and of two offers it is the newest, because undo is a stack', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('alpha');
  reg.archive('beta');
  toasts.push('Archived obligations#1', { undo: () => reg.restore('alpha') });
  toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });

  toasts.undoLast();
  assert.deepEqual(reg.archived, ['alpha'], 'the older archive was undone first, so the thing just done is still done');

  toasts.undoLast();
  assert.deepEqual(reg.archived, [], 'the second press did not reach the offer underneath the one it just spent');
});

/* ── 4. the window closing ───────────────────────────────────────────────── */

test('A TOAST THAT EXPIRES TAKES ITS OFFER WITH IT, and the archive stands', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('beta');
  toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });

  t.mock.timers.tick(LIFE);
  assert.deepEqual(toasts.items, [], 'the toast outlived its own window and is still on screen');

  /* THE ASSERTION THAT MATTERS. An offer still reachable after the window closed restores a row the
     person archived and then moved on from, which is the same destruction in the other direction. */
  assert.equal(toasts.undoLast(), false, 'an expired toast still answered the undo shortcut');
  assert.deepEqual(reg.rows, ['alpha', 'gamma'], 'a row came back out of the archive after its undo had expired');
});

test('and it lives the whole window and not part of it', (t) => {
  fresh(t);
  toasts.push('Archived obligations#2', { undo: () => {} });

  t.mock.timers.tick(LIFE - 1);
  assert.equal(toasts.items.length, 1, 'the toast went before its window was up, which is a countdown never really offered');
});

/* ── 5. the hold, which is what makes the window honest ──────────────────── */

test('THE COUNTDOWN DOES NOT RUN WHILE THE POINTER IS OVER THE STACK', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('beta');
  toasts.push('Archived obligations#2', { undo: () => reg.restore('beta') });

  toasts.hold();
  t.mock.timers.tick(LIFE * 3);
  assert.equal(toasts.items.length, 1, 'the toast expired under the pointer that was reaching for its button');
  assert.equal(toasts.undoLast(), true, 'the offer was gone by the time the button under the pointer was pressed');
  assert.deepEqual(reg.rows.toSorted(), ['alpha', 'beta', 'gamma']);
});

test('and the pointer leaving starts the window again rather than resuming it', (t) => {
  fresh(t);
  toasts.push('Archived obligations#2', { undo: () => {} });

  /* Almost out of time, then hovered, then left. The module re-arms a FULL window on release, so the
     person who looked at the stack and moved away gets the whole window back. That is the
     generous reading of "it pauses", and it is pinned here so a change to it is a decision. */
  t.mock.timers.tick(LIFE - 100);
  toasts.hold();
  toasts.release();

  t.mock.timers.tick(LIFE - 100);
  assert.equal(toasts.items.length, 1, 'the window was resumed rather than restarted, so it closed under the person who just looked at it');

  t.mock.timers.tick(200);
  assert.deepEqual(toasts.items, [], 'a released toast never expires at all, so the stack grows over the work it reports on');
});

test('a toast pushed while the stack is held waits for the release, and is not immortal', (t) => {
  fresh(t);
  toasts.hold();
  toasts.push('Archived obligations#2', { undo: () => {} });

  t.mock.timers.tick(LIFE * 2);
  assert.equal(toasts.items.length, 1, 'a toast that arrived under the pointer counted down anyway');

  toasts.release();
  t.mock.timers.tick(LIFE);
  assert.deepEqual(toasts.items, [], 'a toast that arrived during a hold was never armed, so it stays until the page is reloaded');
});

/* ── 6. the cap ──────────────────────────────────────────────────────────── */

test('FOUR, THEN THE OLDEST GOES, so the stack cannot cover the work it is reporting on', (t) => {
  fresh(t);
  for (let n = 1; n <= 6; n++) toasts.push(`Archived obligations#${n}`);

  assert.equal(toasts.items.length, 4, 'the stack grew past its cap');
  assert.deepEqual(
    toasts.items.map((toast) => toast.text),
    ['Archived obligations#3', 'Archived obligations#4', 'Archived obligations#5', 'Archived obligations#6'],
    'the cap dropped the newest toasts instead of the oldest',
  );
});

test('AN EVICTED TOAST TAKES ITS COUNTDOWN WITH IT, rather than expiring later over a stack it has left', (t) => {
  fresh(t);

  /* The pushes are spread over the clock so that the first toast's window closes on its own, a clear
     second before the windows of the toasts that pushed it off the end. Pushed together they would
     all expire in the same tick and the evicted one's countdown would be indistinguishable. */
  toasts.push('Archived obligations#1', { undo: () => {} });
  t.mock.timers.tick(1_000);
  const live = [2, 3, 4].map((n) => toasts.push(`Archived obligations#${n}`, { undo: () => {} }));
  t.mock.timers.tick(1_000);
  /* The fifth is what puts the first over the cap. */
  toasts.push('Archived obligations#5', { undo: () => {} });
  assert.equal(toasts.items.length, 4);

  /**
   * THE SEAM. A countdown's callback is `() => this.dismiss(id)` and looks the method up on the
   * instance when it fires, so an own property catches exactly the expiries and nothing else. The
   * timer is private and a leaked one is invisible from outside; this is what makes it visible.
   */
  const expired: number[] = [];
  const inherited = Object.getPrototypeOf(toasts) as { dismiss: (id: number) => void };
  toasts.dismiss = function (id: number) {
    expired.push(id);
    inherited.dismiss.call(this, id);
  };

  try {
    /* THE EVICTED TOAST'S OWN WINDOW CLOSES HERE, six seconds after it left the screen. */
    t.mock.timers.tick(LIFE - 2_000);
    assert.deepEqual(expired, [], 'the evicted toast kept counting down and expired over a stack it had left six seconds earlier');

    /* AND THE GUARD AGAINST A VACUOUS PASS, which is the failure this repository is written against:
       if the mocked clock fired nothing at all, the assertion above would hold for the wrong reason.
       The three pushed a second later are due now, and they must be heard. */
    t.mock.timers.tick(1_000);
    assert.deepEqual(expired, live, 'the mocked clock fired no expiry at all, so the check above proves nothing');
  } finally {
    delete (toasts as unknown as Record<string, unknown>)['dismiss'];
  }
});

test('and an offer that has been pushed off the end cannot be reached by the shortcut', (t) => {
  fresh(t);
  const reg = register();
  reg.archive('alpha');

  /* THE CLAIM, AND WHAT IT IS NOT. `undoLast` reads the live stack, so an evicted offer is already
     out of its reach: this test holds that and does not fail against a stack that leaks the timer.
     It is here because the reach is what the person feels. The offer they made four toasts ago is
     GONE rather than wrong, and the press they make lands on the newest offer instead. */
  toasts.push('Archived obligations#1', { undo: () => reg.restore('alpha') });
  for (const n of [2, 3, 4, 5]) toasts.push(`Archived obligations#${n}`, { undo: () => {} });

  assert.equal(toasts.undoLast(), true);
  assert.deepEqual(reg.archived, ['alpha'], 'a press of undo reached an offer that had been off the screen since the fifth toast arrived');
});

/* ── 7. an undo that fails ───────────────────────────────────────────────── */

test('AN UNDO THAT THROWS IS STILL SPENT, so nobody presses it again over a half applied undo', (t) => {
  fresh(t);
  let ran = 0;
  const id = toasts.push('Archived obligations#2', {
    undo: () => {
      ran++;
      throw new Error('the row could not be restored');
    },
  });

  /* THE THROW PROPAGATES, and that is the choice rather than an oversight: a swallowed error is how
     an undo that did not work looks exactly like one that did, on the one control in this app whose
     failure loses a row. What must not survive it is the offer. */
  assert.throws(() => toasts.run(id), /could not be restored/u);

  assert.deepEqual(toasts.items, [], 'the undo threw and its toast stayed on screen, still offering an undo that half ran');

  toasts.run(id);
  assert.equal(ran, 1, 'a second press reached a callback that had already run and thrown part of the way through');
});

test('and the shortcut spends it too, rather than leaving it under the next press', (t) => {
  fresh(t);
  let ran = 0;
  toasts.push('Archived obligations#2', {
    undo: () => {
      ran++;
      throw new Error('the row could not be restored');
    },
  });

  assert.throws(() => toasts.undoLast(), /could not be restored/u);
  assert.equal(toasts.undoLast(), false, 'the failed offer was still the newest offer, so the next press ran it again');
  assert.equal(ran, 1);
});

test('and a report that only reports is unharmed by the offer above it failing', (t) => {
  fresh(t);
  const copied = toasts.push('Copied obligations#2.');
  const id = toasts.push('Archived obligations#2', {
    undo: () => {
      throw new Error('the row could not be restored');
    },
  });

  assert.throws(() => toasts.run(id));
  assert.deepEqual(
    toasts.items.map((toast) => toast.id),
    [copied],
    'a failed undo took the rest of the stack with it, or left its own toast behind',
  );
});

test('and a dismissed toast leaves the rest of the stack alone', (t) => {
  fresh(t);
  const first = toasts.push('Archived obligations#1');
  const second = toasts.push('Archived obligations#2');

  toasts.dismiss(first);
  assert.deepEqual(
    toasts.items.map((toast) => toast.id),
    [second],
    'dismissing one toast took another with it',
  );

  /* Dismissing twice is what a click on the close button of a toast already expiring looks like. */
  toasts.dismiss(first);
  assert.equal(toasts.items.length, 1);
});

/* ── the two windows ─────────────────────────────────────────────────────── */

test('A TOAST THAT ONLY REPORTS STAYS FIVE SECONDS, one that offers its Undo eight', (t) => {
  fresh(t);
  toasts.push('Copied the link.');
  toasts.push('Archived \u201cInvoice 2026-041\u201d.', { undo: () => {} });
  t.mock.timers.tick(REPORT - 1);
  assert.equal(toasts.items.length, 2, 'a report went before its five seconds were up');
  t.mock.timers.tick(1);
  assert.deepEqual(toasts.items.map((x) => x.text), ['Archived \u201cInvoice 2026-041\u201d.'], 'the report outlived its window, or the offer went with it');
  t.mock.timers.tick(LIFE - REPORT);
  assert.deepEqual(toasts.items, [], 'the offer outlived its eight seconds');
});

test('AN UNDO THAT IS NOT DRAWN keeps the report\'s window and still answers the shortcut', (t) => {
  fresh(t);
  let undone = 0;
  toasts.push('Added \u201cMotion test bill\u201d.', { undo: () => undone++, offer: false });
  t.mock.timers.tick(REPORT - 1);
  assert.equal(toasts.undoLast(), true, 'the shortcut did not reach an undo the toast does not draw');
  assert.equal(undone, 1);
  toasts.push('Added \u201cAnother bill\u201d.', { undo: () => {}, offer: false });
  t.mock.timers.tick(REPORT);
  assert.deepEqual(toasts.items, [], 'a toast with no drawn action kept the eight seconds of one that has one');
});

test('A MODULE TURNED ON HUSHES EVERY PLACE THAT COMES WITH IT, for half a minute (AP17)', (t) => {
  fresh(t);
  const at = 1_000_000;
  assert.equal(toasts.wasNamed('/agents', at), false);
  toasts.hush(at);
  assert.equal(toasts.wasNamed('/agents', at + 1), true, 'the agents’ place that came with Money was said again');
  assert.equal(toasts.wasNamed('/p/money', at + 29_000), true);
  assert.equal(toasts.wasNamed('/agents', at + 31_000), false, 'a place that came long after was never said');
});
