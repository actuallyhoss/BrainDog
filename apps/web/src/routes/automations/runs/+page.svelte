<!--
  Runs: `/automations/runs`, every run of every kind that runs by itself, newest first.

  THREE READS, ONE LIST. Automations, scheduled actions and scripts each keep their runs their own way: an automation's
  own read carries its newest ten, a scheduled action's ledger only its last, and a script's from recent history. They
  are read side by side and merged in `hub.ts` (`runLines`), each row naming its kind after its name, so a failed
  script and a failed automation read alike and sit where their time puts them.

  A SOURCE THAT CANNOT BE READ IS SAID ONCE AND NOT FATAL. A record without the scripts read still has automations
  worth listing, so only when all three refuse is the screen a refusal; otherwise one line above the list says it may
  be short, rather than a quiet list reading as a quiet record.

  A TILE, THEN THE RUNS ON THE GROUND BY DAY. "Recent runs" is a heat grid of runs a day over the
  last fourteen, one row for each of the six things that ran most, with the line under it saying what ran most and
  what failed; its meta says "Latest runs", because each thing's newest runs are what is read, not every run there was.

  NO PAGING. Each thing's newest runs are what it keeps to hand, and the line under the heading says so; a row opens
  the thing that ran, where all of its runs are.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { HeatGrid } from '$lib/viz/index.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { words } from '$lib/flow/flow.ts';
  import { openAutomations, type AutomationRow, type RunRow } from '$lib/flow/source.ts';
  import { openActions, type ActionRow } from '$lib/record/actions.ts';
  import { readScripts, type Script } from '$lib/record/scripts.ts';
  import HubTabs from '../HubTabs.svelte';
  import HubRows from '../HubRows.svelte';
  import { clockOf, heatReading, hubWords as w, kindIcon, runDays, runHeat, runLines, type HubRow, type RunLine } from '../hub.ts';

  /* HOW MANY AUTOMATIONS HAVE THEIR OWN RUNS READ, newest last run first. Past these a rule is its last run alone, so a
     record with a hundred rules costs a bounded number of reads. */
  const DEEP = 20;
  /* HOW MANY RUNS EACH OF THOSE ASKS FOR. */
  const EACH = 10;

  let from = $state<'reading' | 'ready' | 'refused'>('reading');
  let lines = $state<RunLine[]>([]);
  let short = $state(false);
  let fix = $state('');

  const io = (url: string, init?: RequestInit) => fetch(url, init);

  async function load() {
    const at = opened();
    const base = apiBase();
    const [autos, actions, scripts] = await Promise.all([openAutomations(io, base), openActions(io, base), readScripts(base)]);

    /* A READ THE HOST DOES NOT HAVE IS NOT A FAILURE, only a kind this record does not list yet. */
    const autoRows: AutomationRow[] = autos.first.ok ? autos.first.value : [];
    const actionRows: ActionRow[] = actions.first.ok ? actions.first.value : [];
    const scriptRows: Script[] = scripts.ok ? scripts.value : [];
    const scriptsAbsent = !scripts.ok && 'refusal' in scripts && scripts.refusal.code === 'ROUTE_UNKNOWN';
    const failed = [
      autos.first.ok || autos.absent ? null : autos.first.refusal.fix,
      actions.first.ok || actions.absent ? null : actions.first.refusal.fix,
      scripts.ok || scriptsAbsent ? null : 'refusal' in scripts ? scripts.refusal.fix : '',
    ].filter((f): f is string => f !== null);

    const deep = autoRows
      .filter((a) => a.last !== null)
      .sort((a, b) => Date.parse(b.last!.at) - Date.parse(a.last!.at))
      .slice(0, DEEP);
    const runs = new Map<string, readonly RunRow[]>();
    const each = await Promise.all(deep.map((a) => autos.source.automation(a.id, { limit: EACH })));
    each.forEach((got, i) => {
      const rule = deep[i];
      if (rule && got.ok) runs.set(rule.id, got.value.runs);
    });

    closed(failed.length < 3, at);
    if (failed.length === 3) {
      fix = failed[0] ?? '';
      from = 'refused';
      return;
    }
    lines = runLines(autoRows, runs, actionRows, scriptRows, Date.now());
    short = failed.length > 0;
    from = 'ready';
  }

  $effect(() => {
    untrack(() => void load());
  });
  $effect(() => {
    if (from === 'ready' && lines.length > 0) drew('ready');
  });

  const now = Date.now();

  const rowOf = (l: RunLine): HubRow => ({
    key: l.key,
    name: l.name,
    what: w.kind[l.kind],
    said: l.said,
    dot: l.bad ? 'bad' : null,
    path: l.path,
    icon: kindIcon(l.kind),
    aside: clockOf(l.at),
    clock: true,
  });

  const days = $derived(runDays(lines, now));
  const heat = $derived(runHeat(lines, now));
</script>

<svelte:head><title>{titleOf(w.tab.runs)}</title></svelte:head>

<PageHead icon="refresh" title={words.heading} count={from === 'ready' ? lines.length : undefined}>
  {#snippet actions()}<HubTabs here="runs" />{/snippet}
</PageHead>
<div class="page">
  {#if from === 'refused'}
    <Empty kind="error" heading title={fix} />
  {:else if from === 'ready' && lines.length === 0}
    <Empty kind="no-data-yet" title={w.runsNone} body={w.runsWhy} agentPrompt={w.runsPrompt} />
  {:else if from === 'ready'}
    {#if heat}
      <Tile icon="history" title={w.recentRuns} meta={w.latestRuns}>
        <HeatGrid rows={heat.rows} cols={heat.cols} values={heat.values} subject={w.heatSubject(heat.days.length)} />
        <p class="reading">{heatReading(lines, heat)}</p>
      </Tile>
    {/if}
    <p class="note">{short ? w.runsSomeMissing : w.runsReach}</p>
    {#each days as day (day.key)}
      <Section title={day.title} count={day.lines.length}>
        <HubRows rows={day.lines.map(rowOf)} />
      </Section>
    {/each}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* THE ONE LINE UNDER THE CHART that says what it means, at body size in ink. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* WHAT THE LIST REACHES, said once over it in the quiet ink, and a step closer to the list than to the tile. */
  .note {
    margin: 0 0 calc(var(--sp-2) - var(--sp-5));
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
