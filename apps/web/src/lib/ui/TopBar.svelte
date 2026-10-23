<!--
  The top bar under frame A (23 October): where you go, and asking. The shell's navigation from 900px up, unless
  somebody kept the side rail of 20 October.

  ONE FLAT STRIP, 56 TALL, ON THE NAV'S OWN SURFACE with one hairline under it, in light and in dark. Left to right: the
  sidebar's own button, "BrainDog ▾" (the record and the others to switch to), the five places as 32px rectangles
  (Today, Needs you with its count, Projects, Money, Agents with a live dot and how many work), "Ask or change
  anything" with its "/" key, the bell (what happened, never what was asked), and the face (Settings, keys, Sign out).
  No "⋯" and no working chip: each count is said once, on the place it counts.

  WHERE YOU ARE IS A SOFT FILL with the words in ink at 600 (U-A12, U-A18), AND IT MOVES ON THE PRESS (F10): a place
  pressed wears it from the pointer's down, and the fill snaps rather than fading.

  THE LIVE DOT HOLDS STILL (frame F22): it pulses once when the working count changes, and not at all under reduced
  motion. THE FOCUS RING IS NEVER CLIPPED: the places' strip clips sideways only.

  NARROWER THAN 1,100 THE PLACES ARE THEIR GLYPHS, each named for a screen reader and on hover. BELOW 900px THIS IS NOT
  DRAWN AT ALL: the tab bar is the navigation there. ON `/search` THE ASK FIELD IS NOT DRAWN: the page's own field is.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';
  import type { Working } from '../record/boot-live.ts';
  import type { NewsItem } from '../record/schema.ts';
  import { happened } from '../shell/alerts.ts';
  import RecordMenu from '../shell/RecordMenu.svelte';
  import YouMenu from '../shell/YouMenu.svelte';
  import Count from './Count.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import Menu from './Menu.svelte';

  let {
    entries,
    working = [],
    agents = '/p/agents',
    news = [],
    side,
    onside,
    onfind,
  }: {
    /** The five places (`tabsOf`), the same the phone's tab bar draws. */
    entries: readonly FlatItem[];
    /** The agents at work now, as `boot` sends them: the Agents place's count and live dot. */
    working?: readonly Working[] | undefined;
    /** Where the Agents place opens (`agentsHref`), the one that carries the live dot. */
    agents?: string | undefined;
    /** What arrived since the reader last looked (`whatsNew`), which the bell opens. */
    news?: readonly NewsItem[] | undefined;
    /** Whether the sidebar is shown; no button is drawn where there is no sidebar. */
    side?: { shown: boolean } | undefined;
    onside?: (() => void) | undefined;
    onfind?: (() => void) | undefined;
  } = $props();

  const words = {
    hide: 'Hide the sidebar',
    show: 'Show the sidebar',
    arrivals: 'Arrivals',
    fresh: 'Something new arrived',
    none: 'Nothing new since you last looked',
    activity: 'All in Activity',
    working: (n: number) => `${n.toLocaleString('en-GB')} at work`,
  } as const;

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
  /* THE ASK FIELD STANDS DOWN ON THE SEARCH PAGE, which draws the field itself (money F12). */
  const searching = $derived(inside(page.url.pathname) === '/search');
  /** A place's quiet count: its own, or on Agents how many are at work. Nothing for none. */
  const countOf = (item: FlatItem): number | null => {
    const n = item.count ?? (item.href === agents ? working.length : 0);
    return n > 0 ? n : null;
  };

  /* THE BELL'S LINES: what happened, the questions left to Needs you. */
  const told = $derived(happened(news));

  /* THE PLACE PRESSED, held from the pointer's down until the address changes (F10), so the fill is on the new place in
     the press's own frame. A press that led nowhere lets go after a moment. */
  let pressed = $state<string | null>(null);
  let letGo: ReturnType<typeof setTimeout> | undefined;
  const press = (key: string): void => {
    pressed = key;
    clearTimeout(letGo);
    letGo = setTimeout(() => (pressed = null), 1500);
  };
  $effect(() => {
    void page.url.pathname;
    void page.url.search;
    untrack(() => {
      pressed = null;
      clearTimeout(letGo);
    });
  });
  const current = (item: FlatItem): boolean => (pressed === null ? isHere(item, path) : pressed === item.key);

  /* ONE PULSE WHEN THE WORKING COUNT CHANGES, never on the first draw: the dot is drawn again under a new key, which
     starts its one animation. THE FIRST COUNT IS NOT A CHANGE, so it arms only once a count was seen and then moved. */
  let armed = $state(false);
  let seen: number | undefined;
  $effect(() => {
    const n = working.length;
    untrack(() => {
      if (seen !== undefined && n !== seen) armed = true;
      if (n > 0) seen = n;
    });
  });
