<!--
  THE BRIEFING ON TODAY (`briefing.ts`): what matters today, one sentence a card, each opening its own thing.

  A PLAIN LIST AND NOTHING ELSE. The record picked the cards, ordered them and wrote the lines, so this draws them as it
  was handed them: no count, no colour of its own, no mark saying how urgent one is, because the sentence already says.
  A line Slash wrote says so, in the word the page menu uses for what Slash arranged; a line the rules wrote says
  nothing, since that is the record speaking for itself.

  WHY THE RULES WROTE IT IS ONE QUIET LINE UNDER THE CARDS (`footOf`), where the record said why: plain words at the
  size of a line, no pill, no mark and no colour of its own. A screen that passes no foot draws none.

  NOTHING IS DRAWN FOR NO CARDS: not a heading, not an empty state. Today reads as it did before there was a briefing.

  THE TILE'S HEAD IS EVERY TILE'S (`ui/Tile.svelte`): the glyph in its well, then the name. It stood on Today as the one
  tile with no glyph, over tiles that all have one.

  A SENTENCE WRAPS, where a row's title is cut with an ellipsis: a card is one sentence of up to 140 characters and the
  whole of it is the point. Each link is 44 tall under a thumb.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { BriefingRow } from './briefing.ts';

  let { cards, foot = null }: { cards: readonly BriefingRow[]; foot?: string | null } = $props();

  const words = {
    title: 'Briefing',
    slash: 'Slash',
    /** Said in full to a screen reader and as the tooltip, where the eye gets the one word. */
    bySlash: 'Slash wrote this line',
  } as const;
</script>

{#if cards.length > 0}
  <Tile icon="doc" title={words.title} data-briefing-tile>
    <!-- ONE CHILD OF THE TILE, so the foot stands close under the cards and not a tile's gap away. -->
    <div class="b-body">
    <ul class="brief" data-briefing>
      {#each cards as card (card.key)}
        <li>
          {#if card.parts}
            <!-- THE WRITTEN BRIEF: a paragraph, each figure or name opening its own row. -->
            <p class="b-line b-written" data-written dir="auto">
              <span class="b-text">{#each card.parts as part}{#if part.href}<a class="b-part" href={at(part.href)}>{part.text}</a>{:else}{part.text}{/if}{/each}</span>
            </p>
          {:else if card.href}
            <a class="b-line" href={at(card.href)} data-by={card.by}>
              <span class="b-text" dir="auto">{card.line}</span>
              {#if card.by === 'slash'}<span class="b-by" title={words.bySlash}><span aria-hidden="true">{words.slash}</span><span class="sr-only">{words.bySlash}</span></span>{/if}
              <span class="b-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
            </a>
          {:else}
            <p class="b-line" data-by={card.by}>
              <span class="b-text" dir="auto">{card.line}</span>
              {#if card.by === 'slash'}<span class="b-by" title={words.bySlash}><span aria-hidden="true">{words.slash}</span><span class="sr-only">{words.bySlash}</span></span>{/if}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if foot}<p class="b-foot" data-briefing-foot dir="auto">{foot}</p>{/if}
    </div>
  </Tile>
{/if}

<style>
  .b-body {
    min-inline-size: 0;
  }

  .brief {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--sp-1));
    padding: 0;
    list-style: none;
  }

  /* THE HAIRLINE BETWEEN TWO CARDS, as between two rows of any list here (`ui/rows.css`). */
  .brief > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .b-line {
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

  a.b-line {
    transition: background var(--d-state) var(--ease-out);
  }

  a.b-line:hover {
    background: var(--hover-wash);
  }

  .b-text {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* A paragraph reads as one, where a card is a row: its links are the words themselves, underlined quietly. */
  .b-written {
    align-items: flex-start;
  }

  .b-part {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 3px;
  }

  .b-part:hover {
    text-decoration-color: currentColor;
  }

  .b-by {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .b-go {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--dim);
  }

  /* THE FOOT, under the last card and in line with the cards' own words: 15px, and it wraps at any width. */
  .b-foot {
    margin: 0;
    padding: var(--sp-2) var(--sp-2) 0;
    color: var(--dim);
    font-size: var(--t-row);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  /* UNDER A THUMB A LINK IS 44 (13 §7): the pointer and not the width, as every row is. */
  @media (pointer: coarse) {
    a.b-line {
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    a.b-line {
      transition: none;
    }
  }
</style>
