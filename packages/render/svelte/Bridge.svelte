<!--
  `bridge`: bars floating from the first row to the last, the rows as text under them, and a warn
  line when the rows do not add up. `src/bridge.ts` decides the bars and the check; `bridge` in
  `src/html.ts` is this file's twin.

  The column chart is the wide form. A narrow container hides it and shows each row's own inline
  bar, so both are in the markup, the inline ones hidden from a screen reader because the row
  already says its figure.
-->
<script lang="ts">
  import { inline, text, TONES, MISSING, type Block, type RenderOptions } from '../src/index.ts';
  import { BRIDGE_AMOUNT, BRIDGE_STEP, bridgePlan, bridgeSentence, signedOf } from '../src/bridge.ts';
  import { SERIES_NUMBERS } from '../src/series.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const plan = $derived(bridgePlan(block.rows.map((r) => signedOf(text(inline(r.cells[1] ?? '', opts))))));
  const name = $derived(
    bridgeSentence(block.rows.map((r) => ({ label: text(inline(r.cells[0] ?? '', opts)), value: text(inline(r.cells[1] ?? '', opts)) }))),
  );
</script>

<div class="prop bridge" style="--cells:{block.rows.length}">
  {#if plan.bars}
    <svg class="bridge-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}>
      {#if plan.zero !== null}<path class="bridge-zero" d="M0 {plan.zero}H1000" vector-effect="non-scaling-stroke"></path>{/if}
      {#each plan.bars as bar}
        <rect class="bridge-bar" data-move={bar.move} x={bar.x} y={bar.y} width={bar.width} height={bar.height}></rect>
      {/each}
    </svg>
  {/if}
  <ol class="bridge-rows">
    {#each block.rows as row, i}
      {@const bar = plan.bars?.[i]}
      <li class="bridge-row" data-move={bar?.move}>
        <span class="bridge-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        {#if bar}
          <svg class="bridge-inline" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <rect class="bridge-bar" data-move={bar.move} x={bar.from} y="0" width={bar.span} height="100"></rect>
          </svg>
        {/if}
        <span class="bridge-value num"><Text nodes={inline(row.cells[1] || MISSING, opts)} {opts} /></span>
        <span class="bridge-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
      </li>
    {/each}
  </ol>
  {#if plan.warn}
    <p class="bridge-warn" data-intent="warn"><span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>{plan.warn}</p>
  {/if}
  {#if block.rows.length}
    <details class="bridge-numbers">
      <summary class="bridge-toggle">{SERIES_NUMBERS}</summary>
      <table class="bridge-table">
        <thead>
          <tr><th scope="col">{BRIDGE_STEP}</th><th scope="col">{BRIDGE_AMOUNT}</th></tr>
        </thead>
        <tbody>
          {#each block.rows as row}
            <tr><th scope="row">{text(inline(row.cells[0] ?? '', opts))}</th><td class="num">{text(inline(row.cells[1] ?? '', opts)) || MISSING}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</div>
