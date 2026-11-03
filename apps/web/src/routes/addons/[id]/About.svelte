<!--
  What the store knows of an add-on this record holds, drawn on its one page: what it
  reaches outside the record, said even when it is nothing; its versions, newest first, with the one on this record
  marked; and who made it, under what licence, and where it is offered.

  READ FROM THE SAME LISTING THE STORE DRAWS (`found.ts`), so the two never disagree on a version or a host.
-->
<script lang="ts">
  import type { CatalogueVersion } from '@braindog/declare/catalogue';
  import Tile from '$lib/ui/Tile.svelte';
  import { latestOf, type Listing } from '$lib/market/listing.ts';
  import { words } from '$lib/market/words.ts';
  import { callSaid } from '../catalogue.ts';
  import type { Tier } from './found.ts';

  let { listing, tier, held }: { listing: Listing; tier: Tier; held: string | null } = $props();

  const about = words.about;
  const calls = $derived(latestOf(listing)?.reach.calls_out ?? []);
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
  <Tile icon="globe" title={about.reaches} count={calls.length || undefined}>
    {#if calls.length === 0}
      <p class="said">{about.reachesNothing}</p>
    {:else}
      <ul class="log">
        {#each calls as call, i (i)}<li class="log-row">{callSaid(call)}</li>{/each}
      </ul>
    {/if}
  </Tile>
</div>

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

<div class="about-cell">
  <Tile icon="info" title={about.madeBy}>
    <dl class="facts">
      <dt>{about.author}</dt>
      <dd>{listing.publisher?.name ?? listing.author}</dd>
      <dt>{words.licence}</dt>
      <dd>{listing.license}</dd>
      <dt>{about.listedAt}</dt>
      <dd>{about.tiers[tier]}</dd>
    </dl>
  </Tile>
</div>

<style>
  .about-cell {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
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

  .log-row + .log-row {
    border-block-start: 1px solid var(--rule);
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

  .facts {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .facts dt {
    color: var(--ink-3);
  }

  .facts dd {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
</style>
