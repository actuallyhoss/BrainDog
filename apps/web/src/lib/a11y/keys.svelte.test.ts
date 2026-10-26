/**
 * `keys.svelte.ts`: the three questions the shell asks before a bare key is allowed to mean anything.
 *
 * `overlays` and `covered()`: whether a keystroke reaches the page underneath an open sheet.
 * `typing()`: whether a bare key is a shortcut or a character the person meant to type.
 * `GoPrefix`: the `g` then letter chord, and the one second it lives for.
 *
 * The counter in `keys.svelte.ts` is the whole of that decision, and nothing checked it at any
 * height. Its own header records what it costs when the answer is wrong: open a page, press Add a
 * block, press `j` and then `o`, and the page under the modal moves its cursor and then navigates
 * the app out from under the open sheet. That is a correctness failure and an accessibility failure
 * in the same keystroke, on the one accessibility claim this app makes.
 *
 * WHY THIS FILE COMPILES THE MODULE IT TESTS. `keys.svelte.ts` ends with
 * `export const overlays = new Overlays()`, so the class is CONSTRUCTED at module scope and the
 * `#count = $state(0)` field is evaluated on load. A rune is a compiler macro with no runtime
 * binding, so a plain `node --test` import fails with `ReferenceError: $state is not defined`. The
 * rune in the field alone would have been harmless: a class nobody instantiates at load time
 * imports fine. It is the instance on the last line that has to be compiled away. `registerHooks`
 * hands the file to `compileModule` on the way in, which is the technique `lib/data/record.test.ts`
 * proved and `packages/render/src/parity.test.ts` proved before it.
 *
 * THE HOOK STAYS IN THIS FILE, and `package.json` is untouched. It costs this one process the
 * Svelte compiler, which is about a second, and it is not a decision about what `node --test` means
 * for the rest of the app.
 *
 * WHAT `generate: 'server'` LEAVES UNCOVERED, STATED SO NOBODY READS MORE INTO A GREEN RUN THAN IS
 * THERE. Compiled for the server, `$state(0)` is a plain `0` and `this.#count++` is an increment and
 * nothing more, and `GoPrefix`'s `armed = $state(false)` is a plain field. The counter and the
 * prefix therefore hold the right VALUE in every test below, and none of it is
 * reactive. Nothing here proves that the shell's `<svelte:window>` handler re-reads the depth when a
 * sheet opens, that the `role="status"` hint appears when the prefix arms and goes when it expires,
 * that a browser re-renders, or that an effect ever runs. A `#count` or an `armed` that had quietly
 * stopped being reactive would pass this entire file. The reactivity is the browser gates' claim to
 * make; the arithmetic, the clamp and the deadline are this file's.
 *
 * AND WHAT IS NOT TESTED ANYWHERE ELSE, so that the division is legible. `tools/gates/keys.mjs`
 * reads the binding registry out of `bindings.ts` as text and presses every bare binding in a real
 * browser, and it skips the `palette` and `nav` scopes precisely because they need a layer open
 * first. It never touches `overlays` or `covered()`. `keys.test.ts` next door holds the registry to
 * what it says about itself and imports `bindings.ts`, not this module. The counter had no reader in
 * any test before this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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

/**
 * THE SCROLL LOCK'S TARGET, because `open()` and `close()` write to `documentElement.style` and
 * there is no DOM here. Only the one property the module touches, so a write anywhere else would
 * throw rather than pass unnoticed.
 */
const html = { style: { overflow: '' } };

/**
 * AND `activeElement`, WHICH IS THE WHOLE OF `typing()`'s INPUT: a tag name and the contenteditable
 * flag beside it, because those are the only two things the module reads off it.
 *
 * It starts `null`, which is not a convenience. `typing()` guards for a document with nothing
 * focused explicitly, and a test that never sees that state would not notice the guard going.
 */
type Focused = { tagName: string; isContentEditable: boolean } | null;
const doc: { documentElement: typeof html; activeElement: Focused } = { documentElement: html, activeElement: null };
(globalThis as { document?: typeof doc }).document = doc;

/* AFTER THE HOOK, AND THAT IS WHY IT IS DYNAMIC. A static import is evaluated before this file's
   body runs, so the module would load before the hook that makes it loadable was registered. */
const { GoPrefix, covered, overlays, typing } = await import('./keys.svelte.ts');

/**
 * A page with nothing over it, which is where each test starts.
 *
 * It closes only WHILE the counter still claims something is open, so a broken clamp cannot make
 * this spin. A count left negative by the test before is not repaired here on purpose: a leaked
 * count is the fault under test, and it should be read in the test that produced it.
 */
function reset(): void {
  while (overlays.depth > 0) overlays.close();
  html.style.overflow = '';
}

