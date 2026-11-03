<!--
  The bar a page's chosen questions are answered from: how many are chosen, one reason for all of them, and the one
  press that answers each with what it suggests (`picked.svelte.ts`, `batch.ts`). Needs you has this bar, and so does any page with a queue.

  GLASS CHROME FLOATING AT THE FOOT OF THE VIEW, drawn only while something is chosen, after the page so opening it
  moves nothing above it. An arrangement chosen with the rest is said to be left out, never answered in bulk.
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import type { Picked } from './picked.svelte.ts';

  let { picked }: { picked: Picked } = $props();

  const plan = $derived(picked.plan);

  async function send() {
    await picked.send();
    /* AND THE RAIL'S COUNT FOLLOWS, as it does from Decide. */
    void invalidateAll();
  }
</script>

{#if picked.chosen.size > 0}
  <div class="batch" role="region" aria-label={copy.decideSelected(picked.chosen.size)}>
    <span class="batch-n">{copy.decideSelected(picked.chosen.size)}</span>
    {#if plan.answers.length > 0}
      <input
        class="batch-why"
        type="text"
        placeholder={copy.decideBatchReason}
        aria-label={copy.decideBatchReason}
        bind:value={picked.reason}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void send();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            picked.clear();
          }
        }}
      />
      <Button weight="primary" disabled={picked.busy || picked.reason.trim() === ''} onclick={() => void send()}>
        {copy.decideAnswerSuggested(plan.answers.length)}
      </Button>
    {:else if !plan.heldBack}
      <span class="batch-note">{copy.decideNoneSuggested}</span>
    {/if}
    {#if plan.heldBack}<span class="batch-note">{copy.arrangeNotInBatch}</span>{/if}
    <Button weight="bare" onclick={() => picked.clear()}>{copy.clearSelection}</Button>
  </div>
{/if}

<style>
  /* AT THE TRAILING EDGE, as wide as it needs: floating chrome, so glass (ops look), a capsule with its controls inside
     it, the popover's lift. */
  .batch {
    position: sticky;
    inset-block-end: var(--sp-4);
    z-index: var(--z-raise);
    inline-size: fit-content;
    margin-inline: auto var(--gutter);
    max-inline-size: calc(100% - 2 * var(--gutter));
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding: 6px 6px 6px var(--sp-4);
    background: var(--glass-regular, var(--tile));
    -webkit-backdrop-filter: var(--glass-filter, none);
    backdrop-filter: var(--glass-filter, none);
    border-radius: var(--r-chrome, var(--r-tile));
    box-shadow: var(--glass-edge, 0 0 0 1px var(--rule-strong)), var(--elev-popover, none);
  }


  .batch-n {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .batch-why {
    flex: 0 1 18rem;
    inline-size: 18rem;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--soft-fill, var(--hover));
    border: 0;
    border-radius: var(--r-pill, var(--r-pop));
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
  }

  .batch-note {
    flex: 1;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  @media (width < 640px) {
    .batch {
      inline-size: auto;
      margin-inline: var(--gutter);
    }

    .batch-why {
      flex: 1 1 100%;
      inline-size: auto;
      min-block-size: var(--tap);
    }
  }

  @media (forced-colors: active) {
    .batch {
      border: 1px solid CanvasText;
    }
  }
</style>
