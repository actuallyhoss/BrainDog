<!--
  The mark, from `@braindog/skin`. The artwork is a module rather than two path strings typed in
  here, so this component and the app's cannot come apart: see `packages/skin/mark.ts`.

  THREE TONES: `brand` paints it the house red, `inherit` paints it the text colour, and `line` draws it as a thin
  outline in the text colour, the hero's mark behind the headline (the site design's MARKLINE, DIRECTION §47).
-->
<script lang="ts">
  import { MARK } from '@braindog/skin/mark.ts';

  let { height = 22, title, tone = 'brand' }: { height?: number; title?: string; tone?: 'brand' | 'inherit' | 'line' } =
    $props();
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

  .mark[data-tone='line'] {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linejoin: round;
  }
</style>
