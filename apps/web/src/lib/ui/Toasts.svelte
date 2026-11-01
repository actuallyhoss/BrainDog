<!--
  The toast stack: an inverted bar, the sentence, and Undo with its key.

  AN INVERTED BAR, because with no shadows a white card on a white tile is not there: `--toast` (near ink in light, a
  lifted slate in dark) with the words in `--on-toast` at 14/500, radius 8, 48 tall at least, 12 by 16 in, 480 wide at
  most. The action is a text button in the same colour at 600 with a 1px underline, so no second red is spent on it.

  AT THE BOTTOM START OF THE WORK, 24 IN AND 24 UP, after the rail where the shell draws one and before the docked panel
  where one is open, so a toast never lands on either. On a phone it is centred above the tab bar, 12 above it and 12
  from each side.

  THE WORDS SAY WHAT HAPPENED, BY NAME, IN QUOTES, NEVER AN ID: "Archived “Invoice 2026-041: brand system”." An Undo is
  drawn only when the change is not on screen; a row's own "Put back" is that change's undo, and the toast then keeps
  the undo on `⌘Z` without drawing it (`offer: false` in `toast.svelte.ts`). Five seconds for a report, eight with an
  action, paused while the pointer or focus is on the stack.

  HELD STILL THROUGH A PAGE CHANGE: the stack is named `toasts` for the view transition, so a toast that is up while
  the work cross-fades does not blink with it.

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
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { overlays } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy/frame.ts';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';
  import { scrims, settled } from './panel.ts';
  import { toasts, type Toast } from './toast.svelte.ts';
  import { ms, still } from './motion.ts';

  /* THE OTHERS CLOSE THE GAP (skills pass, 2 Nov): when one toast in a stack has gone, the ones above it dropped into its
     place in one frame. They slide there over `--d-rows` on the out curve; chrome, so no spring. At once under reduced
     motion. */
  const closeUp = () => ({ duration: still() ? 0 : ms('--d-rows', 180), easing: cubicOut });

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
    {@const held = covered && !failed(toast)}
    <div
      class="toast"
      data-intent={toast.intent}
      data-toast={toast.id}
      data-leaving={gone ? '' : undefined}
      data-held={held ? '' : undefined}
      inert={gone || held}
      aria-hidden={gone ? 'true' : undefined}
      animate:flip={closeUp()}
    >
      {#if toast.intent}
        <span class="tone" aria-hidden="true"><Icon name={GLYPH[toast.intent]} size="m" /></span>
      {/if}
      <span class="text">{toast.text}</span>
      {#if toast.undo && toast.offer !== false}
        <button type="button" class="undo tap" onclick={() => toasts.run(toast.id)}>{copy.undo}<Kbd keys="⌘Z" /></button>
      {/if}
      <button type="button" class="close tap" onclick={() => toasts.dismiss(toast.id)} aria-label={copy.close}>
        <Icon name="close" size="m" />
      </button>
    </div>
  {/each}
</div>

<style>
  /**
   * THE WORK'S WIDTH, from the window's start to what the docked panel takes at the end, with the toasts at its start.
   * WHERE THE SIDEBAR OR ITS RAIL STANDS, `--toast-start` is its edge (`--toast-side`, set by the shell, AM19): a toast
   * sat over the sidebar's Usage and Settings at 1,512. With neither, the window's edge.
   *
   * `--dock-w` WITH ITS FALLBACK, because only `Panel.svelte`'s stylesheet declares it, and a screen that draws no
   * panel has not loaded that sheet. An unset variable throws out the whole `inset-inline`, both edges.
   */
  .stack {
    --toast-start: var(--toast-side, 0px);

    position: fixed;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--sp-5));
    inset-inline: var(--toast-start) var(--dock-w, 0px);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    padding-inline: var(--sp-5);
    pointer-events: none;
    view-transition-name: toasts;
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

  .stack > :global(*) {
    pointer-events: auto;
  }

  /* THE BAR. The start pads a full step and the end less, so the close glyph sits in its own square at the end. */
  .toast {
    /* Where an arrival starts and the opacity it starts at. */
    --toast-from: translateY(8px);
    --toast-from-opacity: 0;

    display: flex;
    align-items: center;
    gap: var(--sp-3);
    box-sizing: border-box;
    max-inline-size: min(480px, 100%);
    min-block-size: 48px;
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
    background: var(--toast, var(--ink));
    border-radius: var(--r-ctl);
    color: var(--on-toast, var(--tile));
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 20px;
    /* In on the arriving step and curve: no overshoot on a report. */
    transition-property: transform, opacity;
    transition-duration: var(--d-enter);
    transition-timing-function: var(--ease-out);
  }

  /* THE FIRST FRAME: 8px down and clear, so it rises and fades in. */
  @starting-style {
    .toast {
      transform: var(--toast-from);
      opacity: var(--toast-from-opacity);
    }
  }

  /* GONE: it fades where it stands, quicker than it came, and nothing on it can be pressed. */
  .toast[data-leaving] {
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

  /* HELD UNDER A SHEET: every toast but a failure fades out of sight, inert. When the sheet has gone they come back on
     the arriving step. */
  .toast[data-held] {
    opacity: 0;
    pointer-events: none;
    transition-duration: var(--d-exit);
    transition-timing-function: var(--ease-in);
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      --toast-from: none;
    }
  }

  .tone {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--on-toast, var(--tile));
  }

  .text {
    flex: 1;
    min-inline-size: 0;
  }

  /* THE ACTION IS A TEXT BUTTON in the bar's own colour at 600 with a 1px underline, and its key cap after it. A 44px
     target on a thumb (`tap`): it is the one control in the product that gives you your data back, on a countdown. */
  .undo {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--on-toast, var(--tile));
    font: inherit;
    font-weight: var(--fw-semi);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .undo :global(.kbd) {
    background: color-mix(in oklab, var(--on-toast, var(--tile)) 16%, transparent);
    color: var(--on-toast, var(--tile));
  }

  .undo:active {
    background: color-mix(in oklab, var(--on-toast, var(--tile)) 16%, transparent);
  }

  /* `tap` EXPANDS THE HIT AREA WITHOUT MOVING THE GLYPH: a 32px close to the eye, 44 to a thumb. */
  .close {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    flex: none;
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: color-mix(in oklab, var(--on-toast, var(--tile)) 72%, transparent);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* HOVER ONLY WHERE THERE IS ONE: a phone keeps `:hover` on the last thing tapped. */
  @media (hover: hover) and (pointer: fine) {
    .undo:hover,
    .close:hover {
      background: color-mix(in oklab, var(--on-toast, var(--tile)) 12%, transparent);
      color: var(--on-toast, var(--tile));
    }
  }

  /* THE FOCUS RING IN THE BAR'S OWN COLOUR, since the page's ink ring would vanish on a dark bar. */
  .undo:focus-visible,
  .close:focus-visible {
    outline: 2px solid var(--on-toast, var(--tile));
    outline-offset: -2px;
  }

  /* A THUMB READS THE TOAST AND ITS UNDO A STEP UP, AT 15, and has no key to press. */
  @media (pointer: coarse) {
    .toast {
      font-size: var(--fs-body);
    }

    .undo :global(.kbd-run) {
      display: none;
    }
  }

  /* No rail below 900px, and the tab bar owns the bottom edge: centred, 12 above the bar and 12 from each side. */
  @media (width < 900px) {
    .stack {
      inset-inline: 0;
      inset-block-end: calc(var(--tabbar) + var(--sp-3));
      align-items: center;
      padding-inline: var(--sp-3);
    }

    .toast {
      inline-size: 100%;
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

  /* FORCED COLOURS: the bar keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .toast {
      border: 1px solid CanvasText;
    }
  }
</style>
