<!--
  Below 900px the rail becomes a tab bar. Not a shrunken desktop (2.A.23).

  FIVE PLACES, AS ON 19 OCTOBER (his call 2, 20 October): Today, Needs you, Projects, Money, Agents (`tabsOf`), the same
  five the top bar draws, with the rail's glyphs and words: a place whose glyph or word differs between two shapes is a
  place learnt twice. NO MORE TAB. Work lives in Projects and on Today, and Work, People, Settings and the rest are
  under the face at the top of each screen (`PageHead.svelte`), which opens the More sheet. Search is the 44px button
  beside that face, never a tab.

  FLAT, AND DOCKED TO THE BOTTOM EDGE (DIRECTION §39), on the nav's own surface with one hairline over it, as the top bar
  is: equal tabs, 24px glyphs over 12/500 captions, every target 44 or more. The tab you are on is ink, glyph and word;
  the rest are the quiet ink. The only red is the count of what waits on you, the one `Count`, cut out of its glyph.

  IT HOLDS STILL WHILE A PAGE CHANGES (motion F3): named `tabbar` for the view transition, which `app.css` does not
  animate, so the page's two pictures pass under it and its labels never blink.

  Safe-area insets are paid exactly once, on the fixed element only. Paying twice is a real, easy bug.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy/frame.ts';
  import Count from '../ui/Count.svelte';
  import Icon, { type IconName } from '../ui/Icon.svelte';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';

  let {
    tabs,
  }: {
    /** The five tabs, as `tabsOf` reads them from the rail's places. */
    tabs: readonly FlatItem[];
  } = $props();

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
</script>

<nav class="tabs" aria-label="Record" style={`--tabs:${tabs.length}`}>
  {#each tabs as tab (tab.key)}
    <a class="tab tap" href={at(tab.href)} aria-current={isHere(tab, path) ? 'page' : undefined}>
      <span class="badge-slot">
        <Icon name={tab.icon as IconName} size="xl" />
        {#if tab.count && tab.key === 'decide'}<span class="badge"><Count n={tab.count} size="s" label={`${tab.count} ${copy.openQuestions}`} /></span>{/if}
      </span>
      <span class="tab-name">{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  /**
   * THE BAR: the window's width at the bottom edge, `--tab-h` tall over the home indicator, on the nav's surface with a
   * hairline over it. Opaque, so a row passing under it is never read through it. `--tabbar` (the bar and the indicator)
   * is what the shell and the toasts clear.
   *
   * EQUAL TABS, AND FIVE OF THEM FIT THE NARROWEST PHONE: 320 over five is 64 across, so every tab clears 44 on both axes
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
    background: var(--tile);
    border-block-start: 1px solid var(--rule);
    /* HELD STILL IN A PAGE CHANGE: the page's pictures pass under it (`app.css` gives this name no animation). */
    view-transition-name: tabbar;
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN, and four dead targets over the keys somebody is using would sit above
     the sheet being typed into. `a11y/keyboard.ts` sets `data-kb` for exactly the readers that have to disappear. */
  :global(html[data-kb]) .tabs {
    display: none;
  }

  /* A 24px glyph over its caption, and a target the bar's full height. The caption is 12/500, the one step under the
     meta size, kept for captions under a glyph and the count. */
  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    min-block-size: max(var(--tap), var(--tab-h));
    padding: 0 var(--sp-1);
    border: 0;
    background: none;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: var(--fw-medium);
    line-height: calc(16 / 12);
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  /* HERE IS INK, glyph and word, and the weight a step up: no fill, no pill, no accent. */
  .tab[aria-current='page'] {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .badge-slot {
    position: relative;
    display: grid;
  }

  /* FIVE TABS ON A 320px PHONE ARE 64px EACH, so a long section name ends in an ellipsis rather than pushing its neighbours. */
  .tab-name {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* NEEDS YOU'S COUNT ON THE CORNER OF ITS GLYPH: 4 over its top, 14 in from its start, its ring cut out of the glyph. */
  .badge {
    position: absolute;
    inset-block-start: calc(-1 * var(--sp-1));
    inset-inline-start: 14px;
    display: flex;
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
