<!--
  `roadmap`: tasks on one time axis, a window as a bar on its track and a date as a stem, over alternate month
  bands and today's line, with every placed row said again as a table. `src/roadmap.ts` decides every position,
  lane, paint and line of the table; `roadmap` in `src/html.ts` is this file's twin, and `roadmap-parity.test.ts`
  holds the two to one tree.

  IT IS ON `list` AND HAD NO ARM THERE, so the app drew a roadmap as the generic list: the title, the due day as
  its detail and the effort as its state, three words where the mirror drew a chart (measured by the parity test,
  which failed on every shape before this file). The pointer drag and its undo are the next wave's, and will live
  here, not in the mirror, as `forecast`'s knobs do.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions, type Row } from '../../src/index.ts';
  import { MISSING } from '../../src/format.ts';
  import {
    ROADMAP_DUE,
    ROADMAP_FROM,
    ROADMAP_NONE,
    ROADMAP_PAINT,
    ROADMAP_WHAT,
    roadmapLane,
    roadmapLines,
    roadmapPlan,
    roadmapRow,
    roadmapSentence,
    roadmapShare,
    roadmapSkipped,
    roadmapToday,
  } from '../../src/roadmap.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  const rows = $derived(block.rows.map((r) => roadmapRow(said(r, 0), said(r, 1), said(r, 2), r.tone)));
  const plan = $derived(roadmapPlan(rows, roadmapToday(opts.now)));
  const skipped = $derived(plan.skipped.length ? roadmapSkipped(plan.skipped.map((i) => rows[i]!.title || MISSING)) : '');
  /* The glyph only for a word `TONES` owns, as `toneGlyph` in the mirror checks: the parser has let
     `Object.prototype`'s names into the tone slot before, and a lookup on one of those is not a tone. */
  const glyph = (tone?: string) => (tone && Object.hasOwn(TONES, tone) ? TONES[tone as keyof typeof TONES] : null);
</script>

{#snippet mark(tone?: string)}{@const g = glyph(tone)}{#if g}<span class="glyph" role="img" aria-label={g.label}>{g.glyph}</span>{/if}{/snippet}

{#if plan.empty}
  <div class="roadmap">
    <p class="roadmap-empty">{ROADMAP_NONE}</p>
    {#if skipped}<p class="roadmap-skipped">{skipped}</p>{/if}
  </div>
{:else}
  <div class="roadmap" style="--tracks:{plan.tracks};--lines:{plan.lines}">
    <div class="roadmap-plot">
      <svg class="roadmap-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={roadmapSentence(plan)}>
        {#each plan.bands as m}
          <rect class="roadmap-band" data-odd={m.odd ? '' : undefined} {...m.odd ? ROADMAP_PAINT.band : ROADMAP_PAINT.even} x={m.x} y="0" width={m.width} height="100"></rect>
        {/each}
        {#each plan.bars as bar}
          {@const lane = roadmapLane(bar.track, plan.tracks)}
          <rect class="roadmap-bar" data-intent={bar.tone} {...ROADMAP_PAINT.bar} x={bar.x} y={lane.y} width={bar.width} height={lane.height} vector-effect="non-scaling-stroke"></rect>
        {/each}
        {#each plan.stems as s}
          <path class="roadmap-stem" data-intent={s.tone} {...ROADMAP_PAINT.stem} d="M{s.x} 0V100" vector-effect="non-scaling-stroke"></path>
        {/each}
        {#if plan.today !== null}
          <path class="roadmap-today" {...ROADMAP_PAINT.today} d="M{plan.today} 0V100" vector-effect="non-scaling-stroke"></path>
        {/if}
      </svg>
      <!-- The words over the box, placed by `--at`: text inside a `preserveAspectRatio="none"` box is stretched with
           it. Hidden, because the table below says every row and the drawing's name says the whole. -->
      <ol class="roadmap-names" aria-hidden="true">
        {#each plan.bars as bar}
          <li class="roadmap-name" data-intent={bar.tone} style="--at:{roadmapShare(bar.x)};--track:{bar.track}">{bar.title}{@render mark(bar.tone)}</li>
        {/each}
        {#each plan.stems as s}
          <li class="roadmap-name" data-stem="" data-intent={s.tone} style="--at:{roadmapShare(s.label.x)};--line:{s.label.line}">{s.title}{@render mark(s.tone)}</li>
        {/each}
      </ol>
    </div>
    <ol class="roadmap-months" aria-hidden="true">
      {#each plan.bands as m}
        <li class="roadmap-month" data-odd={m.odd ? '' : undefined} style="--at:{roadmapShare(m.x)}">{m.label}</li>
      {/each}
    </ol>
    <div class="roadmap-numbers">
      <table class="roadmap-table">
        <thead>
          <tr><th scope="col">{ROADMAP_WHAT}</th><th scope="col">{ROADMAP_FROM}</th><th scope="col">{ROADMAP_DUE}</th></tr>
        </thead>
        <tbody>
          {#each roadmapLines(plan) as p}
            <tr><th scope="row">{p.title}{@render mark(p.tone)}</th><td class="num">{p.from}</td><td class="num">{p.due}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if skipped}<p class="roadmap-skipped">{skipped}</p>{/if}
  </div>
{/if}
