<!--
  The docked detail panel (SYSTEM §5): opening a task or a question keeps the list in view, and nothing needs a page
  change. Work and Decide draw it.

  FROM 900PX UP IT IS DOCKED at the window's end edge: 440 wide (380 on a narrower desktop), inset `--inset` from the
  window, radius `--r-lg`. Its head is glass (a close circle, the title at `--t-group`, and the caller's verbs) and its
  body is `--bg` and scrolls. It is a NON-MODAL `<dialog>` opened with `show()`, so the list beside it keeps its pointer
  and its keyboard, and focus stays where it was: `j` and `k` go on walking the list and the panel follows.

  BELOW 900PX IT IS A BOTTOM SHEET: the same element opened with `showModal()`, over the scrim, holding the overlay lock
  as `Sheet.svelte` does. The form is read from the window while the panel is open, and a panel open when the window
  crosses 900px reopens in the other form rather than closing (`panel.ts`). The styles key on `:modal`, so the markup and
  the form cannot disagree.

  THE CONTENT NARROWS BESIDE IT, NEVER UNDER IT. While a docked panel is open the root carries `--dock-w`, the inline
  space the panel takes from the window's end edge: its width, its inset from the window, and the 12 between it and the
  content (SYSTEM §4, "12 to a docked panel"). It is `0px` otherwise, and `0px` below 900px, where the panel is a sheet.
  A page that draws a Panel pads its content's inline end with it:

      padding-inline-end: max(var(--gutter), var(--dock-w));

  It is written by CSS alone (`:root:has(...)`), so there is no script to forget and nothing to clean up on a route
  change: the root loses it the moment the element closes or goes.

  ESC CLOSES IT. The sheet form has the `<dialog>`'s own cancel; the docked form is not modal and gets none, so a press
  of Esc anywhere inside the panel closes it. Esc in the list beside it is the page's to decide.

  `onclose` FIRES ONCE PER CLOSE, from the element's own `close` event, for the reason `Sheet.svelte` gives.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { overlays } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import { NARROW, formOf, step } from './panel.ts';

  let {
    open = $bindable(false),
    title,
    onclose,
    verbs,
    children,
  }: {
    open?: boolean | undefined;
    title: string;
    onclose?: (() => void) | undefined;
    /** The panel's verbs, drawn at the head's end: buttons, a menu. */
    verbs?: Snippet | undefined;
    children: Snippet;
  } = $props();

  const uid = $props.id();

  let el = $state<HTMLDialogElement>();

  /** Whether the window is a phone's, followed while the panel lives so an open panel can change form. */
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

  function release() {
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
      release();
      if (todo === 'close') return;
    }
    if (form === 'sheet') {
      el.showModal();
      overlays.open();
      held = true;
    } else {
      /* `show()` RUNS THE DIALOG'S FOCUSING STEPS TOO, which would take the keyboard from the list that opened it. The
         docked panel is beside the list, not over it, so focus goes back to where it was. */
      const back = document.activeElement;
      el.show();
      if (back instanceof HTMLElement && back !== document.body) back.focus({ preventScroll: true });
    }
  });

  $effect(() => () => release());

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
  <header class="dock-head">
    <button type="button" class="dock-close tap" onclick={close} aria-label={copy.close} title={copy.close}>
      <Icon name="close" size="m" />
    </button>
    <h2 class="dock-title" id="{uid}-title">{title}</h2>
    {#if verbs}<div class="dock-verbs">{@render verbs()}</div>{/if}
  </header>

  <!-- A scrolling box a keyboard can reach, for the reason `Sheet.svelte` gives. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="dock-body" data-surface="tile" tabindex="0">{@render children()}</div>
</dialog>

<style>
  /* THE WIDTH THE PAGE GIVES UP. `--dock-panel` is the panel's own width, 440 and 380 on a desktop narrower than 1360
     (SYSTEM §5, "380 at 1280"); `--dock-w` is what the page pads by, and it is nothing until a docked panel is open. */
  :global(:root) {
    --dock-panel: var(--panel-w);
    --dock-w: 0px;
  }

  @media (width < 1360px) {
    :global(:root) {
      --dock-panel: 380px;
    }
  }

  /* `:not(:modal)`: the sheet form covers the list over a scrim and takes no width from it. */
  :global(:root:has(dialog.dock[open]:not(:modal))) {
    --dock-w: calc(var(--dock-panel) + 2 * var(--inset));
  }

  /* DOCKED. Every UA default a `<dialog>` brings (centred, `fit-content`, a border, `Canvas`) is taken back here. */
  .dock {
    --dock-from: 24px;

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
    background: transparent;
    border: 0;
    border-radius: var(--r-lg);
    color: var(--ink);
    /* LEVEL 2, the chrome's: the glass hairline pair and the floating shadow (SYSTEM §4). */
    box-shadow: var(--glass-edge), var(--e2);
  }

  .dock:not([open]) {
    display: none;
  }

  /* IT SLIDES IN OVER 220MS on the arriving curve (SYSTEM §8), from a start somebody could still read if the first frame
     stalls, which is `Sheet.svelte`'s reason for never starting at `opacity: 0`. */
  .dock[open] {
    animation: dock-in var(--d-enter) var(--ease-out);
  }

  :global([dir='rtl']) .dock {
    --dock-from: -24px;
  }

  @keyframes dock-in {
    from {
      transform: translateX(var(--dock-from));
    }
  }

  /* THE GLASS HEAD: the close circle, the title, the verbs. Glass never holds glass, so nothing in it is glass. */
  .dock-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--glass);
    backdrop-filter: var(--glass-blur);
    border-block-end: 1px solid var(--line);
  }

  .dock-close {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .dock-close:hover {
      background: var(--hold-wash);
      color: var(--ink);
    }
  }

  /* The element holding the words carries the ellipsis, and it is a block, not the flex row. */
  .dock-title {
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

  .dock-verbs {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE BODY IS A TILE'S SURFACE, and it is what scrolls. `min-block-size: 0` so a flex child can be shorter than its
     content. Twenty in from each edge, a tile's padding. */
  .dock-body {
    flex: 1 1 auto;
    min-block-size: 0;
    padding: calc(var(--sp-4) + var(--sp-1));
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--bg);
  }

  /* BELOW 900PX, THE BOTTOM SHEET: against the bottom of the screen, above the keyboard, as tall as what it holds. */
  .dock:modal {
    inset-block: auto var(--kb);
    inset-inline: 0;
    inline-size: 100%;
    max-inline-size: 100%;
    block-size: auto;
    max-block-size: calc(88dvh - var(--kb));
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    box-shadow: var(--e3);
    animation: dock-rise var(--d-enter) var(--ease-out);
  }

  .dock:modal::backdrop {
    background: var(--scrim);
  }

  .dock:modal .dock-body {
    padding-block-end: calc(var(--sp-4) + max(0px, calc(env(safe-area-inset-bottom) - var(--kb))));
  }

  @keyframes dock-rise {
    from {
      transform: translateY(24px);
    }
  }

  /* A FADE IN PLACE OF EVERY MOVE (SYSTEM §8). The a11y layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .dock[open],
    .dock:modal {
      animation-name: dock-fade;
    }
  }

  @keyframes dock-fade {
    from {
      opacity: 0.6;
    }
  }

  /* UNDER FORCED COLOURS the shadows and the glass are gone, so the panel's edge is a border. */
  @media (forced-colors: active) {
    .dock {
      border: 1px solid CanvasText;
    }
  }
</style>
