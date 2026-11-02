<!--
  `proportional` — rows whose number drives a drawn magnitude. Kinds: `bar`, `gauge`, `sparkline`,
  and `split`, `bridge` and `ring`, which have a drawer of their own (`Split.svelte`, `Bridge.svelte`,
  `p/Ring.svelte`).

  A `sparkline` row is a label, a small line in the quiet ink ending in a dot, and the figure it ends
  at. Fewer than two points draw no line, and the figure is still said.

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
  import { inline, magnitudeOfCell, text, trendOf, SPARKLINE_POINT, TREND, TONES, MISSING, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import { barFigures } from '../../src/format.ts';
  import { barsCompare, drawnRows, gaugeFigure } from '../../src/html.ts';
  import Text from '../Text.svelte';
  import Trend from '../Trend.svelte';
  import Split from '../Split.svelte';
  import Bridge from '../Bridge.svelte';
  import Series from '../Series.svelte';
  import Lines from '../Lines.svelte';
  import Progress from '../Progress.svelte';
  import Forecast from '../Forecast.svelte';
  import Ring from './Ring.svelte';
  import PartChip from './PartChip.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  /* ONE parser, shared with `toHTML`, and it reads the cell as DRAWN rather than as written. Two
     copies of it meant two answers for the same cell, and both of them lost the minus sign a
     formatted amount is written with; then both read the author's source instead of the rendered
     value, so a bar bound to `{{cash.now}}` measured nothing and disappeared. */
  const numeric = (r: Row) => magnitudeOfCell(String(r.cells[1] ?? ''), opts);
  const fixed = (v: number) => Math.max(0, Math.min(1, v)).toFixed(2);

  /** Ask the host to close the hole. Only ever called from the branch that proved it can. */
  const fill = () => {
    if (typeof opts.hole === 'function') opts.hole(null);
  };

  /** A sparkline's fold: the points of every line that drew, a column each, a row per position. */
  const runs = $derived(
    block.rows.flatMap((r) => {
      const t = trendOf(text(inline(r.cells[1] ?? '', opts)));
      return t ? [{ label: text(inline(r.cells[0] ?? '', opts)) || TREND, said: t.said }] : [];
    }),
  );
  const depth = $derived(Math.max(0, ...runs.map((r) => r.said.length)));

  const scale = $derived(Math.max(0, ...block.rows.filter((r) => !r.hole).map(numeric).filter(Number.isFinite)));
  /* THE BARS' FIGURES ARE ONE SET (`barFigures`): all whole, or all to the same places. */
  const shown = $derived(drawnRows(block, opts).map(({ row: r }) => r));
  /* ONE GLYPH ON EVERY ROW SAYS NOTHING A ROW DOES NOT (leftovers9): Reports' "Paid most" drew the same shop beside each
     of ten payees under a heading that already wears it. Rows whose chips are all one glyph in one colour draw none;
     rows that differ, as categories do, keep theirs. */
  const oneLook = $derived.by(() => {
    if (!opts.partLook || shown.length < 2) return false;
    const looks = shown.map((r) => {
      const name = text(inline(r.cells[0] ?? '', opts));
      const l = name ? opts.partLook?.(name) : null;
      return l ? `${l.glyph ?? ''}|${l.slot ?? ''}` : null;
    });
    return looks[0] !== null && looks.every((l) => l === looks[0]);
  });
  const figures = $derived(barFigures(shown.map((r) => r.cells[1] ?? MISSING), opts.home));
  /* A BAR OF ONE COMPARES NOTHING (`barsCompare`): a single account is its name and its figure, with no track. */
  const compare = $derived(barsCompare(shown, numeric));
  const gauge = $derived.by(() => {
    const r = block.rows[0];
    if (!r) return 0;
    const v = numeric(r);
    const t = magnitudeOfCell(String(r.cells[2] ?? ''), opts);
    return Number.isFinite(v) && Number.isFinite(t) && t !== 0 ? v / t : 0;
  });
</script>

{#if block.kind === 'split'}
  <Split {block} {opts} />
{:else if block.kind === 'bridge'}
  <Bridge {block} {opts} />
{:else if block.kind === 'series'}
  <Series {block} {opts} />
{:else if block.kind === 'lines'}
  <Lines {block} {opts} />
{:else if block.kind === 'progress'}
  <Progress {block} {opts} />
{:else if block.kind === 'forecast'}
  <Forecast {block} {opts} />
{:else if block.kind === 'ring'}
  <Ring {block} {opts} />
{:else}
<div class="prop">
  {#if block.kind === 'sparkline'}
    {#each block.rows as row}
      <div class="sparkline-row" data-intent={row.tone}>
        <span class="sparkline-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
        <Trend cls="sparkline-line" label={row.cells[0] ?? ''} value={row.cells[1] ?? ''} {opts} />
        <span class="sparkline-figure num"><Text nodes={inline(row.cells[2] || MISSING, opts)} {opts} /></span>
        {#if row.tone}
          <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
        {/if}
      </div>
    {/each}
    {#if runs.length}
      <div class="sparkline-numbers">
        <table class="sparkline-table">
          <thead>
            <tr><th scope="col">{SPARKLINE_POINT}</th>{#each runs as run}<th scope="col">{run.label}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each { length: depth }, i}
              <tr><th scope="row">{i + 1}</th>{#each runs as run}<td class="num">{run.said[i] ?? MISSING}</td>{/each}</tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if block.kind === 'gauge'}
    {@const row = block.rows[0] ?? { cells: [] }}
    <div class="prop-row" data-intent={row.tone}>
      <span class="prop-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
      <span class="prop-track" style="--magnitude:{fixed(gauge)}"></span>
      <!-- THE VALUE AND THE TARGET GO THROUGH THE INLINE RENDERER, like the label beside them and
           like every other cell in the dialect. They did not, so a gauge written the way a live
           page writes one, `{{cash.now}} | {{cash.target}}`, printed the author's braces and drew
           a bar of length zero. It is the same finding as `timeline`'s date cell one primitive
           over, on the two cells in this block that ARE the numbers. -->
      <span class="prop-value num"><Text nodes={inline(gaugeFigure(row.cells[1], opts) ?? MISSING, opts)} {opts} /></span>
      <span class="prop-note num">of <Text nodes={inline(gaugeFigure(row.cells[2], opts) ?? MISSING, opts)} {opts} /></span>
      {#if row.tone}
        <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
    </div>
  {:else}
    <!-- One body, two containers. Written once so the pressable and the plain row cannot drift. -->
    {#snippet cells(row: Row, v: number, drawable: boolean, figure: string)}
      {@const name = opts.partLook && !oneLook ? text(inline(row.cells[0] ?? '', opts)) : ''}
      {@const look = name ? opts.partLook?.(name) : null}
      {#if look}<PartChip glyph={look.glyph} slot={look.slot} letter={name.slice(0, 1).toLocaleUpperCase('en')} {opts} />{/if}
      <span class="prop-label"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
      {#if drawable}<span class="prop-track" style="--magnitude:{fixed(v / scale)}"></span>{/if}
      <span class="prop-value num"><Text nodes={inline(figure, opts)} {opts} /></span>
      <!-- AN ACCOUNT'S BALANCE IN ANOTHER CURRENCY SAYS WHAT IT IS AT HOME under it, where the row wears a chip (Money). -->
      {#if look && opts.approx}{@const home = opts.approx(text(inline(figure, opts)).trim())}{#if home}<span class="prop-approx num">{home}</span>{/if}{/if}
      <span class="prop-note"><Text nodes={inline(row.cells[2] ?? '', opts)} {opts} /></span>
      {#if row.tone}
        <span class="glyph" role="img" aria-label={TONES[row.tone].label}>{TONES[row.tone].glyph}</span>
      {/if}
    {/snippet}
    {#each shown as row, i}
      {@const v = numeric(row)}
      {@const drawable = compare && Number.isFinite(v) && v >= 0 && !row.hole && scale > 0}
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
          {@render cells(row, v, drawable, figures[i] ?? MISSING)}
        </button>
      {:else}
        <div class="prop-row" data-hole={row.hole ? '' : undefined} data-intent={row.tone}>
          {@render cells(row, v, drawable, figures[i] ?? MISSING)}
        </div>
      {/if}
    {/each}
  {/if}
</div>
{/if}
