<!--
  `calendar`: every month from the first row's to the last row's as a grid of weeks, Monday first, each day naming its
  first rows and counting the rest, then an agenda of the days that hold anything. `src/calendar.ts` over
  `src/days.ts` decides every cell; `calendar` in `src/html.ts` is this file's twin, and `src/parity.test.ts` compiles
  this file and holds the two to one tree.

  ONE MONTH AT A TIME. Every month the rows reach is written and one is shown (`plan.focus`: the marked day's, else this
  one, else the next), the rest `hidden`, as the twin writes them. Where the host can act (`opts.scenario`) two arrows
  move between them; the tree with neither pressed is the twin's. Under the month, a wide host lists the agenda's days
  outside it (`data-shown` marks the rest), so no row is ever only behind an arrow. Below 640px the month is a strip of
  its days with a dot on a busy one (`data-count`) over the whole agenda.

  The markup has no whitespace between tags that sit on one line, on purpose: a line break there is a space the other
  renderer does not draw.

  A DAY A LINK OPENED THE CALENDAR ON (`?day=`, which a date anywhere on the record writes) is marked: `aria-current`
  says it, a ring in the working accent shows it, and it is scrolled into view once for each day asked, at once under
  reduced motion. The day comes from `opts.day`, or from the host's context (`CALENDAR_DAY`) where the host cannot
  reach a block's options; with neither, nothing is marked and the tree is the twin's.

  A STRIP WHEN THE BLOCK SAYS `weeks` (the record's answer handed through by the app, `calendarStripPlan`): a week a
  row of seven days from the Monday of this one, each day saying its date and its first rows, today with the word
  `Today` beside its date and never its colour alone, the days of this week already gone drawn quieter. Below 640px a
  week reads as a list of its days with something on them, and a week with nothing says so. Months draw as they did.
-->
<script lang="ts">
  import { MISSING, TONES, WORKING_GLYPH, WORKING_LABEL, inline, takeWorking, text, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { getContext } from 'svelte';
  import {
    CALENDAR_DAY,
    CALENDAR_FEW,
    CALENDAR_NONE,
    CALENDAR_REST,
    CALENDAR_VIEWS,
    CALENDAR_VIEW_LIST,
    CALENDAR_VIEW_MONTH,
    CALENDAR_TODAY,
    CALENDAR_WEEK_NONE,
    WEEKDAYS,
    calendarMore,
    calendarNext,
    calendarOutside,
    calendarPrev,
    calendarPlan,
    calendarSkipped,
    calendarStripPlan,
  } from '../src/calendar.ts';
  import { roadmapToday } from '../src/roadmap.ts';
  import { barFigures } from '../src/format.ts';
  import Text from './Text.svelte';
  import { pointed, type Point } from './menu-at.ts';

  let {
    block,
    opts = {},
    onmenu,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** A thing's menu where it is right-clicked or held, on a thing the record names (`ref`); the host says `false` when it has none. */
    onmenu?: ((row: Row, anchor: HTMLElement, point?: Point) => unknown) | undefined;
  } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  /* THE RECORD ROW A THING STANDS FOR: its own, or the one its title links to (a calendar reads across lists). */
  const LINKED = /\]\(\/r\/([a-z][a-z0-9_]*)\/([1-9][0-9]*)\)/u;
  const refOf = (r: Row): Row | null => {
    if (r.ref) return r;
    const m = LINKED.exec(r.cells[0] ?? '');
    return m ? { ...r, ref: { register: m[1]!, seq: Number(m[2]), version: 0 } } : null;
  };
  /* `day` is not yet a key of RenderOptions (`src/html.ts`), so it is read as one more the host may give. */
  const asked = getContext<(() => string | null) | undefined>(CALENDAR_DAY);
  const mark = $derived((opts as RenderOptions & { day?: string | null }).day ?? asked?.() ?? null);
  /* `weeks` is set by the app on the block it hands over, as it sets `actions` (`src/parse.ts`). */
  const weeks = $derived(block.weeks);
  const strip = $derived(typeof weeks === 'number' ? calendarStripPlan(block.rows, roadmapToday(opts.now), weeks, mark) : null);
  const plan = $derived(calendarPlan(block.rows, roadmapToday(opts.now), mark));
  const skippedOf = (at: readonly number[]): string => (at.length ? calendarSkipped(at.map((i) => said(block.rows[i]!, 0) || MISSING)) : '');
  const skipped = $derived(skippedOf(strip ? strip.skipped : plan.skipped));
  /* EACH ROW'S AMOUNT, its third cell, as one set (`barFigures`), said in the agenda after its title. */
  const amounts = $derived(barFigures(block.rows.map((r) => (r.cells[2] ?? '').trim()), opts.home));
  const amountOf = (r: Row): string => amounts[block.rows.indexOf(r)] ?? '';
  /* A FEW ENTRIES ARE A LIST (`CALENDAR_FEW`), and where the host can act the reader may ask for the month instead. The
     choice is this drawing's alone, so the tree with nothing chosen is the twin's. */
  const few = $derived(plan.days.reduce((n, d) => n + d.items.length, 0) <= CALENDAR_FEW);
  let view = $state<'month' | 'list' | null>(null);
  const listed = $derived(view === null ? few : view === 'list');
  /* THE MONTH SHOWN: the plan's until an arrow is pressed, then the month pressed to, while the rows still reach it. */
  let picked = $state<string | null>(null);
  const at = $derived.by(() => {
    const i = picked === null ? -1 : plan.months.findIndex((m) => m.month === picked);
    return i >= 0 ? i : plan.focus;
  });
  const shownMonth = $derived(plan.months[at]?.month ?? '');
  const rest = $derived(plan.days.some((d) => d.day.slice(0, 7) !== shownMonth));
  const step = (by: number): void => {
    const to = plan.months[at + by];
    if (to) picked = to.month;
  };

  /* THE MARKED DAY IN VIEW, once for each day asked: a re-read of the page draws the same day again and does not move
     the reader, and a second link on the same page moves them to its day. */
  let root = $state<HTMLElement | undefined>();
  let shown: string | null = null;
  $effect(() => {
    const day = mark;
    const cell = root?.querySelector('[aria-current="date"]');
    if (!day || !cell || shown === day) return;
    shown = day;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cell.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  });
</script>

{#snippet item(r: Row)}
  {@const title = takeWorking(r.cells[0] || MISSING)}
  {@const named = refOf(r)}
  <li class="calendar-item" data-intent={r.tone} data-menu-host={onmenu && named ? 'self' : undefined} {@attach onmenu && named && pointed((p) => onmenu(named, document.body, p))}
    ><span class="calendar-title"
      >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
        nodes={inline(title.text ?? '', opts)}
        {opts}
      /></span
    >{#if amountOf(r)}<span class="calendar-amount num">{amountOf(r)}</span>{/if}{#if r.tone}<span class="glyph" role="img" aria-label={TONES[r.tone].label}>{TONES[r.tone].glyph}</span>{/if}</li
  >
{/snippet}

{#snippet items(rows: Row[])}{#if rows.length}<ul class="calendar-items">{#each rows as r}{@render item(r)}{/each}</ul>{/if}{/snippet}

{#if strip}
  <div class="calendar calendar-strip" bind:this={root}>
    {#if strip.empty}<p class="calendar-empty">{CALENDAR_NONE}</p>{/if}
    {#each strip.empty ? [] : strip.weeks as w}
      <div class="calendar-week" data-count={w.count > 0 ? w.count : undefined}>
        <p class="calendar-week-label">{w.label}</p>
        <ol class="calendar-week-days" aria-label={w.label}>
          {#each w.days as d}
            <li class="calendar-strip-day" data-today={d.today ? '' : undefined} data-past={d.past ? '' : undefined} data-count={d.count > 0 ? d.count : undefined} aria-current={d.marked ? 'date' : undefined}
              ><span class="calendar-strip-date num">{d.said}{#if d.today}{' '}<span class="calendar-today">{CALENDAR_TODAY}</span>{/if}</span>{@render items(d.items)}{#if d.more > 0}<span
                  class="calendar-more">{calendarMore(d.more)}</span
                >{/if}</li
            >
          {/each}
        </ol>
        {#if w.count === 0}<p class="calendar-week-none">{CALENDAR_WEEK_NONE}</p>{/if}
      </div>
    {/each}
    {#if strip.outside.length}<p class="calendar-skipped">{calendarOutside(strip.outside.length)}</p>{/if}
    {#if skipped}<p class="calendar-skipped">{skipped}</p>{/if}
  </div>
{:else if plan.empty}
  <div class="calendar">
    <p class="calendar-empty">{CALENDAR_NONE}</p>
    {#if skipped}<p class="calendar-skipped">{skipped}</p>{/if}
  </div>
{:else}
  <div class="calendar" data-few={few ? '' : undefined} data-view={view ?? undefined} bind:this={root}>
    {#if opts.scenario}
      <!-- MONTH OR LIST, a choice in the tile's head where the host can act (the money review). -->
      <div class="segmented calendar-views" role="group" aria-label={CALENDAR_VIEWS}>
        <button type="button" class="segment" data-on={listed ? undefined : ''} aria-pressed={!listed} onclick={() => (view = 'month')}>{CALENDAR_VIEW_MONTH}</button>
        <button type="button" class="segment" data-on={listed ? '' : undefined} aria-pressed={listed} onclick={() => (view = 'list')}>{CALENDAR_VIEW_LIST}</button>
      </div>
    {/if}
    {#if opts.scenario && plan.months.length > 1 && !listed}
      <!-- PREVIOUS AND NEXT, at the end of the month's caption row; the twin has no buttons and writes the shown month alone. -->
      <div class="calendar-move" role="group" aria-label={plan.months[at]?.label}>
        <button type="button" class="calendar-step" disabled={at === 0} aria-label={calendarPrev(plan.months[at - 1]?.label ?? '')} onclick={() => step(-1)}
          ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button
        ><button type="button" class="calendar-step" disabled={at === plan.months.length - 1} aria-label={calendarNext(plan.months[at + 1]?.label ?? '')} onclick={() => step(1)}
          ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg></button
        >
      </div>
    {/if}
    {#each plan.months as m, i}
      <table class="calendar-month" hidden={i !== at} data-moved={picked !== null && i === at ? '' : undefined}>
        <caption class="calendar-caption">{m.label}</caption>
        <thead>
          <tr>
            {#each WEEKDAYS as d}<th scope="col" abbr={d.long}>{d.short}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each m.weeks as week}
            <tr>
              {#each week as c}
                {#if c.inside}
                  <td class="calendar-cell" data-today={c.today ? '' : undefined} data-count={c.count > 0 ? c.count : undefined} aria-current={c.marked ? 'date' : undefined}
                    ><span class="calendar-num num">{c.num}</span>{@render items(c.items)}{#if c.more > 0}<span class="calendar-more"
                        >{calendarMore(c.more)}</span
                      >{/if}</td
                  >
                {:else}
                  <td class="calendar-cell" data-outside=""></td>
                {/if}
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/each}
    {#if rest}<p class="calendar-rest">{CALENDAR_REST}</p>{/if}
    <ol class="calendar-agenda">
      {#each plan.days as d}
        <li class="calendar-day" data-today={d.today ? '' : undefined} data-shown={d.day.slice(0, 7) === shownMonth ? '' : undefined}><span class="calendar-date num">{d.said}</span>{@render items(d.items)}</li>
      {/each}
    </ol>
    {#if skipped}<p class="calendar-skipped">{skipped}</p>{/if}
  </div>
{/if}

<style>
  /* THE DAY A LINK OPENED, ringed in the working accent and said by `aria-current`, so it is never told by colour alone.
     GLOBAL, as `Cards.svelte`'s are: a scoped rule marks the cells it matches, and the twin's tree would differ by the
     mark. An outline and not a border, so the week does not move by its width. */
  :global(.calendar-cell[aria-current='date']) {
    outline: 2px solid var(--red);
    outline-offset: -2px;
    border-radius: var(--r-xs);
    scroll-margin-block: var(--sp-8);
  }

  :global(.calendar-cell[aria-current='date'] .calendar-num) {
    font-weight: 600;
  }

  /* ── the strip ──────────────────────────────────────────────────────────
     GLOBAL FOR THE SAME REASON, and every rule under `.calendar-strip`, so nothing here reaches a month's grid. A week is
     seven fixed columns, so a day with a long title is as wide as a free one; a day is a hairline and air, as a
     month's day is, and today's hairline is the working accent beside the word, never the colour alone. */
  :global(.calendar-strip .calendar-week) {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  :global(.calendar-strip .calendar-week-label) {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  :global(.calendar-strip .calendar-week-days) {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  :global(.calendar-strip .calendar-strip-day) {
    display: grid;
    align-content: start;
    gap: var(--sp-1);
    min-block-size: 5.5rem;
    min-inline-size: 0;
    padding-block-start: var(--sp-1);
    border-block-start: 2px solid var(--rule);
  }

  :global(.calendar-strip .calendar-strip-date) {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  :global(.calendar-strip .calendar-strip-day[data-today]) {
    border-block-start-color: var(--red-fill);
  }

  :global(.calendar-strip .calendar-strip-day[data-today] .calendar-strip-date) {
    color: var(--ink);
    font-weight: 600;
  }

  :global(.calendar-strip .calendar-today) {
    color: var(--red-fill);
    font-weight: 600;
  }

  :global(.calendar-strip .calendar-strip-day[data-past]) {
    opacity: 0.6;
  }

  :global(.calendar-strip .calendar-item) {
    font-size: var(--fs-body);
  }

  :global(.calendar-strip .calendar-title) {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.calendar-strip .calendar-week-none) {
    display: none;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  /* NARROW, A WEEK IS A LIST OF ITS DAYS WITH SOMETHING ON THEM, the date in its own column and the titles whole beside
     it, and a week with nothing says so in a line. Today stays, with its word, even on a free day. */
  @container (inline-size < 40rem) {
    :global(.calendar-strip .calendar-week-days) {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }

    :global(.calendar-strip .calendar-strip-day) {
      grid-template-columns: minmax(9ch, auto) minmax(0, 1fr);
      align-items: baseline;
      gap: var(--sp-3);
      min-block-size: 0;
      padding-block: var(--sp-2);
      border-block-start-width: 1px;
    }

    :global(.calendar-strip .calendar-strip-day:not([data-count]):not([data-today])) {
      display: none;
    }

    :global(.calendar-strip .calendar-strip-day .calendar-more) {
      grid-column: 2;
    }

    :global(.calendar-strip .calendar-title) {
      overflow-wrap: anywhere;
      white-space: normal;
    }

    :global(.calendar-strip .calendar-week:not([data-count]) .calendar-week-none) {
      display: block;
    }
  }
</style>
