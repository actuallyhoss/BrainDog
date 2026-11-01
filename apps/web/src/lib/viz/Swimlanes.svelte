<!--
  Swimlanes: who was busy when, and what is running now (the design system: "time and overlap").

  A lane a row, each on a quiet track, its finished spans in the grey for "done" and its live ones in `live`, each
  span growing from its start on the first draw. The
  now line runs through every lane in `live`, with a small pill at its top ("now 09:40"), and hour
  ticks sit under a hairline axis. `marks` add a dashed rule for a moment worth seeing ("you left
  21:40"). Times are epoch milliseconds; ticks and words are on the viewer's clock unless `format`
  says otherwise.

  Below 360px the labels move above their lanes and the ticks thin out (see `swimlanes.ts`).
-->
<script lang="ts">
  import './viz.css';
  import { describeLanes, swimlanes, TRACK_H, type Lane, type LaneMark } from './swimlanes.ts';

  let {
    lanes,
    start,
    end,
    now,
    marks,
    subject,
    summary,
    format,
  }: {
    lanes: readonly Lane[];
    /** The window's start and end, epoch ms. */
    start: number;
    end: number;
    /** Now, epoch ms: the live line, and where live spans end. */
    now: number;
    /** Moments drawn as a dashed rule with a label at the top. */
    marks?: readonly LaneMark[] | undefined;
    /** What the lanes hold, which leads the sentence: "Agent sessions". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the spans will not do. */
    summary?: string | undefined;
    /** How a time is written, on the axis and in the sentence. "09:40" by default. */
    format?: ((t: number) => string) | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 533);
  const g = $derived(swimlanes(lanes, { start, end, now, width: W, marks, format }));
  const said = $derived(summary ?? describeLanes(lanes, { start, end, now }, subject, format));
</script>

<div class="viz viz-lanes" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {g.height}" role="img" aria-label={said}>
    {#each g.lanes as lane, i (i)}
      <text class="viz-label" x="0" y={lane.labelY}>{lane.label}</text>
      <rect class="viz-track" x={g.gutter} y={lane.y} width={Math.max(0, W - g.gutter)} height={TRACK_H} rx={TRACK_H / 2} />
      {#each lane.spans as s, k (k)}
        <rect class="viz-fill viz-grow-x" data-tone={s.live ? 'live' : 'done'} x={s.x} y={lane.y} width={s.w} height={TRACK_H} rx={s.rx} />
      {/each}
    {/each}

    <line class="viz-grid" x1={g.gutter} y1={g.axisY} x2={W} y2={g.axisY} />
    {#each g.ticks as tick, i (i)}
      <text class="viz-label" x={tick.x} y={g.tickY} text-anchor={tick.anchor}>{tick.text}</text>
    {/each}

    {#each g.marks as mark, i (i)}
      <line class="viz-rule" x1={mark.x} y1="18" x2={mark.x} y2={g.axisY} />
      {#if mark.label}
        <text class="viz-label" x={mark.labelX} y="12" text-anchor={mark.anchor}>{mark.label}</text>
      {/if}
    {/each}

    {#if g.now}
      <line class="viz-now" x1={g.now.x} y1="16" x2={g.now.x} y2={g.axisY} />
      <!-- A PLAIN LABEL OVER THE NOW LINE (G29): it was a green pill, and Look B draws no pills. -->
      <text class="viz-now-text" x={g.now.pillX + g.now.pillW / 2} y="12" text-anchor="middle">{g.now.text}</text>
    {/if}
  </svg>
</div>
