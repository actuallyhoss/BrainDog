<!--
  A menu button: a trigger, and a list that opens under it.

  NOT a `<dialog>` and not a sheet. A menu is a short list of things to do to the thing you clicked,
  and it belongs next to that thing — a modal for six items takes the whole screen away to offer you
  a choice you could have made in place. Sheets are for content; menus are for verbs.

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
    if (!list) return;
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
    if (open && root && !root.contains(e.target as Node)) close(false);
  }
</script>

<svelte:window onpointerdown={onPointerDown} />

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
      onkeydown={onListKey}
      onclick={onListClick}
    >
      {@render children()}
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

  /* Over the page, so it is one of the few things allowed a shadow, and it uses the generated
     ladder rather than a number invented here. */
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
    /* EIGHT AND NOT FOUR, because the box scrolls now. The focus ring is a 2px outline at 1px
       offset plus a 4px shadow, so it reaches 7px past an item, and at 4px of padding
       `overflow-y: auto` clipped three of them off the first and last rows. The ring is the one
       thing in this component that may not be trimmed to make room. */
    padding: var(--sp-2);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
    animation: menu-in var(--d-enter) var(--ease-out);
  }

  .menu[data-align='start'] {
    inset-inline-start: 0;
  }

  .menu[data-align='end'] {
    inset-inline-end: 0;
  }

  /* No `opacity: 0` in a start state — see Sheet.svelte. A stalled animation must leave something
     readable behind, and a menu 4px too high is readable. */
  @keyframes menu-in {
    from {
      transform: translateY(-4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .menu {
      animation: none;
    }
  }
</style>
