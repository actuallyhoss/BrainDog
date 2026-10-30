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

  THE LOOK IS THE BOARD'S: a flat bar with the mark, the name and what the link is; the page's name at 28
  and one sentence at 17; the owner's blocks as flat tiles on twelve columns, and "Made with BrainDog" at the foot.

  NO RAIL AND NO PALETTE: the root layout draws `/s` bare. A LINK THAT DOES NOT OPEN SAYS THE PAGE IS NOT SHARED AND NOT
  WHY: closed, run out, a page that is gone and a forged link are one answer at the record, so they are one sentence here.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { AMOUNT_SPACE, parse } from 'braindog-render';
  import { Block, Markdown } from 'braindog-render/svelte';
  /* THE KINDS' AND THE CHARTS' SHEETS, as a declared page loads them (`PageView`), so a note's bar is bars here too. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  import { titleOf } from '$lib/title.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { fieldSaid, readShared, words, type SharedRead } from '$lib/record/share-write.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Lockup from '$lib/ui/Lockup.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { openOutside } from '$lib/shell.ts';
  /* The href stays for the context menu and screen readers; the click goes through the one door. */
  const outside = (e: MouseEvent) => {
    e.preventDefault();
    openOutside('https://brain.dog');
  };
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';
  import { cellSaid, figureSaid, headOf, noteOpts, plainSaid, pointSaid, shownBlocks, takeShared, trendLine, type Said, type Shown, type Where } from './reading.ts';
  import Sparkline from '$lib/viz/Sparkline.svelte';

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
    if (got?.from !== 'live') return { language: 'en', zone: 'UTC', now, home: null };
    const t = got.page.read_at === null ? Number.NaN : Date.parse(got.page.read_at);
    return { language: got.page.language, zone: got.page.zone, now: Number.isFinite(t) ? t : now, home: got.page.home };
  });

  const head = $derived(got === null ? null : headOf(got));

  /* WHAT THE PAGE DRAWS: its opening line under its name, and each block that has something to show (`shownBlocks`). */
  const shown = $derived(got?.from === 'live' ? shownBlocks(got.page.blocks, where) : { lead: null, blocks: [] as Shown[] });

  /**
   * THE OWNER'S NOTE, DRAWN AS THE APP DRAWS IT: the same parser and the same blocks a project's page uses, so a fence is
   * its chart, its chips or its steps and never its source. A fence the renderer could not read is left out, since its
   * source is for the owner to mend and not for whoever holds the link. Nothing in it links into the record (`noteOpts`):
   * a link the owner wrote to a path of the record is drawn as its words. The answer names no other page's link, so no
   * path is linked as one that is shared too.
   */
  const segmentsOf = (body: string) => parse(body, { page: true }).filter((s) => s.type !== 'degraded');
  const opts = $derived(noteOpts(where));
</script>

