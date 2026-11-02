<!--
  `/packs`: the add-on store as a stranger sees it. Every public listing as a card, a search, and the categories as one
  segmented control.

  THE SITE'S DESIGN: the night head with the search in its slot, then the store on the board's ground with
  the categories over the cards, then a night band that says anybody can make one and points at the docs, and the
  early access strip. Two neighbours never share a ground in either scheme.

  EVERY CARD IS IN THE HTML. The load hands the page every public card at build time, so the page reads whole with
  scripting off; the search and the control narrow what is drawn once the script runs, and nothing is fetched to do it.

  A CARD SAYS WHAT A STRANGER WEIGHS: its name, one line, what it brings, who made it and how many hold it when the
  Kennel counted ten or more. "Made by BrainDog" is drawn only where the catalogue says BrainDog published it.

  THE WHOLE CARD IS THE TARGET, through its title's link stretched over it, so a screen reader hears the title as the
  link's name rather than every word on the card.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { PACKS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import { filtersOf, matches, type Category } from '$lib/packs/catalogue.ts';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const w = packs.packs;
  const m = w.make;

  let query = $state('');
  let picked = $state<Category | null>(null);

  const filters = $derived(filtersOf(data.cards));
  const shown = $derived(data.cards.filter((c) => (picked === null || c.categories.includes(picked)) && matches(c, query)));
  const allOurs = $derived(data.cards.length > 0 && data.cards.every((c) => c.ours));

  function showAll() {
    query = '';
    picked = null;
  }
</script>

