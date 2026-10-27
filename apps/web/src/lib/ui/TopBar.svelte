<!--
  The top bar: where you are, and asking. It runs across the work's column only, from the sidebar's edge to the window's,
  and moves with that edge when the sidebar is dragged, hidden or narrowed to its rail. Every place is the sidebar's.

  ONE FLAT STRIP, 56 TALL, ON THE NAV'S OWN SURFACE, the sidebar's, with one hairline under it on the same line as the
  hairline under the sidebar's head. Left to right: the crumb ("Money › Ledger", "Projects › Kiln"), each step but the
  last a link back; "Ask or change anything" with its "/" key; the bell (what happened, never what was asked); and the
  face (how you sign in, the keyboard keys, Sign out).

  ITS START IS THE WORK'S START: the bar pads its start by the page's gutter, so the crumb and the first tile under it
  share one edge at every width. BELOW 900px THIS IS NOT DRAWN: each page's head carries the phone's bar. ON `/search`
  THE ASK FIELD IS NOT DRAWN: the page's own field is.
-->
<script lang="ts">
  import { at, here as inside } from '../at.ts';
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import Bell from '../shell/Bell.svelte';
  import type { Crumb } from '../shell/side.ts';
  import YouMenu from '../shell/YouMenu.svelte';
  import Icon from './Icon.svelte';

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
            <span class="crumb-here" aria-current="page" dir="auto">{step.label}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </div>

  <!-- THE ONE WAY TO ASK, drawn as the field the palette opens out of (`data-palette-from`), its key at rest. -->
  {#if !searching}
    <button type="button" class="bar-ask tap" data-palette-from="bar" aria-keyshortcuts="/ Control+K Meta+K" onclick={() => onfind?.()}>
      <Icon name="search" size="m" /><span class="bar-ask-words">{copy.palettePlaceholder}</span><kbd aria-hidden="true">/</kbd>
    </button>
  {/if}

  <span class="bar-end" data-alone={searching ? '' : undefined}>
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
  .crumb {
    flex: 1 1 auto;
    min-inline-size: 0;
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
    overflow: hidden;
  }

  .crumb-up {
    border-radius: var(--r-xs);
    color: var(--ink-3);
    text-decoration: none;
  }

  .crumb-here {
    overflow: hidden;
    color: var(--ink);
    font-weight: var(--fw-semi);
    text-overflow: ellipsis;
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

  .bar-ask kbd {
    display: inline-grid;
    place-items: center;
    flex: none;
    min-inline-size: 20px;
    block-size: 20px;
    background: var(--tile);
    border: 1px solid var(--rule);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font: inherit;
    font-family: var(--font-mono);
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
