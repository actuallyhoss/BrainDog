<!--
  The list's figures, above its rows: ONE TILE, the list's number on the left with the line that says
  what it means, and on the right where it sits, one line per state (or per largest row) with its count, its share of
  the number and a thin bar of that share. No tile holds a number without its reading.

  BY STATE IS HOW THE LIST DIVIDES, read from the declaration: each state that holds rows, in the list's own order, its
  bar in the accent while it is still to do and grey once it is finished, so the part that asks for
  something reads first. THE NUMBER is the list's number column added up; on a list with no state its largest rows
  share it out instead. A list with neither has no tile.

  MONEY IN AND MONEY OUT ARE NEVER ONE NUMBER. Where the list says which way each amount goes (`directionOf` in
  `list.ts`), the tile is one side per way, each with its own sum and its own lines by state, side by side, and no
  figure anywhere adds the two. It read "Amount £168,794" over a list of bills and invoices, which was what was owed
  to its owner and what they owed, added up.

  ".00" GOES WHERE EVERY AMOUNT IS WHOLE (`wholeMoney`), as it does down the column under the tile.

  A FIGURE IS DRAWN ONLY WHEN IT SAYS SOMETHING. The number needs three rows that hold one before it is a
  figure of the list rather than two day rates added together, and the lines need two parts before they compare
  anything; with less, the tile is the number and its line.

  ONLY OVER THE WHOLE LIST, which is the page's to know (`whole`): a total of the rows in hand, printed as the list's,
  is a false count. The split by state also goes while the list is filtered, where it would only restate the filter.
  ONE COLOUR FOR LATE (money F2): an open state's bar in the second ink, a part-paid one in
  slate, a finished one in the lightest step of the ink ramp, and at the start of the open bar the part that is late in
  the one red, with "2 late · £10,540" in red at the end of that line. THE TILE IS "Money" ON A LIST OF AMOUNTS, with
  no well (money F7): the page's own icon says what it is.

  ON A PHONE IT IS COMPACT, NEVER GONE (money F8): the phone shows the facts the laptop does. One 50% cell a side ("Out
  £119,124", "In £49,670") at 20, one 6px stacked bar (late, open, part paid, paid) and the late line under it.
-->
<script lang="ts">
  import { dayShort, exponentOf } from 'braindog-render';
  import { labelOf } from '$lib/record/api.ts';
  import { wayOfValue } from '$lib/record/money-way.ts';
  import type { Entry, RegisterDecl } from '$lib/record/schema.ts';
  import StateDot from '$lib/ui/StateDot.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { valueSaid } from '$lib/voice.ts';
  import { byStateOf, dotOf, drawsBar, figureParts, figureSaid, figureSplit, isLate, stateReading, wholeMoney, type Figured } from './list.ts';

  let {
    decl,
    entries,
    now,
    byState,
    headSaid = false,
    titleOf,
  }: {
    decl: RegisterDecl;
    /** The rows the figures are over: the whole list, with nothing typed or archived on this screen in it. */
    entries: readonly Entry[];
    now: number;
    /** Whether the split by state may be drawn: the list is whole and unfiltered. */
    byState: boolean;
    /** Whether the sentence under the list's title is drawn, which already says what is open and what is late. */
    headSaid?: boolean;
    /** A row's title as the list says it, for the largest rows. */
    titleOf: (e: Entry) => string;
  } = $props();

  /* This part's own words. */
  const words = {
    byState: 'By state',
    largest: 'Largest',
    unset: 'Not set',
    money: 'Money',
    /* A FIELD NAMED IN THE PLURAL TAKES NO ARTICLE (skills pass 2 Nov): runs said "4 of 9 have a writes". */
    holding: (n: number, of: number, what: string) => `${n} of ${of} have ${plural(what) ? '' : /^[aeiou]/u.test(what) ? 'an ' : 'a '}${what}.`,
    share: (n: number) => `${n}%`,
    late: (n: number, said: string | null) => (said ? `${n} late · ${said}` : `${n} late`),
    out: 'Out',
    in: 'In',
    newest: (what: string, on: string, one: string) => `${what} on ${on}, the newest ${one}.`,
  } as const;

  const stateField = $derived(decl.state ? decl.fields.find((x) => x.id === decl.state) : undefined);
  /** A state's own label, as the filters and the lanes say it. */
  const stateLabel = (value: string): string => (stateField ? valueSaid(stateField, value) : value);
  const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

  /* THREE ROWS HOLDING A VALUE BEFORE THE NUMBER IS THE LIST'S: two contractors' day rates added up is not a figure. */
  const figured = $derived.by(() => {
    const f = figureParts(decl, entries);
    return f && f.fig.seen >= 3 ? f : null;
  });
  const fig = $derived(figured?.fig ?? null);
  /* The list says which way its amounts go, so the tile is a side per way and never their sum. */
  const sided = $derived(figured?.by !== undefined);
  const whole = $derived(fig !== null && wholeMoney(decl, entries).has(fig.field.id));
  /* A TILE OF TOTALS SAYS THEM WHOLE (polish5's rule for a set of totals): "Money in $51,892.48" over the Ledger read
     against "Received $8,581" on its page. Where any sum on the tile is a thousand or more, every figure on it is whole;
     under that the column's own rule holds. */
  const unit = $derived(fig?.currency ? 10 ** exponentOf(fig.currency) : 1);
  const big = $derived.by(() => fig?.currency != null && Math.max(Math.abs(fig.total), ...sides.map((x) => Math.abs(x.total ?? 0))) >= 1000 * unit);
  const said = (f: Figured, n: number): string => (big ? figureSaid(f, Math.round(n / unit) * unit, true) : figureSaid(f, n, whole));
  /** A field's name in the plural ("writes", "hours"), by its last letter: not "status", not "process". */
  const plural = (what: string): boolean => /[^su]s$/u.test(what) && !what.includes(' ');

  type Dot = 'open' | 'part' | 'done';
  type Line = { key: string; label: string; count: number | null; value: number | null; stand: Dot | null; tint: boolean; share: number; late: { count: number; value: number; share: number } | null };
  type Side = { key: string; label: string | null; total: number | null; lines: Line[]; late: { count: number; value: number } | null };

  /** What of these rows is late: how many, and their part of the side's number. */
  const lateOf = (rows: readonly Entry[]): { count: number; value: number } | null => {
    const late = rows.filter((e) => isLate(decl, e, now));
    return late.length === 0 ? null : { count: late.length, value: fig ? late.reduce((n, e) => n + (fig.valueOf(e) ?? 0), 0) : late.length };
  };

  /**
   * THE LINES OF ONE SIDE: each state that holds rows, with its count and, where the list has a number, that state's
   * part of it. A share is of the side's number where there is one, else of its rows.
   */
  function stateLines(rows: readonly Entry[], total: number | null): Line[] {
    /* THE NEWEST READING HAS NO PARTS: nights by how they were taken would share out one night's cash. */
    if (fig?.latest !== undefined) return [];
    const states = byState ? byStateOf(decl, rows) : null;
    if (!states) return [];
    const all = total ?? rows.length;
    return states
      .filter((p) => p.count > 0)
      .map((p) => {
        const held = rows.filter((e) => String(e.fields[decl.state!] ?? '') === p.value);
        const value = fig ? held.reduce((n, e) => n + (fig.valueOf(e) ?? 0), 0) : null;
        const late = lateOf(held);
        return {
          key: p.value,
          label: sentenceCase(stateLabel(p.value)),
          count: p.count,
          value,
          stand: dotOf(decl, p.value),
          tint: false,
          share: all > 0 ? (value ?? p.count) / all : 0,
          late: late && all > 0 ? { ...late, share: late.value / all } : null,
        };
      })
      /* A SECOND OPEN STATE TAKES THE NEXT STEP OF THE INK, so two open states are told apart. */
      .map((l, at, rest) => ({ ...l, tint: l.stand === 'open' && rest.findIndex((x) => x.stand === 'open') !== at }));
  }

  const split = $derived(fig && fig.latest === undefined && !sided && !(byState && byStateOf(decl, entries)) ? figureSplit(decl, fig, entries, stateLabel, titleOf) : null);

  const sides = $derived.by((): Side[] => {
    if (figured && sided) {
      return figured.parts.map((p) => ({
        key: p.value ?? '',
        label: p.value === null ? words.unset : valueSaid(figured.by!, p.value),
        total: p.total,
        lines: stateLines(p.entries, p.total),
        late: byState ? lateOf(p.entries) : null,
      }));
    }
    const lines = stateLines(entries, fig?.total ?? null);
    if (lines.length > 0 || !split) return [{ key: '', label: null, total: fig?.total ?? null, lines, late: byState ? lateOf(entries) : null }];
    const all = fig?.total ?? 0;
    return [
      {
        key: '',
        label: null,
        total: all,
        lines: split.items.map((i, at) => ({ key: `${at}`, label: i.label, count: null, value: i.value, stand: null, tint: at > 0, share: all > 0 ? i.value / all : 0, late: null })),
        late: null,
      },
    ];
  });

  const states = $derived(byState ? byStateOf(decl, entries) : null);
  /* HOW MANY HOLD THE NUMBER, WHERE NOT ALL DO (next-money, M40): Categories said "Money $835" over sixteen categories,
     three of them with a budget, and nothing said the $835 was those three. "3 of 16 have a budget." */
  const holding = $derived(fig !== null && fig.seen < entries.length ? words.holding(fig.seen, entries.length, labelOf(fig.field).toLowerCase()) : null);
  const reading = $derived(
    fig?.latest !== undefined
      ? words.newest(labelOf(fig.field), dayShort(fig.latest), decl.one ?? 'row')
      : [holding, states ? stateReading(decl, states, entries, now, stateLabel, headSaid) : null, split?.reading ?? null].filter(Boolean).join(' '),
  );
  const one = $derived(sides.length === 1 && sides[0]!.label === null ? sides[0]! : null);
  const lead = $derived(fig !== null || reading !== '');
  const shown = $derived(fig !== null || sides.some((x) => x.lines.length >= 2));
  /* A FIGURE THAT IS NOT MONEY SAYS WHAT IT COUNTS beside the line's count: "Active 12 10" read as two counts of one
     thing on the list of runs, where the 10 was writes. Money says itself by its symbol. */
  /* AND ONE OF A PLURAL NAME IS SAID IN THE SINGULAR: "1 write", not "1 writes". */
  const figureNamed = (f: Figured, n: number): string => {
    if (f.field.type === 'money') return said(f, n);
    const what = labelOf(f.field).toLowerCase();
    return `${said(f, n)} ${n === 1 && plural(what) ? what.slice(0, -1) : what}`;
  };
  /* The late line of a side, in the list's own figures: "2 late · £10,540". */
  const lateSaid = (late: { count: number; value: number }): string => words.late(late.count, fig ? said(fig, late.value) : null);
  /* A side's short name on a phone: "Out" and "In" for the two ways money goes, named by what the side's value says
     (`out`, `owed_by_me`), never by where it sits in the list's values; else the side's own name. */
  const shortOf = (side: Side): string | null => {
    if (side.label === null || !figured?.by) return side.label;
    const way = wayOfValue(figured.by, side.key);
    return way === 'out' ? words.out : way === 'in' ? words.in : side.label;
  };
</script>

{#snippet lineList(lines: readonly Line[], label: string, late: { count: number; value: number } | null)}
  {@const first = lines.findIndex((x) => x.stand === 'open')}
  <ul class="sum-lines" aria-label={label}>
    {#each lines as l, at (l.key)}
      <li class="sum-line" data-stand={l.stand ?? undefined} data-tint={l.tint ? '' : undefined}>
        <span class="sum-name">{#if l.stand}<StateDot state={l.stand} />{/if}<span class="sum-label" dir="auto">{l.label}</span></span>
        <span class="sum-count num">{l.count ?? ''}</span>
        <span class="sum-value num">{#if fig && l.value !== null}{figureNamed(fig, l.value)}{:else}{words.share(Math.round(l.share * 100))}{/if}</span>
        <span class="sum-bar" aria-hidden="true"
          ><span class="sum-fill" style:inline-size="{Math.max(l.share * 100, l.share > 0 ? 1.5 : 0)}%"
            >{#if l.late}<span class="sum-late" style:inline-size="{l.share > 0 ? Math.min(100, (l.late.share / l.share) * 100) : 0}%"></span>{/if}</span
          ></span
        >
        <!-- WHAT IS LATE, SAID ONCE A SIDE, at the end of its first open line, in the one red. -->
        <span class="sum-late-said num">{#if late && at === (first >= 0 ? first : 0)}{lateSaid(late)}{/if}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#if shown}
  <!-- A TILE OF SIDES NAMES EACH SIDE ("Money out", "Money in"), so a "Money" heading over them says nothing new. -->
  <Tile
    class="list-figures"
    data-figured={fig ? '' : undefined}
    aria-label={fig && sided ? words.money : undefined}
    title={fig && sided ? undefined : fig ? (fig.field.type === 'money' ? words.money : labelOf(fig.field)) : words.byState}
    count={fig ? undefined : entries.length}
  >
    <!-- THE PHONE'S FORM: a cell a side, its figure at 20, one stacked bar, and what is late under it. -->
    {#if fig}
      <div class="compact" style:--sides={sides.length}>
        {#each sides as side (side.key)}
          {@const all = side.total ?? 0}
          <section class="cell" aria-label={side.label ?? undefined}>
            <p class="cell-head">{#if shortOf(side)}<span class="cell-name">{shortOf(side)}</span>{' '}{/if}<span class="cell-figure num">{said(fig, all)}</span></p>
            {#if drawsBar(side.lines)}
              <span class="stack" aria-hidden="true">
                {#each side.lines as l (l.key)}
                  {#if l.late}<span class="stack-part" data-late style:inline-size="{l.late.share * 100}%"></span>{/if}
                  <span class="stack-part" data-stand={l.stand ?? undefined} data-tint={l.tint ? '' : undefined} style:inline-size="{Math.max(0, l.share - (l.late?.share ?? 0)) * 100}%"></span>
                {/each}
              </span>
            {/if}
            {#if side.late}<p class="cell-late num">{lateSaid(side.late)}</p>{/if}
          </section>
        {/each}
      </div>
    {/if}
    <div class="full">
    {#if one}
      <div class="sum" data-split={lead && one.lines.length >= 2 ? '' : undefined}>
        <!-- THE LEFT HALF: the number and its line, or on a list with no number, the line alone at the headline's size.
             Where the head already said the line and there is no number, there is no left half, and the lines take the
             tile rather than leaving a third of it empty. -->
        {#if lead}
          <div class="sum-lead">
            {#if fig}<p class="figure num">{said(fig, fig.total)}</p>{/if}
            {#if reading}<p class="reading" data-alone={fig ? undefined : ''}>{reading}</p>{/if}
          </div>
        {/if}
        {#if one.lines.length >= 2}{@render lineList(one.lines, states ? words.byState : words.largest, one.late)}{/if}
      </div>
    {:else if fig}
      <!-- A SIDE FOR EACH WAY THE MONEY GOES, each with its own sum and its own lines, and nothing adding them. -->
      <div class="sides" style:--sides={sides.length}>
        {#each sides as side (side.key)}
          <section class="side" aria-label={side.label}>
            <div class="sum-lead">
              <p class="side-name">{side.label}</p>
              <p class="figure num">{said(fig, side.total ?? 0)}</p>
            </div>
            {#if side.lines.length >= 2}{@render lineList(side.lines, `${side.label}, ${words.byState.toLowerCase()}`, side.late)}{/if}
          </section>
        {/each}
      </div>
      {#if reading}<p class="reading">{reading}</p>{/if}
    {/if}
    </div>
  </Tile>
{/if}

<style>
  /* THE NUMBER AND ITS LINE ON THE LEFT, THE PARTS ON THE RIGHT, and on a narrow tile one under the other. */
  .sum {
    display: grid;
    gap: var(--sp-4) var(--sp-7);
    align-items: start;
  }

  /* THE NUMBER TAKES WHAT IT NEEDS AND THE LINES THE REST: a third of the tile held one figure and nothing under it. */
  .sum[data-split] {
    grid-template-columns: minmax(200px, 1fr) minmax(0, 3fr);
  }

  /* A SIDE PER WAY THE MONEY GOES, in equal columns: its name, its sum, and under them its lines by state. */
  .sides {
    display: grid;
    grid-template-columns: repeat(var(--sides, 2), minmax(0, 1fr));
    gap: var(--sp-5) var(--sp-7);
    align-items: start;
  }

  .sides + .reading {
    margin-block-start: var(--sp-4);
  }

  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .side .sum-lead {
    gap: var(--sp-1);
  }

  /* WHICH WAY, OVER ITS SUM: the meta size in the second ink, the field's own word for it ("Money in"). */
  .side-name {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .sum-lead {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* THE TILE'S FIGURE, 22 AT 600: read beside its heading, not shouted over it. */
  .figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    line-height: var(--lh-figure);
    letter-spacing: -0.01em;
    font-variant-numeric: tabular-nums;
  }

  /* THE ONE WRITTEN LINE, in the body size and the second ink, and at the headline's size where it stands alone. */
  .reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .reading[data-alone] {
    color: var(--ink);
    font-size: var(--fs-head);
    line-height: var(--lh-head);
  }

  /**
   * ONE LINE PER PART, ON ONE GRID: the name with its state's dot, the count, the figure right-aligned in tabular
   * figures, and the bar of its share taking what is left. The lines share their columns (`subgrid`), so the counts and
   * the figures stand in columns down the tile.
   */
  .sum-lines {
    display: grid;
    grid-template-columns: minmax(0, max-content) max-content max-content minmax(64px, 1fr) max-content;
    column-gap: var(--sp-4);
    row-gap: var(--sp-2);
    align-items: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sum-line {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    min-block-size: 24px;
  }

  .sum-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .sum-label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sum-count {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .sum-value {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  /* THE SHARE, A THIN BAR ON ITS TRACK (money F2): an open state in the second ink, a second open state a step
     lighter, part paid in slate, a finished state in the lightest step of the ink ramp; and at the start of the bar the
     part that is late, in the one red. */
  .sum-bar {
    display: block;
    block-size: 8px;
    overflow: hidden;
    background: var(--chart-track);
    border-radius: var(--r-round);
  }

  .sum-fill {
    display: flex;
    block-size: 100%;
    overflow: hidden;
    background: var(--ink-2);
    border-radius: inherit;
    transition: inline-size var(--d-recompose) var(--ease-standard);
  }

  .sum-line[data-tint] .sum-fill {
    background: var(--chart-2);
  }

  .sum-line[data-stand='part'] .sum-fill {
    background: var(--chart-other);
  }

  .sum-line[data-stand='done'] .sum-fill {
    background: var(--chart-3);
  }

  .sum-late {
    display: block;
    flex: none;
    block-size: 100%;
    background: var(--red);
  }

  .sum-late-said {
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .sum-fill {
      transition: none;
    }
  }

  /* THE PHONE'S FORM IS DRAWN BELOW 900, and the full one from 900; a list with no number keeps its lines for the
     laptop only, where the rows come second. */
  .compact {
    display: none;
  }

  @media (width < 900px) {
    :global(section.tile.list-figures:not([data-figured])) {
      display: none;
    }

    .full {
      display: none;
    }

    .compact {
      display: grid;
      grid-template-columns: repeat(var(--sides, 2), minmax(0, 1fr));
      gap: var(--sp-4);
    }
  }

  .cell {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .cell-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    margin: 0;
  }

  .cell-name {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* 20 AT 600 IN THE DISPLAY FACE: a figure read at a glance, on one line. */
  .cell-figure {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: calc(var(--fs-figure) - 2px);
    font-weight: var(--fw-semi);
    line-height: 28px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ONE 6px STACKED BAR: late, open, part paid, paid, in the colours of the lines on a laptop. */
  .stack {
    display: flex;
    block-size: 6px;
    overflow: hidden;
    background: var(--chart-track);
    border-radius: var(--r-round);
  }

  .stack-part {
    display: block;
    flex: none;
    block-size: 100%;
    background: var(--ink-2);
  }

  .stack-part[data-late] {
    background: var(--red);
  }

  .stack-part[data-tint] {
    background: var(--chart-2);
  }

  .stack-part[data-stand='part'] {
    background: var(--chart-other);
  }

  .stack-part[data-stand='done'] {
    background: var(--chart-3);
  }

  .cell-late {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  @media (width < 1100px) {
    .sum[data-split],
    .sides {
      grid-template-columns: minmax(0, 1fr);
    }
  }

</style>