<Seo title={w.meta.title} description={w.meta.description} path="/packs" />
<PageHead title={w.title} lead={w.lede}>
  {#if data.cards.length > 0}
    <div class="head-search" role="search">
      <label class="search">
        <span class="sr">{w.search}</span>
        <span class="field">
          <Icon name="search" size="m" />
          <input type="search" bind:value={query} placeholder={w.searchHint} autocomplete="off" spellcheck="false" />
        </span>
      </label>
      {#if allOurs}<p class="ours-all"><Mark height={14} tone="inherit" />{w.allOurs}</p>{/if}
    </div>
  {/if}
</PageHead>

<!-- No name of its own: the head above is the region the page title names. -->
<section class="store">
  <div class="wrap">
    {#if data.cards.length === 0}
      <p class="none">{w.none}</p>
    {:else}
      <div class="bar">
        <!-- ONE SEGMENTED CONTROL, one category at a time. On a phone it scrolls inside its own track. -->
        <div class="track" role="group" aria-label={w.filters}>
          <button type="button" class="seg" aria-pressed={picked === null} onclick={() => (picked = null)}>
            {w.all}<span class="seg-n num">{data.cards.length}</span>
          </button>
          {#each filters as f (f.category)}
            <button type="button" class="seg" aria-pressed={picked === f.category} onclick={() => (picked = f.category)}>
              {f.name}<span class="seg-n num">{f.count}</span>
            </button>
          {/each}
        </div>
        <p class="shown" role="status">{w.shown(shown.length)}</p>
      </div>

      {#if shown.length === 0}
        <div class="no-match">
          <p>{w.noMatch}</p>
          <button type="button" class="btn line" onclick={showAll}>{w.showAll}</button>
        </div>
      {:else}
        <ul class="cards">
          {#each shown as card (card.slug)}
            <li class="addon">
              <div class="card-top">
                <span class="icon-well"><Icon name={card.glyph} size="m" /></span>
                <span class="kind">{w.kind[card.kind]}</span>
              </div>
              <h2 class="name"><a class="card-link" href="{PACKS}/{card.slug}">{card.title}</a></h2>
              <p class="summary">{card.summary}</p>
              <p class="brings">{card.adds.length ? card.adds.join(' · ') : w.worksOn}</p>
              <p class="foot">
                {#if card.ours}
                  <span class="maker"><Mark height={13} tone="inherit" />{w.ours}</span>
                {:else}
                  <span class="maker">{w.by(card.publisher)}</span>
                {/if}
                {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</section>

<section class="section make" aria-labelledby="make-title">
  <div class="wrap make-cols">
    <div class="make-say">
      <h2 id="make-title" class="h2">{m.title}</h2>
      <p class="lede">{m.say}</p>
      <p class="make-go">
        <a class="btn" href={m.firstHref}>{m.first}<Icon name="arrow-right" size="m" /></a>
        <a class="onward" href={m.publishHref}>{m.publish}<Icon name="arrow-right" size="s" /></a>
      </p>
    </div>
    <figure class="term">
      <figcaption class="term-hd">{m.terminal}</figcaption>
      <pre class="term-body"><code>{#each m.steps as step, i (step)}{#if i > 0}{'\n'}{/if}<span class="prompt" aria-hidden="true">$ </span>{step}{/each}</code></pre>
    </figure>
  </div>
</section>

<EarlyStrip />

<style>
  /* ── The head's search, on the night ground ───────────────────────────── */

  .head-search {
    display: grid;
    gap: 14px;
    max-inline-size: 560px;
    margin-block-start: 32px;
  }

  .search {
    display: block;
  }

  /* THE FIELD: the night's second fill, radius 12, 48 tall, the glyph inside it. The field draws the focus ring. */
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 48px;
    padding-inline: 14px;
    border-radius: 12px;
    background: var(--tile-2);
    box-shadow: inset 0 0 0 1px var(--rule);
    color: var(--ink-2);
  }

  .field:focus-within {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* 16PX IN THE FIELD so a phone does not zoom into it. */
  .field input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: 46px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-site-16);
    /* focus-ok: the field around it draws the ring on focus-within. */
    outline: none;
  }

  .field input::placeholder {
    color: var(--ink-2);
  }

  .ours-all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-15);
  }

  /* ── The store ─────────────────────────────────────────────────────────── */

  .store {
    padding-block: 48px 96px;
    background: var(--board);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    margin-block-end: 24px;
  }

  /* THE TRACK: one pill on the tile's fill, the chosen segment in ink. It scrolls sideways inside itself and never
     pushes the page wider. */
  .track {
    display: flex;
    gap: 2px;
    max-inline-size: 100%;
    padding: 4px;
    overflow-x: auto;
    border-radius: 999px;
    background: var(--tile);
    box-shadow: inset 0 0 0 1px var(--rule);
    scrollbar-width: none;
  }

  .track::-webkit-scrollbar {
    display: none;
  }

  .seg {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 8px;
    min-block-size: 36px;
    padding-inline: 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ink-2);
    font: 500 var(--t-site-14) / 1 var(--font-ui);
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .seg:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  .seg[aria-pressed='true'] {
    background: var(--ink);
    color: var(--board);
  }

  .seg-n {
    color: var(--ink-3);
    font-weight: 400;
  }

  .seg[aria-pressed='true'] .seg-n {
    color: inherit;
    opacity: 0.7;
  }

  .shown {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-14);
  }

  .none,
  .no-match p {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-17);
  }

  .no-match {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 32px;
    border-radius: 16px;
    background: var(--tile);
  }

  /* THREE ACROSS AT A DESK, two on a tablet, one on a phone; each card as tall as its row. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CARD: flat, radius 16, no edge and no shadow. */
  .addon {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-inline-size: 0;
    padding: 24px;
    border-radius: 16px;
    background: var(--tile);
    color: var(--ink);
    transition: box-shadow var(--d-state) var(--ease-out);
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-block-end: 6px;
  }

  /* THE ICON WELL: 40, the board's fill, radius 10, in the second ink. */
  .icon-well {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: 10px;
    background: var(--board);
    color: var(--ink-2);
  }

  .kind {
    color: var(--ink-3);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .name {
    margin: 0;
    font-size: var(--t-site-21);
    line-height: 1.2;
    letter-spacing: -0.03em;
    overflow-wrap: anywhere;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  /* THE TITLE'S LINK COVERS THE CARD, so a press anywhere on it opens the add-on. */
  .card-link::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
  }

  .card-link:focus-visible {
    /* focus-ok: the ring is drawn on `::before`, round the whole card the link covers. */
    outline: none;
  }

  .card-link:focus-visible::before {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .summary {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--t-site-15);
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .brings {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-14);
    font-weight: 500;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 16px;
    margin: 0;
    margin-block-start: auto;
    padding-block-start: 14px;
    border-block-start: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--t-site-14);
  }

  .maker {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  @media (hover: hover) and (pointer: fine) {
    .seg[aria-pressed='false']:hover {
      background: var(--tile-2);
      color: var(--ink);
    }

    .addon:hover {
      box-shadow: inset 0 0 0 1px var(--rule);
    }

    .addon:hover .icon-well {
      color: var(--ink);
    }
  }

  @media (width >= 700px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 1060px) {
    .cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* ── Make your own ─────────────────────────────────────────────────────── */

  .make-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
  }

  @media (width >= 900px) {
    .make-cols {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .make-say {
    display: grid;
    gap: var(--sp-3);
    align-self: center;
  }

  .make-go {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 24px;
    margin: 28px 0 0;
  }

  .make-go .onward {
    margin: 0;
  }

  /* A TERMINAL, drawn: the band's own tile, the four commands of the first add-on in the mono face. */
  .term {
    min-inline-size: 0;
    margin: 0;
    padding: 20px 24px 24px;
    border-radius: 16px;
    background: var(--tile);
  }

  .term-hd {
    margin-block-end: 14px;
    color: var(--ink-2);
    font-size: var(--t-site-14);
    font-weight: 500;
  }

  /* A LONG COMMAND SCROLLS INSIDE THE TILE, never the page. */
  .term-body {
    margin: 0;
    overflow-x: auto;
    color: var(--ink);
    font: 400 var(--t-site-14) / 2 var(--font-mono);
  }

  .prompt {
    color: var(--ink-2);
    user-select: none;
  }

  /* ── A phone ───────────────────────────────────────────────────────────── */

  @media (max-width: 760px) {
    .head-search {
      margin-block-start: 24px;
    }

    .store {
      padding-block: 24px 64px;
    }

    .bar {
      margin-block-end: 16px;
    }

    .seg {
      min-block-size: var(--tap);
    }

    .addon {
      padding: 20px;
    }

    .no-match {
      padding: 24px 20px;
    }

    .make-go .btn {
      inline-size: 100%;
    }

    .term {
      padding: 16px 16px 20px;
    }
  }
</style>
