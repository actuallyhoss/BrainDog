<!--
  One automation, drawn as the product's canvas draws it: a column of full-width cards from what starts
  it to what it does, each card one step, the joins between them a hairline.

  THE PRODUCT'S CANVAS IS `apps/web/src/lib/flow/FlowList.svelte` and `FlowCard.svelte`, and this is its
  picture with nothing to press: the same vertical column, the same card, the same join drawn as each
  gap's own border rather than as a connector. The editing half (the handle, the menu, the "Add a step"
  pill on every join) is left out, because a drawing of a control that does nothing is a broken one.

  THE STEPS ARE A `steps` FENCE, one row a card: what the step is (`Starts when`, `Only if`, `Then`), the
  sentence, and the part it plays (`trigger`, `condition`, `step` or `action`), which only sets the
  card's mark. So the page's Source shows the automation as text a reader can follow.
-->
<script lang="ts">
  import type { Block } from 'braindog-render';

  let { block }: { block: Block } = $props();
</script>

<figure class="flow-figure">
  {#if block.heading}<figcaption class="flow-name">{block.heading}</figcaption>{/if}
  <ol class="flow">
    {#each block.rows as row, i (i)}
      <li class="step" data-part={(row.cells[2] ?? '').trim() || undefined}>
        <span class="part">{row.cells[0] ?? ''}</span>
        <span class="said">{row.cells[1] ?? ''}</span>
      </li>
    {/each}
  </ol>
</figure>

<style>
  .flow-figure {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    max-inline-size: 480px;
    margin-inline: auto;
  }

  .flow-name {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    text-align: center;
  }

  .flow {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: grid;
    gap: var(--sp-1);
    padding: var(--sp-3) var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--s1);
  }

  .step + .step {
    position: relative;
    margin-block-start: var(--sp-5);
  }

  /* THE JOIN IS THE GAP'S OWN BORDER, as `FlowList.svelte` draws it: a hairline down the centre of the
     space above every card but the first. */
  .step + .step::before {
    content: '';
    position: absolute;
    inset-block-start: calc(-1 * var(--sp-5) - 1px);
    inset-inline-start: 50%;
    block-size: var(--sp-5);
    border-inline-start: 1px solid var(--line);
  }

  /* What starts it sits apart, as the product's trigger card does: the one card that is not a step. */
  .step[data-part='trigger'] {
    background: var(--s2);
  }

  .part {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  .said {
    color: var(--ink);
    font-size: var(--t-sm);
  }
</style>