/**
 * A route's own key handler, in the shape all six of them are written in: `if (covered()) return;`
 * and then the bare keys.
 *
 * This is a stand-in for those handlers and not the handlers themselves. That each of them actually
 * asks is the last test in this file; that a real keydown reaches them is the browser gates' claim.
 */
function pageHandler(): { press: (key: string) => void; heard: string[] } {
  const heard: string[] = [];
  return {
    heard,
    press(key: string) {
      if (covered()) return;
      heard.push(key);
    },
  };
}

/* ── 1. the depth semantics ──────────────────────────────────────────────── */

test('with nothing open, the page owns its own keyboard', () => {
  reset();
  assert.equal(overlays.depth, 0);
  assert.equal(covered(), false, 'a page with nothing over it was told to stand down, so its bare keys are dead');
});

test('A SHEET OVER THE PAGE TAKES THE PAGE’S BARE KEYS, which is the defect this counter exists for', () => {
  reset();
  const page = pageHandler();

  page.press('j');
  overlays.open();

  /* THE EXACT SEQUENCE FROM THE HEADER: `j` then `o` under an open Add a block. */
  page.press('j');
  page.press('o');
  assert.deepEqual(page.heard, ['j'], '`j` and `o` reached the page under an open sheet, which is the whole of the defect');

  overlays.close();
  page.press('o');
  assert.deepEqual(page.heard, ['j', 'o'], 'the page never got its keyboard back after the sheet closed');
});

test('A NESTED LAYER IS A SECOND LAYER, and the inner one closing does not hand the page back', () => {
  reset();
  overlays.open();
  assert.equal(overlays.depth, 1);
  assert.equal(covered(), true);

  overlays.open();
  assert.equal(overlays.depth, 2);
  assert.equal(covered(), true);

  /* THE ASSERTION A BOOLEAN FAILS. One of two open layers closed, and the page is still underneath
     the other one. A flag set false here is exactly how a keystroke reaches a page nobody can see. */
  overlays.close();
  assert.equal(overlays.depth, 1);
  assert.equal(covered(), true, 'closing the inner layer uncovered a page that is still under the outer one');

  overlays.close();
  assert.equal(overlays.depth, 0);
  assert.equal(covered(), false);
});

test('and closing them in a different order than they opened leaves the count where it belongs', () => {
  reset();
  /* A COUNTER HAS NO IDENTITY, AND THAT IS THE DESIGN RATHER THAN AN OVERSIGHT: the first layer to
     open giving its own hold back first is indistinguishable from the second doing it, so neither
     order can unlock early. The names below are there to make the scenario legible, not because the
     module can tell them apart. */
  const outer = overlays;
  const inner = overlays;

  outer.open();
  inner.open();
  assert.equal(overlays.depth, 2);

  /* The OUTER one goes first, which is the order the header says must not unlock early. */
  outer.close();
  assert.equal(overlays.depth, 1);
  assert.equal(covered(), true, 'the outer layer closing handed the keyboard back while the inner one was still up');

  inner.close();
  assert.equal(overlays.depth, 0);
  assert.equal(covered(), false, 'both layers closed and the page never got its keyboard back');
});

/* ── 2. the clamp at zero ────────────────────────────────────────────────── */

test('A RELEASE WITH NOTHING OPEN DOES NOT TAKE THE COUNT NEGATIVE, which is how a key leaks through', () => {
  reset();

  /* `Sheet.svelte` closes on its `else` arm AND again in its destroy teardown, and it guards that
     with a `held` flag. A stray release is one bug in one component away, and without the clamp it
     is silent: nothing looks wrong until the NEXT sheet opens. */
  overlays.close();
  assert.equal(overlays.depth, 0, 'one release with nothing open took the counter below zero');

  overlays.close();
  overlays.close();
  assert.equal(overlays.depth, 0, 'three releases with nothing open took the counter below zero');

  /* THE ASSERTION THAT MATTERS, because a negative count reads as "not covered". Without the clamp
     the depth is now -3, this open makes it -2, and every bare key on the page underneath fires
     while a modal is on screen. */
  overlays.open();
  assert.equal(overlays.depth, 1, 'an overlay opened over a counter that was still paying off stray releases');
  assert.equal(covered(), true, 'a sheet is open and the page under it was told it still owns the keyboard');

  const page = pageHandler();
  page.press('j');
  assert.deepEqual(page.heard, [], '`j` reached the page under an open sheet, through a count that had gone negative');

  overlays.close();
  assert.equal(covered(), false);
});

/* ── 3. the scroll lock, which is the other half of the counter's promise ─── */

