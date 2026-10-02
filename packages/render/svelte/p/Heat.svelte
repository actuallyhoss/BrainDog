<!--
  `heat`: twelve weeks by weekday, each day a cell washed in one of four steps by how busy it was, today outlined,
  and the counted days said again as a table. `src/heat.ts` over `src/days.ts` decides every cell; `heat` in
  `src/html.ts` is this file's twin, and `heat.test.ts` holds the two to one tree with one clock.

  THE `people` FORM IS A LINE A PERSON, a dot in each of the twelve weeks they were in touch, each person's dots named
  in words, so it needs no fold of numbers under it (`heatPeoplePlan`).

  IT IS ON `grid` AND HAD NO ARM THERE, so until this file the app drew a heat block as stat tiles: the day as a
  label and the value as a figure, one tile a row, while `toHTML` drew the weeks (measured by the parity shapes).
-->
<script lang="ts">
  import { inline, text, MISSING, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import {
    HEAT_DAY,
    HEAT_NONE,
    HEAT_VALUE,
    heatLines,
    heatMissed,
    heatOutside,
    heatPeopleMore,
    heatPeoplePlan,
    heatPersonSaid,
    heatPlan,
    heatSkipped,
    heatTitle,
    heatWeekTitle,
  } from '../../src/heat.ts';
  import { LINES_NUMBERS } from '../../src/lines.ts';
  import { roadmapToday } from '../../src/roadmap.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  const plan = $derived(heatPlan(block.rows.map((r) => ({ day: said(r, 0), value: said(r, 1) })), roadmapToday(opts.now)));
  const skipped = $derived(plan.skipped.length ? heatSkipped(plan.skipped.map((i) => said(block.rows[i]!, 0) || MISSING)) : '');
  const people = $derived(block.form === 'people' ? heatPeoplePlan(block.rows.map((r) => ({ day: said(r, 0), who: said(r, 1) })), roadmapToday(opts.now)) : null);
  const missed = $derived(people?.skipped.length ? heatMissed(people.skipped.map((i) => said(block.rows[i]!, 0) || MISSING)) : '');
</script>

{#if people}
  {#if people.empty}
    <div class="heat" data-form="people">
      <p class="heat-empty">{HEAT_NONE}</p>
      {#if missed}<p class="heat-skipped">{missed}</p>{/if}
    </div>
  {:else}
    <div class="heat" data-form="people" style="--weeks:{people.weeks}">
      <ol class="heat-people" aria-label={people.name}>
        {#each people.people as p}
          <li class="heat-person">
            <span class="heat-who">{p.who}</span>
            <span class="heat-weeks" role="img" aria-label={heatPersonSaid(p, people.weeks)}>
              {#each p.weeks as on, w}
                <span class="heat-week" data-on={on ? '' : undefined} data-now={w === people.weeks - 1 ? '' : undefined} title={on ? heatWeekTitle(people.starts[w]!) : undefined}></span>
              {/each}
            </span>
          </li>
        {/each}
      </ol>
      <ol class="heat-ticks" aria-hidden="true">
        {#each people.ticks as t}<li class="heat-tick" style="--week:{t.week}">{t.label}</li>{/each}
      </ol>
      {#if people.more}<p class="heat-more">{heatPeopleMore(people.more)}</p>{/if}
      {#if missed}<p class="heat-skipped">{missed}</p>{/if}
    </div>
  {/if}
{:else if plan.empty}
  <div class="heat">
    <p class="heat-empty">{HEAT_NONE}</p>
    {#if skipped}<p class="heat-skipped">{skipped}</p>{/if}
    {#if plan.outside}<p class="heat-outside">{heatOutside(plan.outside)}</p>{/if}
  </div>
{:else}
  <div class="heat" style="--weeks:{plan.weeks}">
    <!-- One picture with one name: each day says itself only as a hover, and the table below is what a screen reader reads. -->
    <div class="heat-grid" role="img" aria-label={plan.name}>
      {#each plan.cells as c}
        <span
          class="heat-day"
          data-today={c.today ? '' : undefined}
          data-future={c.future ? '' : undefined}
          data-wash={c.wash === null ? undefined : c.wash}
          title={heatTitle(c) ?? undefined}
        ></span>
      {/each}
    </div>
    <details class="lines-numbers">
      <summary class="lines-toggle">{LINES_NUMBERS}</summary>
      <table class="heat-table">
        <thead>
          <tr><th scope="col">{HEAT_DAY}</th><th scope="col">{HEAT_VALUE}</th></tr>
        </thead>
        <tbody>
          {#each heatLines(plan) as l}
            <tr><th scope="row">{l.day}</th><td class="num">{l.count}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>
    {#if skipped}<p class="heat-skipped">{skipped}</p>{/if}
    {#if plan.outside}<p class="heat-outside">{heatOutside(plan.outside)}</p>{/if}
  </div>
{/if}
