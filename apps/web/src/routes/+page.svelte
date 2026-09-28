<!--
  The record's front door: Today (`lib/home/Today.svelte`), what needs you, who is working, what changed since you were
  last here and money at a glance.

  THE PAGE THE RECORD OPENED ON BEFORE IS KEPT, at `/?overview` (`lib/home/Overview.svelte`), and reached from More. It
  is a word in the query and not a folder of its own, because every top-level folder is a word no record may be named
  (`APP_WORDS` in `lib/at.ts`), and a record somebody already called "overview" must still open.
-->
<script lang="ts">
  import { page } from '$app/state';
  import Today from '$lib/home/Today.svelte';
  import Overview from '$lib/home/Overview.svelte';

  let { data } = $props();
</script>

{#if page.url.searchParams.has('overview')}
  <Overview {data} />
{:else}
  <Today {data} />
{/if}
