<!--
  A `<dialog>`: a 480px drawer above 900px, a sheet on a phone.

  Its body is `88dvh − var(--kb)` and its bottom edge sits `var(--kb)` up, so the active field is
  not underneath the keyboard. `--kb` is written by `$lib/a11y/keyboard.ts`, which the shell starts;
  this sentence used to be here with nothing behind it, and the term subtracted zero for the life of
  the build. `lockScroll` is a counter, and Esc closes ONE layer per press and stops rather than
  falling through (19 §4).

  Open is longer than close, always: a panel opens in 280ms and closes in 160ms. Opening is
  something you watch; closing is something you have already decided about (13 §9).
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import type { Snippet } from 'svelte';
  import { overlays } from '../a11y/keys.svelte.ts';
  import Icon from './Icon.svelte';

  let {
    open = $bindable(false),
    title,
    subtitle,
    id,
    onclose,
    children,
    footer,
  }: {
    open?: boolean | undefined;
    title: string;
    subtitle?: string | undefined;
    id?: string | undefined;
    /** For a caller whose open state is derived from something else — a peeked row's seq, say. */
    onclose?: (() => void) | undefined;
    children: Snippet;
    footer?: Snippet | undefined;
  } = $props();

  let el = $state<HTMLDialogElement>();

  /**
   * WHETHER THIS SHEET IS HOLDING THE LOCK, so that being destroyed can give it back.
   *
   * `overlays` is a DEPTH and the shell reads it to decide whether a bare letter belongs to the
   * page: `+layout.svelte` gates every unmodified key on `overlays.depth > 0`. The effect below
   * incremented it on open and decremented it in its own `else` arm, which needs the component to
   * still be alive; a sheet that is UNMOUNTED while open never reaches that arm and the depth stays
   * up for the life of the tab.
   *
   * TWO CLICKS FROM THE FRONT PAGE. Peek a row on a register, then press the drawer's own primary
   * control, which is a link to that row: the route changes, the sheet is destroyed mid-open, and
   * from then on `?`, `/`, `g h`, `j`, `k` and `n` do nothing on every screen in the product, while
   * the modified chords keep working because they are tested before the guard. It reads as "some
   * of the keyboard broke". The layout's own More sheet works around it by hand, closing itself on
   * every link, which is the workaround that says the mechanism is wrong.
   */
  let held = false;

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      overlays.open();
      held = true;
      /**
       * AND THE CARET GOES WHERE THE WORK IS.
       *
       * `showModal()` focuses the first focusable descendant, which on every sheet in this product
       * is the header's own Close button — so somebody who pressed "New obligation" and started
       * typing got nothing, and a keyboard user's first Enter closed the sheet they had just opened.
       *
       * THE FORM CANNOT DO IT ITSELF. `RowForm` focuses its first field on mount and `showModal()`
       * runs after that, taking the focus straight back; the sheet owns the modal lifecycle, so the
       * sheet is where this belongs.
       *
       * ONLY WHEN THERE IS A FIELD. A sheet that carries a list, a keymap or a peeked row has
       * nothing to type into, and moving focus off the close button there would take away the one
       * control somebody arrived wanting.
       */
      el.querySelector<HTMLElement>('.sheet-body input, .sheet-body select, .sheet-body textarea')?.focus();
    } else if (!open && el.open) {
      el.close();
      overlays.close();
      held = false;
    }
  });

  /* THE LOCK IS GIVEN BACK WHEN THIS COMPONENT GOES, whatever took it away. Its own effect cannot:
     a teardown on the effect above would run on every re-run of it, and the open branch is one of
     those. This one runs once, at destroy. */
  $effect(() => () => {
    if (held) {
      overlays.close();
      held = false;
    }
  });

  /** Ask to be closed. It reports nothing: the element's own `close` event is the one notifier. */
  function close() {
    open = false;
  }

  /**
   * `onclose` FIRES FROM THE ELEMENT'S OWN EVENT AND FROM NOWHERE ELSE, which is what makes it fire
   * once.
   *
   * `close()` used to set `open = false` AND call `onclose`; the effect then called `el.close()`,
   * whose `close` event is handled here, which called `close()` again. Every caller's `onclose` ran
   * twice per dismissal. A re-entrancy flag does not fix it, because the second call arrives in a
   * later task: `dialog.close()` queues the event rather than dispatching it.
   *
   * SO THERE IS ONE NOTIFIER. Escape, the backdrop and a caller setting `open` to false all end in
   * `el.close()`, and `el.close()` ends here. `open = false` is repeated because the browser can
   * close a dialog without going through `close()` at all.
   *
   * All three callers happen to be idempotent today, so nothing was visibly wrong; the register's
   * new-row drawer was the closest to biting, because its handler writes the URL. It is the same
   * double-fire shape as a button carrying both `type="submit"` and an `onclick` that submits,
   * which this repository has already paid for once.
   */
  function closed() {
    open = false;
    onclose?.();
  }

  /**
   * Click the backdrop to close.
   *
   * A modal `<dialog>` does not do this on its own, and the absence reads as the app being stuck:
   * the surface behind is visibly dimmed and visibly inert, so the first thing anybody tries is
   * clicking it, and nothing happening is the only feedback they get. Esc has always worked, which
   * is exactly why this went unnoticed by whoever wrote it.
   *
   * The test is GEOMETRY, not `e.target === el`. A click on the dialog's own padding also targets
   * the dialog, so identity would close the panel when somebody clicks the gap beside its title.
   * `e.detail > 0` keeps real pointer clicks only: activating a button with the keyboard dispatches
   * a click whose coordinates are (0, 0), which is outside every rect on screen.
   */
  function onbackdrop(e: MouseEvent) {
    if (!el || e.detail === 0) return;
    const r = el.getBoundingClientRect();
    const outside =
      e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) close();
  }

