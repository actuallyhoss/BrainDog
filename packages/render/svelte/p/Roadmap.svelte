<!--
  `roadmap`: tasks on one time axis, a window as a bar on its track and a date as a stem, over alternate month
  bands and today's line, with every placed row said again as a lane list. `src/roadmap.ts` decides every position,
  lane, paint, name and line of the list; `roadmap` in `src/html.ts` is this file's twin, and `roadmap-parity.test.ts`
  holds the two to one tree.

  IT IS ON `list` AND HAD NO ARM THERE, so the app drew a roadmap as the generic list: the title, the due day as
  its detail and the effort as its state, three words where the mirror drew a chart (measured by the parity test,
  which failed on every shape before this file).

  THE POINTER DRAG LIVES HERE AND NOT IN THE MIRROR, as `forecast`'s knobs do, and only where the host hands
  `onreschedule`. A window's middle moves it, its first or last few pixels move that end, and a date moves whole. The
  bar follows the pointer in whole days, and when the pointer lets go the host is handed the row and the drop, which
  carries `dragPatch` bound to the gesture (`roadmap-drag.ts` says why the drawer never works out the patch itself).
  One drop is one write, and its undo is the host's, because only the host knows what the row held.

  WITH NO CALLBACK THERE IS NOTHING TO TAKE: no grip, no cursor and no hit stroke, so the chart is the picture
  `toHTML` draws and `roadmap-parity.test.ts` still compares like with like. That is `19 §6`: a control that cannot
  act is absent. A keyboard does not drag a bar; the row's own page sets the same two fields.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions, type Row } from '../../src/index.ts';
  import { MISSING } from '../../src/format.ts';
  import {
    ROADMAP_NONE,
    ROADMAP_PAINT,
    roadmapDue,
    roadmapLabelAt,
    roadmapLane,
    roadmapLines,
    roadmapPlan,
    roadmapRow,
    roadmapSentence,
    roadmapShare,
    roadmapSkipped,
    roadmapToday,
    type DragMode,
    type RoadmapBar,
    type RoadmapStem,
  } from '../../src/roadmap.ts';
  import { dragDays, dragDrawn, dragModeAt, dropOf, type RoadmapDrop } from './roadmap-drag.ts';

  let {
    block,
    opts = {},
    onreschedule,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** Where a drop goes. Its absence is what keeps every bar a picture. */
    onreschedule?: ((row: Row, drop: RoadmapDrop) => void) | undefined;
  } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  const rows = $derived(block.rows.map((r) => roadmapRow(said(r, 0), said(r, 1), said(r, 2), r.tone)));
  const plan = $derived(roadmapPlan(rows, roadmapToday(opts.now)));
  const skipped = $derived(plan.skipped.length ? roadmapSkipped(plan.skipped.map((i) => rows[i]!.title || MISSING)) : '');
  /* The glyph only for a word `TONES` owns, as `toneGlyph` in the mirror checks: the parser has let
     `Object.prototype`'s names into the tone slot before, and a lookup on one of those is not a tone. */
  const glyph = (tone?: string) => (tone && Object.hasOwn(TONES, tone) ? TONES[tone as keyof typeof TONES] : null);

  /* ── the drag ─────────────────────────────────────────────────────────────── */

  /** The drag in hand: the row by its index, the part taken, where the pointer went down, the box's width, the days. */
  let drag = $state<{ row: number; mode: DragMode; from: number; box: number; days: number } | null>(null);
  /** The part of a bar a pointer is over and not yet pressing, so the cursor says which end a press would take. */
  let hover = $state<{ row: number; mode: DragMode } | null>(null);

  /* A DRAG IS ABOUT ONE DRAWING. The host reads the page again after a write and hands a new block, and a drag held
     over it by index would draw a different row where the old one was. */
  let drawnFrom = '';
  $effect(() => {
    if (block.raw === drawnFrom) return;
    drawnFrom = block.raw;
    drag = null;
    hover = null;
  });

  const partOf = (e: PointerEvent, stem: boolean): DragMode => {
    if (stem) return 'move';
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return dragModeAt(e.clientX - r.left, r.width);
  };

  function grab(e: PointerEvent, row: number, stem: boolean) {
    if (!onreschedule || !e.isPrimary || e.button !== 0) return;
    const mark = e.currentTarget as SVGGraphicsElement;
    /* THE BOX'S WIDTH, TAKEN ONCE, because what a day is worth in pixels is the box's and not the bar's. */
    const box = mark.ownerSVGElement?.getBoundingClientRect().width ?? 0;
    mark.setPointerCapture(e.pointerId);
    drag = { row, mode: partOf(e, stem), from: e.clientX, box, days: 0 };
    e.preventDefault();
  }

  function slide(e: PointerEvent, row: number, stem: boolean) {
    if (drag) {
      if (drag.row === row) drag = { ...drag, days: dragDays(e.clientX - drag.from, drag.box, plan) };
      return;
    }
    hover = { row, mode: partOf(e, stem) };
  }

  /* A PRESS THAT DID NOT MOVE A WHOLE DAY IS NO DROP, so a click on a bar writes nothing and spends no undo. */
  function letGo() {
    const d = drag;
    drag = null;
    const row = d ? block.rows[d.row] : undefined;
    if (d && row && d.days !== 0) onreschedule?.(row, dropOf(d.mode, d.days));
  }

  /* ESCAPE PUTS THE BAR BACK, as it cancels a drag on every desktop, and nothing is written. */
  const escape = (e: KeyboardEvent) => {
    if (drag && e.key === 'Escape') drag = null;
  };

  /** Where a bar is drawn: under the pointer while it is dragged, where the plan put it otherwise. */
  const barAt = (bar: RoadmapBar): { x: string; width: string } =>
    drag?.row === bar.row ? dragDrawn(bar, drag.mode, drag.days, plan) : { x: bar.x, width: bar.width };
  const stemAt = (s: RoadmapStem): string => (drag?.row === s.row ? dragDrawn({ start: '', end: s.day }, 'move', drag.days, plan).x : s.x);

  /** The cursor a grip wears: an end's resize arrow over an end, a closed hand while held, an open one over the rest. */
  const cursorOf = (row: number): string => {
    const part = drag?.row === row ? drag.mode : hover?.row === row ? hover.mode : 'move';
    return part !== 'move' ? 'ew-resize' : drag?.row === row ? 'grabbing' : 'grab';
  };
  /* A PHONE SCROLLS THROUGH A ROADMAP UP AND DOWN and drags across it, so only the horizontal is the grip's. */
  const GRIP = 'touch-action: pan-y';
