<!--
  The row menu: `⇧F10`, and the context-menu key beside it.

  IT IS ANCHORED TO THE ROW, not to a trigger, because there is no trigger — the row is a grid cell
  and the menu is opened from the keyboard. So it takes a rect and places itself at it, which is the
  one thing `Menu.svelte` cannot do and the reason this is a second component rather than a prop.

  EVERY ITEM IS A KEY THAT ALREADY EXISTS. Open is `↵`, Peek is `p`, Copy is `y`, the register is
  `o`, Archive is `⌫`. The menu is not a second set of capabilities; it is the same set, discoverable
  by looking. 19 §3: a palette — and a menu — is an accelerator OVER visible navigation, never a
  substitute, and the inverse holds too. Each row prints its own key, so using the menu teaches the
  key that replaces it.

  Placement is `position: fixed` against the row's viewport rect and then clamped, because a menu
  opened on the last visible row must not open below the fold. It flips above the row instead.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    at,
    label,
    onclose,
    children,
  }: {
    open?: boolean;
    /** The focused row's viewport rect. Taken at open, not tracked — a menu that follows a
        scrolling row is a menu that walks away from the pointer. */
    at: { x: number; y: number; height: number } | null;
    label: string;
    onclose?: () => void;
    children: Snippet;
  } = $props();

  let list = $state<HTMLElement>();

  const items = () => [...(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  /* Depends on `list`, not on a frame. The container does not exist until the `{#if}` has rendered
     it, so an effect that only watches `open` runs one tick too early and focuses nothing — the
     menu opened with focus still on `<body>`, so the first arrow press went to the page and Enter
     did nothing at all. Reading `list` here makes the effect wait for it. */
  $effect(() => {
    if (!open || !list) return;
    items()[0]?.focus();
  });

  function close() {
    open = false;
    onclose?.();
  }

  function onkeydown(e: KeyboardEvent) {
    const all = items();
    const n = all.indexOf(document.activeElement as HTMLElement);
    /* EVERY key, not a list of them. An open menu owns the keyboard: `Enter` on an item fires the
       item's own click AND, without this, bubbled to the grid's `Enter` underneath — so choosing
       Peek opened the drawer and navigated to the row in the same keystroke. A menu that lets keys
       through is a menu that does two things at once. */
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      all[(n + 1) % all.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      all[(n - 1 + all.length) % all.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      all[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      all[all.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  }

  /* Below the row normally; above it when there is not room. 240 is the tallest this menu gets. */
  const HEIGHT = 240;
  const placed = $derived.by(() => {
    if (!at) return { left: 0, top: 0 };
    const below = at.y + at.height + 4;
    const flip = below + HEIGHT > window.innerHeight;
    return { left: Math.min(at.x, window.innerWidth - 260), top: flip ? Math.max(8, at.y - HEIGHT) : below };
  });
</script>

<svelte:window onpointerdown={(e) => open && list && !list.contains(e.target as Node) && close()} />

{#if open && at}
  <!-- `tabindex="-1"` because the container listens for keys but must never be a tab stop: the
       items are the stops and the roving focus moves between them. -->
  <div
    bind:this={list}
    class="row-menu"
    role="menu"
    tabindex="-1"
    aria-label={label}
    style="left:{placed.left}px; top:{placed.top}px"
    {onkeydown}
    onclick={() => close()}
  >
    {@render children()}
  </div>
{/if}

<style>
  .row-menu {
    position: fixed;
    z-index: var(--z-palette);
    min-inline-size: 252px;
    padding: 4px;
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
  }
</style>
