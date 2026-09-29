<!--
  Jobs: `/jobs`, every run of a job on this record, and "Run a job".

  THE RUNS ARE A LIST ON THE GROUND, GROUPED BY DAY. The live ones lead under their own heading, then each
  day newest first. A run is one 56px row that is wholly its own link: a well whose glyph says what it is doing or how it
  ended, the kind's name, then its outcome as a dot and a word with the machine, the start and the turns, and at the
  right how long it took, or how long it has been going. One row list at every width; a phone reads the same rows at 60.

  TWO TILES SAY WHAT THE ROWS MEAN. "Who ran what" draws each machine's runs as lanes over the last day, or
  the last week when the day was quiet, with the now line through them; "How they went" splits the runs read by outcome.
  Both count only the runs this screen has read, and say "Latest 50 runs" when older ones exist that they have not seen.
  A tile with nothing to draw is not drawn.

  LIVE RUNS ARE ASKED ABOUT AGAIN. The list asks again every `LIST_POLL_MS` while one is shown, so a run that ends is
  seen to end without a reload, and it stops asking once none is live. The live dot is the one hue that means alive, and
  it holds still: nothing on the product pulses.

  `?repo=<name>` IS A PROJECT'S "RUNS ON" LINK: the runs of kinds that work in that repository, with a way back to all.

  "RUN A JOB" OPENS A SHEET that reads the approved kinds only when opened (`readKinds` in `lib/record/jobs.ts`), since
  the kinds come from the decided proposals and nobody reading the list needs them. It picks a kind, takes its
  arguments, starts it and opens the run, where the transcript fills in as the machine works.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { TONES } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import {
    LIST_POLL_MS,
    argsFor,
    isLive,
    joined,
    ordered,
    readJobs,
    readKinds,
    runName,
    startJob,
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
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import Swimlanes from '$lib/viz/Swimlanes.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import {
    detailOf,
    groupsOf,
    iconOf,
    lanesOf,
    lanesSaid,
    lanesSummary,
    laneTime,
    outcomeOf,
    sentenceOf,
    splitOf,
    splitSaid,
    tookOf,
    words as said,
  } from './charts.ts';

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
  const loaded = $derived(joined(jobs.value?.jobs ?? [], older));
  const rows = $derived(ordered(loaded, repo));
  const anyLive = $derived(rows.some((r) => isLive(r.status)));

  /* THIS BROWSER'S CLOCK. Every date in the list is the record's, read against now. */
  let now = $state(Date.now());

  /* WHAT THE ROWS MEAN, each from the runs read and nothing else. */
  const groups = $derived(groupsOf(rows, now));
  const told = $derived(jobs.state === 'ready' ? sentenceOf(rows, now) : null);
  /* THE OLDEST RUN READ, only while older ones exist: a chart reaching back past it has not seen what came before. */
  const oldest = $derived.by(() => {
    if (cursor === null) return null;
    const times = loaded.map((r) => Date.parse(r.created_at)).filter(Number.isFinite);
    return times.length ? Math.min(...times) : null;
  });
  const lanes = $derived(lanesOf(rows, now, oldest));
  const split = $derived(splitOf(rows));

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

  /* EACH ANSWER IS READ AGAINST THE CLOCK IT CAME AT, so "today" and the lanes' last day move on with the record. */
  $effect(() => {
    if (jobs.value) now = Date.now();
  });

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

