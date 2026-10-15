<!--
  A shared page, `/s#<token>`: one page of a record, read-only, for whoever holds the link.

  A SHARE LINK IS A CAPABILITY URL (19 §5): signed, read-only, scoped to one page, and closed for good when its owner
  closes it. THE TOKEN IS IN THE FRAGMENT, which no browser sends to a host and no log keeps, and it is read once and
  wiped from the address bar (`reading.ts` `takeShared`), as an invitation is. The record answers it through
  `sharedPage`, asked with the link and no other credential (`share-write.ts` `readShared`), and the answer is the page
  as its owner could read it now, one level deep: no row's id, no list's name, no link into the record and nothing that
  writes.

  SO THIS DRAWS ITS OWN BLOCKS AND NOT `PageBody`'s. A shared block carries the owner's words, the columns' labels, each
  drawn field as a typed cell and the figures, and every one of them is drawn in the record's language and zone, which
  the answer carries, so a stranger's device never decides how an amount or a day reads.

  THE LOOK IS THE BOARD'S (DIRECTION 39): a flat bar with the mark, the name and what the link is; the page's name at 28
  and one sentence at 17; the owner's blocks as flat tiles on twelve columns, and "Made with BrainDog" at the foot.

  NO RAIL AND NO PALETTE: the root layout draws `/s` bare. A LINK THAT DOES NOT OPEN SAYS THE PAGE IS NOT SHARED AND NOT
  WHY: closed, run out, a page that is gone and a forged link are one answer at the record, so they are one sentence here.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { AMOUNT_SPACE } from 'braindog-render';
  import { titleOf } from '$lib/title.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { fieldSaid, readShared, words, type SharedBlock, type SharedColumn, type SharedRead } from '$lib/record/share-write.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { cellSaid, figureSaid, headOf, plainSaid, takeShared, type Said, type Where } from './reading.ts';

  /* THE ONE WORD THIS SCREEN ADDS: the action under a dead link. The rest are `share-write.ts`'s. */
  const shareWords = { whatItIs: 'See what BrainDog is' };

  /* THE LINK, HELD IN THIS PAGE'S MEMORY ONLY: never in the address, never printed, never logged. */
  let token = '';
  let got = $state<SharedRead | null>(null);
  let now = $state(Date.now());

  async function read() {
    const at = opened();
    got = null;
    /* `/s` names no record (`RECORDLESS` in `lib/at.ts`), so `apiBase()` answers the bare origin here. */
    const out = await readShared(apiBase(), token);
    now = Date.now();
    got = out;
    /* A LINK THAT DOES NOT OPEN IS AN ANSWER, not a failure: the record was asked and said no, and the screen draws that
       as its designed empty state. Only a record nobody reached refuses the screen. */
    closed(out.from !== 'unreached', at);
  }

  /* ONCE, ON ARRIVAL: the fragment is taken and the address wiped before anything is asked. */
  $effect(() => {
    token = takeShared(location.hash, () => history.replaceState(history.state, '', `${location.pathname}${location.search}`));
    untrack(() => void read());
  });

  $effect(() => {
    if (got?.from === 'live') drew('ready');
  });

  /* THE RECORD'S CLOCK, LANGUAGE AND ZONE: "3d ago" is counted from when the owner's record was read, in its zone. */
  const where = $derived.by((): Where => {
    if (got?.from !== 'live') return { language: 'en', zone: 'UTC', now };
    const t = got.page.read_at === null ? Number.NaN : Date.parse(got.page.read_at);
    return { language: got.page.language, zone: got.page.zone, now: Number.isFinite(t) ? t : now };
  });

  const head = $derived(got === null ? null : headOf(got));

  /** The columns a block draws, or the one field each row keeps when the block named none. */
  function columnsOf(b: SharedBlock): (SharedColumn & { label: string })[] {
    if (b.columns.length > 0) return b.columns.map((c) => ({ ...c, label: c.label ?? fieldSaid(c.field) }));
    const first = b.rows[0];
    const field = first ? (Object.keys(first.cells)[0] ?? Object.keys(first.fields)[0]) : undefined;
    return field === undefined ? [] : [{ field, label: fieldSaid(field) }];
  }

  /** The owner's words, a paragraph to each blank line. */
  const paragraphs = (body: string): string[] =>
    body
      .split(/\n\s*\n/u)
      .map((p) => p.trim())
      .filter((p) => p !== '');
</script>

