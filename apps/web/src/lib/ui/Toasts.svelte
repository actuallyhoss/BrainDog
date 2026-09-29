<!--
  The toast stack, bottom-left of the work (SYSTEM §6): one glass-strong pill, the verb, the thing, and Undo with its key.

  Not bottom-right, and not centred. The launcher owns the bottom-right corner on the shapes that have one, and a toast
  that lands on top of it covers the one control that is on every surface; a centred toast covers the work.
  Bottom-left, beside the rail, is the corner with nothing in it, on the side the eye returns to after reading a row.

  THE VERB LEADS. A receipt that offers an undo is "Archived obligations#4", the past tense and then the thing, so the
  verb is set at 600 and the thing after it at the body's weight. A toast that only reports is a sentence and is drawn
  as one.

  THE KEY ON UNDO IS THE ONE THAT WORKS: `⌘Z` (Ctrl+Z off a Mac, which `Kbd` says), the stack's own chord in the
  layout. SYSTEM draws a bare `z`, and no such binding exists.

  ONE live region for the whole stack, and it is `polite`. `role="alert"` for "archived
  obligations#4" interrupts whatever a screen-reader user was reading in order to tell them about
  something they just did (13 §7).
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';
  import { toasts } from './toast.svelte.ts';

  /** The newest is nearest the corner, so the stack grows away from the thumb rather than under it. */
  const stack = $derived([...toasts.items].reverse());

  /* A GLYPH, NOT A DOT. The dot was a bare disc of the intent colour, which is the one thing the
     product forbids everywhere else: `Chip` refuses to render an intent without a glyph, and the
     renderer emits one for every tone it draws. The toast stack was the single place colour
     carried the meaning on its own (13 §2.3), and it did it because the icon set had `check` and
     `alert` but nothing for `bad` or `info`. It has both now. */
  const GLYPH = { good: 'check', warn: 'alert', bad: 'ban' } as const;

  /** A receipt's verb and the thing it was done to; `null` for a toast that only reports. */
  const parts = (text: string): [string, string] | null => {
    const at = text.indexOf(' ');
    return at > 0 ? [text.slice(0, at), text.slice(at)] : null;
  };
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
    {@const said = toast.undo ? parts(toast.text) : null}
    <div class="toast" data-intent={toast.intent}>
      {#if toast.intent}
        <span class="tone" aria-hidden="true"><Icon name={GLYPH[toast.intent]} size="s" /></span>
      {/if}
      <span class="text">{#if said}<span class="verb">{said[0]}</span>{said[1]}{:else}{toast.text}{/if}</span>
      {#if toast.undo}
        <button type="button" class="undo tap" onclick={() => toasts.run(toast.id)}>{copy.undo}<Kbd keys="⌘Z" /></button>
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
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--inset) * 2);
    inset-inline-start: calc(var(--inset) + var(--rail) + 20px);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    max-inline-size: min(480px, calc(100vw - var(--sp-6)));
    pointer-events: none;
  }

  .stack > :global(*) {
    pointer-events: auto;
  }

  /**
   * ONE GLASS-STRONG PILL, AT LEVEL 2 (SYSTEM §6): the stack floats over whatever the work is showing, and
   * `glass-strong` is the fill legible over busy content. The filter is on the pill itself, which holds no fixed
   * descendant. The start pads a full step and the end half of one, so the text clears the curve and the close glyph
   * sits inside it.
   */
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    padding-block: var(--sp-1);
    padding-inline: var(--sp-4) var(--sp-1);
    background: var(--glass-strong);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    color: var(--ink);
    font-size: var(--t-base);
    /* Swift out, as everything arriving (SYSTEM §8): no overshoot on a report. */
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
    color: var(--ink2);
  }

  .verb {
    color: var(--ink);
    font-weight: 600;
  }

  /* THE UNDO IS THE LOUD THING IN THE TOAST: the word in ink at 600 and its key cap, on the pill's own glass rather
     than a second surface on it. A 44px target on a thumb (`tap`), because it is the only control in the product that
     gives you your data back, on a countdown. */
  .undo {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-block-size: 32px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
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

  /* A THUMB READS THE TOAST AND ITS UNDO AT THE CONTROL SIZE, 16 (design DSN-2), and has no key to press. */
  @media (pointer: coarse) {
    .toast {
      font-size: var(--t-md);
    }

    .undo :global(.kbd-run) {
      display: none;
    }
  }

  /* No rail below 900px, and the floating tab bar owns the bottom edge. */
  @media (width < 900px) {
    .stack {
      inset-inline: var(--inset);
      /* ABOVE THE FLOATING BAR: `--tabbar` is the bar and the home indicator, and the bar floats `--inset` over that. */
      inset-block-end: calc(var(--tabbar) + var(--inset) * 2);
      align-items: stretch;
      max-inline-size: none;
    }

    /* AND WITH THE KEYBOARD UP IT SITS WHERE THE BAR WAS. `html[data-kb]` has just removed the
       bar, so the height this clears is not there any more and the keyboard is. */
    :global(html[data-kb]) .stack {
      inset-block-end: calc(var(--kb) + var(--sp-3));
    }
  }

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .toast {
      border: 1px solid CanvasText;
    }
  }
</style>
