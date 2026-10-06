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

  UNDER A THUMB IT IS A BOTTOM ACTION SHEET, as `Menu.svelte` is and for its reasons:
  below 640px or with a coarse pointer, the list rises from the bottom of the screen over a
  scrim, as a popover in the top layer, in 48px rows at 16px with a Cancel row. A panel pinned to a
  row's rect is a panel under the finger that long-pressed the row.

  IT OPENS AND CLOSES AS `Menu.svelte` DOES: a pop from .96 at the row over `--d-menu`, a close to
  .985 as it fades over `--d-exit`, and as a sheet up from below the screen and back down it, laying
  a scrim the toast stack waits for (`scrims` in `panel.ts`). The menu stays on
  the page, inert, until its close has played, where it was opened, even when its caller forgets
  the row's rect the moment it closes.

  "HAND TO" IS THIS MENU'S OWN ITEM, last before Cancel, on a row of a list that says who holds its rows and
  for somebody who may change it, at every width. The sheet it opens lives outside the menu, since the menu closes on
  the press, and its code is fetched on the first press, so the rail that also uses this menu carries none of it.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import type { Shell } from '../record/boot-live.ts';
  import { may } from '../record/may.ts';
  import type { Entry, RegisterDecl } from '../record/schema.ts';
  import Icon from './Icon.svelte';
  import { scrims, settled } from './panel.ts';

  type Handed = { register: string; row: Entry; decl: RegisterDecl; onhanded?: ((entry: Entry) => void) | undefined };

  let {
    open = $bindable(false),
    at,
    label,
    onclose,
    hand = null,
    children,
  }: {
    open?: boolean;
    /** The focused row's viewport rect. Taken at open, not tracked — a menu that follows a
        scrolling row is a menu that walks away from the pointer. */
    at: { x: number; y: number; height: number } | null;
    label: string;
    onclose?: () => void;
    /** The row the menu is about, its list, and what to do with the row a hand leaves; absent, there is no "Hand to". */
    hand?: Handed | null | undefined;
    children: Snippet;
  } = $props();

  let list = $state<HTMLElement>();

  /* ONLY ON A LIST THAT DECLARES `hand:` AND FOR SOMEBODY WHO MAY CHANGE ITS ROWS: a control that cannot act is absent
     rather than greyed (`19 §6`). The sheet asks both again before it draws anything. */
  const handable = $derived(
    hand != null && (hand.decl as unknown as { hand?: unknown }).hand != null && may(page.data as unknown as Shell, 'write', hand.register),
  );
  /* THE ROW AS IT WAS WHEN "HAND TO" WAS PRESSED, since the menu closing lets its caller forget which row it was on. */
  let handing = $state<Handed | null>(null);
  let handOpen = $state(false);

  const words = { cancel: 'Cancel' };

  /* The action sheet's query, `Menu.svelte`'s own: read once as the menu opens, written onto the
     panel as its `popover` attribute, which is what the sheet's rules key on, and held through the
     close, so a sheet goes down as a sheet. */
  const SHEET = '(width < 640px), (pointer: coarse)';
  let sheet = $state(false);

  /**
   * ON THE PAGE FROM THE OPENING TO THE END OF ITS CLOSE, `Menu.svelte`'s lifecycle and its
   * reasons: `leaving` is the close while it plays, and `exits` says which close is the latest, so
   * a menu opened again on its way out is not taken away by the close before.
   */
  let shown = $state(false);
  let leaving = $state(false);
  let exits = 0;
  let stay: (() => void) | null = null;
  /** The action sheet's scrim, from its rise to the end of its fall. */
  let lift: (() => void) | null = null;

  /** WHERE IT WAS OPENED, kept for the close: the list page forgets the rect as the menu closes. */
  let kept = $state.raw<{ x: number; y: number; height: number } | null>(null);

  $effect(() => {
    const want = open && at !== null;
    untrack(() => {
      if (want) {
        exits++;
        stay?.();
        stay = null;
        if (!shown) sheet = matchMedia(SHEET).matches;
        kept = at;
        shown = true;
        leaving = false;
        return;
      }
      if (!shown || leaving) return;
      leaving = true;
      const mine = ++exits;
      void tick().then(() => {
        if (mine !== exits) return;
        const gone = () => {
          if (mine !== exits) return;
          stay = null;
          shown = false;
          leaving = false;
          lift?.();
          lift = null;
        };
        if (list) stay = settled(list, gone);
        else gone();
      });
    });
  });

  const items = () => [...(list?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  /* Depends on `list`, not on a frame. The container does not exist until the `{#if}` has rendered
     it, so an effect that only watches `open` runs one tick too early and focuses nothing: the
     menu opened with focus still on `<body>`, so the first arrow press went to the page and Enter
     did nothing at all. Reading `list` here makes the effect wait for it. A sheet goes into the top
     layer first, because a popover that is not showing cannot take focus.

     AND THE FOCUS WAITS FOR THE PAGE TO CATCH UP. A menu opened again on its way out is the same
     list, still `inert` when this runs: the effect above has said it is no longer leaving, and the
     attribute is written after this one. Focus into an inert list goes nowhere, so the second menu
     of a step (Day of, Move) opened with focus on `<body>`, which is the bug above come back. */
  $effect(() => {
    if (!open || !list) return;
    if (sheet && typeof list.showPopover === 'function' && !list.matches(':popover-open')) list.showPopover();
    if (sheet) lift ??= scrims.lay();
    void tick().then(() => {
      if (open && !leaving) items()[0]?.focus();
    });
  });

  /* A menu that goes with its sheet still up gives the scrim back with it. */
  $effect(() => () => {
    lift?.();
    lift = null;
  });

  /* ONCE PER OPENING. A press on the sheet's scrim can reach both the list's click and the window's,
     and `onclose` hands focus back to the row, which is a thing to do once. */
  function close() {
    if (!open) return;
    open = false;
    onclose?.();
  }

  /**
   * The popover form closes on a press anywhere else, at pointerdown, so the press also reaches
   * what it landed on. The sheet closes on a CLICK of its scrim that began while it was open,
   * `Menu.svelte`'s rule and its reason: closing at pointerdown let the release land on the row the
   * scrim had covered.
   */
  let pressed = false;

  function onPointerDown(e: PointerEvent) {
    pressed = open && sheet;
    if (open && !sheet && list && !list.contains(e.target as Node)) close();
  }

  function onWindowClick(e: MouseEvent) {
    const began = pressed;
    pressed = false;
    if (!began || !open || !sheet || !list || e.detail === 0) return;
    const r = list.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
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

  /* Below the row normally; above it when there is not room. 240 is the tallest this menu gets. It
     pops from the edge nearest the row: its top below the row, its bottom above it. */
  const HEIGHT = 240;
  const placed = $derived.by(() => {
    const spot = at ?? kept;
    if (!spot) return { left: 0, top: 0, from: '0%' };
    const below = spot.y + spot.height + 4;
    const flip = below + HEIGHT > window.innerHeight;
    return {
      left: Math.min(spot.x, window.innerWidth - 260),
      top: flip ? Math.max(8, spot.y - HEIGHT) : below,
      from: flip ? '100%' : '0%',
    };
  });
</script>

<svelte:window onpointerdown={onPointerDown} onclick={onWindowClick} />

{#if shown}
  <!-- `tabindex="-1"` because the container listens for keys but must never be a tab stop: the
       items are the stops and the roving focus moves between them. The sheet form takes no
       coordinates: its rules place it against the bottom of the screen. On its way out it is
       inert, so nothing in it can be pressed or reached while it goes. -->
  <div
    bind:this={list}
    class="row-menu"
    data-leaving={leaving ? '' : undefined}
    inert={leaving}
    role="menu"
    tabindex="-1"
    aria-label={label}
    popover={sheet ? 'manual' : undefined}
    style={sheet ? undefined : `left:${placed.left}px; top:${placed.top}px; --row-menu-from:${placed.from}`}
    {onkeydown}
    onclick={() => close()}
  >
    {@render children()}
    {#if handable && hand}
      <button
        type="button"
        class="row-menu-hand"
        role="menuitem"
        onclick={() => {
          handing = hand ?? null;
          handOpen = true;
        }}
      >
        <Icon name="people" size="s" />
        <span>{copy.handTo}</span>
      </button>
    {/if}
    <!-- A menu item, so the arrows reach it; the list's click closes the menu on it. -->
    {#if sheet}<button type="button" class="row-menu-cancel" role="menuitem">{words.cancel}</button>{/if}
  </div>
{/if}

{#if handing}
  {#await import('./HandSheet.svelte') then loaded}
    <loaded.default bind:open={handOpen} register={handing.register} row={handing.row} decl={handing.decl} onhanded={handing.onhanded} />
  {/await}
{/if}

<style>
  /* `Menu.svelte`'s surface: the tile's colour with a hairline and the second level's shadow, radius `--r-md`, no glass
     (DIRECTION 39), and its motion: in from .96 over the menu's step on the arriving curve, and out to .985 as it fades
     over the exit's on the leaving one. */
  .row-menu {
    --row-menu-from: 0%;
    --row-menu-pop: scale(0.96);
    --row-menu-gone: scale(0.985);
    --row-menu-from-opacity: 1;
    --row-menu-gone-opacity: 1;

    position: fixed;
    z-index: var(--z-palette);
    min-inline-size: 252px;
    padding: var(--sp-2);
    background: var(--tile);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--rule), var(--e2);
    transform-origin: 0% var(--row-menu-from);
    transition-property: transform, opacity;
    transition-duration: var(--d-menu);
    transition-timing-function: var(--ease-out);
  }

  /* No fade on the way in, for `Menu.svelte`'s reason: a menu at .96 of its size is readable. */
  @starting-style {
    .row-menu {
      transform: var(--row-menu-pop);
      opacity: var(--row-menu-from-opacity);
    }
  }

  .row-menu[data-leaving] {
    transform: var(--row-menu-gone);
    opacity: 0;
    pointer-events: none;
    transition-duration: var(--d-exit);
    transition-timing-function: var(--ease-in);
  }

  /* THE ROW, WHATEVER CLASS THE CALLER GAVE IT, as `Menu.svelte` draws it: 32 tall, an icon, the word, a key cap. */
  .row-menu :global([role='menuitem']) {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--sp-6);
    padding-block: 0;
    padding-inline: var(--sp-2);
    border-radius: var(--r-sm);
    font-size: var(--fs-ctl);
    transition: background var(--d-state) var(--ease-out);
  }

  .row-menu :global([role='menuitem'] > .kbd-run) {
    margin-inline-start: auto;
  }

  /* "Hand to" drawn as the caller's items are: the same row, glyph first, the same wash on hover. */
  .row-menu-hand {
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .row-menu-hand:focus-visible {
    background: var(--field);
    color: var(--ink);
  }

  /* Hover only where there is one: a phone keeps `:hover` on the last row tapped. */
  @media (hover: hover) and (pointer: fine) {
    .row-menu-hand:hover {
      background: var(--field);
      color: var(--ink);
    }
  }

  /* Rendered only for a sheet; the sheet's rule below draws it. */
  .row-menu-cancel {
    display: none;
  }

  /* THE ACTION SHEET, `Menu.svelte`'s form: every UA default for a popover is taken back, and from
     640px up, which only a coarse pointer reaches, it is 560px wide in the middle of the bottom edge.
     A sheet, not glass: a tile's surface at radius `--r-lg`, the third level, over the scrim, and it
     moves as one: up from below the screen over `--d-panel` on the sheet curve, back down it in `--d-panel-out`. */
  .row-menu[popover] {
    --row-menu-pop: translateY(calc(100% + var(--kb)));
    --row-menu-gone: translateY(calc(100% + var(--kb)));

    inset-block: auto var(--kb);
    inset-inline: 0;
    inline-size: min(100%, 560px);
    min-inline-size: 0;
    block-size: auto;
    max-block-size: calc(88dvh - var(--kb));
    margin-block: 0;
    margin-inline: auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--sp-2) var(--sp-2) calc(var(--sp-2) + env(safe-area-inset-bottom));
    background: var(--tile);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    border: 0;
    border-start-start-radius: var(--r-lg);
    border-start-end-radius: var(--r-lg);
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    color: var(--ink);
    box-shadow: var(--e3);
    transition-duration: var(--d-panel);
    transition-timing-function: var(--ease-sheet);
  }

  .row-menu[popover][data-leaving] {
    opacity: var(--row-menu-gone-opacity);
    transition-duration: var(--d-panel-out, var(--d-rows));
    transition-timing-function: var(--ease-sheet);
  }

  .row-menu[popover]::backdrop {
    background: var(--scrim);
    transition: opacity var(--d-panel) var(--ease-sheet);
  }

  @starting-style {
    .row-menu[popover]::backdrop {
      opacity: 0;
    }
  }

  .row-menu[popover][data-leaving]::backdrop {
    opacity: 0;
    pointer-events: none;
    transition-duration: var(--d-panel-out, var(--d-rows));
  }

  /* 48px rows at 16px, whatever class the caller gave its items. */
  .row-menu[popover] :global([role='menuitem']) {
    min-block-size: calc(var(--tap) + var(--sp-1));
    font-size: var(--t-md);
  }

  /* A caller's key hints are for a keyboard, and a sheet is where a thumb is. */
  .row-menu[popover] :global(kbd) {
    display: none;
  }

  .row-menu[popover] .row-menu-cancel {
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

  /* A FADE IN PLACE OF EVERY MOVE. The a11y layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .row-menu,
    .row-menu[popover] {
      --row-menu-pop: none;
      --row-menu-gone: none;
      --row-menu-from-opacity: 0.6;
      --row-menu-gone-opacity: 0;
    }
  }

  /* UNDER FORCED COLOURS the shadow is gone, so the menu's edge is a border. */
  @media (forced-colors: active) {
    .row-menu,
    .row-menu[popover] {
      border: 1px solid CanvasText;
    }
  }
</style>
