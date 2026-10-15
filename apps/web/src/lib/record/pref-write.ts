/**
 * A personal setting changed, said, and offered back: the one helper every Appearance control writes through
 * (PGS-B09 job f).
 *
 * WHAT WAS THERE BEFORE. Navigation's controls toasted with an Undo (`Navigation.svelte`); Appearance's wrote bare.
 * Density, text size and the scheme changed with no word at all, the colour said "Moss is your colour." with nothing to
 * press, and contrast was silent. A setting that cannot be taken back is one a person is careful with, and the point of
 * these is to try them.
 *
 * WRITE, THEN SAY, THEN OFFER THE WAY BACK. `keptWithUndo` calls the matching writer, waits for the record's answer, and
 * pushes the sentence `said` builds with an Undo that is this same call with `before` and `after` swapped. So an Undo is
 * itself a kept change: it writes through the same path, says the earlier value in the same words, and offers its own
 * way back, the way a person expects pressing Undo twice to land where they were.
 *
 * A REFUSAL SAYS THE RECORD'S FIX AND OFFERS NOTHING. `pref.keep` leaves a refused key on the device, so there is no
 * record change to take back, and an Undo beside a sentence that says it did not arrive would read as the change having
 * been kept after all.
 *
 * EVERY WRITER IS HANDED IN. The ones Appearance passes are `pref.apply`, `pref.contrast` and its own wrap of
 * `accent.apply` (which keeps `look.accent` through `pref.keep` itself), and the stack is `toasts`; a test passes fakes.
 * Only types are imported, so this file adds no module to the chunk that loads it.
 */

import type { Kept } from '../pref.ts';
import { said, type PrefKey, type PrefValue } from './pref-words.ts';

/** What each kind of setting is written with: its `pref.ts` writer, or the screen's own for the colour. */
export type Writers = {
  /** `pref.apply`, for the scheme, the text size and the density. */
  apply: (key: 'scheme' | 'text' | 'density', value: string | null) => Promise<Kept>;
  /** `pref.contrast`. */
  contrast: (on: boolean) => Promise<Kept>;
  /**
   * The colour, by its hex or `null` for the house's. A refusal from here is one where nothing was painted (a swatch
   * that misses a contrast floor), with the screen's sentence for it as its fix.
   */
  accent?: ((hex: string | null) => Kept | Promise<Kept>) | undefined;
};

export type Deps = Writers & {
  /** The toast stack's `push`, as `toasts` in `ui/toast.svelte.ts` has it. */
  toasts: { push: (text: string, opts?: { undo?: () => void; intent?: 'good' | 'warn' | 'bad' }) => number };
  /**
   * Told each value that now stands on this device, so the screen's controls and preview draw it: after the change,
   * and after an Undo a person pressed in the toast, which the screen did not see coming.
   */
  shown?: ((key: PrefKey, value: PrefValue) => void) | undefined;
};

/* A COLOUR THIS SCREEN CANNOT PAINT STAYS UNPAINTED, while every other refusal is a value the device kept anyway. */
const paintedWhenRefused = (key: PrefKey): boolean => key !== 'theme';

function write(key: PrefKey, value: PrefValue, deps: Writers): Promise<Kept> {
  switch (key) {
    /* "MATCH THIS DEVICE" IS NO SCHEME ON THE PAGE. The screen holds it as the word `system`, and an Undo hands that word
       back; `pref.apply` takes `null` for it (and sends the record `system` itself), where the word would land in the
       cookie and on `data-scheme` as a scheme no stylesheet draws. */
    case 'scheme':
      return deps.apply(key, typeof value === 'string' && value !== 'system' ? value : null);
    case 'text':
    case 'density':
      return deps.apply(key, typeof value === 'string' ? value : null);
    case 'contrast':
      return deps.contrast(value === true);
    case 'theme':
      /* A SCREEN WITH NO COLOUR WRITER KEEPS NOTHING, and says so rather than toasting a colour it never put on. */
      if (!deps.accent) return Promise.resolve({ from: 'refused', fix: 'Your colour could not be changed here.' });
      return Promise.resolve(deps.accent(typeof value === 'string' ? value : null));
  }
}

/**
 * Change `key` from `before` to `after`, say it, and offer the Undo. Answers the record's word for the change, so a
 * screen that says where its settings are kept can read it again.
 *
 * A WRITER THAT THROWS IS A CHANGE THAT DID NOT ARRIVE, which `pref.keep` already calls `pending`: said and offered back
 * like any other, since the device holds it and will send it again.
 */
export async function keptWithUndo(key: PrefKey, before: PrefValue, after: PrefValue, deps: Deps): Promise<Kept> {
  const kept = await write(key, after, deps).catch((): Kept => ({ from: 'pending' }));
  if (kept.from === 'refused') {
    if (paintedWhenRefused(key)) deps.shown?.(key, after);
    deps.toasts.push(kept.fix, { intent: 'warn' });
    return kept;
  }
  deps.shown?.(key, after);
  deps.toasts.push(said(key, after), { undo: () => void keptWithUndo(key, after, before, deps) });
  return kept;
}
