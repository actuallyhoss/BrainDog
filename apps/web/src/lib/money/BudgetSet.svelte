<!--
  SETTING THE BUDGETS, ON BUDGETS ITSELF (audit of 30 October, 22): a week's, a month's and a year's budget were in the
  record and on its bars, and nothing on the page said which a budget was or set one. Each category you spend in is a
  line: its name, the most to spend, and what that is for, a week, a month or a year. A change is written when it is
  made, through the one write every row takes (`page-write.ts` `updateRow`), and the page is read again so its bars
  follow.

  ITS OWN TILE AT THE FOOT OF BUDGETS, in Money's look, drawn by `PageView.svelte` with one line on `money-budgets`.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { symbolOf } from '$lib/record/money.ts';
  import { updateRow } from '$lib/record/page-write.ts';
  import { rowWriter } from '$lib/record/rows-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import type { Fields } from '$lib/record/schema.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { Ledger } from './ledger.ts';

  /* THE CATEGORIES ARE THE LIST THE LEDGER FILES A LINE UNDER (`ledger.ts`), handed by the page, never named here: its
     title, the state a category is put away by and the way it spends are the list's own fields. */
  let { category, onsaved }: { category: NonNullable<Ledger['category']>; onsaved?: (() => void) | undefined } = $props();

  type Period = 'week' | 'month' | 'year';
  /* `key` IS THE LINE'S OWN AND NEVER MOVES: its seq, or a starter's negative one kept after the starter is written, so two
     categories with one name are two lines (RG18) and a starter just set is not drawn afresh under the cursor. */
  type Line = { key: number; seq: number; version: number; name: string; minor: number | null; currency: string | null; period: Period; typed: string };

  const words = {
    heading: 'Set a budget',
    lede: 'The most to spend in each category, and whether that is for a week, a month or a year.',
    name: 'Category',
    most: 'Most to spend',
    per: 'For',
    periods: { week: 'A week', month: 'A month', year: 'A year' } satisfies Record<Period, string>,
    none: 'No budget',
    another: (n: number) => `Set another (${n} more ${n === 1 ? 'category' : 'categories'})`,
    saved: (name: string) => `${name}'s budget is saved.`,
    cleared: (name: string) => `${name} has no budget now.`,
    empty: 'No category you spend in yet.',
    /* AN EMPTY BOOK IS OFFERED THE EVERYDAY CATEGORIES (audit 31 Oct h, AH14): Budgets said "No category you spend in
       yet" over nothing to press, and a first budget could not be set before the first spending. */
    starters: 'No category yet. Set the most to spend on any of these, and it is kept as a category.',
    starterNames: ['Home', 'Food', 'Transport', 'Health', 'Fun', 'Subscriptions', 'Other'],
    bad: 'Write the most to spend as an amount, such as 250.',
    noCurrency: 'Set your home currency in Money first, so a budget says which money it is.',
  };

  let lines = $state<Line[] | null>(null);
  let busy = $state<number | null>(null);

  const isPeriod = (v: unknown): v is Period => v === 'week' || v === 'month' || v === 'year';
  /* THE DIGITS GROUPED (finish F5): "7000" read as a code beside the bars' "£7,000". Pennies only where there are some. */
  const shown = (minor: number | null): string => {
    if (minor === null) return '';
    const whole = Math.round(minor) % 100 === 0;
    return (Math.round(minor) / 100).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  };

  /** The categories one spends in that are not put away, as the list's own fields say it. */
  const spending = (): string =>
    [category.state && category.done.length > 0 ? `${category.state} is not ${category.done.join(' or ')}` : '', category.way ? `${category.way.field} is ${category.way.out}` : '']
      .filter((c) => c !== '')
      .join(', ');

  async function read() {
    const where = spending();
    const out = await createClient({ base: apiBase() })
      .list({ register: category.list, ...(where !== '' ? { where: { toJSON: () => where } as never } : {}), limit: 200, order: [{ field: category.title, dir: 'asc' }] as never })
      .catch(() => null);
    if (!out?.ok) {
      lines = [];
      return;
    }
    /* A CURRENCY SOMEBODY CHOSE: the budget's own, else the record's home one, never one the screen picks. */
    const home = homeCurrency();
    const held = (out.value.rows as { seq?: unknown; version?: unknown; fields?: Record<string, unknown> }[]).flatMap((r) => {
      const f = r.fields ?? {};
      const name = f[category.title];
      if (typeof r.seq !== 'number' || typeof name !== 'string') return [];
      const b = f.budget as { amount?: unknown; currency?: unknown } | null | undefined;
      const minor = b && typeof b.amount === 'number' ? b.amount : null;
      return [
        {
          key: r.seq,
          seq: r.seq,
          version: typeof r.version === 'number' ? r.version : 0,
          name,
          minor,
          currency: b && typeof b.currency === 'string' ? b.currency : home,
          period: isPeriod(f.budget_period) ? f.budget_period : 'month',
          typed: shown(minor),
        },
      ];
    });
    /* NO CATEGORY BUT THE EVERYDAY ONES THIS TILE MADE: the rest of them stay offered, each a line not yet written, made
       the moment a budget is set on it. A book with a category of its own is offered nothing it did not make. */
    const offered = words.starterNames as readonly string[];
    const ours = held.every((l) => offered.includes(l.name));
    lines = ours
      ? offered.map((name, i) => held.find((l) => l.name === name) ?? { key: -(i + 1), seq: -(i + 1), version: 0, name, minor: null, currency: home, period: 'month' as Period, typed: '' })
      : held;
  }

  $effect(() => {
    void read();
  });

  async function save(l: Line, patch: Record<string, unknown>, said: string) {
    busy = l.seq;
    /* A LINE NOT YET A CATEGORY IS WRITTEN AS ONE, spending money, with its budget on it. */
    if (l.seq < 0) {
      const made = await rowWriter(apiBase()).create(category.list, { [category.title]: l.name, ...(category.way ? { [category.way.field]: category.way.out } : {}), ...patch } as Fields);
      busy = null;
      if (!made.ok) {
        toasts.push(made.fix, { intent: 'warn' });
        l.minor = null;
        l.typed = '';
        return;
      }
      l.seq = made.entry.seq;
      l.version = made.entry.version;
      toasts.push(said);
      onsaved?.();
      return;
    }
    const out = await updateRow(apiBase(), { register: category.list, seq: l.seq, version: l.version }, patch, l.name);
    busy = null;
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      await read();
      return;
    }
    if (out.version !== undefined) l.version = out.version;
    toasts.push(said);
    onsaved?.();
  }

  function setAmount(l: Line) {
    const t = l.typed.replace(/[,\s£$€]/gu, '').trim();
    if (t === '') {
      if (l.minor === null) return;
      l.minor = null;
      void save(l, { budget: null }, words.cleared(l.name));
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) {
      toasts.push(words.bad, { intent: 'warn' });
      l.typed = shown(l.minor);
      return;
    }
    const minor = Math.round(n * 100);
    if (minor === l.minor) return;
    if (l.currency === null) {
      toasts.push(words.noCurrency, { intent: 'warn' });
      l.typed = shown(l.minor);
      return;
    }
    l.minor = minor;
    l.typed = shown(minor);
    void save(l, { budget: { amount: minor, currency: l.currency } }, words.saved(l.name));
  }

  /* THE BUDGETS SET, AND "SET ANOTHER" FOR THE REST (next-money, M19): 13 categories stood here, 10 of them saying "No
     budget", so the three that are set were hard to find among them. With none set every line is shown, as the first
     budget is set here; a line set while open stays shown (`kept`), so a budget never vanishes under the hand typing it. */
  let openAll = $state(false);
  const kept = new Set<number>();
  const shownLines = $derived.by(() => {
    const all = lines ?? [];
    if (openAll || all.every((l) => l.minor === null)) return all;
    for (const l of all) if (l.minor !== null) kept.add(l.key);
    return all.filter((l) => kept.has(l.key));
  });
  const hiddenCount = $derived((lines?.length ?? 0) - shownLines.length);

  function setPeriod(l: Line, v: string) {
    if (!isPeriod(v) || v === l.period) return;
    l.period = v;
    void save(l, { budget_period: v }, words.saved(l.name));
  }
