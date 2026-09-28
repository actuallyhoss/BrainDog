<!--
  `/packs/<id>`: one pack, as a stranger weighs it before installing.

  THE DRAWING IS THE PRODUCT'S. A version the catalogue made a preview for is drawn page by page from that
  preview's answers, and one with none is drawn as what it adds, both through `lib/app/Page.svelte` and the
  renderer the app uses. So a list here has the columns the installed page has, and nothing on this page
  is a picture somebody made of it.

  INSTALL GOES TO THE APP (`/app/packs/browse/<id>`), which shows the plan and asks before it writes, so
  the link carries `rel="external"`: the prerender crawler must not follow it into the app.

  THE PREVIEW AND THE FACTS SIT SIDE BY SIDE AT 900PX AND WIDER, and stack below it with the drawing first,
  because the drawing is what the reader came to see.
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

  /* EVERY SEGMENT THE FULL WIDTH OF ITS SHEET. Left to its kind's `minSpan`, a list would take half of a
     column that is already two thirds of the page, and its columns would crowd for no reason. */
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

<section class="pack-head" data-ground="page" aria-labelledby="pack-h1">
  <div class="in">
    <a class="back" href={PACKS}><Icon name="back" size="s" />{d.back}</a>
    <div class="title-row">
      <span class="glyph"><Icon name={card.glyph} size="l" /></span>
      <h1 class="pack-title" id="pack-h1">{card.title}</h1>
    </div>
    <p class="lede">{card.summary}</p>
    <p class="meta">
      <span>{w.by(card.publisher)}</span>
      <span class="num">{w.version(card.version)}</span>
      {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
    </p>
    <div class="install">
      <a class="btn btn-primary" href={data.install} rel="external">{d.install}</a>
      <p class="install-note">{LAUNCH.signup ? d.installNote : d.installNoteSoon}</p>
    </div>
  </div>
</section>

<section class="pack-body" data-ground="page">
  <div class="in layout">
    <div class="drawing">
      {#if data.pages}
        <h2 class="h3" id="drawing-title">{d.preview}</h2>
        <p class="note">{d.previewNote}</p>
        {#each data.pages as p, i (i)}
          <figure class="frame sheet" aria-labelledby="page-{i}">
            <h3 class="sheet-title" id="page-{i}">{p.title}</h3>
            <Page src={p.src} layout={wide(p.src)} {now} />
          </figure>
        {/each}
      {:else}
        <h2 class="h3" id="drawing-title">{d.adds}</h2>
        <p class="note">{d.addsNote}</p>
        <div class="frame sheet">
          <Page src={data.adds} layout={wide(data.adds)} />
        </div>
      {/if}
    </div>

    <aside class="facts" aria-labelledby="facts-title">
      <h2 class="h3" id="facts-title">{d.facts}</h2>
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
                {#each data.hosts as host (host)}<li class="host">{host}</li>{/each}
              </ul>
            {:else}
              {d.noHosts}
            {/if}
          </dd>
        </div>
      </dl>

      <h2 class="h3" id="versions-title">{d.versions}</h2>
      <ol class="versions" aria-labelledby="versions-title">
        {#each data.versions as v (v.version)}
          <li class="version">
            <p class="version-head"><span class="num version-name">{v.version}</span><span class="version-day">{v.day}</span></p>
            {#if v.withdrawn !== null}
              <p class="version-said withdrawn">{d.withdrawn(v.withdrawn)}</p>
            {:else if v.change !== ''}
              <p class="version-said">{v.change}</p>
            {/if}
          </li>
        {/each}
      </ol>
    </aside>
  </div>
</section>

<style>
  .pack-head {
    padding-block: clamp(32px, 5vw, 72px) var(--sp-6);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    margin-block-end: var(--sp-4);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .glyph {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 56px;
    block-size: 56px;
    border-radius: var(--r-lg);
    background: var(--sunk);
    color: var(--ink);
  }

  .pack-title {
    margin: 0;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--t-site-h2);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
  }

  .pack-head .lede {
    margin-block-start: var(--sp-4);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .install {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3) var(--sp-4);
    margin-block-start: var(--sp-5);
  }

  .install-note {
    margin: 0;
    max-inline-size: 48ch;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .pack-body {
    padding-block: var(--sp-6) clamp(56px, 7vw, 104px);
  }

  .layout {
    display: grid;
    gap: var(--sp-8);
  }

  .drawing,
  .facts {
    display: grid;
    align-content: start;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .h3 {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-h3);
    font-weight: 600;
  }

  .note {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A WIDE LIST SCROLLS INSIDE ITS OWN SHEET, never the page, at any width. */
  .sheet {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: var(--sp-5);
    min-inline-size: 0;
    overflow-x: auto;
  }

  .sheet-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .fact-list {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
  }

  .fact {
    display: grid;
    gap: 2px;
    padding-block-end: var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
  }

  .fact dt {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    overflow-wrap: anywhere;
  }

  .hosts {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .host {
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .versions {
    display: grid;
    gap: var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .version {
    display: grid;
    gap: 2px;
    padding-inline-start: var(--sp-4);
    border-inline-start: 2px solid var(--line);
  }

  .version-head {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
  }

  .version-name {
    color: var(--ink);
    font-weight: 600;
  }

  .version-day {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .version-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  /* A withdrawn version is said in words; red is for what failed, and nothing here did. */
  .withdrawn {
    font-style: italic;
  }

  @media (hover: hover) and (pointer: fine) {
    .back:hover {
      color: var(--ink);
    }
  }

  @media (width >= 900px) {
    .layout {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      align-items: start;
    }
  }
</style>
