<!--
  WHAT IS LATE, AT THE TOP OF THE DESK, EACH WITH ITS BUTTON (the audit of 22 October, U2 and U-A13).

  Today's late list (`home-rows.ts` `lateLines`: every list's deadlines before today, and the late tasks) was folded
  behind More, and on his record a 13 days late salary, a 9 days late instalment and a 14 days late fee stood on no part
  of Today's first screen. Here they lead the desk: a line a thing, its name opening its row, how late in red and the day
  it fell due, its amount whole at the right, and the one press that finishes it in the words the row's own page leads
  with ("Mark paid", "Mark done"), with an Undo (`late-finish.ts`, fetched on the press). A list that has no way to
  finish a row opens the row instead. A line Needs you already asks about is answered there and is not here (`unasked`).

  A FEW AT REST, four at a desk and three on a phone, so the first screen holds the greeting, the brief and the first
  things to do; the rest open in place.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { exponentOf, writeAmount } from 'braindog-render';
  import { finishOf } from '../../routes/r/[register]/[seq]/lead.ts';
  import type { HomeLine } from './home-rows.ts';

  let {
    lines,
    heading,
    more = 0,
    most,
    writes,
    onfinished,
  }: {
    /** The late lines to show, tasks and money, in the page's order. */
    lines: readonly HomeLine[];
    /** The list's own name ("Late", "Late or due today"). */
    heading: string;
    /** Late things past what the lines hold. */
    more?: number;
    /** How many lines show before the rest open in place. */
    most: number;
    /** Whether the reader may change a row of the list named. */
    writes: (list: string) => boolean;
    /** The record has the change: Today reads again. */
    onfinished: () => void;
  } = $props();

  const words = {
    due: (day: string) => `due ${day}`,
    open: 'Open',
    more: (n: number) => `${n.toLocaleString('en-GB')} more`,
    fewer: 'Show fewer',
    past: (n: number) => `and ${n.toLocaleString('en-GB')} more, past these`,
  } as const;

  let open = $state(false);
  /** The lines pressed and on their way, by key: their button waits, and a finished one fades until Today reads again. */
  let busy = $state.raw<ReadonlySet<string>>(new Set());
  let done = $state.raw<ReadonlySet<string>>(new Set());

  const shown = $derived(open ? lines : lines.slice(0, most));
  const hidden = $derived(lines.length - shown.length);

  /** The list a line's row is in, from its handle (`obligations#2`). */
  const listOf = (line: HomeLine): string | null => /^([a-z][a-z0-9_-]*)#[1-9][0-9]*$/u.exec(line.key)?.[1] ?? null;

  /** The verb that finishes a line's row, as its own page says it, or `null` where the list has none or the reader may not. */
  function verbOf(line: HomeLine): string | null {
    const list = listOf(line);
    if (list === null || !writes(list)) return null;
    return finishOf(REGISTERS[list], '')?.said ?? null;
  }

  /** An amount whole, as a person says it: "$4,012", "EGP 467,915". */
  function amountSaid(line: HomeLine): string | null {
    if (!line.money) return line.amount ? line.amount.text.replace(/^[+−-]/u, '') : null;
    const { minor, currency } = line.money;
    const exp = exponentOf(currency);
    const whole = Math.round(Math.abs(minor) / 10 ** exp) * 10 ** exp;
    return writeAmount({ minor: whole, currency }, homeCurrency(), 'read')?.text ?? null;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  /** "9 Oct", the day it fell due, from its `YYYY-MM-DD`. */
  function dayWords(day: string): string {
    const [, m, d] = day.split('-').map(Number);
    return m !== undefined && d !== undefined && m >= 1 && m <= 12 && d >= 1 ? `${String(d)} ${MONTHS[m - 1]!}` : day;
  }

  async function finish(line: HomeLine): Promise<void> {
    if (busy.has(line.key) || done.has(line.key)) return;
    busy = new Set([...busy, line.key]);
    try {
      const m = await import('./late-finish.ts');
      const out = await m.finishLate(apiBase(), line.key, onfinished);
      if (out.ok) done = new Set([...done, line.key]);
      else if ('open' in out) {
        if (line.href) await goto(at(line.href));
      } else toasts.push(out.fix, { intent: 'warn' });
    } finally {
      busy = new Set([...busy].filter((k) => k !== line.key));
    }
  }
</script>

<Tile icon="clock" title={heading} count={lines.length + more} data-late-tile>
  <ul class="late">
    {#each shown as line (line.key)}
      {@const verb = verbOf(line)}
      {@const amount = amountSaid(line)}
      <li class="ln" data-row={line.key} data-done={done.has(line.key) ? '' : undefined}>
        {#if line.href}<a class="ln-title" href={at(line.href)}>{line.title}</a>{:else}<span class="ln-title">{line.title}</span>{/if}
        {#if amount}<span class="ln-amount num">{amount}</span>{/if}
        <p class="ln-when">
          {#if line.when}<span data-late={line.late ? '' : undefined}>{line.when}</span>{/if}{#if line.day && line.late}{#if line.when}<span class="sep">{' · '}</span>{/if}<span class="ln-day">{words.due(dayWords(line.day))}</span>{/if}
        </p>
        <span class="ln-acts">
          {#if verb}
            <Button weight="primary" disabled={busy.has(line.key) || done.has(line.key)} aria-busy={busy.has(line.key)} onclick={() => void finish(line)}>{verb}</Button>
          {:else if line.href}
            <Button href={line.href}>{words.open}</Button>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
  {#if hidden > 0 || open}
    <button type="button" class="late-more tap" aria-expanded={open} onclick={() => (open = !open)}>{open ? words.fewer : words.more(hidden)}</button>
  {/if}
  {#if more > 0 && (open || hidden === 0)}<p class="late-past">{words.past(more)}</p>{/if}
</Tile>

<style>
  .late {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A LINE IS TWO ROWS: the name and the amount, then how late with the day it fell due, and the button at the right. */
  .ln {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title amount'
      'when acts';
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
    padding-block: var(--sp-3);
  }

  .ln:first-child {
    padding-block-start: 0;
  }

  .ln + .ln {
    border-block-start: 1px solid var(--rule);
  }

  .ln-title {
    grid-area: title;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  a.ln-title:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .ln-amount {
    grid-area: amount;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .ln-when {
    grid-area: when;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .ln-when [data-late] {
    color: var(--red);
    font-weight: var(--fw-semi);
  }

  .ln-acts {
    display: flex;
    grid-area: acts;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .ln[data-done] :is(.ln-title, .ln-amount) {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  /* ON A PHONE THE BUTTON IS A ROW OF ITS OWN under how late, at the start, where a thumb reaches it. */
  @media (width < 640px) {
    .ln {
      grid-template-areas:
        'title amount'
        'when when'
        'acts acts';
    }

    .ln-acts {
      justify-content: flex-start;
      padding-block-start: var(--sp-1);
    }
  }

  .late-more {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--red);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .late-more:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .late-past {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
