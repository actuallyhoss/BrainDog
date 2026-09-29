<!--
  A `<dialog>`: from 900px up a drawer that floats `--inset` in from the window's end edge, a tile's surface at radius
  `--r-lg` and the third level of depth, over a scrim with no blur. Below 900px, the phone,
  it is a bottom sheet that is as tall as what it holds, up to 88dvh, with a grab handle and a head on one line.

  THE PHONE SHEET FITS ITS CONTENT. It was always 88% of the screen, so a Display sheet of six
  options was two thirds empty panel. Its height now comes from what is in it, capped at
  `88dvh - var(--kb)`, and its bottom edge sits `var(--kb)` up, so the active field is not
  underneath the keyboard. `--kb` is written by `$lib/a11y/keyboard.ts`, which the shell starts.
  `overlays` is a counter, and Esc closes ONE layer per press and stops rather than falling through
  (19 §4).

  NO ID AFTER THE TITLE. The sheet took an `id` and printed it in the identifier face beside the
  title, which is where a peeked row showed "#12". A person reads a name there; the id lives in the
  row's Details and in "Copy link".

  It slides in over 220ms on the arriving curve and closes at once. Opening is something you watch;
  closing is something you have already decided about.
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
    onclose,
    children,
    footer,
  }: {
    open?: boolean | undefined;
    title: string;
    subtitle?: string | undefined;
    /** For a caller whose open state is derived from something else, a peeked row's number, say. */
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
   * of the keyboard broke".
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

  /**
   * THE GRAB HANDLE PULLS, BECAUSE A HANDLE THAT DOES NOT MOVE IS A DRAWING OF ONE.
   *
   * A phone sheet shows a handle at its top edge, and the first thing a thumb does with it is pull
   * it down. So a pull moves the sheet with the finger, and letting go past `LET_GO` closes it
   * through the same `close()` Escape and the backdrop use; short of it, the sheet goes back.
   *
   * ONLY THE HANDLE'S STRIP TAKES THE PULL, not the head. Pointer capture sends the release to the
   * element that captured it, so a head that captured would swallow the click of its own Close
   * button. The strip holds nothing a person presses, and it is hidden from 900px up, where the
   * sheet is a drawer with no handle to pull.
   */
  const LET_GO = 80;
  let pulled = $state(0);
  let from: number | null = null;

  function grab(e: PointerEvent) {
    from = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function pull(e: PointerEvent) {
    if (from !== null) pulled = Math.max(0, e.clientY - from);
  }

  function drop() {
    if (from === null) return;
    from = null;
    if (pulled > LET_GO) close();
    pulled = 0;
  }
</script>

<dialog
  bind:this={el}
  class="sheet"
  style="--pulled: {pulled}px"
  onclick={onbackdrop}
  oncancel={(e) => (e.preventDefault(), close())}
  onclose={closed}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet-grab" aria-hidden="true" onpointerdown={grab} onpointermove={pull} onpointerup={drop} onpointercancel={drop}>
    <span class="sheet-grab-bar"></span>
  </div>

  <!-- ONE LINE: the title and its Close, centred on each other. A title that does not fit ends in
       an ellipsis rather than pushing Close down to a second row. -->
  <header class="sheet-head">
    <h2 class="sheet-title">{title}</h2>
    <button type="button" class="sheet-close tap" onclick={close} aria-label={copy.close} title={copy.close}>
      <Icon name="close" size="m" />
    </button>
  </header>
  {#if subtitle}<p class="sheet-sub">{subtitle}</p>{/if}

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
  /* THE DRAWER, from 900px up. It floats `--inset` in from the window's end edge on three sides, as the docked panel
     does, rather than hanging off the edge with a rule down its side: a sheet is a tile's surface at radius
     `--r-lg` and the third level of depth, and a tile has no border. */
  .sheet {
    position: fixed;
    inset-block: var(--inset);
    inset-inline-end: var(--inset);
    inset-inline-start: auto;
    z-index: var(--z-sheet);
    display: flex;
    flex-direction: column;
    inline-size: min(480px, calc(100vw - 2 * var(--inset)));
    /* EXPLICIT, because `inset-block` is not enough. The UA stylesheet gives `<dialog>` a
       `height: fit-content`, which beats the stretch the two insets ask for, so the drawer hung
       from the corner at the height of whatever was in it, ending mid-page with the table still
       visible underneath. A drawer that covers a corner is a popover in the wrong place.

       BOTH properties, and the second one is not redundant. The UA also sets
       `max-height: calc(100% - 6px - 2em)`, which clamps a 900px viewport to 864, measured. */
    /* AND `--kb` IS SUBTRACTED HERE TOO, NOT ONLY ON THE PHONE SHEET BELOW. The drawer is what a
       tablet in landscape gets, and its footer carries the submit button on every create and every
       edit. `inset-block` and a definite `block-size` over-constrain the box, so the browser drops
       `inset-block-end`: the top stays pinned and the bottom edge lifts by exactly the keyboard,
       which is the behaviour wanted. */
    block-size: calc(100dvh - 2 * var(--inset) - var(--kb));
    max-block-size: 100dvh;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: var(--bg);
    border: 0;
    border-radius: var(--r-lg);
    color: var(--ink);
    box-shadow: var(--e3);
  }

  .sheet:not([open]) {
    display: none;
  }

  /* THE SAME `--scrim` THE PALETTE AND THE MENUS USE, with no blur: a blur behind a sheet is glass, and a sheet is not
     chrome. */
  .sheet::backdrop {
    background: var(--scrim);
  }

  /* THE ARRIVING CURVE, OVER 220MS, with no overshoot: a spring squeezed into a fifth of a second is a
     flick at the end of every open, which is motion performing rather than answering. */
  .sheet[open] {
    animation: slide-in var(--d-enter) var(--ease-out);
  }

  /* NO `opacity: 0` IN THE START STATE, and this is a failure-mode decision rather than a taste one.

     Measured: `getAnimations()` on this dialog reported `playState: running` with an unresolved
     start time for up to 900ms after `showModal()`. A CSS animation stays pending until its first
     rendered frame, and a dialog entering the top layer with forty rows of content inside it can
     wait a while for one. With `opacity: 0` in the `from`, that pause is a second of nothing where
     the reader asked for a panel.

     A stalled slide is a panel 24px from where it belongs. A stalled fade is no panel. Whatever the
     start state is, it has to be a state somebody could read. */
  @keyframes slide-in {
    from {
      transform: translateX(var(--sheet-from));
    }
  }

  /* THE SLIDE COMES FROM THE END EDGE, which is the left one in a right-to-left page. */
  .sheet {
    --sheet-from: 24px;
  }

  :global([dir='rtl']) .sheet {
    --sheet-from: -24px;
  }

  /* THE HANDLE IS A PHONE'S, so the drawer from 900px up has none; the rule below 900px shows it. */
  .sheet-grab {
    display: none;
  }

  /* ONE LINE: the title and its close circle, centred on each other. */
  .sheet-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-3) var(--sp-2) calc(var(--sp-4) + var(--sp-1));
  }

  /* The element holding the words carries the ellipsis, and it is a block, not the flex row. A sheet's title is at a
     group heading's step, as the docked panel's is. */
  .sheet-title {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--t-group);
    font-weight: 600;
    line-height: var(--lh-tight);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sheet-sub {
    margin: 0;
    padding: 0 calc(var(--sp-4) + var(--sp-1)) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A 36px CIRCLE, the toolbar's icon circle, with a quiet fill at rest so it reads as a thing to press.
     `.tap` grows its hit box to 44 where the pointer is a thumb. */
  .sheet-close {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--s1);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .sheet-close:hover {
      background: var(--hold-wash);
      color: var(--ink);
    }
  }

  /* `min-block-size: 0` so a sheet capped at 88dvh scrolls its body instead of growing past the cap:
     a flex item will not shrink below its content without it. Twenty in from each edge, a tile's padding. */
  .sheet-body {
    flex: 1 1 auto;
    min-block-size: 0;
    padding: var(--sp-2) calc(var(--sp-4) + var(--sp-1)) calc(var(--sp-4) + var(--sp-1));
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* WRAPPING, because a footer can carry a sentence as well as buttons: the reason a control is
     disabled belongs beside it, and squeezed into a flex row it became three lines in a 12ch
     column. A footer with only buttons in it wraps to exactly the row it was. */
  .sheet-foot {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) calc(var(--sp-4) + var(--sp-1));
    border-block-start: 1px solid var(--line);
  }

  /**
   * AND THE UA'S `max-width`, WHICH IS THE OTHER HALF OF THE SAME BUG.
   *
   * The UA gives a modal `<dialog>` `max-width: calc(100% - 6px - 2em)` as well as the height, and
   * at the sheet's font that computes to `calc(100% - 36px)`, so a sheet declaring `100vw`
   * rendered 354 wide at 390: a dead strip of dimmed page down one edge, in every sheet in the
   * product.
   */
  .sheet {
    max-inline-size: 100%;
  }

  @media (width < 900px) {
    .sheet {
      inset-block-start: auto;
      inset-inline: 0;
      inline-size: 100vw;
      /* AS TALL AS WHAT IT HOLDS, and never taller than 88dvh less the keyboard. `auto` beats the
         UA's `fit-content` only because the drawer's definite height above is taken back here. */
      block-size: auto;
      max-block-size: calc(88dvh - var(--kb));
      /**
       * AND THE BOTTOM EDGE MOVES, WHICH SHRINKING THE HEIGHT ON ITS OWN DOES NOT DO.
       *
       * A `position: fixed` box is laid out against the LAYOUT viewport, which iOS does not shrink
       * for the keyboard, so `inset-block-end: 0` kept the bottom of the sheet pinned under the
       * keyboard and the height it lost came off the TOP.
       *
       * Measured at 390x844 with a 336px keyboard, when the sheet was a fixed 88dvh: with the
       * height alone it ran from y=437 to y=844 and only 71px of it was inside the 508px a person
       * can see. With this line it ran from y=101 to y=508 and the footer sat on the keyboard's
       * top edge, which is where a submit button belongs.
       */
      inset-block-end: var(--kb);
      /* THE PULL. `--pulled` is how far the handle has been drawn down, written on the element as
         it moves, and `translate` composes with the `rise` animation's `transform`. */
      translate: 0 var(--pulled);
      border-end-start-radius: 0;
      border-end-end-radius: 0;
      /* THE HOME INDICATOR IS NOT UNDER THE KEYBOARD, so the inset is not paid twice. With the
         sheet already lifted by `--kb` the strip at the bottom of the screen is the keyboard's,
         and paying `env(safe-area-inset-bottom)` on top of it left 34px of dead panel between the
         footer and the keys, which reads as the sheet having failed to move. */
      padding-block-end: max(0px, calc(env(safe-area-inset-bottom) - var(--kb)));
      /**
       * AND THE INLINE EDGES. `app.html` sets `viewport-fit=cover`, so a phone in landscape puts 44
       * to 59px of notch over one side of a box that declares `inset-inline: 0`.
       *
       * `max()` OF THE TWO RATHER THAN ONE EACH SIDE, because `env()` has no logical spelling: the
       * insets are named `left` and `right`, and a `padding-inline` that maps `left` to the start
       * would put the notch padding on the wrong side under `dir="rtl"`. The symmetric form is
       * right in both directions and costs a few pixels on the side away from the notch.
       */
      padding-inline: max(env(safe-area-inset-left), env(safe-area-inset-right));
    }

    /* A 24px strip across the top, so a thumb finds it, holding a short pill a person reads as
       "this pulls". `touch-action: none` keeps the pull from scrolling the page underneath. */
    .sheet-grab {
      display: grid;
      place-items: center;
      flex: none;
      block-size: var(--sp-5);
      touch-action: none;
      cursor: grab;
    }

    .sheet-grab-bar {
      inline-size: var(--sp-6);
      block-size: var(--sp-1);
      background: var(--line);
      border-radius: var(--r-pill);
    }

    /* The handle's strip is the head's top padding on a phone, so it is not paid twice. */
    .sheet-head {
      padding-block-start: 0;
    }

    /* THE FOOTER'S BUTTONS SHARE ITS WIDTH ON A PHONE, so the one primary is a full-width target
       under a thumb, and two buttons are two halves of one row. A sentence beside them keeps its
       own width and wraps above them. */
    .sheet-foot > :global(.btn) {
      flex: 1 1 auto;
    }

    .sheet[open] {
      animation: rise var(--d-enter) var(--ease-out);
    }

    @keyframes rise {
      from {
        transform: translateY(24px);
      }
    }
  }

  /* A FADE IN PLACE OF EVERY MOVE. The a11y layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .sheet[open] {
      animation-name: sheet-fade;
    }
  }

  @keyframes sheet-fade {
    from {
      opacity: 0.6;
    }
  }

  /* UNDER FORCED COLOURS the shadow is gone, so the sheet's edge is a border. */
  @media (forced-colors: active) {
    .sheet {
      border: 1px solid CanvasText;
    }
  }
</style>
