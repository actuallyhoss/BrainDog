<!--
  The one offer for the list being read, on that list's own screen (USE-B03: an offer is shown where the person is).

  WHAT IT SAYS: who noticed, with Slash's mark; the record's own sentence saying why, which is the card's line; and a
  small drawing of the page keeping it would make, its blocks by name and in order. The drawing reads nothing, so it
  draws no number: figures are empty cells and a table is faint lines, the shape of the page and never its contents.

  TWO PRESSES, both the pen's own (`offerActs` in `pen.ts`): Make it keeps the offer as Settings, Navigation does and goes
  to the page made, and Not now writes the dismissal, terminal on every device. The card holds no state of its own, so
  the screen that draws it is the one that knows it is gone.

  A TILE ON THE BOARD: flat, no border, no shadow. The drawing is a small board inside it, its blocks
  drawn as the board's own colour, so it reads as a picture of a page and not as a tile inside a tile.

  THE COMPACT FORM IS A QUIET LINE OR TWO THAT OPENS ON TAP (`compact`, look fault G). On a page somebody opened to read
  their own things, the whole card over the first tile outranked the page: a first screen on a phone, a third of one on
  a laptop. So there it is Slash's mark, the sentence on a line or two and a chevron, and a press opens the card whole, with
  the same line as its way to close. Nothing is hidden for good: the sentence is the line's accessible name whole, even
  where a narrow screen cuts it.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Tile from '../ui/Tile.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { draftDrawing, makeLabel, offerWords, type OfferActs, type PenItem } from './pen.ts';

  let {
    item,
    acts,
    busy = null,
    compact = false,
  }: {
    item: PenItem;
    acts: Pick<OfferActs, 'make' | 'notNow'>;
    /** The id of the offer being made, while it is: the card's Make it waits and says so. */
    busy?: string | null | undefined;
    /** One line that opens on tap, for a page whose own content comes first. Left out, the card is drawn whole. */
    compact?: boolean | undefined;
  } = $props();

  /* WHILE IT IS BEING MADE THE CARD STAYS OPEN, so the press that started it is not folded away under the finger. */
  let opened = $state(false);

  /* THE PRESS KEEPS ITS PLACE: opening swaps the line for the card and folding swaps it back, so the focus is put on
     the button that took the pressed one's place, and a keyboard is never dropped at the top of the page. */
  let line = $state<HTMLButtonElement | null>(null);
  let fold = $state<HTMLButtonElement | null>(null);
  async function turn(open: boolean): Promise<void> {
    opened = open;
    await tick();
    (open ? fold : line)?.focus();
  }

  const drawn = $derived(draftDrawing(item));
  const making = $derived(busy === item.id);
  const folded = $derived(compact && !opened && !making);
</script>

{#if folded}
  <button bind:this={line} type="button" class="offer-line" data-offer={item.id} data-compact aria-expanded="false" aria-label="{offerWords.noticed}: {item.why}" onclick={() => void turn(true)}>
    <span class="offer-mark"><Icon name="slash" size="s" /></span>
    <span class="offer-line-why">{item.why}</span>
    <span class="offer-turn"><Icon name="chevronDown" size="s" /></span>
  </button>
{:else}
<Tile class="offer-card" data-offer={item.id} data-compact={compact ? '' : undefined}>
  {#if compact}
    <button bind:this={fold} type="button" class="offer-who offer-fold" aria-expanded="true" onclick={() => void turn(false)}>
      <span class="offer-mark"><Icon name="slash" size="s" /></span>{offerWords.noticed}
      <span class="offer-turn" data-up><Icon name="chevronDown" size="s" /></span>
    </button>
  {:else}
    <p class="offer-who"><span class="offer-mark" title="Slash"><Icon name="slash" size="s" /></span>{offerWords.noticed}</p>
  {/if}
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
    <Button weight="primary" disabled={Boolean(busy)} onclick={() => void acts.make(item)}>{making ? offerWords.making : makeLabel(item)}</Button>
    <Button weight="bare" disabled={making} onclick={() => void acts.notNow(item)}>{offerWords.notNow}</Button>
  </div>
</Tile>
{/if}

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
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .offer-mark {
    display: inline-flex;
    flex: none;
    color: var(--red);
  }

  /* THE FOLDED LINE: a tile one line tall, the board's own radius, body text in the quiet ink. A whole row to press,
     44px on a finger, and never a third line: what does not fit in two is cut, and the press opens it whole. */
  .offer-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--sp-2) 20px;
    border: 0;
    border-radius: var(--r-tile);
    background: var(--tile);
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-body);
    text-align: start;
    cursor: pointer;
  }

  .offer-line:hover {
    color: var(--ink);
  }

  /* TWO LINES AT MOST (the audit of 25 October, Z18): one line at 390 cut the question itself, "30 transactions this
     week. Want a pag…". It wraps, and only past a second line is it cut. */
  .offer-line-why {
    flex: 1;
    min-inline-size: 0;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .offer-turn {
    display: inline-flex;
    flex: none;
    margin-inline-start: auto;
    color: var(--ink-3);
  }

  .offer-turn[data-up] {
    transform: rotate(180deg);
  }

  /* THE OPEN CARD'S WAY BACK: the same line it opened from, as a bare row the width of the card. */
  .offer-fold {
    inline-size: 100%;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--fs-meta);
    text-align: start;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .offer-line,
    .offer-fold {
      min-block-size: 44px;
    }
  }

  /* THE CARD'S LINE IS THE QUESTION'S SIZE (17px), at medium, as the mockup's step 7 draws it. */
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
    border-radius: var(--r-pop);
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
    background: var(--rule);
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
