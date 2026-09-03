<!--
  One drawn block. Dispatches on `KINDS[kind].primitive` to one of the eight primitive components —
  never on the kind, which is why a kind a pack invented after this bundle shipped renders anyway.

  The `<figure>` skeleton, its classes and its data attributes are the same as `toHTML`'s, so the
  two accessibility trees are equal BY CONSTRUCTION rather than by a promise the parity gate has to
  police afterwards (50 §2.7).
-->
<script lang="ts">
  import { KINDS, TONES, inline, type Block, type RenderOptions } from '../src/index.ts';
  import Text from './Text.svelte';
  import Panel from './p/Panel.svelte';
  import Grid from './p/Grid.svelte';
  import Rows from './p/Rows.svelte';
  import Proportional from './p/Proportional.svelte';
  import InlineRun from './p/Inline.svelte';
  import List from './p/List.svelte';
  import Table from './p/Table.svelte';
  import Media from './p/Media.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const PRIMITIVE = { panel: Panel, grid: Grid, rows: Rows, proportional: Proportional, inline: InlineRun, list: List, media: Media };

  const spec = $derived(KINDS[block.kind]);
  const Draw = $derived(PRIMITIVE[spec.primitive as keyof typeof PRIMITIVE]);

  /** `comparison` builds its columns from its first row, which fixes the column count. */
  const comparison = $derived.by(() => {
    const [head, ...body] = block.rows;
    if (!head) return null;
    return {
      columns: head.cells.map((label, i) => ({ field: String(i), label, width: 'minmax(0,1fr)' })),
      rows: body.map((r, i) => ({ key: String(i), cells: head.cells.map((_, j) => r.cells[j] ?? null) })),
    };
  });
</script>

<figure
  class="block block-{spec.primitive}"
  data-kind={block.kind}
  data-primitive={spec.primitive}
  data-intent={block.tone}
>
  {#if block.heading && block.kind !== 'code'}
    <figcaption class="block-head" data-intent={block.tone}>
      {#if block.tone}
        <span class="glyph" role="img" aria-label={TONES[block.tone].label}>{TONES[block.tone].glyph}</span>
      {/if}
      <Text nodes={inline(block.heading, opts)} {opts} />
    </figcaption>
  {/if}

  {#if spec.primitive === 'table'}
    {#if comparison}
      <Table columns={comparison.columns} rows={comparison.rows} total={comparison.rows.length + 1} label={block.heading} />
    {/if}
  {:else if Draw}
    <Draw {block} {opts} />
  {:else}
    <!-- An unknown primitive degrades to one line: a label and what to do. Not an explanation, not
         a metric — the reader cannot act on either (22 §3). -->
    <p class="needs-client">Block “{block.kind}” needs a newer client.</p>
  {/if}
</figure>
