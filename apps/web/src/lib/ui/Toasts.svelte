<!--
  The toast stack, bottom centre of the work: one glass-strong card, the verb, the thing, and Undo with its key.

  BOTTOM CENTRE OF THE WORK, 24 UP, and the work is what the shell leaves beside the rail: the stack's start edge is
  the rail card's own end edge, at the rail's full width or its narrow one, and nothing at all on the top bar and menu
  shapes, which have no rail. Its end edge is the docked panel's, so a toast never lands on the panel either. It was
  bottom-left beside the rail, which put it under the eye only on the shapes that have a rail, and at the full rail's
  width whatever the rail was drawn at.

  THE VERB LEADS. A receipt that offers an undo is "Archived obligations#4", the past tense and then the thing, so the
  verb is set at 600 and the thing after it at the body's weight. A toast that only reports is a sentence and is drawn
  as one.

  THE KEY ON UNDO IS THE ONE THAT WORKS: `⌘Z` (Ctrl+Z off a Mac, which `Kbd` says), the stack's own chord in the
  layout. The design system draws a bare `z`, and no such binding exists.

  ONE live region for the whole stack, and it is `polite`. `role="alert"` for "archived
  obligations#4" interrupts whatever a screen-reader user was reading in order to tell them about
  something they just did (13 §7).

  A TOAST LEAVES AS IT CAME. It rises 8px into place over the arriving duration and fades as it drops back 4px over the
  leaving one, which is shorter. The stack keeps a toast that has gone for as long as its exit plays, inert and hidden
  from the live region, and then lets it go (`settled` in `panel.ts`); the store is not asked to wait. Reduced motion
  fades. The countdown pauses while the pointer is over the stack or focus is in it (`toast.svelte.ts`).
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';
  import { settled } from './panel.ts';
  import { toasts, type Toast } from './toast.svelte.ts';

  /**
   * WHAT THE STACK DRAWS: every live toast, and each one that has just gone, for its exit. The newest first, which the
   * column draws at the top, so the stack grows up and away from the thumb rather than under it. A toast's id is the
   * order it was pushed in, so a toast that has gone keeps its place among the live ones while it leaves.
   */
  let drawn = $state.raw<{ toast: Toast; gone: boolean }[]>([]);
  let stack = $state<HTMLElement>();

  $effect(() => {
    const live = toasts.items;
    untrack(() => {
      const ids = new Set(live.map((t) => t.id));
      const left = drawn.filter((d) => !ids.has(d.toast.id));
      const fresh = left.filter((d) => !d.gone).map((d) => d.toast.id);
      drawn = [...live.map((toast) => ({ toast, gone: false })), ...left.map((d) => ({ toast: d.toast, gone: true }))].sort(
        (a, b) => b.toast.id - a.toast.id,
      );
      if (fresh.length > 0) void tick().then(() => fresh.forEach(letGo));
    });
  });

  /** Once a toast that has gone has played its exit, it leaves the stack. */
  function letGo(id: number) {
    const forget = () => (drawn = drawn.filter((d) => d.toast.id !== id));
    const el = stack?.querySelector(`[data-toast="${id}"]`);
    if (el) settled(el, forget);
    else forget();
  }

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
  bind:this={stack}
  class="stack"
  role="status"
  aria-live="polite"
  aria-label={copy.toasts}
  onmouseenter={() => toasts.hold()}
  onmouseleave={() => toasts.release()}
  onfocusin={() => toasts.hold()}
  onfocusout={() => toasts.release()}
>
  {#each drawn as { toast, gone } (toast.id)}
    {@const said = toast.undo ? parts(toast.text) : null}
    <div
      class="toast"
      data-intent={toast.intent}
      data-toast={toast.id}
      data-leaving={gone ? '' : undefined}
      inert={gone}
      aria-hidden={gone ? 'true' : undefined}
    >
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
  /**
   * THE WORK'S WIDTH, between what the rail takes at the start and what the docked panel takes at the end, with the
   * toasts centred in it. `--toast-start` is nothing until the shell says it draws a rail; the narrow rail's width is
   * `Sidebar.svelte`'s `--rail-icons`, read where a root declares it and worked out the same way where none does.
   *
   * `--dock-w` WITH ITS FALLBACK, because only `Panel.svelte`'s stylesheet declares it, and a screen that draws no
   * panel has not loaded that sheet. An unset variable throws out the whole `inset-inline`, both edges, and the stack
   * fell back to where it sits in the page: measured at 1440 on a screen with no panel, the toast was 16 from the
   * window's edge, on top of the rail card.
   */
  .stack {
    --toast-start: 0px;

    position: fixed;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--sp-5));
    inset-inline: var(--toast-start) var(--dock-w, 0px);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding-inline: var(--sp-4);
    pointer-events: none;
  }

  :global(:root:has(.shell[data-shape='rail'])) .stack {
    --toast-start: calc(var(--inset) + var(--rail));
  }

  :global(:root:has(.shell[data-shape='rail'][data-rail='icons'])) .stack {
    --toast-start: calc(var(--inset) + var(--rail-icons, calc(var(--tap) + var(--sp-2) * 2)));
  }

  .stack > :global(*) {
    pointer-events: auto;
  }

  /**
   * ONE GLASS-STRONG CARD, AT LEVEL 2, RADIUS 20: the stack floats over whatever the work is showing, and
   * `glass-strong` is the fill legible over busy content. The filter is on the card itself, which holds no fixed
   * descendant, and the motion is a transition on the card and never an animation on the stack, so nothing that holds
   * the glass is ever left filled. The start pads a full step and the end half of one, so the text clears the curve
   * and the close glyph sits inside it.
   */
  .toast {
    /* Where an arrival starts and a leaving ends, and the opacity an arrival starts at. */
    --toast-from: translateY(8px);
    --toast-gone: translateY(4px);
    --toast-from-opacity: 1;

    display: flex;
    align-items: center;
    gap: var(--sp-3);
    max-inline-size: min(480px, 100%);
    min-block-size: 44px;
    padding-block: var(--sp-1);
    padding-inline: var(--sp-4) var(--sp-1);
    background: var(--glass-strong);
    border-radius: 20px;
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    color: var(--ink);
    font-size: var(--t-base);
    /* Swift out, as everything arriving: no overshoot on a report. */
    transition-property: transform, opacity;
    transition-duration: var(--d-enter);
    transition-timing-function: var(--ease-out);
  }

  /* No `opacity: 0` in a start state, see Sheet.svelte. A toast that never fades in is still a
     toast; a toast stuck at zero opacity is a report nobody got. Reduced motion fades it in from
     a state that is still readable. */
  @starting-style {
    .toast {
      transform: var(--toast-from);
      opacity: var(--toast-from-opacity);
    }
  }

  /* GONE: it drops back 4px as it fades, in the leaving duration, and nothing on it can be pressed. */
  .toast[data-leaving] {
    transform: var(--toast-gone);
    opacity: 0;
    pointer-events: none;
    transition-duration: var(--d-exit);
    transition-timing-function: var(--ease-in);
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      --toast-from: none;
      --toast-gone: none;
      --toast-from-opacity: 0.6;
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

  /* THE UNDO IS THE LOUD THING IN THE TOAST: the word in ink at 600 and its key cap, on the card's own glass rather
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

  /* A THUMB READS THE TOAST AND ITS UNDO AT THE CONTROL SIZE, 16, and has no key to press. */
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
      padding-inline: 0;
    }

    .toast {
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
