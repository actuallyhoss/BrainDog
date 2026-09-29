<!--
  `inline` — a run of pills. Kind: `chips`.

  A chips row needs a number AND a word, or it is dropped: an icon alone is a rebus, and a colour
  alone is unreadable to a tenth of readers. The columns do not move and an empty field is left
  empty, because shifting left is how a tone lands in the value slot (05 §7.4).

  The glyph is a `data-glyph` NAME. The renderer ships no glyph art: where the host answers
  `opts.icon` for a name the set holds, its path is drawn inside the slot, 16px in `currentColor` by
  the host's stylesheet, as `inlinePrimitive` in src/html.ts draws it; otherwise the slot stays empty
  and the stylesheet draws what it always drew there. An unknown glyph never shifts the columns.
-->
<script lang="ts">
  import { TONES, valueWord, type Block, type RenderOptions } from '../../src/index.ts';
  import { glyphPath } from '../../src/inline.ts';

  // `opts` is read for one thing, the glyph's drawing: a chip is a glyph, a figure and a word, and
  // none of the three may contain an inline run.
  let { block, opts = {} }: { block: Block; opts?: RenderOptions | undefined } = $props();

  const rows = $derived(block.rows.filter((r) => (r.cells[1] ?? '') !== '' && (r.cells[2] ?? '') !== ''));
</script>

<div class="inline">
  {#each rows as row}
    {@const d = glyphPath(row.cells[0] ?? '', opts)}
    <span class="pill" data-intent={row.tone}>
      <span class="pill-glyph" data-glyph={row.cells[0] ?? ''} aria-hidden="true"
        >{#if d}<svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"><path {d} /></svg
          >{/if}</span
      >
      <span class="pill-figure num">{row.cells[1]}</span>
      <span class="pill-word">{valueWord(row.cells[2] ?? '')}</span>
      {#if row.tone}
        <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
    </span>
  {/each}
</div>
