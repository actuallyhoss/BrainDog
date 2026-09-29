<!--
  The top bar: one horizontal strip, the flat list the rail draws (`flatNav`), and More.

  IT IS OFFERED AND NEVER DEFAULTED, and that is the whole of why it is allowed to exist. `19 §3`
  argues at length that a nav which is a QUERY over `page` rows — variable in length, sectioned,
  reordered by the reader — cannot be a horizontal strip, and the argument is right about the
  DEFAULT. A freelancer with four entries in one section on a wide screen is not the nav that
  argument is about, and telling that person they may not have the shape they want because a studio
  with eighteen entries would regret it is answering somebody else's question.

  SO THE ONE CONDITION IS HONESTY ABOUT WHAT IT HIDES. §3's sentence: it "states how many entries
  sit behind More rather than quietly swallowing them", which is the precise failure the paragraph
  above it names. The count is on the button, and the button opens the same sheet the phone opens,
  which holds every section, every list and the four utilities — so nothing is unreachable at any
  width, and the number says what it cost to choose this.

  BELOW 900px THIS IS NOT DRAWN AT ALL. The tab bar stays there whatever the shape says (§3 again),
  because a choice that lets somebody put an eighteen-entry strip across a phone is a choice to
  break their phone. The shell hides this slot rather than this component reasoning about width.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { isHere, placeOf, type FlatItem } from '../nav.ts';
  import Icon, { type IconName } from './Icon.svelte';
  import IconWell from './IconWell.svelte';
  import Mark from './Mark.svelte';

  let {
    entries,
    behind = 0,
    onmore,
  }: {
    /** The flat list (`flatNav`), the same rows the rail and the tab bar draw. */
    entries: readonly FlatItem[];
    /** How many places are under More, said on its button: the condition this shape shipped under. */
    behind?: number | undefined;
    onmore?: (() => void) | undefined;
  } = $props();

  /* COMPARED INSIDE THE RECORD, the address with the base and the slug taken off (`lib/at.ts`). */
  const path = $derived(placeOf(inside(page.url.pathname), page.url.searchParams));
</script>

<nav class="topbar" aria-label="Record">
  <!-- THE MARK FIRST, as the rail's head wears it: the strip is the same nav in another shape. -->
  <span class="bar-mark" aria-hidden="true"><Mark height={18} /></span>
  <!-- THE FLAT LIST, at most seven, so it fits the 900px this shape is ever drawn at with its names intact. -->
  {#each entries as item (item.key)}
    <a class="bar-item tap" href={at(item.href)} aria-current={isHere(item, path) ? 'page' : undefined}>
      <IconWell name={item.icon as IconName} tone={isHere(item, path) ? 'ink' : undefined} /><span class="bar-name">{item.label}</span>
      {#if item.count}<span class="tally num" data-waiting={item.key === 'decide' ? '' : undefined} aria-label={`${item.count} ${copy.openQuestions}`}
          >{item.count}</span
        >{/if}
    </a>
  {/each}

  <!-- AND THE COUNT OF WHAT IS UNDER MORE, as its accessible name, so a reader is never surprised by a nav that is not all here. -->
  <button
    type="button"
    class="bar-item bar-more tap"
    aria-label={behind ? copy.navBehindMore(behind) : undefined}
    onclick={() => onmore?.()}
  >
    <span class="bar-name">{copy.more}</span>
    {#if behind}<span class="tally num">{behind}</span>{/if}
    <Icon name="chevronDown" size="s" />
  </button>
</nav>

<style>
  /**
   * A FLOATING GLASS BAR, the rail's treatment laid across the top: glass, radius 22, 12 in from the
   * window (the shell's `.bar-slot`), and level 2. The glass is on a pseudo-element for the rail's reason: a
   * `backdrop-filter` here would be the box a fixed descendant is placed against.
   */
  .topbar {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: 2px;
    min-inline-size: 0;
    padding: 6px;
    border-radius: var(--r-lg);
    /* THE STRIP CLIPS RATHER THAN THE DOCUMENT SCROLLING SIDEWAYS. A name too long for the width it
       is drawn at is a name with an ellipsis; a page that slides under the thumb is the most visible
       bug a responsive layout can have. */
    overflow: hidden;
  }

  .topbar::before {
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

  .bar-mark {
    display: grid;
    place-items: center;
    flex: none;
    padding-inline: var(--sp-2) var(--sp-3);
  }

  /* A PLACE, as the rail draws one: an 18px glyph in a 26px well, the name 14/500, 36 tall. */
  .bar-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    min-block-size: var(--rail-item-h);
    padding: 0 10px 0 5px;
    border: 0;
    background: none;
    border-radius: var(--r-md);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* The rail's 26px well, with the wash for its rest fill on glass (`Sidebar.svelte`). */
  .bar-item :global(.well) {
    inline-size: 26px;
    block-size: 26px;
  }

  .bar-item :global(.well:not([data-tone])) {
    background: var(--hover-wash);
  }

  .bar-item:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* Where you are, said the way the rail says it: an ink well, the name at 600 and a white row. */
  .bar-item[aria-current='page'] {
    background: color-mix(in srgb, var(--bg) 70%, transparent);
    color: var(--ink);
    font-weight: 600;
  }

  .bar-name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-more {
    /* AT THE END, ALWAYS, and never squeezed out by the names in front of it. It is the only way to
       the lists, the add-ons, the vault and settings at this shape. */
    flex: 0 0 auto;
    margin-inline-start: auto;
    padding-inline: var(--sp-3);
  }

  /* ONE TREATMENT FOR EVERY NUMBER, the rail's rule: a quiet tabular figure in `--dim`. */
  .tally {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* And Decide's is the red square, the one filled badge. */
  .tally[data-waiting] {
    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 20px;
    block-size: 20px;
    padding: 0 5px;
    background: var(--danger);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    font-weight: 600;
    line-height: 1;
  }

  /* FORCED COLOURS DROP THE GLASS AND ITS SHADOWS, so the floating surface keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .topbar::before {
      border: 1px solid CanvasText;
    }
  }
</style>
