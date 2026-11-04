<!--
  What the record found wrong in its own pages and notes, as one tile on the board: the record's own
  sentence as its heading ("14 values on 6 pages name nothing"), then a line a fault, each by its place's own name.

  THE RECORD READ ITS OWN TEXT AND NO SCREEN SAID WHAT IT FOUND. A placeholder naming nothing and a broken block were
  visible on the page they stood on and nowhere else. Here they are on the first screen: which page or note, what is
  wrong, the fix in a sentence, and one press to the place.

  A TILE AND NEVER A QUESTION. Nothing here asks or decides; a fault goes when its text is fixed, and at nought the tile
  is gone.

  A LINE WITH A PLACE IS A LINK TO IT, by its name's route (`text-faults.ts` `placeOf`): the record says the place by its
  names, and the pages and lists this tab holds turn them into the address. A fault with no place is words.

  THE MARK AND THE WORD GO TOGETHER: the heading's well carries the alert mark in the deeper red, and the sentence
  beside it says what is wrong, so the red is never the only sign. The rows stay in ink, the fix in the quieter colour.
  A link is 44 tall under a thumb.

  AND WHAT THE PAGES PRINT RAW, EVERY ONE: the night's page lint, which the sign `pages-clean` carries six of, as a
  second part under the first, a line a finding and none held back (`printedRows`).
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { faultLine, faultRows, knownOf, more, printedLeft, printedLine, printedRows, type FaultRow, type TextFaults } from './text-faults.ts';

  /* `lists` IS THE SHELL'S, by id and name, so a fault the record says by a list's name opens that list. */
  let { found, lists = [] }: { found: TextFaults; lists?: readonly { id: string; name: string }[] } = $props();

  const line = $derived(faultLine(found));
  const rows = $derived(faultRows(found, knownOf(lists)));
  const rest = $derived(more(found));
  const rawLine = $derived(printedLine(found));
  const raw = $derived(printedRows(found));
  const rawLeft = $derived(printedLeft(found));
</script>

{#snippet faultList(rows: FaultRow[])}
  <ul class="f-list">
    {#each rows as row, i (i)}
      <li>
        {#if row.href}
          <a class="f-line" href={at(row.href)}>
            <span class="f-text">
              <span class="f-title" dir="auto">{row.title}</span>
              <span class="f-what" dir="auto">{row.said}</span>
              {#if row.fix}<span class="f-fix" dir="auto">{row.fix}</span>{/if}
            </span>
            <span class="f-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
          </a>
        {:else}
          <p class="f-line">
            <span class="f-text">
              <span class="f-title" dir="auto">{row.title}</span>
              <span class="f-what" dir="auto">{row.said}</span>
              {#if row.fix}<span class="f-fix" dir="auto">{row.fix}</span>{/if}
            </span>
          </p>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#if line}
  <section class="faults" aria-labelledby="faults-h" data-text-faults>
    <div class="f-head">
      <IconWell name="alert" tone="danger" />
      <h2 class="f-said" id="faults-h" dir="auto">{line}</h2>
    </div>
    {#if rows.length > 0}{@render faultList(rows)}{/if}
    {#if rest}<p class="f-more">{rest[0]!.toUpperCase() + rest.slice(1)}.</p>{/if}
  </section>
{/if}

{#if rawLine}
  <section class="faults" aria-labelledby="printed-h" data-printed-raw>
    <div class="f-head">
      <IconWell name="alert" tone="danger" />
      <h2 class="f-said" id="printed-h" dir="auto">{rawLine}</h2>
    </div>
    {@render faultList(raw)}
    {#each rawLeft as left, i (i)}<p class="f-more" dir="auto">{left}</p>{/each}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .faults {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .f-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .f-said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .f-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) calc(-1 * var(--sp-3)) 0;
    padding: 0;
    list-style: none;
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .f-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .f-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    box-sizing: border-box;
    min-block-size: var(--row-h);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pop);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    text-decoration: none;
  }

  a.f-line {
    transition: background var(--d-state) var(--ease-out);
  }

  a.f-line:hover {
    background: var(--hover);
  }

  .f-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .f-title {
    font-weight: 500;
  }

  /* THE FIX, under what is wrong, in the quieter ink and at the row's own size. */
  .f-fix {
    color: var(--ink-3);
  }

  .f-go {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--ink-3);
  }

  .f-more {
    margin: var(--sp-3) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  /* UNDER A THUMB A LINK IS 44 (13 §7): the pointer and not the width, as every row is. */
  @media (pointer: coarse) {
    a.f-line {
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    a.f-line {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .faults {
      border: 1px solid CanvasText;
    }
  }
</style>
