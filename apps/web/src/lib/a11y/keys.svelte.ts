/**
 * The keymap: a registry the ONE dispatcher consults. No screen adds a listener of its own, and no
 * screen binds a key outside this file.
 *
 * That is what makes two otherwise expensive promises cheap: a `Character keys: off` switch that
 * silences the whole bare-letter namespace while every modifier chord keeps working, and a `?` sheet
 * that documents the bindings by READING them, so it cannot drift from what is bound (19 §4).
 *
 * THE ARCHITECTURAL DECISION, and everything else follows from it:
 *
 *   Every bare single-letter shortcut lives inside a focused `role="grid"`. The only document-level
 *   bare keys are `g`, `/` and `?`.
 *
 * It buys two things at once. It satisfies WCAG 2.1.4's focus exception with no settings toggle.
 * And it solves the screen-reader collision MECHANICALLY: NVDA and JAWS reserve nearly the whole
 * alphabet as browse-mode quick-nav keys, but a composite widget flips them into focus mode — the
 * mode where the H key puts the letter H in a text box. A grid is therefore the only place bare
 * letters are safe, and it is exactly where they are wanted.
 */

/* `silenced` lives next door in a plain `.ts` and is re-exported here, for the reason `icons.ts`
   does the same: this file uses runes, so an import chain that reaches it cannot be loaded by
   `node --test` — and the one accessibility claim in this app is the last thing that should be
   untestable. Imported AND re-exported rather than passed through, so the name is in scope here
   too. */
import { silenced } from './chars.ts';

export { silenced };

/* AND THE REGISTRY ITSELF IS NEXT DOOR, in `bindings.ts`, for exactly the reason `silenced` is:
   this file uses runes, so nothing loadable by `node --test` could import it, and the list of
   chords the browser owns had no reader, no importer and no test. Re-exported rather than passed
   through, so every screen's existing import of this file still resolves. */
export { BINDINGS, NEVER_BIND, SCOPE_ORDER, SCROLL_KEYS } from './bindings.ts';
export type { Binding, Scope } from './bindings.ts';


/** The ONE test. No screen implements its own, and the rule it encodes is never relaxed. */
export function typing(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

/** `lockScroll` is a COUNTER, not a boolean, so two overlays closing in the wrong order do not
    unlock early. `overlaid() > 0` silences every hotkey except close. */
class Overlays {
  #count = $state(0);
  get depth() {
    return this.#count;
  }
  open() {
    this.#count++;
    document.documentElement.style.overflow = 'hidden';
  }
  close() {
    this.#count = Math.max(0, this.#count - 1);
    if (this.#count === 0) document.documentElement.style.overflow = '';
  }
}

export const overlays = new Overlays();

/** The `g` prefix is armed for one second, then expires. `g w` is a chord, not a mode. */
export class GoPrefix {
  armed = $state(false);
  #timer: ReturnType<typeof setTimeout> | undefined;
  arm() {
    this.armed = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => (this.armed = false), 1000);
  }
  disarm() {
    this.armed = false;
    clearTimeout(this.#timer);
  }
}
