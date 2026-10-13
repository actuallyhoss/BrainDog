<!--
  `roadmap`: tasks on one time axis, drawn as a timeline: each row its name in the left column and its window as a bar
  on a track in the right, a date as a dot on its day, the axis across the top and today's line down every track.
  A name is one line, cut with an ellipsis where it is long, so it carries the whole of itself as its `title`; and a
  key under the rows says what the bars' colours mean. `src/roadmap.ts` decides every position, name and line; `roadmap` in `src/html.ts` is this file's twin, and
  `roadmap-parity.test.ts` holds the two to one tree.

  IT IS ON `list` AND HAD NO ARM THERE, so the app drew a roadmap as the generic list: the title, the due day as
  its detail and the effort as its state, three words where the mirror drew a chart (measured by the parity test,
  which failed on every shape before this file).

  THE POINTER DRAG LIVES HERE AND NOT IN THE MIRROR, as `forecast`'s knobs do, and only where the host hands
  `onreschedule`. A window's middle moves it, its first or last few pixels move that end, and a date moves whole. The
  bar follows the pointer in whole days, and when the pointer lets go the host is handed the row and the drop, which
  carries `dragPatch` bound to the gesture (`roadmap-drag.ts` says why the drawer never works out the patch itself).
  One drop is one write, and its undo is the host's, because only the host knows what the row held.

  WITH NO CALLBACK THERE IS NOTHING TO TAKE: no grip and no cursor, so the timeline is the one `toHTML` draws and
  `roadmap-parity.test.ts` still compares like with like. That is `19 §6`: a control that cannot act is absent. A
  keyboard does not drag a bar; the row's own page sets the same two fields.

  NOR IS THERE ANYTHING TO TAKE ON A LINE THE RECORD DOES NOT HOLD. A line typed into the fence has no `ref`, so the
  host has no task to write the drop to; its bar is the plain one, beside the grips of the lines that are held.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions, type Row } from '../../src/index.ts';
  import { MISSING } from '../../src/format.ts';
  import {
    ROADMAP_LEGEND,
    ROADMAP_NONE,
    ROADMAP_TODAY,
    roadmapAxis,
    roadmapFlip,
    roadmapLegend,
    roadmapLines,
    roadmapPlan,
    roadmapRow,
    roadmapSentence,
    roadmapShare,
    roadmapSkipped,
    roadmapToday,
    type DragMode,
    type RoadmapLine,
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
  const lines = $derived(plan.empty ? [] : roadmapLines(plan));
  const keys = $derived(roadmapLegend(lines));
  const skipped = $derived(plan.skipped.length ? roadmapSkipped(plan.skipped.map((i) => rows[i]!.title || MISSING)) : '');
  /* The glyph only for a word `TONES` owns, as `toneGlyph` in the mirror checks: the parser has let
     `Object.prototype`'s names into the tone slot before, and a lookup on one of those is not a tone. */
  const glyph = (tone?: string) => (tone && Object.hasOwn(TONES, tone) ? TONES[tone as keyof typeof TONES] : null);

  /* ── the drag ─────────────────────────────────────────────────────────────── */

  /** The drag in hand: the row by its index, the part taken, where the pointer went down, the track's width, the days. */
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

  /** The window a row was drawn as, a date's start empty, which `dragDrawn` moves whole. */
  const windowOf = (row: number): { start: string; end: string } => {
    const bar = plan.bars.find((b) => b.row === row);
    if (bar) return bar;
    return { start: '', end: plan.stems.find((s) => s.row === row)?.day ?? '' };
  };

  const partOf = (e: PointerEvent, date: boolean): DragMode => {
    if (date) return 'move';
    const r = (e.currentTarget as Element).getBoundingClientRect();
    return dragModeAt(e.clientX - r.left, r.width);
  };

  function grab(e: PointerEvent, row: number, date: boolean) {
    if (!onreschedule || !e.isPrimary || e.button !== 0) return;
    const mark = e.currentTarget as HTMLElement;
    /* THE TRACK'S WIDTH, TAKEN ONCE, because what a day is worth in pixels is the track's and not the bar's. */
    const box = mark.parentElement?.getBoundingClientRect().width ?? 0;
    mark.setPointerCapture(e.pointerId);
    drag = { row, mode: partOf(e, date), from: e.clientX, box, days: 0 };
    e.preventDefault();
  }

  function slide(e: PointerEvent, row: number, date: boolean) {
    if (drag) {
      if (drag.row === row) drag = { ...drag, days: dragDays(e.clientX - drag.from, drag.box, plan) };
      return;
    }
    hover = { row, mode: partOf(e, date) };
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

  /** Where a row's bar is drawn, as the two shares the stylesheet reads: under the pointer while it is dragged. */
  const placeOf = (p: RoadmapLine): string => {
    if (drag?.row !== p.row) return `--at:${p.at};--span:${p.span}`;
    const drawn = dragDrawn(windowOf(p.row), drag.mode, drag.days, plan);
    return `--at:${roadmapShare(drawn.x)};--span:${roadmapShare(drawn.width)}`;
  };

  /** The cursor a grip wears: an end's resize arrow over an end, a closed hand while held, an open one over the rest. */
  const cursorOf = (row: number): string => {
    const part = drag?.row === row ? drag.mode : hover?.row === row ? hover.mode : 'move';
    return part !== 'move' ? 'ew-resize' : drag?.row === row ? 'grabbing' : 'grab';
  };
</script>

<svelte:window onkeydown={onreschedule ? escape : undefined} />

{#snippet mark(tone?: string)}{@const g = glyph(tone)}{#if g}<span class="glyph" role="img" aria-label={g.label}>{g.glyph}</span>{/if}{/snippet}

{#if plan.empty}
  <div class="roadmap">
    <p class="roadmap-empty">{ROADMAP_NONE}</p>
    {#if skipped}<p class="roadmap-skipped">{skipped}</p>{/if}
  </div>
{:else}
  <div class="roadmap" style="--rows:{lines.length}">
    <!-- EACH MONTH WIDE ENOUGH FOR ITS NAME, or each Monday of a short span, and the word over today's line. -->
    <ol class="roadmap-axis" data-weekly={plan.weekly ? '' : undefined} aria-hidden="true">
      {#each roadmapAxis(plan) as t}
        <li class="roadmap-tick" style="--at:{roadmapShare(t.x)}">{t.label}</li>
      {/each}
      {#if plan.today !== null}<li class="roadmap-today" style="--at:{roadmapShare(plan.today)}">{ROADMAP_TODAY}</li>{/if}
    </ol>
    <ol class="roadmap-list" aria-label={roadmapSentence(plan)}>
      {#each lines as p}
        {@const date = p.from === MISSING}
        <li class="roadmap-item" data-intent={p.tone} data-date={date ? '' : undefined} data-flip={roadmapFlip(p) ? '' : undefined} style={placeOf(p)}><span class="roadmap-item-title" title={p.title || undefined}>{p.title}{@render mark(p.tone)}</span> <span class="roadmap-item-when num">{p.when}</span><span class="roadmap-item-track" aria-hidden="true">{#if onreschedule && block.rows[p.row]?.ref}<!-- A BAR IS A PICTURE THAT A POINTER CAN MOVE, inside a track no screen reader enters: the list says every row's days, and the row's own page sets them. A LINE TYPED INTO THE FENCE IS NOBODY'S TO MOVE: it carries no `ref`, a drop on it writes nothing, so it keeps the plain bar. --><!-- svelte-ignore a11y_no_static_element_interactions --><span
                class="roadmap-bar"
                data-grip=""
                data-dragging={drag?.row === p.row ? '' : undefined}
                style="cursor:{cursorOf(p.row)};touch-action:pan-y"
                onpointerdown={(e) => grab(e, p.row, date)}
                onpointermove={(e) => slide(e, p.row, date)}
                onpointerup={letGo}
                onpointercancel={() => (drag = null)}
                onpointerleave={() => (hover = null)}
              ></span>{:else}<span class="roadmap-bar"></span>{/if}</span></li>
      {/each}
    </ol>
    <!-- WHAT THE COLOURS MEAN, only the ones drawn, and only where there are two to tell apart. -->
    {#if keys.length}
      <ul class="roadmap-legend" aria-label={ROADMAP_LEGEND}>
        {#each keys as k}<li class="roadmap-key" data-key={k.tone}>{k.label}</li>{/each}
      </ul>
    {/if}
    {#if skipped}<p class="roadmap-skipped">{skipped}</p>{/if}
  </div>
{/if}
