<!--
  `list` — title · detail · optional state marker. Kinds: `todo`, `steps`, `timeline`.

  `steps` is ordered, so it is an `<ol>`: numbered markers are appropriate here because the content
  actually is a sequence and the order carries information. `todo` and `timeline` are not.
-->
<script lang="ts">
  import { inline, TONES, type Block, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();
</script>

<svelte:element this={block.kind === 'steps' ? 'ol' : 'ul'} class="list" data-kind={block.kind}>
  {#each block.rows as row}
    {#if block.kind === 'todo'}
      <li class="item">
        <span class="item-marker" data-done={row.done ? 'yes' : 'no'} role="img" aria-label={row.done ? 'done' : 'not done'}
          >{row.done ? '✓' : ''}</span
        >
        <span class="item-title"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="item-detail"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
      </li>
    {:else if block.kind === 'timeline'}
      <li class="item" data-intent={row.tone}>
        <span class="item-marker num">{row.cells[0] ?? ''}</span>
        <span class="item-title"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
        <span class="item-detail"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
        {#if row.tone}
          <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
        {/if}
      </li>
    {:else}
      <li class="item">
        <span class="item-title"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <span class="item-detail"><Text nodes={inline(row.cells[1] ?? '', opts)} {opts} /></span>
        <span class="item-state"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
      </li>
    {/if}
  {/each}
</svelte:element>
