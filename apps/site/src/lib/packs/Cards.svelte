<!--
  A grid of plugin cards, for the store (`/plugins`) and an author's page (`/plugins/by/<who>`).

  A CARD SAYS WHAT A STRANGER WEIGHS: its name, one line, what it brings, who made it and how far it was checked, and
  how many hold it when the Kennel counted ten or more. "Made by BrainDog" is drawn only where the catalogue says
  BrainDog published it.

  THE WHOLE CARD IS THE TARGET, through its title's link stretched over it, so a screen reader hears the title as the
  link's name rather than every word on the card. The solid card of the app: its own edge and the soft shadow in light.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import Mark from '$lib/Mark.svelte';
  import { PLUGINS } from '$lib/links.ts';
  import { packs } from '$lib/copy/packs.ts';
  import type { Card } from './catalogue.ts';

  let { cards }: { cards: readonly Card[] } = $props();

  const w = packs.packs;
</script>

<ul class="cards">
  {#each cards as card (card.slug)}
    <li class="addon">
      <div class="card-top">
        <span class="icon-well"><Icon name={card.glyph} size="m" /></span>
        <span class="kind">{w.kind[card.kind]}</span>
      </div>
      <h2 class="name"><a class="card-link" href="{PLUGINS}/{card.slug}">{card.title}</a></h2>
      <p class="summary">{card.summary}</p>
      <p class="brings">{card.adds.length ? card.adds.join(' · ') : w.worksOn}</p>
      <p class="foot">
        {#if card.ours}
          <span class="maker"><Mark height={13} tone="inherit" />{w.ours}</span>
        {:else}
          <span class="maker">{w.by(card.publisher)}<span class="trust">{w.trust[card.trust]}</span></span>
        {/if}
        {#if card.installs !== null}<span class="num">{w.installs(card.installs)}</span>{/if}
      </p>
    </li>
  {/each}
</ul>

<style>
  /* THREE ACROSS AT A DESK, two on a tablet, one on a phone; each card as tall as its row. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CARD: the app's solid card, radius 16, its own edge and the soft shadow in light. */
  .addon {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-inline-size: 0;
    padding: 24px;
    border: 1px solid var(--card-edge);
    border-radius: var(--r-tile);
    background: var(--tile);
    box-shadow: var(--shadow-card);
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
    border-radius: var(--r-ctl);
    background: var(--board);
    color: var(--ink2);
  }

  .kind {
    color: var(--muted);
    font-size: var(--t-site-13);
    font-weight: 500;
  }

  .name {
    margin: 0;
    font-size: var(--t-site-21);
    line-height: 1.2;
    letter-spacing: -0.021em;
    overflow-wrap: anywhere;
  }

  .card-link {
    color: inherit;
    text-decoration: none;
  }

  /* THE TITLE'S LINK COVERS THE CARD, so a press anywhere on it opens the plugin. */
  .card-link::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-tile);
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
    color: var(--ink2);
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
    border-block-start: 1px solid var(--sep);
    color: var(--muted);
    font-size: var(--t-site-14);
  }

  .maker {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 7px;
  }

  /* HOW FAR IT WAS CHECKED, said in words beside who made it: never a tick, never a colour. */
  .trust::before {
    content: '·';
    margin-inline-end: 7px;
  }

  @media (hover: hover) and (pointer: fine) {
    .addon:hover {
      box-shadow: var(--shadow-card), inset 0 0 0 1px var(--rule);
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

  @media (max-width: 760px) {
    .addon {
      padding: 20px;
    }
  }
</style>
