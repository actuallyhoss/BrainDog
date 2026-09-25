<!--
  A run's own address, `/jobs/<id>`, and what it says while no record can answer with a run's steps.

  THERE IS NO METHOD THAT ANSWERS WITH A RUN'S TOOL CALLS, so this screen drew the sample's transcripts: six steps of
  `j_9K4A`, and `j_7Q2F` failing on `PROPOSAL_UNCITED`, under whichever record the reader was signed in to, with a note
  saying they were an example (DIRECTION 26). The sample's runs are a test fixture now (`fixtures/readers.ts`), so the
  address names a run this record cannot show, and it says so in the record's own sentence. The transcript comes back
  with the read that answers it: one row per tool call with its result folded on the same row, and a header that reads
  its status from the last event (23 §3.1).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { page as route } from '$app/state';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen from a shell that has
   * fetched nothing. A screen that starts fetching brackets its reads with `opened()` and `closed()` instead.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.run)}</title></svelte:head>

<div class="page">
  {#if route.data.refused}
    <!-- A REFUSED SHELL IS NOT A RUN TO SHOW. The record's sentence is the page, as it is on Home. -->
    <Empty kind="error" heading title={route.data.refused.fix} />
  {:else}
    <!-- A URL NAMING SOMETHING THIS RECORD CANNOT SHOW IS A REFUSAL, and the record already has the sentence for it.
         Nothing failed, so there is no request id to quote (`50 §13 D11`), and no filter ran, so "nothing matched" is
         about something that did not happen. -->
    <Empty kind="error" heading title={copy.noSuch('run', String(route.params.id))}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1000px;
  }
</style>
