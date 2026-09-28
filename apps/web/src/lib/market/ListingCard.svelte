<!--
  One listing as a card on browse (`listing.ts`): a small drawing, then the title, one line of what it is for, who
  published it and whether that is vouched for, how many records hold it, and what it calls out to.

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
    <header class="head">
      <h2 class="title"><a class="link tap" {href}>{listing.title}</a></h2>
      <span class="kind">{words.kinds[listing.kind]}</span>
    </header>
    <p class="summary">{listing.summary}</p>
    <ul class="facts">
      <li>
        <Icon name={verified ? 'check' : 'info'} size="s" />
        {words.by(listing.publisher?.name ?? listing.author)}{#if verified}<span class="verified">{' · '}{verified === 'reviewed' ? words.reviewed : words.verified}</span>{/if}
      </li>
      {#if listing.count !== null}<li><Icon name="people" size="s" />{words.installs(listing.count)}</li>{/if}
      <!-- A BUILT-IN'S CALLS ARE SAID ON ITS DETAIL PAGE, read from its file there; the index computed a catalogue
           entry's when it was listed, so only that one is said on the card. -->
      {#if listing.source === 'kennel'}
        <li data-calls={hosts.length > 0 ? '' : undefined}><Icon name={hosts.length > 0 ? 'globe' : 'check'} size="s" />{hosts.length > 0 ? words.callsOut(hosts) : words.callsNothing}</li>
      {/if}
      {#if action?.kind === 'installed'}
        <li class="held"><Icon name="check" size="s" />{words.installed}</li>
      {:else if action?.kind === 'update'}
        <li class="held"><Icon name="refresh" size="s" />{words.update(action.to)}</li>
      {/if}
    </ul>
  </div>
</li>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-md);
    background: var(--bg);
  }

  .card:hover {
    border-color: var(--line);
  }

  .drawing {
    min-inline-size: 0;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
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
    outline: 1px solid var(--ink2);
    box-shadow: 0 0 0 3px var(--focus-halo);
    outline-offset: -1px;
  }

  .kind,
  .quiet {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .summary {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .facts,
  .names {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .facts li,
  .names li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .names li {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .verified,
  .held {
    color: var(--ink2);
  }

  .facts li[data-calls] {
    color: var(--ink2);
  }
</style>
