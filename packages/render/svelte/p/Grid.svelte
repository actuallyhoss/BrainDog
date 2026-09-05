<!--
  `grid` — n cells of label and figure, row-aligned. Kinds: `stat`, `board`.

  `--cells` is set from the DECLARATION, never inferred from the space available. A three-tile stat
  in a 962px column once drew seven auto-fit tracks, four of them holding nothing but the block's
  own border colour: a 550px slab of grey, and every selector was correct (05 §4).
-->
<script lang="ts">
  import { inline, TONES, MISSING, type Block, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const columns = $derived([...new Set(block.rows.map((r) => r.cells[0] ?? ''))]);
</script>

{#if block.kind === 'board'}
  <div class="grid" style="--cells:{columns.length}">
    {#each columns as column}
      {@const cards = block.rows.filter((r) => r.cells[0] === column)}
      <div class="board-col">
        <!-- The count is the column's whole reason to have a header. A board is read by comparing
             heights, and heights lie the moment one column scrolls and another does not — so the
             number sits beside the name rather than being inferred from the stack. -->
        <h4 class="board-head">{column}<span class="board-count num">{cards.length}</span></h4>
        {#each cards as row}
          <div class="card">
            <span class="card-title"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
            <span class="card-detail"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{:else}
  <!--
    A FIGURE IS A DOOR WHEN THE HOST KNOWS WHERE ITS ROWS ARE. "Overdue · GBP 2,340.00" is a number
    somebody immediately wants the four rows behind, and the derivation that guarantees the tile and
    the list cannot disagree is worth nothing behind something unclickable. Where there is no
    address it stays a `div`: a link to nowhere is worse than no link.
  -->
  <div class="grid" style="--cells:{block.rows.length}">
    {#each block.rows as row, i}
      {@const href = opts.cellHref?.(i) ?? null}
      <svelte:element
        this={href ? 'a' : 'div'}
        class="cell"
        class:cell-open={href}
        {href}
        data-intent={row.tone}
      >
        <span class="cell-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="cell-figure num">
          {#if row.cells[1]}<Text nodes={inline(row.cells[1], opts)} {opts} />{:else}{MISSING}{/if}
        </span>
        <span class="cell-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
        {#if row.tone}
          <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
        {/if}
      </svelte:element>
    {/each}
  </div>
{/if}
