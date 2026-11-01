<!--
  The docked detail panel: opening a task or a question keeps the list in view, and nothing needs a page
  change. Work and Decide draw it.

  FROM 1,280 UP IT IS DOCKED (`DOCKS` in `panel.ts`) at the window's end edge: 440 wide (380 below 1,360), inset `--inset` from the
  window, radius 16, on the tile with a 1px `--rule-strong` edge and no shadow. Its
  head is a close circle, the title at 17/600 and the caller's verbs over a hairline; its body scrolls. It is a NON-MODAL `<dialog>` opened with `show()`, so the list beside it keeps its pointer
  and its keyboard, and focus stays where it was: `j` and `k` go on walking the list and the panel follows.

  BELOW 1,280 IT IS A SHEET: the same element opened with `showModal()`, over the scrim, holding the overlay lock as
  `Sheet.svelte` does. Drawn as every sheet is at that width: a drawer at the end edge from the phone's 900 up, where
  it looks as the docked panel does and only the scrim says the list is not live, and a bottom sheet on a phone. The
  form is read from the window while the panel is open, and a panel open when the window crosses 1,280 reopens in the
  other form rather than closing (`panel.ts`). The form it opened in is written on the element as `data-form`, and the
  styles key on that rather than on `:modal`, because a closing panel is no longer modal and still has its close to
  play in the shape it opened in.

  THE CONTENT NARROWS BESIDE IT, NEVER UNDER IT. While a docked panel is open the root carries `--dock-w`, the inline
  space the panel takes from the window's end edge: its width, its inset from the window, and the 12 between it and the
  content. It is `0px` otherwise, and `0px` below 1,280, where the panel is a sheet.
  A page that draws a Panel pads its content's inline end with it:

      padding-inline-end: max(var(--gutter), var(--dock-w));

  It is written by CSS alone (`:root:has(...)`), so there is no script to forget and nothing to clean up on a route
  change: the root loses it the moment the element closes or goes. The shell's column for it reads `--dock-col`, the
  same width given only once the panel has landed (below), so the panel slides in over the work's end and the work
  narrows under it in one reflow, with no empty ground showing while it travels. Closing gives the column back at once
  and the panel slides out over the work as it widens.

  OUT OF A SCREEN'S CROSS-FADE. The work is named `page` while one screen fades to the next (`+layout.svelte`), and a
  docked panel inside it would be painted into the work's two pictures. So for that
  moment the docked panel is named `dock`, a picture of its own that stands where it is (`app.css`).

  IT MOVES THE SAME WAY OUT AS IN, AND FASTER. In from past the end edge, `translateX(100% + 16px)`, over `--d-panel`
  on `--ease-sheet`, with no fade; out along the same path in `--d-panel-out`. The sheet rises from below the screen and
  goes back down it. `@starting-style` draws the first frame and `display` and `overlay` are held for the close, so `[open]` still
  drops the moment it closes. Reduced motion fades instead of moving.

  SWITCHING WHAT IT SHOWS IS A FADE IN PLACE, the content swap of the motion system (`--d-swap`, `--ease-standard`),
  so a press on another row reads as the panel answering it.
  Not from a key: `j` and `k` walk the list with the panel following, and nothing moves on a key (`SYSTEM.md` §8).

  ESC CLOSES IT. The sheet form has the `<dialog>`'s own cancel; the docked form is not modal and gets none, so a press
  of Esc anywhere inside the panel closes it. Esc in the list beside it is the page's to decide.

  THE SHEET PULLS DOWN BY ITS HEAD, and past a third of its height, or on a flick, it closes (`Pull` in `panel.ts`).

  `onclose` FIRES ONCE PER CLOSE, from the element's own `close` event, for the reason `Sheet.svelte` gives.

  THE SHEET FORM LAYS A SCRIM (`scrims` in `panel.ts`) from its opening to the end of its close, and the toast stack
  holds while it is up. The docked form lays none: the stack already ends where the panel begins.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { overlays } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import { NARROW, PHONE_WIDTH, Pull, formOf, scrims, settled, step, unstall } from './panel.ts';

  let {
    open = $bindable(false),
    title,
    shows,
    onclose,
    verbs,
    children,
  }: {
    open?: boolean | undefined;
    title: string;
    /**
     * What the panel shows, as a key: a row's key, a node's. A new one while the panel is open is a switch, and fades
     * in. Compared as it is, so a string or a number and not an object built again on each read. Absent, the title
     * stands for it.
     */
    shows?: unknown;
    onclose?: (() => void) | undefined;
    /** The panel's verbs, drawn at the head's end: buttons, a menu. */
    verbs?: Snippet | undefined;
    children: Snippet;
  } = $props();

  const uid = $props.id();

  let el = $state<HTMLDialogElement>();

  /** Whether the window is narrower than `DOCKS`, followed while the panel lives so an open panel can change form. */
  let narrow = $state(false);

  $effect(() => {
    const query = matchMedia(NARROW);
    narrow = query.matches;
    const follow = () => (narrow = query.matches);
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  });

  /** Whether the sheet form holds the overlay lock, so closing or being destroyed gives it back once. */
  let held = false;
  /** The sheet form's scrim, lifted once its close has played, or at once when the panel goes. */
  let lift: (() => void) | null = null;

  function release(now = false) {
    if (lift) {
      const go = lift;
      lift = null;
      if (now || !el) go();
      else settled(el, go);
    }
    if (!held) return;
    overlays.close();
    held = false;
  }

  /**
   * A REOPEN IS NOT A CLOSE. Changing form closes the element and opens it again in the same task, and the `close`
   * event that queues is not somebody closing the panel, so it is swallowed once.
   */
  let switching = false;

  $effect(() => {
    if (!el) return;
    const form = formOf(narrow);
    const todo = step({ open, form }, { open: el.open, modal: el.open && el.matches(':modal') });
    if (todo === null) return;
    if (todo === 'close' || todo === 'reopen') {
      switching = todo === 'reopen';
      el.close();
      /* A REOPEN PLAYS NO CLOSE, so the sheet's scrim is lifted at once rather than after an exit that never runs, and
         the toasts held under it are not kept waiting out the stall after a window is widened. */
      release(todo === 'reopen');
      if (todo === 'close') return;
    }
    /* THE FORM GOES ON THE ELEMENT BEFORE IT OPENS, so its first frame is drawn in it, and it stays through the close.
       A sheet let go on its way down is put back where it rests, while it is still out of sight. */
    el.dataset.form = form;
    el.style.translate = '';
    if (form === 'sheet') {
      el.showModal();
      overlays.open();
      held = true;
      lift ??= scrims.lay();
    } else {
      /* `show()` RUNS THE DIALOG'S FOCUSING STEPS TOO, which would take the keyboard from the list that opened it. The
         docked panel is beside the list, not over it, so focus goes back to where it was. */
      const back = document.activeElement;
      el.show();
      if (back instanceof HTMLElement && back !== document.body) back.focus({ preventScroll: true });
    }
    /* Not on a reopen, which moves nothing: there is no opening to stall. */
    if (todo !== 'reopen') unstall(el);
  });

  $effect(() => () => release(true));

  /* ── switching what it shows ─────────────────────────────────────────── */

  /** Nothing shown yet, which is how an opening is told from a switch. */
  const NOTHING = Symbol('nothing');
  let showing: unknown = NOTHING;
  /** Which of the two switch fades the body wears. Two, so each switch starts the fade again. */
  let swap = $state<'a' | 'b' | null>(null);
  /** Whether the last press was a key. A switch from the keyboard is not drawn. */
  let byKey = false;

  $effect(() => {
    if (!open) return;
    const key = () => (byKey = true);
    const point = () => (byKey = false);
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', point, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', point, true);
    };
  });

  $effect(() => {
    const now = shows === undefined ? title : shows;
    const on = open;
    untrack(() => {
      if (!on) {
        showing = NOTHING;
        swap = null;
        return;
      }
      if (showing !== NOTHING && now !== showing && !byKey) swap = swap === 'a' ? 'b' : 'a';
      showing = now;
    });
  });

  function close() {
    open = false;
  }

  function closed() {
    if (switching) {
      switching = false;
      return;
    }
    open = false;
    release();
    onclose?.();
  }

  /** Esc inside the docked panel. The sheet form's Esc is the `<dialog>`'s cancel, below. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !el || el.matches(':modal')) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  /** A press on the sheet's scrim closes it; the test is geometry, as in `Sheet.svelte`, and only for a real pointer. */
  function onbackdrop(e: MouseEvent) {
    if (!el || e.detail === 0 || !el.matches(':modal')) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  }

  /* ── the pull, in the sheet form ─────────────────────────────────────── */

  /**
   * THE HEAD PULLS, EXCEPT WHERE IT HOLDS SOMETHING TO PRESS. Pointer capture sends the release to the element that
   * captured it, so a pull that began on the close circle or a verb would swallow its click; a press there is left to
   * the control. `translate` is written on the element as the finger moves, which composes with the slide's
   * `transform` and restyles nothing inside it.
   */
  const PRESSABLE = 'button, a, input, select, textarea, [role="menu"], [tabindex]';
  const pull = new Pull();

  function grab(e: PointerEvent) {
    const head = e.currentTarget as HTMLElement;
    if (!el || el.dataset.form !== 'sheet' || !e.isPrimary || e.button !== 0 || !matchMedia(PHONE_WIDTH).matches) return;
    /* Asked of the head and not past it: the page around the panel can be a focusable grid. */
    const pressed = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (pressed && head.contains(pressed)) return;
    pull.grab(e.clientY, e.timeStamp);
    head.setPointerCapture(e.pointerId);
    el.dataset.pull = '';
  }

  function drag(e: PointerEvent) {
    if (el && pull.held) el.style.translate = `0 ${pull.move(e.clientY, e.timeStamp)}px`;
  }

  function drop(e: PointerEvent) {
    if (!el || !pull.held) return;
    const away = pull.drop(e.clientY, e.timeStamp, el.offsetHeight, e.type === 'pointercancel');
    delete el.dataset.pull;
    /* Let go short of it, the sheet goes back on the same curve; past it, it closes from where the finger left it. */
    if (away) close();
    else el.style.translate = '';
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
  bind:this={el}
  class="dock"
  aria-labelledby="{uid}-title"
  onclick={onbackdrop}
  {onkeydown}
  oncancel={(e) => (e.preventDefault(), close())}
  onclose={closed}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="dock-head" onpointerdown={grab} onpointermove={drag} onpointerup={drop} onpointercancel={drop}>
    <button type="button" class="dock-close tap" onclick={close} aria-label={copy.close} title={copy.close}>
      <Icon name="close" size="m" />
    </button>
    <h2 class="dock-title" id="{uid}-title">{title}</h2>
    {#if verbs}<div class="dock-verbs">{@render verbs()}</div>{/if}
  </header>

  <!-- A scrolling box a keyboard can reach, for the reason `Sheet.svelte` gives. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="dock-body" data-surface="tile" data-swap={swap} tabindex="0">{@render children()}</div>
</dialog>

<style>
  /* THE WIDTH THE PAGE GIVES UP. `--dock-panel` is the panel's own width, 440 and 380 on a desktop narrower than 1360;
     `--dock-w` is what the page pads by, and it is nothing until a docked panel is open. */
  :global(:root) {
    --dock-panel: var(--panel-w);
    --dock-w: 0px;
  }

  @media (width < 1360px) {
    :global(:root) {
      --dock-panel: 380px;
    }
  }

  /* `:not(:modal)`: the sheet form covers the list over a scrim and takes no width from it.
     `--dock-col` IS THE SAME WIDTH FOR THE SHELL'S COLUMN, registered as a length (`app.css`) so it can move: opening,
     it opens with the slide, over the panel's step on the sheet curve, so the work makes room as the panel's edge comes
     (given after the slide, the whole list jumped 360px in one frame, CLS 0.11); closing, it goes at once,
     as the rule after this one says, so the work widens under a panel already leaving. */
  :global(:root) {
    transition-property: --dock-col;
  }

  :global(:root:has(dialog.dock[open]:not(:modal))) {
    --dock-w: calc(var(--dock-panel) + 2 * var(--inset));
    --dock-col: var(--dock-w);
    transition-duration: var(--d-panel);
    transition-timing-function: var(--ease-sheet);
  }

  /* WHILE A SCREEN CROSS-FADES, a picture of its own, so it is not painted into the work's (`app.css`). */
  :global(html[data-moving]) .dock[open]:not(:modal) {
    view-transition-name: dock;
  }

  /* DOCKED. Every UA default a `<dialog>` brings (centred, `fit-content`, a border, `Canvas`) is taken back here. */
  .dock {
    /* THE MOTION: in over the panel's step on the sheet curve, out along the same path a step quicker, from wherever
       `--dock-off` puts it out of sight. Both opacities are 1, so it slides and does not fade, until reduced motion
       fades it in from a state that is still readable and out to nothing. `--d-panel-out` is the skin's; until it is
       declared there the leaving step is the one under the panel's, which is the same 180. */
    --dock-curve: var(--ease-sheet);
    --dock-in: var(--d-panel);
    --dock-out: var(--d-panel-out, var(--d-rows));
    --dock-off: translateX(calc(100% + 16px));
    --dock-from-opacity: 1;
    --dock-gone-opacity: 1;

    position: fixed;
    inset-block: var(--inset);
    inset-inline: auto var(--inset);
    z-index: var(--z-sheet);
    display: flex;
    flex-direction: column;
    inline-size: var(--dock-panel);
    max-inline-size: calc(100vw - 2 * var(--inset));
    block-size: calc(100dvh - 2 * var(--inset));
    max-block-size: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: var(--tile);
    /* IT FLOATS WITH NO SCRIM, SO IT TAKES THE ONE EDGE a floating layer has: 1px of
       `--rule-strong`, and no shadow. */
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    color: var(--ink);
    transform: var(--dock-off);
    opacity: var(--dock-gone-opacity);
    /* LONGHANDS, so a browser that does not know `allow-discrete` drops that one line and keeps the slide. `display` and
       `overlay` are held to the end of the close, which is what keeps a closed panel on screen while it goes. */
    transition-property: transform, translate, opacity, display, overlay;
    transition-duration: var(--dock-out);
    transition-timing-function: var(--dock-curve);
    transition-behavior: allow-discrete;
  }

  /* Closed, and on its way out: nothing on it can be pressed. */
  .dock:not([open]) {
    display: none;
    pointer-events: none;
  }

  .dock[open] {
    transform: none;
    opacity: 1;
    transition-duration: var(--dock-in);
  }

  /* THE FIRST FRAME OF AN OPENING, which is where the close ends. */
  @starting-style {
    .dock[open] {
      transform: var(--dock-off);
      opacity: var(--dock-from-opacity);
    }
  }

  :global([dir='rtl']) .dock {
    --dock-off: translateX(calc(-100% - 16px));
  }

  /* A sheet being pulled follows the finger, with nothing easing behind it. */
  .dock:global([data-pull]) {
    transition-property: none;
  }

  /* THE HEAD: the close circle, the title, the verbs, on the panel's own tile with a hairline under it. No glass. */
  .dock-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--tile);
    border-block-end: 1px solid var(--rule);
  }

  .dock-close {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--tile-2, var(--hover));
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .dock-close:hover {
      background: var(--hover, var(--tile-2));
      color: var(--ink);
    }
  }

  /* The element holding the words carries the ellipsis, and it is a block, not the flex row. 17/600, a sheet's title. */
  .dock-title {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    overflow: hidden;
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-verbs {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE BODY IS A TILE'S SURFACE, and it is what scrolls. `min-block-size: 0` so a flex child can be shorter than its
     content. A tile's padding from each edge. */
  .dock-body {
    flex: 1 1 auto;
    min-block-size: 0;
    padding: var(--tile-pad);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--tile);
  }

  /* A SWITCH: what the panel shows fades in where it stands, the content swap of the motion system (`--d-swap`,
     `--ease-standard`): a cross-fade in place, no slide. `backwards`, never `both`, so no fill outlives the fade. */
  .dock-body[data-swap='a'] {
    animation: dock-swap-a var(--d-swap) var(--ease-standard) backwards;
  }

  .dock-body[data-swap='b'] {
    animation: dock-swap-b var(--d-swap) var(--ease-standard) backwards;
  }

  @keyframes dock-swap-a {
    from {
      opacity: 0;
    }
  }

  @keyframes dock-swap-b {
    from {
      opacity: 0;
    }
  }

  /* THE SHEET FORM FROM 900 TO 1,280 IS THE DOCKED PANEL'S SHAPE over a scrim, which is its separation: no edge. */
  .dock:global([data-form='sheet']) {
    border: 0;
  }

  /* ON A PHONE (`PHONE` in `panel.ts`), THE BOTTOM SHEET: against the bottom of the screen, above the keyboard, as tall
     as what it holds. It rises from below the screen and goes back down it. */
  @media (width < 900px) {
    .dock:global([data-form='sheet']) {
      --dock-off: translateY(calc(100% + var(--kb)));

      inset-block: auto var(--kb);
      inset-inline: 0;
      inline-size: 100%;
      max-inline-size: 100%;
      block-size: auto;
      max-block-size: calc(88dvh - var(--kb));
      border-end-start-radius: 0;
      border-end-end-radius: 0;
    }

    /* THE HANDLE, every sheet's (`Sheet.svelte`): 36 by 4 in `--rule-strong`, 8 from the top, in the head's top padding.
       The head is what takes the pull, and `touch-action: none` keeps a pull on it from scrolling the page underneath. */
    .dock:global([data-form='sheet']) .dock-head {
      position: relative;
      padding-block-start: var(--sp-5);
      touch-action: none;
    }

    .dock:global([data-form='sheet']) .dock-head::before {
      content: '';
      position: absolute;
      inset-block-start: var(--sp-2);
      inset-inline: 0;
      inline-size: 36px;
      block-size: var(--sp-1);
      margin-inline: auto;
      background: var(--rule-strong);
      border-radius: 2px;
    }

    .dock:global([data-form='sheet']) .dock-body {
      padding: var(--sp-4) var(--sp-4) calc(var(--sp-4) + max(0px, calc(env(safe-area-inset-bottom) - var(--kb))));
    }
  }

  /* The scrim comes and goes with the sheet. Only the sheet form, which is modal, draws one. */
  .dock::backdrop {
    background: var(--scrim);
    opacity: 0;
    transition-property: opacity, display, overlay;
    transition-duration: var(--dock-out);
    transition-timing-function: var(--dock-curve);
    transition-behavior: allow-discrete;
  }

  .dock[open]::backdrop {
    opacity: 1;
    transition-duration: var(--dock-in);
  }

  @starting-style {
    .dock[open]::backdrop {
      opacity: 0;
    }
  }

  /* A FADE IN PLACE OF EVERY MOVE: the panel and the sheet fade where they stand, and a switch fades without settling.
     The a11y layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .dock,
    :global([dir='rtl']) .dock,
    .dock:global([data-form='sheet']) {
      --dock-off: none;
      --dock-from-opacity: 0.6;
      --dock-gone-opacity: 0;
    }
  }

  /* UNDER FORCED COLOURS the panel's edge is the system's text colour. */
  @media (forced-colors: active) {
    .dock {
      border: 1px solid CanvasText;
    }
  }
</style>
