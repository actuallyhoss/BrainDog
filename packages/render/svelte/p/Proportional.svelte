<!--
  `proportional` — rows whose number drives a drawn magnitude. Kinds: `bar`, `gauge`.

  `bar` scales to its largest NON-HOLE row; `gauge` to value / target, clamped at 1. A row whose
  value is not a number keeps its words and loses its bar, because a bar at zero claims the value IS
  zero. A hole sits last, in `warn`, outside the scale, and is the only row that is a button — the
  85%-uncategorised row would otherwise take the top of the chart and make every real category a
  one-pixel stub: the chart unreadable because of the thing it reports (05 §7.5).
-->
<script lang="ts">
  import { inline, TONES, MISSING, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const numeric = (r: Row) => {
    const digits = String(r.cells[1] ?? '').replace(/[^\d.-]/g, '');
    return digits === '' ? NaN : Number(digits);
  };
  const fixed = (v: number) => Math.max(0, Math.min(1, v)).toFixed(2);

  const scale = $derived(Math.max(0, ...block.rows.filter((r) => !r.hole).map(numeric).filter(Number.isFinite)));
  const gauge = $derived.by(() => {
    const r = block.rows[0];
    if (!r) return 0;
    const v = numeric(r);
    const t = Number(String(r.cells[2] ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(v) && Number.isFinite(t) && t !== 0 ? v / t : 0;
  });
</script>

<div class="prop">
  {#if block.kind === 'gauge'}
    {@const row = block.rows[0] ?? { cells: [] }}
    <div class="prop-row" data-intent={row.tone}>
      <span class="prop-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
      <span class="prop-track" style="--magnitude:{fixed(gauge)}"></span>
      <span class="prop-value num">{row.cells[1] ?? MISSING}</span>
      <span class="prop-note num">of {row.cells[2] ?? MISSING}</span>
      {#if row.tone}
        <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
    </div>
  {:else}
    {#each block.rows as row}
      {@const v = numeric(row)}
      {@const drawable = Number.isFinite(v) && !row.hole && scale > 0}
      <svelte:element
        this={row.hole ? 'button' : 'div'}
        class="prop-row"
        type={row.hole ? 'button' : undefined}
        data-hole={row.hole ? '' : undefined}
        data-intent={row.tone}
      >
        <span class="prop-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        {#if drawable}<span class="prop-track" style="--magnitude:{fixed(v / scale)}"></span>{/if}
        <span class="prop-value num">{row.cells[1] ?? MISSING}</span>
        <span class="prop-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
        {#if row.tone}
          <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
        {/if}
      </svelte:element>
    {/each}
  {/if}
</div>
