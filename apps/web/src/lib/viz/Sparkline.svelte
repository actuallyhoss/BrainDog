<!--
  A sparkline: a trend's shape with no axes, for a stat tile's top right (120×32).

  A 2px line in the accent with round joins, its area at 8%, and a 3px dot on the last point, wiped in from the
  left on its first draw. `mark` names the
  point that matters: the last one (the default), or the low or the high, which then wears a dot of
  its own and, when `markLabel` is given, a direct label beside it ("low £388,000, 23 Nov"). A
  `threshold` is a dashed rule across the chart; `projectFrom` draws the line from that index on as a
  dashed projection.

  IT DRAWS AT THE WIDTH IT IS GIVEN, AND NARROWER WHEN ITS BOX IS. `width` is the most it takes; the
  viewBox is the width it measured, so the dot stays round and a label keeps its size. Give it more
  `height` (48 or so) when it carries a label.

  The reading line under it is the caller's (no chart without one).
-->
<script lang="ts">
  import './viz.css';
  import { paint, type Tone } from './shared.ts';
  import { describeSparkline, sparkline, type TrendMark } from './sparkline.ts';

  let {
    values,
    width = 120,
    height = 32,
    tone = 'ink',
    mark = 'last',
    subject,
    summary,
    format,
    threshold,
    projectFrom,
    markLabel,
  }: {
    /** The series, oldest first. A value that is not a number is left out of the line. */
    values: readonly number[];
    /** The most it is drawn at, in px; narrower when its box is. */
    width?: number | undefined;
    height?: number | undefined;
    /** `ink` (the accent) by default; `earn` for money in, `danger` for a fall that needs him, `live` for a run. A project's colour works too. */
    tone?: 'ink' | 'earn' | 'danger' | 'live' | Tone | undefined;
    mark?: TrendMark | undefined;
    /** What the line measures, which leads the sentence it reads as: "Kiln takings a day, 9 weeks". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the values will not do. */
    summary?: string | undefined;
    /** How a value is written in that sentence (money, a percentage). Grouped figures by default. */
    format?: ((n: number) => string) | undefined;
    /** A value drawn as a dashed rule: a target, a floor. */
    threshold?: number | undefined;
    /** The index from which the values are a projection, drawn dashed. */
    projectFrom?: number | undefined;
    /** A direct label for the marked point. */
    markLabel?: string | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? Math.min(measured, width) : width);
  const g = $derived(sparkline(values, { width: W, height, mark, threshold, projectFrom, markLabel }));
  const p = $derived(paint(tone, 'ink'));
  const at = $derived(mark === 'low' ? g.low : mark === 'high' ? g.high : g.last);
  const said = $derived(summary ?? describeSparkline(values, subject, mark, format));
</script>

<div class="viz viz-trend" bind:clientWidth={measured} style:max-inline-size="{width}px">
  <svg viewBox="0 0 {W} {height}" role="img" aria-label={said}>
    {#if g.threshold !== null}
      <line class="viz-rule" x1="0" x2={W} y1={g.threshold} y2={g.threshold} />
    {/if}
    <g class="viz-wipe" data-tone={p.tone} style:--c={p.colour}>
      {#if g.area}<polygon class="viz-area" points={g.area} />{/if}
      <polyline class="viz-line" points={g.line} />
      {#if g.projection}<polyline class="viz-line" data-projected points={g.projection} />{/if}
      {#if at && at !== g.last}<circle class="viz-dot" cx={at.x} cy={at.y} r="3" />{/if}
      {#if g.last}<circle class="viz-dot" cx={g.last.x} cy={g.last.y} r="3" />{/if}
    </g>
    {#if g.label && markLabel}
      <text class="viz-label" x={g.label.x} y={g.label.y} text-anchor={g.label.anchor}>{markLabel}</text>
    {/if}
  </svg>
</div>
