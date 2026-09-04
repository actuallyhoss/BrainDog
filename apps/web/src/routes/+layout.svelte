<!--
  The shell: a skip link, the rail or the tab bar, the palette, the toast stack, and one polite live
  region.

  The live hairline across the top is the record's own state. It is two pixels and it is ALWAYS
  there, because "a surface showing nothing must never be indistinguishable from a surface with
  nothing to show" (19 §6) — but "always there" is not the same as "always coloured", and it was
  built the wrong way round once. A saturated stripe across the full width of every screen, painted
  in the one colour reserved for *this is interactive*, is a permanent alarm for the state in which
  nothing is wrong. So the healthy state is the boundary colour, indistinguishable from the chrome
  it sits in, and the bar takes an intent only when the connection has actually taken one.

  The offline signal must not cry wolf, which is a detection rule and not a styling one:
  `navigator.onLine` reports online on a LAN with no internet, so the real signal is a failed write,
  never the browser's guess. Once it IS detected, it is shown as what it is — writes will fail.
-->
<script lang="ts">
  /* The shared skin first: `tokens.css` opens with the `@layer` statement, so the layer ORDER — and
     with it the rule that no installed theme can reach the a11y layer — is established before any
     other stylesheet is parsed. */
  import '@braindog/skin/tokens.css';
  import '@braindog/skin/base.css';
  import '@braindog/skin/a11y.css';

  import '../app.css';
  import '$lib/blocks.css';
  import '$lib/ui/rows.css';
  import '$lib/ui/controls.css';

  import { copy } from '$lib/copy.ts';
  import { GoPrefix, overlays, typing } from '$lib/a11y/keys.svelte.ts';
  import Sidebar from '$lib/ui/Sidebar.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import TabBar from '$lib/ui/TabBar.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Palette from '$lib/palette/Palette.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Keymap from '$lib/ui/Keymap.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let { data, children } = $props();

  /* Two surfaces carry no shell. `/start` because a record with zero registers has no nav to draw,
     and `/s/<token>` because a shared page is a capability URL: it renders one page, read-only,
     with no nav and no palette, and must not imply there is a record behind it (50 §5.13 step 6). */
  const bare = $derived(page.url.pathname === '/start' || page.url.pathname.startsWith('/s/'));

  let paletteOpen = $state(false);
  let keymapOpen = $state(false);
  let moreOpen = $state(false);
  let railOff = $state(false);
  const go = new GoPrefix();

  /** `ponytail:` a constant in the mock-up. The live channel is `lib/data/live.ts` in the real app:
      a hibernatable WebSocket carrying `{ version, registers }` and nothing else. */
  const live: 'open' | 'polling' | 'offline' = 'open';

  /** Where `g` then a letter lands. `g 1`–`g 9` address the nth item of YOUR nav, in YOUR order. */
  const GOTO: Record<string, string> = { h: '/', d: '/decide', i: '/inbox', s: '/search', v: '/vault', p: '/packs', ',': '/settings/appearance' };

  function onkeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    // `overlaid() > 0` silences every hotkey except close. The counter, not a boolean, so two
    // overlays closing in the wrong order do not unlock early.
    if (overlays.depth > 0 && !mod) return;

    // Never while typing. One test, in the registry, and no screen implements its own.
    if (typing() && !mod) return;

    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      paletteOpen = true;
      return;
    }

    /* `⌘\` — the rail folds to nothing and the work takes the width. Not a narrow icon rail:
       19 §3's whole argument is that this nav is a QUERY over `page` rows whose length varies per
       customer, and a strip of unlabelled icons is where a variable-length sectioned list goes to
       become unreadable. Hidden, with `g` and the palette still reaching everything. */
    if (mod && e.key === '\\') {
      e.preventDefault();
      railOff = !railOff;
      return;
    }

    /* `⌘Z` — the newest undo the toast stack is still offering. The stack IS the undo history here,
       which is the honest shape for it: an undo that outlives its own toast is an undo with no
       label, and 02 §8 makes the unit a `batch` rather than a keystroke anyway. */
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (!toasts.undoLast()) toasts.push(copy.nothingToUndo);
      return;
    }
    if (typing()) return;

    if (go.armed) {
      const target = GOTO[e.key.toLowerCase()];
      const digit = Number(e.key);
      go.disarm();
      if (target) {
        e.preventDefault();
        goto(target);
      } else if (digit >= 1 && digit <= 9 && data.nav[digit - 1]) {
        e.preventDefault();
        goto(data.nav[digit - 1]!.href);
      }
      return;
    }

    if (e.key === 'g') {
      go.arm();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      paletteOpen = true;
      return;
    }
    // `?` is help. It is never "ask the assistant".
    if (e.key === '?') {
      e.preventDefault();
      keymapOpen = true;
    }
  }
