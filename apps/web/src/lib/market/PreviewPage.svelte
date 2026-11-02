<!--
  An add-on's pages drawn from its `.preview.json`, read-only (`preview.ts`).

  IT DRAWS NO BLOCK ITSELF. Each `PageAnswer` becomes an `Opened` through the page's own `blockOf` and is mounted in
  `PageView` with `mode: 'preview'`, which hands no block a write, arranges nothing and has no source view. So what a
  person sees here is what the installed page draws, from the same renderer.

  THE PAGE'S TABS ARE THE `--tile-2` SEGMENTED PILL, because the preview sits inside a tile and glass never sits on content
  (`controls.css`).

  SMALL ON A CARD, LARGE ON THE DETAIL PAGE. A card draws the first page at half size, clipped, and hidden from a screen
  reader, because the card's own words already say what it adds and a link a card cannot follow is a trap. The detail
  page draws every page full size with a tab for each when there are several, and a wide block scrolls inside its own
  frame, so the page itself never scrolls sideways at 390px.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';

  import type { Preview } from '@braindog/declare/catalogue';
  import { LENT_NAMES } from '$lib/record/capture-plan.ts';
  import PageView from '$lib/page/PageView.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { openedOf } from './preview.ts';
  import { words } from './words.ts';

  /* `lists`: the add-on's own list declarations, lent to the drawing (`preview.ts` `openedOf`). */
  let { preview, large = false, lists = [] }: { preview: Preview; large?: boolean; lists?: readonly Record<string, unknown>[] } = $props();

  /* THE DAY THE PREVIEW WAS MADE IS ITS "NOW", so a row it shows as due tomorrow reads as it did in the scratch record,
     not as long overdue a month later. */
  const now = $derived(Number.isFinite(Date.parse(preview.made_at)) ? Date.parse(preview.made_at) : Date.now());
  let at = $state(0);
  const pages = $derived(large ? preview.pages : preview.pages.slice(0, 1));
  const shown = $derived(pages[Math.min(at, Math.max(pages.length - 1, 0))] ?? null);
  const got = $derived(shown ? openedOf(shown, now, lists) : null);

  /* ITS LISTS' NAMES, LENT WHILE IT IS DRAWN, so its capture says "Add to Goals" and not the list's id (`LENT_NAMES`).
     Set before the first draw (a plain map, read as the rows are written) and handed back when the preview goes. */
  const lent: string[] = [];
  for (const d of lists) {
    if (typeof d.register !== 'string' || typeof d.name !== 'string' || d.name.trim() === '' || LENT_NAMES.has(d.register)) continue;
    LENT_NAMES.set(d.register, d.name.trim());
    lent.push(d.register);
  }
  onDestroy(() => {
    for (const id of lent) LENT_NAMES.delete(id);
  });
</script>

{#if shown && got}
  {#if large}
    <div class="large">
      {#if pages.length > 1}
        <Segmented class="tabs" role="tablist" aria-label={words.pages}>
          {#each pages as p, i (p.page)}
            <button type="button" class="segment" role="tab" aria-selected={i === at} data-on={i === at ? '' : undefined} onclick={() => (at = i)}>{p.title}</button>
          {/each}
        </Segmented>
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

  /* THE TABS SCROLL IN THEIR OWN ROW, never the page, when an add-on brings more pages than fit. The track is
     `Segmented`'s own element, so its rules reach it by the name this part gave it. */
  .large :global(.tabs) {
    flex-wrap: nowrap;
    overflow-x: auto;
    align-self: flex-start;
    max-inline-size: 100%;
  }

  .large :global(.tabs .segment) {
    white-space: nowrap;
  }

  /* THE PAGE DRAWN ON ITS OWN GROUND: a well in `--board`, radius `--r-pop`, with no edge, so the installed page's blocks
     sit on it as they would on the app's ground. It is a picture of the product inside the tile that holds it, not a
     second box. */
  .frame {
    box-sizing: border-box;
    inline-size: 100%;
    overflow-x: auto;
    padding: var(--sp-4);
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }

  /* NO EDGE AND NO FILL OF ITS OWN: a card's drawing well is the one surface (`ListingCard.svelte`), and a second box
     inside it is the nesting this screen once had. */
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
