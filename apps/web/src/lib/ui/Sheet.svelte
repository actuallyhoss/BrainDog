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

  IT GOES THE WAY IT CAME, AND FASTER. The drawer comes in from past the window's end edge and the
  phone sheet up from below the screen, over `--d-panel` on `--ease-sheet`, and each goes back along
  the same path in `--d-panel-out`, with the scrim fading under it. It used to vanish on close, which read as the
  product dropping it. `@starting-style` draws the first frame and `display` and `overlay` are held
  for the close, so `[open]` still drops the moment it closes. Reduced motion fades instead.

  IT LAYS A SCRIM (`scrims` in `panel.ts`) from its opening to the end of its close, so a toast pushed
  while it is up waits for it rather than drawing under it.
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import type { Snippet } from 'svelte';
  import { overlays } from '../a11y/keys.svelte.ts';
  import Icon from './Icon.svelte';
  import { PHONE_WIDTH, Pull, scrims, settled, unstall } from './panel.ts';

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
  /* THE SHEET IS NAMED BY ITS TITLE, so a screen reader opening it hears what it is (a11y-44's finding: axe only
     checks a dialog named by role, so the gate never saw a sheet open with no name). */
  const uid = $props.id();

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
  /** This sheet's scrim, lifted once its close has played, or at once when it goes. */
  let lift: (() => void) | null = null;

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      /* A sheet pulled away last time is put back where it rests, while it is still out of sight. */
      el.style.translate = '';
      el.showModal();
      overlays.open();
      held = true;
      lift ??= scrims.lay();
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
      /* The slide starts past the edge, so one that waits too long for its first frame is ended in place. */
      unstall(el);
    } else if (!open && el.open) {
      el.close();
      overlays.close();
      held = false;
      /* After the close has started, so it is the close that is waited for. */
      if (lift) {
        const go = lift;
        lift = null;
        settled(el, go);
      }
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
    lift?.();
    lift = null;
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
    /* A close the browser made on its own (a `method="dialog"` form) never reached the effect's close, so the lock and
       the scrim are given back here. On every other close the effect has already given them back. */
    if (held) {
      overlays.close();
      held = false;
    }
    if (lift && el) {
      const go = lift;
      lift = null;
      settled(el, go);
    }
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
   * it down. So a pull moves the sheet with the finger, and letting go past a third of its height,
   * or on a flick, closes it through the same `close()` Escape and the backdrop use; short of it,
   * the sheet goes back on the curve it came in on (`Pull` in `panel.ts` decides which). It used to
   * take a fixed 80px and no flick, so a tall sheet barely moved before it shut and a quick throw
   * did nothing at all.
   *
   * THE HANDLE'S STRIP AND THE HEAD TAKE THE PULL, EXCEPT WHERE THE HEAD HOLDS SOMETHING TO PRESS.
   * Pointer capture sends the release to the element that captured it, so a pull that began on
   * Close would swallow its click; a press there is left to the button. Only on a phone (`PHONE` in `panel.ts`, the
   * 900 of the `@media` below): from there up the sheet is a drawer with no handle to pull.
   *
   * `translate` IS WRITTEN ON THE ELEMENT AS THE FINGER MOVES, not a custom property through
   * Svelte: a property the whole sheet inherits restyles every row in it on every move, and
   * `translate` composes with the slide's `transform` and restyles nothing else.
   */
  const PRESSABLE = 'button, a, input, select, textarea';
  const pull = new Pull();

  function grab(e: PointerEvent) {
    const from = e.currentTarget as HTMLElement;
    if (!el || !e.isPrimary || e.button !== 0 || !matchMedia(PHONE_WIDTH).matches) return;
    /* Asked of the strip or the head and not past it, since the page around the sheet can hold a control. */
    const pressed = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (pressed && from.contains(pressed)) return;
    pull.grab(e.clientY, e.timeStamp);
    from.setPointerCapture(e.pointerId);
    el.dataset.pull = '';
  }

  function drag(e: PointerEvent) {
    if (el && pull.held) el.style.translate = `0 ${pull.move(e.clientY, e.timeStamp)}px`;
  }

  function drop(e: PointerEvent) {
    if (!el || !pull.held) return;
    const away = pull.drop(e.clientY, e.timeStamp, el.offsetHeight, e.type === 'pointercancel');
    delete el.dataset.pull;
    /* Past it, the sheet closes from where the finger left it, and is put back as it next opens. */
    if (away) close();
    else el.style.translate = '';
  }
</script>

<dialog
  bind:this={el}
  class="sheet"
  aria-labelledby="{uid}-title"
  onclick={onbackdrop}
  oncancel={(e) => (e.preventDefault(), close())}
  onclose={closed}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet-grab" aria-hidden="true" onpointerdown={grab} onpointermove={drag} onpointerup={drop} onpointercancel={drop}>
    <span class="sheet-grab-bar"></span>
  </div>

  <!-- ONE LINE: the title and its Close, centred on each other. A title that does not fit ends in
       an ellipsis rather than pushing Close down to a second row. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="sheet-head" onpointerdown={grab} onpointermove={drag} onpointerup={drop} onpointercancel={drop}>
    <h2 class="sheet-title" id="{uid}-title">{title}</h2>
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
    /* THE MOTION: in over the panel's step on the sheet curve, out along the same path a step quicker, from wherever
       `--sheet-off` puts it out of sight, as `Panel.svelte` moves. Both opacities are 1, so it slides and does not
       fade, until reduced motion fades it in from a state that is still readable and out to nothing. */
    --sheet-curve: var(--ease-sheet);
    --sheet-in: var(--d-panel);
    --sheet-out: var(--d-panel-out, var(--d-rows));
    --sheet-off: translateX(calc(100% + 16px));
    --sheet-from-opacity: 1;
    --sheet-gone-opacity: 1;

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
    transform: var(--sheet-off);
    opacity: var(--sheet-gone-opacity);
    /* LONGHANDS, so a browser that does not know `allow-discrete` drops that one line and keeps the slide. `display` and
       `overlay` are held to the end of the close, which keeps a closed sheet on screen and on top while it goes. */
    transition-property: transform, translate, opacity, display, overlay;
    transition-duration: var(--sheet-out);
    transition-timing-function: var(--sheet-curve);
    transition-behavior: allow-discrete;
  }

  /* Closed, and on its way out: nothing on it can be pressed. */
  .sheet:not([open]) {
    display: none;
    pointer-events: none;
  }

  /* THE SHEET CURVE, OVER THE PANEL'S STEP, with no overshoot: a spring squeezed into a quarter of a
     second is a flick at the end of every open, which is motion performing rather than answering. */
  .sheet[open] {
    transform: none;
    opacity: 1;
    transition-duration: var(--sheet-in);
  }

  /* THE FIRST FRAME OF AN OPENING, which is where the close ends.

     NO FADE ON THE WAY IN, and a slide that stalls is ended rather than left (`unstall` in
     `panel.ts`): measured, an opening here waited up to 900ms for its first frame, and a sheet held
     at its start for that long is no sheet. */
  @starting-style {
    .sheet[open] {
      transform: var(--sheet-off);
      opacity: var(--sheet-from-opacity);
    }
  }

  /* THE SLIDE COMES FROM THE END EDGE, which is the left one in a right-to-left page. */
  :global([dir='rtl']) .sheet {
    --sheet-off: translateX(calc(-100% - 16px));
  }

  /* A sheet being pulled follows the finger, with nothing easing behind it. */
  .sheet:global([data-pull]) {
    transition-property: none;
  }

  /* THE SAME `--scrim` THE PALETTE AND THE MENUS USE, with no blur: a blur behind a sheet is glass, and a sheet is not
     chrome. It comes and goes with the sheet. */
  .sheet::backdrop {
    background: var(--scrim);
    opacity: 0;
    transition-property: opacity, display, overlay;
    transition-duration: var(--sheet-out);
    transition-timing-function: var(--sheet-curve);
    transition-behavior: allow-discrete;
  }

  .sheet[open]::backdrop {
    opacity: 1;
    transition-duration: var(--sheet-in);
  }

  @starting-style {
    .sheet[open]::backdrop {
      opacity: 0;
    }
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

    /* UP FROM BELOW THE SCREEN, and back down it: past its own height and the keyboard it sits on,
       in either direction of writing. */
    .sheet,
    :global([dir='rtl']) .sheet {
      --sheet-off: translateY(calc(100% + var(--kb)));
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

    /* The handle's strip is the head's top padding on a phone, so it is not paid twice. The head
       pulls too, so a pull on it does not scroll the page either. */
    .sheet-head {
      padding-block-start: 0;
      touch-action: none;
    }

    /* THE FOOTER'S BUTTONS SHARE ITS WIDTH ON A PHONE, so the one primary is a full-width target
       under a thumb, and two buttons are two halves of one row. A sentence beside them keeps its
       own width and wraps above them. */
    .sheet-foot > :global(.btn) {
      flex: 1 1 auto;
    }
  }

  /* A FADE IN PLACE OF EVERY MOVE: the drawer and the phone sheet fade where they stand. The a11y
     layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    :global([dir='rtl']) .sheet {
      --sheet-off: none;
      --sheet-from-opacity: 0.6;
      --sheet-gone-opacity: 0;
    }
  }

  /* UNDER FORCED COLOURS the shadow is gone, so the sheet's edge is a border. */
  @media (forced-colors: active) {
    .sheet {
      border: 1px solid CanvasText;
    }
  }
</style>
