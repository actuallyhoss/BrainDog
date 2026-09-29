<!--
  A heat grid: how busy, by row and column (the design system: "intensity over time"), such as days by hour.

  Each cell is a rounded square in one of five steps, from the track for nothing to ink for the
  busiest quarter. Row names sit at the left and every few column names on top, at 12 in `dim`.

  A screen reader hears the busiest and quietest cells as the chart's sentence, and can walk every
  value in a table kept off the page.
-->
<script lang="ts">
  import './viz.css';
  import { describeHeat, HEAT_TONES, heatgrid } from './heatgrid.ts';
  import { figure } from './shared.ts';

  let {
    rows,
    cols,
    values,
    subject,
    summary,
    format = figure,
  }: {
    /** Row names, top to bottom: "Wed", "Thu". */
    rows: readonly string[];
    /** Column names, left to right: "00" to "23". */
    cols: readonly string[];
    /** `values[row][col]`; a missing value is nothing. */
    values: readonly (readonly number[])[];
    /** What is counted, which leads the sentence and names the table: "Changes by hour, last 7 days". */
    subject?: string | undefined;
    /** The whole sentence, when "busiest …, quietest …" will not do. */
    summary?: string | undefined;
    /** How a value is written in the sentence and the table. */
    format?: ((n: number) => string) | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 393);
  const g = $derived(heatgrid(rows, cols, values, W));
  const said = $derived(summary ?? describeHeat(rows, cols, values, subject, format));
</script>

<div class="viz viz-heat" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {g.height}" role="img" aria-label={said}>
    {#each g.colLabels as label, i (i)}
      <text class="viz-label" x={label.x} y="10" text-anchor="middle">{label.text}</text>
    {/each}
    {#each g.rowLabels as label, i (i)}
      <text class="viz-label" x="0" y={label.y}>{label.text}</text>
    {/each}
    {#each g.cells as cell (`${cell.r}:${cell.c}`)}
      <rect class="viz-fill" data-tone={HEAT_TONES[cell.level]} x={cell.x} y={cell.y} width={g.size} height={g.tall} rx={Math.min(3, g.size / 2)} />
    {/each}
  </svg>
  <table class="viz-hidden">
    {#if subject}<caption>{subject}</caption>{/if}
    <thead>
      <tr><td></td>{#each cols as col, c (c)}<th scope="col">{col}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each rows as row, r (r)}
        <tr>
          <th scope="row">{row}</th>
          {#each cols as _, c (c)}<td>{format(values[r]?.[c] ?? 0)}</td>{/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
