<!--
  One listing as a card on browse (`listing.ts`): a small drawing, then the title, two lines of what it does, what it
  calls out to when it calls anywhere, who published it and whether that is vouched for, how many records hold it, and
  the one cue that says what its page will offer.

  THE DRAWING IS THE BEST ONE THERE IS. A built-in use case's rail and Home are the caller's (`drawing`, today's
  `Preview.svelte`, which reads the use case's own declarations); an add-on whose version has a trusted preview draws its
  first page through the real renderer (`PreviewPage.svelte`); anything else names the lists and pages it adds, which is
  all that can be said without a picture nobody vouched for.

  WHAT A CARD SAYS ABOUT TRUST IS THE INDEX'S CLAIM. The detail page verifies the signature before anything can be
  pressed; a card only reads what the catalogue computed when the version was listed. Nothing on a card is the author's
  own words about itself but the title and summary.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PreviewPage from './PreviewPage.svelte';
  import { hostsOf, latestOf, listingHref, verifiedOf, type Action, type Listing } from './listing.ts';
  import { readVersionPreview, type PreviewRead } from './preview.ts';
  import { words } from './words.ts';

  let { listing, action = null, drawing }: { listing: Listing; action?: Action | null; drawing?: Snippet | undefined } = $props();

  const latest = $derived(latestOf(listing));
  const reach = $derived(latest?.reach ?? null);
  const hosts = $derived(hostsOf(listing));
  const verified = $derived(verifiedOf(listing));
  const href = $derived(at(listingHref(listing)));

  /* A PREVIEW IS ASKED FOR ONLY WHERE THE INDEX SAYS ONE EXISTS, so a card with none costs no request. */
  let read = $state.raw<PreviewRead>({ state: 'none' });
  $effect(() => {
    const l = listing;
    const v = latest;
    read = { state: 'none' };
    if (drawing || l.kind === 'module' || l.source !== 'kennel' || !v?.preview) return;
    void readVersionPreview(fetch, l.kind, l.id, v.version).then((got) => {
      if (listing === l) read = got;
    });
  });
</script>

<!-- ONE SURFACE PER CARD (design.md §4, the catalogue row): the drawing is the card's only filled shape, and the words sit
     under it on the page's own ground, so no box ever holds another box. What it does leads; what it calls out to follows
     when it calls anywhere; the version, licence and signature are the detail page's. -->
<li class="card">
  <div class="drawing">
    {#if drawing}
      {@render drawing()}
    {:else if read.state === 'ready' && read.preview.pages.length > 0}
      <PreviewPage preview={read.preview} />
    {:else if reach && reach.lists.length + reach.pages.length > 0}
      <ul class="names" aria-label={words.adds}>
        {#each reach.lists.slice(0, 4) as name (`l:${name}`)}<li><Icon name="rows" size="s" />{name}</li>{/each}
        {#each reach.pages.slice(0, 4) as name (`p:${name}`)}<li><Icon name="doc" size="s" />{name}</li>{/each}
      </ul>
    {:else}
      <p class="quiet">{words.addsNothing}</p>
    {/if}
  </div>

  <div class="text">
    <h2 class="title"><a class="link" {href}>{listing.title}</a></h2>
    <p class="summary">{listing.summary}</p>
    <!-- A BUILT-IN'S CALLS ARE SAID ON ITS DETAIL PAGE, read from its file there; the index computed a catalogue entry's
         when it was listed, so only that one is said on the card, and only when it calls somewhere. -->
    {#if listing.source === 'kennel' && hosts.length > 0}
      <p class="calls"><Icon name="globe" size="s" />{words.callsOut(hosts)}</p>
    {/if}
    <p class="meta">
      <span>{words.kinds[listing.kind]}</span>
      <span>{words.by(listing.publisher?.name ?? listing.author)}{#if verified}{' · '}{verified === 'reviewed' ? words.reviewed : words.verified}{/if}</span>
      {#if listing.count !== null}<span class="num">{words.installs(listing.count)}</span>{/if}
    </p>
    <!-- THE ONE CUE: what the detail page's button will say. The card is the link, so this is words on it, not a second
         control; "Installed" and an update say what the record holds. -->
    <span class="cue" data-held={action?.kind === 'installed' ? '' : undefined}>
      {#if action?.kind === 'installed'}<Icon name="check" size="s" />{words.installed}{:else if action?.kind === 'update'}{words.update(action.to)}{:else if action?.kind === 'turn-on'}{words.turnOn(listing.title)}{:else}{words.installCue}{/if}
    </span>
  </div>
</li>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    border-radius: var(--r-md);
  }

  /* THE DRAWING IS THE CARD'S ONE SURFACE: a well in `--sunk`, rounded, with no edge, so what is drawn inside it (a Home
     in miniature, a page at half size, or the names of what it adds) never sits in a second box. */
  .drawing {
    min-inline-size: 0;
    padding: var(--sp-3);
    border-radius: var(--r-md);
    background: var(--sunk);
  }

  .text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  /* THE WHOLE CARD IS THE LINK'S TARGET, by stretching the title's link over it, so the title is the one thing a screen
     reader hears and a thumb can press anywhere. */
  .link {
    color: inherit;
    text-decoration: none;
  }

  .link::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  .link:focus-visible {
    /* focus-ok: the card carries the ring instead (`.card:has(.link:focus-visible)` below), because the link is
       stretched over the whole card and a ring round the title alone would mark a smaller target than the press. */
    outline: none;
  }

  .card:has(.link:focus-visible) {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  .quiet {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* WHAT IT DOES, IN TWO LINES, because one cut most summaries off before their verb. */
  .summary {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .calls {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  /* META WRAPS AS WHOLE ITEMS, with space between them and no separator glyph to lead a wrapped line. */
  .meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .names {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .names li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A PILL THAT READS AS THE PRESS THE DETAIL PAGE OFFERS, in the secondary button's shape; the card is its target. */
  .cue {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-block-start: var(--sp-2);
    padding-block: var(--sp-1);
    padding-inline: var(--sp-3);
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .cue[data-held] {
    border-color: transparent;
    padding-inline: 0;
    color: var(--dim);
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover .cue:not([data-held]) {
      background: var(--hover-wash);
    }
  }
</style>
