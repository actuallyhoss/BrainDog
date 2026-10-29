<!--
  A PART'S CHIP: the glyph of a category or an account in its colour on its tint, the circle a ledger line wears, for
  a bar's row on Money (`opts.partLook`). A glyph only the full set holds is asked again once the set lands, as a
  ledger's chip waits on it; a host with no drawing keeps the first letter. Decoration only: the row says the name.
-->
<script lang="ts">
  import { glyphPath, glyphWaits } from '../../src/inline.ts';
  import type { RenderOptions } from '../../src/index.ts';

  let { glyph, slot, letter = '', opts = {} }: { glyph: string; slot: string | null; letter?: string; opts?: RenderOptions } = $props();

  let landed = $state(0);
  $effect(() => {
    if (glyphWaits(glyph, opts)) void opts.iconSet?.().then(() => landed++, () => {});
  });
  const d = $derived((void landed, glyphPath(glyph, opts)));
</script>

<span class="item-chip part-chip" data-slot={slot ?? undefined} aria-hidden="true"
  >{#if d}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
      ><path {d}></path></svg
    >{:else}{letter}{/if}</span
>
