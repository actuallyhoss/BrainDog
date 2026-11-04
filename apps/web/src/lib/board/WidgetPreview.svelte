<!--
  One widget drawn small at one of the five sizes, from what the record read for it (`WidgetReading`), for the widget
  sheet and the suggestion at the board's end (widgets plan §5.6, §6.3).

  IT FILLS ITS FRAME AND NEVER SCROLLS (§3.2, Call 3): the caller gives the frame its size, and what does not fit is
  "N more". Each size shows what §3.3 says it shows: a Small one figure, or the count and the first row; a Wide two
  figures, or three rows; a Tall three figures stacked, or the rows; a Large four figures and the line; a Full a row.

  AN EXAMPLE IS SAID TO BE ONE. A widget the record cannot fill yet is drawn from its example, faded, under the word
  Example, so nobody reads somebody else's numbers as theirs. While the record has not answered, the frame waits as a
  quiet shape and draws no number at all.

  THE FRAME IS A TILE: `--tile` on the board's `--page`, radius 18, no border and no shadow, in both themes, and it
  sizes its words to itself with container units, so one component draws every size at every width.
-->
<script lang="ts">
  import type { GalleryWidget, ReadFigure, ReadRow, WidgetReading, WidgetSize } from 'braindog-render';
  import { exampleMoney } from 'braindog-render';
  import Icon from '$lib/ui/Icon.svelte';
  import { isGlyph } from '$lib/ui/icons.ts';
  import { moneyInText } from '$lib/record/money.ts';
  import { FIGS_AT, ROWS_SHOWN, figureSaid, rowLine, rowShare, sheetWords } from './widget-read.ts';

  let {
    widget,
    size,
    reading,
    home = null,
    waiting = false,
  }: {
    widget: Pick<GalleryWidget, 'title' | 'icon' | 'example' | 'ready'> & { filled?: Record<string, string> };
    size: WidgetSize;
    /** What the record read, or `null`: then the example is drawn, or nothing while `waiting`. */
    reading: WidgetReading | null;
    /** The record's own currency, for money that names none. */
    home?: string | null;
    /** The record has not answered yet. */
    waiting?: boolean;
  } = $props();

  const example = $derived(reading === null && !waiting);
  const title = $derived(widget.title.replace(/\{\{([a-z_]+)\}\}/gu, (_all, k: string) => widget.filled?.[k] ?? ''));
  const icon = $derived(isGlyph(widget.icon) ? widget.icon : 'grid');

  /** The figures to draw: the reading's, else the example's as said. */
  type Fig = { label: string; said: string; line?: (number | null)[]; met: boolean | null };
  const figures = $derived.by((): Fig[] => {
    if (reading?.figures) return reading.figures.slice(0, FIGS_AT[size]).map((f: ReadFigure) => ({ label: f.label, said: f.said ?? figureSaid(f, home), met: f.met, ...(f.line ? { line: f.line } : {}) }));
    if (example && widget.example.figures) return widget.example.figures.slice(0, FIGS_AT[size]).map((f) => ({ label: f.label, said: exampleMoney(f.said, home), met: null }));
    return [];
  });
  type Line = { title: string; line: string; share: number | null; amount?: string };
  const rows = $derived.by((): Line[] => {
    if (reading?.rows)
      return reading.rows.slice(0, ROWS_SHOWN[size]).map((r: ReadRow) => ({
        /* A SENTENCE THE RECORD STORED SAYS ITS AMOUNT AS EVERY SCREEN DOES: "£39", never "GBP 39.00" (audit of 31 October, A20). */
        title: moneyInText(r.title),
        line: rowLine(r, home),
        share: rowShare(r),
        ...(r.amount ? { amount: figureSaid({ value: r.amount.amount, unit: r.amount.currency, format: 'money' }, home) } : {}),
      }));
    if (example && widget.example.rows) return widget.example.rows.slice(0, ROWS_SHOWN[size]).map((r) => ({ title: r.title, line: exampleMoney(r.meta ?? '', home), share: null }));
    return [];
  });
  const count = $derived(reading?.count ?? rows.length);
  const more = $derived(reading?.rows ? Math.max(0, count - rows.length) : 0);
  const empty = $derived(reading !== null && figures.length === 0 && rows.length === 0 ? (reading.empty ?? sheetWords.nothingYet) : null);
  const lead = $derived(figures[0]);
  const line = $derived(figures.find((f) => f.line && f.line.filter((p) => p !== null).length > 2)?.line ?? null);

  /** A figure's line as one path across the frame, its lowest point at the foot. */
  function pathOf(points: readonly (number | null)[]): { stroke: string; fill: string } {
    const known = points.map((p, i) => [i, p] as const).filter((x): x is readonly [number, number] => x[1] !== null);
    const lo = Math.min(...known.map((k) => k[1]));
    const hi = Math.max(...known.map((k) => k[1]));
    const span = hi - lo || 1;
    const last = points.length - 1 || 1;
    const xy = known.map(([i, v]) => `${((i / last) * 100).toFixed(2)},${(30 - ((v - lo) / span) * 26 - 2).toFixed(2)}`);
    const stroke = `M${xy.join(' L')}`;
    return { stroke, fill: `${stroke} L${xy[xy.length - 1]!.split(',')[0]},30 L${xy[0]!.split(',')[0]},30 Z` };
  }
