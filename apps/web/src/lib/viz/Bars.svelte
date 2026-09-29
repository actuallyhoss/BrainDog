<!--
  Horizontal bars, one row an item: the label, the bar, a note at its end, and the value at the right.

  Bars are greys (`g2`) unless an item has a `tone`; give the one that matters `ink` and its label
  turns ink with it (SYSTEM §2, "one series highlighted in ink and the rest are greys"). `danger`,
  `earn`, `warn` and `live` keep their meanings, and a project's colour works too.

  PAIRED is two periods (SYSTEM §7): pass `paired`, one earlier value per item, and each row draws
  this period's bar over the earlier one's in a light grey. Alone, each bar sits on a track.

  THE SCALE IS SHARED WHEN YOU SAY SO: pass `max` to put several charts on one scale.

  The label column takes the longest label up to two fifths of the width, so at phone width a long
  label narrows the bars rather than the other way round. Text keeps its size at any width.
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
        <rect class="viz-fill" data-tone={p.tone} style:--c={p.colour} x={row.bar.x} y={row.bar.y} width={row.bar.w} height={row.bar.h} rx={row.bar.rx} />
      {/if}
      {#if row.pair && row.pair.w > 0}
        <rect class="viz-fill" data-tone="g4" x={row.pair.x} y={row.pair.y} width={row.pair.w} height={row.pair.h} rx={row.pair.rx} />
      {/if}
      {#if items[i]?.note}
        <text class="viz-value" x={row.noteX} y={row.textY}>{items[i]?.note}</text>
      {/if}
      <text class="viz-value" x={g.valueX} y={row.textY} text-anchor="end">{row.value}</text>
    {/each}
  </svg>
</div>
