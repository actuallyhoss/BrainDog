<!--
  `lines`: a measure over time as a line, the period before as a quiet dashed line under it, the lead
  figure with its change, the point labels, and the numbers in a fold. `src/lines.ts` decides every path
  and every printed figure; `lines` in `src/html.ts` is this file's twin.

  A POINTER OVER THE CHART READS THE POINT UNDER IT: the day and each line's value, beside a hairline.
  It is a convenience and never the only way in, because the fold under the chart holds every number
  for a keyboard and a screen reader, which is why the readout is `aria-hidden`.

  ONE READING IS A FIGURE (`plan.single`): its value and when it was read, and no chart of one dot.

  A TREND ONLY WHEN THE READINGS HOLD ONE (`src/lines-trend.ts`): a quiet dashed line over the current line, or
  "No clear trend in 12 readings" under the plot, so noise never reads as news. Under six readings, neither.
-->
<script lang="ts">
  import { inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { LINES_AGAINST, LINES_NONE, LINES_NUMBERS, linesAge, linesKeyed, linesNearest, linesOnly, linesPlan } from '../src/lines.ts';
  import { linesTrend } from '../src/lines-trend.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(linesPlan(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts)))), opts.home));
  const name = $derived(`${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`);
  const was = $derived(plan.lines.filter((l) => l.was));
  const current = $derived(plan.lines.filter((l) => !l.was));
  const trend = $derived(linesTrend(plan));
  /* THE LEGEND NAMES WHAT IS DRAWN, and nothing for one line (`linesKeyed`). */
  const keyed = $derived(linesKeyed(plan));
  /* AN OLD READING SAYS ITS AGE beside the figure it leads with (`linesAge`). */
  const age = $derived(linesAge(plan, opts.now));

  /** Where along the chart the pointer is, from 0 to 1, or `null` when it is not over it. */
  let scrub = $state<number | null>(null);
  const index = $derived(scrub === null ? -1 : linesNearest(plan, scrub));
  const point = $derived(index < 0 ? null : plan.points[index]);

  const track = (e: PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width > 0) scrub = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width));
  };
</script>

{#if plan.single}
  <div class="prop lines" data-single="">
    <p class="lines-lead"><span class="lines-now num">{plan.single.value}</span><span class="lines-against">{linesOnly(plan.single, Boolean(block.heading))}</span></p>
  </div>
{:else}
  <div class="prop lines">
    {#if plan.now}
      <p class="lines-lead">
        <span class="lines-now num">{plan.now}</span>{#if plan.change}<span class="lines-change num" data-trend={plan.trend}>{plan.change}</span><span class="lines-against">{LINES_AGAINST} {plan.against}, <span class="num">{plan.then}</span></span>{/if}{#if age}<span class="lines-against" data-old="">{age}</span>{/if}
      </p>
    {/if}
    {#if keyed.length > 0}
      <ul class="lines-legend">
        {#each keyed as l}
          <li class="lines-key" data-was={l.was ? '' : undefined} data-step={l.step}><span class="lines-swatch" aria-hidden="true"></span><span class="lines-name">{l.label}</span></li>
        {/each}
      </ul>
    {/if}
    {#if plan.empty}
      <p class="lines-empty">{LINES_NONE}</p>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="lines-plot" onpointermove={track} onpointerdown={track} onpointerleave={() => (scrub = null)} onpointercancel={() => (scrub = null)}>
        {#if plan.top}<span class="lines-top num" aria-hidden="true">{plan.top}</span>{/if}
        {#if plan.bottom}<span class="lines-bottom num" aria-hidden="true">{plan.bottom}</span>{/if}
        <svg class="lines-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}>
          {#each was as l}
            {#if l.d}<path class="lines-line" data-was="" data-step={l.step} d={l.d} vector-effect="non-scaling-stroke"></path>{/if}
          {/each}
          {#each current as l}
            {#if l.d}<path class="lines-line" data-step={l.step} d={l.d} vector-effect="non-scaling-stroke"></path>{/if}
            {#if l.end}<path class="lines-end" data-step={l.step} d={l.end} vector-effect="non-scaling-stroke"></path>{/if}
          {/each}
          {#if trend && 'd' in trend}<path class="lines-trend" d={trend.d} vector-effect="non-scaling-stroke"></path>{/if}
        </svg>
        {#if point}
          <!-- THE READOUT TURNS AT THE MIDDLE, to whichever side has more room. At 0.6 a readout of 11rem or more beside a
               point just past the middle of a half-width slot ran off the plot's end; a narrow slot does not flip at all,
               because the host's stylesheet slides it inside the plot instead. -->
          <span class="lines-rule" style="--at:{point.at}" aria-hidden="true"></span>
          <div class="lines-readout" style="--at:{point.at}" data-flip={Number(point.at) > 0.5 ? '' : undefined} aria-hidden="true">
            <span class="lines-readout-day">{point.label}</span>
            {#each plan.lines as l, k}
              <span class="lines-readout-value" data-was={l.was ? '' : undefined} data-step={l.step}><span class="lines-swatch"></span><span class="lines-readout-name">{l.label}</span><span class="num">{point.values[k]}</span></span>
            {/each}
          </div>
        {/if}
      </div>
      <ol class="lines-ticks" aria-hidden="true">
        {#each plan.ticks as t}<li class="lines-tick" style="--at:{t.at}" data-minor={t.minor ? '' : undefined}>{t.label}</li>{/each}
      </ol>
      {#if trend && 'said' in trend}<p class="lines-trend-said">{trend.said}</p>{/if}
    {/if}
    {#if plan.points.length}
      <details class="lines-numbers">
        <summary class="lines-toggle">{LINES_NUMBERS}</summary>
        <table class="lines-table">
          <thead>
            <tr>
              <th scope="col">{plan.axis}</th>
              {#each plan.lines as l}<th scope="col">{l.label}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each plan.points as p}
              <tr>
                <th scope="row">{p.label}</th>
                {#each p.values as v}<td class="num">{v}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </details>
    {/if}
  </div>
{/if}

<style>
  /* THE TREND IS QUIET: thinner than the line it was fitted to, dashed, in that line's own colour and half its strength,
     so it reads as a reading of the line and never as a second one. GLOBAL, as `Cards.svelte` says why: a scoped rule
     marks the element, and the string drawer's tree would differ by the mark. */
  :global(.lines-trend) {
    fill: none;
    stroke: var(--chart-1);
    stroke-width: 1.5px;
    stroke-dasharray: 6 6;
    stroke-linecap: round;
    opacity: 0.55;
    pointer-events: none;
  }

  :global(.lines-trend-said) {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }
</style>
