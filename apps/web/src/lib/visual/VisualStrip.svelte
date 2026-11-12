<!--
  The visuals one thing holds, where the thing shows: its row page, a project's
  page, a question on Decide or in Needs you, a task's drawer. Each is a card: its first picture as a still where it has
  one, or a quiet card, its title, and who made it and when. NEVER A LIVE FRAME ON FIRST PAINT: the page opens as fast as
  one without, and the frame is drawn only when a card is pressed (`VisualViewer.svelte`, loaded then by `import()`).

  READ WHEN IT NEARS THE SCREEN, and once a minute for the tab however many strips name the thing (`held.ts`
  `cardsFor`), so a page of questions asks the record once for each it scrolls to. A thing that holds none draws
  nothing at all, not an empty heading.

  A CARD WITH A DRAFT WAITING carries its mark and its three presses under it (`DraftBar.svelte`): Keep, Try again and
  Throw away, so a draft is settled where it shows without opening it. Pressed open, the viewer shows the draft first.

  `on` names the thing as the record takes it: `tasks#3` for a row, `SG12` for a question, `D4` for a decision.
  `tile` wraps it in its own tile with a heading, for a page of tiles; elsewhere it is a heading and a row of cards
  inside what holds it.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { actor } from '$lib/record/names.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import DraftBar from './DraftBar.svelte';
  import { cardsFor, forgetCards, madeLine, pictureAt, visualWords as words, type Card } from './held.ts';

  let { on, tile = false, compact = false }: { on: string; tile?: boolean | undefined; compact?: boolean | undefined } = $props();

  let box = $state<HTMLElement>();
  let near = $state(false);
  let cards = $state.raw<Card[]>([]);
  /** The card pressed, and whether its viewer is up; the viewer stays mounted once opened, to close the way it came. */
  let pressed = $state.raw<Card | null>(null);
  let open = $state(false);

  /* THE ROOM IT TOOK LAST TIME, kept for the tab: the strip lands after the page has drawn the tiles under it, so without
     its room held they were pushed down when it did. Gone once the read is back, whatever it found. */
  const heldKey = $derived(`vs-h ${on}`);
  let loaded = $state(false);
  const room = $derived.by(() => {
    if (loaded) return 0;
    try {
      return Number(sessionStorage.getItem(heldKey)) || 0;
    } catch {
      return 0;
    }
  });

  $effect(() => {
    if (!loaded || !box) return;
    const h = cards.length > 0 ? Math.round(box.getBoundingClientRect().height) : 0;
    try {
      if (h > 0) sessionStorage.setItem(heldKey, String(h));
      else sessionStorage.removeItem(heldKey);
    } catch {
      /* storage may be off; the strip then lands as it did */
    }
  });

  const me = $derived(String(page.data.me?.person ?? '') || null);
  const names = $derived(new Map(Object.entries((page.data.names ?? {}) as Record<string, string>)));
  const now = $derived(Date.now());

  $effect(() => {
    if (!box || near) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near = true;
        seen.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    seen.observe(box);
    return () => seen.disconnect();
  });

  async function read() {
    const got = await cardsFor(apiBase(), on);
    cards = got.ok ? got.value : [];
    loaded = true;
  }

  /* A NEW THING IS READ AFRESH. */
  $effect(() => {
    void on;
    if (near) void read();
  });

  function press(card: Card) {
    pressed = card;
    open = true;
  }

  function changed() {
    forgetCards(apiBase(), on);
    void read();
  }
</script>

{#snippet strip()}
  <ul class="vs-cards" data-compact={compact ? '' : undefined}>
    {#each cards as card (card.id)}
      <li class="vs-one" data-draft={card.draft ? '' : undefined}>
        <button type="button" class="vs-card tap" data-still={card.still && !compact ? '' : undefined} aria-label={words.open(card.title)} onclick={() => press(card)}>
          <span class="vs-still" aria-hidden="true">
            {#if card.still}
              <img src={pictureAt(apiBase(), card.still)} alt="" loading="lazy" decoding="async" />
            {:else}
              <Icon name="doc" size="m" />
            {/if}
          </span>
          <span class="vs-words">
            <span class="vs-title" dir="auto">{card.title}</span>
            <span class="vs-made">{madeLine(actor(card.by, me, names).name, card.at, now)}{#if card.versions > 1}{' · '}{words.versions(card.versions)}{/if}</span>
          </span>
        </button>
        {#if card.draft}
          {#key `${card.id} ${card.draft.version}`}
            <div class="vs-draft"><DraftBar id={card.id} version={card.draft.version} by={card.draft.by} title={card.title} onsettled={changed} /></div>
          {/key}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="vs" bind:this={box} hidden={cards.length === 0 && room === 0 ? true : undefined} style:min-block-size={room > 0 ? `${room}px` : undefined}>
  {#if cards.length > 0}
    {#if tile}
      <Tile icon="doc" title={words.heading} count={cards.length > 1 ? cards.length : undefined}>{@render strip()}</Tile>
    {:else}
      <section class="vs-part" aria-label={words.heading}>
        {#if !compact}<h3 class="vs-h">{words.heading}</h3>{/if}
        {@render strip()}
      </section>
    {/if}
  {/if}
</div>

{#if pressed}
  {#await import('./VisualViewer.svelte') then { default: VisualViewer }}
    {#key pressed.id}<VisualViewer bind:open id={pressed.id} {on} title={pressed.title} onchanged={changed} />{/key}
  {/await}
{/if}

<style>
  /* HIDDEN UNTIL IT HOLDS ONE, and still in the page so it can be seen nearing the screen: a point at its own place,
     out of the flow, so a grid or a stack around it keeps no gap for it. */
  .vs[hidden] {
    display: block;
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    pointer-events: none;
  }

  .vs-part {
    display: grid;
    gap: var(--sp-2);
  }

  .vs-h {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  .vs-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .vs-cards[data-compact] {
    grid-template-columns: minmax(0, 1fr);
  }

  /* A CARD WITH A DRAFT: the card, then its mark and its three presses, on the same well. */
  .vs-one[data-draft] {
    display: grid;
    align-content: start;
    background: var(--tile-2);
    border-radius: var(--r-ctl);
  }

  .vs-one[data-draft] .vs-card {
    block-size: auto;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }

  .vs-draft {
    padding: var(--sp-1) var(--sp-2) var(--sp-2);
  }

  /* A QUIET CARD: a small well, its title and who made it, on one line. */
  .vs-card {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 56px;
    padding: var(--sp-2);
    text-align: start;
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  .vs-card:hover {
    background: color-mix(in srgb, var(--tile-2) 80%, var(--ink) 6%);
  }

  .vs-still {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: 44px;
    block-size: 44px;
    overflow: hidden;
    border-radius: var(--r-xs);
    background: var(--tile);
    color: var(--ink-3);
  }

  .vs-still img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    object-position: top;
  }

  /* WITH A PICTURE, THE PICTURE LEADS: a still the card's width, its title and who made it under it. */
  .vs-card[data-still] {
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-2);
  }

  .vs-card[data-still] .vs-still {
    inline-size: 100%;
    block-size: auto;
    aspect-ratio: 16 / 9;
  }

  .vs-card[data-still] .vs-words {
    padding: 0 var(--sp-1) var(--sp-1);
  }

  .vs-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .vs-title {
    font-size: var(--fs-body);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vs-made {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
