<!--
  The record's front door: Today (`lib/home/Today.svelte`), what needs you, who is working, what changed since you were
  last here and money at a glance.

  THE PAGE THE RECORD OPENED ON BEFORE IS KEPT, at `/?overview` (`lib/home/Overview.svelte`), and reached from More. It
  is a word in the query and not a folder of its own, because every top-level folder is a word no record may be named
  (`APP_WORDS` in `lib/at.ts`), and a record somebody already called "overview" must still open.

  THE WORK SCREEN IS HERE TOO, at `/?work` (`lib/work/Work.svelte`), for the same reason, and the nav's Work row opens it
  on a record that holds tasks (`WORK` in `lib/nav.ts`). It is loaded when it is asked for, so Today carries none of it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import Today from '$lib/home/Today.svelte';
  import Overview from '$lib/home/Overview.svelte';

  let { data } = $props();
</script>

{#if page.url.searchParams.has('overview')}
  <Overview {data} />
{:else if page.url.searchParams.has('work')}
  {#await import('$lib/work/Work.svelte') then loaded}
    <loaded.default {data} />
  {/await}
{:else}
  <Today {data} />
{/if}
