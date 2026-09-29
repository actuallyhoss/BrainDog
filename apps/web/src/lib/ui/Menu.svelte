<!--
  A menu button: a trigger, and a list that opens under it with a fine pointer, or rises from the
  bottom of the screen under a thumb (below).

  NOT a `<dialog>` and not a `Sheet`. A menu is a short list of things to do to the thing you
  clicked, and with a mouse it belongs next to that thing: a modal for six items takes the whole
  screen away to offer you a choice you could have made in place. Sheets are for content; menus are
  for verbs.

  The keyboard contract is the one every platform's menu has and the reason this is a component
  rather than a `<details>`: Enter/Space/Down opens and lands on the first item, Up opens and lands
  on the last, Home/End jump, typing a letter is not implemented and is deliberately not faked, Esc
  closes and returns focus to the trigger. `aria-expanded` on the trigger, `role="menu"` on the
  list, `role="menuitem"` on the items, and the list is labelled by the trigger.

  A CHECKABLE ITEM LEAVES THE MENU OPEN. `role="menuitemcheckbox"` (or `menuitemradio` among
  several) is a choice somebody may make twice in one visit, Live and Lapsing, and a menu that shut
  on the first made them open it again for the second. An ordinary `menuitem` is a verb, and doing
  it is the end of the menu, so it still closes. A checkable menu closes on Esc, Tab, an outside
  press, or its trigger.

  Closing returns focus to the trigger, ALWAYS. A menu that drops focus on the body leaves a
  keyboard user at the top of the document, which is the single most common way a custom menu is
  worse than the native one it replaced.

  UNDER A THUMB IT IS A BOTTOM ACTION SHEET, NOT A POPOVER (design SYS-4, DSN-6). Below 640px, or
  with a coarse pointer at any width, a list the size of a trigger opened under the finger that
  pressed it, and its rows were menu rows sized for a mouse. There the same list rises from the
  bottom of the screen over a scrim, in 48px rows at 16px, with a Cancel row at its foot. The items,
  the keys and the roles are the same in both forms; only the placing differs.

  WITH A MOUSE IT IS GLASS (SYSTEM §6): the strong glass at level 2, radius `--r-md`, arriving in 140ms, and every row
  in it 32 tall with an icon, the word and a key cap, whatever class the caller drew its items with. Under a thumb it is
  a sheet and not glass: a tile's surface over the scrim.

  THE SHEET IS A POPOVER IN THE TOP LAYER, which is the one place a fixed panel is placed against
  the screen whatever it sits inside. A menu lives in toolbars and bars that have their own stacking
  order, and a panel fixed to the bottom of the screen inside one of them would be drawn in that
  order, under the tab bar.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    align = 'start',
    open = $bindable(false),
    trigger,
    children,
  }: {
    /** Names the menu for a screen reader; the trigger's own text is usually not enough. */
    label: string;
    align?: 'start' | 'end';
    open?: boolean;
    trigger: Snippet;
    children: Snippet;
  } = $props();

  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let list = $state<HTMLElement>();

  const words = { cancel: 'Cancel' };

  /**
   * WHEN THE MENU IS AN ACTION SHEET: below 640px, or under a coarse pointer at any width (design
   * 6.3). Read once each time the menu opens, so a menu never changes form while it is open, and
   * written onto the panel as its `popover` attribute, which is what the sheet's rules key on.
   */
  const SHEET = '(width < 640px), (pointer: coarse)';
  const sheet = $derived(open && matchMedia(SHEET).matches);

  /* INTO THE TOP LAYER ONCE THE PANEL EXISTS. `list` is bound when the `{#if}` renders it, so this
     runs once per opening. A browser without popovers draws the same panel fixed in place. */
  $effect(() => {
    if (sheet && list && typeof list.showPopover === 'function') list.showPopover();
  });

  const items = () => [...(list?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]') ?? [])];

  /**
   * The gap the panel keeps from the edge of the screen. Eight, so a clamped menu reads as sitting
   * near the edge rather than welded to it.
   */
  const GUTTER = 8;

  /**
   * KEEP THE PANEL ON THE SCREEN, WHICH NOTHING DID.
   *
   * `.menu` is `position: absolute` with `min-inline-size: max(100%, 220px)` and
   * `inset-inline-start: 0`, and `align` defaults to `'start'`. There is no upper bound on where
   * its trailing edge lands: a trigger 200px into a 358px bar opens a 220px panel whose edge is at
   * 420, and the same arithmetic runs off the bottom when the trigger is near it. `RowMenu.svelte`
   * has always clamped (`Math.min(at.x, window.innerWidth - 260)`); this one never has.
   *
   * No gate could have caught it. `layout.mjs` measures a page at rest and has never opened a
   * menu, and `a11y.mjs` does open one but axe has no overflow rule.
   *
   * `translate` AND `max-block-size`, NOT A REWRITE TO `position: fixed`. The panel has to stay
   * anchored to its trigger while the page scrolls underneath it, and a fixed panel placed from
   * coordinates read at open time detaches from the control it belongs to on the first scroll.
   * An absolutely positioned panel already moves with its trigger; all it needs is a correction,
   * and a correction measured in device pixels is what `translate` takes. It is also why the
   * shift is a physical translate and not a logical inset: the number comes from
   * `getBoundingClientRect`, which is physical in both directions, so it is already correct under
   * `dir="rtl"` and a logical inset would have to be given a sign per direction.
   *
   * ONE PASS. The side is chosen from the panel's natural height and the room on each side, and
   * the cap is applied afterwards, so nothing is measured against a box this function has already
   * changed.
   */
  function place() {
    /* An action sheet is placed by its own rule, against the screen, and has no trigger to clear. */
    if (!list || sheet) return;
    list.style.setProperty('--menu-shift', '0px');
    list.style.setProperty('--menu-lift', '0px');
    list.style.setProperty('--menu-room', 'none');

    const view = document.documentElement;
    const box = list.getBoundingClientRect();
    const anchor = root?.getBoundingClientRect();

    const past = Math.max(0, box.right - (view.clientWidth - GUTTER));
    const before = Math.max(0, GUTTER - box.left);
    if (past || before) list.style.setProperty('--menu-shift', `${Math.round(before - past)}px`);

    const below = view.clientHeight - GUTTER - box.top;
    const above = (anchor?.top ?? 0) - GUTTER;
    /* Above only when it does not fit below AND there is more room there. A menu that flips for a
       few pixels moves under the finger that opened it, which is worse than a short scroll. */
    if (box.height > below && above > below) {
      const height = Math.min(box.height, above);
      list.style.setProperty('--menu-lift', `${-Math.round(height + (anchor?.height ?? 0) + 12)}px`);
      list.style.setProperty('--menu-room', `${Math.round(above)}px`);
    } else if (box.height > below) {
      list.style.setProperty('--menu-room', `${Math.round(Math.max(below, 0))}px`);
    }
  }

  function show(land: 'first' | 'last') {
    open = true;
    // One frame, because the list does not exist until the `{#if}` has rendered it.
    requestAnimationFrame(() => {
      place();
      const all = items();
      (land === 'first' ? all[0] : all[all.length - 1])?.focus();
    });
  }

  function close(refocus = true) {
    open = false;
    if (refocus) button?.focus();
  }

  function onTriggerKey(e: KeyboardEvent) {
    /* The keys that open the menu are the menu's, or a page that binds Enter or an arrow acts on
       the same press: Enter here opened the list's cursor row as the menu opened over it. */
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) e.stopPropagation();
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      show('last');
    }
  }

  /**
   * Every key this menu understands is swallowed here.
   *
   * NOT through the overlay counter, which is the app's MODAL lock — it also sets
   * `overflow: hidden` on the document, and a menu that stops the page scrolling is a menu
   * pretending to be a dialog. The page's hotkeys live on `<svelte:window>`, so stopping
   * propagation on the keys the menu owns is exactly enough: `j` does not move the grid's cursor
   * while a menu has focus, and every key the menu does not claim still reaches the page.
   */
  function onListKey(e: KeyboardEvent) {
    const all = items();
    if (['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) e.stopPropagation();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(at + 1) % all.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(at - 1 + all.length) % all.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      all[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      all[all.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // Tab out of a menu closes it. Trapping focus in a non-modal popup is worse than letting go.
      close(false);
    }
  }

  /** A verb closes the menu; a checkable item does not, so a second value is one press away. */
  function onListClick(e: MouseEvent) {
    const role = (e.target as Element).closest('[role^="menuitem"]')?.getAttribute('role');
    if (role === 'menuitemcheckbox' || role === 'menuitemradio') return;
    close();
  }

  /** Pointerdown, not click: a click that lands on a control elsewhere should close this AND press
      that, which is what people expect and what a click-phase handler gets wrong. */
  function onPointerDown(e: PointerEvent) {
    pressed = open && sheet;
    if (open && !sheet && root && !root.contains(e.target as Node)) close(false);
  }

  /**
   * AN ACTION SHEET CLOSES ON A PRESS OF ITS SCRIM, AND ON THE CLICK, NOT THE POINTERDOWN.
   *
   * The opposite of the popover's rule above, and for its reason turned round: over a scrim there is
   * nothing underneath to press, and closing on pointerdown took the panel away before the release,
   * so the click landed on whatever row the scrim had been covering. The test is geometry, as the
   * `Sheet`'s backdrop is, because a press on a popover's backdrop may be reported on the popover
   * itself. `e.detail > 0` keeps real presses: a keyboard's click is at (0, 0).
   *
   * ONLY A PRESS THAT BEGAN WHILE THE SHEET WAS OPEN. The click that opens the menu reaches this
   * window listener too, after the trigger's handler has opened it and the panel has been drawn,
   * and its point is the trigger, which is outside the panel: without `pressed` the sheet closed on
   * the same click that opened it.
   */
  let pressed = false;

  function onWindowClick(e: MouseEvent) {
    const began = pressed;
    pressed = false;
    if (!began || !open || !sheet || !list || e.detail === 0) return;
    const r = list.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  }
</script>

<svelte:window onpointerdown={onPointerDown} onclick={onWindowClick} />

<div class="menu-root" bind:this={root}>
  <button
    bind:this={button}
    type="button"
    class="menu-trigger tap"
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open ? close() : show('first'))}
    onkeydown={onTriggerKey}
  >
    {@render trigger()}
  </button>

  {#if open}
    <!-- `tabindex="-1"` because the container listens for keys but must never be a tab stop: the
         items are the stops, and the roving focus moves between them. -->
    <div
      bind:this={list}
      class="menu"
      data-align={align}
      role="menu"
      tabindex="-1"
      aria-label={label}
      popover={sheet ? 'manual' : undefined}
      onkeydown={onListKey}
      onclick={onListClick}
    >
      {@render children()}
      <!-- A MENU ITEM, SO THE ARROWS REACH IT AND THE MENU'S ROLE HOLDS ONLY ITEMS. The list's own
           click handler closes the menu on it, as on any verb, and returns focus to the trigger. -->
      {#if sheet}<button type="button" class="menu-cancel" role="menuitem">{words.cancel}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .menu-root {
    position: relative;
  }

  .menu-trigger {
    display: block;
    inline-size: 100%;
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* GLASS, AND THE STRONG ONE (SYSTEM §6): a menu opens over busy content, and legibility is the whole of its job. Level
     2, the chrome's, is the glass hairline pair and the floating shadow; radius `--r-md`; and it arrives in 140ms on the
     arriving curve (SYSTEM §8). */
  .menu {
    /* The three the clamp writes, declared here so the panel is correct before `place()` has run
       and so the names exist in a stylesheet rather than only in TypeScript. */
    --menu-shift: 0px;
    --menu-lift: 0px;
    --menu-room: none;

    position: absolute;
    inset-block-start: calc(100% + 6px);
    z-index: var(--z-palette);
    /* THE PANEL IS NEVER WIDER THAN THE SCREEN IT IS ON, and this was `max(100%, 220px)` with no
       ceiling. The clamp goes on the FLOOR and not on `max-inline-size`, because a minimum beats a
       maximum when the two disagree and a `max-inline-size` under it would have been ignored:
       220px is what a menu asks for, and the screen less its two gutters is what it gets. */
    min-inline-size: min(max(100%, 220px), calc(100dvw - var(--sp-4)));
    max-block-size: var(--menu-room);
    /* Only ever scrolls when `place()` has capped the height. `overflow-y` on an uncapped box does
       nothing, and this is the one property that makes a capped one usable rather than cut. */
    overflow-y: auto;
    overscroll-behavior: contain;
    /* `translate` and not `transform`, because `menu-in` below already owns `transform` and the
       two properties compose instead of overwriting each other. */
    translate: var(--menu-shift) var(--menu-lift);
    /* EIGHT AND NOT FOUR, because the box scrolls. The focus ring is a 2px outline at an offset, so
       it reaches past an item, and at 4px of padding `overflow-y: auto` clipped it off the first and
       last rows. The ring is the one thing in this component that may not be trimmed to make room. */
    padding: var(--sp-2);
    background: var(--glass-strong);
    backdrop-filter: var(--glass-blur);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    box-shadow: var(--glass-edge), var(--e2);
    animation: menu-in var(--d-menu) var(--ease-out);
  }

  .menu[data-align='start'] {
    inset-inline-start: 0;
  }

  .menu[data-align='end'] {
    inset-inline-end: 0;
  }

  /**
   * THE ROW, WHATEVER CLASS THE CALLER GAVE IT (SYSTEM §6): 32 tall, an icon, the word, and a key cap at the trailing
   * edge. Callers draw their own items and style them, and this is the one place the menu's rhythm is said, so every
   * menu in the product reads as one menu. The colours stay the caller's: a destructive verb is its own business.
   */
  .menu :global([role^='menuitem']) {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--sp-6);
    padding-block: 0;
    padding-inline: var(--sp-2);
    border-radius: var(--r-sm);
    font-size: var(--t-base);
    transition: background var(--d-state) var(--ease-out);
  }

  .menu :global([role^='menuitem'] > .kbd-run) {
    margin-inline-start: auto;
  }

  /* No `opacity: 0` in a start state, see Sheet.svelte. A stalled animation must leave something
     readable behind, and a menu 4px too high is readable. */
  @keyframes menu-in {
    from {
      transform: translateY(-4px);
    }
  }

  /* Hidden in the popover form; the sheet's rule below draws it. It is only rendered for a sheet. */
  .menu-cancel {
    display: none;
  }

  /**
   * THE ACTION SHEET: the same list, against the bottom of the screen.
   *
   * `[popover]` rather than the `@media` query, because the attribute is what the script set when
   * it read that query at open, so the form and the markup cannot disagree. Every UA default for a
   * popover (centred with `margin: auto`, `fit-content` on both axes, a border and `Canvas`) is
   * taken back here. From 640px up, which only a coarse pointer reaches, it is a 560px sheet in the
   * middle of the bottom edge rather than one as wide as a tablet.
   *
   * A SHEET, NOT GLASS (SYSTEM §6): a tile's surface at radius `--r-lg`, the third level, over the scrim.
   */
  .menu[popover] {
    position: fixed;
    inset-block: auto var(--kb);
    inset-inline: 0;
    inline-size: min(100%, 560px);
    min-inline-size: 0;
    block-size: auto;
    max-block-size: calc(88dvh - var(--kb));
    margin-block: 0;
    margin-inline: auto;
    translate: none;
    padding: var(--sp-2) var(--sp-2) calc(var(--sp-2) + env(safe-area-inset-bottom));
    background: var(--bg);
    backdrop-filter: none;
    border: 0;
    border-start-start-radius: var(--r-lg);
    border-start-end-radius: var(--r-lg);
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    color: var(--ink);
    box-shadow: var(--e3);
    animation: menu-rise var(--d-enter) var(--ease-out);
  }

  .menu[popover]::backdrop {
    background: var(--scrim);
  }

  /* 48px ROWS AT 16px, whatever class the caller gave its items: a row sized for a mouse is a miss
     under a thumb. `--tap` and a step of space make the 48. */
  .menu[popover] :global([role^='menuitem']) {
    min-block-size: calc(var(--tap) + var(--sp-1));
    font-size: var(--t-md);
  }

  /* A caller's key hints are for a keyboard, and a sheet is where a thumb is. */
  .menu[popover] :global(kbd) {
    display: none;
  }

  /* Cancel is the last row, apart from the verbs by a hairline, and it is not one of them. */
  .menu[popover] .menu-cancel {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 100%;
    margin-block-start: var(--sp-2);
    background: none;
    border: 0;
    border-block-start: 1px solid var(--line-soft);
    border-radius: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    font-weight: 500;
    cursor: pointer;
  }

  @keyframes menu-rise {
    from {
      transform: translateY(24px);
    }
  }

  /* A FADE IN PLACE OF EVERY MOVE (SYSTEM §8). The a11y layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .menu,
    .menu[popover] {
      animation-name: menu-fade;
    }
  }

  @keyframes menu-fade {
    from {
      opacity: 0.6;
    }
  }

  /* UNDER FORCED COLOURS the glass and the shadow are gone, so the menu's edge is a border. */
  @media (forced-colors: active) {
    .menu,
    .menu[popover] {
      border: 1px solid CanvasText;
    }
  }
</style>