</script>

<dialog bind:this={el} class="sheet" onclick={onbackdrop} oncancel={(e) => (e.preventDefault(), close())} onclose={closed}>
  <header class="sheet-head">
    <div>
      <h2 class="sheet-title">
        {title}
        {#if id}<span class="sheet-id">{id}</span>{/if}
      </h2>
      {#if subtitle}<p class="sheet-sub">{subtitle}</p>{/if}
    </div>
    <button type="button" class="sheet-close tap" onclick={close} aria-label={copy.close}>
      <Icon name="close" size="m" />
    </button>
  </header>

  <!-- `tabindex="0"` because this is the scrolling box, and a scrolling box that a keyboard cannot
       reach is content a keyboard cannot read. The sheet that proved it was the KEYMAP: forty
       bindings, all of them text and `kbd`, not one focusable node in the whole panel — so the one
       surface in the product whose entire subject is the keyboard could not be scrolled with one.
       Sheets that are full of fields never showed the bug, because their fields carry the focus
       that scrolls the box for free. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="sheet-body" tabindex="0">{@render children()}</div>

  {#if footer}<footer class="sheet-foot">{@render footer()}</footer>{/if}
</dialog>

<style>
  .sheet {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    inset-inline-start: auto;
    z-index: var(--z-sheet);
    display: flex;
    flex-direction: column;
    inline-size: min(480px, 100vw);
    /* EXPLICIT, because `inset-block: 0` is not enough. The UA stylesheet gives `<dialog>` a
       `height: fit-content`, which beats the stretch the two insets ask for — so the drawer was
       hanging from the top-right corner at the height of whatever was in it, ending mid-page with
       the table still visible underneath. A drawer that covers a corner is a popover in the wrong
       place.

       BOTH properties, and the second one is not redundant. The UA also sets
       `max-height: calc(100% - 6px - 2em)`, which clamps a 900px viewport to 864 and leaves a
       36-pixel strip of the page showing under the drawer — measured, not guessed. */
    /* AND `--kb` IS SUBTRACTED HERE TOO, NOT ONLY ON THE PHONE SHEET BELOW. The drawer is what an
       iPad in portrait gets (744px is above the 640 breakpoint), and its footer carries the submit
       button on every create and every edit. `inset-block: 0` and a definite `block-size`
       over-constrain the box, so the browser drops `inset-block-end`: the top stays pinned at zero
       and the bottom edge lifts by exactly the keyboard, which is the behaviour wanted. */
    block-size: calc(100dvh - var(--kb));
    max-block-size: 100dvh;
    margin: 0;
    padding: 0;
    background: var(--s1);
    border: 0;
    border-inline-start: 1px solid var(--edge);
    color: var(--ink);
    box-shadow: var(--e3);
  }

  .sheet:not([open]) {
    display: none;
  }

  /* THE SAME `--scrim` THE PALETTE USES. It was 46% here and 52% there. */
  .sheet::backdrop {
    background: var(--scrim);
  }

  .sheet[open] {
    animation: slide-in var(--d-enter) var(--ease-spring);
  }

  /* NO `opacity: 0` IN THE START STATE, and this is a failure-mode decision rather than a taste one.
     
     Measured: `getAnimations()` on this dialog reported `playState: running` with an unresolved
     start time for up to 900ms after `showModal()` — a CSS animation stays pending until its first
     rendered frame, and a dialog entering the top layer with forty rows of content inside it can
     wait a while for one. With `opacity: 0` in the `from`, that pause is a second of nothing where
     the reader asked for a panel.
     
     A stalled slide is a panel 24px to the right of where it belongs. A stalled fade is no panel.
     Whatever the start state is, it has to be a state somebody could read. */
  @keyframes slide-in {
    from {
      transform: translateX(24px);
    }
  }

  .sheet-head {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-4) var(--sp-3);
  }

  .sheet-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--t-lg);
    letter-spacing: -0.02em;
  }

  .sheet-id {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .sheet-sub {
    margin-block-start: 2px;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .sheet-close {
    margin-inline-start: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .sheet-close:hover {
    border-color: var(--line);
    color: var(--ink);
  }

  .sheet-body {
    flex: 1;
    padding: var(--sp-4);
    overflow-y: auto;
  }

  /* WRAPPING, because a footer can carry a sentence as well as buttons — the reason a control is
     disabled belongs beside it, and squeezed into a flex row it became three lines in a 12ch
     column. A footer with only buttons in it wraps to exactly the row it was. */
  .sheet-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  /**
   * AND THE UA'S `max-width`, WHICH IS THE OTHER HALF OF THE SAME BUG.
   *
   * This file already overrides `max-block-size` for the UA's `max-height: calc(100% - 6px - 2em)`,
   * with a comment saying "measured, not guessed" — and the horizontal twin was never taken. At the
   * sheet's 15px font that computes to `calc(100% - 36px)`, so a sheet declaring `100vw` rendered
   * 284px at 320, 354 at 390 and 394 at 430: a dead strip of dimmed page down the right edge, with
   * the sheet's rounded corner floating mid-screen, in every sheet in the product.
   */
  /* IT WAS WRITTEN TWICE, rule and paragraph both, one immediately after the other. A duplicate
     that says the same thing is harmless until the day somebody edits one of them. */
  .sheet {
    max-inline-size: 100%;
  }

  @media (width < 640px) {
    .sheet {
      inset-block-start: auto;
      inset-inline: 0;
      inline-size: 100vw;
      block-size: calc(88dvh - var(--kb));
      /**
       * AND THE BOTTOM EDGE MOVES, WHICH SHRINKING THE HEIGHT ON ITS OWN DOES NOT DO.
       *
       * `block-size: calc(88dvh - var(--kb))` was here alone and reads like the whole fix. It is
       * half of one. A `position: fixed` box is laid out against the LAYOUT viewport, which iOS
       * does not shrink for the keyboard, so `inset-block-end: 0` kept the bottom of the sheet
       * pinned under the keyboard and the height it lost came off the TOP.
       *
       * Measured at 390x844 with a 336px keyboard: with the height alone the sheet runs from y=437
       * to y=844 and only 71px of it is inside the 508px a person can see. With this line it runs
       * from y=101 to y=508 and the footer sits on the keyboard's top edge, which is where a
       * submit button belongs.
       */
      inset-block-end: var(--kb);
      border-inline-start: 0;
      border-block-start: 1px solid var(--edge);
      border-start-start-radius: var(--r-lg);
      border-start-end-radius: var(--r-lg);
      /* THE HOME INDICATOR IS NOT UNDER THE KEYBOARD, so the inset is not paid twice. With the
         sheet already lifted by `--kb` the strip at the bottom of the screen is the keyboard's,
         and paying `env(safe-area-inset-bottom)` on top of it left 34px of dead panel between the
         footer and the keys, which reads as the sheet having failed to move. */
      padding-block-end: max(0px, calc(env(safe-area-inset-bottom) - var(--kb)));
      /**
       * AND THE INLINE EDGES, WHICH NOTHING IN EITHER APP HAS EVER PAID.
       *
       * `app.html` sets `viewport-fit=cover`, so a phone in landscape puts 44 to 59px of notch
       * over one side of a box that declares `inset-inline: 0`. This sheet is the widest such box
       * in the product, and its close button sits at the trailing edge.
       *
       * `max()` OF THE TWO RATHER THAN ONE EACH SIDE, because `env()` has no logical spelling: the
       * insets are named `left` and `right`, and a `padding-inline` that maps `left` to the start
       * would put the notch padding on the wrong side under `dir="rtl"`. The symmetric form is
       * right in both directions and costs a few pixels on the side away from the notch.
       */
      padding-inline: max(env(safe-area-inset-left), env(safe-area-inset-right));
    }

    .sheet[open] {
      animation: rise var(--d-enter) var(--ease-spring);
    }

    @keyframes rise {
      from {
        transform: translateY(24px);
      }
    }
  }
</style>
