<!--
  The tabs of a nav section, drawn above each of its pages when the section asks for them (`nav.tabs`, brief D3).

  WHAT IS A TAB HERE IS DECIDED IN `tabs.ts` AND ONLY DRAWN HERE. This component is handed a strip or nothing, and it
  never looks at the nav itself, so the strip a test reads is the strip a person sees.

  EVERY TAB IS A LINK, so a tab is an address. A tab that switched a panel in place would be a page nobody could send,
  bookmark or open in a second window, and each of these tabs is a whole page with its own blocks and its own read.
  That is also why this is a `nav` of links with `aria-current` and not an ARIA `tablist`: a tablist promises arrow keys
  that move between panels on one page, and these go to another page.

  IT IS THE APP'S OWN CONTROL, NOT THE DECLARING PACK'S: the toolbar's glass segmented control (SYSTEM §5), "here" the
  white pill in it, and nothing in it takes a colour from the record (DIRECTION 28: what a person builds is structure,
  and BrainDog's look stays its own).
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
  /* THE STRIP IS A GLASS SEGMENTED CONTROL ON THE GROUND (SYSTEM §5, `controls.css`'s `.segmented`): a glass track with
     its hairline pair, each tab a pill in it, and the page you are on the tile's own white pill lifted by a tiny
     shadow, a shape and not a shade. It sits in the page's gutter, on the title's left edge, and `--page-max` is the
     page grid's own width. */
  .page-tabs {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    max-inline-size: var(--page-max);
    padding: var(--sp-3) var(--gutter) 0;
  }

  /* NEVER WRAPS, SCROLLS SIDEWAYS INSIDE ITS TRACK. A second line of tabs reads as a second set of places, and it
     pushes the page down by a row each time a section grows. */
  .tab-row {
    display: flex;
    flex: 0 1 auto;
    gap: 2px;
    min-inline-size: 0;
    padding: 3px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
    background: var(--glass);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
  }

  /* AND THE EDGE WHERE IT IS CUT FADES, because its scrollbar is hidden and a tab sliced at the track's edge said
     nothing about the tabs past it (pages §2.5, PageTabs). The wide table's fade (`blocks.css`, `.table-region`): the
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
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-sm);
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
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* Where you are: the tile's white pill with a tiny shadow and a hairline, so it is a shape on the glass in light and
     in dark, where a shadow alone does not show. Ink, and no weight change. */
  .tab[aria-current='page'],
  .tab-more[data-here] .tab {
    background: var(--bg);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--ink) 12%, transparent),
      0 0 0 0.5px var(--line);
    color: var(--ink);
  }

  /* MORE IS ITS OWN GLASS PILL BESIDE THE TRACK, as a toolbar's pill buttons are. */
  .tab-more {
    flex: 0 0 auto;
    padding: 3px;
    background: var(--glass);
    -webkit-backdrop-filter: var(--glass-blur);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
  }

  .tally {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The Menu's rows, as the rail's switcher draws them: a list of places, one of which you may be in. */
  .mi {
    display: flex;
    align-items: center;
    min-block-size: calc(var(--ctl-h-sm) + var(--sp-1));
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-base);
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
