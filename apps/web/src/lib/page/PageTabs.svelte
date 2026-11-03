<!--
  The tabs of a nav section, drawn above each of its pages when the section asks for them (`nav.tabs`).

  WHAT IS A TAB HERE IS DECIDED IN `tabs.ts` AND ONLY DRAWN HERE. This component is handed a strip or nothing, and it
  never looks at the nav itself, so the strip a test reads is the strip a person sees.

  EVERY TAB IS A LINK, so a tab is an address. A tab that switched a panel in place would be a page nobody could send,
  bookmark or open in a second window, and each of these tabs is a whole page with its own blocks and its own read.
  That is also why this is a `nav` of links with `aria-current` and not an ARIA `tablist`: a tablist promises arrow keys
  that move between panels on one page, and these go to another page.

  IT IS THE APP'S OWN CONTROL, NOT THE DECLARING PACK'S: one segmented rectangle, "here" the tile's own
  fill in it, and nothing in it takes a colour from the record (what a person builds is structure,
  and BrainDog's look stays its own).
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { litSlide } from '../motion/lit.ts';
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

<nav class="page-tabs" aria-label={strip.section} data-tabs>
  <!-- WHERE YOU ARE GLIDES from the tab you left (`litSlide`): the strip stays mounted between the pages of a section. -->
  <div class="tab-row" bind:this={row} {@attach litSlide('.tab[aria-current="page"]', { fill: 'var(--tile)' })}>
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
  /* A ROW OF TABS PRESSED TO MOVE HOLDS STILL (skills pass follow-up, 2 Nov; `AppFrame.svelte` `pressTab`). Here and not
     in `app.css`, so only a screen with a row pays for it; a row is on both sides or on the side that has this file. The pressed
     tab was chosen on the press, so the row is the same on both sides: the new picture alone is drawn, and where the
     new screen puts the row higher or lower (Money's home has its sentence over it) it waits for the old screen to leave
     and glides there as the new one arrives, on the arrival's step. A row on one side only leaves and arrives with the page. */
  :global(::view-transition-group(tab-row)) {
    animation-duration: calc(var(--d-page) - var(--d-exit));
    animation-timing-function: var(--ease-out);
    animation-delay: var(--d-exit);
    animation-fill-mode: both;
  }

  :global(::view-transition-old(tab-row):not(:only-child)) {
    animation: none;
    opacity: 0;
  }

  :global(::view-transition-new(tab-row):not(:only-child)) {
    animation: none;
  }

  :global(::view-transition-old(tab-row):only-child) {
    animation: page-out var(--d-exit) var(--ease-in) both;
  }

  :global(::view-transition-new(tab-row):only-child) {
    animation: page-in calc(var(--d-page) - var(--d-exit)) var(--ease-out) var(--d-exit) both;
  }

  /* THE STRIP IS ONE SEGMENTED RECTANGLE (buttons are rectangles, radius 8, and no glass on the board):
     a quiet tinted track, each tab a rectangle in it, and the page you are on the tile's own fill lifted by a tiny
     shadow, a shape and not a shade. It sits in the page's gutter, on the title's left edge. */
  .page-tabs {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-3) var(--gutter) 0;
  }

  /* NEVER WRAPS, SCROLLS SIDEWAYS INSIDE ITS TRACK. A second line of tabs reads as a second set of places, and it
     pushes the page down by a row each time a section grows. */
  .tab-row {
    display: flex;
    flex: 0 1 auto;
    gap: 2px;
    min-inline-size: 0;
    padding: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
    background: var(--soft-fill, var(--tile-2));
    border-radius: var(--r-pill, var(--r-ctl, 8px));
  }

  /* AND THE EDGE WHERE IT IS CUT FADES, because its scrollbar is hidden and a tab sliced at the track's edge said
     nothing about the tabs past it. The wide table's fade (`blocks.css`, `.table-region`): the
     row's own inline scroll timeline moves the two fade widths, `--edge-start` and `--edge-end`, which that sheet
     registers as lengths so they animate. A row that fits has no timeline and no fade. The mask reads only alpha, so
     `--ink` is the kept part. */
  @keyframes tab-edges {
    0% {
      --edge-start: 0px;
      --edge-end: var(--sp-7);
    }

    4% {
      --edge-start: var(--sp-7);
    }

    96% {
      --edge-end: var(--sp-7);
    }

    100% {
      --edge-start: var(--sp-7);
      --edge-end: 0px;
    }
  }

  @supports (animation-timeline: scroll()) {
    .tab-row {
      --edge-dir: to right;
      mask-image: linear-gradient(
        var(--edge-dir),
        transparent,
        var(--ink) var(--edge-start),
        var(--ink) calc(100% - var(--edge-end)),
        transparent
      );
      animation: tab-edges linear both;
      animation-timeline: scroll(self inline);
    }

    .tab-row:dir(rtl) {
      --edge-dir: to left;
    }
  }

  /* A SEGMENT: the track's 3px comes off it, so the whole control is `--ctl-h`, and under a thumb `--ctl-h` is 44
     already, the target `.tap` exists to reach. No `.tap`: its pseudo-element reaching past the tab counts as overflow
     in a box that scrolls on one axis. */
  .tab {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: calc(var(--ctl-h) - 6px);
    padding-inline: var(--sp-3);
    border-radius: var(--r-pill, calc(var(--r-ctl, 8px) - 2px));
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    white-space: nowrap;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      box-shadow var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* A NAME IS SOMEBODY'S OWN WORDS, and a row title can be a sentence. Past 16rem it ends in an ellipsis, so one
     long name cannot take the strip from the others. */
  .tab-name {
    max-inline-size: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* HOVER ONLY WHERE THERE IS ONE. A phone reports `:hover` on the last thing tapped and keeps it. */
  @media (hover: hover) and (pointer: fine) {
    .tab:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* Where you are: the ops segmented thumb, the segment-on fill with the raised lift and a hairline ring, in ink at
     600 (ops look, 3 Nov). */
  .tab[aria-current='page'],
  .tab-more[data-here] .tab {
    background: var(--segment-on, var(--tile));
    box-shadow: 0 0 0 0.5px var(--g-sel-line, var(--rule)), var(--shadow-raised, none);
    color: var(--ink);
    font-weight: var(--fw-semi, 600);
  }

  /* MORE IS ITS OWN SMALL TRACK BESIDE THE STRIP, the same rectangle. */
  .tab-more {
    flex: 0 0 auto;
    padding: 2px;
    background: var(--soft-fill, var(--tile-2));
    border-radius: var(--r-pill, var(--r-ctl, 8px));
  }

  .tally {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* FORCED COLOURS DROP THE GLASS AND THE LIFT, so the track keeps an edge and the current tab an outline. */
  @media (forced-colors: active) {
    .tab-row,
    .tab-more {
      border: 1px solid CanvasText;
    }

    .tab[aria-current='page'] {
      outline: 1px solid CanvasText;
    }
  }
</style>
