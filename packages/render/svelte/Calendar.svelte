<!--
  `calendar`: every month from the first row's to the last row's as a grid of weeks, Monday first, each day naming its
  first rows and counting the rest, then an agenda of the days that hold anything. `src/calendar.ts` over
  `src/days.ts` decides every cell; `calendar` in `src/html.ts` is this file's twin, and `src/parity.test.ts` compiles
  this file and holds the two to one tree.

  NOTHING HERE MOVES BETWEEN MONTHS. Every month the rows reach is drawn, so the app, the mirror and the digest show the
  same calendar, and the host lays the grids out as its width allows: side by side, one under another, or, below 640px,
  each month as a strip of its days with a dot on a busy one (`data-count`) over the agenda.

  The markup has no whitespace between tags that sit on one line, on purpose: a line break there is a space the other
  renderer does not draw.

  A DAY A LINK OPENED THE CALENDAR ON (`?day=`, which a date anywhere on the record writes) is marked: `aria-current`
  says it, a ring in the working accent shows it, and it is scrolled into view once for each day asked, at once under
  reduced motion. The day comes from `opts.day`, or from the host's context (`CALENDAR_DAY`) where the host cannot
  reach a block's options; with neither, nothing is marked and the tree is the twin's.
-->
<script lang="ts">
  import { MISSING, TONES, WORKING_GLYPH, WORKING_LABEL, inline, takeWorking, text, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { getContext } from 'svelte';
  import { CALENDAR_DAY, CALENDAR_NONE, WEEKDAYS, calendarMore, calendarPlan, calendarSkipped } from '../src/calendar.ts';
  import { roadmapToday } from '../src/roadmap.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  /* `day` is not yet a key of RenderOptions (`src/html.ts`), so it is read as one more the host may give. */
  const asked = getContext<(() => string | null) | undefined>(CALENDAR_DAY);
  const mark = $derived((opts as RenderOptions & { day?: string | null }).day ?? asked?.() ?? null);
  const plan = $derived(calendarPlan(block.rows, roadmapToday(opts.now), mark));
  const skipped = $derived(plan.skipped.length ? calendarSkipped(plan.skipped.map((i) => said(block.rows[i]!, 0) || MISSING)) : '');

  /* THE MARKED DAY IN VIEW, once for each day asked: a re-read of the page draws the same day again and does not move
     the reader, and a second link on the same page moves them to its day. */
  let root = $state<HTMLElement | undefined>();
  let shown: string | null = null;
  $effect(() => {
    const day = mark;
    const cell = root?.querySelector('.calendar-cell[aria-current="date"]');
    if (!day || !cell || shown === day) return;
    shown = day;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cell.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  });
</script>

{#snippet item(r: Row)}
  {@const title = takeWorking(r.cells[0] || MISSING)}
  <li class="calendar-item" data-intent={r.tone}
    ><span class="calendar-title"
      >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
        nodes={inline(title.text ?? '', opts)}
        {opts}
      /></span
    >{#if r.tone}<span class="glyph" role="img" aria-label={TONES[r.tone].label}>{TONES[r.tone].glyph}</span>{/if}</li
  >
{/snippet}

{#snippet items(rows: Row[])}{#if rows.length}<ul class="calendar-items">{#each rows as r}{@render item(r)}{/each}</ul>{/if}{/snippet}

{#if plan.empty}
  <div class="calendar">
    <p class="calendar-empty">{CALENDAR_NONE}</p>
    {#if skipped}<p class="calendar-skipped">{skipped}</p>{/if}
  </div>
{:else}
  <div class="calendar" bind:this={root}>
    {#each plan.months as m}
      <table class="calendar-month">
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
    <ol class="calendar-agenda">
      {#each plan.days as d}
        <li class="calendar-day" data-today={d.today ? '' : undefined}><span class="calendar-date num">{d.said}</span>{@render items(d.items)}</li>
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
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    border-radius: var(--r-sm);
    scroll-margin-block: var(--sp-8);
  }

  :global(.calendar-cell[aria-current='date'] .calendar-num) {
    font-weight: 600;
  }
</style>
