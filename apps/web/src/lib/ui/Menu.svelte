<!--
  The one menu: a list of verbs that opens beside the thing it acts on with a mouse,
  and rises from the bottom of the screen as THE sheet (`Sheet kind="menu"`) under a thumb.

  TWO WAYS TO OPEN IT. With a `trigger`, the menu is a button and a list that hangs from it. With `at`, a rect, there is
  no button: the list is placed at that rect and clamped to the screen, which is how a row's menu opens from `⇧F10`
  (`RowMenu` is this, with its own last item). The items, the keys and the roles are the same in every form.

  AND A MENU WITH A BUTTON OPENS AT THE POINTER TOO: a right-click, a held thumb or `⇧F10` on the item it belongs to
  sends its trigger `menuat` (`context-menu.ts`), and the same list opens at that point, drawn at the end of the page so
  no card around it can clip it, and gives focus back to what had it.

  NOT A `<dialog>` WITH A MOUSE. A menu is a short list of things to do to the thing you clicked, and with a mouse it
  belongs next to that thing: a modal for six items takes the whole screen away to offer you a choice you could have
  made in place. Under a thumb (below 640px, or a coarse pointer at any width) a list the size of a trigger opened under
  the finger that pressed it, so there it is the bottom sheet, with 48px rows and a Cancel row at its foot.

  THE KEYBOARD CONTRACT is the one every platform's menu has: Enter/Space/Down opens and lands on the first item, Up
  opens and lands on the last, Home/End jump, Esc closes and returns focus to where it came from. `aria-expanded` on the
  trigger, `role="menu"` on the list, `role="menuitem"` on the items. Typing a letter is not implemented and is
  deliberately not faked. A menu opened at a rect owns the whole keyboard while it is open, since nothing under it
  should act on the same press; one hung from a trigger lets the keys it does not claim reach the page.

  A CHECKABLE ITEM LEAVES THE MENU OPEN. `role="menuitemcheckbox"` (or `menuitemradio`) is a choice somebody may make
  twice in one visit, so a menu that shut on the first made them open it again for the second. An ordinary `menuitem`
  is a verb, and doing it is the end of the menu.

  THE SURFACE: `--tile`, a 1px `--rule-strong` edge, radius 12, no shadow and no blur. THE ROWS, whatever class the
  caller drew them with: the browser's button taken back to nothing (no border, no fill, the inherited font), 36 tall,
  14, start-aligned, a 16px icon in a 20px slot, `--hover` under the pointer and on focus, the focus ring inside the row
  (offset -2, so the menu's edge never clips it), `--ink-3` when disabled, 600 for the place you are in.

  IT OPENS AND CLOSES, AND THE CLOSE IS SHORTER. It pops from .96 of its size at the corner it hangs from over
  `--d-menu` on the arriving curve, and closes to .985 as it fades over `--d-exit` on the leaving one. The list stays
  on the page, inert, until its close has played (`settled` in `panel.ts`), and an opening on the way out takes the
  same list back. The sheet moves as every sheet does. Reduced motion fades instead.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { settled } from './panel.ts';
  import { menuAt, pressedDialog, takePressedLink, type MenuAt } from './context-menu.ts';
  import { at as inApp, here as inside } from '../at.ts';
  import { linkWords } from '../things/verbs.ts';
  import { inIosApp, inMacApp } from '../shell.ts';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let {
    label,
    align = 'start',
    open = $bindable(false),
    trigger,
    at,
    onclose,
    children,
  }: {
    /** Names the menu for a screen reader; the trigger's own text is usually not enough. */
    label: string;
    align?: 'start' | 'end';
    open?: boolean;
    /** The button's face. Without one the menu opens at `at`. */
    trigger?: Snippet | undefined;
    /** A rect in the window to open at, for a menu with no button (a row's, from the keyboard). Taken at open. */
    at?: { x: number; y: number; height: number } | null | undefined;
    /** Told once each time the menu closes, however it closed. */
    onclose?: (() => void) | undefined;
    children: Snippet;
  } = $props();

  let root = $state<HTMLElement>();
  let button = $state<HTMLButtonElement>();
  let list = $state<HTMLElement>();

  const words = { cancel: 'Cancel' };

  /** A menu with no button, opened at a rect. */
  const anchored = $derived(trigger === undefined);

  /** WHERE A RIGHT-CLICK OPENED A MENU THAT HAS A BUTTON, and what had focus then; null when it hangs from its button. */
  let point = $state.raw<{ x: number; y: number; height: number } | null>(null);
  let back: HTMLElement | null = null;
  /** Placed at a rect, by its caller or by the pointer, rather than hung from a button. */
  const floating = $derived(anchored || point !== null);

  /**
   * WHEN THE MENU IS THE SHEET: below 640px, or under a coarse pointer at any width (design 6.3). Read once each time
   * the menu opens, so a menu never changes form while it is open, and held through the close.
   */
  const SHEET = '(width < 640px), (pointer: coarse)';
  let sheet = $state(false);

  /**
   * WHETHER THE POPOVER LIST IS ON THE PAGE, which is longer than it is open: from the opening to the end of its close.
   * `leaving` is the close, while it plays. The sheet keeps its own: it is drawn closed between openings.
   */
  let shown = $state(false);
  let leaving = $state(false);
  /**
   * WHICH CLOSE IS THE LATEST, so only that one takes the list away. Opening counts one too: a close that was playing
   * when the menu opened again, or one still waiting for its first frame, finds a newer number and leaves the list.
   */
  let exits = 0;
  let stay: (() => void) | null = null;

  /** WHERE IT WAS OPENED, kept for the close: a caller may forget the rect the moment its menu closes. */
  let kept = $state.raw<{ x: number; y: number; height: number } | null>(null);

  /** Whether this opening has been told closed, so a close reached two ways is said once. */
  let told = true;

  /**
   * THE LINK THIS OPENING CAME FROM (`context-menu.ts`): a host's menu opened from its link gains what the browser's menu
   * would have offered there, ahead of its own items, and an item of its own saying the same (`data-link-verb`) stands
   * down, so there is one Open. In a native app one window is all there is, so a new tab would be one more Open.
   */
  let link = $state<string | null>(null);
  const oneWindow = inIosApp || inMacApp;
  let clip: typeof import('../clipboard.ts') | null = null;
  const onPage = (href: string): boolean => !href.includes('?') && inside(location.pathname) === inside(href);

  function ended() {
    if (told) return;
    told = true;
    onclose?.();
  }

  $effect(() => {
    const want = open && (!anchored || at != null);
    const spot = at ?? point;
    untrack(() => {
      if (want) {
        exits++;
        stay?.();
        stay = null;
        if (!shown) sheet = matchMedia(SHEET).matches;
        /* A MENU WITH NO BUTTON GIVES FOCUS BACK TO WHAT HAD IT, as one with a button gives it to the button. */
        if (told && anchored) back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (told) {
          link = takePressedLink();
          if (link) void import('../clipboard.ts').then((m) => (clip = m));
        }
        if (spot) {
          if (kept !== spot) fitted = null;
          kept = spot;
        }
        told = false;
        leaving = false;
        if (!sheet) shown = true;
        return;
      }
      /* THE SHEET CLOSES ITSELF, and says so through its own `onclose`. */
      if (sheet) return;
      if (!shown || leaving) {
        ended();
        return;
      }
      leaving = true;
      ended();
      const mine = ++exits;
      /* After the list wears `data-leaving`, so the close it starts is the one waited for. */
      void tick().then(() => {
        if (mine !== exits) return;
        const gone = () => {
          if (mine !== exits) return;
          stay = null;
          shown = false;
          leaving = false;
          point = null;
        };
        if (list) stay = settled(list, gone);
        else gone();
      });
    });
  });

  /* A MENU OPENED AT A RECT FOCUSES ITS FIRST ITEM once the list exists, and once the page has caught up: a menu opened
     again on its way out is the same list, still `inert` when this runs. The sheet's dialog focuses its first row
     itself. */
  $effect(() => {
    if (!open || !list || !floating || sheet) return;
    void point;
    untrack(fit);
    void tick().then(() => {
      if (open && !leaving) items()[0]?.focus();
    });
  });

  const items = () =>
    [...(list?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]') ?? [])].filter((el) => el.getClientRects().length > 0 || sheet);

  /* A MENU AT THE POINTER WHOSE ITEMS ARRIVE AFTER IT (a thing's, read as it opened) is placed again as it grows, so it never
     runs off the screen. */
  $effect(() => {
    if (!open || !list || !floating || sheet) return;
    let frame = 0;
    /* On the next frame: a fit changes the size it is watching, and a change inside the callback is a loop the browser complains of. */
    const seen = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => untrack(fit));
    });
    seen.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      seen.disconnect();
    };
  });

  /** The gap the panel keeps from the edge of the screen. Eight, so a clamped menu reads as near the edge, not welded. */
  const GUTTER = 8;

  /**
   * KEEP A HUNG MENU ON THE SCREEN. `translate` and `max-block-size`, not a rewrite to `position: fixed`: the panel has
   * to stay anchored to its trigger while the page scrolls underneath it, and an absolutely positioned panel already
   * moves with its trigger; all it needs is a correction, measured in device pixels. Measured WITHOUT ITS SCALE
   * (`offset*`, which no transform touches), since it pops from .96 and is still that size when this runs. It also
   * says which edge it pops from: the top, or the bottom when it opens above its trigger.
   */
  function place() {
    if (!list || sheet || floating) return;
    list.style.setProperty('--menu-shift', '0px');
    list.style.setProperty('--menu-lift', '0px');
    list.style.setProperty('--menu-room', 'none');
    list.style.setProperty('--menu-from', '0%');

    const view = document.documentElement;
    const anchor = root?.getBoundingClientRect();
    const left = (anchor?.left ?? 0) + list.offsetLeft;
    const top = (anchor?.top ?? 0) + list.offsetTop;
    const box = { left, top, right: left + list.offsetWidth, height: list.offsetHeight };

    const past = Math.max(0, box.right - (view.clientWidth - GUTTER));
    const before = Math.max(0, GUTTER - box.left);
    if (past || before) list.style.setProperty('--menu-shift', `${Math.round(before - past)}px`);

    /* A MENU IN A DIALOG FITS THE DIALOG (4 Nov): a dialog clips what hangs past its edge, so measuring against the window
       opened Slash's picker downward with plenty of room on screen and none in the panel, and its focus then scrolled
       the panel's head away. */
    const frame = root?.closest('dialog');
    const clip = frame && getComputedStyle(frame).overflowY !== 'visible' ? frame.getBoundingClientRect() : null;
    const below = (clip ? Math.min(clip.bottom, view.clientHeight) : view.clientHeight) - GUTTER - box.top;
    const above = (anchor?.top ?? 0) - (clip ? Math.max(clip.top, 0) : 0) - GUTTER;
    /* Above only when it does not fit below AND there is more room there: a menu that flips for a few pixels moves
       under the finger that opened it. */
    if (box.height > below && above > below) {
      const height = Math.min(box.height, above);
      list.style.setProperty('--menu-lift', `${-Math.round(height + (anchor?.height ?? 0) + 12)}px`);
      list.style.setProperty('--menu-room', `${Math.round(above)}px`);
      list.style.setProperty('--menu-from', '100%');
    } else if (box.height > below) {
      list.style.setProperty('--menu-room', `${Math.round(Math.max(below, 0))}px`);
    }
  }

  /* AT A RECT: below it, or above it when there is not room, and never past the screen's end edge. The first placing
     guesses 240 for the list's height; once the list is drawn `fit` measures it and places it again, before the first
     frame, so a long row menu never runs off the bottom of the window. It pops from the edge nearest the rect. */
  const HEIGHT = 240;
  let fitted = $state.raw<{ left: number; top: number; from: string; room: number | null } | null>(null);
  const placed = $derived.by(() => {
    const spot = at ?? point ?? kept;
    if (!spot || typeof window === 'undefined') return { left: 0, top: 0, from: '0%', room: null as number | null };
    const below = spot.y + spot.height + 4;
    const flip = below + HEIGHT > window.innerHeight;
    return {
      left: fitted?.left ?? Math.max(GUTTER, Math.min(spot.x, window.innerWidth - 260)),
      top: fitted?.top ?? (flip ? Math.max(GUTTER, spot.y - HEIGHT) : below),
      from: fitted?.from ?? (flip ? '100%' : '0%'),
      room: fitted?.room ?? null,
    };
  });

  /**
   * THE LIST'S ROOM, AND WHERE ITS `left` AND `top` ARE MEASURED FROM. On the page, the window. In a dialog, the dialog clips what
   * hangs past its edge, so the list stays inside it; and a dialog with a blur or a transform is what `position: fixed` inside
   * it is measured from, so the numbers are written from its corner (the palette, 5 Nov).
   */
  function roomOf(): { left: number; top: number; right: number; bottom: number; x: number; y: number } {
    const room = { left: GUTTER, top: GUTTER, right: window.innerWidth - GUTTER, bottom: window.innerHeight - GUTTER, x: 0, y: 0 };
    const frame = list?.closest('dialog');
    if (!frame) return room;
    const box = frame.getBoundingClientRect();
    const seen = getComputedStyle(frame);
    if (seen.overflowY !== 'visible' || seen.overflowX !== 'visible') {
      room.left = Math.max(room.left, box.left + GUTTER);
      room.top = Math.max(room.top, box.top + GUTTER);
      room.right = Math.min(room.right, box.right - GUTTER);
      room.bottom = Math.min(room.bottom, box.bottom - GUTTER);
    }
    const blur = (seen as unknown as { backdropFilter?: string; webkitBackdropFilter?: string }).backdropFilter ?? (seen as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter ?? 'none';
    if (seen.transform !== 'none' || seen.filter !== 'none' || blur !== 'none' || seen.translate !== 'none') {
      room.x = box.left + frame.clientLeft;
      room.y = box.top + frame.clientTop;
    }
    return room;
  }

  function fit() {
    const spot = at ?? point ?? kept;
    if (!list || !spot || sheet || !floating) return;
    /* ITS WHOLE HEIGHT, past any room it was held to last time, or a menu that had to scroll measures as one that fits. */
    const height = Math.max(list.offsetHeight, list.scrollHeight);
    const width = list.offsetWidth;
    const room = roomOf();
    const left = Math.max(room.left, Math.min(spot.x, room.right - width)) - room.x;
    const below = spot.y + spot.height + 4;
    const roomBelow = room.bottom - below;
    const roomAbove = spot.y - 4 - room.top;
    /* NOT BELOW NOR ABOVE, IN A SHORT DIALOG: it takes the whole of the room there is, and scrolls. */
    if (roomBelow < 120 && roomAbove < 120) {
      fitted = { left, top: room.top - room.y, from: '0%', room: Math.max(room.bottom - room.top, 0) };
    } else if (height <= roomBelow || roomBelow >= roomAbove) {
      fitted = { left, top: below - room.y, from: '0%', room: height > roomBelow ? Math.max(roomBelow, 0) : null };
    } else {
      const drawn = Math.min(height, roomAbove);
      fitted = { left, top: Math.max(room.top, spot.y - 4 - drawn) - room.y, from: '100%', room: height > roomAbove ? roomAbove : null };
    }
  }

  function show(land: 'first' | 'last') {
    point = null;
    open = true;
    // One frame, because the list does not exist until the `{#if}` has rendered it.
    requestAnimationFrame(() => {
      place();
      const all = items();
      (land === 'first' ? all[0] : all[all.length - 1])?.focus();
    });
  }

  function close(refocus = true) {
    if (!open) return;
    open = false;
    if (!refocus) return;
    if (point || anchored) (back?.isConnected ? back : button)?.focus();
    else button?.focus();
  }

  /** At the pointer, from `context-menu.ts`: the same list, placed at the point, the first item focused. */
  const heard = menuAt((d: MenuAt) => {
    back = d.back;
    point = { x: d.x, y: d.y, height: d.height };
    open = true;
  });

  /** A list at the pointer is drawn at the end of the page, so no card, scroller or stacking context around its button
      can clip it or put it under a neighbour; or at the end of the dialog it was opened in, since a modal dialog makes
      everything outside it inert and draws over it. */
  function lifted(node: HTMLElement) {
    const home = root?.closest('dialog[open]') ?? (anchored ? pressedDialog() : null) ?? pressedDialog() ?? document.body;
    home.appendChild(node);
    return () => node.remove();
  }

  function onTriggerKey(e: KeyboardEvent) {
    /* The keys that open the menu are the menu's, or a page that binds Enter or an arrow acts on the same press. */
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
   * EVERY KEY THE MENU UNDERSTANDS IS SWALLOWED HERE, and with no button, every key: an open row menu owns the
   * keyboard, or Enter on an item fires the item AND the grid's Enter underneath. Not through the overlay counter,
   * which is the app's MODAL lock and stops the page scrolling: a hung menu is not a dialog.
   */
  function onListKey(e: KeyboardEvent) {
    const all = items();
    if (floating || ['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) e.stopPropagation();
    const n = all.indexOf(document.activeElement as HTMLElement);
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
      // Tab out of a menu closes it. Trapping focus in a non-modal popup is worse than letting go.
      if (!sheet) close(false);
    }
  }

  /** A verb closes the menu; a checkable item does not, so a second value is one press away. */
  function onListClick(e: MouseEvent) {
    const role = (e.target as Element).closest('[role^="menuitem"]')?.getAttribute('role');
    if (!role || role === 'menuitemcheckbox' || role === 'menuitemradio') return;
    close();
  }

  /** Pointerdown, not click: a click that lands on a control elsewhere should close this AND press that. */
  function onPointerDown(e: PointerEvent) {
    if (!open || sheet) return;
    const inside = floating ? list?.contains(e.target as Node) : root?.contains(e.target as Node);
    if (!inside) close(false);
  }
</script>

<svelte:window onpointerdown={onPointerDown} />

{#snippet rows(form: 'pop' | 'sheet')}
  <!-- `tabindex="-1"` because the list listens for keys but is never a tab stop: the items are the stops, and the
       roving focus moves between them. On its way out a hung list is inert, so nothing in it can be pressed. -->
  <div
    bind:this={list}
    class="menu"
    data-form={form}
    data-align={align}
    data-at={floating ? '' : undefined}
    data-leaving={form === 'pop' && leaving ? '' : undefined}
    inert={form === 'pop' && leaving}
    role="menu"
    tabindex="-1"
    aria-label={label}
    style={form === 'pop' && floating
      ? `left:${placed.left}px; top:${placed.top}px; --menu-from:${placed.from}${placed.room === null ? '' : `; --menu-room:${placed.room}px`}`
      : undefined}
    onkeydown={onListKey}
    onclick={onListClick}
    data-link={link ? '' : undefined}
  >
    {#if link}
      {@const to = link}
      {#if !onPage(to)}<a role="menuitem" href={inApp(to)}><Icon name="arrow" size="s" /><span class="mi-name">{linkWords.open}</span></a>{/if}
      {#if !oneWindow}<a role="menuitem" href={inApp(to)} target="_blank" rel="noopener"><Icon name="external" size="s" /><span class="mi-name">{linkWords.newTab}</span></a>{/if}
      <button role="menuitem" type="button" onclick={() => void clip?.putHref(to)}><Icon name="link" size="s" /><span class="mi-name">{linkWords.copyLink}</span></button>
      <hr />
    {/if}
    {@render children()}
    <!-- A MENU ITEM, SO THE ARROWS REACH IT AND THE MENU'S ROLE HOLDS ONLY ITEMS: the list's click closes the menu on it. -->
    {#if form === 'sheet'}<button type="button" class="menu-cancel" role="menuitem">{words.cancel}</button>{/if}
  </div>
{/snippet}

{#if anchored}
  {#if sheet}
    <Sheet kind="menu" title={label} bind:open onclose={ended}>{@render rows('sheet')}</Sheet>
  {:else if shown}
    <div {@attach lifted}>{@render rows('pop')}</div>
  {/if}
{:else}
  <div class="menu-root" bind:this={root}>
    <button
      bind:this={button}
      type="button"
      class="menu-trigger tap"
      aria-haspopup="menu"
      aria-expanded={open}
      onclick={() => (open ? close() : show('first'))}
      onkeydown={onTriggerKey}
      {@attach heard}
    >
      {@render trigger?.()}
    </button>

    {#if sheet}
      <Sheet kind="menu" title={label} bind:open onclose={ended}>{@render rows('sheet')}</Sheet>
    {:else if shown && point}
      <div {@attach lifted}>{@render rows('pop')}</div>
    {:else if shown}
      {@render rows('pop')}
    {/if}
  </div>
{/if}

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
    border-radius: var(--r-ctl);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* THE TILE, OPAQUE, WITH ONE EDGE: a menu opens over busy content, and legibility is the whole of its job. A 1px
     `--rule-strong` edge says it floats; no shadow says it twice. */
  .menu[data-form='pop'] {
    /* The four the clamp writes, declared here so the panel is correct before `place()` has run. `--menu-from` is the
       edge it pops from, the top unless it opened above its trigger. */
    --menu-shift: 0px;
    --menu-lift: 0px;
    --menu-room: none;
    --menu-from: 0%;
    /* THE MOTION: where an opening starts and where a close ends, and the opacity at each end. An opening does not fade
       until reduced motion fades it in from a state that is still readable. */
    --menu-pop: scale(0.96);
    --menu-gone: scale(0.985);
    --menu-from-opacity: 1;
    --menu-x: 0%;

    position: absolute;
    inset-block-start: calc(100% + var(--sp-1));
    z-index: var(--z-palette);
    box-sizing: border-box;
    /* NEVER WIDER THAN THE SCREEN IT IS ON: 220 is what a menu asks for, and the screen less its two gutters is what it
       gets. The clamp is on the floor, because a minimum beats a maximum when the two disagree. */
    min-inline-size: min(max(100%, 220px), calc(100dvw - var(--sp-4)));
    max-block-size: var(--menu-room);
    overflow-y: auto;
    overscroll-behavior: contain;
    /* `translate` and not `transform`, because the pop owns `transform` and the two compose. */
    translate: var(--menu-shift) var(--menu-lift);
    padding: var(--sp-1);
    /* GLASS, READ ON (ops 5.5, 3 Nov): the regular film, radius 12, 4px inside, the popover's elevation. */
    background: var(--glass-regular);
    -webkit-backdrop-filter: var(--glass-filter);
    backdrop-filter: var(--glass-filter);
    box-shadow: var(--glass-edge), var(--elev-popover);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    /* AT ITS ANCHOR: the corner it hangs from, at the start or the end. */
    transform-origin: var(--menu-x) var(--menu-from);
    transition-property: transform, opacity;
    transition-duration: var(--d-menu);
    transition-timing-function: var(--ease-out);
  }

  /* AT A RECT, fixed to the window where the row was, and as wide as a row's verbs need. */
  .menu[data-form='pop'][data-at] {
    position: fixed;
    inset-block-start: auto;
    min-inline-size: min(252px, calc(100dvw - var(--sp-4)));
    translate: none;
  }

  /* THE FIRST FRAME OF AN OPENING. No fade on the way in: a menu at .96 of its size is readable. */
  @starting-style {
    .menu[data-form='pop'] {
      transform: var(--menu-pop);
      opacity: var(--menu-from-opacity);
    }
  }

  /* THE CLOSE: to .985 as it fades, over the exit's step on the leaving curve. Nothing on it can be pressed. */
  .menu[data-form='pop'][data-leaving] {
    transform: var(--menu-gone);
    opacity: 0;
    pointer-events: none;
    transition-duration: var(--d-exit);
    transition-timing-function: var(--ease-in);
  }

  .menu[data-form='pop'][data-align='start'] {
    inset-inline-start: 0;
  }

  .menu[data-form='pop'][data-align='end'] {
    --menu-x: 100%;

    inset-inline-end: 0;
  }

  .menu[data-form='pop'][data-at][data-align] {
    --menu-x: 0%;

    inset-inline: auto;
  }

  :global([dir='rtl']) .menu[data-form='pop'][data-align='start'] {
    --menu-x: 100%;
  }

  :global([dir='rtl']) .menu[data-form='pop'][data-align='end'] {
    --menu-x: 0%;
  }

  /**
   * THE ROW, WHATEVER CLASS THE CALLER GAVE IT. A `<button>` the caller drew brings the browser's own border, fill and
   * font, and on every ⋯ menu that read as broken (motion F1): it is all taken back here, once, so no caller has to.
   */
  .menu :global([role^='menuitem']) {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 32px;
    margin: 0;
    padding-block: 0;
    padding-inline: calc(10px * var(--dense, 1));
    appearance: none;
    background: none;
    border: 0;
    border-radius: var(--r-menu-row);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-regular);
    line-height: calc(20px * var(--type, 1));
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .menu :global([role^='menuitem']:focus-visible) {
    background: var(--menu-row-fill);
  }

  /* HOVER ONLY UNDER A POINTER THAT HOVERS (skills pass follow-up, 2 Nov): on a phone's bottom sheet a tap latched the
     fill on the item touched. */
  @media (hover: hover) and (pointer: fine) {
    .menu :global([role^='menuitem']:hover) {
      background: var(--menu-row-fill);
      color: var(--ink);
    }

    .menu :global([role^='menuitem'][aria-disabled='true']:hover),
    .menu :global([role^='menuitem']:disabled:hover) {
      background: none;
    }
  }

  /* THE RING INSIDE THE ROW, so the menu's edge never clips it. */
  .menu :global([role^='menuitem']:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .menu :global([role^='menuitem'][aria-disabled='true']),
  .menu :global([role^='menuitem']:disabled) {
    color: var(--ink-3);
    cursor: default;
  }

  /* THE PLACE YOU ARE IN, among a menu of places. */
  .menu :global([role^='menuitem'][aria-current]) {
    font-weight: var(--fw-semi);
  }

  /* A 16px ICON IN A 20px SLOT, in the second ink, so words beside icons start on one edge. */
  .menu :global([role^='menuitem'] > .icon:first-child) {
    flex: none;
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    margin-inline: 2px;
    color: var(--ink-2);
  }

  .menu :global([role^='menuitem'] > .mi-name) {
    flex: 1;
    min-inline-size: 0;
  }

  /* THE COLUMN THE WORDS START ON HOLDS WHICHEVER ITEM HAS WHAT: an add-on's or a record's item with no glyph of its own
     keeps the slot empty rather than starting further left. Every item the app itself draws has one (`menu-items` gate). */
  .menu :global([role^='menuitem']:not(.menu-cancel):not(:has(> .icon:first-child, > .mi-dot, > .mi-box, > .mi-slot, > .you-tile))::before) {
    content: '';
    flex: none;
    inline-size: calc(var(--icon-m) + 4px);
  }

  /* A HOST'S OWN OPEN AND COPY LINK STAND DOWN when the menu already leads with the link's three. */
  .menu[data-link] :global([data-link-verb]) {
    display: none;
  }

  /* A GOING VERB LOOKS IT: last in the menu, in the warning's ink. */
  .menu :global([role^='menuitem'][data-tone='bad']),
  .menu :global([role^='menuitem'][data-tone='bad'] > .icon:first-child) {
    color: var(--red);
  }

  .menu :global([role^='menuitem'] > .kbd-run) {
    margin-inline-start: auto;
  }

  /* A HAIRLINE BETWEEN GROUPS of verbs. */
  .menu :global(hr) {
    margin: var(--sp-1) 0;
    border: 0;
    border-block-start: 1px solid var(--rule);
  }

  /* Drawn only in the sheet. */
  .menu-cancel {
    display: none;
  }

  /* THE SHEET'S ROWS: 48 tall at the body size, the thumb's height, and no key hints, since a sheet is where a thumb
     is. */
  .menu[data-form='sheet'] :global([role^='menuitem']) {
    min-block-size: calc(var(--tap) + var(--sp-1));
    padding-inline: var(--sp-3);
    font-size: var(--fs-body);
  }

  .menu[data-form='sheet'] :global(kbd),
  .menu[data-form='sheet'] :global(.kbd-run) {
    display: none;
  }

  /* CANCEL is the last row, apart from the verbs by a hairline, and it is not one of them. */
  .menu[data-form='sheet'] .menu-cancel {
    display: flex;
    justify-content: center;
    margin-block-start: var(--sp-2);
    border-block-start: 1px solid var(--rule);
    border-radius: 0;
    font-weight: var(--fw-medium);
  }

  /* A FADE IN PLACE OF EVERY MOVE. The a11y layer shortens the duration; this takes the move away. */
  @media (prefers-reduced-motion: reduce) {
    .menu[data-form='pop'] {
      --menu-pop: none;
      --menu-gone: none;
      --menu-from-opacity: 0.6;
    }
  }

  /* UNDER FORCED COLOURS the edge is the system's text colour. */
  @media (forced-colors: active) {
    .menu[data-form='pop'] {
      border-color: CanvasText;
    }
  }
</style>
