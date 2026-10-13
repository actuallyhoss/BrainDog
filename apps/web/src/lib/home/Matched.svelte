<!--
  Matched for you, as one line at the foot of the board (DIRECTION §39, as `page/Changed.svelte` is for what the rules
  changed): "3 people matched for you this week", and Review, which opens who they were under the line, inside the
  same tile.

  A MATCH THE RECORD MADE ON ITS OWN WAS ONE COUNT ON ONE PAGE. Nothing listed who was matched to whom, so a wrong one
  could not be found or read. Each line here is the record's own: who was matched, into whom, and why in one sentence.

  IT LISTS AND PUTS NOTHING BACK. The record cannot yet give two people back from a match, so no control here says it
  can. `matched.ts` already names the batch each one's way back takes, for the day the record can.

  NOTHING IS DRAWN FOR NOBODY: not a heading, not an empty state. Five are listed and the rest are counted.

  Review is a rectangle, 40 tall with the 44 hit box under a thumb (`ui/Button.svelte`).
-->
<script lang="ts">
  import { since } from 'braindog-render';

  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { matchedLine, matchedShown, type MatchedRow } from './matched.ts';

  let { rows, now = Date.now() }: { rows: readonly MatchedRow[]; now?: number } = $props();

  const words = {
    review: 'Review',
    hide: 'Hide',
    more: (n: number) => (n === 1 ? 'And one more before these.' : `And ${String(n)} more before these.`),
  } as const;

  const line = $derived(matchedLine(rows, now));
  const list = $derived(matchedShown(rows));
  let open = $state(false);
</script>

{#if line}
  <section class="matched" aria-labelledby="matched-h" data-matched>
    <div class="m-head">
      <IconWell name="history" />
      <h2 class="m-said" id="matched-h">{line}</h2>
      <Button size="sm" aria-expanded={open} aria-controls="matched-list" onclick={() => (open = !open)}>{open ? words.hide : words.review}</Button>
    </div>
    <div id="matched-list" hidden={!open}>
      {#if open}
        <ul class="m-list">
          {#each list.shown as row (row.key)}
            <li class="m-row">
              <p class="m-line" dir="auto">{row.line}</p>
              {#if row.evidence || row.when}
                <p class="m-why">
                  {#if row.evidence}<span dir="auto">{row.evidence}</span>{/if}
                  {#if row.when}<time datetime={row.when}>{since(row.when, now)}</time>{/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
        {#if list.more > 0}<p class="m-more">{words.more(list.more)}</p>{/if}
      {/if}
    </div>
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .matched {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile, var(--bg));
    border-radius: var(--r-tile, 16px);
  }

  .m-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .m-said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: 1.4;
  }

  .m-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .m-row {
    padding-block: var(--sp-3);
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .m-row + .m-row {
    border-block-start: 1px solid var(--rule);
  }

  .m-row:last-child {
    padding-block-end: 0;
  }

  .m-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .m-why {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-3);
    margin: var(--sp-1) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .m-more {
    margin: var(--sp-3) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 20px;
  }

  @media (forced-colors: active) {
    .matched {
      border: 1px solid CanvasText;
    }
  }
</style>