</script>

<svelte:window onkeydown={onreschedule ? escape : undefined} />

{#snippet mark(tone?: string)}{@const g = glyph(tone)}{#if g}<span class="glyph" role="img" aria-label={g.label}>{g.glyph}</span>{/if}{/snippet}

{#if plan.empty}
  <div class="roadmap">
    <p class="roadmap-empty">{ROADMAP_NONE}</p>
    {#if skipped}<p class="roadmap-skipped">{skipped}</p>{/if}
  </div>
{:else}
  <div class="roadmap" data-lanes={plan.lanes ? '' : undefined} style="--tracks:{plan.laneCount};--lines:{plan.lines}">
    <div class="roadmap-plot">
      <svg class="roadmap-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={roadmapSentence(plan)}>
        {#each plan.bands as m}
          <rect class="roadmap-band" data-odd={m.odd ? '' : undefined} {...m.odd ? ROADMAP_PAINT.band : ROADMAP_PAINT.even} x={m.x} y="0" width={m.width} height="100"></rect>
        {/each}
        {#each plan.bars as bar}
          {@const lane = roadmapLane(bar.lane, plan.laneCount)}
          {@const g = glyph(bar.tone)}
          {@const drawn = onreschedule ? barAt(bar) : bar}
          {#snippet span()}
            {#if onreschedule}
              <rect
                class="roadmap-bar"
                data-grip=""
                data-dragging={drag?.row === bar.row ? '' : undefined}
                {...ROADMAP_PAINT.bar}
                x={drawn.x}
                y={lane.y}
                width={drawn.width}
                height={lane.height}
                vector-effect="non-scaling-stroke"
                cursor={cursorOf(bar.row)}
                style={GRIP}
                onpointerdown={(e) => grab(e, bar.row, false)}
                onpointermove={(e) => slide(e, bar.row, false)}
                onpointerup={letGo}
                onpointercancel={() => (drag = null)}
                onpointerleave={() => (hover = null)}
              ></rect>
            {:else}
              <rect class="roadmap-bar" {...ROADMAP_PAINT.bar} x={bar.x} y={lane.y} width={bar.width} height={lane.height} vector-effect="non-scaling-stroke"></rect>
            {/if}
          {/snippet}
          <!-- A TONED MARK IS A GROUP: the intent on the group, and the window and its named dot inside it (`roadmapDue`). -->
          {#if g}
            <g class="roadmap-mark" data-intent={bar.tone}>
              {@render span()}
              <path class="roadmap-due" role="img" aria-label={g.label} d={roadmapDue(drawn.x, drawn.width, lane)} {...ROADMAP_PAINT.due} vector-effect="non-scaling-stroke"></path>
            </g>
          {:else}
            {@render span()}
          {/if}
        {/each}
        {#each plan.stems as s}
          {@const x = stemAt(s)}
          {@const g = glyph(s.tone)}
          {#if g}
            <g class="roadmap-mark" data-intent={s.tone}>
              <path class="roadmap-stem" {...ROADMAP_PAINT.stem} d="M{x} 0V100" vector-effect="non-scaling-stroke"></path>
              <path class="roadmap-due" role="img" aria-label={g.label} d={roadmapDue(x, null, null)} {...ROADMAP_PAINT.due} vector-effect="non-scaling-stroke"></path>
            </g>
          {:else}
            <path class="roadmap-stem" {...ROADMAP_PAINT.stem} d="M{x} 0V100" vector-effect="non-scaling-stroke"></path>
          {/if}
          {#if onreschedule}
            <!-- A STEM IS A HAIRLINE, which no finger lands on and few pointers do, so it is taken by a stroke twelve
                 pixels wide over the same line, painted nothing and hit on its stroke alone. No role, because it is
                 inside a drawing whose role is `img` and whose table below says every date; the linter asks for one
                 on the path and not on the bar's `rect` beside it, which takes the same handlers. -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <path
              class="roadmap-grip"
              data-dragging={drag?.row === s.row ? '' : undefined}
              d="M{x} 0V100"
              fill="none"
              stroke="transparent"
              stroke-width="12"
              pointer-events="stroke"
              vector-effect="non-scaling-stroke"
              cursor={cursorOf(s.row)}
              style={GRIP}
              onpointerdown={(e) => grab(e, s.row, true)}
              onpointermove={(e) => slide(e, s.row, true)}
              onpointerup={letGo}
              onpointercancel={() => (drag = null)}
              onpointerleave={() => (hover = null)}
            ></path>
          {/if}
        {/each}
        {#if plan.today !== null}
          <path class="roadmap-today" {...ROADMAP_PAINT.today} d="M{plan.today} 0V100" vector-effect="non-scaling-stroke"></path>
        {/if}
      </svg>
      <!-- The words over the box, placed by `--at`: text inside a `preserveAspectRatio="none"` box is stretched with
           it. Hidden, because the table below says every row and the drawing's name says the whole. A dragged mark's
           name goes with it, so the word under the pointer is the row being moved. NO GLYPH AFTER A NAME: the mark's
           dot on its due day is its tone, and a second dot after the name read as two marks for one bar. -->
      <ol class="roadmap-names" aria-hidden="true">
        {#each plan.bars as bar}
          {@const at = onreschedule ? roadmapLabelAt(bar, barAt(bar)) : bar.label.x}
          <li class="roadmap-name" data-side={bar.label.side} data-intent={bar.tone} style="--at:{roadmapShare(at)};--room:{roadmapShare(bar.label.room)};--track:{bar.lane}">{bar.title}</li>
        {/each}
        {#each plan.stems as s}
          <li class="roadmap-name" data-stem="" data-intent={s.tone} style="--at:{roadmapShare(s.label.x)};--line:{s.label.line}">{s.title}</li>
        {/each}
      </ol>
    </div>
    <ol class="roadmap-months" aria-hidden="true">
      {#each plan.bands.filter((m) => m.label) as m}
        <li class="roadmap-month" data-odd={m.odd ? '' : undefined} style="--at:{roadmapShare(m.x)}">{m.label}</li>
      {/each}
    </ol>
    <!-- A LANE LIST, NOT A TABLE: what a screen reader reads beside the drawing and what a phone draws instead of it. -->
    <div class="roadmap-numbers">
      <ol class="roadmap-list">
        {#each roadmapLines(plan) as p}
          <li class="roadmap-item" data-intent={p.tone} style="--at:{p.at};--span:{p.span}"><span class="roadmap-item-title">{p.title}{@render mark(p.tone)}</span> <span class="roadmap-item-when num">{p.when}</span><span class="roadmap-item-track" aria-hidden="true"><span class="roadmap-item-bar"></span></span></li>
        {/each}
      </ol>
    </div>
    {#if skipped}<p class="roadmap-skipped">{skipped}</p>{/if}
  </div>
{/if}
