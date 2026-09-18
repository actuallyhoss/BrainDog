<!--
  `queue` — what is waiting on a person: one card per question, who opened it, why, and the ways to
  answer it (`src/queue.ts`). Drawn to the same tree as `html.ts`'s `queue`; `src/parity.test.ts`
  compiles this file and compares the two.

  THE OPTIONS ARE BUTTONS ONLY WHERE THE HOST CAN ACT ON THEM. With no `onact` they are the words
  themselves, which is the same branch `List` makes for a checkbox and `Text` makes for a hole: a
  control that cannot act is absent rather than greyed out (`19 §6`). A read-only queue is still worth
  drawing, because knowing what is waiting is most of what the block is for.

  NOTHING IS PRE-CHOSEN. The recommended option carries a word beside it and nothing else: no focus,
  no pressed state, no first position it did not already have. A question that arrives with its answer
  already picked is a question that gets pressed through.
-->
<script lang="ts">
  import { QUEUE_RECOMMENDED, inline, queueMore, queuePlan, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import Text from './Text.svelte';

  let {
    block,
    opts = {},
    onact,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The host's place to put the answer: the question's row, and the id of the option pressed. */
    onact?: ((row: Row, option: string) => void) | undefined;
  } = $props();

  const plan = $derived(queuePlan(block.rows));
  const nodes = (v: string | undefined) => inline(v ?? '', opts);
</script>

{#if plan.items.length === 0}
  <p class="queue-empty">{plan.empty}</p>
{:else}
  <div class="queue">
    {#each plan.items as item}
      <article class="queue-card" data-intent={item.row.tone}>
        <p class="queue-by">
          <span class="queue-who"><Text nodes={nodes(item.who)} {opts} /></span><span class="queue-when"
            ><Text nodes={nodes(item.when)} {opts} /></span
          >
        </p>
        <h3 class="queue-question"><Text nodes={nodes(item.question)} {opts} /></h3>
        {#if item.why}<p class="queue-why"><Text nodes={nodes(item.why)} {opts} /></p>{/if}
        <ul class="queue-options">
          {#each item.options as o}
            <li class="queue-option" data-recommended={o.recommended ? '' : undefined}>
              {#if onact}
                <button type="button" class="queue-act" onclick={() => onact?.(item.row, o.key)}>{o.label}</button>
              {:else}
                <span class="queue-label">{o.label}</span>
              {/if}
              {#if o.recommended}<span class="queue-rec">{QUEUE_RECOMMENDED}</span>{/if}
              {#if o.because}<span class="queue-because"><Text nodes={nodes(o.because)} {opts} /></span>{/if}
            </li>
          {/each}
        </ul>
      </article>
    {/each}
    {#if plan.more > 0}<p class="queue-more">{queueMore(plan.more)}</p>{/if}
  </div>
{/if}
