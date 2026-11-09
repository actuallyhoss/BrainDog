/**
 * The hover that changes a picture (`PictureChange.svelte`), loaded the first time a screen hands a mark or a face a row
 * to change, never with the frame: Today and the shell draw marks and faces nobody changes there, and carry none of it.
 * Until it arrives the mark is drawn as it always was, the same size, so nothing moves when it is wrapped.
 */

import type { Component, Snippet } from 'svelte';

import type { PictureTarget } from './picture.ts';

type Changer = Component<{ target: PictureTarget; big?: boolean | undefined; children: Snippet }>;

class Held {
  /** The hover, once loaded. */
  component = $state.raw<Changer | null>(null);
  #asked = false;

  /** Loads the hover once; a load that failed is asked again by the next mark that wants it. */
  want(): void {
    if (this.#asked) return;
    this.#asked = true;
    void import('./PictureChange.svelte')
      .then((m) => (this.component = m.default as unknown as Changer))
      .catch(() => (this.#asked = false));
  }
}

export const changer = new Held();
