<!--
  One page of a record, drawn by the product's own renderer from its dialect text.

  THE SITE DRAWS PAGES THE WAY THE PRODUCT DOES, not a picture of them: `parse(src, { page: true })` and
  then `Block`, `Markdown` or `Degraded` from `braindog-render/svelte` for each segment, over the block
  styles `@braindog/skin` ships. So a figure on the home page is the figure a record draws, and a row
  written wrong degrades to its fence here exactly as it would there.

  `tiles` DRAWS THE PAGE AS THE NEW APP DOES (the design system): each block an opaque tile with an icon well on its
  heading, and under a chart the one written line that says what it means (`reads`, by segment). The page's
  opening sentence (`note lead`) is left out, because the title row above the page says it; `leadOf` finds it.

  MONEY IS SAID AS THE APP SAYS IT, `$1,312.40 is left` and never `USD 1,312.40`: in that line, in the opening
  sentence, in a note, on a progress row (`inSymbols`) and in what an answer says. The source keeps its codes. Every
  drawer is told the plans' currency as the home (`HOME`), so a dollar is `$` there as in the copy, never `US$`.

  TWELVE COLUMNS AT 900PX AND WIDER, ONE BELOW. `layout` places a segment by its index; one it does not
  place takes its kind's `minSpan` (`page.ts`).

  `interactive` HANDS THE DRAWERS THEIR CALLBACKS, and nothing is sent anywhere. A board card moves and a
  task ticks inside the drawer that drew it, so this page has nothing to add to either. A question answered
  on a queue leaves it, and a status line says what was chosen, because the queue's drawer keeps no state.

  `source` ADDS THE PAGE AND SOURCE SWITCH, and Source is `src` as it is written. A host that draws the switch
  itself (the drawn app puts it in its title row) passes `view` instead, and this page draws no switch. `go`
  receives the links that stay inside the drawn app: a figure `links` names answers `#go:<page>` through
  `cellHref`, and a press on it calls `go` instead of moving the reader's page. The switch and the links arrive
  with the script, because neither does anything without one.
-->
<script module lang="ts">
  export type { Span } from '../examples/types.ts';
</script>

