<!--
  `/addons/<id>`: one add-on, as a stranger weighs it before adding it.

  THE SITE'S DESIGN: the night head holds the way back, the add-on's name and its one line, who made it (a link to all
  of theirs), how far it was checked and how many hold it, and "Add to BrainDog" as the page's one red. Under it, on the
  board's ground, first what it asks for of yours, because that is the decision, then the drawing of what it adds
  beside three tiles: what it brings by name, who made it, and its versions.

  THE DRAWING IS THE PRODUCT'S. A version the catalogue made a preview for is drawn page by page from that preview's
  answers, and one with none is drawn as what it adds, both through `lib/app/Page.svelte` and the renderer the app
  uses. So a list here has the columns the added page has, and nothing on this page is a picture somebody made.

  ADDING GOES TO THE APP (`app.brain.dog/addons/<id>`), which shows the plan and asks before it writes, so the link
  carries `rel="external"`: the prerender crawler must not follow it into the app.

  BELOW 1060PX THE TILES STACK with the drawing first, because the drawing is what the reader came to see.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { parse } from 'braindog-render';
  import Page from '$lib/app/Page.svelte';
  import type { Span } from '$lib/examples/types.ts';
  import { LAUNCH } from '$lib/launch.ts';
  import { ADDONS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import PageHead from '$lib/site/PageHead.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = packs.packs;
  const d = w.detail;

  const card = $derived(data.card);
  const now = $derived(data.now ?? undefined);
  const b = $derived(data.brings);
  const nothing = $derived(b.listCount === 0 && b.pageCount === 0 && b.rules === 0 && b.examples === 0);

  /* A NAMED LIST OR PAGE BY ITS NAMES, or by its count when a template names none. */
  const said = (names: readonly string[], count: number, counted: (n: number) => string): string =>
    names.length > 0 ? names.join(', ') : counted(count);

  /* EVERY SEGMENT THE FULL WIDTH OF ITS TILE. Left to its kind's `minSpan`, a list would take half of a tile that is
     already two thirds of the page, and its columns would crowd for no reason. */
  const wide = (src: string): Span[] => parse(src, { page: true }).map((_, at) => ({ at, cols: 12 }));
</script>

<Seo title={d.title(card.title)} description={card.summary} path="{ADDONS}/{card.slug}" />
{#snippet back()}
  <a class="back" href={ADDONS}><Icon name="back" size="m" />{d.back}</a>
{/snippet}

<PageHead title={card.title} lead={card.summary} before={back}>
  <p class="meta-row">
    <span class="tag">{w.kind[card.kind]}</span>
    {#if card.ours}
      <a class="maker" href="{ADDONS}/by/{card.who}"><Mark height={14} tone="inherit" />{w.ours}</a>
    {:else}
      <a class="maker" href="{ADDONS}/by/{card.who}">{w.by(card.publisher)}</a>
      <span class="tag">{w.trust[card.trust]}</span>
    {/if}
    {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
  </p>
  <div class="install">
    <a class="btn red" href={data.install} rel="external">{d.install}<Icon name="arrow" size="m" /></a>
    <p class="install-note">{LAUNCH.signup ? d.installNote : d.installNoteSoon}</p>
  </div>
</PageHead>

<section class="board" aria-labelledby="drawing-title">
  <div class="wrap layout">
    <section class="tile asks" aria-labelledby="asks-title">
      <div class="asks-head">
        <h2 class="tile-h" id="asks-title">{d.asks}</h2>
        <p class="note">{d.asksNote}</p>
      </div>
      {#if data.asks.length}
        <ul class="ask-lines">
          {#each data.asks as line (line)}<li><Icon name="check" size="s" /><span>{line}</span></li>{/each}
        </ul>
      {:else}
        <p class="plain">{d.asksNothing}</p>
      {/if}
    </section>

    <div class="drawing">
      <div class="drawing-head">
        <h2 class="drawing-title" id="drawing-title">{data.pages ? d.preview : d.adds}</h2>
        <p class="note">{data.pages ? d.previewNote : d.addsNote}</p>
      </div>
      {#if data.pages}
        {#each data.pages as p, i (i)}
          <figure class="tile sheet" aria-labelledby="page-{i}">
            <figcaption class="sheet-head">
              <span class="icon-well"><Icon name="file" size="m" /></span>
              <span class="sheet-title" id="page-{i}">{p.title}</span>
            </figcaption>
            <div class="sheet-body">
              <Page src={p.src} layout={wide(p.src)} {now} />
            </div>
          </figure>
        {/each}
      {:else}
        <div class="tile sheet">
          <div class="sheet-body">
            <Page src={data.adds} layout={wide(data.adds)} />
          </div>
        </div>
      {/if}
    </div>

    <div class="side">
      <section class="tile" aria-labelledby="brings-title">
        <h2 class="tile-h" id="brings-title">{d.brings}</h2>
        {#if nothing}
          <p class="plain">{d.addsNothing}</p>
        {/if}
        <dl class="facts">
          {#if b.listCount > 0}
            <div class="fact"><dt>{d.addsLists}</dt><dd>{said(b.lists, b.listCount, w.lists)}</dd></div>
          {/if}
          {#if b.pageCount > 0}
            <div class="fact"><dt>{d.addsPages}</dt><dd>{said(b.pages, b.pageCount, w.pages)}</dd></div>
          {/if}
          {#if b.rules > 0}
            <div class="fact"><dt>{d.addsRules}</dt><dd>{d.ruleCount(b.rules)}</dd></div>
          {/if}
          {#if b.examples > 0}
            <div class="fact"><dt>{d.addsExamples}</dt><dd>{d.exampleCount(b.examples)}</dd></div>
          {/if}
          <div class="fact">
            <dt>{d.hosts}</dt>
            <dd>
              {#if data.hosts.length}
                <ul class="hosts">
                  {#each data.hosts as host (host)}<li class="host"><Icon name="globe" size="s" />{host}</li>{/each}
                </ul>
              {:else}
                {d.noHosts}
              {/if}
            </dd>
          </div>
        </dl>
      </section>

      <section class="tile" aria-labelledby="facts-title">
        <h2 class="tile-h" id="facts-title">{d.facts}</h2>
        <dl class="facts">
          <div class="fact">
            <dt>{d.publisher}</dt>
            <dd class="maker">{#if card.ours}<Mark height={14} tone="inherit" />{/if}{card.publisher}</dd>
          </div>
          <div class="fact"><dt>{d.trust}</dt><dd>{w.trust[card.trust]}</dd></div>
          {#if data.licence !== ''}
            <div class="fact"><dt>{d.licence}</dt><dd>{data.licence}</dd></div>
          {/if}
          <div class="fact"><dt>{d.latest}</dt><dd class="num">{card.version}</dd></div>
        </dl>
        <a class="more-by" href="{ADDONS}/by/{card.who}">{d.moreBy(card.publisher)}<Icon name="arrow" size="s" /></a>
      </section>

      <section class="tile" aria-labelledby="versions-title">
        <h2 class="tile-h" id="versions-title">{d.versions}<span class="count num">{data.versions.length}</span></h2>
        <ol class="versions" aria-labelledby="versions-title">
          {#each data.versions as v, i (v.version)}
            <li class="version" data-latest={i === 0 ? '' : undefined} data-withdrawn={v.withdrawn !== null ? '' : undefined}>
              <span class="dot" aria-hidden="true"></span>
              <p class="version-head"><span class="num version-name">{v.version}</span><span class="version-day">{v.day}</span></p>
              {#if v.withdrawn !== null}
                <p class="version-said withdrawn">{d.withdrawn(v.withdrawn)}</p>
              {:else if v.change !== ''}
                <p class="version-said">{v.change}</p>
              {/if}
            </li>
          {/each}
        </ol>
      </section>
    </div>
  </div>
</section>

<style>
  /* ── The head, on the night ground ─────────────────────────────────────── */

  .back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-block-size: var(--tap);
    margin-block-end: 20px;
    color: var(--on-night-2);
    font-size: var(--t-site-15);
    font-weight: 500;
    text-decoration: none;
  }

  .back:hover {
    color: var(--on-night);
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 20px;
    margin: 24px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-site-15);
  }

  /* WHAT IT IS, as a quiet pill in the night's second fill: a word, never a colour. */
  .tag {
    display: inline-flex;
    align-items: center;
    min-block-size: 28px;
    padding-inline: 12px;
    border-radius: 999px;
    background: var(--night-2);
    box-shadow: inset 0 0 0 1px var(--night-rule);
    color: var(--on-night);
    font-size: var(--t-site-14);
    font-weight: 500;
  }

  .maker {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  a.maker {
    min-block-size: var(--tap);
    color: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
    text-underline-offset: 3px;
  }

  a.maker:hover {
    color: var(--on-night);
  }

  .install {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    margin-block-start: 32px;
  }

  .install-note {
    margin: 0;
    max-inline-size: 36ch;
    color: var(--on-night-2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  /* ── The board ─────────────────────────────────────────────────────────── */

  .board {
    padding-block: 56px 96px;
    background: var(--board);
  }

  /* THE DRAWING IN EIGHT COLUMNS AND THE TILES IN FOUR at a desk; one column, drawing first, under 1060. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  .drawing,
  .side {
    display: grid;
    align-content: start;
    gap: 16px;
    min-inline-size: 0;
  }

  .drawing-head {
    display: grid;
    gap: 6px;
    padding-block-end: 8px;
  }

  .drawing-title {
    font-size: var(--t-site-28);
    line-height: 1.1;
    letter-spacing: -0.024em;
  }

  .note {
    margin: 0;
    max-inline-size: 52em;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  /* A TILE: the site's solid card (`.tile` in `app.css`), its padding and gap set here. */
  .tile {
    gap: 16px;
    padding: 24px;
    border-radius: var(--r-tile);
  }

  /* ── What it asks for of yours: the decision, across the whole board ─────── */

  .asks {
    display: grid;
  }

  .asks-head {
    display: grid;
    gap: 6px;
  }

  .ask-lines {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ask-lines li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    color: var(--ink);
    font-size: var(--t-site-15);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .ask-lines :global(svg) {
    flex: none;
    margin-block-start: 3px;
    color: var(--ink2);
  }

  .more-by {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-site-15);
    font-weight: 500;
    text-decoration: none;
  }

  .more-by:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .sheet {
    margin: 0;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .icon-well {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    border-radius: 8px;
    background: var(--board);
    color: var(--ink2);
  }

  .sheet-title {
    color: var(--ink);
    font: 600 var(--t-site-17) / 1.2 var(--head);
    letter-spacing: -0.02em;
  }

  /* A WIDE LIST SCROLLS INSIDE ITS OWN TILE, never the page, at any width. */
  .sheet-body {
    min-inline-size: 0;
    overflow-x: auto;
  }

  .tile-h {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: var(--t-site-21);
    line-height: 1.2;
    letter-spacing: -0.021em;
  }

  .count {
    color: var(--muted);
    font-family: var(--ui);
    font-size: var(--t-site-15);
    font-weight: 500;
    letter-spacing: 0;
  }

  .plain {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  /* ── Facts: a label over its value, a hairline between ───────────────── */

  .facts {
    display: grid;
    margin: 0;
  }

  .fact {
    display: grid;
    gap: 2px;
    padding-block: 12px;
    border-block-start: 1px solid var(--rule);
  }

  .fact:first-child {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .fact dt {
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-15);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .hosts {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .host {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: var(--t-site-14);
  }

  /* ── The versions: a line of dots, newest first, the latest filled ─────── */

  .versions {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .version {
    position: relative;
    display: grid;
    gap: 2px;
    padding-inline-start: 24px;
  }

  /* The line joining each dot to the next, drawn as each row's own edge. */
  .version:not(:last-child)::before {
    content: '';
    position: absolute;
    inset-block: 14px -16px;
    inset-inline-start: 4px;
    border-inline-start: 2px solid var(--rule);
  }

  .dot {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-start: 0;
    inline-size: 10px;
    block-size: 10px;
    border: 2px solid var(--muted);
    border-radius: 50%;
    background: var(--tile);
    box-sizing: border-box;
  }

  .version[data-latest] .dot {
    border-color: var(--ink);
    background: var(--ink);
  }

  .version-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 12px;
    margin: 0;
  }

  .version-name {
    color: var(--ink);
    font-size: var(--t-site-15);
    font-weight: 600;
  }

  .version-day {
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .version-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-14);
    line-height: 1.5;
  }

  /* A withdrawn version is said in words, with a hollow dashed dot: no colour, nothing here needs anyone. */
  .withdrawn {
    font-style: italic;
  }

  .version[data-withdrawn] .dot {
    border-style: dashed;
  }

  @media (width >= 1060px) {
    .layout {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }

    .asks {
      grid-column: 1 / -1;
    }

    /* TWO COLUMNS OF LINES when there are enough to fill them, so the decision stays one short read. */
    .ask-lines {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 32px;
    }
  }

  @media (max-width: 760px) {
    .install .btn {
      inline-size: 100%;
    }

    .board {
      padding-block: 32px 64px;
    }

    .tile {
      padding: 20px;
    }

    .drawing-title {
      font-size: var(--t-site-24);
    }
  }
</style>
