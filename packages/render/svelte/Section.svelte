<!--
  `section` — a heading on a page, with a count aside and, when folded, the control that folds what
  follows. Drawn to the same tree as `html.ts`'s `section`.

  The folding itself is the host's. The blocks after a section belong to the page, not to this
  block, so `details` holds the state where the host's stylesheet can read it without script.
-->
<script lang="ts">
  import { FOLD_HIDE, FOLD_SHOW, counted, inline, sectionTone, text, type Block, type RenderOptions } from '../src/index.ts';
  import { glyphPath, glyphWaits } from '../src/inline.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const glyph = $derived(block.rows[0]?.cells[0] ?? '');
  /* A NAME ONLY THE SET HOLDS IS ASKED AGAIN ONCE THE SET LANDS, the way a tile heading's `IconWell` waits on it:
     `circle-check` has no drawing in the host's hand until the set's chunk arrives (`opts.iconSet`), and a slot
     that asked once would stay empty for good. A host that still has no drawing then keeps the slot empty. */
  let landed = $state(0);
  $effect(() => {
    if (glyph && glyphWaits(glyph, opts)) void opts.iconSet?.().then(() => landed++, () => {});
  });

  /* The slot's drawing, only where the host answers `opts.icon` for a name the set holds; otherwise the
     slot stays empty, as `section` in src/html.ts leaves it. The heading's words say what the section
     is, so the glyph beside them stays hidden from a screen reader either way. */
  const d = $derived.by(() => {
    void landed;
    return glyph ? glyphPath(glyph, opts) : null;
  });
  const count = $derived(block.rows[0]?.cells[1] ?? '');
  const fold = $derived(block.rows[0]?.cells[2] === 'fold');
  /* THE WELL'S TONE, the row's fourth cell and one of three words (`SECTION_TONES`): written as `data-tone` on the
     well, where the host's stylesheet reads it. This package names no colour, so a host that has no rule for the
     attribute keeps the grey well it had. */
  const tone = $derived(sectionTone(block.rows[0]?.cells[3]));
</script>

<div class="sec">
  {#if block.heading}
    <h2 class="sec-title">
      {#if glyph}<span class="sec-glyph" data-glyph={glyph} data-tone={tone} aria-hidden="true"
          >{#if d}<svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
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
