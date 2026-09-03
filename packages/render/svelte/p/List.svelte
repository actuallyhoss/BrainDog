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
        <!-- The date cell goes through the inline renderer like every other cell. It did not, and a
             timeline written with `{{ago:…}}` — which is how you write one that stays true — printed
             its own source. -->
        <span class="item-marker num"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <!-- The glyph sits with the TITLE, not at the far edge of the row. A tone belongs to the
             thing it qualifies, and five hundred pixels away it belongs to nothing — the same
             finding the stat cell's layout is built on (13 §2.3). -->
        <span class="item-title">
          <Text nodes={inline(row.cells[1] ?? '', opts)} {opts} />
          {#if row.tone}
            <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
          {/if}
        </span>
        <span class="item-detail"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
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
