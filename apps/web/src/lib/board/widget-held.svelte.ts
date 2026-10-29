/**
 * What the person said to widgets offered from use, on this tab (widgets plan §6.2, §6.4): Add, Not now, Never, and
 * "Forget what BrainDog learned from my use".
 *
 * THE RECORD KEEPS IT, on every device: Not now and the day one was last answered in the person's `widgets.held`
 * preference, Never in `pen.dismissed` as every turned-down offer is (`navPrefs.dismiss`). This tab holds a copy so a
 * press hides the cell at once, and puts it back only if the record refuses.
 *
 * THE BRAKES ARE THE RECORD'S (`design-agent.ts` `widgetOffers`): two Not nows in a week pause offers for two weeks, a day
 * an offer was answered shows no new one, and Never is final. This file only writes what was said.
 */

import { page } from '$app/state';

import { navPrefs, type Saved } from '../nav-prefs.svelte.ts';

import { answered, forgotten, heldOf, type Held } from './held.ts';

export { answered, forgotten, heldOf, type Held };

async function send(value: Held): Promise<Saved> {
  try {
    const { createClient } = await import('@braindog/client');
    const { apiBase } = await import('../at.ts');
    const out = await createClient({ base: apiBase() }).setPref('widgets.held' as never, value as never);
    if (out.ok) return { from: 'kept' };
    return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : 'This was not kept.' };
  } catch {
    return { from: 'refused', fix: 'The record could not be reached, so this was not kept.' };
  }
}

class WidgetHeld {
  held = $state<Held>({ notNow: [] });
  /** The offers answered on this tab, by key, so a cell hides at once and stays hidden until Today is read again. */
  gone = $state<string[]>([]);
  #adopted = false;

  /** What `boot` said, once. */
  adopt(prefs: Record<string, unknown> | undefined): void {
    if (this.#adopted || prefs === undefined) return;
    this.#adopted = true;
    this.held = heldOf(prefs['widgets.held']);
  }

  /** What `boot` said, read the first time something is answered, so a write keeps what was said before. */
  #ensure(): void {
    try {
      this.adopt((page.data as { me?: { prefs?: Record<string, unknown> } } | undefined)?.me?.prefs);
    } catch {
      /* Outside a page (a test), nothing was said before. */
    }
  }

  /** Added: no new offer today. */
  added(key: string): Promise<Saved> {
    return this.#write((h) => answered(h, null), key);
  }

  /** Not now: put off for two weeks, and two in a week pause offers for two. */
  notNow(key: string): Promise<Saved> {
    return this.#write((h) => answered(h, key), key);
  }

  /** Never: final, on every device. */
  async never(key: string): Promise<Saved> {
    this.#ensure();
    this.gone = [...this.gone, key];
    const first = await navPrefs.dismiss(key);
    if (first.from === 'refused') {
      this.gone = this.gone.filter((k) => k !== key);
      return first;
    }
    void send(answered(this.held, null)).then((s) => {
      if (s.from === 'kept') this.held = answered(this.held, null);
    });
    return first;
  }

  /** Forget what BrainDog learned from my use. */
  forget(): Promise<Saved> {
    return this.#write((h) => forgotten(h), null);
  }

  async #write(make: Held | ((held: Held) => Held), key: string | null): Promise<Saved> {
    this.#ensure();
    const next = typeof make === 'function' ? make(this.held) : make;
    const before = this.held;
    this.held = next;
    if (key !== null) this.gone = [...this.gone, key];
    const saved = await send(next);
    if (saved.from === 'refused') {
      this.held = before;
      if (key !== null) this.gone = this.gone.filter((k) => k !== key);
    }
    return saved;
  }
}

/** The tab's one copy. */
export const widgetHeld = new WidgetHeld();
