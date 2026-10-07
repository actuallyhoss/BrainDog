<!--
  Today's two lists of things that fall due, in one shape (`home-rows.ts`, DIRECTION §39).

  LATE: a line a thing, tasks and money alike. A red dot (a task only due today wears the quiet grey, since it is not
  late yet), its name as the door to its page, how late it is in the quiet ink, and its amount at the right edge in
  tabular figures, the money coming in in the earn green and going out in the ink. The columns line up down the list
  (`subgrid`), so the amounts read as one column. A TASK KEEPS ITS TICK BEHIND ITS DOT: pointed at or focused, the dot
  becomes the ring with its check, and pressing it is the tick it always was, with the page's own Undo. WHAT IS
  TICKED IS THE PAGE'S HOLD (`done`, `page-writes.ts` `heldDone`), so a refusal or an Undo takes the tick back, and a
  ticked line the page's next read leaves out stays where it was, done, as a ticked row does in any list.

  COMING UP: each day a 36px chip, the weekday over the date (today's in the accent's tint), and beside it what falls due
  that day, its amount at the right.

  No box round a line, no glyph before one: a hairline between lines, and the tile is the surface.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { homeCurrency } from '../record/api.ts';
  import { symbolText } from '../record/money.ts';
  import Icon from '../ui/Icon.svelte';
  import type { HomeLine, HomeRows } from './home-rows.ts';
  import { words } from './words.ts';

  let {
    rows,
    shown = Infinity,
    done = new Set(),
    ontick,
  }: {
    rows: HomeRows;
    /** How many lines to draw before the fold; the rest are one press away under the block. */
    shown?: number;
    /** The tasks the page holds ticked done, by their number. */
    done?: ReadonlySet<number> | undefined;
    /** Ticks the task with that number done. Absent where the page cannot write. */
    ontick?: ((seq: number) => void) | undefined;
  } = $props();

  const isDone = (line: HomeLine): boolean => line.tick !== undefined && done.has(line.tick);

  function tick(line: HomeLine) {
    if (line.tick === undefined || !ontick || isDone(line)) return;
    ontick(line.tick);
  }

  /* AN AMOUNT AS A SENTENCE SAYS IT, "−£9,190", the home currency by its sign and any other by its code (`symbolText`). */
  const said = (text: string): string => symbolText(text, homeCurrency());

  /* THE LINES LAST DRAWN, so a ticked one the next read left out goes back at its place. Not state: only read here. */
  let last: HomeLine[] = [];
  const late = $derived.by(() => {
    if (rows.kind !== 'late') return [];
    const out = [...rows.lines];
    const keys = new Set(out.map((l) => l.key));
    last.forEach((l, at) => {
      if (isDone(l) && !keys.has(l.key)) out.splice(Math.min(at, out.length), 0, l);
    });
    last = out;
    return out.slice(0, shown);
  });

  /* COMING UP, CUT AT THE FOLD a line at a time, so a day is never drawn without the things that fall due on it. */
  const days = $derived.by(() => {
    if (rows.kind !== 'days') return [];
    let left = shown;
    return rows.days.flatMap((d) => {
      if (left <= 0) return [];
      const lines = d.lines.slice(0, left);
      left -= lines.length;
      return [{ ...d, lines }];
    });
  });
</script>

