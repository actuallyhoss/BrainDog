<!--
  `progress`: one track a row, filled toward its target, the value of the target, the share, what is left, and the
  figures as text. The `budget` form marks spending past the limit beyond a line at the limit. `src/progress.ts`
  decides every fill and every word; `progress` in `src/html.ts` is this file's twin.
-->
<script lang="ts">
  import { inline, text, TONES, MISSING, type Block, type Row, type RenderOptions } from '../src/index.ts';
  import {
    PROGRESS_NONE,
    PROGRESS_OF,
    progressPlan,
    progressSentence,
  } from '../src/progress.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const form = $derived(block.form === 'budget' ? 'budget' : 'goal');
  const said = (r: Row, i: number) => text(inline(r.cells[i] ?? '', opts));
  const plan = $derived(progressPlan(block.rows.map((r) => ({ value: said(r, 1), target: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })), form));
</script>

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
