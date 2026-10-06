<!--
  Below 900px the rail becomes a tab bar. Not a shrunken desktop.

  THE SAME FLAT LIST AS THE RAIL (`flatNav` in `lib/nav.ts`), its first five rows (`tabsOf`), and More for the rest: the
  owner's old tool carried the same six places in its tab bar as in its header, and a place whose glyph or word differs
  between the two is a place learnt twice. Decide moves up beside Today while something waits on it, with its count.
  Search is the 44px button in each screen's head bar (`PageHead.svelte`) and the first row of More, never a tab.

  A GLASS BAR FLOATING OVER THE WORK, 12 above the home indicator: equal-width tabs, 22px glyphs over 11px words, every
  target 44 or more. The tab you are on is the rail's ink wash, and the only red is the count of what waits on you.

  Safe-area insets are paid exactly once, on the fixed elements only. Paying twice is a real, easy bug.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';

  let {
    tabs,
    more = false,
    onmore,
  }: {
    /** The tabs, as `tabsOf` reads them from the flat list. */
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
   * A GLASS BAR FLOATING 12 FROM THE BOTTOM AND 12 IN FROM EACH SIDE: radius 22, level 2, the glass on a
   * pseudo-element for the rail's reason. The home indicator is paid once, in the offset, and `--tabbar` (the bar and
   * the indicator) is what the shell and the toasts clear, with the `--inset` above it added where they do.
   *
   * EQUAL TABS, AND SIX OF THEM FIT THE NARROWEST PHONE: 320, less the two insets and the bar's own 4 each side, is 288,
   * and 288 over six is 48 across, so every tab clears 44 on both axes before a word is shortened.
   */
  .tabs {
    position: fixed;
    inset-block-end: calc(env(safe-area-inset-bottom) + var(--inset));
    inset-inline: var(--inset);
    z-index: var(--z-sheet);
    isolation: isolate;
    display: grid;
    grid-template-columns: repeat(var(--tabs, 4), minmax(0, 1fr));
    padding: var(--sp-1);
    border-radius: var(--r-lg);
  }

  .tabs::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    pointer-events: none;
  }

  /* SAFARI'S GLASS, in a block of its own and reading the skin's one value, for the reason `Panel.svelte` gives. */
  @supports (-webkit-backdrop-filter: none) {
    .tabs::before {
      -webkit-backdrop-filter: var(--glass-blur);
    }
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN AND THIS WAS DRAWN ON TOP OF IT: four dead targets
     over the keys somebody is using, and `--z-sheet` puts them above the sheet being typed into.
     There is no length that means "not on screen", which is why this reads the attribute rather
     than `--kb`: `a11y/keyboard.ts` sets `data-kb` for exactly the readers that have to disappear
     rather than move. */
  :global(html[data-kb]) .tabs {
    display: none;
  }

  /* A 22px glyph over its word, and a target at least 44 tall: the bar's height less its own padding. The word is 11, a
     step under the smallest on the scale, because it is a caption under a glyph and six of them share a 320 phone. */
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-inline-size: 0;
    min-block-size: max(var(--tap), calc(var(--tab-h) - var(--sp-2)));
    padding: var(--sp-1) 2px;
    border: 0;
    border-radius: calc(var(--r-lg) - var(--sp-1));
    background: none;
    color: var(--dim);
    font-size: calc(var(--t-xs) - 1px);
    font-weight: 500;
    line-height: 1.2;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .tab :global(.icon) {
    inline-size: 22px;
    block-size: 22px;
  }

  /* HERE IS A SHAPE AS WELL AS A SHADE: the rail's ink wash under an ink glyph and word, never a filled pill or an accent. */
  .tab[aria-current='page'] {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
    font-weight: 600;
  }

  /* MORE IS INK WHILE ITS SHEET IS UP, so the tab that raised it says so, without the row a place wears: the sheet is
     over the screen, and the screen under it is still the place marked. */
  .tab[aria-expanded='true'] {
    color: var(--ink);
  }

  .badge-slot {
    position: relative;
  }

  /* SIX TABS ON A 320px PHONE ARE 49px EACH, so a long section name ends in an ellipsis rather than pushing its neighbours. */
  .tab-name {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* DECIDE'S COUNT IS THE RED SQUARE, the one filled badge, on the corner of its glyph. */
  .badge {
    position: absolute;
    inset-block-start: -5px;
    inset-inline-start: 13px;
    box-sizing: border-box;
    min-inline-size: 18px;
    block-size: 18px;
    padding: 0 4px;
    background: var(--danger);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
    text-align: center;
  }

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .tabs::before {
      border: 1px solid CanvasText;
    }
  }
</style>
