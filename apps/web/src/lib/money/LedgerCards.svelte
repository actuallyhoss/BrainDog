<!--
  A TABLE OF LEDGER LINES AS A FINANCE APP LISTS THEM (the account page's "What moved", Coin Fish's Cards view): a day
  at a time under its date, each line the category's chip, who was paid, its category and account under the name, the
  amount at the right and what the bank said the balance was after it under the amount. The same rows the table draws,
  read off its own columns by field, so nothing is worked out here: a column the table does not hold is a line not said.

  `cardsOf` answers null where the table has no day or no amount, and the page draws its table as before.
-->
<script module lang="ts">
  import type { Column as TableColumn, TableRow } from 'braindog-render';

  const pick = (columns: readonly TableColumn[], fields: readonly string[]): number => {
    for (const f of fields) {
      const i = columns.findIndex((c) => c.field === f);
      if (i >= 0) return i;
    }
    return -1;
  };

  export type Plan = { day: number; title: number[]; category: number; account: number; amount: number; after: number };

  /** Where each part of a ledger line is among the table's columns, or null where it is no ledger. */
  export function cardsOf(columns: readonly TableColumn[]): Plan | null {
    const day = pick(columns, ['on', 'day', 'date']);
    const amount = pick(columns, ['amount']);
    if (day < 0 || amount < 0) return null;
    const title = ['payee', 'what', 'title', 'name'].map((f) => columns.findIndex((c) => c.field === f)).filter((i) => i >= 0);
    if (title.length === 0) return null;
    return { day, title, category: pick(columns, ['category']), account: pick(columns, ['account']), amount, after: pick(columns, ['balance_after', 'available']) };
  }

  /** A cell's words, with a link's text kept and its address dropped. */
  export const plain = (v: string | null | undefined): string =>
    (v ?? '')
      .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
      .replace(/[*_`]/gu, '')
      .trim();
</script>

<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { looks } from './looks.svelte.ts';
  import { at } from '../at.ts';

  let { columns, rows, plan }: { columns: readonly TableColumn[]; rows: readonly TableRow[]; plan: Plan } = $props();

  type Line = { key: string; title: string; under: string; amount: string; after: string; href: string | null; category: string; inflow: boolean; tone: TableRow['tone'] };
  type Day = { day: string; lines: Line[] };

  const days = $derived.by(() => {
    const out: Day[] = [];
    for (const r of rows) {
      const day = plain(r.cells[plan.day]);
      const title = plan.title.map((i) => plain(r.cells[i])).find((t) => t !== '') ?? '';
      const category = plan.category >= 0 ? plain(r.cells[plan.category]) : '';
      const account = plan.account >= 0 ? plain(r.cells[plan.account]) : '';
      const amount = plain(r.cells[plan.amount]);
      const after = plan.after >= 0 ? plain(r.cells[plan.after]) : '';
      const line: Line = {
        key: r.key,
        title,
        under: [category, account].filter(Boolean).join(' · '),
        amount,
        after,
        href: r.href ?? null,
        category,
        inflow: amount.startsWith('+'),
        tone: r.tone,
      };
      const last = out.at(-1);
      if (last && last.day === day) last.lines.push(line);
      else out.push({ day, lines: [line] });
    }
    return out;
  });
  const afterLabel = $derived(plan.after >= 0 ? (columns[plan.after]?.label ?? '') : '');
</script>

<ol class="lc">
  {#each days as d (d.day + d.lines[0]?.key)}
    <li class="lc-day">
      <h3 class="lc-date num">{d.day}</h3>
      <ul class="lc-lines">
        {#each d.lines as l (l.key)}
          {@const look = looks.category(l.category)}
          <li>
            <svelte:element this={l.href ? 'a' : 'div'} class="lc-line" href={l.href ? at(l.href) : undefined} data-intent={l.tone}>
              <span class="item-chip lc-chip" data-slot={look?.slot ?? undefined} data-unfiled={look ? undefined : ''} aria-hidden="true"
                >{#if look}<Icon name={look.glyph as IconName} size="s" />{:else}?{/if}</span
              >
              <span class="lc-title">{l.title || l.category || '—'}</span>
              <span class="lc-amount num" data-sign={l.inflow ? 'in' : undefined}>{l.amount}</span>
              {#if l.under}<span class="lc-under">{l.under}</span>{/if}
              {#if l.after}<span class="lc-after num"><span class="sr-only">{afterLabel} </span>{l.after}</span>{/if}
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
      'chip under after';
    column-gap: var(--sp-3);
    row-gap: 2px;
    align-items: center;
    min-block-size: 56px;
    padding-block: var(--sp-2);
    color: inherit;
    text-decoration: none;
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

  .lc-after {
    grid-area: after;
    justify-self: end;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }
</style>
