/**
 * Copying, and the three ways it does not happen.
 *
 * The module's whole claim is that BOTH PATHS SPEAK. A copy button that silently does nothing is
 * worse than no button, because the reader then pastes whatever was in the clipboard before into
 * something that matters. So what is held below is not that `put` calls `writeText`: it is that
 * every exit from `put` leaves a sentence behind, and that the sentence says which thing happened.
 *
 * THE THREE FAILURES ARE DIFFERENT SHAPES and each one has cost something. `navigator.clipboard` is
 * ABSENT over plain HTTP and in a sandboxed frame, so the property access itself throws. `writeText`
 * REJECTS when permission is refused. And, the one its header records in full, Chrome does not
 * reject when the document is not focused: it NEVER SETTLES, which is why there is a deadline and
 * why a test that only checked the rejection would have missed the defect that was actually shipped.
 *
 * WHY THIS FILE COMPILES A MODULE. `clipboard.ts` is plain TypeScript, but it imports
 * `ui/toast.svelte.ts`, which ends with `export const toasts = new Toasts()` and so evaluates
 * `$state` on load. A rune is a compiler macro with no runtime binding, so the import chain fails
 * under a plain `node --test` with `ReferenceError: $state is not defined`. The hook is the one
 * `lib/data/record.test.ts` and `lib/a11y/keys.svelte.test.ts` use, for the same reason.
 *
 * WHAT `generate: 'server'` LEAVES UNCOVERED, STATED SO NOBODY READS MORE INTO A GREEN RUN THAN IS
 * THERE. Compiled for the server, `$state([])` is a plain array, so the toast stack holds the right
 * VALUE in every test below and none of it is reactive. That a sentence reaching `toasts.items` ever
 * appears on screen, or is announced in the live region, is the browser gates' claim. That one is
 * always produced, and is the right one, is this file's.
 *
 * THE CLOCK HERE IS REAL, and the deadline test costs the one second it is about. A mocked clock is
 * shared with the toast stack's own ten second timers, and mocking it per test made the deadline
 * test hang on a timer that never fired. One second is cheaper than that. What keeps the run short
 * is emptying the stack after each test, which clears the timers that would otherwise hold the
 * process open for ten seconds after the last assertion.
 */

import { afterEach, beforeEach, test } from 'node:test';
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

/* AFTER THE HOOK, AND THAT IS WHY THESE ARE DYNAMIC: a static import is evaluated before this file's
   body runs, so the chain would load before the hook that makes it loadable was registered. */
const { put, putLink, putSpoken } = await import('./clipboard.ts');
const { copy } = await import('./copy.ts');
const { toasts } = await import('./ui/toast.svelte.ts');

/**
 * The deadline `clipboard.ts` keeps for a write that never settles. Not exported, so it is written
 * out here; what the tests below turn on is that there IS one, not its exact length.
 */
const DEADLINE = 1_000;

/** `location` exists only for `putLink`, and only the one property it reads. */
Object.defineProperty(globalThis, 'location', { value: { origin: 'https://brain.example', pathname: '/app/r/obligations' }, configurable: true, writable: true });

/**
 * A clipboard that behaves in one of the four ways a real one does, and a record of what reached it.
 *
 * `navigator` is defined rather than assigned because Node has its own, and the module reads it off
 * the global at call time. `clipboard: undefined` is the plain-HTTP case: the property access inside
 * `put` throws, which is a path no amount of stubbing `writeText` would reach.
 */
function clipboard(mode: 'writes' | 'rejects' | 'hangs' | 'absent') {
  const wrote: string[] = [];
  const api = mode === 'absent' ? undefined : {
    writeText(text: string) {
      wrote.push(text);
      if (mode === 'rejects') return Promise.reject(new Error('Write permission denied.'));
      if (mode === 'hangs') return new Promise<void>(() => {});
      return Promise.resolve();
    },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: api }, configurable: true, writable: true });
  return wrote;
}

/**
 * An empty stack before each test, and an empty one after the last.
 *
 * Dismissing rather than reassigning `items` on purpose: `dismiss` is what clears the pending timer,
 * and a stack left with one armed holds the process open until the toast expires.
 */
function empty(): void {
  for (const toast of [...toasts.items]) toasts.dismiss(toast.id);
  toasts.release();
}

beforeEach(empty);
afterEach(empty);

/** The sentence the person is left with, which is what this module exists to produce. */
function said() {
  const toast = toasts.items.at(-1);
  assert.ok(toast, 'the copy finished and said nothing at all, which is the silent no-op this module exists to prevent');
  return toast;
}

/* ── 1. the copy that works ──────────────────────────────────────────────── */

