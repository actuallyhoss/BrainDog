<!--
  The tabs of a nav section, drawn above each of its pages when the section asks for them (`nav.tabs`, brief D3).

  WHAT IS A TAB HERE IS DECIDED IN `tabs.ts` AND ONLY DRAWN HERE. This component is handed a strip or nothing, and it
  never looks at the nav itself, so the strip a test reads is the strip a person sees.

  EVERY TAB IS A LINK, so a tab is an address. A tab that switched a panel in place would be a page nobody could send,
  bookmark or open in a second window, and each of these tabs is a whole page with its own blocks and its own read.
  That is also why this is a `nav` of links with `aria-current` and not an ARIA `tablist`: a tablist promises arrow keys
  that move between panels on one page, and these go to another page.

  IT IS THE APP'S OWN CONTROL, NOT THE DECLARING PACK'S. "Here" is the rail's here (`s2` and full ink, no accent), the
  row has the rail's height and the rail's type, and nothing in it takes a colour from the record (DIRECTION 28: what a
  person builds is structure, and BrainDog's look stays its own).
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { copy } from '../copy.ts';
  import Icon from '../ui/Icon.svelte';
  import Menu from '../ui/Menu.svelte';
  import type { Strip } from './tabs.ts';

  let { strip }: { strip: Strip } = $props();

  let row = $state<HTMLElement>();

  /**
   * THE TAB YOU OPENED IS IN VIEW ON A PHONE. At 390 the row holds three or four tabs and scrolls sideways for the rest,
   * so opening the sixth from the fifth landed on a page whose own tab sat off the edge of the strip. The route keeps
   * this component mounted between pages of one section, and an effect that ran once on mount is the bug
   * `settings/[area]` has a paragraph about, so it runs again on every tab.
   *
   * ON EVERY TAB, AND NOT ON EVERY NEW `strip`. The strip is derived from the shell's `nav`, and the root layout's load
   * hands back a new shell on each `invalidateAll` (the palette's undo calls one) and each change to the reader's rail,
   * so an effect that read `strip` ran `scrollIntoView` again with the reader halfway down the page, and `block:
   * 'nearest'` scrolls the page's own container back up to the strip. `current` is a string, and a derived string that
   * comes out the same wakes nobody. (Reasoned from Svelte's equality rule, not measured in a browser.)
   */
  const current = $derived(strip.shown.find((t) => t.current)?.href);
  $effect(() => {
    void current;
    row?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });

  const hereBehind = $derived(strip.more.some((t) => t.current));
</script>

<nav class="page-tabs" aria-label={strip.section}>
  <div class="tab-row" bind:this={row}>
    {#each strip.shown as tab (tab.href)}
      <a class="tab" href={at(tab.href)} aria-current={tab.current ? 'page' : undefined}>
        <span class="tab-name">{tab.title}</span>
      </a>
    {/each}
  </div>

  <!-- PAST TWELVE, THE REST, COUNTED ON THE BUTTON. The top bar's condition for hiding anything: it says how many sit
       behind More rather than quietly swallowing them, and the sentence is the button's name. -->
  {#if strip.more.length > 0}
    <div class="tab-more" data-here={hereBehind ? '' : undefined}>
      <Menu label={copy.navBehindMore(strip.more.length)} align="end">
        {#snippet trigger()}
          <span class="tab">
            <span class="tab-name">{copy.more}</span>
            <span class="tally num">{strip.more.length}</span>
            <Icon name="chevronDown" size="s" />
          </span>
        {/snippet}
        {#each strip.more as tab (tab.href)}
          <a class="mi" role="menuitem" href={at(tab.href)} aria-current={tab.current ? 'page' : undefined}>{tab.title}</a>
        {/each}
      </Menu>
    </div>
  {/if}
</nav>

<style>
  /* THE STRIP SPANS THE COLUMN AND THE ROW IN IT CARRIES THE GUTTER, so the first tab starts on the title's left edge
     and a row too long for the screen scrolls out to the screen's own edge rather than being cut a gutter short of it.
     The page head under it pads by the same `--gutter`, and `--page-max` is the page grid's own width. */
  .page-tabs {
    display: flex;
    align-items: center;
    min-inline-size: 0;
    max-inline-size: var(--page-max);
    padding-block-start: var(--sp-3);
    border-block-end: 1px solid var(--line);
  }

  /* NEVER WRAPS, SCROLLS SIDEWAYS. A second line of tabs reads as a second set of places, and it pushes the page down
     by a row each time a section grows. The block padding is the focus ring's room: the ring sits 4px outside a tab,
     and a box that scrolls on one axis clips on both. */
  .tab-row {
    display: flex;
    flex: 1 1 auto;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding: var(--sp-1) var(--gutter);
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  /* `--ctl-h` TALL AND NO `.tap`. The hit box `.tap` adds is a pseudo-element reaching 6px past a 32px tab on each
     side, 2px past the row's 4px of padding, and a box that scrolls on one axis counts that as overflow on the other.
     Under a thumb `--ctl-h` is 44 already, which is the target `.tap` exists to reach. (Arithmetic from the tokens, not
     a browser measurement: the browser gates were not run for this brief.) */
  .tab {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A NAME IS SOMEBODY'S OWN WORDS, and a row title can be a sentence. Past 16rem it ends in an ellipsis, so one
     long name cannot take the strip from the others. */
  .tab-name {
    max-inline-size: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* Where you are, said the way the rail and the top bar say it: `s2` and full ink, no accent. */
  .tab[aria-current='page'],
  .tab-more[data-here] .tab {
    background: var(--s2);
    color: var(--ink);
  }

  .tab-more {
    flex: 0 0 auto;
    padding-inline-end: var(--gutter);
  }

  .tally {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* The Menu's rows, as the rail's switcher draws them: a list of places, one of which you may be in. */
  .mi {
    display: flex;
    align-items: center;
    min-block-size: 34px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-ui);
    text-decoration: none;
  }

  @media (pointer: coarse) {
    .mi {
      min-block-size: var(--tap);
    }
  }

  .mi:hover,
  .mi:focus-visible {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .mi[aria-current] {
    color: var(--ink);
    font-weight: 600;
  }
</style>
