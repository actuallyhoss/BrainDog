<!--
  What went stale, as one quiet tile under the page (DIRECTION §39): "4 things went stale" as its heading, then a line
  a kind with how many, each of them the record's own sentence.

  THE RECORD COUNTED WHAT WENT STALE AND NO SCREEN SAID IT. An agent was told when it started work; the person whose
  record it is was told nowhere. Here it is on the first screen: what went stale, how many, and where each is cleared.

  A LINE WITH A PLACE IS A LINK TO IT: steps nobody took open where the agents' work is read, a question that waited
  opens Decide. A kind with no place of its own is words, and the record's tidy looks at those again by itself.

  NOTHING HERE IS A CALL. The record says how an agent clears each line; none of that is read by `stale.ts`, so none
  can be drawn.

  NOTHING IS DRAWN FOR NOTHING: not a heading, not an empty state. Six kinds are listed and the rest are counted.

  QUIET: no red and no accent. Stale is not late, and nothing here waits on a day. The count is a pill, said aloud by
  the sentence beside it, so the pill itself is kept from a screen reader. A link is 44 tall under a thumb.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { staleLine, staleShown, type StaleRow } from './stale.ts';

  let { rows }: { rows: readonly StaleRow[] } = $props();

  const words = {
    more: (n: number) => (n === 1 ? 'And one more of another kind.' : `And ${String(n)} more of other kinds.`),
  } as const;

  const line = $derived(staleLine(rows));
  const list = $derived(staleShown(rows));
</script>

{#if line}
  <section class="stale" aria-labelledby="stale-h" data-stale>
    <div class="s-head">
      <IconWell name="clock" />
      <h2 class="s-said" id="stale-h">{line}</h2>
    </div>
    <ul class="s-list">
      {#each list.shown as row (row.key)}
        <li>
          {#if row.href}
            <a class="s-line" href={at(row.href)} data-stale-kind={row.key}>
              <span class="s-text" dir="auto">{row.said}</span>
              <span class="s-count" aria-hidden="true">{row.count}</span>
              <span class="s-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
            </a>
          {:else}
            <p class="s-line" data-stale-kind={row.key}>
              <span class="s-text" dir="auto">{row.said}</span>
              <span class="s-count" aria-hidden="true">{row.count}</span>
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if list.more > 0}<p class="s-more">{words.more(list.more)}</p>{/if}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .stale {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile, var(--bg));
    border-radius: var(--r-tile, 16px);
  }

  .s-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .s-said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: 1.4;
  }

  .s-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) calc(-1 * var(--sp-3)) 0;
    padding: 0;
    list-style: none;
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .s-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .s-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    box-sizing: border-box;
    min-block-size: var(--row-h);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink);
    font-size: var(--t-row);
    line-height: 22px;
    text-decoration: none;
  }

  a.s-line {
    transition: background var(--d-state) var(--ease-out);
  }

  a.s-line:hover {
    background: var(--hover-wash);
  }

  .s-text {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* THE COUNT, a pill as every count is, in the tile's own quiet ink. */
  .s-count {
    flex: none;
    min-inline-size: 24px;
    padding: 0 var(--sp-2);
    background: var(--hover-wash);
    border-radius: var(--r-pill);
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    line-height: 24px;
    text-align: center;
  }

  .s-go {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--dim);
  }

  .s-more {
    margin: var(--sp-3) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 20px;
  }

  /* UNDER A THUMB A LINK IS 44 (13 §7): the pointer and not the width, as every row is. */
  @media (pointer: coarse) {
    a.s-line {
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    a.s-line {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .stale {
      border: 1px solid CanvasText;
    }
  }
</style>
