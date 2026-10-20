<!--
  `split`: one track cut into parts, a legend of dots, labels, figures and shares, then the hole.
  `src/split.ts` decides the cuts; `split` in `src/html.ts` is this file's twin.

  A HOLE ROW IS A CONTROL ONLY WHERE THE HOST CAN ACT ON IT, exactly as `bar` draws it in
  `Proportional.svelte`: a button when the host passes `hole`, a marked row otherwise.
-->
<script lang="ts">
  import { headlineFigure, inline, text, TONES, MISSING, type Block, type Row, type RenderOptions } from '../src/index.ts';
  import { SPLIT_AMOUNT, SPLIT_PART, SPLIT_SHARE, SPLIT_ZERO, splitListed, splitPlan, splitSentence, splitSlot } from '../src/split.ts';
  import { signedOf } from '../src/bridge.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const rows = $derived(block.rows.filter((r) => !r.hole));
  const holes = $derived(block.rows.filter((r) => r.hole));
  const values = $derived(rows.map((r) => signedOf(text(inline(r.cells[1] ?? '', opts)))));
  const plan = $derived(splitPlan(values));
  const said = (r: Row | undefined) => text(inline(r?.cells[0] ?? '', opts));
  const name = $derived(splitSentence(plan.parts.map((p) => ({ label: said(rows[p.at]), share: p.share }))));
  /* A late part is striped as well as red (DIRECTION §42), by a pattern of its own: `$props.id()` keeps two charts on
     one page from painting from one another's (`lateId` in the mirror). */
  const uid = $props.id();
  const late = $derived(plan.parts.some((p) => rows[p.at]?.tone === 'bad') ? `${uid}-late` : '');

  /** Ask the host to close the hole. Only ever called from the branch that proved it can. */
  const fill = () => {
    if (typeof opts.hole === 'function') opts.hole(null);
  };
</script>

{#snippet holeBody(row: Row)}
  <span class="split-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
  <span class="split-value num"><Text nodes={inline(row.cells[1] || MISSING, opts)} {opts} /></span>
  <span class="split-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
  {#if row.tone}
    <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
  {/if}
{/snippet}

<div class="prop split">
  {#if plan.empty}
    <p class="split-empty">{SPLIT_ZERO}</p>
  {:else}
    <svg class="split-track" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={name}>
      {#if late}
        <defs
          ><pattern class="late-hatch" id={late} patternUnits="userSpaceOnUse" width="10" height="60"
            ><rect class="late-ground" width="10" height="60" fill="currentColor" fill-opacity="0.3"></rect><path
              class="late-stripe"
              d="M0 0H5L0 30ZM10 0V30L5 60H0Z"
              fill="currentColor"
            ></path></pattern
          ></defs
        >
      {/if}
      {#each plan.parts as p}
        {@const tone = rows[p.at]?.tone}
        <rect class="split-seg" data-step={p.step} data-slot={splitSlot(rows[p.at]?.cells[3])} data-intent={tone} style={tone === 'bad' ? `fill:url(#${late}) var(--chart-late, currentColor)` : undefined} x={p.x} y="0" width={p.width} height="100"
        ></rect>
      {/each}
      {#if plan.cuts}<path class="split-cut" d={plan.cuts} vector-effect="non-scaling-stroke"></path>{/if}
    </svg>
  {/if}
  {#if rows.length}
    <ul class="split-legend">
      {#each rows as row, i}
        {@const part = plan.parts.find((p) => p.at === i)}
        <!-- A part at nought is left out of the legend (`splitListed`); the fold below still says it. -->
        {#if splitListed(plan, values[i] ?? NaN)}
        <li class="split-item" data-intent={row.tone}>
          <span class="split-dot" data-step={part?.step} data-slot={splitSlot(row.cells[3])} aria-hidden="true"></span>
          <span class="split-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
          <span class="split-value num"><Text nodes={inline(headlineFigure(row.cells[1] || MISSING, opts.home), opts)} {opts} /></span>
          {#if part}<span class="split-share num">{part.share}</span>{/if}
          <span class="split-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
          {#if row.tone}
            <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
          {/if}
        </li>
        {/if}
      {/each}
    </ul>
  {/if}
  {#each holes as row}
    {#if opts.hole}
      <button type="button" class="split-hole" data-hole data-intent={row.tone} onclick={() => fill()}>{@render holeBody(row)}</button>
    {:else}
      <div class="split-hole" data-hole data-intent={row.tone}>{@render holeBody(row)}</div>
    {/if}
  {/each}
  {#if block.rows.length}
    <!-- The figures for a screen reader. The rows above already say them, and a fold headed "The numbers" read as a stray caption. -->
    <div class="split-numbers">
      <table class="split-table">
        <thead>
          <tr><th scope="col">{SPLIT_PART}</th><th scope="col">{SPLIT_AMOUNT}</th><th scope="col">{SPLIT_SHARE}</th></tr>
        </thead>
        <tbody>
          {#each [...rows, ...holes] as row, i}
            <tr>
              <th scope="row">{said(row) || SPLIT_PART}</th>
              <td class="num">{text(inline(row.cells[1] ?? '', opts)) || MISSING}</td>
              <td class="num">{(!row.hole && plan.parts.find((p) => p.at === i)?.share) || MISSING}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
