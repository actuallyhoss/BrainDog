<!--
  The one offer for the list being read, on that list's own screen (USE-B03: an offer is shown where the person is).

  WHAT IT SAYS: who noticed, with Slash's mark; the record's own sentence saying why, which is the card's line; and a
  small drawing of the page keeping it would make, its blocks by name and in order. The drawing reads nothing, so it
  draws no number: figures are empty cells and a table is faint lines, the shape of the page and never its contents.

  TWO PRESSES, both the pen's own (`offerActs` in `pen.ts`): Make it keeps the offer as Settings, Navigation does and goes
  to the page made, and Not now writes the dismissal, terminal on every device. The card holds no state of its own, so
  the screen that draws it is the one that knows it is gone.

  A TILE ON THE BOARD (DIRECTION 39): flat, no border, no shadow. The drawing is a small board inside it, its blocks
  drawn as the board's own colour, so it reads as a picture of a page and not as a tile inside a tile.
-->
<script lang="ts">
  import Tile from '../ui/Tile.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { draftDrawing, offerWords, type OfferActs, type PenItem } from './pen.ts';

  let {
    item,
    acts,
    busy = null,
  }: {
    item: PenItem;
    acts: Pick<OfferActs, 'make' | 'notNow'>;
    /** The id of the offer being made, while it is: the card's Make it waits and says so. */
    busy?: string | null | undefined;
  } = $props();

  const drawn = $derived(draftDrawing(item));
  const making = $derived(busy === item.id);
</script>

<Tile class="offer-card" data-offer={item.id}>
  <p class="offer-who"><span class="offer-mark" title="Slash"><Icon name="slash" size="s" /></span>{offerWords.noticed}</p>
  <p class="offer-why">{item.why}</p>
  {#if drawn.blocks.length > 0}
    <div class="offer-mini" role="group" aria-label={offerWords.drawing(drawn.title)}>
      {#each drawn.blocks as b, i (i)}
        <div class="offer-block" data-wide={i === 0 || drawn.blocks.length === 2 ? '' : undefined}>
          <span class="offer-name">{b.name}</span>
          {#if b.cells > 0}
            <span class="offer-cells" aria-hidden="true">{#each { length: b.cells } as _, c (c)}<i></i>{/each}</span>
          {:else}
            <span class="offer-lines" aria-hidden="true"><i></i><i></i></span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  <div class="offer-acts">
    <Button weight="primary" disabled={Boolean(busy)} onclick={() => void acts.make(item)}>{making ? offerWords.making : offerWords.make}</Button>
    <Button weight="bare" disabled={making} onclick={() => void acts.notNow(item)}>{offerWords.notNow}</Button>
  </div>
</Tile>

<style>
  :global(.offer-card) {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .offer-who {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-meta);
  }

  .offer-mark {
    display: inline-flex;
    color: var(--action-text);
  }

  /* THE CARD'S LINE IS THE QUESTION'S SIZE (DIRECTION 39's 17), at medium, as the mockup's step 7 draws it. */
  .offer-why {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-medium);
    line-height: 1.35;
  }

  .offer-mini {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-2);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    background: var(--board);
  }

  .offer-block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-3);
    border-radius: 10px;
    background: var(--tile);
  }

  .offer-block[data-wide] {
    grid-column: 1 / -1;
  }

  .offer-name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .offer-cells,
  .offer-lines {
    display: flex;
    gap: var(--sp-2);
  }

  .offer-lines {
    flex-direction: column;
  }

  .offer-cells i,
  .offer-lines i {
    display: block;
    flex: 1;
    block-size: 6px;
    border-radius: 3px;
    background: var(--line);
  }

  .offer-lines i:last-child {
    inline-size: 60%;
    flex: none;
  }

  .offer-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
