<!--
  The live desk in the hero: the app's own window on Maya's made-up record, with four places to press through
  (§47's second design; §23: the product's own parts, never a screenshot).

  ALL FOUR PLACES ARE IN THE HTML. With scripting on, only the chosen one shows and the tab bar is a real tablist
  (arrows, Home and End move). With scripting off, the <noscript> rule below lays every place out one under another,
  each headed by its tab's name, and the bar no longer marks one as chosen. A <style> is not held by the page's
  script policy, so the rule needs no hash.

  THE BAR OPENS IN PLACE (`Ask.svelte`), widening the way the app's does, and the window takes `slashing` while it is
  open. The count on Needs you reads the shared asks (`needs.svelte.ts`), so the home page's red card moves it too.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import Mark from '../Mark.svelte';
  import { FOUNDER } from '../demo/maya.ts';
  import Agents from './Agents.svelte';
  import Ask from './Ask.svelte';
  import Needs from './Needs.svelte';
  import Project from './Project.svelte';
  import Today from './Today.svelte';
  import { needs } from './needs.svelte.ts';
  import { DESK, TABS, type Tab } from './words.ts';

  let chosen = $state<Tab>('today');
  let opened = $state(0);
  let asking = $state(false);
  let onscreen = $state(true);
  let win: HTMLDivElement;
  const tabs: Record<string, HTMLButtonElement> = {};

  const count = $derived(needs.open.length);

  function show(tab: Tab, focus = false): void {
    if (tab === 'agents' && chosen !== 'agents') opened += 1;
    chosen = tab;
    if (focus) tabs[tab]?.focus();
  }

  function move(e: KeyboardEvent, at: number): void {
    const to =
      e.key === 'ArrowRight' ? (at + 1) % TABS.length
      : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? TABS.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    show(TABS[to]!, true);
  }

  onMount(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((es) => (onscreen = es.some((x) => x.isIntersecting)));
    io.observe(win);
    return () => io.disconnect();
  });
</script>

<noscript>
  <style>
    .desk .desk-pane { display: block !important; }
    .desk .desk-pane + .desk-pane { border-top: 1px solid var(--rule); }
    .desk .desk-pane-name { display: block !important; }
    .desk .desk-tab[aria-selected='true'] { background: none !important; box-shadow: none !important; color: var(--muted) !important; }
    .desk .desk-tab, .desk .desk-ask-bar { pointer-events: none; }
    .desk .desk-js { display: none !important; }
  </style>
</noscript>

