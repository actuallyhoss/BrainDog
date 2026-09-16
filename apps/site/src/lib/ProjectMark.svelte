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

<svg class="pm" data-size="s" viewBox="0 0 12 12" style="--h: {hue}" aria-hidden="true">
  <path d={SHAPES[mark]} />
</svg>

<style>
  /* Sized off the icon scale, `Icon.svelte`'s own `.icon[data-size]` pattern, rather than a literal
     width/height on the tag: this used to be a fixed 10px with no name behind it. `--icon-s` is
     12px, the scale's own floor, and the nearest step to what was there — a 2px difference on a
     12-unit viewBox, not a change worth a second size variant for a mark that is only ever drawn
     at one size today. */
  .pm[data-size='s'] {
    inline-size: var(--icon-s);
    block-size: var(--icon-s);
  }

  .pm {
    display: block;
    flex: none;
    fill: oklch(var(--mark-l) var(--mark-c) var(--h));
  }
</style>
