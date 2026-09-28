<!--
  One page of a record, drawn by the product's own renderer from its dialect text.

  THE SITE DRAWS PAGES THE WAY THE PRODUCT DOES, not a picture of them: `parse(src, { page: true })` and
  then `Block`, `Markdown` or `Degraded` from `braindog-render/svelte` for each segment, over the block
  styles `@braindog/skin` ships. So a figure on the home page is the figure a record draws, and a row
  written wrong degrades to its fence here exactly as it would there.

  TWELVE COLUMNS AT 900PX AND WIDER, ONE BELOW. `layout` places a segment by its index; one it does not
  place takes its kind's `minSpan` (`page.ts`).

  `interactive` HANDS THE DRAWERS THEIR CALLBACKS, and nothing is sent anywhere. A board card moves and a
  task ticks inside the drawer that drew it, which keeps its own marks until the rows are drawn again,
  so this page has nothing to add to either. A question answered on a queue leaves it, and a status line
  says what was chosen, because the queue's drawer keeps no state of its own.

  `source` ADDS THE PAGE AND SOURCE SWITCH, and Source is `src` as it is written. `go` receives the links
  that stay inside the drawn app: a figure `links` names answers `#go:<page>` through `cellHref`, and a
  press on it calls `go` instead of moving the reader's page. The switch and the links arrive with the
  script, because neither does anything without one, and a prerendered page with no script shows each
  page as drawn.
-->
<script module lang="ts">
  export type { Span } from '../examples/types.ts';
</script>

<script lang="ts">
  import '@braindog/skin/blocks.css';
  import '@braindog/skin/blocks-charts.css';
  import { tick } from 'svelte';
  import { parse, type Block as Drawn, type RenderOptions, type Row } from 'braindog-render';
  import { Block, Degraded, Markdown } from 'braindog-render/svelte';
  import Flow from './Flow.svelte';
  import { cases } from '../copy/cases.ts';
  import { GO, answerOf, goTarget, spanOf, withoutAnswered } from './page.ts';
  import type { Span } from '../examples/types.ts';

  let {
    src,
    layout = [],
    interactive = false,
    source = false,
    go,
    links,
    now,
    canvas = false,
    settled = [],
    onanswer,
  }: {
    src: string;
    layout?: readonly Span[];
    interactive?: boolean;
    source?: boolean;
    go?: (page: string) => void;
    /** `links[segment][cell]`: the page a figure opens, or `null`. */
    links?: Readonly<Record<number, readonly (string | null)[]>> | undefined;
    /** The clock the page is drawn against, handed to the renderer as `now`. Absent, the reader's own. */
    now?: number | undefined;
    /** Draw each plain `steps` fence as an automation's canvas (`Flow.svelte`) rather than as a list. */
    canvas?: boolean;
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
     two pages of one record (a Home and its Decide) is gone from both once it is answered on either. */
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
  const showing = $derived(source && showingFor === src);

  let root: HTMLElement | null = $state(null);

  const optsFor = (at: number): RenderOptions => {
    const map = live && go ? links : undefined;
    return {
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
    said = { on: src, text: question === '' ? word : `${word}: ${question}` };
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
</script>

<div class="page" bind:this={root} tabindex="-1">
  {#if source || interactive}
    <div class="page-bar">
      {#if interactive}<p class="said" role="status">{said?.on === src ? said.text : ''}</p>{/if}
      {#if source && live}
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
        {@const span = spanOf(seg, at, layout)}
        <div class="page-cell" style="--span:{span.cols}" data-tall={span.tall ? '' : undefined}>
          {#if seg.type === 'markdown'}
            <Markdown segment={seg} opts={optsFor(at)} />
          {:else if seg.type === 'degraded'}
            <Degraded segment={seg} />
          {:else if canvas && seg.kind === 'steps' && seg.form === undefined}
            <Flow block={seg} />
          {:else}
            <Block
              block={withoutAnswered(seg, gone)}
              opts={optsFor(at)}
              onmove={interactive ? keep : undefined}
              ontick={interactive ? keep : undefined}
              onact={interactive ? (row, option) => void act(seg, row, option) : undefined}
            />
          {/if}
        </div>
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

  /* The answer on the start side and the switch on the end, one row, so neither moves the page under it. */
  .page-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--ctl-h);
  }

  .switch {
    margin-inline-start: auto;
  }

  /* A two-way segmented switch, the product's shape for a pair: the chosen half raised on the well. */
  .switch {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--sunk);
  }

  .seg {
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-3);
    border: 0;
    border-radius: var(--r-sm);
    background: none;
    color: var(--dim);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .seg[aria-pressed='true'] {
    background: var(--bg);
    color: var(--ink);
    box-shadow: var(--e1);
  }

  .said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* THE SOURCE WRAPS INSIDE ITS COLUMN rather than scrolling sideways, as a degraded fence does, so a
     long row never pushes a phone page wider than the phone. */
  .source {
    margin: 0;
    padding: var(--sp-4);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    background: var(--sunk);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
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

  /* NOT `.cell`, which is the renderer's name for a stat tile and would put two things under one name. */
  .page-cell {
    min-inline-size: 0;
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
