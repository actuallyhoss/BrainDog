<!--
  `progress`: one track a row, filled toward its target, the value of the target, the share, what is left, and the
  figures as text. The `budget` form marks spending past the limit beyond a line at the limit, and the `range` form
  draws each row as a band from its low to its high on one scale, what was spent marked on it, and a total line, or
  the sentence saying why not when the figures are in two units.
  `src/progress.ts` decides every fill, band and word; `progress` and `range` in `src/html.ts` are this file's twins.
-->
<script lang="ts">
  import { inline, text, TONES, MISSING, type Block, type Row, type RenderOptions } from '../src/index.ts';
  import {
    PROGRESS_NONE,
    PROGRESS_OF,
    PROGRESS_TOTAL,
    progressPlan,
    progressRangeSaid,
    progressSentence,
    progressSpentSaid,
    rangePlan,
    rangeSentence,
  } from '../src/progress.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const form = $derived(block.form === 'budget' ? 'budget' : block.form === 'range' ? 'range' : 'goal');
  const said = (r: Row, i: number) => text(inline(r.cells[i] ?? '', opts));
  const plan = $derived(
    progressPlan(
      block.rows.map((r) => ({ value: said(r, 1), target: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })),
      form === 'budget' ? 'budget' : 'goal',
    ),
  );
  const ranges = $derived(rangePlan(block.rows.map((r) => ({ spent: said(r, 1), low: said(r, 2), high: said(r, 3), ...(r.tone ? { tone: r.tone } : {}) }))));
</script>

{#if form === 'range'}
  <div class="prop progress" data-form="range">
    {#if block.rows.length}
      {#each block.rows as row, i}
        {@const p = ranges.bars[i]!}
        <div class="progress-row" data-intent={p.intent}>
          <span class="progress-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
          <span class="progress-figure num"><span class="progress-value">{p.spent}</span></span>
          <span class="progress-range num">{p.range}</span>
          {#if p.drawable}
            <span class="progress-track" role="img" aria-label={rangeSentence(said(row, 0), p.spent, p.range)} style="--from:{p.from};--to:{p.to}"
              ><span class="progress-band"></span>{#if p.at !== null}<span class="progress-at" style="--at:{p.at}"></span>{/if}</span
            >
          {/if}
          {#if p.intent}
            <span class="glyph" role="img" aria-label={TONES[p.intent].label}>{TONES[p.intent].glyph}</span>
          {/if}
        </div>
      {/each}
      {#if ranges.refused}
        <p class="progress-empty">{ranges.refused}</p>
      {:else}
        <div class="progress-row" data-total="">
          <span class="progress-label">{PROGRESS_TOTAL}</span>
          <span class="progress-figure num"><span class="progress-value">{progressSpentSaid(ranges.total.spent)}</span></span>
          <span class="progress-range num">{progressRangeSaid(ranges.total.low, ranges.total.high)}</span>
        </div>
      {/if}
    {:else}
      <p class="progress-empty">{PROGRESS_NONE}</p>
    {/if}
  </div>
{:else}
  <div class="prop progress" data-form={form === 'budget' ? 'budget' : undefined}>
    {#if block.rows.length}
      {#each block.rows as row, i}
        {@const p = plan[i]!}
        <div class="progress-row" data-intent={p.intent}>
          <span class="progress-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
          <span class="progress-figure num"
            ><span class="progress-value"><Text nodes={inline(row.cells[1] || MISSING, opts)} {opts} /></span><span class="progress-of">{PROGRESS_OF}</span><span class="progress-target"
              ><Text nodes={inline(row.cells[2] || MISSING, opts)} {opts} /></span
            ></span
          >
          <span class="progress-share num">{p.share}</span>
          {#if p.drawable}
            <span class="progress-track" role="img" aria-label={progressSentence(said(row, 0), said(row, 1), said(row, 2), p.share)} style="--fill:{p.fill}"
              ><span class="progress-fill"></span>{#if p.limit !== null}<span class="progress-over" style="--limit:{p.limit}"></span>{/if}</span
            >
          {/if}
          {#if p.left}<span class="progress-left num">{p.left}</span>{/if}
          {#if row.cells[3]}<span class="progress-note"><Text nodes={inline(row.cells[3], opts)} {opts} /></span>{/if}
          {#if p.intent}
            <span class="glyph" role="img" aria-label={TONES[p.intent].label}>{TONES[p.intent].glyph}</span>
          {/if}
        </div>
      {/each}
    {:else}
      <p class="progress-empty">{PROGRESS_NONE}</p>
    {/if}
  </div>
{/if}
