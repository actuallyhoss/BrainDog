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
  import { rowsCell } from '../../src/timeline.ts';
  import { drawnRows, emptied } from '../../src/html.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  /* A ROW WITH NO VALUE IS NOT DRAWN (`drawnRows`), as `toHTML` leaves it out: "Keeping it alive: lanternfish.example" over a dash
     said a name and nothing. What is left with none says the host's `empty:` line, or nothing (`emptied`). */
  const rows = $derived(drawnRows(block, opts).map(({ row }) => row));
  const left = $derived(emptied(block, opts));
</script>

{#if typeof left === 'string'}
  <p class="block-empty">{left}</p>
{:else if left === undefined}
<div class="rows">
  {#each rows as row}
    <!-- A day this year drops its year and money moving by nothing is not said (`rowsCell`), as `html.ts` draws it: an
         empty value is `MISSING`, a value said as nothing is a known nothing and draws no mark. -->
    {@const value = row.cells[1] ? rowsCell(row.cells[1], opts.now) : undefined}
    <div class="row">
      <span class="row-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
      <span class="row-value num">
        {#if value === undefined}{MISSING}{:else if value}<Text nodes={inline(value, opts)} {opts} />{/if}
      </span>
      <span class="row-note"><Text nodes={inline(rowsCell(row.cells[2], opts.now), opts)} {opts} /></span>
    </div>
  {/each}
</div>
{/if}
