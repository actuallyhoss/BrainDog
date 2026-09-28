<!--
  Below 900px the rail becomes a tab bar. Not a shrunken desktop.

  THE SAME FLAT LIST AS THE RAIL (`flatNav` in `lib/nav.ts`), its first five rows (`tabsOf`), and More for the rest: the
  owner's old tool carried the same six places in its tab bar as in its header, and a place whose glyph or word differs
  between the two is a place learnt twice. Decide moves up beside Today while something waits on it, with its count.
  Search is the 44px button in each screen's head bar (`PageHead.svelte`) and the first row of More, never a tab.

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
        {#if tab.count}<span class="badge" data-intent="warn" aria-label={`${tab.count} ${copy.openQuestions}`}>{tab.count}</span>{/if}
      </span>
      <span class="tab-name">{tab.label}</span>
    </a>
  {/each}
  <button type="button" class="tab tap" aria-haspopup="dialog" aria-expanded={more} onclick={onmore}>
    <Icon name="more" size="l" /><span class="tab-name">{copy.more}</span>
  </button>
</nav>

<style>
  .tabs {
    position: fixed;
    inset-block-end: 0;
    inset-inline: 0;
    z-index: var(--z-sheet);
    display: grid;
    grid-template-columns: repeat(var(--tabs, 4), minmax(0, 1fr));
    background: var(--sunk);
    border-block-start: 1px solid var(--line);
    padding-block-end: env(safe-area-inset-bottom);
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN AND THIS WAS DRAWN ON TOP OF IT: four dead targets
     over the keys somebody is using, and `--z-sheet` puts them above the sheet being typed into.
     There is no length that means "not on screen", which is why this reads the attribute rather
     than `--kb`: `a11y/keyboard.ts` sets `data-kb` for exactly the readers that have to disappear
     rather than move. */
  :global(html[data-kb]) .tabs {
    display: none;
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-inline-size: 0;
    min-block-size: var(--tab-h);
    padding: var(--sp-1);
    border: 0;
    background: none;
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  /* Ink and an ink bar, so here is a shape as well as a shade, with no accent. */
  .tab[aria-current='page'] {
    color: var(--ink);
    box-shadow: inset 0 2px 0 0 var(--ink);
  }

  /* MORE IS INK WHILE ITS SHEET IS UP, so the tab that raised it says so, without the bar a place wears: the sheet is
     over the screen, and the screen under it is still the place marked. */
  .tab[aria-expanded='true'] {
    color: var(--ink);
  }

  .badge-slot {
    position: relative;
  }

  /* SIX TABS ON A 320px PHONE ARE 53px EACH, so a long section name ends in an ellipsis rather than pushing its neighbours. */
  .tab-name {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    position: absolute;
    inset-block-start: -5px;
    inset-inline-start: 11px;
    min-inline-size: 16px;
    padding: 0 4px;
    /* A count, not a filled chip: the intent is the text colour on the bar's own ground. */
    background: var(--sunk);
    border-radius: var(--r-pill);
    color: var(--tone, var(--ink2));
    font-weight: 500;
    /* THE SCALE'S SMALLEST STEP, NOT A NUMBER. This was `10px`, which the type scale does not
       have and `52 §5.2`'s second rule forbids; it survived because that rule is not implemented
       (see `loop/finding-css-rules.md`). `--t-xs` is 12px, so the badge is 2px larger here, which
       is the correct direction for a count on a phone. */
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
    line-height: 16px;
    text-align: center;
  }
</style>
