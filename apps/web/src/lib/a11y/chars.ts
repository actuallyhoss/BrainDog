/**
 * The character-keys switch, in a module a test runner can load.
 *
 * IT IS NOT IN `keys.svelte.ts` for the same reason the glyph data is not in `Icon.svelte`: that
 * file uses runes, so anything importing it dies on `$state is not defined` under `node --test`.
 * The one accessibility claim this app makes is the last thing that should be untestable.
 */

import * as pref from '../pref.ts';

/**
 * Whether this keystroke is one the reader has switched off.
 *
 * THE SWITCH EXISTED AND NOTHING READ IT. `Character keys: Off` wrote its preference to the cookie
 * and both dispatchers went on acting on bare letters, so the one mechanism this file names as the
 * app's WCAG 2.1.4 conformance — GitHub's checkbox, the only shipped one found across eleven
 * precedents — was a switch connected to nothing. An accessibility claim that is a no-op is worse
 * than an absent one: somebody who needs it turns it on, is not believed by the software, and has no
 * way to tell that from their own mistake.
 *
 * A SINGLE CHARACTER IS THE WHOLE NAMESPACE, punctuation and digits included: 2.1.4 is about
 * shortcuts *"implemented using only letter (including upper- and lower-case letters), punctuation,
 * number, or symbol characters"*, so `/`, `?` and `g` go with `j` and `k`. Shift is not a modifier
 * for this purpose — `Shift+Y` is still one character — and every real chord keeps working, which
 * is what makes the switch cost nothing: `⌘K` still opens the palette, `Shift+F10` still opens the
 * row menu, and the arrows still move.
 *
 * IT READS THE COOKIE EACH TIME rather than caching. The alternative is a module-level copy that
 * goes stale the moment the switch is changed on another route or in another tab, which is the shape
 * of bug that makes a preference look like it did not save. One regex over a hundred bytes per
 * keystroke is not a cost worth a staleness bug.
 */
export const silenced = (e: KeyboardEvent): boolean =>
  e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && pref.read().chars === false;
