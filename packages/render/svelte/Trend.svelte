<!--
  A run of numbers as a small line, named by the numbers it was drawn from, or nothing when the run
  has fewer than two. `stat`'s trend cell and `sparkline` draw it; `trendSvg` in `src/html.ts` is its
  twin, and the parity tests hold the two equal. A run ahead (`@day` first) is the walk from today:
  today marked at its start, its lowest point marked, and its two ends dated under it.
-->
<script lang="ts">
  import { inline, text, trendAhead, trendOf, trendTrimmed, TREND, TREND_TODAY, type RenderOptions } from '../src/index.ts';

  let { cls, label, value, opts = {}, dated = false }: { cls: string; label: string; value: string; opts?: RenderOptions; dated?: boolean } = $props();

  const ahead = $derived(trendAhead(text(inline(value, opts))));
  const run = $derived(ahead ? trendOf(ahead.run) : null);
  const named = $derived(ahead && run ? `${text(inline(label, opts)) || TREND}, ${TREND_TODAY.toLowerCase()} to ${ahead.to}: ${run.said.join(', ')}` : '');
  /* A RUN BEHIND THAT IS DATED IS DRAWN FROM ITS FIRST READING TO ITS LAST (`trendTrimmed`), so its line spans the frame. */
  const span = $derived(ahead || !dated ? null : trendTrimmed(text(inline(value, opts))));
  const t = $derived(ahead ? null : trendOf(span ? span.value : text(inline(value, opts))));
  const name = $derived(t ? `${text(inline(label, opts)) || TREND}: ${t.said.join(', ')}` : '');
  /* A RUN BEHIND, ONE READING A DAY TO TODAY, SAYS ITS TWO ENDS UNDER IT where the host asks (`dated`): the day its
     first reading was taken and today, as the walk ahead says its own. */
  const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  /* THE DAYS OF ITS FIRST AND LAST READINGS, NOT OF THE RUN'S ENDS (live check of 30 October, 16): a run whose first
     weeks and last nights hold nothing drew its line from a third of the way in to well short of "Today", under "7 Aug"
     and "Today". The line is the run's, so the days under it are the ones its readings were taken. */
  const ends = $derived.by((): { from: string; to: string } | null => {
    if (!dated || !t || t.said.length < 2) return null;
    const now = typeof opts.now === 'number' ? opts.now : Date.now();
    const n = span?.length ?? t.said.length;
    const lead = span?.lead ?? 0;
    const tail = span?.tail ?? 0;
    const dayOf = (back: number): string => DAY.format(now - back * 86_400_000);
    return { from: dayOf(n - 1 - lead), to: tail === 0 ? TREND_TODAY : dayOf(tail) };
  });
  const from = $derived(ends?.from ?? null);
</script>

{#if ahead && run}<span class="{cls}-ahead"
    ><svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={named}
      ><path class="trend-area" d={run.area}></path>{#if run.zero}<path class="trend-zero" d={run.zero} vector-effect="non-scaling-stroke"></path>{/if}<path class="trend-line" d={run.d} vector-effect="non-scaling-stroke"></path><path
        class="trend-today"
        d={ahead.today}
        vector-effect="non-scaling-stroke"
      ></path><path class="trend-low" d={ahead.low} vector-effect="non-scaling-stroke" data-below={run.below ? '' : undefined}></path></svg
    ><span class="trend-days" aria-hidden="true"><span>{TREND_TODAY}</span><span>{ahead.to}</span></span></span
  >{:else if t && cls === 'cell-trend' && t.bars}<svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}
    ><path class="trend-bar" d={t.bars} vector-effect="non-scaling-stroke"></path></svg
  >{:else if t}<svg class={cls} viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}
    ><path class="trend-area" d={t.area}></path><path class="trend-line" d={t.d} vector-effect="non-scaling-stroke"></path><path
      class="trend-end"
      d={t.end}
      vector-effect="non-scaling-stroke"
    ></path></svg
  >{#if from}<span class="trend-days {cls}-days" aria-hidden="true"><span>{from}</span><span>{ends?.to ?? TREND_TODAY}</span></span>{/if}{/if}
