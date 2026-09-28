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

  NO RAIL AND NO PALETTE: the root layout draws `/s/` bare (`+layout.svelte` `bare`). A LINK THAT DOES NOT OPEN SAYS
  THE PAGE IS NOT SHARED AND NOT WHY: closed, run out, a page that is gone and a forged link are one answer at the
  record, so they are one sentence here.
-->
<script lang="ts">
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
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  const token = $derived(route.params.token ?? '');

  /* THE ONE WORD THIS SCREEN ADDS (DSN-18): the action under a dead link. The rest are `share-write.ts`'s. */
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
    closed(out.from === 'live', at);
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

  /** A figure: money in its currency, a count with its unit, or a plain number. */
  function figure(r: SharedReading): string {
    if (r.value === null) return words.sharedNoFigure;
    if (r.unit !== null && CURRENCY.test(r.unit)) return money(r.value, r.unit);
    const n = r.value.toLocaleString();
    return r.unit === null ? n : `${n} ${r.unit}`;
  }

  /** The columns a block draws, or the one field each row keeps when the block named none. */
  function columnsOf(b: SharedBlock): { field: string; label: string }[] {
    if (b.columns.length > 0) return b.columns.map((c) => ({ field: c.field, label: c.label ?? fieldSaid(c.field) }));
    const first = b.rows[0];
    const field = first ? Object.keys(first.fields)[0] : undefined;
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

<div class="shared">
  <header class="bar">
    <span class="brand">
      <Mark height={22} />
      <span class="wordmark">{copy.product}</span>
    </span>
    <span class="chip">{words.sharedChip}</span>
  </header>

  {#if got === null}
    <Waiting head />
  {:else if got.from === 'shut'}
    <!-- NO REASON. Every way a link fails is one answer at the record, so the page says it is not shared and who can fix
         that, and nothing about which way it failed. AND ONE ACTION (DSN-18): the person holding a dead link cannot mend
         it from here, so the one thing offered is where it came from, the product, rather than an empty end. -->
    <Empty kind="no-permission" heading glyph="link" title={words.sharedDead} body={words.sharedDeadBody}>
      {#snippet actions()}<Button href="https://brain.dog">{shareWords.whatItIs}</Button>{/snippet}
    </Empty>
  {:else if got.from === 'unreached'}
    <div class="unreached">
      <Empty kind="error" heading title={words.sharedUnreached}>
        {#snippet actions()}<Button onclick={() => void read(token)}>{words.sharedRetry}</Button>{/snippet}
      </Empty>
      <details class="details">
        <summary class="details-head">{words.sharedDetails}</summary>
        <p class="details-body">{got.why}</p>
      </details>
    </div>
  {:else}
    {@const p = got.page}
    <article class="page" aria-labelledby="shared-title">
      <h1 class="title" id="shared-title">{p.title}</h1>
      <p class="until">{words.sharedUntil(day(p.expires_at.slice(0, 10)))}</p>

      <div class="blocks">
        {#each p.blocks as b, i (i)}
          {@const cols = columnsOf(b)}
          <section class="block" style:--span={b.span ?? 12} aria-labelledby={b.heading ? `shared-b${i}` : undefined}>
            {#if b.heading}<h2 class="block-head" id="shared-b{i}">{b.heading}</h2>{/if}

            {#if b.refused}
              <p class="block-note">{b.refused}</p>
            {:else}
              {#if b.body}
                {#each paragraphs(b.body) as para, n (n)}<p class="block-body">{para}</p>{/each}
              {/if}

              {#if b.readings.length > 0}
                <dl class="tiles">
                  {#each b.readings as r, n (n)}
                    <div class="tile">
                      <dt class="tile-label">{r.label ?? fieldSaid(r.metric)}</dt>
                      <dd class="tile-figure">{figure(r)}</dd>
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
          </section>
        {/each}
      </div>
    </article>
  {/if}

  <footer class="made">
    <a class="made-link" href="https://brain.dog" rel="noreferrer">{words.sharedMade}</a>
  </footer>
</div>

<style>
  .shared {
    display: grid;
    gap: var(--sp-5);
    max-inline-size: 1000px;
    margin-inline: auto;
    padding: var(--sp-5);
  }

  /* No rule under the bar: the space before the title is what separates the two. */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.022em;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    margin-inline-start: auto;
    padding: 2px var(--sp-3);
    background: var(--sunk);
    border-radius: var(--r-pill);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .page {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .until {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ONE COLUMN, and twelve from 900px up, where each block takes the span its owner gave it. */
  .blocks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
    margin-block-start: var(--sp-4);
  }

  .block {
    display: grid;
    grid-column: 1 / -1;
    align-content: start;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .block-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .block-body {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
    white-space: pre-line;
  }

  .block-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr));
    gap: var(--sp-3);
    margin: 0;
  }

  .tile {
    display: grid;
    gap: var(--sp-1);
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
  }

  .tile-label {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .tile-figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .rows {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-sm);
  }

  .head-cell {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-weight: 500;
    text-align: start;
  }

  .cell {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--line);
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .unreached {
    display: grid;
    gap: var(--sp-3);
  }

  .details {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .details-head {
    min-block-size: var(--tap);
    display: flex;
    align-items: center;
    cursor: pointer;
  }

  .details-body {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .made {
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  /* A link out of a shared page is the first thing a stranger to this product ever presses: 44 on both axes. */
  .made-link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* BELOW 640px A ROW IS A CARD: each cell on its own line under its column's name, so a wide table never pushes the
     page sideways. */
  @media (max-width: 640px) {
    .rows thead {
      display: none;
    }

    .rows tr {
      display: grid;
      padding-block: var(--sp-2);
      border-block-end: 1px solid var(--line);
    }

    .cell {
      padding: var(--sp-1) 0;
      border-block-end: 0;
    }

    .cell[data-label]::before {
      content: attr(data-label);
      display: block;
      color: var(--dim);
      font-size: var(--t-xs);
    }
  }

  @media (min-width: 900px) {
    .blocks {
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .block {
      grid-column: span var(--span);
    }
  }
</style>
