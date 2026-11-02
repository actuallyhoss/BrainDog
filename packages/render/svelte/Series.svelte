<!--
  `series`: bars by bucket over the scale's three lines, money in above zero and money out below, the `net` form's
  line, the bucket names, and the numbers in a table for a screen reader. `src/series.ts` decides every bar and every
  printed figure; `series` in `src/html.ts` is this file's twin, and says why the bars are HTML and why too few buckets
  are a figure.
-->
<script lang="ts">
  import { inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { MISSING } from '../src/format.ts';
  import { SERIES_NET, SERIES_NONE, SERIES_PALER, SERIES_UNDER, seriesPlan } from '../src/series.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const net = $derived(block.form === 'net');
  const plan = $derived(seriesPlan(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts)))), net, opts.home));
  const name = $derived(`${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`);
  const keyed = $derived(plan.drawn && (plan.series.length > 1 || net));
</script>

<div class="prop series" style="--cells:{plan.buckets.length}">
  {#if keyed}
    <ul class="series-legend">
      {#each plan.series as s}
        <li class="series-key" data-dir={s.dir} data-step={s.step}><span class="series-swatch" aria-hidden="true"></span><span class="series-name">{s.label}</span></li>
      {/each}
      {#if net}<li class="series-key" data-net=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">{SERIES_NET}</span></li>{/if}
      {#if plan.buckets.some((k) => k.under)}<li class="series-key" data-under=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">{SERIES_UNDER}</span></li>{/if}
      {#if plan.buckets.some((k) => k.state !== '')}<li class="series-key" data-paler=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">{SERIES_PALER}</span></li>{/if}
    </ul>
  {/if}
  {#if plan.empty}
    <p class="series-empty">{SERIES_NONE}</p>
  {:else if !plan.drawn}
    <p class="series-totals">
      {#each plan.totals as t}<span class="series-total"><span class="series-total-value num">{t.value}</span> <span class="series-total-label">{t.label}</span></span>{/each}
    </p>
  {:else}
    <div class="series-plot" role="img" aria-label={name}>
      <ol class="series-scale" aria-hidden="true">
        {#each plan.ticks as t}
          <li class="series-line" data-zero={t.zero ? '' : undefined} style="--y:{t.y}"><span class="series-line-label num">{t.label}</span></li>
        {/each}
      </ol>
      <ol class="series-cols" aria-hidden="true">
        {#each plan.buckets as k, i}
          <li class="series-col" data-state={k.state || undefined} data-under={k.under ? '' : undefined} data-flip={i >= plan.buckets.length / 2 ? '' : undefined}>
            {#each plan.bars.filter((bar) => bar.bucket === i) as bar}
              <span class="series-bar" data-dir={bar.dir} data-step={bar.step} data-state={bar.state || undefined} data-end={bar.end ? '' : undefined} data-up={bar.up ? '' : undefined} style="--y:{bar.y};--h:{bar.height}"></span>
            {/each}
            <span class="series-tip"
              ><span class="series-tip-label">{k.label}{#if k.said}{' '}{k.said}{/if}</span>{#each plan.series as s, j}<span class="series-tip-value"
                  >{s.label} <span class="num">{k.values[j] ?? MISSING}</span></span
                >{/each}{#if net}<span class="series-tip-value">{SERIES_NET} <span class="num">{k.net}</span></span>{/if}</span
            >
          </li>
        {/each}
      </ol>
      {#if plan.netLine}
        <svg class="series-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="series-net" d={plan.netLine} vector-effect="non-scaling-stroke"></path>
          <path class="series-dot" d={plan.netDots} vector-effect="non-scaling-stroke"></path>
        </svg>
      {/if}
    </div>
    <ol class="series-ticks" aria-hidden="true">
      {#each plan.buckets as k}
        <li class="series-tick" data-state={k.state || undefined}><span class="series-tick-long">{k.label}</span><span class="series-tick-short">{k.short}</span></li>
      {/each}
    </ol>
  {/if}
  <!-- WHERE WHAT IT KNOWS STOPS, when the empty months to come were left off (`rest`). -->
  {#if plan.rest}<p class="series-rest">{plan.rest}</p>{/if}
  {#if plan.buckets.length}
    <!-- THE BARS' NUMBERS, for a screen reader: a table nobody sees, since a fold headed "The numbers" under every chart
         read as a stray caption. -->
    <div class="series-numbers">
      <table class="series-table">
        <thead>
          <tr>
            <th scope="col">{plan.axis}</th>
            {#each plan.series as s}<th scope="col">{s.label}</th>{/each}
            {#if net}<th scope="col">{SERIES_NET}</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each plan.buckets as k}
            <tr>
              <th scope="row">{k.label}{#if k.said}<span class="series-said">{k.said}</span>{/if}</th>
              {#each k.values as v}<td class="num">{v}</td>{/each}
              {#if net}<td class="num">{k.net}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
