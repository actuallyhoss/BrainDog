<!--
  Horizontal bars, one row an item: the label, the bar, a note at its end, and the value at the right.

  Bars are the accent's tint (`g2`) unless an item has a `tone`; give the one that matters `ink`, which draws the
  full accent, and its label turns ink with it (one series highlighted, the rest its tint). `danger`, `earn`, `warn`
  and `live` keep their meanings, and a project's colour works too. A bar grows from its start on the first draw.

  PAIRED is two periods: pass `paired`, one earlier value per item, and each row draws
  this period's bar over the earlier one's in the grey for "other". Alone, each bar sits on a track.

  THE SCALE IS SHARED WHEN YOU SAY SO: pass `max` to put several charts on one scale.

  The label column takes the longest label up to two fifths of the width. A label longer than that
  puts every label over its bar instead, with the value at the end of the label's line, so at phone
  width no bar is drawn over its words. Text keeps its size at any width.
-->
<script lang="ts">
  import './viz.css';
  import { bars, describeBars } from './bars.ts';
  import { isQuiet, paint, type Tone } from './shared.ts';

  let {
    items,
    max,
    paired,
    subject,
    summary,
    format,
  }: {
    items: readonly { label: string; value: number; tone?: Tone | undefined; note?: string | undefined }[];
    /** The value a full bar stands for; the largest value by default. */
    max?: number | undefined;
    /** One earlier value per item, for two periods side by side. */
    paired?: readonly number[] | undefined;
    /** What the bars count, which leads the sentence they read as: "September against August, in pounds". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the items will not do. */
    summary?: string | undefined;
    /** How a value is written, on the chart and in its sentence. Grouped figures by default. */
    format?: ((n: number) => string) | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 416);
  const g = $derived(bars(items, { width: W, max, paired, format }));
  const said = $derived(summary ?? describeBars(items, subject, paired, format));
</script>

<div class="viz viz-bars" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {g.height}" role="img" aria-label={said}>
    {#each g.rows as row, i (i)}
      {@const p = paint(items[i]?.tone, 'g2')}
      <text class="viz-label" data-strong={isQuiet(items[i]?.tone) ? undefined : ''} x="0" y={row.textY}>{row.label}</text>
      {#if g.track}
        <rect class="viz-track" x={g.track.x} y={row.bar.y} width={g.track.w} height={row.bar.h} rx="3" />
      {/if}
      {#if row.bar.w > 0}
        <rect class="viz-fill viz-grow-x" data-tone={p.tone} style:--c={p.colour} x={row.bar.x} y={row.bar.y} width={row.bar.w} height={row.bar.h} rx={row.bar.rx} />
      {/if}
      {#if row.pair && row.pair.w > 0}
        <rect class="viz-fill viz-grow-x" data-tone="g4" x={row.pair.x} y={row.pair.y} width={row.pair.w} height={row.pair.h} rx={row.pair.rx} />
      {/if}
      {#if items[i]?.note}
        <text class="viz-value" x={row.noteX} y={row.noteY ?? row.textY}>{items[i]?.note}</text>
      {/if}
      <text class="viz-value" x={g.valueX} y={row.textY} text-anchor="end">{row.value}</text>
    {/each}
  </svg>
</div>
