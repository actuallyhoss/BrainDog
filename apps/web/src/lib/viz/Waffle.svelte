<!--
  A waffle: part of a whole as one small square a thing, such as open tasks by tier.

  Parts fill in order, reading left to right and down. Parts with no `tone` step down the ramp from
  the accent; give the part that needs him `danger` ("1 urgent") and the others the tints. The squares wipe in from
  the left on the first draw. Past 200 things each
  square stands for an equal share (see `waffle.ts`), and the sentence still gives the real counts.

  With no `columns`, the squares run in one row as long as the box allows and then wrap; with
  `columns`, every row is that long.
-->
<script lang="ts">
  import './viz.css';
  import { paint, rampAt, type Tone } from './shared.ts';
  import { describeWaffle, waffle } from './waffle.ts';

  let {
    parts,
    columns,
    subject,
    summary,
  }: {
    parts: readonly { label: string; value: number; tone?: Tone | undefined }[];
    /** Squares a row; as many as fit by default. */
    columns?: number | undefined;
    /** What the squares are, which leads the sentence: "open tasks" gives "23 open tasks: 1 urgent, …". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the parts will not do. */
    summary?: string | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 296);
  const g = $derived(
    waffle(
      parts.map((p) => p.value),
      W,
      columns,
    ),
  );
  const paints = $derived(parts.map((p, i) => paint(p.tone, rampAt(i))));
  const said = $derived(summary ?? describeWaffle(parts, subject));
</script>

<div class="viz viz-waffle" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {g.height}" role="img" aria-label={said}>
    <g class="viz-wipe">
      {#each g.cells as cell, n (n)}
        {@const p = paints[cell.part]}
        <rect class="viz-fill" data-tone={p?.tone} style:--c={p?.colour} x={cell.x} y={cell.y} width={g.size} height={g.size} rx="2" />
      {/each}
    </g>
  </svg>
</div>
