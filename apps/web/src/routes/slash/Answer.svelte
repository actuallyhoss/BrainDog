<!--
  One answer of Slash's, on its page and in the panel: its words, its lists as lists, each piece drawn by `Said`. How the
  text is read into blocks is `answer.ts`.
-->
<script lang="ts">
  import { blocksOf } from './answer.ts';
  import Said from './Said.svelte';

  let { text, figures = {}, icons }: { text: string; figures?: Record<string, unknown>; icons: ReadonlyMap<string, string> } = $props();

  const uid = $props.id();
  const blocks = $derived(blocksOf(text));
</script>

{#snippet items(list: Extract<(typeof blocks)[number], { kind: 'list' }>)}
  {#each list.items as one, n (n)}
    <li dir="auto">
      <Said text={one.text} {figures} {icons} />
      {#each one.under as line, u (u)}<span class="under"><Said text={line} {figures} {icons} /></span>{/each}
    </li>
  {/each}
{/snippet}

<div class="answer">
  {#each blocks as block, i (i)}
    {#if block.kind === 'words'}
      <p class="text" dir="auto"><Said text={block.text} {figures} {icons} /></p>
    {:else if block.kind === 'label'}
      <p class="label" id={`${uid}-${i}`} dir="auto"><Said text={block.text} {figures} {icons} /></p>
    {:else if block.ordered}
      <ol start={block.start} aria-labelledby={blocks[i - 1]?.kind === 'label' ? `${uid}-${i - 1}` : undefined}>{@render items(block)}</ol>
    {:else}
      <ul aria-labelledby={blocks[i - 1]?.kind === 'label' ? `${uid}-${i - 1}` : undefined}>{@render items(block)}</ul>
    {/if}
  {/each}
</div>

<style>
  .answer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-row, 15px);
    line-height: calc(24px * var(--type, 1));
  }

  .text {
    margin: 0;
    white-space: pre-wrap;
  }

  .label {
    margin: 0;
    font-weight: var(--fw-semi);
  }

  /* A LIST NAMED BY THE LINE ABOVE IT STAYS WITH THAT LINE, and the next name stands clear of the list before it. */
  .label:not(:first-child) {
    margin-block-start: var(--sp-2);
  }

  .label + :is(ul, ol) {
    margin-block-start: calc(-1 * var(--sp-1));
  }

  ul,
  ol {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    padding-inline-start: 20px;
  }

  ul {
    list-style: disc;
  }

  ol {
    list-style: decimal;
  }

  li::marker {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .under {
    display: block;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }
</style>