test('THE PAGE IS LOCKED WHILE ANYTHING IS OPEN AND RELEASED EXACTLY AT ZERO, never early', () => {
  reset();
  assert.equal(html.style.overflow, '');

  overlays.open();
  assert.equal(html.style.overflow, 'hidden', 'a sheet opened over a page that can still be scrolled behind it');

  overlays.open();
  assert.equal(html.style.overflow, 'hidden');

  /* THE HEADER'S OWN SENTENCE, held to: "two overlays closing in the wrong order do not unlock
     early". The unlock is conditional on the count reaching zero, and this is that condition. */
  overlays.close();
  assert.equal(html.style.overflow, 'hidden', 'the page under a still open layer was unlocked by the inner one closing');

  overlays.close();
  assert.equal(html.style.overflow, '', 'every layer closed and the page was left unable to scroll');
});

test('and a release with nothing open leaves the page scrollable rather than locking it', () => {
  reset();
  overlays.close();
  assert.equal(html.style.overflow, '', 'a stray release locked a page that has nothing over it');
});

/* ── 4. the reason it is a function and not six copies ───────────────────── */

/**
 * WHAT THE HEADER PROMISES, READ BACK OFF THE ROUTES.
 *
 * `covered` exists as a function rather than six copies of `overlays.depth > 0` so that "the seventh
 * handler somebody writes reads one name and gets the rule". A handler that owns the window and
 * never asks is the defect the function was extracted to prevent, and it is invisible from inside
 * this module.
 *
 * READ AS TEXT, which is the technique `keys.test.ts` already uses on `Keymap.svelte` and for the
 * same reason: a `.svelte` file is not importable here at all.
 */
const ROUTES = new URL('../../routes/', import.meta.url);

/** A handler allowed not to stand down, and the reason, which is the point of keeping the list. */
const MODIFIED_ONLY: Record<string, string> = {
  'addons/[id]/Installed.svelte': 'acts only on Mod+Enter inside its own form, and the shell lets every modified chord through an open layer',
};

test('EVERY ROUTE HANDLER THAT OWNS THE WINDOW ASKS WHETHER SOMETHING IS OVER THE PAGE', () => {
  const files = readdirSync(ROUTES, { recursive: true, encoding: 'utf8' })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => f.endsWith('.svelte'));

  let asked = 0;
  for (const file of files) {
    const source = readFileSync(new URL(file, ROUTES), 'utf8');
    if (!/<svelte:window[^>]*onkeydown/u.test(source)) continue;
    if (Object.hasOwn(MODIFIED_ONLY, file)) continue;
    /* THE SHELL IS THE ONE THAT MAY READ THE COUNTER DIRECTLY. It is the handler the other six were
       written to copy, and `covered()` is a function so that they could. */
    assert.ok(
      /covered\(\)/u.test(source) || /overlays\.depth/u.test(source),
      `${file} handles keydown on the window and never asks whether something is open over the page. ` +
        'Call `covered()`, or add it to MODIFIED_ONLY with the reason it does not need to.',
    );
    asked++;
  }

  /* A WALK THAT FOUND NOTHING WOULD PASS THE LOOP ABOVE SILENTLY, which is the shape this repository
     exists to catch. Seven were guarded when this was written, out of eight handlers. */
  assert.ok(asked >= 7, `this walk found only ${asked} window keydown handlers, so it is not reading the routes`);
});

/* ── 5. `typing()`: a shortcut, or a character somebody meant ─────────────── */

/**
 * WHAT IS RIDING ON EACH ANSWER, because both wrong answers are destructive and they are destructive
 * in opposite directions. A `false` while somebody is in a field turns the letter they typed into a
 * shortcut, so the sentence loses a character and the app navigates out from under it. A `true` when
 * nothing is focused kills the bare-key namespace outright and every shortcut in the app is dead.
 *
 * The shell asks this twice per keydown (`typing() && !mod`, then again below the modifier chords),
 * so it is the single most-pressed branch in the interface.
 */
function focus(tagName: string, isContentEditable = false): void {
  doc.activeElement = { tagName, isContentEditable };
}

test('EVERY KIND OF FIELD COUNTS AS TYPING, including the two a hand-written copy of this check forgets', () => {
  /* `SELECT` IS IN HERE ON PURPOSE. A native select answers bare letters by jumping to the option
     that starts with them, so a bare-key handler that fires over an open select both steals the
     letter and acts on it. Two routes carry their own narrower version of this test that stops at
     INPUT and TEXTAREA, which is the drift the module header exists to forbid. */
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    focus(tag);
    assert.equal(typing(), true, `a key pressed inside a focused ${tag} was read as a shortcut, so it never reached what the person was typing`);
  }
});

test('and a contenteditable counts, which is the one a tag name alone cannot see', () => {
  /* A block editor is a `DIV`. Nothing about the tag says a person is writing in it, so the flag is
     the only thing that does. */
  focus('DIV', true);
  assert.equal(typing(), true, 'a key typed into a contenteditable was read as a shortcut, so the app acted on somebody mid sentence');
});