</script>

{#if lines !== null}
  <section class="bset" aria-labelledby="bset-h">
    <header class="bset-head">
      <IconWell name="wallet" />
      <div>
        <h2 class="bset-title" id="bset-h">{words.heading}</h2>
        <p class="bset-lede">{words.lede}</p>
      </div>
    </header>
    {#if lines.length === 0}
      <p class="bset-lede">{words.empty}</p>
    {:else}
      {#if lines.every((l) => l.seq < 0)}<p class="bset-lede">{words.starters}</p>{/if}
      <ul class="bset-lines">
        {#each shownLines as l (l.key)}
          <li class="bset-line">
            <span class="bset-name" dir="auto">{l.name}</span>
            <label class="bset-most">
              <span class="sr-only">{words.most}, {l.name}</span>
              <span class="bset-cur" aria-hidden="true">{l.currency === null ? '' : (symbolOf(l.currency) ?? l.currency)}</span>
              <input
                class="num"
                inputmode="decimal"
                placeholder={words.none}
                bind:value={l.typed}
                disabled={busy === l.seq}
                onchange={() => setAmount(l)}
                onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              />
            </label>
            <label class="bset-per">
              <span class="sr-only">{words.per}, {l.name}</span>
              <select value={l.period} disabled={busy === l.seq || l.minor === null} onchange={(e) => setPeriod(l, (e.currentTarget as HTMLSelectElement).value)}>
                {#each Object.entries(words.periods) as [v, said] (v)}<option value={v}>{said}</option>{/each}
              </select>
            </label>
          </li>
        {/each}
      </ul>
      {#if hiddenCount > 0}
        <span class="bset-more"><Button weight="quiet" onclick={() => (openAll = true)}>{words.another(hiddenCount)}</Button></span>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .bset-more {
    justify-self: start;
  }

  .bset {
    display: grid;
    gap: var(--sp-3);
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .bset-head {
    display: flex;
    gap: var(--sp-3);
    align-items: flex-start;
  }

  .bset-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .bset-lede {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .bset-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bset-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 9rem) minmax(0, 8rem);
    gap: var(--sp-2);
    align-items: center;
    padding-block: var(--sp-2);
    border-block-start: 1px solid var(--rule);
  }

  .bset-name {
    overflow: hidden;
    color: var(--ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bset-most {
    display: flex;
    gap: var(--sp-1);
    align-items: center;
  }

  .bset-cur {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .bset-most input,
  .bset-per select {
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 36px;
    padding: 0 var(--sp-2);
    color: var(--ink);
    font: inherit;
    background: var(--tile-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
  }

  /* UNDER A THUMB A FIELD IS 44 TALL (Look B "44 on a phone"; design pass, 1 Nov): these were 36. */
  @media (pointer: coarse) {
    .bset-most input,
    .bset-per select {
      min-block-size: var(--tap);
    }
  }

  .bset-most input {
    text-align: end;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .bset-line {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .bset-name {
      grid-column: 1 / -1;
    }
  }
</style>
