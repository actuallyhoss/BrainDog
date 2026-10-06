<!--
  A shared page, `/s/<token>`: one page of a record, read-only, for whoever holds the link.

  A SHARE LINK IS A CAPABILITY URL (19 §5): signed, read-only, scoped to one page, and closed for good when its owner
  closes it. The record answers it through `sharedPage`, asked with the link and no other credential
  (`share-write.ts` `readShared`), and the answer is the page as its owner could read it now, one level deep: no row's
  id, no list's name, no link into the record and nothing that writes.

  SO THIS DRAWS ITS OWN BLOCKS AND NOT `PageBody`'s. The page reader draws a block from its list's declaration (its
  fields' types, its labels, its links to other rows), and a shared block carries none of that on purpose, because
  each would name a part of the record the link does not open. What it carries is the owner's words, the columns' labels,
  the plain values of the fields those columns draw, and the figures, and that is what is drawn here.

  IT IS THE ONE SCREEN A STRANGER SEES, SO IT IS THE LOOK AT ITS CALMEST. The ground and its one
  light, a glass bar floating 12 from the top with the mark, the name and what the link is, the page's title and the
  day the link stops working, and then the owner's blocks on twelve columns: a block that holds figures or rows is a
  white tile with an icon on its heading, and a block of the owner's words sits on the ground with no box. Geist for
  every word, and no red but the mark: nothing on a page somebody was sent needs them.

  NO RAIL AND NO PALETTE: the root layout draws `/s/` bare (`+layout.svelte` `bare`). A LINK THAT DOES NOT OPEN SAYS
  THE PAGE IS NOT SHARED AND NOT WHY: closed, run out, a page that is gone and a forged link are one answer at the
  record, so they are one sentence here.
-->
<script lang="ts">
  /* A TABLE'S VALUE CELLS HERE ARE `.cell`, the stat's own name, and draw with its rule (`kinds/stat.css`), which
     arrives with declared pages and so is asked for by name. */
  import '@braindog/skin/kinds/stat.css';
  import { page as route } from '$app/state';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { day, money, since } from 'braindog-render';
  import { fieldSaid, readShared, words, type SharedBlock, type SharedRead, type SharedReading } from '$lib/record/share-write.ts';
  import Mark from '$lib/ui/Mark.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Sparkline from '$lib/viz/Sparkline.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { trendOf, trendSaid } from './reading.ts';

  const token = $derived(route.params.token ?? '');

  /* THE ONE WORD THIS SCREEN ADDS: the action under a dead link. The rest are `share-write.ts`'s. */
  const shareWords = { whatItIs: 'See what BrainDog is' };

  let got = $state<SharedRead | null>(null);
  let now = $state(Date.now());

  async function read(asked: string) {
    const at = opened();
    got = null;
    /* `/s/<token>` names no record (`RECORDLESS` in `lib/at.ts`), so `apiBase()` answers the bare origin here, the
       same address `globalThis.location.origin` named, through the one function the rest of the app reads it by. */
    const out = await readShared(apiBase(), asked);
    /* An answer for a link somebody has already left draws nothing. */
    if ((route.params.token ?? '') !== asked) return closed(true, at);
    now = Date.now();
    got = out;
    /* A LINK THAT DOES NOT OPEN IS AN ANSWER, not a failure: the record was asked and said no, and the screen draws that
       as its designed empty state. Only a record nobody reached refuses the screen. */
    closed(out.from !== 'unreached', at);
  }

  $effect(() => {
    const asked = token;
    untrack(() => void read(asked));
  });

  /* DRAWN ONCE THE PAGE IS HERE. A link that does not open is an `Empty`, which says what it is itself. */
  $effect(() => {
    if (got?.from === 'live') drew('ready');
  });

  /* TODAY IS THE RECORD'S where it said what its clock read, as the page reader takes it, so "3d ago" on a shared page
     is counted from the day the owner's record was read and not from a visitor's clock. */
  const today = $derived.by(() => {
    if (got?.from !== 'live' || got.page.read_at === null) return now;
    const t = Date.parse(got.page.read_at);
    return Number.isFinite(t) ? t : now;
  });

  const DAY = /^\d{4}-\d{2}-\d{2}$/u;
  const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
  const CURRENCY = /^[A-Z]{3}$/u;

  /** One plain value as a person reads it. A shared row holds nothing else: the record kept only plain values. */
  function said(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? words.sharedYes : words.sharedNo;
    if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString() : '';
    if (typeof v === 'string') return DAY.test(v) ? day(v) : INSTANT.test(v) ? since(v, today) : v;
    if (Array.isArray(v)) return v.map(said).filter((s) => s !== '').join(', ');
    return '';
  }

  /** How a reading's numbers are written: money in its currency, a count with its unit, or a plain number. */
  const formatOf =
    (r: SharedReading) =>
    (n: number): string => {
      if (r.unit !== null && CURRENCY.test(r.unit)) return money(n, r.unit);
      const plain = n.toLocaleString();
      return r.unit === null ? plain : `${plain} ${r.unit}`;
    };

  /** A figure, or the words for a reading that has none. */
  const figure = (r: SharedReading): string => (r.value === null ? words.sharedNoFigure : formatOf(r)(r.value));

  /** The columns a block draws, or the one field each row keeps when the block named none. */
  function columnsOf(b: SharedBlock): { field: string; label: string }[] {
    if (b.columns.length > 0) return b.columns.map((c) => ({ field: c.field, label: c.label ?? fieldSaid(c.field) }));
    const first = b.rows[0];
    const field = first ? Object.keys(first.fields)[0] : undefined;
    return field === undefined ? [] : [{ field, label: fieldSaid(field) }];
  }

  /**
   * WHETHER A BLOCK IS A TILE. A block that holds figures, a table the owner wrote or rows is content with a shape of
   * its own, so it stands on a white tile with its heading's icon. One that holds the owner's words and
   * nothing else is read as a page is read, on the ground with no box, and so is a heading the link keeps alone.
   */
  const tiled = (b: SharedBlock): boolean => b.readings.length > 0 || b.authored.length > 0 || b.rows.length > 0 || b.columns.length > 0;

  /** The glyph on a tile's heading: money when every figure is in a currency, figures otherwise, rows for a table. */
  function iconOf(b: SharedBlock): 'money' | 'board' | 'rows' {
    if (b.readings.length === 0) return 'rows';
    return b.readings.every((r) => r.unit !== null && CURRENCY.test(r.unit)) ? 'money' : 'board';
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

{#snippet blockBody(b: SharedBlock, cols: { field: string; label: string }[])}
  {#if b.refused}
    <p class="block-note">{b.refused}</p>
  {:else}
    {#if b.body}
      {#each paragraphs(b.body) as para, n (n)}<p class="block-body">{para}</p>{/each}
    {/if}

    {#if b.readings.length > 0}
      <!-- EACH FIGURE IS ITS LABEL AND ITS NUMBER, and where the record sent how it moved, the line of it at the top right
           and one sentence under it saying which way and by how much. -->
      <dl class="figures">
        {#each b.readings as r, n (n)}
          {@const trend = trendOf(r)}
          {@const label = r.label ?? fieldSaid(r.metric)}
          {@const line = trend ? trendSaid(trend, formatOf(r)) : null}
          <div class="figure" data-trend={trend ? '' : undefined}>
            <dt class="tile-label">{label}</dt>
            <dd class="tile-figure num">{figure(r)}</dd>
            {#if trend}
              <dd class="figure-trend"><Sparkline values={trend} subject={label} format={formatOf(r)} /></dd>
              {#if line}<dd class="figure-reading">{line}</dd>{/if}
            {/if}
          </div>
        {/each}
      </dl>
    {/if}

    {#if b.authored.length > 0}
      <table class="rows">
        <tbody>
          {#each b.authored as cells, n (n)}
            <tr>{#each cells as c, k (k)}<td class="cell">{said(c)}</td>{/each}</tr>
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
                <td class="cell" data-label={c.label}>{said(row.fields[c.field])}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
      {#if b.matched > b.rows.length}<p class="block-note">{words.sharedShowing(b.rows.length, b.matched)}</p>{/if}
    {:else if b.rows.length === 0 && b.readings.length === 0 && b.authored.length === 0 && !b.body && b.empty}
      <p class="block-note">{b.empty}</p>
    {/if}
  {/if}
{/snippet}

<div class="shared">
  <!-- CHROME, SO GLASS: the mark, the name and what this link is, floating 12 from the top and staying there. -->
  <header class="bar">
    <span class="brand">
      <Mark height={20} />
      <span class="wordmark">{copy.product}</span>
    </span>
    <span class="chip"><Icon name="eye" size="s" /><span class="chip-word">{words.sharedChip}</span></span>
  </header>

  {#if got === null}
    <Waiting head />
  {:else if got.from === 'shut'}
    <!-- NO REASON. Every way a link fails is one answer at the record, so the page says it is not shared and who can fix
         that, and nothing about which way it failed. AND ONE ACTION: the person holding a dead link cannot mend
         it from here, so the one thing offered is where it came from, the product, rather than an empty end. -->
    <div class="gone">
      <Empty kind="no-permission" heading glyph="link" title={words.sharedDead} body={words.sharedDeadBody}>
        {#snippet actions()}<Button href="https://brain.dog">{shareWords.whatItIs}</Button>{/snippet}
      </Empty>
    </div>
  {:else if got.from === 'unreached'}
    <!-- THE TRANSPORT'S WORDS FOLD UNDER DETAILS, never as the sentence: they are for whoever reports the fault. -->
    <div class="gone">
      <Empty kind="error" heading title={words.sharedUnreached} detail={got.why}>
        {#snippet actions()}<Button onclick={() => void read(token)}>{words.sharedRetry}</Button>{/snippet}
      </Empty>
    </div>
  {:else}
    {@const p = got.page}
    <article class="page" aria-labelledby="shared-title">
      <div class="head">
        <h1 class="title" id="shared-title">{p.title}</h1>
        <!-- THE SENTENCE, IN THE SECOND INK AND NEVER RED: a link that runs out is information, not something that
             needs whoever is reading. -->
        <p class="until">{words.sharedUntil(day(p.expires_at.slice(0, 10)))}</p>
      </div>

      <div class="blocks">
        {#each p.blocks as b, i (i)}
          {@const cols = columnsOf(b)}
          {#if tiled(b)}
            <section class="block tile" style:--span={b.span ?? 12} aria-labelledby={b.heading ? `shared-b${i}` : undefined}>
              {#if b.heading}
                <header class="tile-head">
                  <IconWell name={iconOf(b)} />
                  <h2 class="tile-title" id="shared-b{i}">{b.heading}</h2>
                </header>
              {/if}
              {@render blockBody(b, cols)}
            </section>
          {:else}
            <section class="block prose" style:--span={b.span ?? 12} aria-labelledby={b.heading ? `shared-b${i}` : undefined}>
              {#if b.heading}<h2 class="block-head" id="shared-b{i}">{b.heading}</h2>{/if}
              {@render blockBody(b, cols)}
            </section>
          {/if}
        {/each}
      </div>
    </article>
  {/if}

  <footer class="made">
    <a class="made-link" href="https://brain.dog" rel="noreferrer"><Mark height={14} />{words.sharedMade}</a>
  </footer>
</div>

<style>
  /* THE WHOLE WINDOW: 12 in from the top under the notch, the page's gutter at the sides (16 on a phone), and clear of
     a phone's home indicator at the foot. No cap and no centred column: the blocks run on twelve columns to the
     gutters, and a block of words keeps its own reading measure. */
  .shared {
    display: grid;
    align-content: start;
    gap: var(--sp-6);
    box-sizing: border-box;
    min-block-size: 100dvh;
    padding: calc(var(--inset) + env(safe-area-inset-top)) var(--gutter) calc(var(--sp-5) + env(safe-area-inset-bottom));
  }

  /* `Waiting` pays the gutter itself when it draws a head, and the column already has. */
  .shared :global(.waiting.head) {
    padding-inline: 0;
  }

  /* ── The bar ───────────────────────────────────────────────────────────── */

  /* LEVEL TWO GLASS: the frosted fill, its blur, the hairline pair and the chrome's shadow. It stays
     12 from the top while the page passes under it, which is the only thing on this screen that moves. */
  .bar {
    position: sticky;
    inset-block-start: calc(var(--inset) + env(safe-area-inset-top));
    z-index: var(--z-sheet);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 52px;
    padding-inline: var(--sp-4) var(--sp-3);
    background: var(--glass);
    backdrop-filter: var(--glass-blur);
    border-radius: var(--r-lg);
    box-shadow: var(--glass-edge), var(--e2);
  }

  /* Safari before 18 knows the blur only by its prefixed name, and lightningcss folds a same-rule pair into one. */
  @supports (-webkit-backdrop-filter: none) {
    .bar {
      -webkit-backdrop-filter: var(--glass-blur);
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* GEIST, AS EVERY WORD IS: the wordmark was the display face, and there is one face now. */
  .wordmark {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
    white-space: nowrap;
  }

  /* WHAT THE LINK IS, as a quiet pill at the bar's end: read only, in the second ink, on the wash and not on glass,
     because glass never holds glass. */
  .chip {
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    min-inline-size: 0;
    gap: 6px;
    margin-inline-start: auto;
    min-block-size: var(--ctl-h-sm);
    padding-inline: var(--sp-3);
    background: var(--hover-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
  }

  /* AT 320 THE WORDS GIVE WAY BEFORE THE BAR DOES: the eye and the start of the sentence still say what the link is. */
  .chip-word {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── The page's head ───────────────────────────────────────────────────── */

  .page {
    display: grid;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .head {
    display: grid;
    gap: var(--sp-1);
  }

  /* `t-title`, 28/34 at 600, and the phone's large title below 900. */
  .title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: calc(34 / 28);
    letter-spacing: -0.02em;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }

  /* THE SENTENCE: 16/24 in the second ink. */
  .until {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 24px;
  }

  /* ── The blocks ────────────────────────────────────────────────────────── */

  /* ONE COLUMN, and twelve from 900px up, where each block takes the span its owner gave it, 12 apart. */
  .blocks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--inset);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  /* A TILE: the white surface, radius 22, padding 20, level one, and no border. Its own markup rather than
     `Tile`, because a stranger's screen reader reaches each block by its heading's id (`#shared-b{i}`). */
  .tile {
    gap: var(--sp-4);
    padding: 20px;
    background: var(--bg);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .tile-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--well);
  }

  .tile-title {
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  /* A BLOCK OF WORDS ON THE GROUND: its heading at the group size, and the text at the measure. */
  .prose {
    padding-block: var(--sp-2);
  }

  .block-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .block-body {
    margin: 0;
    max-inline-size: 68ch;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .block-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  /* ── Figures ───────────────────────────────────────────────────────────── */

  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
    gap: var(--sp-5) var(--sp-4);
    margin: 0;
  }

  /* A FIGURE WITH A TREND BESIDE IT TAKES THE ROOM FOR BOTH, so the number never wraps under its own line. */
  .figures:has(.figure[data-trend]) {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
  }

  /* THE LABEL OVER THE FIGURE, and where there is a trend, its line at the top right across both and the one sentence
     under them (the design system: "a sparkline sits in the stat tile's top right, 120×32"). */
  .figure {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: start;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    min-inline-size: 0;
  }

  .tile-label {
    grid-column: 1;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
  }

  .tile-figure {
    grid-column: 1;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-figure);
    font-weight: 600;
    line-height: calc(34 / 30);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .figure-trend {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    inline-size: 120px;
    margin: 0;
  }

  .figure-reading {
    grid-column: 1 / -1;
    margin: var(--sp-1) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 18px;
    text-wrap: pretty;
  }

  /* ── Tables ────────────────────────────────────────────────────────────── */

  /* HAIRLINES BETWEEN THE ROWS AND NONE ROUND THE TABLE: a row is 44, the head in meta, the cells at the body size. */
  .rows {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-base);
    line-height: 20px;
  }

  .head-cell {
    padding: 0 var(--sp-3) var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
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

  /* ── A link that does not open ─────────────────────────────────────────── */

  /* THE STATE IS THE PAGE, so its column stands in the middle of the window a step down from the bar; the words in it
     keep the start edge `Empty` gives them everywhere. */
  .gone {
    justify-self: center;
    inline-size: min(56ch, 100%);
    padding-block-start: var(--sp-7);
  }

  /* ── The foot ──────────────────────────────────────────────────────────── */

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
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .made-link:hover {
      color: var(--ink);
    }
  }

  /* BELOW 640px A ROW IS A CARD: each cell on its own line under its column's name, so a wide table never pushes the
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
      font-size: var(--t-sm);
      line-height: 18px;
    }
  }

  /* THE PHONE: the large title at 30/36, and the owner's words at 16 where a thumb holds the page. */
  @media (width < 900px) {
    .title {
      font-size: var(--t-figure);
      line-height: calc(36 / 30);
    }

    .block-body {
      font-size: var(--t-md);
      line-height: 24px;
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

  /* FORCED COLOURS DROP THE GLASS, THE FILL AND THE SHADOWS, so the bar and the tiles keep an edge to be told by. */
  @media (forced-colors: active) {
    .bar,
    .tile {
      outline: 1px solid CanvasText;
    }
  }
</style>
