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
  <!-- THE FLAT LIST, at most seven, so it fits the 900px this shape is ever drawn at with its names intact. -->
  {#each entries as item (item.key)}
    <a class="bar-item tap" href={at(item.href)} aria-current={isHere(item, path) ? 'page' : undefined}>
      <Icon name={item.icon as IconName} size="m" /><span class="bar-name">{item.label}</span>
      {#if item.count}<span class="tally num" data-intent="warn">{item.count}<Icon name="decide" size="s" title={copy.openQuestions} /></span>{/if}
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
  /* THE SAME GROUND THE RAIL HAS. Navigation is how you get to the work; the work is what should be
     bright, and a strip in the page's own colour reads as the first row of the page. */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--sunk);
    border-block-end: 1px solid var(--line);
    /* THE STRIP CLIPS RATHER THAN THE DOCUMENT SCROLLING SIDEWAYS. A name too long for the width it
       is drawn at is a name with an ellipsis; a page that slides under the thumb is the most visible
       bug a responsive layout can have. */
    overflow: hidden;
  }

  .bar-item {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    min-block-size: var(--rail-item-h);
    padding-inline: var(--sp-2);
    border: 0;
    background: none;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    white-space: nowrap;
  }

  .bar-item:hover {
    background: var(--s2);
    color: var(--ink);
  }

  /* Where you are, said the way the rail says it: `s2` and full ink, no accent. */
  .bar-item[aria-current='page'] {
    background: var(--s2);
    color: var(--ink);
  }

  .bar-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }


  .bar-more {
    /* AT THE END, ALWAYS, and never squeezed out by the names in front of it. It is the only way to
       the lists, the add-ons, the vault and settings at this shape. */
    flex: 0 0 auto;
    margin-inline-start: auto;
  }

  /* ONE TREATMENT FOR EVERY NUMBER, the rail's rule: a quiet tabular figure, with `--tone` carrying
     the intent rather than a bordered pill that reads as an alert. */
  .tally {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .tally[data-intent='warn'] {
    color: var(--warn);
  }
</style>