test('AN ORDINARY ELEMENT IS NOT A FIELD, or every shortcut in the app is dead', () => {
  focus('DIV');
  assert.equal(typing(), false, 'focus sitting on an ordinary element was called typing, which silences the whole bare-key namespace');

  /* A BUTTON IS THE CASE THIS REALLY DECIDES. `AddBlock` is a sheet made entirely of buttons, and
     the row grids put focus on one too, so `BUTTON` is where focus actually sits when a bare key is
     meant to work. */
  focus('BUTTON');
  assert.equal(typing(), false, 'focus on a button was called typing, and the grids are where the bare letters live');
});

test('and a document with nothing focused is not typing either, which is the guard the module writes out', () => {
  /* Not hypothetical: `activeElement` is `null` in a freshly created or detached document, and the
     module reads it before it reads a tag name. Without the guard this is a TypeError thrown inside
     a keydown handler, which takes every key after it down with it rather than misreading one. */
  doc.activeElement = null;
  assert.equal(typing(), false, 'a document with nothing focused was called typing, so the keyboard is dead until something takes focus');
});

/* ── 6. `GoPrefix`: a chord with a deadline ──────────────────────────────── */

/** `19 §4`: "The `g` prefix is armed for one second, then expires. `g w` is a chord, not a mode." */
const WINDOW = 1_000;

test('A FRESH PREFIX IS NOT ARMED, because a mode you are already in is not a chord', () => {
  assert.equal(new GoPrefix().armed, false, 'the prefix is armed before anyone pressed g, so the next letter typed navigates the app');
});

test('`g` ARMS IT AND IT LIVES THE WHOLE WINDOW, not part of it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const go = new GoPrefix();

  go.arm();
  assert.equal(go.armed, true, 'g was pressed and nothing armed, so `g h` does nothing at all');

  /* The hint is a `role="status"` line, so the window is also how long a screen reader has to hear
     that the prefix is up and answer it. A second that is really 300 ms is a chord for one person. */
  t.mock.timers.tick(WINDOW - 1);
  assert.equal(go.armed, true, 'the prefix expired inside the second it promises, so a letter pressed in time went nowhere');
});

test('AND IT EXPIRES AT THE DEADLINE, so a `g` nobody followed does not eat the next letter', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const go = new GoPrefix();

  go.arm();
  t.mock.timers.tick(WINDOW);
  /* A prefix that never expires IS the mode the header rules out: the `j` somebody presses a minute
     later is swallowed by a `g` they have forgotten pressing, or navigates the app if it is one of the
     rail's `g` letters (`goto.ts`). */
  assert.equal(go.armed, false, 'the prefix was still armed a full second after the g, so an unrelated key later was read as the second half of a chord');
});

test('A SECOND `g` RESTARTS THE WINDOW rather than being timed out by the first one', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const go = new GoPrefix();

  go.arm();
  t.mock.timers.tick(WINDOW - 100);
  go.arm();

  /* Past the FIRST arm's deadline and well inside the second's. A stale timer firing here disarms a
     prefix the person armed 100 ms ago, and the letter they are about to press is eaten. */
  t.mock.timers.tick(200);
  assert.equal(go.armed, true, 'the first g deadline disarmed a prefix that a later g had re-armed');

  t.mock.timers.tick(WINDOW - 200);
  assert.equal(go.armed, false, 're-arming bought the prefix a window with no end');
});

test('DISARMING DISARMS IT, so a chord already spent does not take the next letter as well', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const go = new GoPrefix();

  /* WHAT DISARMS IT, READ OFF THE SHELL: the letter being spent, whether or not it went anywhere,
     and any modifier held while the prefix is up, because `Mod+H` belongs to the browser and the arm
     used to read the key without asking. Both are this one call. */
  go.arm();
  go.disarm();
  assert.equal(go.armed, false, 'the chord was spent and the prefix stayed armed, so the NEXT letter navigated too');

  /* AND THE SPENT CHORD'S DEADLINE CANNOT REACH THE NEXT ONE. Worth pressing because the sequence is
     ordinary, `g h` and then `g` again; NOT worth crediting to `disarm`'s own `clearTimeout`, which
     is what this comment said first. `arm` clears whatever handle is stored before it sets its own,
     and `disarm` leaves that handle in place, so by the time a second chord exists the stale timer
     is already cleared by `arm`. Deleting the `clearTimeout` from `disarm` changes nothing anybody
     can observe: its callback only ever writes `false` over a `false`. Said here rather than
     asserted, so the line is not read as covered when no honest test can hold it. */
  t.mock.timers.tick(WINDOW - 100);
  go.arm();
  t.mock.timers.tick(200);
  assert.equal(go.armed, true, 'a g pressed 100 ms ago was disarmed by the deadline of a chord already spent');
});
