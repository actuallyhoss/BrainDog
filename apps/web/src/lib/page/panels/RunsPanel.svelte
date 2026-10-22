<!--
  Today's runs on the Agents page (`panel: run-list`): the day of agent runs as lanes, one a kind of agent, and under it
  every run newest first, agent runs, jobs, automation runs, scheduled actions and scripts in one list, grouped by day.

  THE LANES ARE THE BOARD'S AT WORK CHART (`agentDay` in `record/all-runs.ts`): midnight to now, a lane an agent, each
  run a bar from when it started to when it was last heard, the ones at work in the ink and the finished ones in the
  quiet fill, now as a red line at the end with its time. Words under it say how many runs that is. The axis starts at
  the hour the first run did, so runs that cluster spread out, and runs that overlap in a lane sit on rows of their own.

  EACH LINE WEARS WHAT RAN: an agent run its agent's mark, the rest their kind's glyph.

  THE LINES ARE `runLines`' (`routes/automations/hub.ts`) plus the agent runs and jobs (`record/all-runs.ts`). An agent
  run is titled by what it did, with its agent, where it stands and when under it. A line opens the thing that ran.

  NO UNDO HERE. A run's way back is on its own page, where what it changed is read before anything goes back.

  A HOST PANEL loaded by `import()` from `BlockSlot.svelte` only. With nothing to list the tile is left out whole.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { readAllRuns, runsWords, type AgentDay } from '$lib/record/all-runs.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import AgentMark from '$lib/ui/AgentMark.svelte';
  import { agentKindOf } from '$lib/ui/face.ts';
  import { clockOf, kindIcon, runDays, type RunLine } from '../../../routes/automations/hub.ts';
  import { listen } from '../listen.svelte.ts';

  /** How many lines are drawn; the rest are said as a count. */
  const SHOWN = 12;

  let lines = $state.raw<RunLine[]>([]);
  let day = $state.raw<AgentDay | null>(null);
  let short = $state(false);
  let drew = $state<boolean | null>(null);
  let all = $state(false);

  async function load(): Promise<void> {
    const out = await readAllRuns(apiBase(), recordNow());
    if (out.from === 'refused') {
      lines = [];
      day = null;
      drew = false;
      return;
    }
    lines = out.lines;
    day = out.day;
    short = out.short;
    drew = out.lines.length > 0 || out.day !== null;
  }

  onMount(() => void load());
  listen(load, () => false);

  const shown = $derived(all ? lines : lines.slice(0, SHOWN));
  const days = $derived(runDays(shown, recordNow()));
</script>

