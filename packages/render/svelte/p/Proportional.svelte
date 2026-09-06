<!--
  `proportional` — rows whose number drives a drawn magnitude. Kinds: `bar`, `gauge`.

  `bar` scales to its largest NON-HOLE row; `gauge` to value / target, clamped at 1. A row whose
  value is not a number keeps its words and loses its bar, because a bar at zero claims the value IS
  zero — and a NEGATIVE value is the same case, because the scale has one side and the only bar it
  could draw for a credit is a bar of length zero. A hole sits last, in `warn`, outside the scale, and is the only row that
  can be a button — and it is one only where the host passes `hole`, because a button with no
  handler is a tab stop that lies. The
  85%-uncategorised row would otherwise take the top of the chart and make every real category a
  one-pixel stub: the chart unreadable because of the thing it reports (05 §7.5).
-->
<script lang="ts">
  import { inline, magnitudeOf, TONES, MISSING, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  /* ONE parser, shared with `toHTML`. Two copies of it meant two answers for the same cell, and
     both of them lost the minus sign a formatted amount is written with. */
  const numeric = (r: Row) => magnitudeOf(String(r.cells[1] ?? ''));
  const fixed = (v: number) => Math.max(0, Math.min(1, v)).toFixed(2);

  /** Ask the host to close the hole. Only ever called from the branch that proved it can. */
  const fill = () => {
    if (typeof opts.hole === 'function') opts.hole(null);
  };

  const scale = $derived(Math.max(0, ...block.rows.filter((r) => !r.hole).map(numeric).filter(Number.isFinite)));
  const gauge = $derived.by(() => {
    const r = block.rows[0];
    if (!r) return 0;
    const v = numeric(r);
    const t = magnitudeOf(String(r.cells[2] ?? ''));
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
    <!-- One body, two containers. Written once so the pressable and the plain row cannot drift. -->
    {#snippet cells(row: Row, v: number, drawable: boolean)}
      <span class="prop-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
      {#if drawable}<span class="prop-track" style="--magnitude:{fixed(v / scale)}"></span>{/if}
      <span class="prop-value num">{row.cells[1] ?? MISSING}</span>
      <span class="prop-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
      {#if row.tone}
        <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
    {/snippet}
    {#each block.rows as row}
      {@const v = numeric(row)}
      {@const drawable = Number.isFinite(v) && v >= 0 && !row.hole && scale > 0}
      <!-- A HOLE ROW IS A CONTROL ONLY WHERE THE HOST CAN ACT ON IT. It was a `<button>` with no
           handler on either side of the parity boundary: a real tab stop, styled as a control, on
           the one row of the chart whose whole purpose is to be the way to fix the chart. Two
           branches rather than a `<svelte:element>` with a conditional handler, because a button is
           a button and a row of a chart is not — and the compiler is right to say so. -->
      <!-- `opts.hole` TRUTHY, not `typeof … === 'function'`. The HTML renderer reads presence, and
           the type admits `true` — which the render tests themselves pass — so with `hole: true` one
           side emitted a `<button>` and the other a `<div>`, and the parity gate is the whole reason
           these two files exist as a pair. `fill()` guards the call. -->
      {#if row.hole && opts.hole}
        <button type="button" class="prop-row" data-hole data-intent={row.tone} onclick={() => fill()}>
          {@render cells(row, v, drawable)}
        </button>
      {:else}
        <div class="prop-row" data-hole={row.hole ? '' : undefined} data-intent={row.tone}>
          {@render cells(row, v, drawable)}
        </div>
      {/if}
    {/each}
  {/if}
</div>