<script lang="ts">
  import '@braindog/skin/blocks.css';
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import { tick } from 'svelte';
  import { parse, type Block as Drawn, type RenderOptions, type Row, type Segment } from 'braindog-render';
  import { Block, Degraded, Markdown } from 'braindog-render/svelte';
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icons.ts';
  import Flow from './Flow.svelte';
  import { cases } from '../copy/cases.ts';
  import { GO, HOME, answerOf, goTarget, inSymbols, isLead, said as inWords, spanOf, withoutAnswered } from './page.ts';
  import type { Span } from '../examples/types.ts';

  let {
    src,
    layout = [],
    interactive = false,
    source = false,
    view,
    go,
    links,
    now,
    canvas = false,
    tiles = false,
    reads,
    settled = [],
    onanswer,
  }: {
    src: string;
    layout?: readonly Span[];
    interactive?: boolean;
    source?: boolean;
    /** The host's own switch: `source` shows the text, `page` the page, and this page draws no switch of its own. */
    view?: 'page' | 'source' | undefined;
    go?: (page: string) => void;
    /** `links[segment][cell]`: the page a figure opens, or `null`. */
    links?: Readonly<Record<number, readonly (string | null)[]>> | undefined;
    /** The clock the page is drawn against, handed to the renderer as `now`. Absent, the reader's own. */
    now?: number | undefined;
    /** Draw each plain `steps` fence as an automation's canvas (`Flow.svelte`) rather than as a list. */
    canvas?: boolean;
    /** Each block a tile with an icon well, and the page's opening sentence left to the host's title row. */
    tiles?: boolean;
    /** The line under a chart, by segment index, which says what the chart means. */
    reads?: Readonly<Record<number, string>> | undefined;
    /**
     * Questions already answered elsewhere, by id, which this page leaves out as it leaves out its own.
     * The host keeps them, so an answer outlives this component when it is drawn again.
     */
    settled?: readonly string[];
    /** Told after a question on this page is answered here, with its id and the option pressed. */
    onanswer?: ((question: string, option: string) => void) | undefined;
  } = $props();

  const w = cases.drawn;
  const segments = $derived(parse(src, { page: true }));

  /* THE QUESTIONS ANSWERED ON THIS PAGE, by id. Kept across a change of `src`, so a question asked on
     two pages of one record (a Home and its Needs you) is gone from both once it is answered on either. */
  let answered = $state<string[]>([]);
  const gone = $derived(new Set([...settled, ...answered]));
  /* What the last answer was, said on the page it was given on and on no other. */
  let said = $state<{ on: string; text: string } | null>(null);

  /* TRUE ONCE THE SCRIPT HAS RUN. Effects do not run while the page is prerendered, so the switch and the
     in-window links are drawn only where they can do something. */
  let live = $state(false);
  $effect(() => {
    live = true;
  });

  /* Source is shown for the page it was asked on, so opening another page shows that page drawn. */
  let showingFor = $state<string | null>(null);
  const own = $derived(view === undefined);
  const showing = $derived(own ? source && showingFor === src : view === 'source');

  let root: HTMLElement | null = $state(null);

  const optsFor = (at: number): RenderOptions => {
    const map = live && go ? links : undefined;
    return {
      /* The plans' currency, as `page.ts` tells its sentences: `$4,800` on a tile, never `US$4,800` beside the copy's `$`. */
      home: HOME,
      ...(now === undefined ? {} : { now }),
      ...(map
        ? {
            cellHref: (cell: number) => {
              const to = map[at]?.[cell] ?? null;
              return to === null ? null : `${GO}${to}`;
            },
          }
        : {}),
    };
  };

  /**
   * THE GLYPH ON A TILE'S HEADING, by what the block draws: a chart of figures, a trend, a goal, a run of days,
   * a list of money, a board, a question, arrivals, an automation, agents at work. From the one icon set.
   */
  const GLYPH: Record<string, IconName> = {
    stat: 'bars',
    series: 'trend-up',
    progress: 'target',
    ring: 'pie',
    heat: 'calendar',
    comparison: 'receipt',
    board: 'projects',
    queue: 'decide',
    timeline: 'inbox',
    steps: 'zap',
    cards: 'agent',
    agents: 'people',
    note: 'file',
  };
  const glyphOf = (seg: Segment): IconName => (seg.type === 'block' ? (GLYPH[seg.kind] ?? 'file') : 'file');
  /* An automation drawn as its canvas names itself in its own caption, so its tile draws no heading row of its own. */
  const drawnAsFlow = (seg: Segment): boolean => canvas && seg.type === 'block' && seg.kind === 'steps' && seg.form === undefined;
  const headed = (seg: Segment): boolean =>
    seg.type === 'block' && (seg.heading ?? '').trim() !== '' && seg.kind !== 'code' && !drawnAsFlow(seg);

  /* A board's move and a task's tick stay in the drawer that drew them (see the note above). */
  const keep = () => {};

  /**
   * ANSWER A QUESTION, AND PUT THE KEYBOARD SOMEWHERE THAT IS STILL THERE. The pressed button leaves
   * with its question, so focus goes to the page, and the status line, drawn empty from the start so it
   * is announced when it fills, says what was chosen.
   */
  async function act(block: Drawn, row: Row, option: string) {
    const id = (row.cells[1] ?? '').trim();
    if (id === '' || gone.has(id)) return;
    const { question, label } = answerOf(block, id, option);
    const word = option === 'accept' ? w.accepted : option === 'reject' ? w.rejected : w.chose(label);
    said = { on: src, text: question === '' ? word : `${word}: ${inWords(question)}` };
    answered = [...answered, id];
    onanswer?.(id, option);
    await tick();
    root?.focus();
  }

  /* ONE LISTENER FOR EVERY IN-WINDOW LINK, on the page rather than on each anchor, because the anchors
     are the renderer's and it takes no click handler. Called before SvelteKit's own, which leaves a
     click alone once it is prevented. */
  $effect(() => {
    const el = root;
    const open = go;
    if (!el || !open) return;
    const follow = (event: MouseEvent) => {
      const a = event.target instanceof Element ? event.target.closest('a') : null;
      const to = goTarget(a?.getAttribute('href') ?? null);
      if (to === null) return;
      event.preventDefault();
      open(to);
    };
    el.addEventListener('click', follow);
    return () => el.removeEventListener('click', follow);
  });

  const saying = $derived(said?.on === src ? said.text : '');
</script>

