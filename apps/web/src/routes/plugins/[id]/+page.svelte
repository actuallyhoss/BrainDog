<!--
  One plugin, one page: `/plugins/<id>`. The plugin as this record holds it when it holds
  it, from the store or from Settings › Add-ons alike, and the store's page for it when it does not (`found.ts`). The
  store's page is also where an update's plan is read, `?update`, so the head's update press opens it.

  Until the record answers, nothing is drawn: drawing the store's page first and then the record's would show two pages.
  A record that does not answer draws the store's page, which says so.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import Installed from '../../addons/[id]/Installed.svelte';
  import Listing from '../../addons/[id]/Listing.svelte';
  import { heldAs, KINDS } from '../../addons/[id]/found.ts';

  /** The record's packs; `null` until it answers, `false` when it does not. */
  let states = $state.raw<PackState[] | null | false>(null);

  onMount(() => {
    void choose(createClient({ base: apiBase() }))
      .then((chosen) => (states = chosen.first.ok ? chosen.first.value : false))
      .catch(() => (states = false));
  });

  const kind = $derived(KINDS.find((k) => k === page.url.searchParams.get('kind')) ?? null);
  const updating = $derived(page.url.searchParams.has('update'));
  const held = $derived(states ? heldAs(String(page.params.id), kind, states) : null);
</script>

{#if states === false || (states !== null && (held === null || updating))}
  <Listing />
{:else if held !== null}
  {#key held}<Installed packId={held} />{/key}
{/if}
