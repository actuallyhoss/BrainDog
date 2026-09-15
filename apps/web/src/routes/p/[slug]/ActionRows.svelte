<!--
  An `actions` block drawn from the record: one row per scheduled action, in the words "Runs on" uses.

  READ ONLY. Resuming a paused action belongs to "Runs on", on the project page, so this list offers
  nothing it cannot do. Unboxed rows with a hairline between them, and no colour carrying the state.
-->
<script lang="ts">
  import { TONES } from 'braindog-render';
  import { stateOf, whatOf, words, type ActionRow } from '$lib/record/actions.ts';

  let { rows, now }: { rows: readonly ActionRow[]; now: number } = $props();
</script>

<ul class="action-rows">
  {#each rows as row (row.ingest)}
    {@const said = stateOf(row, now)}
    <li class="action-row">
      <div class="action-head">
        <span class="action-name">{row.ingest}</span>
        {#if row.project === null || row.project === 'global'}<span class="action-scope">{words.everywhere}</span>{/if}
        <span class="action-runs num">{words.runs(row.month.runs)}</span>
      </div>
      <p class="action-what">{whatOf(row)}</p>
      <p class="action-said">
        {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
        {said.line}
      </p>
    </li>
  {/each}
</ul>

<style>
  .action-rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding-block: var(--sp-3);
  }

  .action-row + .action-row {
    border-block-start: 1px solid var(--line);
  }

  .action-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2) var(--sp-3);
  }

  .action-name {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .action-scope,
  .action-runs {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .action-runs {
    margin-inline-start: auto;
  }

  .action-what,
  .action-said {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .action-what {
    color: var(--dim);
  }

  .action-said {
    color: var(--ink2);
  }

  .glyph {
    margin-inline-end: var(--sp-1);
  }
</style>
