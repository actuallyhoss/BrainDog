<!--
  Settings > Notifications' summaries: which summaries this record sends, each opening its screen, or, where it sends
  none, the add-on that sends the two a day at 08:00 and 17:00. "The rest waits for your summary" is said above it, and
  this is where that summary is.

  READ FROM THE RECORD (`digestToday`), never a list of its own. A host that answers nothing draws nothing.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { offerHref, summariesOf, summaryHref, summaryWords as words, type Summary } from './summary.ts';

  let summaries = $state.raw<Summary[] | null>(null);
  /* WHILE IT IS READ, what follows waits out of sight where a page holds it (Settings' `data-hold`), so the tile does not
     land over Quiet hours and push it down. */
  let reading = $state(true);

  onMount(() => {
    void createClient({ base: apiBase() })
      .call('digestToday', {})
      .then((out) => {
        const a = out as { ok?: unknown } | null;
        summaries = a?.ok === true ? summariesOf(out) : null;
      })
      .catch(() => (summaries = null))
      .finally(() => (reading = false));
  });
</script>

{#if reading}<span data-hold hidden></span>{/if}
{#if summaries !== null}
  <Tile icon="history" title={words.all}>
    {#if summaries.length === 0}
      <p class="said">{words.offer}</p>
      <div class="foot"><Button href={offerHref}>{words.getIt}</Button></div>
    {:else}
      <ul class="sums">
        {#each summaries as s (s.id)}
          <li class="sum"><a href={at(summaryHref(s.id))} dir="auto">{s.name}</a></li>
        {/each}
      </ul>
      <p class="said quiet">{words.sentAt}</p>
    {/if}
  </Tile>
{/if}

<style>
  .said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .quiet {
    margin-block-start: var(--sp-2);
    color: var(--ink-2);
  }

  .sums {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sum {
    min-block-size: var(--row-h);
    display: flex;
    align-items: center;
  }

  .sum + .sum {
    border-block-start: 1px solid var(--rule);
  }

  .sum a {
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .foot {
    margin-block-start: var(--sp-2);
  }
</style>
