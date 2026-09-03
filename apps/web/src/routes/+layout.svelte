<!--
  The shell: a skip link, the rail or the tab bar, the palette, the toast stack, and one polite live
  region.

  The live hairline across the top is the record's own state — solid when the socket is open, dashed
  while polling, dim when offline. It is two pixels and it is always there, because "a surface
  showing nothing must never be indistinguishable from a surface with nothing to show" (19 §6). And
  the offline chip must not cry wolf: `navigator.onLine` reports online on a LAN with no internet, so
  the real signal is a failed write, never the browser's guess.
-->
<script lang="ts">
  import '../app.css';
  import '$lib/blocks.css';
  import '$lib/ui/rows.css';

  import { INBOX } from '$lib/record/api.ts';
  import { copy } from '$lib/copy.ts';
  import { GoPrefix, overlays, typing } from '$lib/a11y/keys.svelte.ts';
  import Sidebar from '$lib/ui/Sidebar.svelte';
  import TabBar from '$lib/ui/TabBar.svelte';
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
  const go = new GoPrefix();

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

<div class="live" data-state="open" aria-hidden="true"></div>

{#if bare}
  <main id="main">{@render children()}</main>
{:else}
  <div class="shell">
    <div class="rail-slot">
      <Sidebar
        nav={data.nav}
        pen={data.pen}
        record={data.index.name}
        registers={data.index.registers}
        open={data.questions.length}
        inbox={INBOX.length}
      />
    </div>

    <main id="main" class="body">
      {@render children()}
    </main>
  </div>

  <div class="tab-slot">
    <TabBar open={data.questions.length} inbox={INBOX.length} onmore={() => (moreOpen = true)} />
  </div>

  <button type="button" class="palette-launcher tap" onclick={() => (paletteOpen = true)} aria-label={copy.paletteLabel}>
    <Icon name="search" size="l" />
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
    background: var(--accent);
  }

  .live[data-state='polling'] {
    background: repeating-linear-gradient(90deg, var(--warn) 0 8px, transparent 8px 16px);
  }

  .live[data-state='offline'] {
    background: var(--line);
  }

  .shell {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    min-block-size: 100dvh;
  }

  .body {
    min-inline-size: 0;
    padding-block-end: var(--sp-7);
  }

  .tab-slot,
  .palette-launcher {
    display: none;
  }

  @media (width < 900px) {
    .rail-slot {
      display: none;
    }

    .shell {
      grid-template-columns: minmax(0, 1fr);
    }

    .body {
      padding-block-end: 76px;
    }

    .tab-slot {
      display: block;
    }

    /* The palette is a HEADER button, not a fifth tab: a command surface in a tab slot looks like
       another place to go (19 §3). */
    .palette-launcher {
      position: fixed;
      inset-block-start: max(var(--sp-2), env(safe-area-inset-top));
      inset-inline-end: var(--sp-2);
      z-index: var(--z-hint);
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: 40px;
      block-size: 40px;
      background: var(--s2);
      border: 1px solid var(--edge);
      border-radius: var(--r-sm);
      color: var(--ink2);
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
