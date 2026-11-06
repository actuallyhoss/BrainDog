<!--
  WHAT IS LATE, AT THE TOP OF THE DESK, EACH WITH ITS BUTTON.

  Today's late list (`home-rows.ts` `lateLines`: every list's deadlines before today, and the late tasks) was folded
  behind More, and on his record a 13 days late salary, a 9 days late instalment and a 14 days late fee stood on no part
  of Today's first screen. Here they lead the desk: a line a thing, its name opening its row, how late in red and the day
  it fell due. A BILL carries its amount to the cent in its own currency and two answers: Paid, in ink,
  and Not yet, which puts it aside until tomorrow in this browser. A TASK is a quiet tick at its start, never a red
  "Mark done". Each finishes through the row's own write with an Undo (`late-finish.ts`, fetched on the press); a list
  with no way to finish a row opens the row instead. A line Needs you already asks about is answered there and is not
  here (`unasked`). URGENT WORK AND WORK HANDED BACK stand under the late lines, each with its tick.

  A FEW AT REST, four at a desk and three on a phone, so the first screen holds the greeting, the brief and the first
  things to do; the rest open in place.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import { writeAmount } from 'braindog-render';
  import type { HomeLine } from './home-rows.ts';
  import { asideToday, isBill, lateWords, putAside, verbOf } from './late-verb.ts';

  let {
    lines,
    heading,
    more = 0,
    most,
    writes,
    onfinished,
  }: {
    /** The late lines to show, tasks and money, in the page's order, then urgent work and work handed back. */
    lines: readonly HomeLine[];
    /** The list's own name ("Late", "Late and urgent"). */
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
  /** The lines pressed, by key: each fades on the press, as every other press answers, and until Today reads again. */
  let done = $state.raw<ReadonlySet<string>>(new Set());
  /* A BILL ANSWERED "NOT YET" IS OUT OF LATE UNTIL TOMORROW, in this browser: nothing is written to the record. */
  let aside = $state.raw<ReadonlySet<string>>(asideToday());

  const kept = $derived(lines.filter((l) => !aside.has(l.key)));
  const shown = $derived(open ? kept : kept.slice(0, most));
  const hidden = $derived(kept.length - shown.length);

  /**
   * An amount to the cent, in its own currency, as a person says it, WITH ITS WAY (audit 31 Oct f, AF5): "−£9,190" for a
   * bill to pay and "+£2,400" for money to come, as Coming up says them, and unsigned only where the way is not known.
   */
  function amountSaid(line: HomeLine): string | null {
    const sign = /^[−-]/u.test(line.amount?.text ?? '') ? '−' : line.amount?.text.startsWith('+') ? '+' : '';
    if (!line.money) return line.amount ? line.amount.text : null;
    const { minor, currency } = line.money;
    const said = writeAmount({ minor: Math.abs(minor), currency }, homeCurrency(), 'read')?.text ?? null;
    return said === null ? null : `${sign}${said}`;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

  /** "9 Oct", the day it fell due, from its `YYYY-MM-DD`. */
  function dayWords(day: string): string {
    const [, m, d] = day.split('-').map(Number);
    return m !== undefined && d !== undefined && m >= 1 && m <= 12 && d >= 1 ? `${String(d)} ${MONTHS[m - 1]!}` : day;
  }

  const notDone = (key: string): void => {
    done = new Set([...done].filter((k) => k !== key));
  };

  /**
   * PAID ANSWERS ON THE PRESS, AS EVERY OTHER PRESS DOES. It waited for two reads and a write with the button greyed, 430ms
   * here and more on a phone, and it was the one decision on Today that did. The line goes at once, the write goes
   * behind it, and a refusal puts the line back and says why; the Undo arrives with the record's word that it has it.
   */
  async function finish(line: HomeLine): Promise<void> {
    if (done.has(line.key)) return;
    done = new Set([...done, line.key]);
    void focusOnward(line.key);
    let out: Awaited<ReturnType<typeof import('./late-finish.ts').finishLate>>;
    try {
      const m = await import('./late-finish.ts');
      out = await m.finishLate(apiBase(), line.key, onfinished, () => notDone(line.key));
    } catch {
      out = { ok: false, fix: copy.writeNotReached };
    }
    if (out.ok) return;
    notDone(line.key);
    if ('open' in out) {
      if (line.href) await goto(at(line.href));
    } else toasts.push(out.fix, { intent: 'warn' });
  }

  let list = $state<HTMLUListElement | null>(null);

  /**
   * FOCUS STAYS IN THE LIST WHEN A LINE IS FINISHED (audit 31 Oct i, AI1). Its buttons wait and then leave, and focus fell
   * to the page, so the next Tab began again at "Skip to content". It moves to the next line's first button, or the
   * line before's, or to the list's heading once nothing is left.
   */
  async function focusOnward(key: string): Promise<void> {
    await tick();
    const was = document.activeElement as HTMLElement | null;
    if (was && was !== document.body && was.isConnected && !(was as HTMLButtonElement).disabled) return;
    const rows = [...(list?.querySelectorAll<HTMLElement>(':scope > li') ?? [])];
    const at = rows.findIndex((r) => r.dataset['row'] === key);
    const pick = (li: HTMLElement | undefined) => li?.querySelector<HTMLElement>('button:not([disabled]), a[href]') ?? null;
    const next = (at >= 0 ? (pick(rows.slice(at + 1).find((r) => !('done' in r.dataset))) ?? pick(rows.slice(0, at).reverse().find((r) => !('done' in r.dataset)))) : null) ?? null;
    if (next) return void next.focus();
    const head = list?.closest('section')?.querySelector<HTMLElement>('h2');
    if (head) {
      head.tabIndex = -1;
      head.focus();
    }
  }

  function notYet(line: HomeLine): void {
    putAside(line.key);
    aside = new Set([...aside, line.key]);
    toasts.push(lateWords.notYetSaid(line.title));
  }

  /* A LINE'S VERBS AT THE POINTER: a right-click or a held thumb on it, or `⇧F10` (`ownMenu`). */
  let menuLine = $state<HomeLine | null>(null);
  let point = $state<{ x: number; y: number; height: number } | null>(null);
</script>

<Tile icon="clock" title={heading} count={kept.length + more} data-late-tile>
  <ul class="late" bind:this={list}>
    {#each shown as line (line.key)}
      {@const verb = verbOf(line, writes)}
      {@const bill = isBill(line)}
      {@const amount = amountSaid(line)}
      <li
        class="ln"
        data-row={line.key}
        data-bill={bill ? '' : undefined}
        data-done={done.has(line.key) ? '' : undefined}
        {@attach ownMenu((p) => ((menuLine = line), (point = p)), line.href)}
      >
        {#if !bill && verb}
          <!-- A TASK IS A QUIET TICK at the line's start: the row's own verb is its name for a screen reader. A box, as
               Today's other ticks are, so `x` presses it from the keyboard (`PageBody.svelte`). -->
          <button type="button" class="ln-tick tap" role="checkbox" aria-checked={done.has(line.key)} aria-label={`${verb}: ${line.title}`} title={verb} disabled={done.has(line.key)} onclick={() => void finish(line)}
            ><Icon name="check" size="s" /></button
          >
        {/if}
        {#if line.href}<a class="ln-title" href={at(line.href)}>{line.title}</a>{:else}<span class="ln-title">{line.title}</span>{/if}
        {#if amount}<span class="ln-amount num">{amount}</span>{/if}
        <p class="ln-when">
          {#if line.when}<span data-late={line.late || line.mark === 'urgent' ? '' : undefined}>{line.when}</span>{/if}{#if line.day && line.late}{#if line.when}<span class="sep">{' · '}</span>{/if}<span class="ln-day">{words.due(dayWords(line.day))}</span>{/if}
        </p>
        {#if bill}
          <span class="ln-acts">
            {#if verb}
              <!-- A BILL IS ANSWERED PAID OR NOT YET: Paid is the strong one, in ink (the screen keeps its one red), Not yet puts it aside until tomorrow. -->
              <Button weight="ink" size="sm" aria-label={verb} disabled={done.has(line.key)} onclick={() => void finish(line)}>{lateWords.paid}</Button>
              <Button size="sm" disabled={done.has(line.key)} onclick={() => notYet(line)}>{lateWords.notYet}</Button>
            {:else if line.href}
              <Button size="sm" href={line.href}>{words.open}</Button>
            {/if}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if hidden > 0 || open}
    <button type="button" class="late-more tap" aria-expanded={open} onclick={() => (open = !open)}>{open ? words.fewer : words.more(hidden)}</button>
  {/if}
  {#if more > 0 && (open || hidden === 0)}<p class="late-past">{words.past(more)}</p>{/if}
</Tile>

<ItemMenu label={menuLine?.title ?? heading} bind:at={point} href={menuLine?.href} omit={['state']}>
  {#if menuLine}
    {@const line = menuLine}
    {@const verb = verbOf(line, writes)}
    {#if verb && !done.has(line.key)}<button role="menuitem" type="button" onclick={() => void finish(line)}><Icon name="check" size="s" /><span class="mi-name">{verb}</span></button>{/if}
    {#if verb && isBill(line) && !done.has(line.key)}<button role="menuitem" type="button" onclick={() => notYet(line)}><Icon name="clock" size="s" /><span class="mi-name">{lateWords.notYet}</span></button>{/if}
  {/if}
</ItemMenu>

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
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'tick title amount'
      'tick when acts';
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
    padding-block: var(--sp-3);
  }

  .ln:first-child {
    padding-block-start: 0;
  }

  .ln:last-child {
    padding-block-end: 0;
  }

  /* NO HAIRLINE BETWEEN ROWS (ops look, 3 Nov): the step of air between them says where one ends. */
  .ln + .ln {
    border-block-start: 0;
  }

  /* A LINE WITH NO TICK STARTS ON THE TILE'S EDGE (leftovers 4): a bill has no tick, and the empty column's gap stood its
     name 16px in from the heading over it ("Northbound invoice 1042" under "Late"). */
  .ln:not(:has(> .ln-tick)) {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title amount'
      'when acts';
  }

  .ln-title {
    grid-area: title;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: calc(22px * var(--type, 1));
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
    line-height: calc(18px * var(--type, 1));
  }

  .ln-when [data-late] {
    color: var(--red);
    font-weight: var(--fw-semi);
  }

  .ln-acts {
    display: flex;
    grid-area: acts;
    align-self: start;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  /* THE DAY LINE'S FIRST LINE IS LEVEL WITH THE BUTTON (4 Nov), held by the button's height and not by centring the two
     boxes: a day line that wrapped beside its buttons centred as a block, and its second line sat 9px under their centre.
     Any wrap now runs on below, and the button stays. */
  .ln:has(> .ln-acts > :global(*)) > .ln-when {
    align-self: start;
    padding-block: calc((var(--btn-h-sm) - var(--lead-meta)) / 2);
  }

  /* A TASK'S QUIET TICK: an empty ring at the line's start that fills with the check under the pointer, never
     a red button. 24 to the eye, a thumb's 44 under one. */
  .ln-tick {
    display: grid;
    grid-area: tick;
    place-items: center;
    align-self: center;
    inline-size: 24px;
    block-size: 24px;
    padding: 0;
    border: 1.5px solid var(--rule-strong);
    border-radius: 50%;
    background: none;
    color: transparent;
    cursor: pointer;
    transition: color var(--d-state) var(--ease-out), border-color var(--d-state) var(--ease-out);
  }

  .ln-tick:hover:not(:disabled),
  .ln-tick:focus-visible {
    border-color: var(--ink-2);
    color: var(--ink-2);
  }

  .ln[data-done] .ln-tick {
    border-color: var(--good);
    background: var(--good);
    color: var(--on-red);
  }

  @media (pointer: coarse) {
    .ln-tick {
      inline-size: var(--tap, 44px);
      block-size: var(--tap, 44px);
      border: 0;
      background: radial-gradient(circle, transparent 10px, var(--rule-strong) 10.5px, var(--rule-strong) 12px, transparent 12.5px);
    }
  }

  .ln[data-done] :is(.ln-title, .ln-amount) {
    color: var(--ink-3);
    text-decoration: line-through;
  }

  /* ON A PHONE THE BUTTON IS A ROW OF ITS OWN under how late, at the start, where a thumb reaches it. */
  @media (width < 640px) {
    .ln[data-bill] {
      grid-template-areas:
        'tick title amount'
        'tick when when'
        'tick acts acts';
    }

    .ln[data-bill]:not(:has(> .ln-tick)) {
      grid-template-areas:
        'title amount'
        'when when'
        'acts acts';
    }

    .ln-acts {
      justify-content: flex-start;
      padding-block-start: var(--sp-1);
    }

    /* AND ON ITS OWN ROW THE DAY LINE HAS NO BUTTON TO LINE UP WITH. */
    .ln:has(> .ln-acts > :global(*)) > .ln-when {
      padding-block: 0;
    }
  }

  .late-more {
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 30%, transparent);
    text-underline-offset: 3px;
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
  /* A row's name is a target: on a touch screen it takes the full tap height, as air round its line rather than as a
     44 tall line of its own, so the row is as tall as what it says (ops look, 3 Nov). */
  @media (pointer: coarse) {
    a.ln-title {
      position: relative;
    }

    a.ln-title::before {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap, 44px)) / 2)) 0;
    }
  }
</style>
