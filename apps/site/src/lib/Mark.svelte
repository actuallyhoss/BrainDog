<!--
  The mark, from `@braindog/skin`. The artwork is a module rather than two path strings typed in
  here, so this component and the app's cannot come apart — see `packages/skin/mark.ts`.
-->
<script lang="ts">
  import { MARK } from '@braindog/skin/mark.ts';

  let { height = 22, title, tone = 'brand' }: { height?: number; title?: string; tone?: 'brand' | 'inherit' } =
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
    fill: var(--brand);
    flex: none;
  }

  .mark[data-tone='inherit'] {
    fill: currentColor;
  }
</style>
