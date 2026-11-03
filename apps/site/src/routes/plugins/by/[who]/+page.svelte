<!--
  `/plugins/by/<who>`: one author's plugins. The night head with the way back to the store, their name and how many they
  have listed, then their cards on the board's ground, drawn by the store's own `Cards.svelte`.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { PLUGINS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import Cards from '$lib/packs/Cards.svelte';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = packs.packs;
  const b = w.by_page;
</script>

<Seo title={b.title(data.name)} description={b.description(data.name, data.cards.length)} path="{PLUGINS}/by/{data.slug}" />
{#snippet back()}
  <a class="back" href={PLUGINS}><Icon name="back" size="m" />{b.back}</a>
{/snippet}

<PageHead title={b.heading(data.name)} lead={b.lede(data.cards.length)} before={back}>
  {#if data.ours}<p class="ours"><Mark height={14} tone="inherit" />{w.ours}</p>{/if}
</PageHead>

<section class="store">
  <div class="wrap">
    <Cards cards={data.cards} />
  </div>
</section>

<EarlyStrip />

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: var(--tap);
    margin-block-end: 20px;
    color: var(--on-night-2);
    font-size: var(--t-site-15);
    font-weight: 500;
    text-decoration: none;
  }

  .back:hover {
    color: var(--on-night);
  }

  .ours {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 24px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-site-15);
  }

  .store {
    padding-block: 48px 96px;
    background: var(--board);
  }

  @media (max-width: 760px) {
    .store {
      padding-block: 24px 64px;
    }
  }
</style>
