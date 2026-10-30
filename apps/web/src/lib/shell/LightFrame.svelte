<!--
  THE LIGHT FRAME: sign-in, the screens under it, and sign-up (`light.ts`), drawn by the root layout in place of the app's
  frame (`AppFrame.svelte`), which a stranger here never loads.

  WHAT IT KEEPS OF THE APP'S FRAME is what these screens used from it, and nothing they did not: the skip link, the one
  scrolling surface the app frame draws bare screens on (`.bare`), the screen's settled mark (`data-screen`) cleared on
  every move, the quiet mark on the document (`data-quiet`), the first-drawn mark later work waits for, focus on the new
  screen's name after a move between them, and the Mac app's Go menu. No rail, no palette, no keys, no record reads:
  neither screen is inside a record, and neither draws a toast or a sheet.
-->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { drewFirst } from '$lib/data/first-drawn.ts';
  import { timingOpened } from '$lib/data/timing.ts';
  import { appPath, onShell } from '$lib/shell.ts';
  import { heard, quietFocus } from '$lib/ui/quiet-focus.ts';
  import { leaving, quiet, settled } from '$lib/ui/screen.svelte.ts';

  let { children }: { children: Snippet } = $props();

  /* The Mac app's Go menu and braindog://goto: only an address of the app moves the window (`appPath`). */
  $effect(() =>
    onShell('goto', (to) => {
      const path = appPath(to);
      if (path !== null) void goto(path);
    }),
  );

  /* CLEARED ON EVERY MOVE, or `data-screen` is the screen being left's answer until the next one arrives. */
  beforeNavigate(() => {
    leaving();
    timingOpened();
  });

  /* WHAT THE READER LAST DID, A KEY OR A PRESS, so a name focused after a move wears its ring only for a keyboard. */
  $effect(() => {
    const opts = { capture: true, passive: true } as const;
    addEventListener('keydown', heard, opts);
    addEventListener('pointerdown', heard, opts);
    return () => {
      removeEventListener('keydown', heard, opts);
      removeEventListener('pointerdown', heard, opts);
    };
  });

  /* A MOVE BETWEEN SIGN-IN AND SIGN-UP LANDS ON THE NEW SCREEN'S NAME, as the app frame's does: once it is drawn, while
     focus is on nothing, and never once the reader has pressed or typed. Back keeps the browser's own place. */
  afterNavigate((nav) => {
    if (nav.type === 'enter' || nav.type === 'popstate' || nav.to === null || nav.from === null) return;
    if (nav.from.url.pathname === nav.to.url.pathname || nav.to.url.hash) return;
    let touched = false;
    const touch = (): void => void (touched = true);
    addEventListener('pointerdown', touch, { capture: true, once: true });
    addEventListener('keydown', touch, { capture: true, once: true });
    const until = performance.now() + 1500;
    const look = (): void => {
      const h1 = document.getElementById('main')?.querySelector<HTMLElement>('h1');
      const now = document.activeElement;
      if (!touched && h1 && (now === null || now === document.body)) {
        if (!h1.hasAttribute('tabindex')) h1.tabIndex = -1;
        quietFocus(h1);
      }
      if (touched || performance.now() >= until) {
        removeEventListener('pointerdown', touch, { capture: true });
        removeEventListener('keydown', touch, { capture: true });
        return;
      }
      setTimeout(look, 16);
    };
    look();
  });

  /* THE QUIET MARK (`screen.svelte.ts`): `data-quiet` on the document while nothing is held out. */
  $effect(() => {
    document.documentElement.toggleAttribute('data-quiet', quiet());
  });

  /* THE FIRST SCREEN SETTLED IS THE FIRST SCREEN DRAWN (`first-drawn.ts`). */
  $effect(() => {
    if (settled() !== undefined) untrack(drewFirst);
  });
</script>

<a class="skip" href="#main">Skip to content</a>

<!-- ITS OWN SCROLL CONTAINER, because `html, body` are `overflow: hidden` (`AppFrame.svelte` says why). -->
<main id="main" class="bare" data-screen={settled()}>{@render children()}</main>

<style>
  /* THE APP FRAME'S SKIP LINK, the same box: 44 tall for a fine pointer, clear of the notch, off screen until focused. */
  .skip {
    position: fixed;
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    inset-block-start: calc(env(safe-area-inset-top) + var(--sp-2));
    inset-inline-start: calc(max(env(safe-area-inset-left), env(safe-area-inset-right)) + var(--sp-2));
    z-index: var(--z-hint);
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-xs);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  /* A SURFACE WITH NO SHELL SCROLLS ITSELF, `100dvh` because a phone's address bar is part of the window. */
  .bare {
    block-size: 100dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* A screen's name given focus by script after a move shows no ring to a pointer. */
  :global(main h1[tabindex='-1']:focus:not(:focus-visible)) {
    /* focus-ok: the heading takes focus by script after a page change; the ring stays for a keyboard. */
    outline: none;
  }

  /* NOR ON A COLD OPEN, which the browser counts as `:focus-visible` (`quiet-focus.ts`). */
  :global(main h1[data-quiet]:focus) {
    /* focus-ok: marked only while the reader's last act was not a key; Tab takes the mark off and the ring shows. */
    outline: none;
  }
</style>
