<!--
  `rows` — label · value · note, one per line. Kinds: `spec`, `params`.

  The workhorse: 194 of 7,138 rendered lines in the predecessor's census were `spec`, and no writing
  guide said so (05 §7.4).

  AND THERE IS NO BOX HERE, WHICH IS THE POINT OF SAYING SO. `checkbox` is a property of exactly one
  kind, `todo`, and `todo` is a `list`, so the tickable box lives in `List` and nowhere else. A
  `spec` row that carries a state says it in its note cell, in words. Two spellings of one control
  is how one of them rots: the second gets the fix and the first keeps drawing a promise it stopped
  being able to keep.
-->
<script lang="ts">
  import { inline, MISSING, type Block, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();
</script>

<div class="rows">
  {#each block.rows as row}
    <div class="row">
      <span class="row-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
      <span class="row-value num">
        {#if row.cells[1]}<Text nodes={inline(row.cells[1], opts)} {opts} />{:else}{MISSING}{/if}
      </span>
      <span class="row-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
    </div>
  {/each}
</div>