</script>

<nav class="topbar" aria-label="Record">
  {#if side}
    <!-- THE SIDEBAR'S OWN BUTTON, and `[` does the same. -->
    <button type="button" class="bar-side tap" aria-pressed={side.shown} aria-keyshortcuts="[" title={`${side.shown ? words.hide : words.show} ([)`} onclick={() => onside?.()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="4.75" width="16.5" height="14.5" rx="3" /><path d="M9.25 4.75v14.5" /></svg>
      <span class="sr-only">{side.shown ? words.hide : words.show}</span>
    </button>
  {/if}

  <!-- "BRAINDOG ▾": the record you are in and the others to switch to. -->
  <RecordMenu />

  <div class="bar-places">
    {#each entries as item (item.key)}
      {@const live = item.href === agents && working.length > 0}
      <a
        class="bar-item tap"
        href={at(item.href)}
        aria-current={current(item) ? 'page' : undefined}
        title={live ? `${item.label}, ${words.working(working.length)}` : item.label}
        onpointerdown={(e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && press(item.key)}
        onkeydown={(e) => e.key === 'Enter' && press(item.key)}
      >
        <Icon name={item.icon as IconName} size="m" /><span class="bar-name">{item.label}</span>
        {#if live}{#key working.length}<span class="bar-live" data-pulse={armed ? '' : undefined} aria-hidden="true"></span>{/key}{/if}
        {#if item.count && item.key === 'decide'}<Count n={item.count} label={`${item.count} ${copy.openQuestions}`} />{:else if countOf(item)}<span class="bar-count num"
            >{countOf(item)}{#if live}<span class="sr-only"> {words.working(working.length)}</span>{/if}</span
          >{/if}
      </a>
    {/each}
  </div>

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens out of (`data-palette-from`, U13), its key at rest. -->
  {#if !searching}
    <button type="button" class="bar-ask tap" data-palette-from="bar" aria-keyshortcuts="/ Control+K Meta+K" onclick={() => onfind?.()}>
      <Icon name="search" size="m" /><span class="bar-ask-words">{copy.palettePlaceholder}</span><kbd aria-hidden="true">/</kbd>
    </button>
  {/if}

  <!-- THE BELL, QUIET: a dot when something happened, no count, and its menu is what happened. -->
  <div class="bar-bell" data-alone={searching ? '' : undefined}>
    <Menu label={words.arrivals} align="end">
      {#snippet trigger()}
        <span class="bar-bell-face">
          <Icon name="bell" size="m" />
          {#if told.length > 0}<span class="bar-bell-dot" aria-hidden="true"></span>{/if}
          <span class="sr-only">{told.length > 0 ? `${words.arrivals}. ${words.fresh}` : words.arrivals}</span>
        </span>
      {/snippet}
      {#each told.slice(0, 6) as n, i (i)}
        <a class="bar-mi bar-news" role="menuitem" href={at(n.href)}><span class="mi-name">{n.text}</span></a>
      {:else}
        <span class="bar-mi" role="menuitem" aria-disabled="true">{words.none}</span>
      {/each}
      <hr />
      <a class="bar-mi" role="menuitem" href={at('/audit')}><Icon name="activity" size="s" />{words.activity}</a>
    </Menu>
  </div>

  <!-- THE FACE: Settings, the keyboard keys and Sign out. -->
  <YouMenu />
</nav>

<style>
  /* THE STRIP: 56 tall, the page's gutter at each end. Its surface and its edge are the slot's (`+layout.svelte`). */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    box-sizing: border-box;
    min-inline-size: 0;
    block-size: 56px;
    padding-inline: var(--sp-4) var(--gutter);
  }

  /* THE SIDEBAR'S BUTTON: 32 square, the glyph in the quiet ink, drawn here so the shell's icon set stays as it is. */
  .bar-side {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 32px;
    block-size: 32px;
    margin-inline-end: calc(-1 * var(--sp-2));
    padding: 0;
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .bar-side svg {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* THE STRIP CLIPS SIDEWAYS RATHER THAN THE DOCUMENT SCROLLING, and only sideways: the 4px above and below are the
     focus ring's (frame F4). */
  .bar-places {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    flex: 1 1 auto;
    min-inline-size: 0;
    margin-block: calc(-1 * var(--sp-1));
    padding-block: var(--sp-1);
    padding-inline: var(--sp-1);
    margin-inline: calc(-1 * var(--sp-1));
    overflow-x: clip;
    overflow-clip-margin: var(--sp-1);
  }

  /* A PLACE: a 32px rectangle, radius 8, glyph, name at 14/500, and the count of what needs you. Only the hover fades:
     the place you are on snaps (F10). */
  .bar-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    block-size: 32px;
    padding: 0 var(--sp-3);
    border: 0;
    background: none;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }

  /* HERE IS A SOFT FILL with the words in ink at 600 (U-A12), the same in both themes. */
  .bar-item[aria-current='page'] {
    background: var(--nav-selected);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .bar-count {
    color: var(--ink-3);
    font-weight: var(--fw-regular);
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-side:hover {
      background: var(--hover);
      color: var(--ink);
    }

    .bar-item:hover:not([aria-current='page']) {
      background: var(--hover);
      color: var(--ink);
      transition:
        background var(--d-state) var(--ease-out),
        color var(--d-state) var(--ease-out);
    }
  }

  /* ASK, DRAWN AS THE FIELD IT OPENS: 320 wide on `--tile-2` with a hairline, so it reads as a field on the nav's
     surface in both themes (U-A12), the words at 14 in the quiet ink, and its key. */
  .bar-ask {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 320px;
    min-inline-size: 200px;
    block-size: 36px;
    margin-inline-start: auto;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border: 1px solid var(--rule);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: text;
    transition: border-color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-ask:hover {
      border-color: var(--rule-strong);
    }
  }

  .bar-ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-ask kbd {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-inline-size: 20px;
    block-size: 20px;
    background: var(--tile);
    border: 1px solid var(--rule);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font: inherit;
    font-family: var(--font-mono);
    font-size: var(--fs-cap);
  }

  .bar-bell[data-alone] {
    margin-inline-start: auto;
  }

  .bar-live {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  .bar-live[data-pulse] {
    animation: bar-pulse calc(var(--d-page) * 2) var(--ease-out);
  }

  @keyframes bar-pulse {
    50% {
      scale: 1.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-live[data-pulse] {
      animation: none;
    }
  }

  .bar-bell {
    flex: none;
    margin-inline-end: calc(-1 * var(--sp-2));
  }

  /* THE BELL'S RING FOLLOWS ITS SQUARE. */
  .bar-bell :global(.menu-trigger) {
    border-radius: var(--r-ctl);
  }

  .bar-bell-face {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    color: var(--ink-3);
  }

  /* A DOT, NEVER A COUNT: something arrived, in the ink, cut out of the bell's ground by a ring of the nav. */
  .bar-bell-dot {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-end: 6px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--ink);
    box-shadow: 0 0 0 2px var(--nav);
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .bar-mi {
    color: var(--ink-2);
    text-decoration: none;
    cursor: pointer;
  }

  .bar-mi:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .bar-mi :global(.icon) {
    color: var(--ink-3);
  }

  /* AN ARRIVAL IS ONE LINE, its end cut. */
  .bar-news {
    max-inline-size: 360px;
  }

  .bar-news .mi-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* NARROWER THAN 1,100 the places are their glyphs, named on hover and to a screen reader. */
  @media (width < 1100px) {
    .bar-name,
    .bar-count {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .bar-item {
      padding: 0 var(--sp-2);
    }
  }

  @media (forced-colors: active) {
    .bar-item[aria-current='page'],
    .bar-ask {
      border: 1px solid CanvasText;
    }
  }
</style>
