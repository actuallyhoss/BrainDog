<!--
  An add-on's pages drawn from its `.preview.json`, read-only (`preview.ts`).

  IT DRAWS NO BLOCK ITSELF. Each `PageAnswer` becomes an `Opened` through the page's own `blockOf` and is mounted in
  `PageView` with `mode: 'preview'`, which hands no block a write, arranges nothing and has no source view. So what a
  person sees here is what the installed page draws, from the same renderer (contracts §11 X50).

  SMALL ON A CARD, LARGE ON THE DETAIL PAGE. A card draws the first page at half size, clipped, and hidden from a screen
  reader, because the card's own words already say what it adds and a link a card cannot follow is a trap. The detail
  page draws every page full size with a tab for each when there are several, and a wide block scrolls inside its own
  frame, so the page itself never scrolls sideways at 390px.
-->
<script lang="ts">
  import type { Preview } from '@braindog/declare/catalogue';
  import PageView from '$lib/page/PageView.svelte';
  import { openedOf } from './preview.ts';
  import { words } from './words.ts';

  let { preview, large = false }: { preview: Preview; large?: boolean } = $props();

  /* THE DAY THE PREVIEW WAS MADE IS ITS "NOW", so a row it shows as due tomorrow reads as it did in the scratch record,
     not as long overdue a month later. */
  const now = $derived(Number.isFinite(Date.parse(preview.made_at)) ? Date.parse(preview.made_at) : Date.now());
  let at = $state(0);
  const pages = $derived(large ? preview.pages : preview.pages.slice(0, 1));
  const shown = $derived(pages[Math.min(at, Math.max(pages.length - 1, 0))] ?? null);
  const got = $derived(shown ? openedOf(shown, now) : null);
</script>

{#if shown && got}
  {#if large}
    <div class="large">
      {#if pages.length > 1}
        <div class="segmented tabs" role="tablist" aria-label={words.pages}>
          {#each pages as p, i (p.page)}
            <button type="button" class="segment" role="tab" aria-selected={i === at} data-on={i === at ? '' : undefined} onclick={() => (at = i)}>{p.title}</button>
          {/each}
        </div>
      {/if}
      <div class="frame" role="tabpanel" aria-label={shown.title}>
        <PageView slug={shown.page} {got} mode="preview" />
      </div>
    </div>
  {:else}
    <div class="small" aria-hidden="true" inert>
      <div class="shrink">
        <PageView slug={shown.page} {got} mode="preview" />
      </div>
    </div>
  {/if}
{/if}

<style>
  .large {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    inline-size: 100%;
    min-inline-size: 0;
  }

  /* THE TABS SCROLL IN THEIR OWN ROW, never the page, when an add-on brings more pages than fit. */
  .tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    align-self: flex-start;
    max-inline-size: 100%;
  }

  .tabs .segment {
    white-space: nowrap;
  }

  .frame {
    inline-size: 100%;
    overflow-x: auto;
    padding: var(--sp-3);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-md);
    background: var(--bg);
  }

  /* NO EDGE AND NO FILL OF ITS OWN: a card's drawing well is the one surface (`ListingCard.svelte`), and a second box
     inside it is the nesting design.md §2.8 found on this screen. */
  .small {
    block-size: 180px;
    overflow: hidden;
    pointer-events: none;
  }

  /* HALF SIZE BY TRANSFORM, laid out at twice the card's width so the blocks wrap as they would on a real page. */
  .shrink {
    inline-size: 200%;
    transform: scale(0.5);
    transform-origin: top left;
  }
</style>
