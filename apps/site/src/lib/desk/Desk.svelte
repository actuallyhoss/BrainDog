<!--
  The live desk in the hero: the app's own window on Maya's made-up record, drawn as the app's 19 October Today
  (site F5, SPEC 4.7): the top bar with the five places and their icons, the count on Needs you, the "Ask or change
  anything" bar, who is working, and Maya's face. Five places to press through (§23: the product's own parts, never a
  screenshot).

  ALL FIVE PLACES ARE IN THE HTML. With scripting on, only the chosen one shows and the bar is a real tablist (arrows,
  Home and End move). With scripting off, the <noscript> rule below lays every place out one under another, each
  headed by its name, and the bar no longer marks one as chosen. A style element is not held by the page's script
  policy, so the rule needs no hash.

  ON A PHONE IT IS THE APP'S PHONE LAYOUT: the date and the search on top, the places as the five-icon bar pinned at
  the foot of a 540px frame that clips. The window draws on the app's own surfaces (`--desk-*` in Look B), so its dark
  board and tiles are the app's.

  THE COUNT ON NEEDS YOU reads the desk's asks (`needs.svelte.ts`), so answering one on Today or in Needs you moves it,
  and the line's "2 need you" with it.
-->
<script lang="ts">
  import AgentMark from '../AgentMark.svelte';
  import Icon from '../Icon.svelte';
  import Mark from '../Mark.svelte';
  import { BRIEF, FOUNDER, TODAY, slotVars } from '../demo/maya.ts';
  import Agents from './Agents.svelte';
  import Ask from './Ask.svelte';
  import Money from './Money.svelte';
  import Needs from './Needs.svelte';
  import Project from './Project.svelte';
  import Today from './Today.svelte';
  import { needs } from './needs.svelte.ts';
  import { DESK, TABS, type Tab } from './words.ts';

  let chosen = $state<Tab>('today');
  let asking = $state(false);
  const tabs: Record<string, HTMLButtonElement> = {};

  const count = $derived(needs.open.length);

  function show(tab: Tab, focus = false): void {
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
</script>

<noscript>
  <style>
    .desk .desk-pane { display: block !important; }
    .desk .desk-pane + .desk-pane { border-block-start: 1px solid var(--rule); }
    .desk .desk-pane-name { display: block !important; }
    .desk .desk-tab[aria-selected='true'] { background: none !important; color: var(--muted) !important; }
    .desk .desk-tab, .desk [class~='desk-ask-bar'], .desk [class~='lead'] { pointer-events: none; }
    .desk [class~='desk-js'] { display: none !important; }
    .desk { block-size: auto !important; }
  </style>
</noscript>

<div class="win desk" class:slashing={asking} data-desk>
  <div class="app-top">
    <span class="who"><Mark height={20} tone="inherit" /><span class="who-name">{DESK.brand}</span></span>
    <span class="phone-date">{BRIEF.date}</span>
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
          <span class="tab-icon"><Icon name={DESK.icons[tab]!} /></span><span class="cap">{DESK.tabs[tab]}</span>
          {#if tab === 'needs'}<span class="count num" hidden={count === 0}>{count}</span>{/if}
        </button>
      {/each}
    </div>
    <Ask bind:open={asking} />
    <span class="working">
      <span class="marks">
        {#each TODAY.working as w (w.agent)}<span class="disc"><AgentMark id={w.agent} size={14} /></span>{/each}
      </span>
      {DESK.working(TODAY.working.length)}<span class="live" aria-hidden="true"></span>
    </span>
    <span class="face" style={slotVars(FOUNDER.slot)} aria-hidden="true">{FOUNDER.initials}</span>
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
      <!-- TODAY NAMES ITSELF in its greeting, an h2 that shows with scripts on; the others' names show only without. -->
      {#if tab !== 'today'}<h2 class="desk-pane-name">{DESK.tabs[tab]}</h2>{/if}
      {#if tab === 'today'}
        <Today ongo={(t) => show(t, true)} />
      {:else if tab === 'needs'}
        <Needs />
      {:else if tab === 'projects'}
        <Project />
      {:else if tab === 'money'}
        <Money />
      {:else}
        <Agents />
      {/if}
    </div>
  {/each}
</div>

<style>
  /* THE WINDOW, on the app's own surfaces: the desk's board and tiles are the app's in both schemes (SPEC 4.7). */
  .win {
    --board: var(--desk-board);
    --tile: var(--desk-tile);
    --soft: var(--desk-tile-2);
    --rule: var(--desk-rule);
    --rule2: var(--desk-rule);
    --muted: var(--desk-ink-3);
    position: relative;
    border-radius: 16px;
    background: var(--board);
    box-shadow: var(--win-shadow);
    overflow: hidden;
    font-size: var(--t-site-14);
    line-height: 1.45;
    color: var(--ink);
    text-align: start;
  }

  .app-top {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 56px;
    padding: 0 16px;
    background: var(--desk-nav);
    border-block-end: 1px solid var(--rule);
    z-index: var(--z-raise);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-inline-end: 8px;
    font: 600 15px/1 var(--head);
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .who :global(.mark) {
    color: var(--red-fill);
  }

  .phone-date {
    display: none;
  }

  .places {
    display: flex;
    gap: 4px;
  }

  .desk-tab {
    all: unset;
    box-sizing: border-box;
    position: relative;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    block-size: 36px;
    padding: 0 12px;
    border-radius: 8px;
    font: 500 14px/1 var(--ui);
    color: var(--ink2);
    white-space: nowrap;
    transition: background var(--d-state, 90ms) ease-out;
  }

  .tab-icon {
    display: inline-flex;
  }

  .tab-icon :global(.icon) {
    inline-size: 16px;
    block-size: 16px;
  }

  .desk-tab:hover {
    color: var(--ink);
    background: var(--desk-hover);
  }

  .desk-tab[aria-selected='true'] {
    background: var(--desk-nav-on);
    color: var(--ink);
  }

  .desk-tab:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* THE COUNT (SPEC 2.A.2): the one red pill, white figure, on the place that waits on her. */
  .count {
    min-inline-size: 20px;
    block-size: 20px;
    padding-inline: 6px;
    box-sizing: border-box;
    border-radius: 999px;
    background: var(--red-fill);
    color: var(--on-red);
    font: 600 12px/20px var(--ui);
    text-align: center;
  }

  .count[hidden] {
    display: none;
  }

  .working {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 8px;
    block-size: 32px;
    padding: 0 10px 0 6px;
    border-radius: 8px;
    background: var(--soft);
    color: var(--ink2);
    font: 500 13px/1 var(--ui);
    white-space: nowrap;
  }

  .marks {
    display: inline-flex;
  }

  .disc {
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    border-radius: 50%;
    background: var(--tile);
    color: var(--ink);
  }

  .disc + .disc {
    margin-inline-start: -6px;
    box-shadow: 0 0 0 2px var(--soft);
  }

  .live {
    inline-size: 6px;
    block-size: 6px;
    border-radius: 50%;
    background: var(--live);
  }

  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--ph-tint);
    color: var(--ph);
    font: 600 13px/1 var(--ui);
  }

  .desk-pane {
    display: none;
    padding: 20px;
  }

  .desk-pane:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .desk-pane.on {
    display: block;
    animation: swap 160ms ease-out both;
  }

  .desk-pane-name {
    display: none;
    margin: 0 2px 12px;
    font: 600 17px/1.2 var(--head);
    letter-spacing: -0.03em;
  }

  @keyframes swap {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ── The parts every place shares, said once here for the five panes under this window ── */

  .win :global(.grid) {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
  }

  .win :global(.t) {
    min-inline-size: 0;
    padding: 20px;
    background: var(--tile);
    border-radius: 16px;
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

  .win :global(.s12) {
    grid-column: span 12;
  }

  /* A TILE'S HEAD (SPEC 2.A.4): a 28px neutral well with its 18px icon, the title 15/600, a count, an end slot. */
  .win :global(.thd) {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 28px;
    margin: 0 0 12px;
    color: var(--ink);
    font: 600 15px/1.2 var(--ui);
  }

  .win :global(.thd .r) {
    margin-inline-start: auto;
    color: var(--muted);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .win :global(.well) {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 8px;
    background: var(--soft);
    color: var(--ink2);
  }

  .win :global(.well .icon) {
    inline-size: 18px;
    block-size: 18px;
  }

  .win :global(.well.l) {
    inline-size: 32px;
    block-size: 32px;
  }

  .win :global(.well.l .icon) {
    inline-size: 16px;
    block-size: 16px;
  }

  /* A late row's well (SPEC 2.A.5): the red tint and the red glyph, beside the late word. */
  .win :global(.well.late) {
    background: var(--red-tint);
    color: var(--red);
  }

  .win :global(.well.ph) {
    background: var(--ph-tint);
    color: var(--ph);
  }

  .win :global(.big) {
    font: 600 28px/34px var(--head);
    letter-spacing: -0.035em;
    font-variant-numeric: tabular-nums;
  }

  .win :global(.sub) {
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  .win :global(.late-word) {
    color: var(--red);
    font-weight: 600;
  }

  .win :global(.fig) {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .win :global(.num) {
    font-variant-numeric: tabular-nums;
  }

  .win :global(.list) {
    display: grid;
  }

  .win :global(.li) {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
    padding: 10px 0;
    border-block-start: 1px solid var(--rule);
  }

  .win :global(.li:first-child) {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .win :global(.grow) {
    flex: 1;
    min-inline-size: 0;
  }

  .win :global(.grow b) {
    display: block;
    font-weight: 600;
  }

  .win :global(.grow span) {
    display: block;
    color: var(--muted);
    font-size: var(--t-site-13);
  }

  /* AN AGENT'S FACE (SPEC 2.A.5): a 28px disc with the maker's mark, and an 8px live dot cut out of its corner. */
  .win :global(.aface) {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 50%;
    background: var(--soft);
    color: var(--ink);
  }

  .win :global(.aface.on::after) {
    content: '';
    position: absolute;
    inset-block-end: -1px;
    inset-inline-end: -1px;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--live);
    box-shadow: 0 0 0 2px var(--tile);
  }

  /* THE ANSWER BUTTONS: the suggested one solid red with white words (site S2), the other quiet. */
  .win :global(.dbtn) {
    all: unset;
    box-sizing: border-box;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    block-size: 32px;
    padding: 0 12px;
    border-radius: 8px;
    background: var(--soft);
    color: var(--ink);
    font: 500 14px/1 var(--ui);
    white-space: nowrap;
    transition: background var(--d-press, 70ms) ease-out;
  }

  .win :global(.dbtn:hover) {
    background: var(--desk-hover);
  }

  .win :global(.dbtn.red) {
    background: var(--red-fill);
    color: var(--on-red);
  }

  .win :global(.dbtn.red:hover) {
    background: var(--red-fill-hover);
  }

  .win :global(.dbtn.red:active) {
    background: var(--red-fill-press);
  }

  .win :global(.dbtn:focus-visible),
  .win :global(.undo:focus-visible),
  .win :global(.lead:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .win :global(.undo) {
    all: unset;
    cursor: pointer;
    color: var(--ink2);
    font-size: var(--t-site-13);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .win :global(.area) {
    display: block;
    inline-size: 100%;
    block-size: 64px;
    margin-block-start: 12px;
  }

  /* THE CASH LINE IN INK (SPEC 4.3's Forecast rules): a 2px ink line over a 6% ink fill. */
  .win :global(.area .l) {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
  }

  .win :global(.area .a) {
    fill: color-mix(in srgb, var(--ink) 6%, transparent);
  }

  @media (max-width: 1180px) {
    .working {
      display: none;
    }
  }

  @media (max-width: 1060px) {
    .cap {
      display: none;
    }

    .desk-tab {
      padding: 0 10px;
    }

    .win :global(.grid) {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }

    .win :global(.s3),
    .win :global(.s4),
    .win :global(.s5),
    .win :global(.s6),
    .win :global(.s7),
    .win :global(.s8) {
      grid-column: span 6;
    }

    .win :global(.hide-mid) {
      display: none;
    }
  }

  /* THE PHONE: the app's phone layout in a 540px frame that clips, the places pinned as its bottom bar. */
  @media (max-width: 760px) {
    .win {
      block-size: 540px;
    }

    .app-top {
      min-block-size: 52px;
      padding: 0 12px;
      background: var(--board);
      border-block-end: 0;
    }

    .who {
      display: none;
    }

    .phone-date {
      display: block;
      color: var(--muted);
      font-size: var(--t-site-13);
    }

    .working {
      display: none;
    }

    .places {
      position: absolute;
      inset-inline: 0;
      inset-block-start: 476px;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 0;
      block-size: 64px;
      background: var(--desk-nav);
      border-block-start: 1px solid var(--rule);
    }

    .desk-tab {
      flex-direction: column;
      justify-content: center;
      gap: 4px;
      block-size: 64px;
      padding: 0;
      border-radius: 0;
      color: var(--muted);
      font-size: var(--t-site-12);
      font-weight: 500;
    }

    .cap {
      display: block;
    }

    .desk-tab[aria-selected='true'] {
      background: none;
      color: var(--ink);
    }

    .tab-icon :global(.icon) {
      inline-size: 24px;
      block-size: 24px;
    }

    /* The tab bar's count (SPEC 2.A.2 `size="s"`): 18px, over the icon's corner, cut out of the bar. */
    .count {
      position: absolute;
      inset-block-start: 6px;
      inset-inline-start: calc(50% + 4px);
      min-inline-size: 18px;
      block-size: 18px;
      padding-inline: 5px;
      line-height: 18px;
      box-shadow: 0 0 0 2px var(--desk-nav);
    }

    .face {
      margin-inline-start: 0;
    }

    .desk-pane {
      padding: 4px 12px 76px;
    }

    .win :global(.grid) {
      grid-template-columns: minmax(0, 1fr);
    }

    .win :global(.grid > *) {
      grid-column: auto;
    }

    .win :global(.hide-phone) {
      display: none;
    }

    .win :global(.t) {
      padding: 16px;
    }
  }

  @media (pointer: coarse) {
    .win :global(.dbtn),
    .win :global(.undo) {
      min-block-size: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .desk-pane.on {
      animation: none;
    }
  }
</style>
