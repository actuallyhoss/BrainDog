<!--
  The hub's tabs: Automations, Scheduled, Scripts, Doors and Runs, each a link.

  A GLASS SEGMENTED CONTROL IN THE TOOLBAR: the frosted pill with the chosen tab a
  white pill lifted by a hairline shadow, drawn by `controls.css`'s `.segmented` and `.segment`, so it reads as every
  other choice of view in the product and not as a strip of underlined links under the title.

  LINKS, NOT A TABLIST. Each tab is an address a person can share, open in a new tab and go back to, so they are `<a>`
  with `aria-current`, the way the rail marks where you are, and not ARIA tabs that only swap a panel.

  ON A PHONE THE CONTROL SCROLLS INSIDE ITSELF. Five words do not fit a phone's width, and wrapping them made two rows
  of tabs that read as two menus. The pill scrolls sideways on its own, the page never does, and the tab you are on is
  scrolled into view when it is drawn, so a deep link to Runs does not open with its tab off the edge.
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

<nav class="hub-tabs segmented" aria-label={hubWords.tabs} bind:this={bar}>
  {#each TABS as t (t.id)}
    <a
      class="hub-tab segment tap"
      href={at(t.path)}
      aria-current={t.id === here ? 'page' : undefined}
      data-on={t.id === here ? '' : undefined}>{hubWords.tab[t.id]}</a
    >
  {/each}
</nav>

<style>
  /* ONE LINE, NEVER TWO: the control takes what the toolbar can give it and scrolls the rest inside itself. */
  .hub-tabs {
    flex: 0 1 auto;
    flex-wrap: nowrap;
    min-inline-size: 0;
    max-inline-size: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .hub-tabs::-webkit-scrollbar {
    display: none;
  }

  /* A LINK DRAWN AS A SEGMENT: centred words, no underline, never shrunk under its own word. */
  .hub-tab {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    white-space: nowrap;
  }

  /* GLASS NEVER HOLDS GLASS: once the title row is the compact glass bar, the control in it drops its own. */
  :global(.head[data-under]) .hub-tabs {
    background: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: none;
  }

  /* A PHONE'S HEAD IS NEVER THE GLASS BAR (`PageHead`), so there the control keeps its own glass. */
  @media (width < 900px) {
    :global(.head[data-under]) .hub-tabs {
      background: var(--glass);
      -webkit-backdrop-filter: var(--glass-blur);
      backdrop-filter: var(--glass-blur);
      box-shadow: var(--glass-edge);
    }
  }

  /* 44 UNDER A THUMB ON BOTH AXES (`13 §7`); `controls.css` gives the height and the width floor, and the word keeps
     its room either side. */
  @media (pointer: coarse) {
    .hub-tab {
      min-block-size: var(--tap);
    }
  }
</style>