<div class="page" data-tiles={tiles ? '' : undefined} bind:this={root} tabindex="-1">
  {#if (source && own) || interactive}
    <div class="page-bar" data-empty={!(source && own && live) && saying === '' ? '' : undefined}>
      {#if interactive}<p class="said" role="status">{saying}</p>{/if}
      {#if source && own && live}
        <div class="switch" role="group" aria-label={w.view}>
          <button type="button" class="seg tap" aria-pressed={!showing} onclick={() => (showingFor = null)}>{w.page}</button>
          <button type="button" class="seg tap" aria-pressed={showing} onclick={() => (showingFor = src)}>{w.source}</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if showing}
    <pre class="source"><code>{src}</code></pre>
  {:else}
    <div class="grid">
      {#each segments as seg, at (at)}
        {#if !(tiles && isLead(seg))}
          {@const span = spanOf(seg, at, layout)}
          {@const reading = reads?.[at]}
          <div
            class="page-cell"
            class:tile-cell={tiles}
            style="--span:{span.cols}"
            data-tall={span.tall ? '' : undefined}
            data-headed={tiles && headed(seg) ? '' : undefined}
          >
            {#if tiles && headed(seg)}<span class="cell-well" aria-hidden="true"><Icon name={glyphOf(seg)} size="m" /></span>{/if}
            {#if seg.type === 'markdown'}
              <Markdown segment={seg} opts={optsFor(at)} />
            {:else if seg.type === 'degraded'}
              <Degraded segment={seg} />
            {:else if canvas && seg.kind === 'steps' && seg.form === undefined}
              <Flow block={seg} />
            {:else}
              <Block
                block={withoutAnswered(inSymbols(seg), gone)}
                opts={optsFor(at)}
                onmove={interactive ? keep : undefined}
                ontick={interactive ? keep : undefined}
                onact={interactive ? (row, option) => void act(seg, row, option) : undefined}
              />
            {/if}
            {#if tiles && reading}<p class="cell-reading">{inWords(reading)}</p>{/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .page {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .page[data-tiles] {
    gap: var(--sp-3);
  }

  /* The answer on the start side and the switch on the end, one row, so neither moves the page under it. */
  .page-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--ctl-h);
  }

  /* AN EMPTY STATUS LINE TAKES NO ROOM. It stays in the tree, so it is announced the moment it fills. */
  .page-bar[data-empty] {
    min-block-size: 0;
    margin-block-end: calc(-1 * var(--sp-3));
  }

  /* A TWO-WAY SWITCH, ONE FLAT RECTANGLE: the second rule's fill, which shows on the page and on a
     paper card alike, with no edge and no shadow, radius 8. The chosen half is the tile's own fill in the full ink
     and a heavier weight, so it reads by more than colour. */
  .switch {
    display: inline-flex;
    gap: 2px;
    margin-inline-start: auto;
    padding: 3px;
    border-radius: 8px;
    background: var(--rule);
  }

  .seg {
    min-block-size: var(--ctl-h-sm);
    padding-inline: 14px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
  }

  .seg[aria-pressed='true'] {
    background: var(--tile);
    color: var(--ink);
    font-weight: 600;
  }

  .said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* THE SOURCE WRAPS INSIDE ITS COLUMN rather than scrolling sideways, as a degraded fence does, so a
     long row never pushes a phone page wider than the phone. It is content, so it sits in a tile. */
  .source {
    margin: 0;
    padding: 20px;
    border-radius: var(--r-tile);
    background: var(--tile);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-cap);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: start;
  }

  .page[data-tiles] .grid {
    gap: var(--inset);
    align-items: stretch;
  }

  /* NOT `.cell`, which is the renderer's name for a stat tile and would put two things under one name. */
  .page-cell {
    min-inline-size: 0;
  }

  /* ── A block as a tile (the design system) ─────────────────────────────────────── */

  .tile-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: 20px;
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  /* The renderer's own spacing under a block belongs to a page of blocks; in a tile the tile's padding is it. */
  .tile-cell :global(.block) {
    margin: 0;
  }

  /* THE HEADING ROW: the well drawn here, and the renderer's own caption beside it as the tile's title, so the
     figure keeps the name its caption gives it. */
  .cell-well {
    position: absolute;
    inset-block-start: 20px;
    inset-inline-start: 20px;
    display: grid;
    place-items: center;
    inline-size: var(--well);
    block-size: var(--well);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .tile-cell[data-headed] :global(.block-head) {
    align-items: center;
    min-block-size: var(--well);
    margin-block-end: var(--sp-3);
    padding-inline-start: calc(var(--well) + 10px);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .cell-reading {
    margin: auto 0 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
    text-wrap: pretty;
  }

  @media (width >= 900px) {
    .grid {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .page-cell {
      grid-column: span var(--span);
    }

    .page-cell[data-tall] {
      grid-row: span 2;
    }
  }
</style>
