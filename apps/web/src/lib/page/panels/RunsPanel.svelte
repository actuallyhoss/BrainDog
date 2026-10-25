<!--
  Recent runs on the Agents page (`panel: run-list`): the last runs as compact rows, newest first, agent runs, jobs,
  automation runs, scheduled actions and scripts in one list, then the door to every run.

  ONE ROW A RUN (the Agents page of 23 October): what ran wears its mark (an agent's own, the rest their kind's glyph),
  then what it did, its project as a quiet chip, how it ended and when. Eight are drawn and the rest are one press away;
  "All 1,204 runs" opens the record's list of runs. A run at work now is under At work and not here again, so a run
  drops into this list once it stops working.

  THE LINES ARE `runLines`' (`routes/automations/hub.ts`) plus the agent runs and jobs (`record/all-runs.ts`). An agent
  run is titled by what it did, never "Claude run" where it said where it worked. A row opens the thing that ran.

  NO DAY AS LANES HERE ANY MORE: the chart drew forty bars on a busy day over a list that said the same runs, and the page
  is calmer as rows. NO UNDO HERE: a run's way back is on its own page, where what it changed is read before anything goes
  back.

  A HOST PANEL loaded by `import()` from `BlockSlot.svelte` only. With nothing to list the tile is left out whole.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { readAllRuns, runsWords } from '$lib/record/all-runs.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { control, type LiveRun, type Project } from '$lib/record/instruct.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import AgentMark from '$lib/ui/AgentMark.svelte';
  import { agentKindOf } from '$lib/ui/face.ts';
  import { kindIcon, type RunLine } from '../../../routes/automations/hub.ts';
  import { listen } from '../listen.svelte.ts';

  /** How many rows are drawn before the rest are one press away. */
  const SHOWN = 8;

  const words = {
    more: (n: number) => `Show ${n.toLocaleString('en')} more`,
    all: (n: number | null) => (n === null ? 'All runs' : `All ${n.toLocaleString('en')} runs`),
  } as const;

  let lines = $state.raw<RunLine[]>([]);
  let total = $state<number | null>(null);
  let short = $state(false);
  let drew = $state<boolean | null>(null);
  let all = $state(false);
  let projects = $state.raw<Map<string, Project>>(new Map());

  async function load(): Promise<void> {
    const out = await readAllRuns(apiBase(), recordNow());
    if (out.from === 'refused') {
      lines = [];
      drew = false;
      return;
    }
    /* A RUN AT WORK IS SAID UNDER At work, so it is not a second time here. */
    lines = out.lines.filter((l) => l.live !== true);
    total = out.agentRuns;
    short = out.short;
    drew = lines.length > 0;
    const keys = lines.map((l) => l.project).filter((p): p is string => typeof p === 'string');
    if (keys.some((k) => !projects.has(k))) projects = await control(apiBase()).projects(keys.map((project) => ({ project }) as LiveRun));
  }

  onMount(() => void load());
  listen(load, () => false);

  const shown = $derived(all ? lines : lines.slice(0, SHOWN));

  /** A sentence's first clause, without its full stop: "Refused 2h ago" of "Refused 2h ago. The script did not finish." */
  const firstOf = (said: string): string => (said.split(/(?<=\.)\s/u)[0] ?? said).replace(/\.$/u, '');
</script>