<div class="win desk" class:slashing={asking} data-desk bind:this={win}>
  <div class="app-top">
    <span class="who"><Mark height={18} tone="inherit" />{DESK.brand}</span>
    <div class="places" role="tablist" aria-label={DESK.places}>
      {#each TABS as tab, i}
        <button
          type="button"
          role="tab"
          class="desk-tab"
          id="desk-tab-{tab}"
          aria-controls="desk-pane-{tab}"
          aria-selected={chosen === tab}
          tabindex={chosen === tab ? 0 : -1}
          bind:this={tabs[tab]}
          onclick={() => show(tab)}
          onkeydown={(e) => move(e, i)}
        >
          {DESK.tabs[tab]}
          {#if tab === 'needs'}<span class="count num" hidden={count === 0}>{count}</span>{/if}
        </button>
      {/each}
    </div>
    <Ask bind:open={asking} />
    <span class="face" style="--h:{FOUNDER.hue}" aria-hidden="true">{FOUNDER.initials}</span>
  </div>
  {#each TABS as tab}
    <div
      class="desk-pane"
      class:on={chosen === tab}
      id="desk-pane-{tab}"
      role="tabpanel"
      aria-labelledby="desk-tab-{tab}"
      tabindex="0"
    >
      <h2 class="desk-pane-name">{DESK.tabs[tab]}</h2>
      {#if tab === 'today'}
        <Today active={chosen === 'today' && onscreen} ongo={(t) => show(t, true)} />
      {:else if tab === 'project'}
        <Project />
      {:else if tab === 'needs'}
        <Needs />
      {:else}
        <Agents {opened} />
      {/if}
    </div>
  {/each}
</div>

<style>
  .win {
    position: relative;
    border-radius: 18px;
    background: var(--board);
    box-shadow: var(--win-shadow);
    overflow: hidden;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink);
    text-align: start;
  }

  .app-top {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 54px;
    padding: 0 16px;
    background: var(--tile);
    border-bottom: 1px solid var(--rule);
    z-index: 2;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 600 14px/1 var(--head);
    letter-spacing: -0.01em;
  }

  .who :global(.mark) {
    color: var(--red);
  }

  .places {
    display: flex;
    gap: 2px;
    color: var(--ink);
  }

  .desk-tab {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border-radius: 8px;
    font: 500 13.5px/1 var(--ui);
    color: var(--muted);
    white-space: nowrap;
  }

  .desk-tab:hover {
    color: var(--ink);
    background: var(--soft);
  }

  .desk-tab[aria-selected='true'] {
    background: var(--soft);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  .desk-tab:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }

  .count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--red);
    color: var(--on-red);
    font: 600 11px/18px var(--ui);
    text-align: center;
  }

  .count[hidden] {
    display: none;
  }

  .face {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font: 600 10.5px/1 var(--ui);
    background: hsl(var(--h) 45% 88%);
    color: hsl(var(--h) 45% 28%);
    flex: none;
  }

  :global(:root[data-theme='dark']) .face {
    background: hsl(var(--h) 25% 24%);
    color: hsl(var(--h) 55% 82%);
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .face {
      background: hsl(var(--h) 25% 24%);
      color: hsl(var(--h) 55% 82%);
    }
  }

  .desk-pane {
    padding: 16px;
    display: none;
  }

  .desk-pane:focus-visible {
    outline: 2px solid var(--red);
    outline-offset: -2px;
  }

  .desk-pane.on {
    display: block;
    animation: rise 0.35s ease both;
  }

  .desk-pane-name {
    display: none;
    margin: 0 2px 12px;
    font: 600 17px/1.2 var(--head);
    letter-spacing: -0.03em;
  }

  /* THE TILES EVERY PLACE SHARES, said once here for the four panes under this window. */
  .win :global(.grid) {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
  }

  .win :global(.t) {
    background: var(--tile);
    border-radius: 14px;
    padding: 16px;
    min-width: 0;
  }

  .win :global(.s3) {
    grid-column: span 3;
  }

  .win :global(.s4) {
    grid-column: span 4;
  }

  .win :global(.s5) {
    grid-column: span 5;
  }

  .win :global(.s6) {
    grid-column: span 6;
  }

  .win :global(.s7) {
    grid-column: span 7;
  }

  .win :global(.s8) {
    grid-column: span 8;
  }

  .win :global(.th) {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font: 500 12.5px/1.2 var(--ui);
    color: var(--muted);
  }

  .win :global(.th .icon) {
    width: 15px;
    height: 15px;
  }

  .win :global(.th .r) {
    margin-left: auto;
  }

  .win :global(.big) {
    font: 600 27px/1.05 var(--head);
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }

  .win :global(.sub) {
    color: var(--muted);
    font-size: 12.5px;
    margin-top: 4px;
  }

  .win :global(.sub.late),
  .win :global(.fig.late) {
    color: var(--red-ink);
  }

  .win :global(.fig) {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .win :global(.num) {
    font-variant-numeric: tabular-nums;
  }

  .win :global(.dotr) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--red);
    flex: none;
  }

  .win :global(.list) {
    display: grid;
  }

  .win :global(.li) {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid var(--rule2);
    min-width: 0;
  }

  .win :global(.li:first-child) {
    border-top: 0;
    padding-top: 0;
  }

  .win :global(.grow) {
    flex: 1;
    min-width: 0;
  }

  .win :global(.grow span) {
    display: block;
    color: var(--muted);
    font-size: 12px;
  }

  .win :global(.agent) {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--soft);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  .win :global(.agent .icon) {
    width: 15px;
    height: 15px;
  }

  .win :global(.pface) {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, hsl(var(--ph) 70% 45%) 14%, var(--tile));
    color: hsl(var(--ph) 65% 38%);
    flex: none;
  }

  .win :global(.pface .icon) {
    width: 16px;
    height: 16px;
  }

  :global(:root[data-theme='dark']) .win :global(.pface) {
    color: hsl(var(--ph) 70% 70%);
    background: color-mix(in srgb, hsl(var(--ph) 70% 45%) 24%, var(--tile));
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .win :global(.pface) {
      color: hsl(var(--ph) 70% 70%);
      background: color-mix(in srgb, hsl(var(--ph) 70% 45%) 24%, var(--tile));
    }
  }

  .win :global(.tag) {
    font-size: 11.5px;
    color: var(--muted);
    white-space: nowrap;
  }

  .win :global(.dbtn) {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    padding: 0 13px;
    border-radius: 8px;
    font: 500 13.5px/1 var(--ui);
    white-space: nowrap;
    background: var(--tile);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--rule);
  }

  .win :global(.dbtn[data-tone='tint']) {
    background: var(--red-tint);
    color: var(--red-ink);
    box-shadow: none;
  }

  .win :global(.dbtn:focus-visible) {
    outline: 2px solid var(--red);
    outline-offset: 2px;
  }

  .win :global(.dbtn:active) {
    transform: translateY(1px);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 760px) {
    .app-top {
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px;
    }

    .face {
      margin-left: auto;
    }

    .places {
      order: 3;
      width: 100%;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .desk-tab {
      justify-content: center;
      padding: 8px 0;
      font-size: 12px;
      gap: 3px;
    }

    .count {
      min-width: 16px;
      height: 16px;
      font-size: 10px;
      line-height: 16px;
      padding: 0 4px;
    }

    .desk-pane {
      padding: 10px;
    }

    .win :global(.grid) {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }

    .win :global(.grid > *) {
      grid-column: auto;
    }

    .win :global(.hide-phone) {
      display: none;
    }

    .win :global(.t) {
      padding: 14px;
    }
  }

  /* At 320 the window is under 300 wide and "Needs you" with its count would spill its cell. */
  @media (max-width: 360px) {
    .desk-tab {
      font-size: 11px;
      gap: 2px;
    }
  }

  @media (pointer: coarse) {
    .desk-tab,
    .win :global(.dbtn) {
      min-height: 44px;
      box-sizing: border-box;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .desk-pane.on {
      animation: none;
    }
  }
</style>
