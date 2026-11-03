<!--
  The hub's tabs: Automations, Scheduled, Scripts and Inbound, each a link.

  A SEGMENTED CONTROL IN THE TOOLBAR, AND THE ONE PART (`lib/ui/Segmented.svelte`): the track is the part's, as a `nav`,
  so the selection slides to the tab chosen next, and it reads as every other choice of view in the product and not as
  a strip of underlined links under the title.

  LINKS, NOT A TABLIST. Each tab is an address a person can share, open in a new tab and go back to, so they are `<a>`
  with `aria-current`, the way the rail marks where you are, and not ARIA tabs that only swap a panel.

  ON A PHONE THE CONTROL SCROLLS INSIDE ITSELF. Four words do not always fit a phone's width, and wrapping them made two rows
  of tabs that read as two menus. The pill scrolls sideways on its own, the page never does, and the tab you are on is
  scrolled into view when it is drawn, so a deep link to Inbound does not open with its tab off the edge. The part does not
  hand out its element, so the bar is found by an attachment, which the part passes on to the track with the rest.
-->
<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import { at } from '$lib/at.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { TABS, hubWords, type Tab } from './hub.ts';

  /* `full` ON A PHONE: the page's own control, under the sentence and the whole width (`Segmented`). */
  let { here, full = false }: { here: Tab; full?: boolean } = $props();

  /* Run when the track is drawn, and again whenever `here` changes, after the links have been marked. */
  /* AFTER THE TRACK HAS SETTLED, NOT AS IT IS DRAWN: the part decides whether a phone's
     track scrolls once it has measured its words, so a scroll asked for at once found nothing to scroll and Inbound stayed
     off the edge. Two frames, then the bar's own scroll, so the page itself never moves. */
  const inView: Attachment<HTMLElement> = (bar) => {
    void here;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const on = bar.querySelector<HTMLElement>('[aria-current="page"]');
        if (!on) return;
        const a = on.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        if (a.right > b.right) bar.scrollLeft += a.right - b.right + 16;
        else if (a.left < b.left) bar.scrollLeft -= b.left - a.left + 16;
      });
    });
    return () => cancelAnimationFrame(frame);
  };
</script>

<Segmented tag="nav" class="hub-tabs" aria-label={hubWords.tabs} {full} {@attach inView}>
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

  /* UNDER THE SENTENCE, ON THE BOARD: the track in the tile's colour, as a quiet control beside the name is drawn. */
  /* ON THE PAGE'S GROUND THE TRACK IS GLASS (ops 4.7, the page tier): the control floats over the ambient light with a
     0.5px edge, and its chosen segment is the solid thumb. */
  :global(.head-below .hub-tabs) {
    background: var(--g-fill, var(--tile));
    -webkit-backdrop-filter: var(--g-bf, none);
    backdrop-filter: var(--g-bf, none);
    box-shadow: inset 0 0 0 0.5px var(--g-line, transparent);
  }

  /* AT ITS OWN WIDTH FROM 640, under the sentence's start; the whole width only on a phone (`full`). */
  @media (width >= 640px) {
    :global(.head-below .hub-tabs) {
      inline-size: fit-content;
    }
  }

  /* NO GLASS: once the title row is the compact bar, the control in it is the bar's. */
  :global(.head[data-under] .hub-tabs) {
    background: transparent;
  }

  /* ON A PHONE THE WORDS SIT CLOSER, so more of the strip shows and its last tab is cut by the edge, not mid letter. */
  @media (width < 480px) {
    /* THE STRIP FADES AT ITS RIGHT EDGE, so a tab past it reads as more to scroll to, not as a cut word. */
    :global(.hub-tabs) {
      -webkit-mask-image: linear-gradient(to right, var(--ink) calc(100% - 28px), transparent);
      mask-image: linear-gradient(to right, var(--ink) calc(100% - 28px), transparent);
    }

    .hub-tab {
      padding-inline: 10px;
      font-size: var(--fs-meta);
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
