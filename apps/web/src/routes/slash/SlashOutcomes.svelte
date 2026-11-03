<!--
  What came of Slash's suggestions (ENG-B01 and ENG-A16 seen: answers that teach, health shown).

  ONE TILE, A LIST INSIDE IT: a line a kind of change, then the duplicates merged, then whether Slash wrote anything
  outside what it may. The lines are `slash-outcomes.ts`'s, worked out from the record's `engineReadings` before this
  file is fetched, so the page `import()`s it only when there is something to say and a record with nothing loads none
  of it. No chart: each line is a few whole counts, and a bar of them would say less than the sentence does.

  A FAULT IS A WORD AND A TONE, never the tone alone: the line opens with its word in the deeper red, and the sentence
  stays in the ink so it reads in either theme.
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import { words, type OutcomeLine } from '$lib/record/slash-outcomes.ts';

  let { lines }: { lines: OutcomeLine[] } = $props();
</script>

{#if lines.length > 0}
  <Tile icon="history" title={words.title} meta={words.meta} data-part="slash-outcomes">
    <ul class="outcomes">
      {#each lines as line (line.key)}
        <li class="outcome" data-bad={line.bad ? '' : undefined}>
          {#if line.bad}<span class="outcome-bad">{line.bad}:</span>{/if}
          <span>{line.text}</span>
        </li>
      {/each}
    </ul>
  </Tile>
{/if}

<style>
  /* THE LINES, ONE A KIND, at the body size in the ink and kept to the measure, 8 apart: sentences, not a table. */
  .outcomes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .outcome {
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    font-variant-numeric: tabular-nums;
  }

  /* THE FAULT'S WORD, in the deeper red and the medium weight, before its sentence. */
  .outcome-bad {
    margin-inline-end: var(--sp-1);
    color: var(--red);
    font-weight: var(--fw-medium);
  }
</style>