</script>

<div class="wp" data-size={size} data-example={example ? '' : undefined} data-waiting={waiting ? '' : undefined}>
  <header class="wp-head">
    <span class="wp-icon" aria-hidden="true"><Icon name={icon} size="s" /></span>
    <span class="wp-title">{title}</span>
    <!-- AT EVERY SIZE (live check of 30 October, 4): the sheet draws most add-ons Small, where the word was left out, so
         "Car 62% of EGP 1,200,000" read as his own savings. -->
    {#if example}<span class="wp-tag">{sheetWords.example}</span>{/if}
  </header>

  {#if waiting && reading === null}
    <div class="wp-wait" aria-hidden="true"><span></span><span></span><span></span></div>
  {:else if empty !== null}
    <p class="wp-empty">{empty}</p>
  {:else if figures.length > 0}
    {#if size === 'small' || size === 'tall'}
      <div class="wp-figs wp-stack">
        {#each figures as f, i (i)}
          <div class="wp-fig" data-lead={i === 0 ? '' : undefined}>
            <span class="wp-num num" data-met={f.met === false ? 'no' : undefined}>{f.said}</span>
            <span class="wp-label">{f.label}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="wp-figs wp-row" data-many={figures.length > 2 ? '' : undefined}>
        {#each figures as f, i (i)}
          <div class="wp-fig" data-lead={i === 0 ? '' : undefined}>
            <span class="wp-num num" data-met={f.met === false ? 'no' : undefined}>{f.said}</span>
            <span class="wp-label">{f.label}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if line && size !== 'small'}
      {@const p = pathOf(line)}
      <svg class="wp-line" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
        <path class="wp-area" d={p.fill} />
        <path class="wp-stroke" d={p.stroke} vector-effect="non-scaling-stroke" />
      </svg>
    {/if}
    {#if lead === undefined}<p class="wp-empty">{sheetWords.nothingYet}</p>{/if}
  {:else if rows.length > 0}
    {#if size === 'small'}
      <!-- A COUNT LEADS ONLY WHERE THERE IS MORE THAN ONE: a lone "1" over Gold price or Next trip said nothing (audit of
           30 October, 12). One row is said as itself, its name large and its line under. -->
      <div class="wp-one">
        {#if count > 1}
          <span class="wp-num num">{count.toLocaleString('en')}</span>
          <span class="wp-first">{rows[0]!.title}</span>
        {:else if rows[0]!.amount}
          <span class="wp-num num">{rows[0]!.amount}</span>
          <span class="wp-first">{rows[0]!.title}</span>
        {:else}
          <span class="wp-solo">{rows[0]!.title}</span>
        {/if}
        {#if rows[0]!.line && !(count <= 1 && rows[0]!.amount)}<span class="wp-label">{rows[0]!.line}</span>{/if}
      </div>
    {:else}
      <ul class="wp-rows" data-two={size === 'full' ? '' : undefined}>
        {#each rows as r, i (i)}
          <li class="wp-r">
            <span class="wp-rt">{r.title}</span>
            {#if r.line}<span class="wp-rl">{r.line}</span>{/if}
            {#if r.share !== null}<span class="wp-bar" aria-hidden="true"><span style:inline-size="{Math.round(r.share * 100)}%"></span></span>{/if}
          </li>
        {/each}
      </ul>
      {#if more > 0}<span class="wp-more">{sheetWords.more(more)}</span>{/if}
    {/if}
  {/if}
</div>

<style>
  .wp {
    container-type: size;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: calc(6px * var(--dense, 1));
    inline-size: 100%;
    block-size: 100%;
    padding: var(--sp-3) calc(14px * var(--dense, 1));
    overflow: hidden;
    background: var(--tile);
    border-radius: 18px;
    color: var(--ink);
    font-family: var(--font-ui);
    text-align: start;
  }

  .wp[data-size='small'],
  .wp[data-size='tall'] {
    padding: var(--sp-3);
  }

  .wp-head {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    min-inline-size: 0;
    color: var(--ink-2);
  }

  .wp-icon {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    background: var(--well, var(--tile-2));
    border-radius: 6px;
    color: var(--ink-2);
  }

  .wp-title {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wp-tag {
    flex: none;
    padding: 1px calc(6px * var(--dense, 1));
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    letter-spacing: 0.01em;
  }

  /* AN EXAMPLE IS QUIET: its numbers are somebody's, never his. */
  .wp[data-example] .wp-figs,
  .wp[data-example] .wp-rows,
  .wp[data-example] .wp-one,
  .wp[data-example] .wp-line {
    opacity: 0.5;
  }

  .wp-figs {
    display: grid;
    gap: var(--sp-2);
    min-block-size: 0;
  }

  .wp-stack {
    align-content: end;
    flex: 1;
  }

  .wp-row {
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    align-items: end;
  }

  .wp[data-size='large'] .wp-row[data-many] {
    grid-auto-flow: row;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wp-fig {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .wp-num {
    overflow: hidden;
    font-family: var(--font-display, var(--font-ui));
    font-size: clamp(15px, 9cqi, 20px);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wp-fig[data-lead] .wp-num {
    font-size: clamp(18px, 13cqi, 30px);
  }

  .wp[data-size='wide'] .wp-fig[data-lead] .wp-num,
  .wp[data-size='full'] .wp-fig[data-lead] .wp-num {
    font-size: clamp(18px, 7cqi, 30px);
  }

  .wp-num[data-met='no'] {
    color: var(--warn, var(--red));
  }

  .wp-label {
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wp-line {
    flex: 1;
    inline-size: 100%;
    min-block-size: 18px;
    max-block-size: 48%;
    margin-block-start: auto;
    overflow: visible;
  }

  .wp-stroke {
    fill: none;
    stroke: var(--ink-2);
    stroke-linejoin: round;
    stroke-width: 1.5;
  }

  .wp-area {
    fill: var(--ink);
    opacity: 0.06;
  }

  .wp-one {
    display: grid;
    flex: 1;
    align-content: end;
    gap: 2px;
    min-inline-size: 0;
  }

  .wp-one .wp-num {
    font-size: clamp(20px, 16cqi, 30px);
  }

  .wp-first {
    display: -webkit-box;
    overflow: hidden;
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .wp-solo {
    display: -webkit-box;
    overflow: hidden;
    font-size: clamp(15px, 11cqi, 20px);
    font-weight: var(--fw-semi);
    line-height: 1.2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .wp-rows {
    display: grid;
    flex: 1 1 0;
    align-content: start;
    overflow: hidden;
    gap: calc(7px * var(--dense, 1));
    min-block-size: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .wp-rows[data-two] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--sp-4);
  }

  .wp-r {
    display: grid;
    gap: 1px;
    min-inline-size: 0;
    padding-block-end: calc(6px * var(--dense, 1));
    border-block-end: 1px solid var(--rule);
  }

  .wp-r:last-child {
    border-block-end: 0;
  }

  .wp-rt,
  .wp-rl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wp-rt {
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    line-height: 1.3;
  }

  .wp-rl {
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-variant-numeric: tabular-nums;
  }

  .wp-bar {
    display: block;
    block-size: 4px;
    margin-block-start: 3px;
    overflow: hidden;
    background: var(--rule);
    border-radius: 2px;
  }

  .wp-bar span {
    display: block;
    block-size: 100%;
    background: var(--ink-2);
    border-radius: 2px;
  }

  .wp-more {
    margin-block-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
  }

  .wp-empty {
    margin: auto 0 0;
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: 1.35;
  }

  /* WAITING ON THE RECORD: three quiet bars where the numbers will be, breathing, and still under reduced motion. */
  .wp-wait {
    display: grid;
    flex: 1;
    align-content: end;
    gap: calc(6px * var(--dense, 1));
  }

  .wp-wait span {
    display: block;
    block-size: 10px;
    background: var(--rule);
    border-radius: 5px;
    animation: wp-breathe 1.4s ease-in-out infinite;
  }

  .wp-wait span:first-child {
    inline-size: 60%;
    block-size: 18px;
  }

  .wp-wait span:nth-child(2) {
    inline-size: 80%;
  }

  .wp-wait span:nth-child(3) {
    inline-size: 45%;
  }

  @keyframes wp-breathe {
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wp-wait span {
      animation: none;
    }
  }
</style>
