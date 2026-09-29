<!--
  Segments: progress as one cell per step or part. Done cells are ink, the rest a light
  grey, and with `current` the next cell is an outline in `tone`: `danger` when that step waits on him
  (a review, a part due), `live` when an agent is on it, a grey by default.

  The cells share the width of the box, so put it in a box as wide as the steps should be ("step 4 of
  5" beside its words is about a hundred pixels; 23 payment parts can take the tile).
-->
<script lang="ts">
  import './viz.css';
  import { describeSegments, SEG_HEIGHT, segments } from './segments.ts';
  import { paint, type Tone } from './shared.ts';

  let {
    total,
    done,
    current = false,
    tone,
    subject,
    summary,
  }: {
    total: number;
    done: number;
    /** Outline the step after the last done one, as the one in hand. */
    current?: boolean | undefined;
    /** The current step's outline: `danger`, `live`, `warn`, or a grey (`g2`, the default). */
    tone?: Tone | undefined;
    /** What is being counted, which leads the sentence: "Lina, parts paid". */
    subject?: string | undefined;
    /** The whole sentence, when "10 of 23 done" will not do. */
    summary?: string | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 416);
  const cells = $derived(segments(total, done, W, current));
  const p = $derived(paint(tone, 'g2'));
  const said = $derived(summary ?? describeSegments(total, done, subject, current));
</script>

<div class="viz viz-segments" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {SEG_HEIGHT}" role="img" aria-label={said}>
    {#each cells as cell, i (i)}
      {#if cell.state === 'current'}
        <!-- Inset by half the stroke, so the outline sits inside the cell it stands for. -->
        <rect
          class="viz-outline"
          data-tone={p.tone}
          style:--c={p.colour}
          x={cell.x + 0.75}
          y="0.75"
          width={Math.max(0, cell.w - 1.5)}
          height={SEG_HEIGHT - 1.5}
          rx={Math.max(0, cell.rx - 0.5)}
        />
      {:else}
        <rect class="viz-fill" data-tone={cell.state === 'done' ? 'ink' : 'g4'} x={cell.x} y="0" width={cell.w} height={SEG_HEIGHT} rx={cell.rx} />
      {/if}
    {/each}
  </svg>
</div>
