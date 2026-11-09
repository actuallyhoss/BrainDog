<!--
  A TABLE OF LEDGER LINES AS A FINANCE APP LISTS THEM (the account page's "What moved", Coin Fish's Cards view): a day
  at a time under its date, each line the category's chip, who was paid, its category and account under the name, the
  amount at the right and what the bank said the balance was after it under the amount. The same rows the table draws,
  read off its own columns by field, so nothing is worked out here: a column the table does not hold is a line not said.

  `cardsOf` answers null where the table has no day or no amount, and the page draws its table as before.

  AN ADD-ON'S OWN COLUMNS STAY (V2 of 30 Oct): Tax's "Set aside" and "At", Receipts' "Receipt", any column the card has no
  place for, are said on a line of their own under the name, each by its label. They were dropped, so the cards said
  less than the table they stand for. AND EVERY FIGURE IS WRITTEN AS THE TABLE WRITES IT (`tableCellBody`, with the
  record's home currency): the cards printed the stored "GBP 1,070.25" where the table beside them said "£1,070.25".
  A TABLE WITH NO CATEGORY DRAWS NO CHIP, since a "?" on every line said "not filed" about lines nobody asked to file.

  WHO WAS PAID, AS THEIR LOGO (People 4.8.0, the payee logos Cash Fish shows): a filed line whose payee is an
  organisation that keeps a logo wears the logo in its chip's place, found by the payee's name or the bank line the
  organisation was met by (`logoOf`); its category is still said under its name. A line nothing has filed keeps its
  "?", which asks for something, and a move between your own accounts its arrows.
-->
<script module lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn, springy } from '$lib/motion/index.ts';
  import { tableCellBody, type Column as TableColumn, type TableRow } from 'braindog-render';

  const pick = (columns: readonly TableColumn[], fields: readonly string[]): number => {
    for (const f of fields) {
      const i = columns.findIndex((c) => c.field === f);
      if (i >= 0) return i;
    }
    return -1;
  };

  /** `extras` are the columns the card has no place of its own for, in the table's order, each said by its label. */
  export type Plan = { day: number; title: number[]; category: number; account: number; amount: number; after: number; chip: number; extras: number[] };

  /** Where each part of a ledger line is among the table's columns, or null where it is no ledger. */
  export function cardsOf(columns: readonly TableColumn[]): Plan | null {
    const day = pick(columns, ['on', 'day', 'date']);
    const amount = pick(columns, ['amount']);
    if (day < 0 || amount < 0) return null;
    const title = ['payee', 'what', 'title', 'name'].map((f) => columns.findIndex((c) => c.field === f)).filter((i) => i >= 0);
    if (title.length === 0) return null;
    const plan = {
      day,
      title,
      category: columns.findIndex((c) => c.field === 'category' && c.as !== 'chip'),
      account: pick(columns, ['account']),
      amount,
      after: pick(columns, ['balance_after', 'available']),
      chip: columns.findIndex((c) => c.as === 'chip'),
    };
    const placed = new Set([plan.day, ...plan.title, plan.category, plan.account, plan.amount, plan.after, plan.chip]);
    const extras = columns.flatMap((c, i) => (placed.has(i) || c.hideLabel || c.label.trim() === '' ? [] : [i]));
    return { ...plan, extras };
  }

  /**
   * A cell as the table beside the cards writes it: a figure in the record's home currency ("£1,070.25", "+£4,000.00"),
   * a day in the reader's year, other words as they are. `home` is `undefined` where the caller was never told, as the
   * table reads it.
   */
  export function cellSaid(value: string | null | undefined, home?: string | null, now?: number): string {
    const body = tableCellBody(plain(value) || null, home, now).body;
    if (body.kind === 'missing') return '';
    if (body.kind === 'coded') return body.amount?.text ?? `${body.sign}${body.currency} ${body.rest}`;
    return body.text;
  }

  /** A cell's words, with a link's text kept and its address dropped. */
  export const plain = (v: string | null | undefined): string =>
    (v ?? '')
      .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
      .replace(/[*_`]/gu, '')
      .trim();
</script>

<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { pictureSrc } from '$lib/picture/picture.ts';
  import { logoOf, wantLogos } from '$lib/picture/pictures.svelte.ts';
  import { looks } from './looks.svelte.ts';
  /* A "?" IS A LINE WITH NO CATEGORY YET (2 Nov, a walk: six imported lines drew it and nothing said what it meant), said
     as the Money page's Ledger tile says it (`UNFILED_HINT`). */
  const unfiledHint = UNFILED_HINT;
  import { at } from '../at.ts';
  import { TIMELINE_BETWEEN, UNFILED_HINT, timelineTitle } from 'braindog-render';

  let {
    columns,
    rows,
    plan,
    home,
    now,
  }: {
    columns: readonly TableColumn[];
    rows: readonly TableRow[];
    plan: Plan;
    /** The record's home currency, as the table is handed it; `undefined` writes figures as they came. */
    home?: string | null | undefined;
    /** The record's clock, so a day in this year is said without its year. */
    now?: number | undefined;
  } = $props();

  type Extra = { label: string; value: string };
  type Line = { key: string; title: string; under: string; amount: string; after: string; extras: Extra[]; href: string | null; category: string; inflow: boolean; between: boolean; tone: TableRow['tone']; logo: string | null };
  type Day = { day: string; lines: Line[] };

  const days = $derived.by(() => {
    const out: Day[] = [];
    for (const r of rows) {
      const day = cellSaid(r.cells[plan.day], undefined, now);
      /* WHO WAS PAID AS THE LEDGER SAYS IT (`timelineTitle`, audit 2 B4): Tax set aside drew "RAVENSWORTH LTD INV 2026-038"
         and Receipts "PAPERHAUS SUPPLIES" where the Ledger says "Ravensworth Ltd" and "Paperhaus Supplies". */
      const payee = plan.title.map((i) => plain(r.cells[i])).find((t) => t !== '') ?? '';
      const title = timelineTitle(payee);
      const category = plan.category >= 0 ? plain(r.cells[plan.category]) : '';
      const account = plan.account >= 0 ? plain(r.cells[plan.account]) : '';
      const amount = cellSaid(r.cells[plan.amount], home, now);
      const after = plan.after >= 0 ? cellSaid(r.cells[plan.after], home, now) : '';
      const extras = plan.extras.flatMap((i): Extra[] => {
        const value = cellSaid(r.cells[i], home, now);
        return value === '' ? [] : [{ label: columns[i]?.label ?? '', value }];
      });
      /* A MOVE BETWEEN YOUR OWN ACCOUNTS (the chip's `between`): no "?" and no green, as the Ledger draws it. */
      const between = plan.chip >= 0 && plain(r.cells[plan.chip]) === TIMELINE_BETWEEN;
      const line: Line = {
        key: r.key,
        title,
        under: [category, account].filter(Boolean).join(' · '),
        amount,
        after,
        extras,
        href: r.href ?? null,
        category,
        inflow: amount.startsWith('+') && !between,
        between,
        tone: r.tone,
        logo: between ? null : logoOf(payee),
      };
      const last = out.at(-1);
      if (last && last.day === day) last.lines.push(line);
      else out.push({ day, lines: [line] });
    }
    return out;
  });
  const afterLabel = $derived(plan.after >= 0 ? (columns[plan.after]?.label ?? '') : '');
  /* A CHIP ONLY WHERE THE TABLE SAYS A CATEGORY: with none, a "?" on every line read as "not filed". */
  const chipped = $derived(plan.chip >= 0 || plan.category >= 0);
  /* THE LOGOS ARE ASKED ONCE A WHILE, by the first ledger drawn, and one that would not load gives the chip back. */
  $effect(() => {
    if (chipped) wantLogos();
  });
  const broken = new SvelteSet<string>();
</script>

<ol class="lc">
  {#each days as d (d.day + d.lines[0]?.key)}
    <li class="lc-day">
      <h3 class="lc-date num">{d.day}</h3>
      <ul class="lc-lines">
        {#each d.lines as l (l.key)}
          {@const look = l.between ? { glyph: 'repeat', slot: 'slate' } : looks.category(l.category)}
          <!-- A PAYMENT LANDING opens its line and rises into it; one taken away closes (`$lib/motion`). -->
          <li in:lineIn out:dismiss animate:flip={springy()}>
            <svelte:element this={l.href ? 'a' : 'div'} class="lc-line" href={l.href ? at(l.href) : undefined} data-intent={l.tone} data-chipless={chipped ? undefined : ''}>
              {#if chipped && look && l.logo && !broken.has(l.logo)}
                {@const logo = l.logo}
                <span class="item-chip lc-chip lc-logo" aria-hidden="true"
                  ><img src={pictureSrc(logo)} alt="" width="36" height="36" loading="lazy" decoding="async" onerror={() => broken.add(logo)} /></span
                >
              {:else if chipped}
                <span class="item-chip lc-chip" data-slot={look?.slot ?? undefined} data-unfiled={look ? undefined : ''} title={look ? undefined : unfiledHint} aria-hidden="true"
                  >{#if look}<Icon name={look.glyph as IconName} size="s" />{:else}?{/if}</span
                >
              {/if}
              <span class="lc-title">{l.title || l.category || '—'}{#if chipped && !look}<span class="sr-only">, {unfiledHint}</span>{/if}</span>
              <span class="lc-amount num" data-sign={l.inflow ? 'in' : undefined}>{l.amount}</span>
              {#if l.under}<span class="lc-under">{l.under}</span>{/if}
              {#if l.after}<span class="lc-after num"><span class="sr-only">{afterLabel} </span>{l.after}</span>{/if}
              {#if l.extras.length > 0}
                <span class="lc-more">
                  {#each l.extras as x, i (i)}<span class="lc-extra">{#if x.label}<span class="lc-k">{x.label}</span>{' '}{/if}<span class="num">{x.value}</span></span>{/each}
                </span>
              {/if}
            </svelte:element>
          </li>
        {/each}
      </ul>
    </li>
  {/each}
</ol>

<style>
  .lc,
  .lc-lines {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .lc-day + .lc-day {
    margin-block-start: var(--sp-3);
  }

  .lc-date {
    margin: 0;
    padding-block: var(--sp-2) var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .lc-lines > li + li .lc-line {
    border-block-start: 1px solid var(--rule);
  }

  .lc-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'chip title amount'
      'chip under after'
      'chip more more';
    column-gap: var(--sp-3);
    row-gap: 2px;
    align-items: center;
    min-block-size: 56px;
    padding-block: var(--sp-2);
    color: inherit;
    text-decoration: none;
  }

  /* NO CHIP, NO CHIP COLUMN: the name starts at the edge. */
  .lc-line[data-chipless] {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title amount'
      'under after'
      'more more';
  }

  a.lc-line:hover .lc-title {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  a.lc-line:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    border-radius: var(--r-ctl);
  }

  .lc-chip {
    grid-area: chip;
    inline-size: 36px;
    block-size: 36px;
  }

  /* A LOGO FILLS THE CHIP, over the quiet fill while it loads, with the ring a face wears on top of it. */
  .lc-logo {
    position: relative;
    overflow: hidden;
    background: var(--tile-2);
  }

  .lc-logo::after {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--sep);
    content: '';
  }

  .lc-logo > img {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  .lc-title {
    grid-area: title;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-weight: var(--fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lc-under {
    grid-area: under;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lc-amount {
    grid-area: amount;
    justify-self: end;
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .lc-amount[data-sign='in'] {
    color: var(--good);
  }

  /* THE ADD-ON'S OWN COLUMNS, each label then its value, wrapping as a sentence does. */
  .lc-more {
    grid-area: more;
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--sp-4);
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .lc-k {
    color: var(--ink-3);
  }

  .lc-after {
    grid-area: after;
    justify-self: end;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }
</style>
