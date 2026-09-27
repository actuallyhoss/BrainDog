<!--
  `section` — a heading on a page, with a count aside and, when folded, the control that folds what
  follows. Drawn to the same tree as `html.ts`'s `section`.

  The folding itself is the host's. The blocks after a section belong to the page, not to this
  block, so `details` holds the state where the host's stylesheet can read it without script.
-->
<script lang="ts">
  import { FOLD_HIDE, FOLD_SHOW, counted, inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { glyphPath } from '../src/inline.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const glyph = $derived(block.rows[0]?.cells[0] ?? '');
  /* The slot's drawing, only where the host answers `opts.icon` for a name the set holds; otherwise the
     slot stays empty, as `section` in src/html.ts leaves it. The heading's words say what the section
     is, so the glyph beside them stays hidden from a screen reader either way. */
  const d = $derived(glyph ? glyphPath(glyph, opts) : null);
  const count = $derived(block.rows[0]?.cells[1] ?? '');
  const fold = $derived(block.rows[0]?.cells[2] === 'fold');
</script>

<div class="sec">
  {#if block.heading}
    <h2 class="sec-title">
      {#if glyph}<span class="sec-glyph" data-glyph={glyph} aria-hidden="true"
          >{#if d}<svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"><path {d} /></svg
            >{/if}</span
        >{/if}<Text
        nodes={inline(block.heading, opts)}
        {opts}
      />{#if counted(text(inline(count, opts)))}<span class="sec-count num"><Text nodes={inline(count, opts)} {opts} /></span>{/if}
    </h2>
  {/if}
  {#if fold}
    <details class="sec-fold">
      <summary class="sec-toggle"><span class="sec-show">{FOLD_SHOW}</span><span class="sec-hide">{FOLD_HIDE}</span></summary>
    </details>
  {/if}
</div>
