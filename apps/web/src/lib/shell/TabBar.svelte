<!--
  Below 900px the rail becomes a tab bar. Not a shrunken desktop.

  THE SAME PLACES AS THE RAIL (`railOf` in `lib/nav/rail.ts`), its first five (`tabsOf`), and More for the rest: a place
  whose glyph or word differs between the two is a place learnt twice. Decide moves up beside Today while something
  waits on it, with its count. Search is the 44px button in each screen's head bar (`PageHead.svelte`) and the first
  row of More, never a tab.

  FLAT, AND DOCKED TO THE BOTTOM EDGE (DIRECTION §39). It was a glass bar floating over the work, which drew a second
  card over every screen a phone shows. It is now the board's own colour with one hairline over it, the width of the
  window, the home indicator inside it: equal tabs, 22px glyphs over 11px words, every target 44 or more. The tab you
  are on is ink, glyph and word; the rest are `--dim`. The only red is the count of what waits on you.

  Safe-area insets are paid exactly once, on the fixed element only. Paying twice is a real, easy bug.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy/frame.ts';
  import Icon, { type IconName } from '../ui/Icon.svelte';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';

  let {
    tabs,
    more = false,
    onmore,
  }: {
    /** The tabs, as `tabsOf` reads them from the rail's places. */
    tabs: readonly FlatItem[];
    /** Whether the More sheet is open, said on the tab that opens it. */
    more?: boolean;
    onmore?: () => void;
  } = $props();

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
</script>

<nav class="tabs" aria-label="Record" style={`--tabs:${tabs.length + 1}`}>
  {#each tabs as tab (tab.key)}
    <a class="tab tap" href={at(tab.href)} aria-current={isHere(tab, path) ? 'page' : undefined}>
      <span class="badge-slot">
        <Icon name={tab.icon as IconName} size="l" />
        {#if tab.count && tab.key === 'decide'}<span class="badge" aria-label={`${tab.count} ${copy.openQuestions}`}>{tab.count}</span>{/if}
      </span>
      <span class="tab-name">{tab.label}</span>
    </a>
  {/each}
  <button type="button" class="tab tap" aria-haspopup="dialog" aria-expanded={more} onclick={onmore}>
    <Icon name="more" size="l" /><span class="tab-name">{copy.more}</span>
  </button>
</nav>

<style>
  /**
   * THE BAR: the window's width at the bottom edge, `--tab-h` tall over the home indicator, in the board's colour with a
   * hairline over it. Opaque, so a row passing under it is never read through it. `--tabbar` (the bar and the indicator)
   * is what the shell and the toasts clear.
   *
   * EQUAL TABS, AND SIX OF THEM FIT THE NARROWEST PHONE: 320 over six is 53 across, so every tab clears 44 on both axes
   * before a word is shortened.
   */
  .tabs {
    position: fixed;
    inset-block-end: 0;
    inset-inline: 0;
    z-index: var(--z-sheet);
    display: grid;
    grid-template-columns: repeat(var(--tabs, 4), minmax(0, 1fr));
    box-sizing: border-box;
    block-size: var(--tabbar);
    padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    background: var(--board);
    border-block-start: 1px solid var(--line);
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN, and four dead targets over the keys somebody is using would sit above
     the sheet being typed into. `a11y/keyboard.ts` sets `data-kb` for exactly the readers that have to disappear. */
  :global(html[data-kb]) .tabs {
    display: none;
  }

  /* A 22px glyph over its word, and a target the bar's full height. The word is 11, a step under the smallest on the
     scale, because it is a caption under a glyph and six of them share a 320 phone. */
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-inline-size: 0;
    min-block-size: max(var(--tap), var(--tab-h));
    padding: 0 2px;
    border: 0;
    background: none;
    color: var(--dim);
    font-size: calc(var(--t-xs) - 1px);
    font-weight: 500;
    line-height: 1.2;
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  .tab :global(.icon) {
    inline-size: 22px;
    block-size: 22px;
  }

  /* HERE IS INK, glyph and word, and the weight a step up: no fill, no pill, no accent. */
  .tab[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
  }

  /* MORE IS INK WHILE ITS SHEET IS UP, so the tab that raised it says so. */
  .tab[aria-expanded='true'] {
    color: var(--ink);
  }

  .badge-slot {
    position: relative;
    display: grid;
  }

  /* SIX TABS ON A 320px PHONE ARE 53px EACH, so a long section name ends in an ellipsis rather than pushing its neighbours. */
  .tab-name {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* DECIDE'S COUNT, the one filled mark on the bar, on the corner of its glyph. A count is the one thing a pill holds. */
  .badge {
    position: absolute;
    inset-block-start: -5px;
    inset-inline-start: 13px;
    box-sizing: border-box;
    min-inline-size: 18px;
    block-size: 18px;
    padding: 0 5px;
    background: var(--danger);
    border-radius: var(--r-round);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
    text-align: center;
  }

  /* FORCED COLOURS KEEP THE BAR'S EDGE, and the tab you are on an outline of its own. */
  @media (forced-colors: active) {
    .tabs {
      border-block-start-color: CanvasText;
    }

    .tab[aria-current='page'] {
      outline: 1px solid CanvasText;
      outline-offset: -4px;
    }
  }
</style>
