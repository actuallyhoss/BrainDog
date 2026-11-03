<!--
  Settings > Notifications' summaries: which summaries this record sends, each opening its screen, or, where it sends
  none, the add-on that sends the two a day at 08:00 and 17:00. "The rest waits for your summary" is said above it, and
  this is where that summary is.

  READ FROM THE RECORD (`digestToday`), never a list of its own. A host that answers nothing draws nothing.

  `row` (finish 3 Nov): drawn as one row of a card that groups others (Settings > Notifications), its glyph, its name,
  its one line and its one action, the summaries it sends as links under it; without it, the tile it always was.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  let { row = false }: { row?: boolean } = $props();
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
{#if summaries !== null && row}
  <div class="sum-row">
    <span class="sum-icon"><IconWell name="history" /></span>
    <span class="sum-words">
      <span class="sum-title">{words.all}</span>
      {#if summaries.length === 0}
        <span class="sum-line">{words.offer}</span>
      {:else}
        <span class="sum-links">
          {#each summaries as s, i (s.id)}<a href={at(summaryHref(s.id))} class="own-dir">{s.name}</a>{#if i < summaries.length - 1}<span aria-hidden="true">, </span>{/if}{/each}
        </span>
        <span class="sum-line">{words.sentAt}</span>
      {/if}
    </span>
    {#if summaries.length === 0}<span class="sum-act"><Button weight="quiet" href={offerHref}>{words.getIt}</Button></span>{/if}
  </div>
{:else if summaries !== null}
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
    line-height: var(--lh-body);
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

  /* ROWS TOLD APART BY AIR, never a rule between them (ops style). */

  .sum a {
    color: var(--ink);
    font-size: var(--fs-body);
  }

  /* AS A ROW OF A GROUPED CARD, `StateRow`'s anatomy (Settings): a 28 well on the title's line, the title at the body
     size and 500, its line in the meta size, the action at the row's end. */
  .sum-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .sum-icon {
    margin-block-start: -4px;
  }

  .sum-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .sum-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
  }

  .sum-links {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .sum-links a {
    color: var(--ink);
  }

  .sum-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .sum-act {
    align-self: center;
  }

  @media (width < 520px) {
    .sum-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .sum-act {
      grid-column: 2;
      margin-block-start: var(--sp-2);
    }
  }

  .foot {
    margin-block-start: var(--sp-2);
  }
</style>
