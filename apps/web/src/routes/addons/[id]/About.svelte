<!--
  What the store knows of a plugin this record holds, drawn on its one page: its versions, newest first, with the one on
  this record marked. What it reaches and who made it are the record's word, said once by `Origin.svelte`'s cards
  (3 Nov: "What it reaches" said again what "What it may do here" says, and "Made by" what "Where it came from" says).

  READ FROM THE SAME LISTING THE STORE DRAWS (`found.ts`), so the two never disagree on a version or a host.
-->
<script lang="ts">
  import type { CatalogueVersion } from '@braindog/declare/catalogue';
  import Tile from '$lib/ui/Tile.svelte';
  import type { Listing } from '$lib/market/listing.ts';
  import { words } from '$lib/market/words.ts';

  let { listing, held }: { listing: Listing; held: string | null } = $props();

  const about = words.about;
  /* THE NEWEST, THE ONE ON THIS RECORD, AND THE REST FOLDED, so the version he runs is never under the fold. */
  const shown = $derived(listing.versions.filter((v, i) => i === 0 || v.version === held));
  const folded = $derived(listing.versions.filter((v) => !shown.includes(v)));
</script>

{#snippet versionRow(v: CatalogueVersion)}
  <li class="log-row" data-yanked={v.yanked ? '' : undefined}>
    <span class="v-line">
      <span class="v num">{v.version}</span>
      {#if v.version === held}<span class="here">{about.onHere}</span>{/if}
      <span class="quiet">{[v.bump ? words.bump[v.bump] : words.first, v.published_at ? words.published(v.published_at) : ''].filter(Boolean).join(' · ')}</span>
    </span>
    {#if v.notes}<span class="notes">{v.notes}</span>{/if}
    {#if v.yanked}<span class="quiet">{words.yanked(v.yanked.reason)}</span>{/if}
  </li>
{/snippet}

<div class="about-cell">
  <Tile icon="history" title={words.versions} count={listing.versions.length}>
    <ol class="log versions">
      {#each shown as v (v.version)}{@render versionRow(v)}{/each}
    </ol>
    {#if folded.length > 0}
      <details class="earlier">
        <summary class="tap">{words.earlier(folded.length)}</summary>
        <ol class="log versions">
          {#each folded as v (v.version)}{@render versionRow(v)}{/each}
        </ol>
      </details>
    {/if}
  </Tile>
</div>

<style>
  .about-cell {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .log {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .log-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: var(--sp-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }


  .v-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
  }

  .versions .log-row[data-yanked] .v {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  /* A VERSION IS A FIGURE, in tabular figures of the body face and never the identifier face. */
  .v {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* THE VERSION ON THIS RECORD, said in words beside it and never by colour alone. */
  .here {
    color: var(--good);
    font-weight: 500;
  }

  .quiet {
    color: var(--ink-3);
  }

  .earlier > summary {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    cursor: pointer;
  }

  .earlier[open] > summary {
    margin-block-end: var(--sp-2);
  }

  .notes {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }
</style>
