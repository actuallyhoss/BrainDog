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

  IT NEVER DRAWS UNDER A SHEET. A sheet, a palette or a menu's action sheet sits in the top layer over a scrim, which no
  `z-index` reaches, and a toast pushed under one was a dimmed receipt at the edge the sheet stands on, its Undo out of
  reach and its countdown running. So while anything is open over the window (the overlay lock, or a scrim laid in
  `panel.ts`) the stack HOLDS: its toasts drop back out of sight and their countdown stops, and when the last sheet has
  gone they rise into place with their whole time still to run. `⌘Z` reaches the newest Undo meanwhile, as it always
  does. Holding rather than raising, because a toast raised over a phone sheet lands on the sheet's own footer, which
  is where its one primary sits. A held toast is inert as well as out of sight, so Tab never lands on an Undo nobody
  can see.

  EXCEPT A FAILURE. "Couldn't save" said while a sheet is up is the one toast that must not wait for the sheet to go,
  so a `bad` one is not held: the stack is lifted into the top layer above the newest sheet for as long as one is
  showing (a manual popover, raised again over each sheet that opens after it), and the receipts beside it stay held.
  Lifted, it stands on the scrim beside the sheet, or at the top on a phone, never on the sheet's footer.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { overlays } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy/frame.ts';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';
  import { scrims, settled } from './panel.ts';
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

  /* ── held under a sheet ─────────────────────────────────────────────── */

  let scrimmed = $state(false);
  $effect(() => scrims.watch((up) => (scrimmed = up)));

  /** Whether anything is open over the window, which is when the stack holds. */
  const covered = $derived(overlays.depth > 0 || scrimmed);

  /**
   * THE COUNTDOWN HAS THREE REASONS TO WAIT, and `toasts.held` is one flag: the pointer on the stack, focus in it, and a
   * sheet over it. So each is kept here, and the countdown starts again only when none of them is left. Not on the
   * first draw, which has nothing to hand back.
   */
  let pointed = false;
  let focused = false;
  let was = false;

  $effect(() => {
    const now = covered;
    untrack(() => {
      if (now === was) return;
      was = now;
      if (now) toasts.hold();
      else if (!pointed && !focused) toasts.release();
    });
  });

  function hold(why: 'pointed' | 'focused') {
    if (why === 'pointed') pointed = true;
    else focused = true;
    toasts.hold();
  }

  function free(why: 'pointed' | 'focused') {
    if (why === 'pointed') pointed = false;
    else focused = false;
    if (!pointed && !focused && !covered) toasts.release();
  }

  /** Whether a toast is a failure, which is never held under a sheet. */
  const failed = (t: Toast): boolean => t.intent === 'bad';

  /**
   * THE STACK IN THE TOP LAYER WHILE A FAILURE IS SHOWING UNDER A SHEET, and out of it otherwise: a top-layer element
   * ignores `z-index`, so the stack is put there only for as long as it has to be over something. Shown again (hidden
   * and shown in one task, which draws nothing between) whenever another overlay opens, because the top layer is
   * ordered by who was shown last. A browser without popovers keeps the stack where it was.
   */
  $effect(() => {
    const el = stack;
    const lift = covered && drawn.some((d) => !d.gone && failed(d.toast));
    void overlays.depth;
    void scrimmed;
    if (!el || typeof el.showPopover !== 'function') return;
    untrack(() => {
      if (el.matches(':popover-open')) el.hidePopover();
      if (lift) {
        el.popover = 'manual';
        el.showPopover();
      } else el.removeAttribute('popover');
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
  data-covered={covered ? '' : undefined}
  onmouseenter={() => hold('pointed')}
  onmouseleave={() => free('pointed')}
  onfocusin={() => hold('focused')}
  onfocusout={() => free('focused')}
>
  {#each drawn as { toast, gone } (toast.id)}
    {@const said = toast.undo ? parts(toast.text) : null}
    {@const held = covered && !failed(toast)}
    <div
      class="toast"
      data-intent={toast.intent}
      data-toast={toast.id}
      data-leaving={gone ? '' : undefined}
      data-held={held ? '' : undefined}
      inert={gone || held}
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
   * toasts centred in it. `--toast-start` is nothing until the shell says it draws a rail, and then the rail's width as
   * `Sidebar.svelte` declares it on the root (`--rail-w`), so the stack follows the rail at either width.
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
    /* WHAT A POPOVER IS GIVEN BY THE BROWSER, taken back, so lifted into the top layer the stack stands where it did:
       no box, no centring margin, no fit-content size, and no top edge pulling it to the window's top. */
    inset-block-start: auto;
    inline-size: auto;
    block-size: auto;
    margin: 0;
    padding-block: 0;
    overflow: visible;
    background: none;
    border: 0;
    color: inherit;
  }

  /* THE RAIL'S WIDTH AS THE RAIL SAYS IT, `--rail-w` (`Sidebar.svelte`), at whichever of its widths it is drawn. */
  :global(:root:has(.shell[data-shape='rail'])) .stack {
    --toast-start: calc(var(--inset) + var(--rail-w, var(--rail)));
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

  /* SAFARI'S GLASS, in a block of its own and reading the skin's one value, for the reason `Panel.svelte` gives. */
  @supports (-webkit-backdrop-filter: none) {
    .toast {
      -webkit-backdrop-filter: var(--glass-blur);
    }
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

  /* LIFTED OVER A SHEET, A FAILURE STANDS ON THE SCRIM BESIDE IT and never on the sheet, whose footer holds its primary:
     clear of the widest drawer at the end edge (`Sheet.svelte`, 480 and its inset), from the window's own inset, since
     the scrim covers the rail too. On a phone it goes to the top, below (`popover` is on the stack only while lifted). */
  .stack:global([popover]) {
    inset-inline: var(--inset) calc(min(480px, 100vw - 2 * var(--inset)) + 2 * var(--inset));
  }

  /* HELD UNDER A SHEET: every toast but a failure drops back as a leaving one does, inert. When the sheet has gone they
     rise into place on the arriving step, from where they went. */
  .toast[data-held] {
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

  /* THE UNDO IS THE ONE THING TO PRESS IN THE TOAST, AND IT LOOKS PRESSABLE: the word in ink at 600 and its key cap,
     on a soft pill of the wash, the quiet control's own fill, so it reads as a control and not as a bold word in a
     sentence. Never the ink fill: the receipt is not the screen's primary. A 44px target on a thumb (`tap`), because
     it is the only control in the product that gives you your data back, on a countdown. */
  .undo {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-block-size: 32px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A THUMB SEES THE PRESS: the pill deepens to the held wash while it is down, as a quiet button does. */
  .undo:active {
    background: var(--hold-wash);
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
      background: var(--hold-wash);
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

    /* A FAILURE LIFTED OVER A PHONE'S SHEET STANDS AT THE TOP, on the scrim the sheet leaves above it, and not over the
       sheet's footer, where its one primary sits. With the keyboard up as well. */
    .stack:global([popover]),
    :global(html[data-kb]) .stack:global([popover]) {
      inset-inline: var(--inset);
      inset-block: calc(env(safe-area-inset-top) + var(--inset)) auto;
    }
  }

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .toast {
      border: 1px solid CanvasText;
    }
  }
</style>
