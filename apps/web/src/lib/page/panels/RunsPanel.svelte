<!--
  Recent runs on the Agents page (`panel: run-list`): the last runs as compact rows, newest first, agents' runs and jobs
  in one list, then the door to every run. BrainDog's own rules, scripts and scheduled actions are Automations', said
  here as one line of how many times the rules ran this month (audit 6g, AG13).

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
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import { agentKindOf } from '$lib/ui/face.ts';
  import { kindIcon, type RunLine } from '../../../routes/automations/hub.ts';
  import { listen } from '../listen.svelte.ts';

  /** How many rows are drawn before the rest are one press away. */
  const SHOWN = 8;

  const words = {
    more: (n: number) => `Show ${n.toLocaleString('en')} more`,
    /* THE DOOR OPENS THE AGENT RUNS ONLY, so it says so: the list above also holds rules and scripts. NO COUNT ON IT
       (the recheck of 30 October, 26): "All 5 agent runs" stood under the sidebar's "Agent runs 3", which counts the
       ones still open, so the one number beside the list is the sidebar's. */
    all: 'All agent runs',
    times: (n: number) => `${n.toLocaleString('en')}×`,
    /* THE RECORD'S OWN RULES, ONE LINE (audit 6g, AG13): they are Automations' to list. */
    rules: (n: number) => `BrainDog's rules ran ${n === 1 ? 'once' : `${n.toLocaleString('en')} times`} this month`,
  } as const;

  /* AGENTS' RUNS AND JOBS ONLY (audit 6g, AG13): the list opened on five of BrainDog's own rules and scripts, "Link the
     parts of a new plan 2× Ran", with the one agent run fifth. Rules, scripts and scheduled actions are Automations'. */
  const OWN: ReadonlySet<RunLine['kind']> = new Set(['agent', 'job']);

  let lines = $state.raw<RunLine[]>([]);
  let short = $state(false);
  let drew = $state<boolean | null>(null);
  let all = $state(false);
  let projects = $state.raw<Map<string, Project>>(new Map());
  let rulesMonth = $state(0);

  async function load(): Promise<void> {
    const out = await readAllRuns(apiBase(), recordNow());
    if (out.from === 'refused') {
      lines = [];
      drew = false;
      return;
    }
    /* A RUN AT WORK IS SAID UNDER At work, so it is not a second time here. */
    lines = out.lines.filter((l) => l.live !== true && OWN.has(l.kind));
    rulesMonth = out.rulesMonth;
    short = out.short;
    drew = lines.length > 0 || rulesMonth > 0;
    const keys = lines.map((l) => l.project).filter((p): p is string => typeof p === 'string');
    if (keys.some((k) => !projects.has(k))) projects = await control(apiBase()).projects(keys.map((project) => ({ project }) as LiveRun));
  }

  onMount(() => void load());
  listen(load, () => false);

  /* THE SAME RUN TITLE IN A ROW IS ONE ROW SAYING HOW MANY TIMES, with the newest one's time. */
  const folded = $derived(
    lines.reduce<{ line: RunLine; n: number }[]>((out, line) => {
      const same = out.find((o) => o.line.name === line.name && o.line.project === line.project);
      if (same) same.n += 1;
      else out.push({ line, n: 1 });
      return out;
    }, []),
  );
  const shown = $derived(all ? folded : folded.slice(0, SHOWN));

  /** How a line ended, from its sentence where it carries no word of its own: "Refused" of "Refused 2h ago." */
  const firstWord = (said: string): string => said.split(/\s/u)[0]?.replace(/[.,]$/u, '') ?? said;

  /* A RUN'S VERBS AT THE POINTER: a right-click or a held thumb on its line, or `⇧F10` (`ownMenu`). */
  let menuLine = $state<RunLine | null>(null);
  let point = $state<{ x: number; y: number; height: number } | null>(null);
</script>

<ItemMenu label={menuLine?.name ?? ''} bind:at={point} href={menuLine?.path} />

