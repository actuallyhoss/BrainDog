<!--
  `series`: bars by bucket over a zero rule, money in above and money out below, the `net` form's
  line, the bucket labels, and the numbers in a table for a screen reader. `src/series.ts` decides every bar and every
  printed figure; `series` in `src/html.ts` is this file's twin.
-->
<script lang="ts">
  import { inline, text, type Block, type RenderOptions } from '../src/index.ts';
  import { SERIES_NET, SERIES_NONE, seriesPlan } from '../src/series.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const net = $derived(block.form === 'net');
  const plan = $derived(seriesPlan(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts)))), net));
  const name = $derived(`${plan.axis ? `${plan.axis}: ` : ''}${plan.sentence}`);
</script>

<div class="prop series" style="--cells:{plan.buckets.length}">
  <ul class="series-legend">
    {#each plan.series as s}
      <li class="series-key" data-dir={s.dir} data-step={s.step}><span class="series-swatch" aria-hidden="true"></span><span class="series-name">{s.label}</span></li>
    {/each}
    {#if net}<li class="series-key" data-net=""><span class="series-swatch" aria-hidden="true"></span><span class="series-name">{SERIES_NET}</span></li>{/if}
  </ul>
  {#if plan.empty}
    <p class="series-empty">{SERIES_NONE}</p>
  {:else}
    <div class="series-plot">
      {#if plan.top}<span class="series-top num" aria-hidden="true">{plan.top}</span>{/if}
      <svg class="series-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}>
        <path class="series-zero" d="M0 {plan.zero}H1000" vector-effect="non-scaling-stroke"></path>
        {#each plan.bars as bar}
          <rect class="series-bar" data-dir={bar.dir} data-step={bar.step} data-state={bar.state || undefined} x={bar.x} y={bar.y} width={bar.width} height={bar.height} vector-effect="non-scaling-stroke"></rect>
        {/each}
        {#if plan.netLine}
          <path class="series-net" d={plan.netLine} vector-effect="non-scaling-stroke"></path>
          <path class="series-dot" d={plan.netDots} vector-effect="non-scaling-stroke"></path>
        {/if}
      </svg>
      {#if plan.bottom}<span class="series-bottom num" aria-hidden="true">{plan.bottom}</span>{/if}
    </div>
    <ol class="series-ticks" aria-hidden="true">
      {#each plan.buckets as k}
        <li class="series-tick" data-state={k.state || undefined}><span class="series-tick-long">{k.label}</span><span class="series-tick-short">{k.short}</span></li>
      {/each}
    </ol>
  {/if}
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
