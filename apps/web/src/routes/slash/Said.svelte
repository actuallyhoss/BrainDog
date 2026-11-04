<!--
  Slash's words on its own page, each row it names drawn as a mention in the sentence: the row's glyph and its name in a
  small soft capsule, one press to the row. The same pieces `Cited` draws (`$lib/cite.ts`), so an amount is `Money` in
  the record's own currency and a total opens the rows it adds up; only a row is drawn as a mention rather than an
  underlined link, so the answer reads as structure and no row is named twice under it.

  THE MENTION IS INLINE, its padding on the line box and not around it, so a sentence keeps its line height as it streams
  and wraps where it must. The markup has no whitespace between pieces, on purpose: a line break would draw a space.
-->
<script lang="ts">
  import { integer, money } from 'braindog-render';
  import { at } from '$lib/at.ts';
  import { cited, words } from '$lib/cite.ts';
  import { moneyInText } from '$lib/record/money.ts';
  import Money from '$lib/ui/Money.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  let { text, figures = {}, icons }: { text: string; figures?: Record<string, unknown>; icons: ReadonlyMap<string, string> } = $props();

  /**
   * WHAT HAS ARRIVED WHOLE: a brace still streaming in ("{{ref:tas") is held back until it closes, so its letters never
   * flash as words before the mention takes their place.
   */
  function settled(t: string): string {
    const open = t.lastIndexOf('{{');
    if (open !== -1 && t.indexOf('}}', open) === -1) return t.slice(0, open);
    return t.endsWith('{') ? t.slice(0, -1) : t;
  }
  const pieces = $derived(cited(settled(text), figures));
  let opened = $state<number | null>(null);
  const glyph = (href: string): IconName => (icons.get(/^\/r\/([^/]+)\//u.exec(href)?.[1] ?? '') ?? 'rows') as IconName;
  const totalWords = (minor: number, currency: string | null): string => (currency === null ? integer(minor) : moneyInText(money(minor, currency)));
</script>

<span class="said">{#each pieces as piece, i}{#if piece.kind === 'text'}{moneyInText(piece.text)}{:else if piece.kind === 'words'}{piece.text}{:else if piece.kind === 'row'}<a class="mention tap" href={at(piece.href)}><Icon name={glyph(piece.href)} size="s" /><span class="mention-name">{piece.title}</span></a>{:else if piece.kind === 'money'}<strong class="fig"><Money minor={piece.minor} currency={piece.currency} /></strong>{:else}<button
        type="button"
        class="sum tap"
        aria-expanded={opened === i}
        aria-label={`${totalWords(piece.minor, piece.currency)}: ${words.sumRows(piece.n)}`}
        onclick={() => (opened = opened === i ? null : i)}
        >{#if piece.currency !== null}<Money minor={piece.minor} currency={piece.currency} weight="strong" />{:else}<span class="num">{integer(piece.minor)}</span>{/if}</button
      >{#if opened === i}<span class="sum-rows" role="list" aria-label={words.sumRows(piece.n)}>{#each piece.rows as row}<span role="listitem"><a class="mention tap" href={at(row.href)}><Icon name={glyph(row.href)} size="s" /><span class="mention-name">{row.title}</span></a></span>{/each}{#if piece.n > piece.rows.length}<span class="sum-more" role="listitem">{words.sumMore(piece.n - piece.rows.length)}</span>{/if}</span>{/if}{/if}{/each}</span>

<style>
  .said {
    overflow-wrap: anywhere;
  }

  /* A ROW IN THE SENTENCE: its glyph and name in a soft capsule, inline, padded on the line and not around it. */
  .mention {
    padding: 2px calc(7px * var(--dense, 1)) 2px calc(5px * var(--dense, 1));
    border-radius: 7px;
    background: var(--soft-fill);
    color: var(--ink);
    font-weight: var(--fw-medium);
    text-decoration: none;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    transition: background var(--d-state, 120ms) var(--ease-out, ease);
  }

  .mention :global(svg) {
    display: inline;
    margin-inline-end: var(--sp-1);
    color: var(--ink-3);
    vertical-align: -3px;
  }

  @media (hover: hover) {
    .mention:hover {
      background: var(--row-wash-press, var(--soft-fill));
    }
    .mention:hover .mention-name {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 35%, transparent);
      text-underline-offset: 3px;
    }
  }

  /* A FIGURE IS A NUMBER, set apart from the words round it. */
  .fig,
  .num {
    font-variant-numeric: tabular-nums;
    font-weight: var(--fw-semi);
    white-space: nowrap;
  }

  .sum {
    display: inline;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    text-decoration: underline dotted;
    text-decoration-color: color-mix(in srgb, var(--ink) 45%, transparent);
    text-underline-offset: 4px;
    cursor: pointer;
  }

  .sum-rows {
    display: flex;
    flex-wrap: wrap;
    gap: calc(6px * var(--dense, 1));
    margin-block: var(--sp-2);
  }

  .sum-more {
    color: var(--ink-3);
  }
</style>
