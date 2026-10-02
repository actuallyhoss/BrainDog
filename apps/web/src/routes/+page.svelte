<!--
  The record's front door: Today, a declared page (`lib/home/Home.svelte`), drawn by the one page reader. A use case's
  `home-<id>` page or the record's own `home` page is drawn in its place when the record holds one.

  OVERVIEW IS THE SAME PAGE NOW. `/?overview` was the house Home, a second front door beside Today; the two are one
  declared page, and the old address still opens it. Each is a word in the query and not a folder of its own, because
  every top-level folder is a word no record may be named (`APP_WORDS` in `lib/at.ts`), and a record somebody already
  called "overview" must still open.

  TODAY AS IT WAS IS KEPT, at `/?classic` (`lib/home/Today.svelte`), until the declared page does everything it did. It
  is loaded when it is asked for, so the front door carries none of it.

  THE WORK SCREEN IS HERE TOO, at `/?work` (`lib/work/Work.svelte`), for the same reason, and the nav's Work row opens it
  on a record that holds tasks (`WORK` in `lib/nav.ts`).
-->
<script lang="ts">
  import { page } from '$app/state';
  import Home from '$lib/home/Home.svelte';

  let { data } = $props();
</script>

{#if page.url.searchParams.has('work')}
  {#await import('$lib/work/Work.svelte') then loaded}
    <loaded.default {data} />
  {/await}
{:else if page.url.searchParams.has('classic')}
  {#await import('$lib/home/Today.svelte') then loaded}
    <loaded.default {data} />
  {/await}
{:else}
  <Home {data} />
{/if}
