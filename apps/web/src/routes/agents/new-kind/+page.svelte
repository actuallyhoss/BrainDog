<!--
  A new job kind: `/agents/new-kind`, opened from "Run a job" on `/jobs`; its way back and its Cancel go to Agents, `/p/agents`,
  or to Settings › Agents on a record that does not hold that page (`agentsPlace`).

  THE FORM IS `NewKind`, and this screen is its header and its room. It reads nothing: every choice the form offers is
  the kernel's or the record's own tools, so it draws at once. The route is its own chunk, loaded when it is opened, so
  nothing here is in what every screen loads.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { titleOf } from '$lib/title.ts';
  import { agentsPlace } from '$lib/nav/rail.ts';
  import { words } from '$lib/agents/new-kind.ts';
  import NewKind from '$lib/agents/NewKind.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';

  /* IT CALLS NOTHING, SO IT SAYS IT DREW: with no call out and no claim, `data-screen` never appears and the screen
     reads as one that never settled. */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(words.heading)}</title></svelte:head>

<PageHead icon="session" title={words.heading} kicker={words.parent} back={agentsPlace((page.data as { pages?: readonly string[] }).pages)} sentence="" />
<div class="page">
  <NewKind />
</div>

<style>
  .page {
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }
</style>
