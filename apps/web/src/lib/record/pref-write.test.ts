/**
 * `keptWithUndo`: every personal setting Appearance writes says what it changed and offers Undo (PGS-B09 job f).
 *
 * THE WRITERS AND THE STACK ARE FAKES, as `pref.ts`'s own `Send` is in its tests: the writers record each value in the
 * order it was written and answer what the record would, and the stack keeps each push with its offer so a test can
 * press Undo the way `toasts.run` does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Kept } from '../pref.ts';
import type * as pref from '../pref.ts';
import type { toasts } from '../ui/toast.svelte.ts';
import { keptWithUndo, type Deps } from './pref-write.ts';
import { said, type PrefKey, type PrefValue } from './pref-words.ts';

/* THE REAL WRITERS AND STACK FIT `Deps` AS THEY ARE, held by the typecheck, so Appearance hands them over unwrapped. */
const fits: [
  typeof pref.apply extends Deps['apply'] ? true : never,
  typeof pref.contrast extends Deps['contrast'] ? true : never,
  typeof toasts extends Deps['toasts'] ? true : never,
] = [true, true, true];
void fits;

type Pushed = { text: string; undo?: (() => void) | undefined; intent?: string | undefined };

function fakes(answer: (key: PrefKey, value: PrefValue) => Kept = () => ({ from: 'kept' })) {
  const written: [PrefKey, PrefValue][] = [];
  const shown: [PrefKey, PrefValue][] = [];
  const pushed: Pushed[] = [];
  const deps: Deps = {
    apply: async (key, value) => (written.push([key, value]), answer(key, value)),
    contrast: async (on) => (written.push(['contrast', on]), answer('contrast', on)),
    accent: (hex) => (written.push(['theme', hex]), answer('theme', hex)),
    toasts: { push: (text, opts = {}) => pushed.push({ text, undo: opts.undo, intent: opts.intent }) },
    shown: (key, value) => void shown.push([key, value]),
  };
  /* PRESS ONE TOAST'S UNDO, as `toasts.run` does: spent once pressed, and the Undo's own write and toast let land. */
  const press = async (at: number) => {
    const offer = pushed[at]?.undo;
    assert.ok(offer, `toast ${at} offers an Undo`);
    pushed[at] = { ...pushed[at]!, undo: undefined };
    offer();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { deps, written, shown, pushed, press };
}

test('a change writes once and says itself in one toast with an Undo', async () => {
  const f = fakes();
  const kept = await keptWithUndo('density', 'comfortable', 'compact', f.deps);
  assert.deepEqual(kept, { from: 'kept' });
  assert.deepEqual(f.written, [['density', 'compact']]);
  assert.equal(f.pushed.length, 1);
  assert.equal(f.pushed[0]!.text, 'Density is compact.');
  assert.equal(typeof f.pushed[0]!.undo, 'function');
  assert.equal(f.pushed[0]!.intent, undefined);
  assert.deepEqual(f.shown, [['density', 'compact']]);
});

test('Undo writes the earlier value back and toasts once, with its own way back', async () => {
  const f = fakes();
  await keptWithUndo('contrast', false, true, f.deps);
  assert.equal(f.pushed[0]!.text, 'Contrast is high.');
  await f.press(0);
  assert.deepEqual(f.written, [['contrast', true], ['contrast', false]]);
  assert.equal(f.pushed.length, 2);
  assert.equal(f.pushed[1]!.text, 'Contrast is normal.');
  assert.equal(typeof f.pushed[1]!.undo, 'function');
  /* THE SCREEN HEARS OF THE UNDO, which it did not make, so its switch draws off again. */
  assert.deepEqual(f.shown.at(-1), ['contrast', false]);
});

test('a refusal toasts the record fix as a warning, with no Undo', async () => {
  const fix = 'This record keeps no density yet. Ask the owner to update it.';
  const f = fakes(() => ({ from: 'refused', fix }));
  const kept = await keptWithUndo('density', 'comfortable', 'roomy', f.deps);
  assert.deepEqual(kept, { from: 'refused', fix });
  assert.equal(f.pushed.length, 1);
  assert.deepEqual(f.pushed[0], { text: fix, undo: undefined, intent: 'warn' });
  /* THE DEVICE KEPT IT (`pref.keep` puts nothing back), so the control still draws what was picked. */
  assert.deepEqual(f.shown, [['density', 'roomy']]);
});

test('a colour that cannot be painted says why and leaves the screen as it was', async () => {
  const fix = 'Plum is too faint on this scheme. Pick another colour.';
  const f = fakes((key) => (key === 'theme' ? { from: 'refused', fix } : { from: 'kept' }));
  await keptWithUndo('theme', null, '#A75996', f.deps);
  assert.deepEqual(f.pushed, [{ text: fix, undo: undefined, intent: 'warn' }]);
  assert.deepEqual(f.shown, []);
});

test('two quick changes undo in order, newest first, back to where they started', async () => {
  const f = fakes();
  await Promise.all([keptWithUndo('scheme', 'system', 'dark', f.deps), keptWithUndo('text', 'base', 'md', f.deps)]);
  assert.deepEqual(
    f.pushed.map((p) => p.text),
    ['The colour scheme is dark.', 'Text is large.'],
  );
  /* THE NEWEST TOAST FIRST, then the one before it: each puts back what its own change replaced. */
  await f.press(1);
  await f.press(0);
  assert.deepEqual(f.written, [
    ['scheme', 'dark'],
    ['text', 'md'],
    ['text', 'base'],
    /* THE SCREEN'S `system` GOES TO `pref.apply` AS `null`, which is how it means "match this device". */
    ['scheme', null],
  ]);
  /* EACH UNDO SAYS ITSELF ONCE, in the order pressed, and is an offer of its own. */
  assert.deepEqual(
    f.pushed.slice(2).map((p) => p.text),
    ['Text is normal.', 'The colour scheme follows this device.'],
  );
  assert.ok(f.pushed.slice(2).every((p) => typeof p.undo === 'function'));
});

test('a write that does not arrive is still said and offered back, as pending', async () => {
  const f = fakes();
  f.deps.apply = () => Promise.reject(new Error('offline'));
  const kept = await keptWithUndo('scheme', 'light', 'dark', f.deps);
  assert.deepEqual(kept, { from: 'pending' });
  assert.equal(f.pushed[0]!.text, 'The colour scheme is dark.');
  assert.equal(typeof f.pushed[0]!.undo, 'function');
});

test('the colour is said by its name and the house colour in the screen words', async () => {
  const f = fakes();
  await keptWithUndo('theme', null, '#41815f', f.deps);
  assert.equal(f.pushed[0]!.text, 'Moss is your colour.');
  await f.press(0);
  assert.deepEqual(f.written.at(-1), ['theme', null]);
  assert.equal(f.pushed[1]!.text, 'Back to the house colour.');
});

test('every sentence names the setting in plain words and never a key or raw value', () => {
  const cases: [PrefKey, PrefValue][] = [
    ['scheme', 'light'], ['scheme', null], ['text', 'sm'], ['text', null], ['density', 'compact'],
    ['density', 'roomy'], ['contrast', true], ['contrast', false], ['theme', '#3C72CE'], ['theme', '#000000'],
    ['density', 'tight'], ['scheme', 'sepia'],
  ];
  for (const [key, value] of cases) {
    const line = said(key, value);
    assert.match(line, /^[A-Z].*\.$/, line);
    assert.doesNotMatch(line, /look\.|#[0-9a-f]{3,6}|tight|sepia|—/i, line);
  }
  assert.equal(said('density', 'tight'), 'Density changed.');
  assert.equal(said('theme', '#3C72CE'), 'Ink blue is your colour.');
});
