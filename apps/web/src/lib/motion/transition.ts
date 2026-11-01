/**
 * A CHANGE A SCREEN MAKES ITSELF, DRAWN AS A PAGE CHANGE IS (ui pass, 1 Nov): `transitionTo(() => …)` runs the change
 * inside a view transition where the browser has one, so the work cross-fades exactly as a route change does
 * (`app.css`: the work is named `page`, the old picture leaves over `--d-exit` and the new one rises in), and the shell
 * holds still. Where there is none, or the reader asked for less motion, the change is simply made, and the
 * fallback fade, where one is wanted, is `Swap.svelte`'s.
 *
 *   await transitionTo(() => (view = 'cards'));
 *
 * A route change needs nothing from here: `AppFrame.svelte` wraps every navigation already.
 */

import { tick } from 'svelte';

import { still } from './index.ts';

export async function transitionTo(change: () => void | Promise<void>): Promise<void> {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function' || still() || document.visibilityState !== 'visible') {
    await change();
    return;
  }
  const root = document.documentElement;
  root.dataset.moving = '';
  const moving = document.startViewTransition(async () => {
    await change();
    await tick();
  });
  try {
    await moving.updateCallbackDone;
  } finally {
    void moving.finished.catch(() => undefined).then(() => delete root.dataset.moving);
  }
}
