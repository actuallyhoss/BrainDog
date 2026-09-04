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

  const items = () => [...(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  function show(land: 'first' | 'last') {
    open = true;
    // One frame, because the list does not exist until the `{#if}` has rendered it.
    requestAnimationFrame(() => {
      const all = items();
      (land === 'first' ? all[0] : all[all.length - 1])?.focus();
    });
  }

  function close(refocus = true) {
    open = false;
    if (refocus) button?.focus();
  }

  function onTriggerKey(e: KeyboardEvent) {
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
    if (['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) e.stopPropagation();
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
      onclick={() => close()}
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
    position: absolute;
    inset-block-start: calc(100% + 6px);
    z-index: var(--z-palette);
    min-inline-size: max(100%, 220px);
    padding: 4px;
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
