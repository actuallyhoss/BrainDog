<!--
  `inline` — a run of pills. Kind: `chips`.

  A chips row needs a number AND a word, or it is dropped: an icon alone is a rebus, and a colour
  alone is unreadable to a tenth of readers. The columns do not move and an empty field is left
  empty, because shifting left is how a tone lands in the value slot (05 §7.4).

  The glyph is a `data-glyph` NAME the host's stylesheet draws. The renderer ships no glyph art, and
  an unknown glyph draws nothing rather than shifting the columns.
-->
<script lang="ts">
  import { TONES, type Block, type RenderOptions } from '../../src/index.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();
  void opts;

  const rows = $derived(block.rows.filter((r) => (r.cells[1] ?? '') !== '' && (r.cells[2] ?? '') !== ''));
</script>

<div class="inline">
  {#each rows as row}
    <span class="pill" data-intent={row.tone}>
      <span class="pill-glyph" data-glyph={row.cells[0] ?? ''} aria-hidden="true"></span>
      <span class="pill-figure num">{row.cells[1]}</span>
      <span class="pill-word">{row.cells[2]}</span>
      {#if row.tone}
        <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
    </span>
  {/each}
</div>
