<!--
  Jobs: `/jobs`, every run of a job on this record, and "Run a job" (`loop/finish/agents.md` AGT-23, C13).

  A TABLE AT 640 UP AND CARDS BELOW IT (design-brief §6). A run is scanned, not read: its kind, where it stands, the
  machine that took it, when it started, its turns and how long it took. On a phone each run is a card whose whole
  face opens it, with the kind on line one and the rest as one meta line that wraps as whole items.

  LIVE RUNS ON TOP, WITH A PULSE. A run waiting for a machine or running on one is what a person came here to watch, so
  the live ones lead and the list asks again every `LIST_POLL_MS` while one is shown; a run that ends is seen to end
  without a reload, and the list stops asking once none is live. The pulse is the status dot, and it is still under
  reduced motion; the status word beside it carries the meaning either way.

  `?repo=<name>` IS A PROJECT'S "RUNS ON" LINK: the runs of kinds that work in that repository, with a way back to all.

  "RUN A JOB" OPENS A SHEET that reads the approved kinds only when opened (`readKinds` in `lib/record/jobs.ts`), since
  the kinds come from the decided proposals and nobody reading the list needs them. It picks a kind, takes its
  arguments, starts it and opens the run, where the transcript fills in as the machine works.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { TONES, since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import {
    LIST_POLL_MS,
    argsFor,
    duration,
    isLive,
    joined,
    ordered,
    readJobs,
    readKinds,
    runName,
    startJob,
    startedAt,
    statusOf,
    words,
    type Answer,
    type JobKind,
    type JobRow,
  } from '$lib/record/jobs.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';

  /* THE RECORD'S ADDRESS IS THE QUESTION, so moving to another record under the same route asks again rather than
     drawing the last record's runs under the new one's name. */
  const jobs = read(
    () => apiBase(page.url),
    () => readJobs(apiBase(page.url)),
    { empty: (v) => v.jobs.length === 0 },
  );

  /** The repository the address narrows to, from a project's "Runs on" link, or `null` for every run. */
  const repo = $derived(page.url.searchParams.get('repo')?.trim() || null);

  /* OLDER PAGES, read on a press and joined under the first. A new first page keeps them, since a run that started
     between the two reads only moves every row down by one and `joined` keeps each run once. */
  let older = $state.raw<JobRow[]>([]);
  let after = $state<string | null | undefined>(undefined);
  let reading = $state(false);
  const cursor = $derived(after === undefined ? (jobs.value?.cursor ?? null) : after);
  const rows = $derived(ordered(joined(jobs.value?.jobs ?? [], older), repo));
  const anyLive = $derived(rows.some((r) => isLive(r.status)));

  /* THIS BROWSER'S CLOCK. Every date in the list is the record's, read against now (DIRECTION 26). */
  let now = $state(Date.now());

  async function showOlder() {
    if (reading || cursor === null) return;
    reading = true;
    const mark = opened();
    const got = await readJobs(apiBase(page.url), cursor);
    closed(true, mark);
    reading = false;
    if (!got.ok) {
      toasts.push('refusal' in got ? got.refusal.fix : copy.readRefused, { intent: 'bad' });
      return;
    }
    older = joined(older, got.value.jobs);
    after = got.value.cursor;
  }

  /* ASK AGAIN WHILE A RUN IS LIVE, and only then: a list of finished runs has nothing left to change. */
  $effect(() => {
    if (!anyLive) return;
    const timer = setInterval(() => {
      now = Date.now();
      void jobs.reread();
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  });

  /* ── Run a job ── */

  let starting = $state(false);
  let kinds = $state.raw<Answer<JobKind[]> | null>(null);
  let chosen = $state<string | null>(null);
  let typed = $state<Record<string, string>>({});
  let busy = $state(false);
  let fix = $state<string | null>(null);

  const offered = $derived(kinds?.ok ? kinds.value : []);
  const kind = $derived(offered.find((k) => k.id === chosen) ?? null);

  async function openRun() {
    starting = true;
    fix = null;
    if (kinds?.ok) return;
    kinds = null;
    const got = await readKinds(apiBase(page.url), rows);
    kinds = got;
    if (got.ok && chosen === null && got.value.length === 1) chosen = got.value[0]?.id ?? null;
  }

  function pick(id: string) {
    chosen = id;
    typed = {};
    fix = null;
  }

  async function start() {
    if (busy || kind === null) return;
    busy = true;
    fix = null;
    const mark = opened();
    const got = await startJob(apiBase(page.url), kind.id, argsFor(kind, typed));
    closed(true, mark);
    busy = false;
    if (!got.ok) {
      fix = 'refusal' in got ? got.refusal.fix : copy.readRefused;
      return;
    }
    starting = false;
    toasts.push(words.startedToast(kind.title), { intent: 'good' });
    await goto(at(`/jobs/${encodeURIComponent(got.value.id)}`));
  }
</script>

<svelte:head><title>{titleOf(repo ? words.headingFor(repo) : words.heading)}</title></svelte:head>

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's. -->
<PageHead title={repo ? words.headingFor(repo) : words.heading} count={jobs.state === 'ready' ? rows.length : undefined}>
  {#snippet actions()}
    {#if !page.data.refused}<Button weight="primary" onclick={() => void openRun()}>{words.run}</Button>{/if}
  {/snippet}
</PageHead>

<div class="page">
  {#if page.data.refused}
    <!-- A REFUSED SHELL IS NOT A LIST TO SHOW. The record's sentence is the page, as it is on Home. -->
    <Empty kind="error" heading title={page.data.refused.fix} />
  {:else if jobs.state === 'waiting' || jobs.state === 'refused' || jobs.state === 'offline'}
    <ReadState state={jobs.state} refusal={jobs.refusal} onretry={jobs.reread} />
  {:else if jobs.state === 'empty'}
    <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} />
  {:else}
    {#if repo}
      <p class="context"><a class="back-all tap" href={at('/jobs')}>{words.allJobs}</a></p>
    {/if}
    {#if rows.length === 0}
      <Empty kind="no-results" compact title={words.noneFor(repo ?? '')} />
    {:else}
      <!-- AT 640 UP: one row per run, a hairline between rows and nothing round the table (design-brief §5). -->
      <table class="runs-table">
        <thead>
          <tr>
            <th scope="col">{words.kind}</th>
            <th scope="col">{words.status}</th>
            <th scope="col">{words.machine}</th>
            <th scope="col">{words.started}</th>
            <th scope="col" class="num-col">{words.turnsLabel}</th>
            <th scope="col" class="num-col">{words.took}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.id)}
            {@const said = statusOf(r.status, r.lost, r.cancel)}
            <tr data-live={isLive(r.status) ? '' : undefined}>
              <th scope="row" class="run-name"><a class="tap" href={at(`/jobs/${encodeURIComponent(r.id)}`)}>{runName(r)}</a></th>
              <td>
                <span class="status" data-intent={said.tone ?? undefined}>
                  {#if isLive(r.status)}<span class="pulse" aria-hidden="true"></span>{/if}
                  {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
                  {said.word}
                </span>
              </td>
              <td class="dim">{r.runner ?? words.noMachine}</td>
              <td class="dim">{since(startedAt(r), now)}</td>
              <td class="num num-col">{r.turns ?? ''}</td>
              <td class="num num-col">{r.ms === null ? '' : duration(r.ms)}</td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- BELOW 640: a card per run, the whole card the target, the kind on line one and the facts on line two. -->
      <ul class="runs-cards">
        {#each rows as r (r.id)}
          {@const said = statusOf(r.status, r.lost, r.cancel)}
          <li>
            <a class="card" href={at(`/jobs/${encodeURIComponent(r.id)}`)} data-live={isLive(r.status) ? '' : undefined}>
              <span class="card-title">{runName(r)}</span>
              <span class="card-meta">
                <span class="status" data-intent={said.tone ?? undefined}>
                  {#if isLive(r.status)}<span class="pulse" aria-hidden="true"></span>{/if}
                  {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
                  {said.word}
                </span>
                <span>{r.runner ?? words.noMachine}</span>
                <span>{since(startedAt(r), now)}</span>
                {#if r.turns !== null}<span>{words.turns(r.turns)}</span>{/if}
                {#if r.ms !== null}<span>{duration(r.ms)}</span>{/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
    {#if cursor !== null}
      <div class="more"><Button disabled={reading} onclick={() => void showOlder()}>{words.older}</Button></div>
    {/if}
  {/if}
</div>

<Sheet bind:open={starting} title={words.run}>
  {#if kinds === null}
    <Waiting rows={2} />
  {:else if !kinds.ok}
    <p class="sheet-note" role="status">{'refusal' in kinds ? kinds.refusal.fix : copy.readRefused}</p>
  {:else if offered.length === 0}
    <p class="sheet-note">{words.noKinds}</p>
  {:else}
    <div class="kinds" role="group" aria-label={words.pick}>
      {#each offered as k (k.id)}
        <button type="button" class="kind tap" aria-pressed={chosen === k.id} onclick={() => pick(k.id)}>
          <span class="kind-title">{k.title}</span>
          <span class="kind-meta">
            <span>{k.repo ? words.inRepo(k.repo) : words.inNoRepo}</span>
            {#if k.writes}<span class="kind-writes">{words.writesShort}</span>{/if}
          </span>
        </button>
      {/each}
    </div>
    {#if kind}
      {#each kind.args as a (a.id)}
        <div class="arg">
          <label class="arg-label" for={`arg-${a.id}`}>{a.label}</label>
          <div class="field">
            <input
              id={`arg-${a.id}`}
              class="field-input"
              type="text"
              autocomplete="off"
              maxlength={a.max}
              value={typed[a.id] ?? ''}
              oninput={(e) => (typed = { ...typed, [a.id]: e.currentTarget.value })}
            />
          </div>
        </div>
      {/each}
    {/if}
    {#if fix}<p class="sheet-fix" role="status">{fix}</p>{/if}
  {/if}
  {#snippet footer()}
    <Button weight="primary" disabled={busy || kind === null} onclick={() => void start()}>{kind ? words.start(kind.title) : words.startAny}</Button>
  {/snippet}
</Sheet>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .context {
    margin: 0;
    font-size: var(--t-sm);
  }

  .back-all {
    color: var(--link);
  }

  /* ── the table, 640 up ── */

  .runs-table {
    display: none;
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-ui);
  }

  .runs-table th,
  .runs-table td {
    padding-block: 0;
    padding-inline: 0 var(--sp-3);
    block-size: var(--table-row-h);
    text-align: start;
    border-block-end: 1px solid var(--line-soft);
    white-space: nowrap;
  }

  .runs-table thead th {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .runs-table .run-name {
    font-weight: 500;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .runs-table .run-name a {
    color: var(--ink);
  }

  .runs-table .num-col {
    text-align: end;
  }

  .dim {
    color: var(--dim);
  }

  @media (hover: hover) and (pointer: fine) {
    .runs-table tbody tr:hover {
      background: var(--hover-wash);
    }
  }

  /* ── the cards, below 640 ── */

  .runs-cards {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .runs-cards li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  .card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--sp-1);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
    color: var(--ink);
    text-decoration: none;
  }

  .card-title {
    font-size: var(--t-md);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  @media (min-width: 640px) {
    .runs-table {
      display: table;
    }

    .runs-cards {
      display: none;
    }
  }

  /* ── where a run stands ── */

  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
  }

  .status[data-intent='info'] .glyph {
    color: var(--info);
  }

  .status[data-intent='warn'] .glyph {
    color: var(--warn);
  }

  .status[data-intent='bad'] .glyph {
    color: var(--danger);
  }

  /* THE PULSE IS THE LIVE RUN'S DOT, and the word beside it says what it means (design-brief §10). */
  .pulse {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-pill);
    background: var(--info);
    animation: jobs-pulse 1.6s var(--ease-out) infinite;
  }

  @keyframes jobs-pulse {
    0%,
    100% {
      opacity: 1;
    }

    50% {
      opacity: 0.35;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }

  .more {
    display: flex;
  }

  /* ── the sheet ── */

  .sheet-note,
  .sheet-fix {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
    max-inline-size: var(--measure);
  }

  .sheet-fix {
    color: var(--danger);
  }

  .kinds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-4);
  }

  .kind {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--edge);
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .kind[aria-pressed='true'] {
    border-color: var(--on);
    background: var(--selected);
  }

  .kind-title {
    font-size: var(--t-base);
    font-weight: 500;
  }

  .kind-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* IN INK AND NOT RED: a run that changes files is a fact to choose by, not a failure or a loss, and red is kept for
     those (design 6.8.2). */
  .kind-writes {
    color: var(--ink);
    font-weight: 500;
  }

  .arg {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
  }

  .arg-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* SIXTEEN PIXELS IN EVERY FIELD (design 6.6): under that a phone zooms the page on focus and it stays zoomed. */
  .arg .field-input {
    font-size: var(--t-md);
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }
</style>
