<!--
  The top bar: where you are, and asking. It runs across the work's column only, from the sidebar's edge to the window's,
  and moves with that edge when the sidebar is dragged, hidden or narrowed to its rail. Every place is the sidebar's.

  ONE FLAT STRIP, 56 TALL, ON THE NAV'S OWN SURFACE, the sidebar's, with one hairline under it on the same line as the
  hairline under the sidebar's head. Left to right: the crumb ("Money › Ledger", "Projects › Kiln"), each step but the
  last a link back; "Ask or change anything" with its "/" key; the bell (what happened, never what was asked); and the
  face (how you sign in, the keyboard keys, Sign out).

  THE LAST STEP IS THE PAGE'S TITLE, AND THE ONLY TIME IT IS SAID (29 October): "Today" on Today (plan F5), "Needs
  you" with its count as a quiet figure, "Projects › Kiln". The page under it draws no name of its own (`PageHead`).

  ITS START IS THE WORK'S START: the bar pads its start by the page's gutter, so the crumb and the first tile under it
  share one edge at every width. BELOW 900px THIS IS NOT DRAWN: each page's head carries the phone's bar. ON `/search`
  THE ASK FIELD IS NOT DRAWN: the page's own field is.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import Bell from '../shell/Bell.svelte';
  import HereFaces from '$lib/shell/HereFaces.svelte';
  import { frame } from '../shell/frame.svelte.ts';
  import type { Crumb } from '../shell/side.ts';
  import YouMenu from '../shell/YouMenu.svelte';
  import Icon from './Icon.svelte';
  import Kbd from './Kbd.svelte';

  let {
    crumb = [],
    onfind,
  }: {
    /** Where you are, place first: each step a link back but the last. */
    crumb?: readonly Crumb[];
    onfind?: (() => void) | undefined;
  } = $props();

  const words = { where: 'You are here' } as const;

  /* THE ASK FIELD STANDS DOWN ON THE SEARCH PAGE, which draws the field itself (money F12). */
  const searching = $derived(inside(page.url.pathname) === '/search');
</script>

<nav class="topbar" aria-label={words.where}>
  <div class="crumb">
    <ol>
      {#each crumb as step, i (i)}
        <li>
          {#if i > 0}<span class="crumb-sep" aria-hidden="true"><Icon name="chevron" size="s" /></span>{/if}
          {#if step.href}
            <a class="crumb-up" href={at(step.href)} dir="auto">{step.label}</a>
          {:else}
            <span class="crumb-here" aria-current="page" dir="auto">{step.label}</span>{#if i === crumb.length - 1 && frame.figure}<span class="crumb-figure num">{frame.figure}</span>{/if}
          {/if}
        </li>
      {/each}
    </ol>
  </div>

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens out of (`data-palette-from`), its key at rest: `/` finds,
       and ⌘J (Ctrl J off a Mac) opens straight into Ask, which is the key the hint names. -->
  {#if !searching}
    <button type="button" class="bar-ask tap" data-palette-from="bar" aria-keyshortcuts="/ Control+K Meta+K Control+J Meta+J" title={copy.searchKeys} onclick={() => onfind?.()}>
      <!-- WITH NO MODEL, "Search or go to…" and the search's own key (AG5): ⌘J opens Find there, so naming it promised an Ask. -->
      <Icon name="search" size="m" /><span class="bar-ask-words">{page.data.slash === true ? copy.palettePlaceholder : copy.paletteFind}</span><span class="bar-ask-key" aria-hidden="true"><Kbd keys={page.data.slash === true ? '⌘J' : '⌘K'} /></span>
    </button>
  {/if}

  <span class="bar-end" data-alone={searching ? '' : undefined}>
    <HereFaces />
    <Bell />
    <YouMenu />
  </span>
</nav>

<style>
  /* THE STRIP: 56 tall, the work's gutter at each end. Its surface and its edge are the slot's (`+layout.svelte`). */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    box-sizing: border-box;
    min-inline-size: 0;
    block-size: 56px;
    padding-inline: var(--gutter);
  }

  /* THE CRUMB: the place in the quiet ink, a small chevron, where you are in ink at 600. One line; a long name ends in
     an ellipsis rather than pushing Ask off the bar. */
  /* WHERE YOU ARE HANDS OVER IN PLACE through a page change (`app.css`, `bar-crumb`): the old words go, then the new
     ones come up, in the same box, so the two never cross. */
  .crumb {
    flex: 1 1 auto;
    min-inline-size: 0;
    view-transition-name: bar-crumb;
  }

  .crumb ol {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-ctl);
    white-space: nowrap;
  }

  .crumb li {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .crumb li:last-child {
    flex: 0 1 auto;
    gap: 0;
    overflow: hidden;
  }

  .crumb li:last-child > .crumb-sep {
    margin-inline-end: var(--sp-1);
  }

  .crumb-up {
    border-radius: var(--r-xs);
    color: var(--ink-3);
    text-decoration: none;
  }

  /* THE PAGE'S TITLE: 17 at 600 in the display face, as the page names wear it, on one line and cut at its end. */
  .crumb-here {
    overflow: hidden;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
  }

  /* ITS COUNT, quiet, a step after it. */
  .crumb-figure {
    flex: none;
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  .crumb-sep {
    display: inline-grid;
    flex: none;
    color: var(--ink-3);
    opacity: 0.7;
  }

  .crumb-sep:dir(rtl) {
    scale: -1 1;
  }

  @media (hover: hover) and (pointer: fine) {
    .crumb-up:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* ASK, DRAWN AS THE FIELD IT OPENS: 320 wide on `--tile-2` with a hairline, so it reads as a field on the nav's
     surface in both themes, the words at 14 in the quiet ink, and its key. */
  .bar-ask {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: 0 1 320px;
    min-inline-size: 200px;
    block-size: 36px;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    border: 1px solid var(--rule);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: text;
    transition: border-color var(--d-state) var(--ease-out);
  }

  /* BELOW 1360 IT ASKS FOR 240 (plan F6): at 320 on a 1280 window it pushed the crumb into an ellipsis. */
  @media (width < 1360px) {
    .bar-ask {
      flex-basis: 240px;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .bar-ask:hover {
      border-color: var(--rule-strong);
    }
  }

  .bar-ask-words {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-ask-key {
    display: inline-flex;
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  /* THE BELL AND THE FACE, 8 apart, the face's circle on the gutter's edge. */
  .bar-end {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
  }

  @media (forced-colors: active) {
    .bar-ask {
      border: 1px solid CanvasText;
    }
  }
</style>
