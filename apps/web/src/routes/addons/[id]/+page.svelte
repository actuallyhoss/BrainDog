<!--
  One add-on: `/addons/<id>`. With `?kind=`, as the store links it, the store's page; without, the add-on as this record
  holds it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import Installed from './Installed.svelte';
  import Listing from './Listing.svelte';

  const listed = $derived(page.url.searchParams.has('kind'));
</script>

{#if listed}<Listing />{:else}<Installed />{/if}