<!-- THE SENTENCE IN ITS PIECES: the running clause wears the live dot, and a failure today is the one red phrase. One
     line of markup, so no space is set between a piece and its punctuation. -->
{#snippet sentence()}{#each told ?? [] as p, i (i)}{#if p.tone === 'live'}<span class="live-dot" aria-hidden="true"></span>{p.text}{:else if p.tone === 'needs'}<span data-needs>{p.text}</span>{:else}{p.text}{/if}{/each}{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's. -->
<PageHead title={repo ? words.headingFor(repo) : words.heading} count={jobs.state === 'ready' ? rows.length : undefined} sentence={told ? sentence : undefined}>
  {#snippet actions()}
    {#if repo && !page.data.refused}<Button href="/jobs">{words.allJobs}</Button>{/if}
    {#if !page.data.refused}<Button weight="primary" onclick={() => void openRun()}><Icon name="play" size="s" />{words.run}</Button>{/if}
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
  {:else if rows.length === 0}
    <Empty kind="no-results" compact title={words.noneFor(repo ?? '')} />
  {:else}
    <div class="board">
      <!-- THE TILES FIRST IN THE DOCUMENT, so a screen reader meets what the runs mean before the runs; from a desk's
           width they stand in a column at the list's right, and on a phone above it. -->
      <div class="side">
        {#if lanes}
          <Tile icon="session" title={said.lanesTitle} meta={lanes.partial ? said.latest(loaded.length) : lanes.span === 'day' ? said.dayMeta : said.weekMeta}>
            <Swimlanes lanes={lanes.lanes} start={lanes.start} end={lanes.end} now={lanes.now} format={laneTime} summary={lanesSummary(lanes)} />
            <p class="reading">{lanesSaid(lanes)}</p>
          </Tile>
        {/if}
        <Tile icon="check" title={said.splitTitle} count={cursor === null ? rows.length : undefined} meta={cursor === null ? undefined : said.latest(loaded.length)}>
          <Stacked parts={split} subject={said.splitSubject} />
          <p class="reading">{splitSaid(rows)}</p>
        </Tile>
      </div>

      <div class="feed">
        {#each groups as g (g.key)}
          <Section title={g.title} count={g.rows.length}>
            <ul class="ledger ledger-lead runs">
              {#each g.rows as r (r.id)}
                {@const state = statusOf(r.status, r.lost, r.cancel)}
                {@const outcome = outcomeOf(r)}
                {@const took = tookOf(r, now)}
                <li data-live={isLive(r.status) ? '' : undefined}>
                  <!-- THE WHOLE ROW IS THE LINK, and its name is the run's: the kind, then the outcome and the facts. -->
                  <a class="line line-tall run" href={at(`/jobs/${encodeURIComponent(r.id)}`)}>
                    <IconWell name={iconOf(r)} size="l" tone={outcome === 'running' ? 'live' : undefined} />
                    <span class="line-main">
                      <span class="line-title" dir="auto">{runName(r)}</span>
                      <span class="line-detail">
                        <!-- THE OUTCOME IS A DOT AND ITS WORD. A toned dot is the intent's own mark,
                             named for a screen reader as `TONES` names it, so colour never says it alone. -->
                        <span class="status" data-intent={state.tone ?? undefined} data-outcome={outcome}
                          >{#if state.tone}<span class="dot glyph" role="img" aria-label={TONES[state.tone].label}>{TONES[state.tone].glyph}</span>{:else}<span
                              class="dot"
                              aria-hidden="true"
                            ></span>{/if}{state.word}</span
                        >{#each detailOf(r) as part, k (k)}<span class="sep" aria-hidden="true">·</span><span>{part}</span>{/each}
                      </span>
                    </span>
                    <span class="took num" data-live={isLive(r.status) ? '' : undefined}>{took ?? ''}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </Section>
        {/each}
        {#if cursor !== null}
          <div class="more"><Button disabled={reading} onclick={() => void showOlder()}>{words.older}</Button></div>
        {/if}
      </div>
    </div>
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
    <!-- EACH KIND IS A 56PX ROW: its name, where it works and whether it changes files, and a check at the end on the one
         picked. -->
    <div class="kinds" role="group" aria-label={words.pick}>
      {#each offered as k (k.id)}
        <button type="button" class="kind line line-tall tap" aria-pressed={chosen === k.id} onclick={() => pick(k.id)}>
          <IconWell name="play" size="l" tone={chosen === k.id ? 'ink' : undefined} />
          <span class="line-main">
            <span class="line-title">{k.title}</span>
            <span class="line-detail kind-meta">
              <span>{k.repo ? words.inRepo(k.repo) : words.inNoRepo}</span>
              {#if k.writes}<span class="kind-writes">{words.writesShort}</span>{/if}
            </span>
          </span>
          <span class="line-check" data-state={chosen === k.id ? 'done' : undefined} aria-hidden="true"><Icon name="check" size="s" /></span>
        </button>
      {/each}
    </div>
    {#if kind}
      {#each kind.args as a (a.id)}
        <div class="arg">
          <label class="field-label" for={`arg-${a.id}`}>{a.label}</label>
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
  /* THE PAGE IS A CONTAINER, so the list and its tiles decide their columns by the room the page has (the rail and a
     docked panel both take from it), not by the window's width. */
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* THE LIVE DOT IN THE SENTENCE: 6px of the one hue that means alive, still, before the clause it belongs to. */
  .live-dot {
    display: inline-block;
    inline-size: 6px;
    block-size: 6px;
    margin-inline-end: var(--sp-2);
    border-radius: var(--r-pill);
    background: var(--live);
    vertical-align: 0.2em;
  }

  /* ONE COLUMN UNTIL THERE IS ROOM FOR TWO: the tiles over the list, side by side where they fit, and from a desk's
     width a 320 column at the list's right, held in view while the runs scroll. */
  .board {
    display: grid;
    grid-template-areas: 'side' 'feed';
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-5);
  }

  .side {
    grid-area: side;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: var(--inset);
    min-inline-size: 0;
  }

  .feed {
    grid-area: feed;
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  @container (width >= 860px) {
    .board {
      grid-template-areas: 'feed side';
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: var(--sp-6);
    }

    .side {
      position: sticky;
      inset-block-start: calc(var(--inset) + 56px);
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* THE ONE LINE UNDER EACH CHART that says what it means, at body size in ink, at the tile's foot. */
  .reading {
    margin: 0;
    margin-block-start: auto;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* ── a run ── */

  /* THE WELL, THE NAME AND ITS META, AND HOW LONG IT TOOK AT THE RIGHT, at every width. */
  .run {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
  }

  .run .line-main {
    grid-column: 2;
    grid-row: 1;
  }

  .run .line-detail {
    display: flex;
    align-items: center;
    column-gap: 6px;
    min-inline-size: 0;
  }

  /* On a phone the meta wraps as whole items rather than cutting the machine's name. */
  @media (width < 640px) {
    .run .line-detail {
      flex-wrap: wrap;
    }
  }

  .sep {
    color: var(--dim);
  }

  .status {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    color: var(--ink2);
    font-weight: 500;
  }

  /* THE OUTCOME DOT: 6px, done in ink, running in the live hue, failed in red, a look in amber, and waiting or stopped
     in the quiet ink. */
  .dot {
    display: inline-block;
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--dim);
    color: transparent;
    text-indent: 100%;
    white-space: nowrap;
  }

  .status[data-outcome='done'] .dot {
    background: var(--ink);
  }

  .status[data-intent='info'] .dot {
    background: var(--live);
  }

  .status[data-intent='warn'] .dot {
    background: var(--warn);
  }

  .status[data-intent='bad'] .dot {
    background: var(--danger);
  }

  /* HOW LONG IT TOOK: the row's figure, tabular at the right; while it runs, the time so far in the live hue. */
  .took {
    grid-column: 3;
    grid-row: 1;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
  }

  .took[data-live] {
    color: var(--live);
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
    gap: 2px;
    margin-block-end: var(--sp-4);
  }

  /* A KIND IS A ROW IN THE SHEET, not a boxed card: the wash on hover, the chosen one `--selected` with its check. */
  .kind {
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    gap: var(--sp-3);
    inline-size: 100%;
    background: none;
    border: 0;
    font: inherit;
    cursor: pointer;
  }

  .kind[aria-pressed='true'] {
    background: var(--selected);
  }

  @media (hover: hover) and (pointer: fine) {
    .kind:hover {
      background: var(--hover-wash);
    }
  }

  .kind-meta {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
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
    margin-block-end: var(--sp-3);
  }

  /* SIXTEEN PIXELS IN EVERY FIELD (design 6.6): under that a phone zooms the page on focus and it stays zoomed. */
  .arg .field-input {
    font-size: var(--t-md);
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  @media (forced-colors: active) {
    .dot,
    .live-dot {
      background: CanvasText;
    }
  }
</style>
