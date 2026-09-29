<!--
  `/packs/<id>`: one pack, as a stranger weighs it before installing.

  TWO BANDS OF TILES. The first is the opening tile (the pack's name on its icon well, what it is, who made it, and
  Install as the one ink pill) beside the facts tile. The second is the drawing, a tile a page, beside the versions.

  THE DRAWING IS THE PRODUCT'S. A version the catalogue made a preview for is drawn page by page from that preview's
  answers, and one with none is drawn as what it adds, both through `lib/app/Page.svelte` and the renderer the app
  uses. So a list here has the columns the installed page has, and nothing on this page is a picture somebody made.

  INSTALL GOES TO THE APP (`/app/packs/browse/<id>`), which shows the plan and asks before it writes, so the link
  carries `rel="external"`: the prerender crawler must not follow it into the app.

  BELOW 900PX THE TILES STACK with the drawing before the versions, because the drawing is what the reader came to see.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import { parse } from 'braindog-render';
  import Page from '$lib/app/Page.svelte';
  import type { Span } from '$lib/examples/types.ts';
  import { LAUNCH } from '$lib/launch.ts';
  import { PACKS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = packs.packs;
  const d = w.detail;

  const card = $derived(data.card);
  const now = $derived(data.now ?? undefined);

  /* EVERY SEGMENT THE FULL WIDTH OF ITS TILE. Left to its kind's `minSpan`, a list would take half of a tile that is
     already two thirds of the page, and its columns would crowd for no reason. */
  const wide = (src: string): Span[] => parse(src, { page: true }).map((_, at) => ({ at, cols: 12 }));
</script>

<svelte:head>
  <title>{card.title} · {w.title}</title>
  <meta name="description" content={card.summary} />
  <link rel="canonical" href="https://brain.dog/packs/{card.slug}" />
  <meta property="og:url" content="https://brain.dog/packs/{card.slug}" />
  <meta property="og:title" content="{card.title} · {w.title}" />
  <meta property="og:description" content={card.summary} />
</svelte:head>

<section class="band" aria-labelledby="pack-h1">
  <div class="in">
    <a class="back" href={PACKS}><Icon name="back" size="m" />{d.back}</a>
    <div class="tiles">
      <div class="tile lead span-8 opening">
        <div class="title-row">
          <span class="well l"><Icon name={card.glyph} size="m" /></span>
          <h1 class="h2 pack-title" id="pack-h1">{card.title}</h1>
        </div>
        <p class="lede">{card.summary}</p>
        {#if card.adds.length}
          <ul class="adds">
            {#each card.adds as add (add)}<li class="chip">{add}</li>{/each}
          </ul>
        {/if}
        <p class="meta-row">
          <span>{w.by(card.publisher)}</span>
          <span class="num">{w.version(card.version)}</span>
          {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
        </p>
        <div class="install">
          <a class="btn btn-primary btn-lg" href={data.install} rel="external">{d.install}<Icon name="arrow" size="m" /></a>
          <p class="install-note">{LAUNCH.signup ? d.installNote : d.installNoteSoon}</p>
        </div>
      </div>

      <aside class="tile span-4 facts" aria-labelledby="facts-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="box" size="m" /></span>
          <span class="tile-title" id="facts-title">{d.facts}</span>
        </h2>
        <dl class="fact-list">
          <div class="fact">
            <dt>{d.publisher}</dt>
            <dd>{card.publisher}</dd>
          </div>
          {#if data.licence !== ''}
            <div class="fact">
              <dt>{d.licence}</dt>
              <dd>{data.licence}</dd>
            </div>
          {/if}
          <div class="fact">
            <dt>{d.latest}</dt>
            <dd class="num">{card.version}</dd>
          </div>
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
      </aside>
    </div>
  </div>
</section>

<section class="band" aria-labelledby="drawing-title">
  <div class="in">
    <div class="tiles">
      <div class="span-8 drawing">
        <div class="drawing-head">
          <h2 class="h3" id="drawing-title">{data.pages ? d.preview : d.adds}</h2>
          <p class="note">{data.pages ? d.previewNote : d.addsNote}</p>
        </div>
        {#if data.pages}
          {#each data.pages as p, i (i)}
            <figure class="tile sheet" aria-labelledby="page-{i}">
              <h3 class="tile-head">
                <span class="well"><Icon name="file" size="m" /></span>
                <span class="tile-title" id="page-{i}">{p.title}</span>
              </h3>
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

      <section class="tile span-4 versions-tile" aria-labelledby="versions-title">
        <h2 class="tile-head">
          <span class="well"><Icon name="branch" size="m" /></span>
          <span class="tile-title" id="versions-title">{d.versions}</span>
          <span class="tile-count num">{data.versions.length}</span>
        </h2>
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
  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    margin-block-end: var(--sp-2);
    padding-inline: var(--sp-3);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 500;
    text-decoration: none;
  }

  /* ── The opening tile ─────────────────────────────────────────────────── */

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .pack-title {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .opening .lede {
    margin-block-start: calc(-1 * var(--sp-2));
  }

  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .adds .chip {
    max-inline-size: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .install {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3) var(--sp-4);
    margin-block-start: auto;
  }

  .install-note {
    margin: 0;
    max-inline-size: 48ch;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  /* ── The facts tile ───────────────────────────────────────────────────── */

  .facts .tile-head,
  .versions-tile .tile-head,
  .sheet .tile-head {
    font-size: inherit;
    font-weight: inherit;
  }

  .fact-list {
    display: grid;
    margin: 0;
  }

  .fact {
    display: grid;
    gap: 2px;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  .fact:first-child {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .fact dt {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
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
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-site-small);
  }

  /* ── The drawing ──────────────────────────────────────────────────────── */

  /* A column of tiles, not a tile: the heading sits on the ground above the pages it names. */
  .drawing {
    display: grid;
    align-content: start;
    gap: var(--inset);
  }

  .drawing-head {
    display: grid;
    gap: 4px;
    padding: var(--sp-2) var(--sp-1) var(--sp-1);
  }

  .note {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
  }

  .sheet {
    margin: 0;
  }

  /* A WIDE LIST SCROLLS INSIDE ITS OWN TILE, never the page, at any width. */
  .sheet-body {
    min-inline-size: 0;
    overflow-x: auto;
  }

  /* ── The versions: a line of dots, newest first, the latest in ink ────── */

  .versions {
    position: relative;
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .version {
    position: relative;
    display: grid;
    gap: 2px;
    padding-inline-start: var(--sp-5);
  }

  /* The line joining each dot to the next, drawn as each row's own edge. */
  .version:not(:last-child)::before {
    content: '';
    position: absolute;
    inset-block: 14px calc(-1 * var(--sp-4));
    inset-inline-start: 4px;
    border-inline-start: 2px solid var(--line);
  }

  .dot {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-start: 0;
    inline-size: 10px;
    block-size: 10px;
    border: 2px solid var(--dim);
    border-radius: var(--r-pill);
    background: var(--bg);
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
    column-gap: var(--sp-3);
    margin: 0;
  }

  .version-name {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .version-day {
    color: var(--dim);
    font-size: var(--t-site-small);
  }

  .version-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    line-height: 20px;
  }

  /* A withdrawn version is said in words, with a hollow dot; red is for what needs you, and nothing here does. */
  .withdrawn {
    font-style: italic;
  }

  .version[data-withdrawn] .dot {
    border-style: dashed;
  }

  @media (hover: hover) and (pointer: fine) {
    .back:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }
</style>
