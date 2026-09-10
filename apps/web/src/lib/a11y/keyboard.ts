/**
 * The soft keyboard's height, written to `--kb`.
 *
 * `--kb` WAS DECLARED, READ, AND WRITTEN BY NOTHING. `packages/skin/tokens.css` declares
 * `--kb: 0px`, `Sheet.svelte` subtracts it and its own header says the value "is read from
 * `visualViewport`", and a search of `apps/*` and `packages/*` for the name found one declaration
 * and one reader. So `calc(88dvh - var(--kb))` has always subtracted zero, and the sentence in the
 * sheet's header described a file that did not exist.
 *
 * What that cost, on a 390x844 phone with the keyboard up (about 336px): the sheet is 743px tall
 * inside 508px of visible viewport, so the footer and its submit button sit underneath the
 * keyboard on every create and every edit in the product.
 *
 * `visualViewport` IS THE ONLY WAY TO LEARN THE NUMBER. iOS fires no keyboard event and does not
 * move `window.innerHeight` when the keyboard opens: the LAYOUT viewport is unchanged and only the
 * VISUAL viewport shrinks, which is also why a `position: fixed` panel stays pinned to a bottom
 * edge that is no longer on screen. Both events are needed and neither is enough: `resize` fires
 * as the keyboard animates in and out, and `scroll` fires when Safari slides the visual viewport
 * up to keep the caret in sight, which changes `offsetTop` without changing `height`.
 *
 * NO RUNES IN HERE, and that is why this is a plain `.ts` beside `keys.svelte.ts` rather than a
 * second `.svelte.ts`. A module that uses runes cannot be loaded by `node --test`, and the whole
 * value of this one is that a test can drive it with a viewport it owns instead of a real phone.
 * The caller starts it and is handed the way to stop it, which is the shape an `$effect` wants.
 */

/**
 * A URL BAR IS NOT A KEYBOARD, and both shrink the visual viewport.
 *
 * iOS collapses its toolbar by roughly 50px as you scroll and Android Chrome by roughly 56px.
 * Either would otherwise read as a keyboard and lift every sheet in the product off the bottom of
 * the screen for no reason, on the gesture people make most. The smallest soft keyboard on a phone
 * is around 200px, so the floor goes between the two and close to the noise rather than halfway:
 * a keyboard 80px tall does not exist, and a toolbar 80px tall does not either.
 */
const FLOOR_PX = 80;

/** The part of `VisualViewport` this reads. */
interface Viewport {
  height: number;
  offsetTop: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** The part of the root element this writes. */
interface Root {
  style: {
    setProperty(name: string, value: string): void;
    removeProperty(name: string): void;
  };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * The part of `Window` this needs.
 *
 * Narrow on purpose, so the test drives a viewport it owns rather than a global it has to fake in
 * place. The real `Window` has to fit it, which `keyboard.test.ts` asserts at the type level: a
 * structural shape the browser's own type does not satisfy is a test double pretending to be an
 * API.
 */
export interface KeyboardHost {
  innerHeight: number;
  visualViewport: Viewport | null;
  document: { documentElement: Root };
}

/**
 * Start writing `--kb`, and hand back the way to stop.
 *
 * Idempotent in both directions: stopping removes the property rather than setting it to zero, so
 * the value the page falls back to is the token's own `--kb: 0px` in `tokens.css` and not a second
 * copy of the default written somewhere a theme cannot reach.
 */
export function watchKeyboard(host: KeyboardHost): () => void {
  const root = host.document.documentElement;

  const clear = (): void => {
    root.style.removeProperty('--kb');
    root.removeAttribute('data-kb');
  };

  /* A DESKTOP BROWSER OLD ENOUGH TO LACK IT STILL HAS TO RUN THE APP. Returning the stopper rather
     than a different empty function keeps one exit: a caller tears down the same way whether or not
     there was ever anything to tear down. */
  const view = host.visualViewport;
  if (!view) return clear;

  const write = (): void => {
    /* `offsetTop` AND NOT JUST `height`. Safari slides the visual viewport up under the layout
       viewport to keep the caret visible, and during that slide the hidden strip at the bottom is
       taller than the height difference alone by exactly how far it has slid. Reading height on its
       own reports the keyboard as shorter than it is, which is the failure that looks like the fix
       working and is worse than no fix. */
    const hidden = host.innerHeight - (view.height + view.offsetTop);
    /* Written as "not greater than" so a NaN from a viewport mid-teardown clears rather than
       writing `NaNpx`, which is an invalid declaration and therefore an inherited one. */
    if (!(hidden > FLOOR_PX)) {
      clear();
      return;
    }
    root.style.setProperty('--kb', `${Math.round(hidden)}px`);
    /* AND AN ATTRIBUTE, BECAUSE ONE OF THE READERS HAS TO DISAPPEAR RATHER THAN MOVE. The tab bar
       owns the bottom of a phone and the keyboard takes it; there is no length that expresses
       "this bar is not on screen right now", so `html[data-kb]` is how it stands down while `--kb`
       is how everything that stays gets out of the way. */
    root.setAttribute('data-kb', '');
  };

  view.addEventListener('resize', write);
  view.addEventListener('scroll', write);
  write();

  return (): void => {
    view.removeEventListener('resize', write);
    view.removeEventListener('scroll', write);
    clear();
  };
}
