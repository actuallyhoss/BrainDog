<!--
  The use cases, as cards: `/packs/browse`, the seed of the marketplace (`loop/research-spark.md` S14,
  `loop/research-marketplace.md` §1).

  A CARD IS READ FROM THE USE CASE'S OWN DECLARATIONS (`share.ts` `previewOf`): what it is for, the rail its pages make,
  the headings of its Home and the lists it adds. Nothing on a card is drawn by hand, so a card cannot promise what the
  install does not do.

  INSTALL IS THE SAME PLAN A SHARED FILE GETS. A built-in use case is handed to the record as the file it would be
  (`builtInFile`), planned by `planUseCase` and installed pack by pack through `installPack`. A use case this record
  already holds is switched to, by turning its pack on and the one speaking now off.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { modulesToInstall, previewOf } from '@braindog/seed/usecases/share';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/record.ts';
  import { choose, type PackState, type Source } from '$lib/record/packs.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';
  import Offer from './Offer.svelte';
  import Preview from './Preview.svelte';
  import CatalogueCard from './CatalogueCard.svelte';
  import { readHostCatalogue } from './catalogue.ts';
  import type { CatalogueIndex } from '@braindog/declare/catalogue';

  const cards = USE_CASES.map((u) => ({ u, preview: previewOf(u) }));

  let client = $state.raw<ReturnType<typeof createClient> | null>(null);
  let source: Source | null = null;
  let live = $state(false);
  let states = $state<PackState[]>([]);
  let refused = $state<string | null>(null);
  /* THIS HOST'S CATALOGUE, when it serves one (`BRAINDOG_CATALOGUE`); none is not an error. */
  let catalogue = $state.raw<CatalogueIndex | null>(null);
  let catalogueRefused = $state<string | null>(null);

  async function reread() {
    const again = await source?.packs();
    if (again?.ok) states = again.value;
  }

  onMount(() => {
    void readHostCatalogue(fetch).then((got) => {
      if (got.ok) catalogue = got.index;
      else catalogueRefused = got.fix;
    });
    void read(async () => {
      client = createClient({ base: location.origin });
      const chosen = await choose(client, !page.data.live);
      source = chosen.source;
      live = !chosen.source.sample;
      if (!chosen.first.ok) {
        refused = chosen.first.refusal.fix;
        return false;
      }
      states = chosen.first.value;
      return true;
    });
  });
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.useCases)}</title></svelte:head>

<PageHead icon="packs" title={copy.useCases} />

<div class="page">
  <p class="blurb">{copy.useCasesBlurb}</p>
  {#if refused}
    <Empty kind="error" title={refused} />
  {/if}
  <ul class="cards">
    {#each cards as { u, preview } (u.usecase)}
      <li class="card">
        <header class="card-head">
          <h2 class="card-title"><a class="card-link tap" href="/packs/browse/{u.usecase}">{u.title}</a></h2>
          <span class="card-for">{copy.shareAudiences[u.audience]}</span>
        </header>
        <p class="card-summary">{u.summary}</p>
        {#if modulesToInstall(u).length > 0}<p class="card-note">{copy.browseBuildsOn([...modulesToInstall(u)])}</p>{/if}

        <Preview {preview} />

        <footer class="card-foot">
          <div class="card-offer"><Offer {u} {client} {live} {states} onchanged={reread} /></div>
          <Button weight="bare" href="/packs/browse/{u.usecase}">{copy.browseDetails}</Button>
        </footer>
      </li>
    {/each}
  </ul>

  {#if catalogueRefused}
    <Empty kind="error" title={catalogueRefused} />
  {:else if catalogue && catalogue.entries.length > 0}
    <section class="catalogue" aria-labelledby="catalogue-h">
      <h2 class="catalogue-h" id="catalogue-h">{copy.catalogueHeading}</h2>
      <p class="blurb">{copy.catalogueBlurb}</p>
      <ul class="cards fill">
        {#each catalogue.entries as entry (entry.id)}<CatalogueCard {entry} />{/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1100px;
  }

  .blurb {
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CATALOGUE OF ONE keeps a card's width rather than stretching across the page. */
  .cards.fill {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  }

  .catalogue {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
  }

  .catalogue-h {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-lg);
    background: var(--bg);
  }

  .card-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .card-title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .card-for,
  .card-note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .card-summary {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .card-note {
    margin: 0;
  }

  .card-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-2);
    margin-block-start: auto;
  }

  .card-offer {
    flex: 1 1 12rem;
    min-inline-size: 0;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  .card-link:hover {
    text-decoration: underline;
  }
</style>
