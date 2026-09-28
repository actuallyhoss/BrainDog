<!--
  The hub's tabs (`loop/finish/shell.md` EDT-3): Automations, Scheduled, Scripts, Doors and Runs, each a link.

  LINKS, NOT A TABLIST. Each tab is an address a person can share, open in a new tab and go back to, so they are `<a>`
  with `aria-current`, the way the rail marks where you are, and not ARIA tabs that only swap a panel.

  AT 390PX THE BAR SCROLLS INSIDE ITSELF. Five words do not fit a phone's width, and wrapping them made two rows of tabs
  that read as two menus. The bar scrolls sideways on its own, the page never does, and the tab you are on is scrolled
  into view when the bar is drawn, so a deep link to Runs does not open with its tab off the edge.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { TABS, hubWords, type Tab } from './hub.ts';

  let { here }: { here: Tab } = $props();

  let bar = $state<HTMLElement | undefined>();

  $effect(() => {
    void here;
    bar?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
</script>

<nav class="hub-tabs" aria-label={hubWords.tabs} bind:this={bar}>
  {#each TABS as t (t.id)}
    <a class="hub-tab tap" href={at(t.path)} aria-current={t.id === here ? 'page' : undefined}>{hubWords.tab[t.id]}</a>
  {/each}
</nav>

<style>
  .hub-tabs {
    display: flex;
    gap: var(--sp-1);
    margin-inline: calc(-1 * var(--gutter));
    padding-inline: var(--gutter);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    border-block-end: 1px solid var(--line-soft);
  }

  .hub-tabs::-webkit-scrollbar {
    display: none;
  }

  /* A 44PX TARGET ON EVERY WIDTH, and the mark under the one you are on is its border, so the bar's rule and the mark
     sit on one line. */
  .hub-tab {
    flex: none;
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    padding-inline: var(--sp-3);
    border-block-end: 2px solid transparent;
    margin-block-end: -1px;
    color: var(--dim);
    font-size: var(--t-ui);
    text-decoration: none;
    white-space: nowrap;
  }

  .hub-tab:hover {
    color: var(--ink);
  }

  .hub-tab[aria-current='page'] {
    border-block-end-color: var(--ink);
    color: var(--ink);
    font-weight: 500;
  }
</style>
