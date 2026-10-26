<!--
  A run of numbers as a small line, named by the numbers it was drawn from, or nothing when the run
  has fewer than two. `stat`'s trend cell and `sparkline` draw it; `trendSvg` in `src/html.ts` is its
  twin, and the parity tests hold the two equal. A run ahead (`@day` first) is the walk from today:
  today marked at its start, its lowest point marked, and its two ends dated under it.
-->
<script lang="ts">
  import { inline, text, trendAhead, trendOf, TREND, TREND_TODAY, type RenderOptions } from '../src/index.ts';

  let { cls, label, value, opts = {} }: { cls: string; label: string; value: string; opts?: RenderOptions } = $props();

  const ahead = $derived(trendAhead(text(inline(value, opts))));
  const run = $derived(ahead ? trendOf(ahead.run) : null);
  const named = $derived(ahead && run ? `${text(inline(label, opts)) || TREND}, ${TREND_TODAY.toLowerCase()} to ${ahead.to}: ${run.said.join(', ')}` : '');
  const t = $derived(ahead ? null : trendOf(text(inline(value, opts))));
  const name = $derived(t ? `${text(inline(label, opts)) || TREND}: ${t.said.join(', ')}` : '');
</script>

{#if ahead && run}<span class="{cls}-ahead"
    ><svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={named}
      ><path class="trend-line" d={run.d} vector-effect="non-scaling-stroke"></path><path
        class="trend-today"
        d={ahead.today}
        vector-effect="non-scaling-stroke"
      ></path><path class="trend-low" d={ahead.low} vector-effect="non-scaling-stroke"></path></svg
    ><span class="trend-days" aria-hidden="true"><span>{TREND_TODAY}</span><span>{ahead.to}</span></span></span
  >{:else if t && cls === 'cell-trend' && t.bars}<svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}
    ><path class="trend-bar" d={t.bars} vector-effect="non-scaling-stroke"></path></svg
  >{:else if t}<svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}
    ><path class="trend-line" d={t.d} vector-effect="non-scaling-stroke"></path><path
      class="trend-end"
      d={t.end}
      vector-effect="non-scaling-stroke"
    ></path></svg
  >{/if}