test('the text reaches the clipboard and the sentence says what was copied', async () => {
  const wrote = clipboard('writes');

  await put('obligations#41');

  assert.deepEqual(wrote, ['obligations#41'], 'the text the caller asked to copy is not what reached the clipboard');
  assert.equal(said().text, copy.copied('obligations#41'));
  assert.equal(said().intent, undefined, 'a copy that worked was reported as a warning');
});

test('and a long value is quoted by its label rather than in full', async () => {
  const key = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg8sfjsqs3qf';
  const wrote = clipboard('writes');

  await put(key, 'the public key');

  assert.deepEqual(wrote, [key], 'the label was copied instead of the text');
  assert.equal(said().text, copy.copied('the public key'));
});

test('and a surface with its own sentence keeps it', async () => {
  clipboard('writes');

  await put('bd_tok_1a2b3c', 'the token', copy.tokenCopied);

  assert.equal(said().text, copy.tokenCopied, 'a caller that supplied its own sentence got the default one instead');
});

/* ── 2. the three ways it does not work ──────────────────────────────────── */

test('A REFUSED WRITE SAYS SO, rather than reporting a copy that did not happen', async () => {
  clipboard('rejects');

  await put('obligations#41');

  assert.equal(said().text, copy.copyRefused);
  assert.notEqual(said().text, copy.copied('obligations#41'), 'a refused write was reported to the person as a successful copy');
  assert.equal(said().intent, 'warn', 'a refusal was dressed as an ordinary report');
});

test('and a surface with its own sentence does not get to claim success over a refusal', async () => {
  clipboard('rejects');

  await put('bd_tok_1a2b3c', 'the token', copy.tokenCopied);

  assert.equal(said().text, copy.copyRefused, '"Token copied" was shown for a token that never reached the clipboard');
});

test('NO CLIPBOARD AT ALL IS REPORTED AND NOT THROWN, which is the plain-HTTP and sandboxed case', async () => {
  clipboard('absent');

  /* The property access itself throws here. A caller is an `onclick`, so a rejection out of `put`
     would be an unhandled rejection and, on screen, the same silence as no button. */
  await put('obligations#41');

  assert.equal(said().text, copy.copyRefused);
  assert.equal(said().intent, 'warn');
});

test('A WRITE THAT NEVER SETTLES IS REPORTED AT THE DEADLINE, which a rejection test alone would miss', async () => {
  const wrote = clipboard('hangs');

  /* Chrome does not reject `writeText` when the document is not focused. It never settles, and the
     shipped defect was exactly this: the public signing key on the export screen, pressed twice,
     said nothing twice. */
  const pending = put('age1ql3z7hjy', 'the public key');

  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(toasts.items, [], 'the sentence was written before the write had a chance to land');

  await pending;

  assert.deepEqual(wrote, ['age1ql3z7hjy'], 'the write was never attempted, so the deadline is reporting on nothing');
  assert.equal(said().text, copy.copyRefused, 'a write that never settled left the person with no sentence at all');
  assert.equal(said().intent, 'warn');
});

test('and the deadline is a deadline and not a wait for something that is not coming', async () => {
  clipboard('hangs');

  const started = Date.now();
  await put('age1ql3z7hjy', 'the public key');

  /* The number is not the point and is not pinned: what is held is that `put` settles on its own,
     rather than leaving a button that a person can press twice and hear nothing twice. */
  assert.ok(Date.now() - started < DEADLINE * 5, 'a write that never settles left `put` waiting on it indefinitely');
});

/* ── 3. what the two named helpers put on the clipboard ──────────────────── */

test('the spoken id is the one a person pastes into a message to a colleague', async () => {
  const wrote = clipboard('writes');

  await putSpoken('obligations', 41);

  assert.deepEqual(wrote, ['obligations#41']);
});

test('and the link is absolute, so it survives being pasted anywhere', async () => {
  const wrote = clipboard('writes');

  await putLink('obligations', 41);

  assert.deepEqual(wrote, ['https://brain.example/app/r/obligations/41'], 'the copied link is relative, so it only works on the page it came from');
});

test('A LINK COPIED UNDER A SLUG NAMES ITS RECORD, so whoever opens it reads the record it was copied from', async () => {
  /* Before the record was in the path, a pasted link opened whichever record the READER's session was on. */
  const was = globalThis.location;
  Object.defineProperty(globalThis, 'location', { value: { origin: 'https://brain.dog', pathname: '/app/acme/r/obligations' }, configurable: true, writable: true });
  try {
    const wrote = clipboard('writes');
    await putLink('obligations', 41);
    assert.deepEqual(wrote, ['https://brain.dog/app/acme/r/obligations/41']);
  } finally {
    Object.defineProperty(globalThis, 'location', { value: was, configurable: true, writable: true });
  }
});
