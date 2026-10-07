<!--
  A run of numbers as a small line, named by the numbers it was drawn from, or nothing when the run
  has fewer than two. `stat`'s trend cell and `sparkline` draw it; `trendSvg` in `src/html.ts` is its
  twin, and the parity tests hold the two equal.
-->
<script lang="ts">
  import { inline, text, trendOf, TREND, type RenderOptions } from '../src/index.ts';

  let { cls, label, value, opts = {} }: { cls: string; label: string; value: string; opts?: RenderOptions } = $props();

  const t = $derived(trendOf(text(inline(value, opts))));
  const name = $derived(t ? `${text(inline(label, opts)) || TREND}: ${t.said.join(', ')}` : '');
</script>

{#if t && cls === 'cell-trend' && t.bars}<svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}
    ><path class="trend-bar" d={t.bars} vector-effect="non-scaling-stroke"></path></svg
  >{:else if t}<svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}
    ><path class="trend-line" d={t.d} vector-effect="non-scaling-stroke"></path><path
      class="trend-end"
      d={t.end}
      vector-effect="non-scaling-stroke"
    ></path></svg
  >{/if}