<svelte:head>
  <title>{titleOf(got?.from === 'live' ? got.page.title : 'Shared')}</title>
  <!-- THE LINK IS THE CREDENTIAL, and a `Referer` would carry it to wherever the reader goes next. -->
  <meta name="referrer" content="no-referrer" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet value(s: Said)}
  {#if 'money' in s}<span class="sum num">{s.money.lead}{s.money.whole}<span class="fraction">{s.money.fraction}</span>{#if s.money.iso}<span class="iso">{AMOUNT_SPACE}{s.money.iso}</span>{/if}</span>{:else}{s.text}{/if}
{/snippet}

{#snippet blockBody(s: Shown)}
  {@const b = s.block}
  {@const cols = s.columns}
  {#if b.refused}<p class="part-note">{b.refused}</p>{/if}
  {#if b.body}
    <div class="document note">
      {#each segmentsOf(b.body) as segment, n (n)}
        {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'markdown'}<Markdown {segment} {opts} />{/if}
      {/each}
    </div>
  {/if}

  {#if b.readings.length > 0}
    <dl class="figs">
      {#each b.readings as r, n (n)}
        {@const line = trendLine(r)}
        <div class="fig">
          <dt class="fig-label">{r.label ?? fieldSaid(r.metric)}</dt>
          <dd class="fig-value num">{@render value(figureSaid(r, where))}</dd>
          {#if line}<dd class="fig-trend"><Sparkline values={line} subject={r.label ?? fieldSaid(r.metric)} format={(n) => pointSaid(r, n, where)} /></dd>{/if}
        </div>
      {/each}
    </dl>
  {/if}

  {#if b.authored.length > 0}
    <table class="sheet">
      <tbody>
        {#each b.authored as cells, n (n)}
          <tr>{#each cells as c, k (k)}<td class="sheet-cell">{plainSaid(c, where)}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if cols.length > 0 && s.rows.length > 0}
    <table class="sheet">
      <thead>
        <tr>{#each cols as c (c.field)}<th class="sheet-head" scope="col">{c.label}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each s.rows as row, n (n)}
          <tr>
            {#each cols as c (c.field)}
              <td class="sheet-cell" data-label={c.label}>{@render value(cellSaid(row, c, where))}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if s.matched > s.rows.length}<p class="part-note">{words.sharedMore(s.matched - s.rows.length)}</p>{/if}
  {/if}
{/snippet}

<div class="shared">
  <!-- FLAT, ON THE BOARD: the mark, the name, and what this link is in words. -->
  <header class="bar">
    <Lockup />
    <!-- ONLY OVER A PAGE THAT IS SHARED (today F15): a dead link says so in its body, under no chip saying it is shared. -->
    {#if got?.from === 'live'}<span class="what"><Icon name="eye" size="s" /><span class="what-word">{words.sharedChip}</span></span>{/if}
  </header>

  {#if got === null || head === null}
    <Waiting head />
  {:else if got.from === 'shut'}
    <!-- NO REASON, AND ONE ACTION: the person holding a dead link cannot mend it from here, so the one thing offered is
         where it came from, the product, rather than an empty end. -->
    <div class="gone">
      <Empty kind="no-permission" heading glyph="link" title={head.title} body={head.line}>
        {#snippet actions()}<Button href="https://brain.dog" onclick={outside}>{shareWords.whatItIs}</Button>{/snippet}
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
        {#if shown.lead}<p class="lead">{shown.lead}</p>{/if}
        <p class="until">{head.line}</p>
      </div>

      {#if p.empty || shown.blocks.length === 0}
        <section class="part tile"><p class="part-body">{p.empty ?? words.sharedNothing}</p></section>
      {:else}
        <div class="blocks">
          {#each shown.blocks as s, i (i)}
            {#if s.block.kind === 'section'}
              <!-- A SECTION IS THE NAME OF WHAT FOLLOWS IT, as on the owner's page: a heading on the board, not a tile. -->
              <h2 class="section-head">{s.block.heading}</h2>
            {:else}
              {@const b = s.block}
              <section class="part tile" style:--span={b.span ?? 12} aria-labelledby={b.heading ? `shared-b${i}` : undefined} aria-label={b.heading ? undefined : copy.kindNames[b.kind]}>
                {#if b.heading}<h2 class="part-head" id="shared-b{i}">{b.heading}</h2>{/if}
                {@render blockBody(s)}
              </section>
            {/if}
          {/each}
        </div>
      {/if}
    </article>
  {/if}

  <footer class="made">
    <a class="made-link" href="https://brain.dog" rel="noreferrer" onclick={outside}><Mark height={14} />{words.sharedMade}</a>
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

  /* WHAT THE LINK IS, IN WORDS at the bar's end, in the second ink: not a pill, since pills are only for counts. */
  .what {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-inline-size: 0;
    margin-inline-start: auto;
    color: var(--ink-2);
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

  /* THE PAGE'S OPENING LINE, its owner's one sentence about it, under its name; when the link stops is quieter under it. */
  .lead {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink);
    font-size: var(--fs-head);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .until {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-head);
    line-height: 24px;
  }

  .lead + .until {
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* A SECTION'S NAME, on the board over the tiles it names, as the owner's page sets it. */
  .section-head {
    grid-column: 1 / -1;
    margin: var(--sp-4) 0 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
  }

  /* THE NOTE, AT A READING MEASURE: the renderer's blocks at the tile's width, its own headings under the tile's, never
     over them, as a project's note is set on its row. */
  .note {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .note :global(:is(p, ul, ol)) {
    max-inline-size: 68ch;
    margin: 0;
  }

  .note :global(:is(h1, h2, h3)) {
    margin: var(--sp-3) 0 0;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    letter-spacing: 0;
    line-height: 22px;
  }

  .note :global(:is(h1, h2, h3):first-child) {
    margin-block-start: 0;
  }

  /* ── The blocks: flat tiles, radius 16, no border and no shadow ───────────────────────── */

  .blocks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  .tile {
    padding: var(--tile-pad);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .part-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .part-body {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .part-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* ── Figures ──────────────────────────────────────────────────────────────────────────── */

  .figs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: var(--sp-5) var(--sp-4);
    margin: 0;
  }

  .fig {
    display: grid;
    align-content: start;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .fig-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 18px;
  }

  .fig-value {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    line-height: 28px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  /* THE FIGURE'S TREND, UNDER ITS NUMBER: the app's own sparkline, at most its 120px and narrower in a narrow tile. */
  .fig-trend {
    margin: var(--sp-1) 0 0;
    min-inline-size: 0;
  }

  /* AN AMOUNT'S FRACTION AND ITS CODE ARE QUIETER than its whole, as the app's own money is set. */
  .fraction,
  .iso {
    color: var(--ink-2);
  }

  /* ── Tables: hairlines between the rows and none round the table ──────────────────────── */

  .sheet {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .sheet-head {
    padding: 0 var(--sp-3) var(--sp-2);
    border-block-end: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-align: start;
  }

  .sheet-cell {
    padding: var(--sp-3);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .sheet tr + tr .sheet-cell {
    border-block-start: 1px solid var(--rule);
  }

  .sheet-head:first-child,
  .sheet-cell:first-child {
    padding-inline-start: 0;
  }

  .sheet-head:last-child,
  .sheet-cell:last-child {
    padding-inline-end: 0;
  }

  /* ── A link that does not open ────────────────────────────────────────────────────────── */

  .gone {
    justify-self: center;
    inline-size: min(56ch, 100%);
    padding-block-start: var(--sp-7);
  }

  /* ── The foot ─────────────────────────────────────────────────────────────────────────── */

  .made {
    display: flex;
    justify-content: center;
    padding-block-start: var(--sp-5);
  }

  /* A link out of a shared page is the first thing a stranger to this product ever presses: 44 on both axes. */
  .made-link {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    color: var(--ink-2);
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
    .sheet thead {
      display: none;
    }

    .sheet tr {
      display: grid;
      gap: var(--sp-2);
      padding-block: var(--sp-3);
    }

    .sheet tr + tr {
      border-block-start: 1px solid var(--rule);
    }

    .sheet tr + tr .sheet-cell {
      border-block-start: 0;
    }

    .sheet-cell {
      padding: 0;
    }

    .sheet-cell[data-label]::before {
      content: attr(data-label);
      display: block;
      color: var(--ink-3);
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

    .part {
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
