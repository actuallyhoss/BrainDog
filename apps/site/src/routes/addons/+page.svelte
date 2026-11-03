<!--
  `/addons`: the add-on store as a stranger sees it. Every public listing as a card, a search, and the categories as one
  segmented control.

  THE SITE'S DESIGN: the night head with the search in its slot, then the store on the board's ground with
  the categories over the cards, then a night band that says your agent can build one and points at the docs, and the
  early access strip. Two neighbours never share a ground in either scheme.

  EVERY CARD IS IN THE HTML. The load hands the page every public card at build time, so the page reads whole with
  scripting off; the search and the control narrow what is drawn once the script runs, and nothing is fetched to do it.

  THE CARDS ARE `lib/packs/Cards.svelte`, shared with an author's page.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { ADDONS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import Cards from '$lib/packs/Cards.svelte';
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

<Seo title={w.meta.title} description={w.meta.description} path={ADDONS} />
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
        <Cards cards={shown} />
      {/if}
    {/if}
  </div>
</section>

<section class="band band--make" aria-labelledby="make-title">
  <div class="wrap cols">
    <div class="c6 make-say">
      <h2 id="make-title" class="band-h2">{m.title}</h2>
      <p class="band-say">{m.say}</p>
      <p class="make-go">
        <a class="btn ghost" href={m.agentHref}>{m.agent}<Icon name="arrow" size="m" /></a>
        <a class="more" href={m.firstHref}>{m.first}<Icon name="arrow" size="m" /></a>
        <a class="more" href={m.publishHref}>{m.publish}<Icon name="arrow" size="m" /></a>
      </p>
    </div>
    <figure class="c6 term">
      <figcaption class="term-hd">{m.terminal}</figcaption>
      <p class="ask"><Icon name="message" size="m" /><span>{m.ask}</span></p>
      <p class="term-hd steps-hd">{m.stepsSaid}</p>
      <ol class="term-body">
        {#each m.steps as step (step)}<li><code>{step}</code></li>{/each}
      </ol>
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
    background: var(--night-2);
    box-shadow: inset 0 0 0 1px var(--night-rule);
    color: var(--on-night-2);
  }

  .field:focus-within {
    outline: 2px solid var(--on-night);
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
    color: var(--on-night);
    font: inherit;
    font-size: var(--t-site-16);
    /* focus-ok: the field around it draws the ring on focus-within. */
    outline: none;
  }

  .field input::placeholder {
    color: var(--on-night-2);
  }

  .ours-all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--on-night-2);
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
    color: var(--ink2);
    font: 500 var(--t-site-14) / 1 var(--ui);
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
    color: var(--page);
  }

  .seg-n {
    color: var(--muted);
    font-weight: 400;
  }

  .seg[aria-pressed='true'] .seg-n {
    color: inherit;
    opacity: 0.7;
  }

  .shown {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .none,
  .no-match p {
    margin: 0;
    color: var(--ink2);
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

  @media (hover: hover) and (pointer: fine) {
    .seg[aria-pressed='false']:hover {
      background: var(--soft);
      color: var(--ink);
    }
  }

  /* ── Make your own ─────────────────────────────────────────────────────── */

  .band--make {
    background: var(--band-ai);
    color: var(--on-night);
  }

  .band--make .band-say {
    color: var(--on-night-2);
  }

  .make-say {
    align-self: center;
  }

  .make-go {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 24px;
    margin: 28px 0 0;
  }

  .make-go .more {
    margin: 0;
    color: var(--on-night);
  }

  /* A TERMINAL, drawn: the band's own tile, the four commands of the first add-on in the mono face. */
  .term {
    min-inline-size: 0;
    margin: 0;
    padding: 20px 24px 24px;
    border-radius: 16px;
    background: var(--band-ai-tile);
  }

  .term-hd {
    margin-block-end: 14px;
    color: var(--on-night-2);
    font-size: var(--t-site-14);
    font-weight: 500;
  }

  /* WHAT A PERSON SAYS, as a message: the band's own words in the body face. */
  .ask {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0;
    padding: 14px 16px;
    border-radius: var(--r-field);
    background: color-mix(in oklab, var(--on-night) 8%, transparent);
    color: var(--on-night);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .ask :global(svg) {
    flex: none;
    margin-block-start: 2px;
    color: var(--on-night-2);
  }

  .steps-hd {
    margin-block: 20px 8px;
  }

  /* THE AGENT'S CALLS, numbered, in the mono face. A long one scrolls inside the tile, never the page. */
  .term-body {
    margin: 0;
    padding: 0;
    overflow-x: auto;
    list-style-position: inside;
    color: var(--on-night);
    font: 400 var(--t-site-14) / 2 var(--font-mono);
  }

  .term-body li::marker {
    color: var(--on-night-2);
  }

  .term-body code {
    font: inherit;
    white-space: nowrap;
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
