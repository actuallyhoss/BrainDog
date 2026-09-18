<!--
  One drawn block. Dispatches on `KINDS[kind].primitive` to one of the eight primitive components —
  never on the kind, which is why a kind a pack invented after this bundle shipped renders anyway.

  The `<figure>` skeleton, its classes and its data attributes are the same as `toHTML`'s, so the
  two accessibility trees are equal BY CONSTRUCTION rather than by a promise the parity gate has to
  police afterwards (50 §2.7).
-->
<script lang="ts">
  import { KINDS, TONES, captioned, inline, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import Text from './Text.svelte';
  import Panel from './p/Panel.svelte';
  import Grid from './p/Grid.svelte';
  import Rows from './p/Rows.svelte';
  import Proportional from './p/Proportional.svelte';
  import InlineRun from './p/Inline.svelte';
  import List from './p/List.svelte';
  import Table from './p/Table.svelte';
  import Media from './p/Media.svelte';

  let {
    block,
    opts = {},
    onmove,
    ontick,
    onact,
  }: {
    block: Block;
    opts?: RenderOptions;
    /**
     * TWO PRIMITIVES CAN BE CHANGED AND THE OTHER SIX CANNOT, so these callbacks cross this component
     * and reach exactly the ones that take them: one for `grid`, two for `list`.
     *
     * THEY ARE NOT ON `RenderOptions`. Every member of that type is a READ: a resolver, a link
     * builder, a clock. Putting a write callback on it would give `toHTML` a key it can never
     * honour, and the two renderers are equal by construction rather than by a promise.
     *
     * A PRIMITIVE WITH NO CALLBACK DRAWS NOTHING INTERACTIVE AT ALL, which is `19 §6`'s rule
     * applied one layer down: a control that cannot act is absent rather than greyed out. So an
     * embedder who wants a read-only board or a read-only checklist gets one by passing nothing,
     * and the markup is what it has always been.
     */
    onmove?: ((row: Row, to: string) => void) | undefined;
    ontick?: ((row: Row, done: boolean) => void) | undefined;
    /** The list primitive's other write: answering one of a queue's questions. */
    onact?: ((row: Row, option: string) => void) | undefined;
  } = $props();

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
  data-form={block.form}
  data-primitive={spec.primitive}
  data-intent={block.tone}
>
  <!-- `captioned` is the same rule `toHTML` reads: a `code` heading is its language and a `section`
       heading is the section itself, so neither becomes a caption. -->
  {#if captioned(block)}
    <!-- The glyph and the words touch, as `toHTML` writes them: a line break between them was a
         leading space in the caption's text that the other renderer does not have. -->
    <figcaption class="block-head" data-intent={block.tone}
      >{#if block.tone}<span class="glyph" role="img" aria-label={TONES[block.tone].label}>{TONES[block.tone].glyph}</span
        >{/if}<Text nodes={inline(block.heading ?? '', opts)} {opts} /></figcaption
    >
  {/if}

  {#if spec.primitive === 'table'}
    {#if comparison}
      <!-- `rows.length` AND NOT `rows.length + 1`. `Table` counts its own header row into
           `aria-rowcount` now; this was the one caller of six that added the header itself, and
           the other five did not, so five surfaces announced one row too few and this one was
           right by hand. -->
      <Table columns={comparison.columns} rows={comparison.rows} total={comparison.rows.length} label={block.heading} />
    {/if}
  {:else if spec.primitive === 'grid'}
    <!-- BY NAME rather than through `Draw`, because the callback belongs to one primitive: handed
         to the union the other six are in, it is a prop none of them declares. -->
    <Grid {block} {opts} {onmove} />
  {:else if spec.primitive === 'list'}
    <List {block} {opts} {ontick} {onact} />
  {:else if Draw}
    <Draw {block} {opts} />
  {:else}
    <!-- An unknown primitive degrades to one line: a label and what to do. Not an explanation, not
         a metric — the reader cannot act on either (22 §3). -->
    <p class="needs-client">Block “{block.kind}” needs a newer client.</p>
  {/if}
</figure>