<svelte:head>
  <title>{titleOf(got?.from === 'live' ? got.page.title : 'Shared')}</title>
  <!-- THE LINK IS THE CREDENTIAL, and a `Referer` would carry it to wherever the reader goes next. -->
  <meta name="referrer" content="no-referrer" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet value(s: Said)}
  {#if 'money' in s}<span class="amount num">{s.money.lead}{s.money.whole}<span class="fraction">{s.money.fraction}</span>{#if s.money.iso}<span class="iso">{AMOUNT_SPACE}{s.money.iso}</span>{/if}</span>{:else}{s.text}{/if}
{/snippet}

{#snippet blockBody(b: SharedBlock)}
  {@const cols = columnsOf(b)}
  {#if b.refused}<p class="block-note">{b.refused}</p>{/if}
  {#if b.body}
    {#each paragraphs(b.body) as para, n (n)}<p class="block-body">{para}</p>{/each}
  {/if}

  {#if b.readings.length > 0}
    <dl class="figures">
      {#each b.readings as r, n (n)}
        <div class="figure">
          <dt class="figure-label">{r.label ?? fieldSaid(r.metric)}</dt>
          <dd class="figure-value num">{@render value(figureSaid(r, where))}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  {#if b.authored.length > 0}
    <table class="rows">
      <tbody>
        {#each b.authored as cells, n (n)}
          <tr>{#each cells as c, k (k)}<td class="cell">{plainSaid(c, where)}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if cols.length > 0 && b.rows.length > 0}
    <table class="rows">
      <thead>
        <tr>{#each cols as c (c.field)}<th class="head-cell" scope="col">{c.label}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each b.rows as row, n (n)}
          <tr>
            {#each cols as c (c.field)}
              <td class="cell" data-label={c.label}>{@render value(cellSaid(row, c, where))}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if b.matched > b.rows.length}<p class="block-note">{words.sharedShowing(b.rows.length, b.matched)}</p>{/if}
  {:else if b.rows.length === 0 && b.readings.length === 0 && b.authored.length === 0 && !b.body && b.empty}
    <p class="block-note">{b.empty}</p>
  {/if}
{/snippet}

<div class="shared">
  <!-- FLAT, ON THE BOARD: the mark, the name, and what this link is in words. -->
  <header class="bar">
    <span class="brand">
      <Mark height={20} />
      <span class="wordmark">{copy.product}</span>
    </span>
    <span class="what"><Icon name="eye" size="s" /><span class="what-word">{words.sharedChip}</span></span>
  </header>

  {#if got === null || head === null}
    <Waiting head />
  {:else if got.from === 'shut'}
    <!-- NO REASON, AND ONE ACTION: the person holding a dead link cannot mend it from here, so the one thing offered is
         where it came from, the product, rather than an empty end. -->
    <div class="gone">
      <Empty kind="no-permission" heading glyph="link" title={head.title} body={head.line}>
        {#snippet actions()}<Button href="https://brain.dog">{shareWords.whatItIs}</Button>{/snippet}
      </Empty>
    </div>
  {:else if got.from === 'unreached'}
    <!-- THE TRANSPORT'S WORDS FOLD UNDER DETAILS, never as the sentence: they are for whoever reports the fault. -->
    <div class="gone">
      <Empty kind="error" heading title={head.title} detail={got.why}>
        {#snippet actions()}<Button onclick={() => void read()}>{words.sharedRetry}</Button>{/snippet}
      </Empty>
    </div>
  {:else}
    {@const p = got.page}
    <article class="page" aria-labelledby="shared-title" lang={p.language}>
      <div class="head">
        <h1 class="title" id="shared-title">{head.title}</h1>
        <p class="until">{head.line}</p>
      </div>

      {#if p.empty}
        <section class="block tile"><p class="block-body">{p.empty}</p></section>
      {:else}
        <div class="blocks">
          {#each p.blocks as b, i (i)}
            <section class="block tile" style:--span={b.span ?? 12} aria-labelledby={b.heading ? `shared-b${i}` : undefined}>
              {#if b.heading}<h2 class="block-head" id="shared-b{i}">{b.heading}</h2>{/if}
              {@render blockBody(b)}
            </section>
          {/each}
        </div>
      {/if}
    </article>
  {/if}

  <footer class="made">
    <a class="made-link" href="https://brain.dog" rel="noreferrer"><Mark height={14} />{words.sharedMade}</a>
  </footer>
</div>

<style>
  /* THE WHOLE WINDOW ON THE BOARD: the gutter at the sides (16 on a phone), clear of the notch and the home indicator.
     No cap and no centred column: the blocks run on twelve columns to the gutters. */
  .shared {
    display: grid;
    align-content: start;
    gap: var(--sp-6);
    box-sizing: border-box;
    min-block-size: 100dvh;
    padding: calc(var(--inset) + env(safe-area-inset-top)) var(--gutter) calc(var(--sp-5) + env(safe-area-inset-bottom));
    background: var(--board);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  /* `Waiting` pays the gutter itself when it draws a head, and the column already has. */
  .shared :global(.waiting.head) {
    padding-inline: 0;
  }

  /* ── The bar: flat, on the board, no fill of its own, no blur, no shadow, no border ───────── */

  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 52px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
    white-space: nowrap;
  }

  /* WHAT THE LINK IS, IN WORDS at the bar's end, in the second ink: not a pill, since pills are only for counts. */
  .what {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    margin-inline-start: auto;
    color: var(--ink2);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    white-space: nowrap;
  }

  /* AT 320 THE WORDS GIVE WAY BEFORE THE BAR DOES. */
  .what-word {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── The page's head: its name at 28 and one sentence at 17 ───────────────────────────── */

  .page {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .head {
    display: grid;
    gap: var(--sp-1);
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-page);
    font-weight: var(--fw-semi);
    line-height: calc(34 / 28);
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }

  .until {
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-head);
    line-height: 24px;
  }

  /* ── The blocks: flat tiles, radius 16, no border and no shadow ───────────────────────── */

  .blocks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  .tile {
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--tile-r);
    color: var(--ink);
  }

  .block-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .block-body {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .block-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* ── Figures ──────────────────────────────────────────────────────────────────────────── */

  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: var(--sp-5) var(--sp-4);
    margin: 0;
  }

  .figure {
    display: grid;
    align-content: start;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .figure-label {
    color: var(--ink2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 18px;
  }

  .figure-value {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    line-height: 28px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  /* AN AMOUNT'S FRACTION AND ITS CODE ARE QUIETER than its whole, as the app's own money is set. */
  .fraction,
  .iso {
    color: var(--ink2);
  }

  /* ── Tables: hairlines between the rows and none round the table ──────────────────────── */

  .rows {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .head-cell {
    padding: 0 var(--sp-3) var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-align: start;
  }

  .cell {
    padding: var(--sp-3);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .rows tr + tr .cell {
    border-block-start: 1px solid var(--line);
  }

  .head-cell:first-child,
  .cell:first-child {
    padding-inline-start: 0;
  }

  .head-cell:last-child,
  .cell:last-child {
    padding-inline-end: 0;
  }

  /* ── A link that does not open ────────────────────────────────────────────────────────── */

  .gone {
    justify-self: start;
    inline-size: min(56ch, 100%);
    padding-block-start: var(--sp-7);
  }

  /* ── The foot ─────────────────────────────────────────────────────────────────────────── */

  .made {
    display: flex;
    padding-block-start: var(--sp-5);
  }

  /* A link out of a shared page is the first thing a stranger to this product ever presses: 44 on both axes. */
  .made-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .made-link:hover {
      color: var(--ink);
      text-decoration: underline;
    }
  }

  /* BELOW 640px A ROW IS A STACK: each cell on its own line under its column's name, so a wide table never pushes the
     page sideways. */
  @media (width < 640px) {
    .rows thead {
      display: none;
    }

    .rows tr {
      display: grid;
      gap: var(--sp-2);
      padding-block: var(--sp-3);
    }

    .rows tr + tr {
      border-block-start: 1px solid var(--line);
    }

    .rows tr + tr .cell {
      border-block-start: 0;
    }

    .cell {
      padding: 0;
    }

    .cell[data-label]::before {
      content: attr(data-label);
      display: block;
      color: var(--dim);
      font-size: var(--fs-meta);
      line-height: 18px;
    }
  }

  /* THE PHONE: the page's name at its phone size. */
  @media (width < 900px) {
    .title {
      font-size: var(--fs-page-phone);
      line-height: calc(28 / 22);
    }
  }

  @media (width >= 900px) {
    .blocks {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .block {
      grid-column: span var(--span);
    }
  }

  /* FORCED COLOURS DROP THE TILES' FILL, so each keeps an edge to be told by. */
  @media (forced-colors: active) {
    .tile {
      outline: 1px solid CanvasText;
    }
  }
</style>
