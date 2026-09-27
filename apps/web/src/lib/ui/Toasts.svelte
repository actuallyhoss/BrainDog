<!--
  The toast stack, bottom-LEFT.

  Not bottom-right, and not centred. The launcher owns the bottom-right corner of every screen, and
  a toast that lands on top of it covers the one control that is on every surface; a centred toast
  covers the work. Bottom-left is the corner with nothing in it, on the side the eye returns to
  after reading a row.

  ONE live region for the whole stack, and it is `polite`. `role="alert"` for "archived
  obligations#4" interrupts whatever a screen-reader user was reading in order to tell them about
  something they just did (13 §7).
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import { toasts } from './toast.svelte.ts';

  /** The newest is nearest the corner, so the stack grows away from the thumb rather than under it. */
  const stack = $derived([...toasts.items].reverse());

  /* A GLYPH, NOT A DOT. The dot was a bare disc of the intent colour, which is the one thing the
     product forbids everywhere else: `Chip` refuses to render an intent without a glyph, and the
     renderer emits one for every tone it draws. The toast stack was the single place colour
     carried the meaning on its own (13 §2.3), and it did it because the icon set had `check` and
     `alert` but nothing for `bad` or `info`. It has both now. */
  const GLYPH = { good: 'check', warn: 'alert', bad: 'ban' } as const;
</script>

<div
  class="stack"
  role="status"
  aria-live="polite"
  aria-label={copy.toasts}
  onmouseenter={() => toasts.hold()}
  onmouseleave={() => toasts.release()}
  onfocusin={() => toasts.hold()}
  onfocusout={() => toasts.release()}
>
  {#each stack as toast (toast.id)}
    <div class="toast" data-intent={toast.intent}>
      {#if toast.intent}
        <span class="tone" aria-hidden="true"><Icon name={GLYPH[toast.intent]} size="s" /></span>
      {/if}
      <span class="text">{toast.text}</span>
      {#if toast.undo}
        <button type="button" class="undo" onclick={() => toasts.run(toast.id)}>{copy.undo}</button>
      {/if}
      <button type="button" class="close tap" onclick={() => toasts.dismiss(toast.id)} aria-label={copy.close}>
        <Icon name="close" size="s" />
      </button>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    inset-block-end: var(--sp-5);
    inset-inline-start: calc(var(--rail) + var(--sp-5));
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: min(420px, calc(100vw - var(--sp-6)));
    pointer-events: none;
  }

  .stack > :global(*) {
    pointer-events: auto;
  }

  /* Over the page, so it is allowed `--e2`: s1, a hairline, no accent (DESIGN-BRIEF 4.9).

     A PILL, because a toast is the answer to something you pressed and speaks in the same shape
     (design D-2). The start pads a full step and the end half of one, so the text clears the curve
     and the close glyph sits inside it. */
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block: var(--sp-2);
    padding-inline: var(--sp-5) var(--sp-2);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    box-shadow: var(--e2);
    color: var(--ink);
    font-size: var(--t-base);
    /* Ease-out, as the sheet: no overshoot on a report. */
    animation: toast-in var(--d-enter) var(--ease-out);
  }

  /* No `opacity: 0` in a start state — see Sheet.svelte. A toast that never fades in is still a
     toast; a toast stuck at zero opacity is a report nobody got. */
  @keyframes toast-in {
    from {
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      animation: none;
    }
  }

  .tone {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--tone, var(--dim));
  }

  .text {
    flex: 1;
    min-inline-size: 0;
  }

  /* The undo is the loud thing in the toast: a secondary button in ink, not an accent link, drawn
     as `Button`'s secondary is, a pill with an `--edge` border. */
  /* AND IT IS A 44px TARGET ON A THUMB. It was 28: the only control in the product that gives you
     your data back, on a countdown, at two thirds of the floor. */
  .undo {
    flex: none;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-4);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  /* `tap` EXPANDS THE HIT AREA WITHOUT MOVING THE GLYPH. `a11y.css`'s `.tap::before` grows a small
     control to `--tap` in both axes, which is what keeps a 28px ✕ visually right and 44px to a
     thumb — the same trick the palette launcher uses. */
  .close {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    flex: none;
    background: none;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--dim);
    cursor: pointer;
  }

  /* HOVER ONLY WHERE THERE IS ONE: a phone keeps `:hover` on the last thing tapped. */
  @media (hover: hover) and (pointer: fine) {
    .undo:hover {
      background: var(--hover-wash);
    }

    .close:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* A THUMB READS THE TOAST AND ITS UNDO AT THE CONTROL SIZE, 16 (design DSN-2). */
  @media (pointer: coarse) {
    .toast {
      font-size: var(--t-md);
    }
  }

  /* No rail below 900px, and the tab bar owns the bottom edge. */
  @media (width < 900px) {
    .stack {
      inset-inline: var(--sp-3);
      /* THE TAB BAR PAYS `env(safe-area-inset-bottom)` AND THIS DID NOT. On a phone with a home
         indicator the bar is 91px tall and this sat 68px up — 23px of toast over the tab labels,
         and `--z-toast` beats `--z-sheet`, so it painted on top of them. The inset is the same
         number in both places or the two disagree by exactly the height of the indicator. */
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
      max-inline-size: none;
    }

    /* AND WITH THE KEYBOARD UP IT SITS WHERE THE BAR WAS. `html[data-kb]` has just removed the
       bar, so the height this clears is not there any more and the keyboard is. */
    :global(html[data-kb]) .stack {
      inset-block-end: calc(var(--kb) + var(--sp-3));
    }
  }
</style>
