<!--
  The week strip (SYSTEM §6): a column a day, the weekday at 13 in `dim`, the date at 17/600, and one
  dot a thing that day in its project's colour. Today is an ink disc with its date in `--on-ink`; a
  thing still open past the day it was due is a red dot on that day. A hairline separates the weeks.

  Pass 13 or 14 consecutive days. Days before today are quieter, and weekends a step quieter than
  weekdays. At phone width the strip folds into a calendar, a week a row (see `weekstrip.ts`).

  Give each item a `label` and the sentence a screen reader hears names it; without one it is counted.
-->
<script lang="ts">
  import './viz.css';
  import { describeWeek, weekstrip, type WeekDay } from './weekstrip.ts';

  let {
    days,
    today,
    subject,
    summary,
  }: {
    days: readonly WeekDay[];
    /** Today, as `YYYY-MM-DD`. */
    today: string;
    /** What the days hold, which leads the sentence: "The next 14 days". */
    subject?: string | undefined;
    /** The whole sentence, when the one built from the days will not do. */
    summary?: string | undefined;
  } = $props();

  let measured = $state(0);
  const W = $derived(measured > 0 ? measured : 416);
  const g = $derived(weekstrip(days, today, W));
  const said = $derived(summary ?? describeWeek(days, today, subject));
</script>

<div class="viz viz-week" bind:clientWidth={measured}>
  <svg viewBox="0 0 {W} {g.height}" role="img" aria-label={said}>
    {#each g.heads as head, i (i)}
      <text class="wk-head" x={head.x} y={g.headY} text-anchor="middle">{head.text}</text>
    {/each}
    {#each g.rules as rule, i (i)}
      <line class="viz-grid" x1={rule.x1} y1={rule.y1} x2={rule.x2} y2={rule.y2} />
    {/each}
    {#each g.cells as cell (cell.date)}
      {#if cell.today}
        <rect class="wk-disc" x={cell.x - cell.discW / 2} y={cell.top} width={cell.discW} height="28" rx="14" />
      {/if}
      <text
        class="wk-date"
        data-today={cell.today ? '' : undefined}
        data-past={cell.past ? '' : undefined}
        data-weekend={cell.weekend ? '' : undefined}
        x={cell.x}
        y={cell.dateY}
        text-anchor="middle">{cell.text}</text
      >
      {#each cell.dots as dot, k (k)}
        <circle
          class="viz-fill"
          data-tone={dot.late ? 'danger' : undefined}
          style:--c={dot.late ? undefined : dot.colour}
          cx={dot.x}
          cy={dot.y}
          r="3"
        />
      {/each}
      {#if cell.more > 0}
        <text class="viz-label" x={cell.x} y={cell.moreY} text-anchor="middle">+{cell.more}</text>
      {/if}
    {/each}
  </svg>
</div>

<style>
  .wk-head {
    fill: var(--dim);
    font-size: var(--t-sm);
  }

  .wk-date {
    fill: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
  }

  .wk-date[data-weekend] {
    fill: var(--ink2);
  }

  .wk-date[data-past] {
    fill: var(--dim);
  }

  .wk-date[data-today] {
    fill: var(--on-ink);
  }

  .wk-disc {
    fill: var(--ink);
  }

  @media (forced-colors: active) {
    .wk-head,
    .wk-date,
    .wk-date[data-weekend],
    .wk-date[data-past] {
      fill: CanvasText;
    }

    .wk-date[data-today] {
      fill: HighlightText;
    }

    .wk-disc {
      fill: Highlight;
    }
  }
</style>
