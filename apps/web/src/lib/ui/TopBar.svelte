<!--
  The top bar: one horizontal strip, the spine and then as much of your nav as fits.

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
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import { said } from '../voice.svelte.ts';
  import type { NavEntry } from '../record/api.ts';
  import Icon from './Icon.svelte';

  let {
    entries,
    open = 0,
    inbox = 0,
    onmore,
  }: {
    /** The declared nav, flat, in the reader's own arranged order. */
    entries: NavEntry[];
    open?: number | undefined;
    inbox?: number | undefined;
    onmore?: (() => void) | undefined;
  } = $props();

  /**
   * HOW MANY ENTRIES THE STRIP CARRIES, AND IT IS A CONSTANT RATHER THAN A MEASUREMENT.
   *
   * A bar that measured itself would hide a different number of pages at every window size, so the
   * one sentence this shape owes its reader — how many are behind More — would change while they
   * dragged the window, and the number they were told last would be the number they remember. The
   * count is the honest part of this shape, so it is the part that does not move.
   *
   * FOUR, WHICH IS §3'S OWN NUMBER: *"A freelancer has four entries."* That is the record this
   * shape suits, and at four nothing is behind More at all. The width it has to survive is 900, the
   * narrowest this is ever drawn at, and four names beside the three spine rows and More fit there
   * with the names intact.
   */
  const SHOWN = 4;

  const shown = $derived(entries.slice(0, SHOWN));
  const hidden = $derived(Math.max(0, entries.length - SHOWN));

  const here = (href: string) => page.url.pathname === href;
  const under = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<nav class="topbar" aria-label="Record">
  <!-- The spine. Home, Decide and Inbox are the three surfaces whose absence would make this a
       different product, so they are first and no pack may add to them, reorder them or badge them. -->
  <a class="bar-item spine tap" href="/" aria-current={here('/') ? 'page' : undefined}>
    <Icon name="home" size="m" /><span class="bar-name">{said('home')}</span>
  </a>
  <a class="bar-item spine tap" href="/decide" aria-current={under('/decide') ? 'page' : undefined}>
    <Icon name="decide" size="m" /><span class="bar-name">{copy.decide}</span>
    <!-- NAMED, NOT ONLY COLOURED (13 §5.1), the same fix as the rail's: `--tone` alone left this
         the one element in the bar whose meaning was carried by colour and nothing else. -->
    {#if open}<span class="tally num" data-intent="warn">{open}<Icon name="decide" size="s" title={copy.openQuestions} /></span>{/if}
  </a>
  <a class="bar-item spine tap" href="/inbox" aria-current={under('/inbox') ? 'page' : undefined}>
    <Icon name="inbox" size="m" /><span class="bar-name">{copy.inbox}</span>
    {#if inbox}<span class="tally num">{inbox}</span>{/if}
  </a>

  <span class="bar-rule" aria-hidden="true"></span>

  <!-- Declared. The order is the reader's, the same arrangement the rail and the sheet both draw,
       and the section headings are the thing a single strip cannot carry: they are in the sheet. -->
  {#each shown as entry}
    <a class="bar-item tap" href={entry.href} aria-current={here(entry.href) ? 'page' : undefined}>
      <span class="bar-name">{entry.title}</span>
    </a>
  {/each}

  <!--
    AND THE COUNT, WHICH IS THE CONDITION THIS SHAPE SHIPPED UNDER.

    The chip is the number and the accessible name is the sentence, because a reader who cannot see
    the chip is the reader most likely to be surprised by a nav that is not all here. With nothing
    hidden there is no chip and no sentence: More still opens the sheet, which holds the lists and
    the utilities that were never in the strip to begin with.
  -->
  <button
    type="button"
    class="bar-item bar-more tap"
    aria-label={hidden ? copy.navBehindMore(hidden) : undefined}
    onclick={() => onmore?.()}
  >
    <span class="bar-name">{copy.more}</span>
    {#if hidden}<span class="tally num">{hidden}</span>{/if}
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

  /* The spine keeps its glyphs and the declared entries do not: three icons at the head of the
     strip are a landmark, and eight are a row of pictures. */
  .bar-rule {
    flex: 0 0 auto;
    inline-size: 1px;
    block-size: var(--sp-5);
    margin-inline: var(--sp-2);
    background: var(--line);
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
