<!--
  What BrainDog arranged by itself today, as one tile on Today (DIRECTION d3): the heading, a few lines of what it did
  without asking, the reason under each, and an Undo on each that puts that whole batch back.

  A TILE AND NEVER A QUESTION. These already happened, with a mark; the only press here takes one back. A line that is
  put back leaves the tile, and at nought the tile is gone.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { reread } from '$lib/data/live.svelte.ts';
  import { undoDecision } from '$lib/record/undo-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { HANDLED_WORDS, handledTile, type Handled } from './handled.ts';

  let { found }: { found: Handled } = $props();

  /* THE DECISIONS PUT BACK FROM HERE, so their lines go at once and the tile does not wait for a reread. */
  let gone = $state.raw<ReadonlySet<string>>(new Set());
  let busy = $state<string | null>(null);

  const tile = $derived(handledTile({ ...found, rows: found.rows.filter((r) => !gone.has(r.decision)) }));

  async function undo(decision: string) {
    if (busy !== null) return;
    busy = decision;
    try {
      const out = await undoDecision(apiBase(), decision);
      if (out.from === 'undone') {
        gone = new Set([...gone, decision]);
        toasts.push(out.said === '' ? HANDLED_WORDS.undone : out.said, { intent: 'good' });
        void reread();
      } else toasts.push(out.fix, { intent: 'warn' });
    } finally {
      busy = null;
    }
  }
</script>

{#if tile}
  <section class="handled" aria-labelledby="handled-h" data-handled>
    <h2 class="h-head" id="handled-h">{tile.heading}</h2>
    <ul class="h-list">
      {#each tile.lines as row (row.decision)}
        <li class="h-line">
          <div class="h-text">
            <span class="h-what" dir="auto">{row.line}</span>
            {#if row.why}<span class="h-why" dir="auto">{row.why}</span>{/if}
          </div>
          <Button disabled={busy !== null} aria-busy={busy === row.decision} data-handled-undo onclick={() => void undo(row.decision)}>{HANDLED_WORDS.undo}</Button>
        </li>
      {/each}
    </ul>
    {#if tile.more}<p class="h-more">{tile.more[0]!.toUpperCase() + tile.more.slice(1)}.</p>{/if}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .handled {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile, var(--bg));
    border-radius: var(--r-tile, 16px);
  }

  .h-head {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: 1.4;
  }

  .h-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .h-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .h-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) 0;
  }

  .h-text {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .h-what {
    color: var(--ink);
    font-size: var(--t-row, 15px);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .h-why,
  .h-more {
    color: var(--dim);
    font-size: var(--t-row, 15px);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .h-more {
    margin: var(--sp-2) 0 0;
  }

  @media (forced-colors: active) {
    .handled {
      border: 1px solid CanvasText;
    }
  }
</style>
