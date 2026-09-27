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
-->
<script lang="ts">
  import { MISSING, TONES, WORKING_GLYPH, WORKING_LABEL, inline, takeWorking, text, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { CALENDAR_NONE, WEEKDAYS, calendarMore, calendarPlan, calendarSkipped } from '../src/calendar.ts';
  import { roadmapToday } from '../src/roadmap.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  const plan = $derived(calendarPlan(block.rows, roadmapToday(opts.now)));
  const skipped = $derived(plan.skipped.length ? calendarSkipped(plan.skipped.map((i) => said(block.rows[i]!, 0) || MISSING)) : '');
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
  <div class="calendar">
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
                  <td class="calendar-cell" data-today={c.today ? '' : undefined} data-count={c.count > 0 ? c.count : undefined}
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