{#if drew !== true}
  <!-- NOT READ YET, OR NOTHING HAS RUN: the tile is left out whole (`BlockSlot.svelte`'s rule for a panel that drew
       nothing), and says it is still reading while it is. -->
  <span data-seen-none hidden aria-busy={drew === null ? 'true' : undefined}></span>
{:else}
  <div class="runs">
    {#if short}<p class="runs-note">{runsWords.short}</p>{/if}
    {#if shown.length > 0}<ul class="runs-list">
      {#each shown as { line, n } (line.key)}
        {@const project = line.project ? (projects.get(line.project)?.name ?? null) : null}
        <li class="runs-line" data-bad={line.bad ? '' : undefined} {@attach line.path && ownMenu((p) => ((menuLine = line), (point = p)))}>
          <span class="runs-mark">{#if line.agent}<AgentMark kind={agentKindOf(line.agent)} size="s" />{:else}<Icon name={kindIcon(line.kind)} size="s" />{/if}</span>
          {#if line.path}<a class="runs-name" href={at(line.path)} title={line.name}>{line.name}</a>{:else}<span class="runs-name" title={line.name}>{line.name}</span>{/if}
          <span class="runs-end">
            <!-- ONE FORMAT FOR EVERY ROW, plain text and no chips: its project, how many times where it ran more
                 than once, then how it ended and when. -->
            {#if project}<span class="runs-proj">{project}</span>{/if}
            {#if (line.times ?? 1) + n - 1 > 1}<span class="runs-times num">{words.times((line.times ?? 1) + n - 1)}</span>{/if}
            <span class="runs-said" title={line.said}>{line.outcome ?? firstWord(line.said)}</span>
            <span class="runs-when num">{since(line.at, recordNow())}</span>
          </span>
        </li>
      {/each}
    </ul>{/if}
    <p class="runs-foot">
      {#if folded.length > SHOWN && !all}<button type="button" class="runs-more" onclick={() => (all = true)}>{words.more(folded.length - SHOWN)}</button>{/if}
      <a class="runs-door" href={at('/r/session')}>{words.all}<Icon name="arrow" size="s" /></a>
      <a class="runs-door" href={at('/jobs?start')}>{runsWords.runAJob}</a>
      {#if rulesMonth > 0}<a class="runs-door" href={at('/automations')}>{words.rules(rulesMonth)}<Icon name="arrow" size="s" /></a>{/if}
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

  /* THE PROJECT AS QUIET TEXT, no chip. */
  .runs-proj {
    max-inline-size: 14em;
    overflow: hidden;
    color: var(--ink-3);
    text-overflow: ellipsis;
  }

  .runs-times {
    color: var(--ink-3);
  }

  .runs-said {
    color: var(--ink-2);
  }

  .runs-when {
    min-inline-size: 5.5em;
    text-align: end;
  }

  /* THE END COLUMNS LINE UP DOWN THE TILE ON A DESK (pages pass, 2 Nov): each row's end was one run of words, so
     "Portage Last heard 2h ago" and "Marlow & Co Finished 1d ago" started their how-it-ended at different places and
     the eye could not run down it. How it ended now takes a column at least as wide as its longest usual word, and
     when keeps its own; a longer note (an automation waiting on a computer) still takes what it needs. */
  @container (width >= 560px) {
    .runs-said {
      min-inline-size: 6.5em;
    }
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
    @container (width >= 560px) {
      a.runs-name {
        display: flex;
        align-items: center;
        min-block-size: 44px;
        margin-block: -11px;
      }
    }

    /* ON A PHONE THE NAME WRAPS TO THREE LINES, so the box grows by padding rather than by centring one line. */
    @container (width < 560px) {
      a.runs-name {
        min-block-size: 44px;
        padding-block: 11px;
        margin-block: -11px;
        box-sizing: border-box;
      }
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

  /* AFTER THE CONTAINER RULE ABOVE, so the 44px a thumb needs wins over its 40px on source order. */
  @media (pointer: coarse) {
    .runs-more,
    .runs-door {
      min-block-size: 44px;
    }
  }
</style>
