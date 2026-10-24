<!--
  One built-in or one add-on from outside as a row on browse: the glyph of the place it brings, its name, one line of
  what it is for, and at the end the word "Installed" or the one cue its page will offer. The same row /packs draws
  for what is installed (the UI pass of 20 October, agents F9), so a built-in reads as a thing you hold and not as a
  card in a grid.

  THE WHOLE ROW IS THE LINK, to the listing's own page, where the plan is read before anything installs.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { glyphOf } from './ListingCard.svelte';
  import { describe, listingHolds } from './describe.ts';
  import { latestOf, listingHref, type Action, type Listing } from './listing.ts';
  import { words } from './words.ts';

  let { listing, action = null, glyph = null }: { listing: Listing; action?: Action | null; glyph?: IconName | null } = $props();

  const reach = $derived(latestOf(listing)?.reach ?? null);
  /* WHAT IT ADDS, SAID AS EVERY SCREEN SAYS IT (E21): "4 lists and 4 pages", the add-on's page and Installed alike. */
  const counts = $derived(describe(listingHolds(listing, firstPartyModules())));
  const maker = $derived(listing.publisher?.kind === 'braindog' ? null : words.by(listing.publisher?.name ?? listing.author));
  const cue = $derived(
    action?.kind === 'installed'
      ? words.installed
      : action?.kind === 'update'
        ? words.update(action.to)
        : action?.kind === 'turn-on'
          ? words.turnOn(listing.title)
          : words.installCue,
  );
</script>

<li class="listing-row">
  <a class="row-link" href={at(listingHref(listing))}>
    <IconWell name={glyph ?? glyphOf(listing)} size="l" />
    <span class="lr-words">
      <span class="lr-name">{listing.title}</span>
      <span class="lr-line">{listing.summary}</span>
      {#if counts || maker}<span class="lr-meta num">{[counts, maker].filter(Boolean).join(' · ')}</span>{/if}
    </span>
    <span class="lr-cue" data-held={action?.kind === 'installed' ? '' : undefined}>
      {#if action?.kind === 'installed'}<Icon name="check" size="s" />{/if}{cue}
    </span>
  </a>
</li>

<style>
  .listing-row {
    position: relative;
  }

  /* A HAIRLINE BETWEEN ROWS, starting at the words, as every list in the app divides. */
  .listing-row + .listing-row::before {
    content: '';
    position: absolute;
    inset-block-start: 0;
    inset-inline: calc(var(--sp-2) + var(--well-l) + var(--sp-3)) var(--sp-2);
    block-size: 1px;
    background: var(--rule);
  }

  .row-link {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: 64px;
    padding: var(--sp-2);
    border-radius: var(--r-ctl);
    color: inherit;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .lr-words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .lr-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: 22px;
  }

  .lr-line {
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lr-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .lr-cue {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    transition: background var(--d-state) var(--ease-out);
  }

  .lr-cue[data-held] {
    padding-inline: 0;
    background: none;
    color: var(--ink-3);
  }

  .row-link:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .row-link:hover {
      background: var(--hover);
    }

    .listing-row:has(> .row-link:hover)::before,
    .listing-row:has(> .row-link:hover) + .listing-row::before {
      opacity: 0;
    }
  }

  /* ON A PHONE THE LINE WRAPS TO TWO, since a cut summary loses its verb, and the row is 72 tall. */
  @media (width < 640px) {
    .row-link {
      align-items: start;
      min-block-size: 72px;
    }

    .row-link > :global(.well) {
      margin-block-start: 2px;
    }

    .lr-line {
      display: -webkit-box;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .lr-cue {
      align-self: center;
    }
  }
</style>
