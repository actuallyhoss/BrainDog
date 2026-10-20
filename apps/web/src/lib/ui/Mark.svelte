<!--
  The mark: a brain with a dog cut out of it.

  The ARTWORK is `@braindog/skin`'s `MARK`, not two path strings typed into this file. Three copies
  of it existed once — this component, the favicon, and the moment a marketing site appeared, a
  third — and a brand that lives in three files is a brand that is two files behind.

  Sized by HEIGHT, with the width following the artwork's own 997.34 x 775.17 ratio. Squaring the
  box letterboxes the drawing and throws away a fifth of its width, which is why it read as a red
  blob the first time this shipped.

  Painted with `--red-fill` — the one colour in the product that belongs to the product rather than to
  a meaning. Gate 3 knows it as a token, so this is the only element allowed to name it (22 §7).

  The negative space is the whole idea, and it is the motif the interface borrows: what matters is
  CUT INTO a surface rather than raised off it.
-->
<script lang="ts">
  import { MARK } from '@braindog/skin/mark.ts';

  let {
    height = 22,
    title,
    tone = 'brand',
  }: {
    height?: number;
    title?: string;
    /** `brand` paints it in the mark's own red; `inherit` takes the parent's colour, which is what
        lets the mark be reversed out of a red ground without a second copy of the artwork. */
    tone?: 'brand' | 'inherit';
  } = $props();
</script>

<svg
  class="mark"
  data-tone={tone}
  width={Math.round(height * MARK.ratio * 100) / 100}
  {height}
  viewBox={MARK.viewBox}
  role={title ? 'img' : 'presentation'}
  aria-label={title}
  aria-hidden={title ? undefined : 'true'}
>
  {#each MARK.paths as d}<path {d} />{/each}
</svg>

<style>
  .mark {
    display: block;
    fill: var(--red-fill);
    flex: none;
  }

  .mark[data-tone='inherit'] {
    fill: currentColor;
  }
</style>
