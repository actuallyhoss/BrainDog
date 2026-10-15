<!--
  The jobs for one project, under a section that says `panel: job` on the project's page (PGS-C16).

  THE LAST THREE RUNS THAT NAME THE PROJECT, each by its title with where it stands in words and Open, which goes to the
  run's own screen; a running one says its newest line under it. Then one line to type what to do, the kind of job when
  the record offers more than one, and Start (`job-panel.ts`).

  START IS HIS PRESS AND NOTHING ELSE. It names the project, so the run is this page's and Jobs' at once. While no
  machine is listening the panel says the line Jobs says and draws no Start; a refusal is said in the record's words.

  A QUIET LIST, NOT A TILE: the section above it is the tile and says the heading. Asked again every five seconds while
  a run it shows is live, the machines every twenty, and nothing while the page is hidden.

  A HOST PANEL loaded by `import()` from `panels/index.ts` only, so neither this nor its styles reach the entry chunk.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { TONES } from 'braindog-render';
  import { createClient } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { HEARD_POLL_MS, LIST_POLL_MS, anyListening, joined, readEvents, readJobs, transcriptOf, type JobEvent, type JobKind, type JobRow } from '$lib/record/jobs.ts';
  import { readHeldKinds } from '$lib/record/page-jobs.ts';
  import { enrolledOf } from '../../../routes/jobs/charts.ts';
  import Button from '$lib/ui/Button.svelte';
  import { jobPanel, lineKinds, newestLine, panelWords, ready, startForProject, SHOWN, type ForProject } from './job-panel.ts';

  let { project }: { project: ForProject } = $props();

  /** How many pages of runs one read walks to find the project's last three. Past them the panel shows what it found. */
  const PAGES = 4;

  let rows = $state.raw<JobRow[] | null>(null);
  let kinds = $state.raw<JobKind[]>([]);
  /* A REFUSAL TO READ THE KINDS (anybody who may not start a job) is said in Start's place, in the record's words. */
  let kindsFix = $state<string | null>(null);
  let listening = $state<boolean | null>(null);
  let events = $state.raw<Record<string, JobEvent[]>>({});
  let chosen = $state<string | null>(null);
  let typed = $state('');
  let busy = $state(false);
  let fix = $state<string | null>(null);
  let said = $state<string | null>(null);

  const model = $derived(rows === null ? null : jobPanel(rows, kinds, listening, project));
  const kind = $derived(model?.kinds.find((k) => k.id === chosen) ?? model?.kinds[0] ?? null);
  const arg = $derived(kind?.args[0] ?? null);
  const live = $derived(model?.jobs.some((j) => j.live) ?? false);
  const lines = $derived(Object.fromEntries(Object.entries(events).map(([id, got]) => [id, newestLine(transcriptOf(got))])));

  /* THE PROJECT'S RUNS, a few pages deep: the record answers every run newest first, and a busy record's last fifty may
     name none of them. An answer for a project the page has left is dropped. */
  async function readRuns(about: string): Promise<void> {
    const base = apiBase();
    let all: JobRow[] = [];
    let cursor: string | null = null;
    for (let n = 0; n < PAGES; n += 1) {
      const got = await readJobs(base, cursor);
      if (!got.ok) break;
      all = joined(all, got.value.jobs);
      cursor = got.value.cursor;
      if (cursor === null || all.filter((r) => r.about === about).length >= SHOWN) break;
    }
    if (about === project.spoken) rows = all;
  }

  /* A LIVE RUN'S NEWEST LINES, after the last one held, so each ask carries only what is new. */
  async function readLines(): Promise<void> {
    const base = apiBase();
    for (const job of model?.jobs ?? []) {
      if (!job.live) continue;
      const held = events[job.id] ?? [];
      const got = await readEvents(base, job.id, held.at(-1)?.seq ?? 0);
      if (got.ok && got.value.events.length > 0) events = { ...events, [job.id]: [...held, ...got.value.events] };
    }
  }

  async function readMachines(): Promise<void> {
    try {
      const out = await createClient({ base: apiBase() }).listDevices();
      listening = out.ok ? anyListening(enrolledOf(out.value), Date.now()) : null;
    } catch {
      listening = null;
    }
  }

  async function load(about: string): Promise<void> {
    await Promise.all([readRuns(about), readMachines()]);
    const got = await readHeldKinds(apiBase(), rows ?? []);
    if (about !== project.spoken) return;
    kinds = got.ok ? got.value : [];
    kindsFix = got.ok ? null : 'refusal' in got ? got.refusal.fix : panelWords.conflict;
    /* THE FIRST KIND IS CHOSEN, so the picker never opens on nothing. */
    if (chosen === null) chosen = lineKinds(kinds)[0]?.id ?? null;
    await readLines();
  }

  $effect(() => {
    const about = project.spoken;
    untrack(() => {
      rows = null;
      events = {};
      fix = null;
      said = null;
      void load(about);
    });
  });

  /* ASKED AGAIN WHILE THE PAGE IS IN VIEW: the runs and their lines while one is live, the machines always. */
  $effect(() => {
    const about = project.spoken;
    const often = live;
    let timers: ReturnType<typeof setInterval>[] = [];
    const watch = () => {
      for (const t of timers) clearInterval(t);
      timers = [];
      if (document.visibilityState === 'hidden') return;
      timers.push(setInterval(() => void readMachines(), HEARD_POLL_MS));
      if (often) timers.push(setInterval(() => void readRuns(about).then(readLines), LIST_POLL_MS));
    };
    watch();
    document.addEventListener('visibilitychange', watch);
    return () => {
      for (const t of timers) clearInterval(t);
      document.removeEventListener('visibilitychange', watch);
    };
  });

  async function start(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (busy || !model?.canStart || !ready(kind, typed) || kind === null) return;
    busy = true;
    fix = null;
    said = null;
    const got = await startForProject(createClient({ base: apiBase() }), kind, typed, project);
    busy = false;
    if (!got.ok) {
      fix = got.fix;
      return;
    }
    said = panelWords.started(kind.title);
    typed = '';
    await readRuns(project.spoken);
  }
