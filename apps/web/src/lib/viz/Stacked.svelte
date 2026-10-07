<!--
  A stacked bar: part of a whole as one pill-ended bar, its parts 2px apart.

  Parts with no `tone` step down the ramp in order, the accent first, then its two tints, then the grey for
  "other", so put the part that matters first or give it `ink` and the rest the tints. The bar wipes in from the
  left on its first draw. A part's label sits under it, at its start, when it fits inside
  the part's width; at phone width the labels that no longer fit drop, and the sentence
  a screen reader hears always has every part.
-->
<script lang="ts">
  import './viz.css';
  import { paint, rampAt, type Tone } from './shared.ts';
  import { describeStacked, stacked } from './stacked.ts';

  let {
    parts,
    height = 12,
    subject,
    summary,
    format,
  }: {
    parts: readonly { label: string; value: number; tone?: Tone | undefined }[];
    /** The bar's thickness in px. */
    height?: number | undefined;
    /** What the whole is, which leads the sentence: "Pounds by account". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the parts will not do. */
    summary?: string | undefined;
    /** How a value is written in the sentence. Grouped figures by default. */
    format?: ((n: number) => string) | undefined;
  } = $props();

  const uid = $props.id();
  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 416);
  const g = $derived(stacked(parts, W, height));
  const said = $derived(summary ?? describeStacked(parts, subject, format));
</script>

<div class="viz viz-stacked" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {g.height}" role="img" aria-label={said}>
    <defs>
      <clipPath id="{uid}-pill"><rect x="0" y="0" width={W} height={height} rx={height / 2} /></clipPath>
    </defs>
    <!-- The wipe is a clip of its own, so it goes on a group outside the pill's: on one element it would replace it. -->
    <g class="viz-wipe">
      <g clip-path="url(#{uid}-pill)">
        {#each g.parts as part (part.i)}
          {@const p = paint(parts[part.i]?.tone, rampAt(part.i))}
          <rect class="viz-fill" data-tone={p.tone} style:--c={p.colour} x={part.x} y="0" width={part.w} height={height} />
        {/each}
      </g>
    </g>
    {#each g.parts as part (part.i)}
      {#if part.labelX !== null}
        <text class="viz-label" x={part.labelX} y={g.labelY}>{parts[part.i]?.label}</text>
      {/if}
    {/each}
  </svg>
</div>