{#snippet name(line: HomeLine)}
  {#if line.href}<a class="hl-title" href={at(line.href)}>{line.title}</a>{:else}<span class="hl-title">{line.title}</span>{/if}
{/snippet}

{#snippet amount(line: HomeLine)}
  {#if line.amount}<span class="hl-amount num" data-dir={line.amount.dir}>{said(line.amount.text)}</span>{/if}
{/snippet}

{#if rows.kind === 'late'}
  <ul class="home-late">
    {#each late as line (line.key)}
      <li class="hl" data-row={line.key} data-late={line.late ? '' : undefined} data-done={isDone(line) ? '' : undefined}>
        {#if line.tick !== undefined && ontick}
          <button
            type="button"
            class="hl-mark hl-tick tap"
            aria-label={words.markDone(line.title)}
            role="checkbox"
            aria-checked={isDone(line)}
            title={words.markDone(line.title)}
            onclick={() => tick(line)}><span class="hl-dot"></span><span class="hl-check"><Icon name="check" size="s" /></span></button
          >
        {:else}
          <span class="hl-mark" aria-hidden="true"><span class="hl-dot"></span></span>
        {/if}
        {@render name(line)}
        {#if line.when}<span class="hl-when">{line.when}</span>{/if}
        {@render amount(line)}
      </li>
    {/each}
  </ul>
{:else}
  <ul class="home-days">
    {#each days as d (d.day)}
      <li class="hd">
        <span class="hd-chip" data-today={d.today ? '' : undefined} title={d.label}>
          <span class="hd-week" aria-hidden="true">{d.weekday}</span><span class="hd-date num" aria-hidden="true">{d.date}</span><span class="vh">{d.label}</span>
        </span>
        <ul class="hd-lines">
          {#each d.lines as line (line.key)}
            <li class="hd-line" data-row={line.key}>{@render name(line)}{@render amount(line)}</li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── late ─────────────────────────────────────────────────────────────── */

  /* ONE GRID FOR THE WHOLE LIST, each line a subgrid of it, so how late and the amount are columns down the list. */
  .home-late {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto auto;
    column-gap: var(--sp-3);
  }

  .hl {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    min-block-size: 44px;
    padding-block: var(--sp-2);
  }

  .hl + .hl {
    border-block-start: 1px solid var(--line);
  }

  .hl-mark {
    display: grid;
    grid-column: 1;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
  }

  .hl-dot {
    inline-size: 8px;
    block-size: 8px;
    background: var(--dim);
    border-radius: var(--r-round);
  }

  .hl[data-late] .hl-dot {
    background: var(--danger);
  }

  /* THE TICK BEHIND THE DOT: a bare button the dot's size, its target the house's 44 (`.tap`). */
  .hl-tick {
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-round);
    color: var(--ink2);
    cursor: pointer;
  }

  .hl-check {
    display: none;
    place-items: center;
    inline-size: 18px;
    block-size: 18px;
    border: 1.5px solid currentColor;
    border-radius: var(--r-round);
  }

  .hl-tick:focus-visible .hl-dot,
  .hl[data-done] .hl-dot {
    display: none;
  }

  .hl-tick:focus-visible .hl-check,
  .hl[data-done] .hl-check {
    display: grid;
  }

  @media (hover: hover) and (pointer: fine) {
    .hl-tick:hover .hl-dot {
      display: none;
    }

    .hl-tick:hover .hl-check {
      display: grid;
    }
  }

  .hl[data-done] .hl-check {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--on-ink);
  }

  .hl[data-done] .hl-title {
    color: var(--dim);
    text-decoration: line-through;
  }

  .hl-title {
    grid-column: 2;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: 1.45;
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  @media (hover: hover) and (pointer: fine) {
    a.hl-title:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .hl-when {
    grid-column: 3;
    color: var(--dim);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  .hl .hl-amount {
    grid-column: 4;
  }

  .hl-amount {
    justify-self: end;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
  }

  .hl-amount[data-dir='in'] {
    color: var(--earn);
  }

  /* ON A PHONE HOW LATE GOES UNDER THE NAME, and the amount keeps the right edge. */
  @media (width < 640px) {
    .home-late {
      grid-template-columns: 20px minmax(0, 1fr) auto;
    }

    .hl {
      row-gap: 2px;
    }

    .hl-mark {
      align-self: start;
      margin-block-start: 2px;
    }

    .hl-when {
      grid-row: 2;
      grid-column: 2;
    }

    .hl .hl-amount {
      grid-row: 1;
      grid-column: 3;
    }
  }

  /* ── coming up ────────────────────────────────────────────────────────── */

  .home-days {
    display: flex;
    flex-direction: column;
  }

  .hd {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    column-gap: var(--sp-3);
    align-items: start;
    padding-block: var(--sp-2);
  }

  .hd + .hd {
    border-block-start: 1px solid var(--line);
  }

  /* THE DAY: 36 square, the control's corner, the weekday at 12 over the date at 15. Today's in the accent's tint. */
  .hd-chip {
    position: relative;
    display: grid;
    place-content: center;
    justify-items: center;
    inline-size: 36px;
    block-size: 36px;
    background: var(--field);
    border-radius: var(--r-ctl);
    color: var(--ink);
    line-height: 1;
  }

  .hd-chip[data-today] {
    background: var(--action-tint-1);
    color: var(--action-text);
  }

  .hd-week {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: var(--fw-medium);
  }

  .hd-chip[data-today] .hd-week {
    color: inherit;
  }

  .hd-date {
    margin-block-start: 2px;
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
  }

  .hd-lines {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-block-size: 36px;
  }

  .hd-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 36px;
  }

  .hd-line .hl-title {
    flex: 1;
  }
</style>