{#if drew !== true}
  <!-- NOT READ YET, OR NOTHING HAS RUN: the tile is left out whole (`BlockSlot.svelte`'s rule for a panel that drew
       nothing), and says it is still reading while it is. -->
  <span data-seen-none hidden aria-busy={drew === null ? 'true' : undefined}></span>
{:else}
  <div class="runs">
    {#if short}<p class="runs-note">{runsWords.short}</p>{/if}
    <ul class="runs-list">
      {#each shown as line (line.key)}
        {@const project = line.project ? (projects.get(line.project)?.name ?? null) : null}
        <li class="runs-line" data-bad={line.bad ? '' : undefined}>
          <span class="runs-mark">{#if line.agent}<AgentMark kind={agentKindOf(line.agent)} size="s" />{:else}<Icon name={kindIcon(line.kind)} size="s" />{/if}</span>
          {#if line.path}<a class="runs-name" href={at(line.path)} title={line.name}>{line.name}</a>{:else}<span class="runs-name" title={line.name}>{line.name}</span>{/if}
          <span class="runs-end">
            {#if project}<span class="runs-proj">{project}</span>{/if}
            {#if line.outcome}
              <span class="runs-said">{line.outcome}</span>
              <span class="runs-when num">{since(line.at, recordNow())}</span>
            {:else}
              <!-- HOW IT ENDED AND WHEN, its first sentence; what the run said after it is on the run's own screen and in the hover. -->
              <span class="runs-said" title={line.said}>{firstOf(line.said)}</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
    <p class="runs-foot">
      {#if lines.length > SHOWN && !all}<button type="button" class="runs-more" onclick={() => (all = true)}>{words.more(lines.length - SHOWN)}</button>{/if}
      <a class="runs-door" href={at('/r/session')}>{words.all(total)}<Icon name="arrow" size="s" /></a>
      <a class="runs-door" href={at('/jobs?start')}>{runsWords.runAJob}</a>
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

  .runs-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE ROW: the mark, what ran, and at the end its project, how it ended and when, a hairline between rows. */
  .runs-line {
    display: grid;
    grid-template-columns: var(--icon-s) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 40px;
    padding-block: var(--sp-1);
    border-block-start: 1px solid var(--rule);
  }

  .runs-line:first-child {
    border-block-start: 0;
  }

  /* WHAT RAN, AT THE ROW'S START: an agent's own mark or the kind's glyph, in one 16px box so the names start level. */
  .runs-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--icon-s);
    color: var(--ink-2);
  }

  .runs-mark :global(.agent-mark) {
    inline-size: 14px;
    block-size: 14px;
  }

  .runs-name {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a.runs-name:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  a.runs-name:focus-visible,
  .runs-door:focus-visible,
  .runs-more:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .runs-line[data-bad] .runs-said {
    color: var(--red);
  }

  .runs-end {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    white-space: nowrap;
  }

  /* THE PROJECT AS A QUIET CHIP, as At work and Up next say one. */
  .runs-proj {
    max-inline-size: 14em;
    overflow: hidden;
    padding: 1px var(--sp-2);
    border-radius: var(--r-round);
    background: var(--tile-2);
    color: var(--ink-2);
    text-overflow: ellipsis;
  }

  .runs-said {
    color: var(--ink-2);
  }

  .runs-when {
    min-inline-size: 5.5em;
    text-align: end;
  }

  .runs-note {
    margin: 0 0 var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .runs-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .runs-more,
  .runs-door {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--btn-h-sm, var(--ctl-h-sm));
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .runs-more:hover,
    .runs-door:hover {
      color: var(--ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  /* ON A NARROW TILE what ran keeps the row's first line and the rest goes under it, so neither is cut to a word. */
  @container (width < 560px) {
    .runs-line {
      grid-template-columns: var(--icon-s) minmax(0, 1fr);
      gap: 2px var(--sp-3);
      padding-block: var(--sp-2);
    }

    .runs-name {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
    }

    .runs-end {
      grid-column: 2;
      flex-wrap: wrap;
      gap: var(--sp-1) var(--sp-2);
      white-space: normal;
    }

    .runs-when {
      min-inline-size: 0;
      text-align: start;
    }
  }

  /* A THUMB NEEDS 44px on every press. */
  @media (pointer: coarse) {
    /* THE BOX GROWS TO 44 AND THE MARGIN TAKES THE GROWTH BACK, so the row keeps its height. */
    a.runs-name {
      display: flex;
      align-items: center;
      min-block-size: 44px;
      margin-block: -11px;
    }

    .runs-more,
    .runs-door {
      min-block-size: 44px;
    }
  }

  /* THE THREE FOOT ACTIONS ARE SEPARATE BUTTONS on a phone: a fill each, 40px tall, the list door first. */
  @container (width < 560px) {
    .runs-foot {
      gap: var(--sp-2);
      margin-block-start: var(--sp-3);
    }

    .runs-more,
    .runs-door {
      min-block-size: 40px;
      padding-inline: var(--sp-3);
      border-radius: var(--r-ctl);
      background: var(--tile-2);
      color: var(--ink);
    }
  }
</style>