</script>

<svelte:window {onkeydown} />

<a class="skip" href="#main">Skip to content</a>

<!-- The record's own state, two pixels, always there. Solid while the socket is open, dashed while
     polling, dim when a write has actually failed — never from `navigator.onLine`, which reports
     online on a LAN with no internet. And the chip must not cry wolf: one that appears and withdraws
     on every open is a chip nobody believes the day it is true (19 §6). -->
<div class="live" data-state={live} aria-hidden="true"></div>

{#if bare}
  <main id="main">{@render children()}</main>
{:else}
  <div class="shell" data-rail={railOff ? 'off' : undefined}>
    <div class="rail-slot">
      <Sidebar
        nav={data.nav}
        pen={data.pen}
        record={data.index.name}
        records={data.me.records}
        registers={data.index.registers}
        open={data.questions.length}
        inbox={data.inbox}
      />
    </div>

    <main id="main" class="body">
      {@render children()}
    </main>
  </div>

  <div class="tab-slot">
    <TabBar open={data.questions.length} inbox={data.inbox} onmore={() => (moreOpen = true)} />
  </div>

  <!--
    The mark, and the only place it appears in the app chrome.

    It used to sit at the top of the rail, where a logo is decoration: it names the product you are
    already inside, and spends the most valuable sixty pixels on the screen doing it. Here it has a
    job. It opens the palette — the one surface that reaches anything in the record — from the
    corner every product has trained people to look in.

    NOT AN ASSISTANT AND NOT A PANEL OF ITS OWN. There was a version of this with a prompt field and
    four suggested questions, and it was wrong twice over: a record you talk to instead of read is
    a different product, and a second overlay that does most of what the palette does is a second
    place to look for one thing. The button opens the palette that already exists.
  -->
  <button type="button" class="launcher tap" onclick={() => (paletteOpen = true)} aria-label={copy.paletteLabel}>
    <Mark height={26} tone="inherit" />
  </button>

  <Palette bind:open={paletteOpen} nav={data.nav} />
{/if}

<Sheet bind:open={keymapOpen} title={copy.keymap} subtitle={copy.keymapHint}>
  <Keymap />
</Sheet>

<Sheet bind:open={moreOpen} title={copy.more}>
  <nav class="more-nav">
    {#each data.nav as entry}<a href={entry.href} onclick={() => (moreOpen = false)}>{entry.title}</a>{/each}
    <hr />
    <a href="/search" onclick={() => (moreOpen = false)}>{copy.search}</a>
    <a href="/packs" onclick={() => (moreOpen = false)}>{copy.packs}</a>
    <a href="/vault" onclick={() => (moreOpen = false)}>{copy.vault}</a>
    <a href="/settings/appearance" onclick={() => (moreOpen = false)}>{copy.settings}</a>
    <a href="/audit" onclick={() => (moreOpen = false)}>{copy.audit}</a>
  </nav>
</Sheet>

<!-- One stack, one live region, on every surface including the two that carry no shell: an action
     taken from a shared page still has to be able to report itself. -->
<Toasts />

<!-- Debounced elsewhere; a live region that announces on every keystroke is unusable (13 §7). -->
<div class="sr-only" role="status" aria-live="polite"></div>

<style>
  .skip {
    position: fixed;
    inset-block-start: var(--sp-2);
    inset-inline-start: var(--sp-2);
    z-index: var(--z-hint);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    transform: translateY(-200%);
  }

  .skip:focus-visible {
    transform: none;
  }

  .live {
    position: fixed;
    inset-block-start: 0;
    inset-inline: 0;
    z-index: var(--z-hint);
    block-size: 2px;
    background: var(--line);
  }

  .live[data-state='polling'] {
    background: repeating-linear-gradient(90deg, var(--warn) 0 8px, var(--line) 8px 16px);
  }

  .live[data-state='offline'] {
    background: var(--danger);
  }

  /* Rail on the darker ground, work on the lighter one, one hairline between them, and no inset
     panel: nothing floats, so nothing needs a shadow to explain why it floats. The work area is the
     ONE scroll container, so the rail never moves and the window shows exactly one scrollbar. */
  .shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    block-size: 100dvh;
    overflow: hidden;
  }

  .shell[data-rail='off'] .rail-slot {
    display: none;
  }

  .body {
    min-inline-size: 0;
    background: var(--bg);
    border-inline-start: 1px solid var(--line);
    overflow-y: auto;
    overscroll-behavior: contain;
    /* The launcher floats over the bottom-right corner of every surface, so every surface ends
       above it. A floating button that covers the last row of a list hides exactly the thing a long
       list is scrolled to the bottom to see. */
    padding-block-end: calc(var(--tap) + var(--sp-5));
  }

  /* Below 900px the rail becomes a tab bar; above it, the tab bar does not exist. */
  .tab-slot {
    display: none;
  }

  /* A RED CIRCLE. The mark reversed out of its own colour, 52px, bottom-right, and nothing else in
     it — no label, no count, no chevron. It is the product's own drawing, so the drawing is the
     whole affordance; a word beside it would be explaining a logo.

     The only control in the app that floats, and therefore the only place a shadow is allowed to
     exist. Everything else is flat because everything else is IN the page; this is over it, and a
     thing over the page that casts nothing reads as stuck to the glass. It uses the generated
     elevation ladder rather than a number invented here. */
  .launcher {
    position: fixed;
    inset-block-end: var(--sp-5);
    inset-inline-end: var(--sp-5);
    z-index: var(--z-hint);
    display: grid;
    place-items: center;
    inline-size: 52px;
    block-size: 52px;
    padding: 0;
    background: var(--brand);
    border: 0;
    border-radius: 999px;
    box-shadow: var(--e2);
    color: var(--accent-ink);
    cursor: pointer;
    transition:
      transform var(--d-state) var(--ease-out),
      box-shadow var(--d-state) var(--ease-out);
  }

  .launcher:hover {
    box-shadow: var(--e3);
    transform: translateY(-1px);
  }

  .launcher:active {
    transition-duration: var(--d-press);
    transform: none;
    box-shadow: var(--e1);
  }

  @media (prefers-reduced-motion: reduce) {
    .launcher,
    .launcher:hover,
    .launcher:active {
      transform: none;
    }
  }

  @media (width < 900px) {
    .rail-slot {
      display: none;
    }

    .shell {
      grid-template-columns: minmax(0, 1fr);
    }

    .body {
      border: 0;
      padding-block-end: calc(56px + var(--sp-6));
    }

    .tab-slot {
      display: block;
    }

    /* The tab bar owns the bottom of a phone, so the circle lifts clear of it rather than covering
       the fifth tab. It stays a circle and stays in the corner: one launcher, one shape, one place
       to look, whatever the window is doing. */
    .launcher {
      inset-block-end: calc(56px + var(--sp-3));
      inset-inline-end: var(--sp-3);
      inline-size: 48px;
      block-size: 48px;
    }
  }

  .more-nav {
    display: flex;
    flex-direction: column;
  }

  .more-nav a {
    min-block-size: var(--tap);
    display: flex;
    align-items: center;
    color: var(--ink);
    text-decoration: none;
  }

  .more-nav hr {
    inline-size: 100%;
    border: 0;
    border-block-start: 1px solid var(--line);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
