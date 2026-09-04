<!--
  The arrange bar: the controls that appear on a block while a page is being arranged.

  DRAG AND KEYBOARD ARE THE SAME OPERATION, not one plus a simulation of it. Reordering a flow is a
  `splice`; the handle computes an index and calls it, and `⌥↑` calls it with `at - 1`. WCAG 2.5.7
  asks for a single-pointer alternative to dragging, and the honest form of that is a control that
  performs the same edit rather than a second implementation that drifts from the first.

  The buttons are ALWAYS VISIBLE while arranging, never on hover. A control that appears under the
  pointer cannot be reached by a keyboard user looking for it, and cannot be reached at all by
  somebody on a touch screen — where 13 §10 says authoring is read-and-approve anyway, but the bar
  still has to not lie about what exists.
-->
<script lang="ts">
  import { copy } from '../copy.ts';
  import Icon from './Icon.svelte';
  import { spanLabel, stepsFor } from '../record/arrange.ts';

  let {
    kind,
    span,
    columns,
    at,
    count,
    onmove,
    onspan,
    onremove,
  }: {
    kind: string;
    span: number;
    /** How many columns the block declares — a table's width floor is a property of the block. */
    columns: number;
    at: number;
    count: number;
    onmove: (to: number) => void;
    onspan: (span: number) => void;
    onremove: () => void;
  } = $props();

  const steps = $derived(stepsFor(kind, columns));
</script>

<div class="bar">
  <span class="handle" aria-hidden="true"><Icon name="drag" size="s" /></span>

  <span class="kind">{kind}</span>

  <div class="widths" role="group" aria-label={copy.width}>
    {#each steps as step}
      <button
        type="button"
        class="width"
        data-on={span === step ? '' : undefined}
        aria-pressed={span === step ? 'true' : 'false'}
        onclick={() => onspan(step)}
      >
        {spanLabel(step)}
      </button>
    {/each}
    <!-- A span a pack wrote as 5 keeps its own number rather than being rounded onto a button.
         Inferred from the value, never stored — 21 §3.1. -->
    {#if !steps.includes(span)}
      <span class="width" data-on aria-current="true">{spanLabel(span)}</span>
    {/if}
  </div>

  <div class="moves">
    <button type="button" class="icon-btn" disabled={at === 0} onclick={() => onmove(at - 1)} aria-label={copy.moveUp}>
      <Icon name="arrowUp" size="s" />
    </button>
    <button
      type="button"
      class="icon-btn"
      disabled={at === count - 1}
      onclick={() => onmove(at + 1)}
      aria-label={copy.moveDown}
    >
      <Icon name="arrowDown" size="s" />
    </button>
    <button type="button" class="icon-btn" onclick={onremove} aria-label={copy.removeBlock}>
      <Icon name="close" size="s" />
    </button>
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    padding: 4px 4px 4px var(--sp-2);
    background: var(--s2);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
  }

  .handle {
    display: grid;
    place-items: center;
    color: var(--dim);
    cursor: grab;
  }

  .kind {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .widths {
    display: flex;
    gap: 2px;
    margin-inline-start: auto;
    padding: 2px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
  }

  .width {
    min-block-size: 22px;
    padding: 0 var(--sp-2);
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 500;
    cursor: pointer;
  }

  .width:hover:not([data-on]) {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink2);
  }

  .width[data-on] {
    background: var(--s3);
    border-color: var(--line);
    color: var(--ink);
    font-weight: 600;
  }

  .moves {
    display: flex;
    gap: 2px;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .icon-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ink) 8%, transparent);
    color: var(--ink);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
