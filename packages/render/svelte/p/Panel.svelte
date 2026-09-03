<!--
  `panel` — a bounded region with a tone, an optional glyph, and a nested document. Kinds: `note`,
  `quote`.

  `note` is the ONLY drawn kind in the `measure` class, because it is the only one that may contain
  a paragraph. That rule was learned expensively: a callout carrying a comparison was capped near a
  reading measure on the theory that a callout is a sentence, which turned a wide block into a
  narrow column of thirty short lines. The cap came back off the next day (05 §4).
-->
<script lang="ts">
  import { inline, type Block, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  /** A blank line is where one paragraph ends. */
  const paragraphs = $derived.by(() => {
    const out: string[][] = [[]];
    for (const row of block.rows) {
      const line = row.cells[0] ?? '';
      if (line.trim() === '') out.push([]);
      else out[out.length - 1]!.push(line);
    }
    return out.filter((p) => p.length).map((p) => p.join(' '));
  });
</script>

{#if block.kind === 'quote'}
  {@const row = block.rows[0] ?? { cells: [] }}
  <blockquote class="panel">
    <span class="quote-text"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
    {#if row.cells[1]}<cite class="quote-by">{row.cells[1]}</cite>{/if}
  </blockquote>
{:else}
  <div class="panel measure">
    {#each paragraphs as paragraph}
      <p><Text nodes={inline(paragraph, opts)} {opts} /></p>
    {/each}
  </div>
{/if}
