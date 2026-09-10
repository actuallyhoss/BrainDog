<!--
  A project's mark: one shape in its frozen hue, as the record app draws it.

  `oklch(var(--mark-l) var(--mark-c) <hue>)` is the app's own formula (`IdentityMark.svelte`): the
  lightness and chroma are the theme's two mark constants, so every hue clears 3:1 on every surface
  in both schemes, and only the hue is the project's. A SHAPE IN AN SVG and not the glyph character
  the app sets, because a nine-pixel character is text to a contrast checker and a mark is not text.
-->
<script lang="ts">
  let { mark, hue }: { mark: 'diamond' | 'circle' | 'square'; hue: number } = $props();

  const SHAPES = {
    diamond: 'M6 .6 11.4 6 6 11.4.6 6z',
    circle: 'M6 1a5 5 0 1 1 0 10A5 5 0 0 1 6 1z',
    square: 'M1.4 1.4h9.2v9.2H1.4z',
  } as const;
</script>

<svg class="pm" viewBox="0 0 12 12" width="10" height="10" style="--h: {hue}" aria-hidden="true">
  <path d={SHAPES[mark]} />
</svg>

<style>
  .pm {
    display: block;
    flex: none;
    fill: oklch(var(--mark-l) var(--mark-c) var(--h));
  }
</style>
