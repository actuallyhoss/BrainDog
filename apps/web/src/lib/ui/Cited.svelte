<!--
  A sentence Slash wrote, with every brace drawn as what it stands for (`lib/cite.ts`).

  ONE RENDERER FOR EVERY SCREEN THAT PRINTS SLASH'S WORDS: the palette's answer and the options card of Needs you draw through
  this, so a row, a figure and a total read the same in both, and no brace reaches either.

  A ROW IS A LINK TO THE ROW, NAMED BY ITS TITLE. An amount is `Money`, so it reads in the record's own currency. A total
  is a button: the figure, and one press away the rows it adds up, because a total nobody can open is a total nobody can
  check. The words between the braces go through `moneyInText`, since a sentence written by something other than Slash
  may hold "GBP 2400.00" as text.

  INLINE, SO IT SITS INSIDE WHATEVER PARAGRAPH HOLDS IT. The rows of a total are spans drawn as a block, because a list
  element cannot live inside a paragraph and a paragraph is where this is put. Every link and the total's button carry
  `.tap`: on a coarse pointer each is a 44px target even inside a line of text.

  THE MARKUP BELOW IS WRITTEN WITHOUT WHITESPACE BETWEEN PIECES, on purpose. A sentence is split at every brace, and a
  line break between two pieces would draw a space before a full stop.
-->
<script lang="ts">
  import { integer, money } from 'braindog-render';
  import { at } from '../at.ts';
  import { cited, words } from '../cite.ts';
  import { moneyInText } from '../record/money.ts';
  import Money from './Money.svelte';

  let { text, figures = {}, now }: { text: string; figures?: Record<string, unknown>; now?: number | undefined } = $props();

  const pieces = $derived(cited(text, figures, now));
  /** Which total has its rows open, by its place in the sentence. One at a time: a second press on it closes it. */
  let opened = $state<number | null>(null);

  const totalWords = (minor: number, currency: string | null): string => (currency === null ? integer(minor) : moneyInText(money(minor, currency)));
</script>

<span class="cited">{#each pieces as piece, i}{#if piece.kind === 'text'}{moneyInText(piece.text)}{:else if piece.kind === 'words'}{piece.text}{:else if piece.kind === 'row'}<a class="cite-row tap" href={at(piece.href)}>{piece.title}</a>{:else if piece.kind === 'money'}<Money minor={piece.minor} currency={piece.currency} />{:else}<button
        type="button"
        class="cite-sum tap"
        aria-expanded={opened === i}
        aria-label={`${totalWords(piece.minor, piece.currency)}: ${words.sumRows(piece.n)}`}
        onclick={() => (opened = opened === i ? null : i)}
        >{#if piece.currency !== null}<Money minor={piece.minor} currency={piece.currency} weight="strong" />{:else}<span class="cite-count">{integer(piece.minor)}</span>{/if}</button
      >{#if opened === i}<span class="cite-rows" role="list" aria-label={words.sumRows(piece.n)}>{#each piece.rows as row}<span class="cite-item" role="listitem"><a class="cite-row tap" href={at(row.href)}>{row.title}</a></span>{/each}{#if piece.n > piece.rows.length}<span class="cite-item cite-more" role="listitem">{words.sumMore(piece.n - piece.rows.length)}</span>{/if}</span>{/if}{/if}{/each}</span>

<style>
  /* A LONG ROW TITLE OR A PASTED ADDRESS BREAKS WHERE IT MUST, so a phone never scrolls sideways under an answer. */
  .cited {
    overflow-wrap: anywhere;
  }

  .cite-row {
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .cite-sum {
    display: inline;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--link);
    font: inherit;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .cite-count {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* THE ROWS OF A TOTAL, UNDER THE LINE THAT HOLDS IT, one to a line and set in from it. */
  .cite-rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block: var(--sp-2);
    padding-inline-start: var(--sp-3);
  }

  .cite-item {
    display: block;
  }

  .cite-more {
    color: var(--dim);
  }
</style>