{#if drew !== true}
  <!-- NOT READ YET, OR NOTHING HAS RUN: the tile is left out whole (`BlockSlot.svelte`'s rule for a panel that drew nothing). -->
  <span data-seen-none hidden></span>
{:else}
  <div class="runs">
    {#if day}
      <figure class="day" aria-label={runsWords.since(day.runs)}>
        <ol class="day-lanes">
          {#each day.lanes as lane (lane.agent)}
            <li class="day-lane">
              <span class="day-who"><AgentMark kind={agentKindOf(lane.agent)} size="s" /><span class="day-name">{lane.name}</span><span class="day-n num">{lane.spans.length.toLocaleString('en')}</span></span>
              <span class="day-track" aria-hidden="true" data-rows={lane.rows > 1 ? lane.rows : undefined} style="--rows:{lane.rows}">
                {#each lane.spans as sp, n (n)}<span class="day-bar" data-live={sp.live ? '' : undefined} style="--at:{sp.at}%;--w:{sp.width}%" style:--row={sp.row}></span>{/each}
                <span class="day-now"></span>
              </span>
            </li>
          {/each}
        </ol>
        <div class="day-axis" aria-hidden="true">
          {#each day.ticks as t (t.label)}{#if t.at < 88}<span class="day-tick num" data-near={t.at > 70 ? '' : undefined} style="--at:{t.at}%">{t.label}</span>{/if}{/each}
          <span class="day-tick day-tick-now num">{runsWords.now(day.now)}</span>
        </div>
        <figcaption class="day-foot">
          <span class="day-key"><span class="day-swatch"></span>{runsWords.finished}</span>
          <span class="day-key"><span class="day-swatch" data-live=""></span>{runsWords.running}</span>
          <span class="day-count num">{runsWords.since(day.runs)}</span>
        </figcaption>
      </figure>
    {/if}
    {#if short}<p class="runs-note">{runsWords.short}</p>{/if}
    {#each days as d (d.key)}
      <h3 class="runs-day">{d.title}</h3>
      <ul class="runs-list">
        {#each d.lines as line (line.key)}
          <li class="runs-line" data-bad={line.bad ? '' : undefined}>
            <span class="runs-mark">{#if line.agent}<AgentMark kind={agentKindOf(line.agent)} size="s" />{:else}<Icon name={kindIcon(line.kind)} size="s" />{/if}</span>
            <div class="runs-text">
              {#if line.path}<a class="runs-name" href={at(line.path)}>{line.name}</a>{:else}<span class="runs-name">{line.name}</span>{/if}
              <span class="runs-said">{line.said}</span>
            </div>
            <span class="runs-clock num">{clockOf(line.at)}</span>
          </li>
        {/each}
      </ul>
    {/each}
    <p class="runs-note runs-foot">
      {#if lines.length > SHOWN && !all}<button type="button" class="runs-more" onclick={() => (all = true)}>{`Show ${(lines.length - SHOWN).toLocaleString('en')} more`}</button>{/if}<a href={at('/jobs?start')}>{runsWords.runAJob}</a>
    </p>
  </div>
{/if}

<style>
  .runs {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    container-type: inline-size;
  }

  /* ── the day as lanes ─────────────────────────────────────────────────── */
  .day {
    display: grid;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    --who: 104px;
    /* A FINISHED RUN, HALFWAY BETWEEN THE TRACK AND THE THIRD INK: the rule's strong step was all but the track's own
       grey, so a run of a few minutes vanished. */
    --day-done: color-mix(in srgb, var(--ink-3) 45%, var(--tile-2));
  }

  .day-lanes {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .day-lane {
    display: grid;
    grid-template-columns: var(--who) minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-3);
  }

  .day-who {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .day-who :global(.agent-mark) {
    inline-size: 14px;
    block-size: 14px;
  }

  .day-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* HOW MANY RUNS THE LANE HOLDS, at the label's end in the third ink. */
  .day-n {
    margin-inline-start: auto;
    color: var(--ink-3);
  }

  /* A TRACK IN THE QUIET FILL, ITS BARS ON IT: a finished run in a mid grey, one at work in the ink. */
  .day-track {
    --least: 4px;
    position: relative;
    block-size: 12px;
    border-radius: var(--r-round);
    background: var(--tile-2);
  }

  .day-bar {
    position: absolute;
    inset-block: 0;
    /* NEVER PAST NOW: a mark held to its least width still ends inside the track. */
    inset-inline-start: min(var(--at), calc(100% - var(--least)));
    inline-size: var(--w);
    min-inline-size: var(--least);
    border-radius: var(--r-round);
    background: var(--day-done);
  }

  .day-bar[data-live] {
    background: var(--ink);
  }

  /* RUNS THAT OVERLAP SIT ON ROWS OF THEIR OWN: the track grows a 6px row each, 2px apart, so three runs at once read as
     three marks and not one bar. */
  .day-track[data-rows] {
    block-size: calc(var(--rows) * 8px - 2px);
    border-radius: 4px;
  }

  .day-track[data-rows] .day-bar {
    inset-block: calc(var(--row) * 8px) auto;
    block-size: 6px;
    --least: 6px;
  }

  /* NOW, AT THE TRACK'S END, as the board's red line: the one red on the chart, and it is the clock. */
  .day-now {
    position: absolute;
    inset-block: -4px;
    inset-inline-end: -1px;
    inline-size: 2px;
    background: var(--red);
  }

  .day-axis {
    position: relative;
    block-size: 18px;
    margin-inline-start: calc(var(--who) + var(--sp-3));
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: 18px;
  }

  .day-tick {
    position: absolute;
    inset-inline-start: var(--at);
    translate: -50% 0;
    white-space: nowrap;
  }

  .day-tick:first-child {
    translate: 0 0;
  }

  .day-tick-now {
    inset-inline-start: auto;
    inset-inline-end: 0;
    translate: 0 0;
    color: var(--red);
  }

  .day-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .day-key {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .day-swatch {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
    background: var(--day-done);
  }

  .day-swatch[data-live] {
    background: var(--ink);
  }

  .day-count {
    margin-inline-start: auto;
  }

  /* A HOUR TOO NEAR NOW IS LEFT OUT, so its label never runs into now's: always in the last eighth of the day, and on
     a narrow tile in the last third. */
  @container (width < 560px) {
    .day {
      --who: 96px;
    }

    .day-tick[data-near] {
      display: none;
    }
  }

  /* ── the lines ────────────────────────────────────────────────────────── */
  .runs-day {
    margin: var(--sp-3) 0 var(--sp-1);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  .runs-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .runs-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    padding-block: var(--sp-1);
    color: var(--ink-3);
  }

  /* WHAT RAN, AT THE LINE'S START: an agent's own mark or the kind's glyph, in one 16px box so the names start level. */
  .runs-mark {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--icon-s);
    color: var(--ink-2);
  }

  .runs-mark :global(.agent-mark) {
    inline-size: 14px;
    block-size: 14px;
  }

  .runs-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }

  .runs-name {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.runs-name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* A THUMB NEEDS 44px on the name's link: the box grows and the margin takes the growth back, so the row keeps its height. */
  @media (pointer: coarse) {
    a.runs-name {
      display: flex;
      align-items: center;
      min-block-size: 44px;
      margin-block: -10px;
    }

    .runs-note a,
    .runs-more {
      display: inline-flex;
      align-items: center;
      min-block-size: 44px;
    }
  }

  /* THE SENTENCE IS NEVER CUT: it wraps, and the name gives way. */
  .runs-said {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .runs-clock {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .runs-note {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .runs-foot {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-4);
  }

  .runs-more {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .runs-more:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>
