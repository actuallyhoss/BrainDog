<!--
  A ring: a share of a whole, or progress, as an arc from twelve o'clock on a quiet track.

  The arc is the accent by default; `earn`, `danger`, `live`, `warn` or a project's colour when the share
  means one of those. From 72px the figure sits inside it, and from 112px its `label` under that
  ("of 58 filed"), at 12 in `dim`. Smaller rings are a mark beside words that say the figure.

  `size` is the most it is drawn at; in a narrower box it draws at the box's width, and its words
  stay the same size.
-->
<script lang="ts">
  import './viz.css';
  import { describeRing, ring } from './ring.ts';
  import { figure, paint, type Tone } from './shared.ts';

  let {
    value,
    max,
    tone,
    size = 96,
    label,
    subject,
    summary,
    format = figure,
  }: {
    value: number;
    max: number;
    tone?: Tone | undefined;
    /** Its diameter in px, at most. */
    size?: number | undefined;
    /** The caption under the figure, from 112px: "of 58 filed". */
    label?: string | undefined;
    /** What the share is of, which leads the sentence: "Filed by your rules". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the figures will not do. */
    summary?: string | undefined;
    /** How the figure is written, inside the ring and in the sentence. */
    format?: ((n: number) => string) | undefined;
  } = $props();

  let measured = $state(0);
  const S = $derived(measured > 0 ? Math.min(measured, size) : size);
  const g = $derived(ring(value, max, S));
  const p = $derived(paint(tone, 'ink'));
  const said = $derived(summary ?? describeRing(value, max, subject, label, format));
</script>

<div class="viz viz-ring" bind:clientWidth={measured} style:max-inline-size="{size}px">
  <svg viewBox="0 0 {g.size} {g.size}" role="img" aria-label={said}>
    <circle class="ring-track" cx={g.c} cy={g.c} r={g.r} stroke-width={g.stroke} />
    {#if g.dash}
      <circle
        class="ring-arc viz-sweep"
        data-tone={p.tone}
        style:--c={p.colour}
        style:--viz-arc="{g.arc}px"
        cx={g.c}
        cy={g.c}
        r={g.r}
        stroke-width={g.stroke}
        stroke-dasharray={g.dash}
        transform="rotate(-90 {g.c} {g.c})"
      />
    {/if}
    {#if g.roomy}
      {@const captioned = g.captioned && !!label}
      <text class="ring-figure" data-big={g.captioned ? '' : undefined} x={g.c} y={captioned ? g.c + 2 : g.c + (g.captioned ? 8 : 6)} text-anchor="middle">{format(value)}</text>
      {#if captioned}
        <text class="viz-label" x={g.c} y={g.c + 20} text-anchor="middle">{label}</text>
      {/if}
    {/if}
  </svg>
</div>

<style>
  .ring-track {
    fill: none;
    stroke: var(--viz-track);
  }

  .ring-arc {
    fill: none;
    stroke: var(--c);
    stroke-linecap: round;
  }

  .ring-figure {
    fill: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .ring-figure[data-big] {
    font-size: var(--t-xl);
    letter-spacing: -0.02em;
  }

  @media (forced-colors: active) {
    .ring-track {
      stroke: GrayText;
    }

    .ring-figure {
      fill: CanvasText;
    }
  }
</style>
