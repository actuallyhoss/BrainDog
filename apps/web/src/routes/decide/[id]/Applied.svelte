<!--
  What accepting an arrangement did (`arranged.ts`): each thing applied, in plain words, or, when the record stopped
  part way, what was done and kept, what was not done, what stopped it, and that the question is open again.

  A PARTIAL APPLY IS NOT AN ERROR CARD. Part of it landed and stays, so the two lists lead in ink and the record's
  own sentence follows them; the warning glyph says it did not all happen, and the words say which part.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import type { Partial } from './arranged.ts';

  let { lines = [], partial = null }: { lines?: readonly string[]; partial?: Partial | null } = $props();
</script>

{#if partial}
  <section class="did" aria-label={copy.arrangePartial} role="status">
    <p class="did-h"><span class="did-warn"><Icon name="alert" size="s" /></span>{partial.done.length ? copy.arrangePartial : copy.arrangeNotApplied}</p>
    <dl class="did-list">
      {#if partial.done.length}
        <dt>{copy.arrangePartialDone}</dt>
        <dd>{partial.done.join(', ')}</dd>
      {/if}
      {#if partial.left.length}
        <dt>{copy.arrangePartialLeft}</dt>
        <dd>{partial.left.join(', ')}</dd>
      {/if}
      <dt>{copy.arrangePartialWhy}</dt>
      <dd>{partial.why}</dd>
    </dl>
    {#if partial.done.length}<p class="did-note">{copy.arrangePartialOpen}</p>{/if}
  </section>
{:else if lines.length}
  <section class="did" aria-label={copy.arrangeApplied}>
    <p class="did-h"><span class="did-good"><Icon name="check" size="s" /></span>{copy.arrangeApplied}</p>
    <ul class="did-lines">
      {#each lines as line, i (i)}<li>{line}</li>{/each}
    </ul>
  </section>
{/if}

<style>
  .did {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .did-h {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .did-warn {
    display: inline-flex;
    color: var(--warn);
  }

  .did-good {
    display: inline-flex;
    color: var(--earn);
  }

  .did-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .did-list {
    display: grid;
    grid-template-columns: minmax(8ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    font-size: var(--t-ui);
  }

  .did-list dt {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .did-list dd {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .did-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  @media (width < 640px) {
    .did-list {
      grid-template-columns: minmax(0, 1fr);
    }

    .did-list dd + dt {
      margin-block-start: var(--sp-1);
    }
  }
</style>