</script>

{#if model}
  {@const line = kindsFix ?? model.line}
  <div class="job">
    {#if model.jobs.length > 0}
      <ul class="job-list" aria-label="Jobs for {project.title}">
        {#each model.jobs as job (job.id)}
          {@const newest = job.live ? lines[job.id] : null}
          <li class="job-run">
            <div class="job-head">
              <span class="job-name">{job.title}</span>
              <span class="job-state" data-intent={job.tone}>
                {#if job.tone}<span class="glyph" role="img" aria-label={TONES[job.tone].label}>{TONES[job.tone].glyph}</span>{/if}{job.state}
              </span>
              <span class="job-open"><Button weight="bare" size="sm" href={`/jobs/${encodeURIComponent(job.id)}`} aria-label="{panelWords.open} {job.title}">{panelWords.open}</Button></span>
            </div>
            {#if newest}<p class="job-line">{newest}</p>{/if}
          </li>
        {/each}
      </ul>
    {:else if model.none}
      <p class="job-quiet">{model.none}</p>
    {/if}

    {#if model.canStart && kindsFix === null}
      <form class="job-start" onsubmit={(e) => void start(e)}>
        {#if model.kinds.length > 1}
          <label class="field job-which">
            <select class="field-input" aria-label={panelWords.which} bind:value={chosen}>
              {#each model.kinds as k (k.id)}<option value={k.id}>{k.title}</option>{/each}
            </select>
          </label>
        {/if}
        {#if arg}
          <label class="field job-what">
            <input class="field-input" type="text" autocomplete="off" aria-label={arg.label} placeholder={panelWords.whatHint} maxlength={arg.max} bind:value={typed} />
          </label>
        {/if}
        <Button weight="primary" type="submit" disabled={busy || !ready(kind, typed)}>{panelWords.start}</Button>
      </form>
    {:else if line}
      <p class="job-quiet" role="status">{line}</p>
    {/if}
    {#if fix}<p class="job-fix" role="status">{fix}</p>{/if}
    {#if said}<p class="job-quiet" role="status">{said}</p>{/if}
  </div>
{/if}

<style>
  .job {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .job-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* NO BOX AND NO RULE: the space between two runs is what separates them. */
  .job-run {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding-block: var(--sp-2);
  }

  .job-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
  }

  .job-name {
    min-width: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .job-state {
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  /* FAILED OR REFUSED: the deeper red, and the glyph beside the word, never the colour alone. A run that needs a look
     carries its glyph in the board's text colour. */
  .job-state[data-intent='bad'] {
    color: var(--danger-text);
  }

  .glyph {
    margin-inline-end: var(--sp-1);
  }

  .job-open {
    margin-inline-start: auto;
  }

  .job-line {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  .job-start {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE LINE TAKES WHAT IS LEFT, and on a phone the kind, the line and Start each take a line of their own. */
  .job-what {
    flex: 1 1 16rem;
    min-width: 0;
  }

  .job-which {
    flex: 0 1 12rem;
    min-width: 0;
  }

  .job-quiet,
  .job-fix {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .job-fix {
    color: var(--ink);
  }
</style>
