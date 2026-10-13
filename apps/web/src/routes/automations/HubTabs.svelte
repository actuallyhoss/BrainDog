<!--
  The hub's tabs: Automations, Scheduled, Scripts, Doors and Runs, each a link.

  A SEGMENTED CONTROL IN THE TOOLBAR, AND THE ONE PART (`lib/ui/Segmented.svelte`): the track is the part's, as a `nav`,
  so the selection slides to the tab chosen next, and it reads as every other choice of view in the product and not as
  a strip of underlined links under the title.

  LINKS, NOT A TABLIST. Each tab is an address a person can share, open in a new tab and go back to, so they are `<a>`
  with `aria-current`, the way the rail marks where you are, and not ARIA tabs that only swap a panel.

  ON A PHONE THE CONTROL SCROLLS INSIDE ITSELF. Five words do not fit a phone's width, and wrapping them made two rows
  of tabs that read as two menus. The pill scrolls sideways on its own, the page never does, and the tab you are on is
  scrolled into view when it is drawn, so a deep link to Runs does not open with its tab off the edge. The part does not
  hand out its element, so the bar is found by an attachment, which the part passes on to the track with the rest.
-->
<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { at } from '$lib/at.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { TABS, hubWords, type Tab } from './hub.ts';

  let { here }: { here: Tab } = $props();

  /* Run when the track is drawn, and again whenever `here` changes, after the links have been marked. */
  const inView: Attachment<HTMLElement> = (bar) => {
    void here;
    bar.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
</script>

<Segmented tag="nav" class="hub-tabs" aria-label={hubWords.tabs} {@attach inView}>
  {#each TABS as t (t.id)}
    <a
      class="hub-tab segment tap"
      href={at(t.path)}
      aria-current={t.id === here ? 'page' : undefined}
      data-on={t.id === here ? '' : undefined}>{hubWords.tab[t.id]}</a
    >
  {/each}
</Segmented>

<style>
  /* ONE LINE, NEVER TWO: the control takes what the toolbar can give it and scrolls the rest inside itself. The track
     is `Segmented`'s own element, so every rule for it reaches it by this part's name. */
  :global(.hub-tabs) {
    flex: 0 1 auto;
    flex-wrap: nowrap;
    min-inline-size: 0;
    max-inline-size: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  :global(.hub-tabs::-webkit-scrollbar) {
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
  :global(.head[data-under] .hub-tabs) {
    background: transparent;
    backdrop-filter: none;
    box-shadow: none;
  }

  /* Safari before 18 knows the blur only by its prefixed name, and lightningcss folds a same-rule pair into one. */
  @supports (-webkit-backdrop-filter: none) {
    :global(.head[data-under] .hub-tabs) {
      -webkit-backdrop-filter: none;
    }
  }

  /* A PHONE'S HEAD IS NEVER THE GLASS BAR (`PageHead`), so there the control keeps its own glass. */
  @media (width < 900px) {
    :global(.head[data-under] .hub-tabs) {
      background: var(--glass);
      backdrop-filter: var(--glass-blur);
      box-shadow: var(--glass-edge);
    }

    @supports (-webkit-backdrop-filter: none) {
      :global(.head[data-under] .hub-tabs) {
        -webkit-backdrop-filter: var(--glass-blur);
      }
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
