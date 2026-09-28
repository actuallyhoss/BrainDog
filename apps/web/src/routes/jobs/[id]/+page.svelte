<!--
  One run: `/jobs/<id>`, its transcript while a machine works on it and after (`loop/finish/agents.md` AGT-23, C13).

  THE TRANSCRIPT IS THE RUNNER'S DISTILLATION, one row per line it sent: a tool call with its result folded onto the
  same row, what Claude said as prose, its thinking folded away, and the end. The header's status is read from the last
  line (`headerStatus` in `lib/record/jobs.ts`), so the two never disagree for a poll.

  IT ASKS EVERY `POLL_MS` WHILE THE RUN IS LIVE AND NEVER ONCE IT HAS ENDED. Each ask names the last line it holds, so
  the record answers only what is new; a full page means more are waiting, and it asks again at once rather than
  waiting a beat per page. Leaving the screen stops the asking.

  STOP IS HERE WHILE THE RUN IS LIVE, and on a phone it sits at the foot of the screen, no taller than `--sticky`, where
  a thumb finds it while the transcript scrolls. It stops a waiting run at once and flags a running one, which its
  machine reads within seconds; the status says "Stopping" until the machine has stopped.

  AN ID NAMING NO RUN SAYS SO, as an empty screen and not a failure: nothing failed, the address names nothing here.
  A REFUSED SHELL IS NOT A RUN TO SHOW, and the record's sentence is the page, as it is on Home (`data.refused`).
-->
<script lang="ts">
  import { page as route } from '$app/state';
  import { TONES, since } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import {
    EVENTS_PAGE,
    POLL_MS,
    duration,
    findJob,
    headerStatus,
    isLive,
    isMissing,
    readEvents,
    runName,
    startedAt,
    statusOf,
    stopJob,
    transcriptOf,
    words,
    type JobEvent,
    type JobRow,
    type JobStatus,
  } from '$lib/record/jobs.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';

  const id = $derived(String(route.params.id ?? ''));
  const base = $derived(apiBase(route.url));

  let events = $state.raw<JobEvent[]>([]);
  let answered = $state<JobStatus | null>(null);
  let lost = $state(false);
  let cancel = $state(false);
  let missing = $state(false);
  let refusal = $state<string | null>(null);
  let row = $state.raw<JobRow | null>(null);

  const steps = $derived(transcriptOf(events));
  const status = $derived(answered === null ? null : headerStatus(steps, answered));
  const live = $derived(status !== null && isLive(status));
  const said = $derived(status === null ? null : statusOf(status, lost, cancel));

  /* THIS BROWSER'S CLOCK, moved on with each poll. Every date here is the record's, read against now (DIRECTION 26). */
  let now = $state(Date.now());

  /* ONE POLL PER RUN ON SCREEN. A new id or a new record starts over from line 0, and leaving stops the timer and drops
     whatever answer was still out, so a run's lines never land under another's header. */
  $effect(() => {
    const job = id;
    const at = base;
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seq = 0;
    let first = true;
    const mark = opened();
    events = [];
    answered = null;
    lost = false;
    cancel = false;
    missing = false;
    refusal = null;
    row = null;

    async function tick(): Promise<void> {
      const got = await readEvents(at, job, seq);
      if (gone) return;
      now = Date.now();
      if (!got.ok) {
        /* THE FIRST ANSWER SETTLES THE SCREEN; a later one that fails is a blip in a live run, and the next ask
           goes out as it would have. */
        if (first) {
          first = false;
          missing = isMissing(got);
          refusal = missing ? null : 'refusal' in got ? got.refusal.fix : copy.readRefused;
          closed(missing, mark);
          return;
        }
        timer = setTimeout(() => void tick(), POLL_MS);
        return;
      }
      const v = got.value;
      if (v.events.length) {
        events = [...events, ...v.events];
        seq = v.events.at(-1)?.seq ?? seq;
      }
      answered = v.status;
      lost = v.lost;
      cancel = v.cancel;
      if (first) {
        first = false;
        closed(true, mark);
        drew('ready');
      }
      if (v.events.length >= EVENTS_PAGE) void tick();
      else if (isLive(v.status) || seq < v.seq) timer = setTimeout(() => void tick(), POLL_MS);
    }

    void tick();
    /* WHAT THE RUN IS, for its title and machine, read beside the transcript and never holding it up. */
    void findJob(at, job).then((found) => {
      if (!gone) row = found;
    });
    return () => {
      gone = true;
      if (timer !== undefined) clearTimeout(timer);
      if (first) closed(true, mark);
    };
  });

  let stopping = $state(false);
  let stopFix = $state<string | null>(null);

  async function stop() {
    if (stopping || !live) return;
    stopping = true;
    stopFix = null;
    const mark = opened();
    const got = await stopJob(base, id);
    closed(true, mark);
    stopping = false;
    if (!got.ok) {
      stopFix = 'refusal' in got ? got.refusal.fix : copy.readRefused;
      return;
    }
    cancel = got.value.cancel || !isLive(got.value.status);
    answered = got.value.status;
  }

  /* THE SENTENCE FOR AN ADDRESS THAT NAMES NO RUN, kept here and not in `words.noSuch`, which puts the id in it. */
  const gone = 'This run is not on this record';

  const title = $derived(row ? runName(row) : words.run1);
  const args = $derived(row ? Object.entries(row.args).filter(([, v]) => v !== '') : []);
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<PageHead {title} kicker={words.heading} back="/jobs" />

<div class="page">
  {#if route.data.refused}
    <!-- A REFUSED SHELL IS NOT A RUN TO SHOW. The record's sentence is the page, as it is on Home. -->
    <Empty kind="error" heading title={route.data.refused.fix} />
  {:else if missing}
    <!-- NO ID IN THE TITLE, AND ONE WAY ON (design 2.15, 6.8.3): the address's id is the one part of it nobody reads,
         so the sentence says what is missing in words and the list of runs is the place to go from here. -->
    <Empty kind="no-results" title={gone} body={words.noSuchWhy}>
      {#snippet actions()}<Button href="/jobs">{words.allJobs}</Button>{/snippet}
    </Empty>
  {:else if refusal !== null}
    <ReadState state="refused" {refusal} />
  {:else if status === null || said === null}
    <Waiting rows={4} />
  {:else}
    <p class="state" data-intent={said.tone ?? undefined} role="status">
      {#if live}<span class="pulse" aria-hidden="true"></span>{/if}
      {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
      {said.word}
    </p>

    {#if row}
      <dl class="facts">
        <div class="fact">
          <dt>{words.machine}</dt>
          <dd>{row.runner ?? words.noMachine}</dd>
        </div>
        <div class="fact">
          <dt>{words.started}</dt>
          <dd>{since(startedAt(row), now)}</dd>
        </div>
        {#if row.turns !== null}
          <div class="fact">
            <dt>{words.turnsLabel}</dt>
            <dd>{row.turns}</dd>
          </div>
        {/if}
        {#if row.ms !== null}
          <div class="fact">
            <dt>{words.took}</dt>
            <dd>{duration(row.ms)}</dd>
          </div>
        {/if}
        {#if args.length}
          <div class="fact">
            <dt>{words.args}</dt>
            <dd>{args.map(([, v]) => v).join(', ')}</dd>
          </div>
        {/if}
      </dl>
    {/if}

    {#if steps.length === 0}
      <p class="none">{words.empty}</p>
    {:else}
      <ol class="transcript">
        {#each steps as s (s.seq)}
          <li class="step" data-kind={s.kind}>
            {#if s.kind === 'tool' && s.tool}
              <!-- A TOOL ROW: its name on its own line on a phone and in a fixed track from 640 up, what it was called
                   with beside it, and the result folded under it once the result has come. -->
              <div class="call">
                <span class="call-name">{s.tool.name}</span>
                <code class="call-input">{s.text}</code>
              </div>
              {#if s.cut !== null}<p class="cut">{words.cutAt(s.cut)}</p>{/if}
              {#if s.tool.out}
                <details class="out" data-failed={s.tool.out.failed ? '' : undefined}>
                  <summary class="out-head tap">{s.tool.out.failed ? words.failed : words.result}</summary>
                  <pre class="out-text">{s.tool.out.text}</pre>
                  {#if s.tool.out.cut !== null}<p class="cut">{words.cutAt(s.tool.out.cut)}</p>{/if}
                </details>
              {/if}
            {:else if s.kind === 'think'}
              <details class="out">
                <summary class="out-head tap">{words.thinking}</summary>
                <p class="think">{s.text}</p>
              </details>
            {:else if s.kind === 'out'}
              <pre class="out-text">{s.text}</pre>
            {:else if s.kind === 'end' && s.status !== null}
              {@const ended = statusOf(s.status)}
              <p class="end" data-intent={ended.tone ?? undefined}>
                <span class="end-word">{ended.word}</span>{#if s.text}. {s.text}{/if}
              </p>
            {:else}
              <p class="say">{s.text}</p>
              {#if s.cut !== null}<p class="cut">{words.cutAt(s.cut)}</p>{/if}
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    {#if live || stopFix}
      <div class="stop-bar">
        {#if live}
          <Button tone="bad" disabled={stopping || cancel} onclick={() => void stop()}>{cancel ? words.cancelling : words.cancel}</Button>
        {/if}
        {#if stopFix}<p class="stop-fix" role="status">{stopFix}</p>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    /* THE PAGE'S CAP IS THE TOKEN EVERY SCREEN SHARES (design 6.7), and each line of prose keeps `--measure` below. */
    max-inline-size: var(--page-max);
  }

  .state {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
  }

  .state[data-intent='info'] .glyph {
    color: var(--info);
  }

  .state[data-intent='warn'] .glyph {
    color: var(--warn);
  }

  .state[data-intent='bad'] .glyph {
    color: var(--danger);
  }

  /* THE PULSE IS THE LIVE RUN'S DOT, and the word beside it says what it means (design-brief §10). */
  .pulse {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: var(--r-pill);
    background: var(--info);
    animation: run-pulse 1.6s var(--ease-out) infinite;
  }

  @keyframes run-pulse {
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

  /* LABEL ABOVE VALUE ON A PHONE, a label column at 16ch from 640 up (design-brief §5). */
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-2);
    margin: 0;
  }

  .fact {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }

  .fact dt {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  @media (min-width: 640px) {
    .fact {
      grid-template-columns: 16ch minmax(0, 1fr);
      gap: var(--sp-3);
    }
  }

  .none {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-ui);
    max-inline-size: var(--measure);
  }

  .transcript {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding-block: var(--sp-2);
    min-inline-size: 0;
  }

  .step + .step {
    border-block-start: 1px solid var(--line-soft);
  }

  /* A TOOL'S NAME ON ITS OWN LINE ON A PHONE, and in a fixed track beside its input from 640 up, so the calls read
     down one column. */
  .call {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }

  @media (min-width: 640px) {
    .call {
      grid-template-columns: 16ch minmax(0, 1fr);
      gap: var(--sp-3);
    }
  }

  .call-name {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .call-input {
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .say,
  .think,
  .end {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-inline-size: var(--measure);
  }

  .think {
    color: var(--ink2);
  }

  .step[data-kind='note'] .say,
  .step[data-kind='start'] .say,
  .step[data-kind='limit'] .say {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .step[data-kind='error'] .say {
    color: var(--danger);
  }

  .end-word {
    font-weight: 500;
  }

  .end[data-intent='bad'] .end-word {
    color: var(--danger);
  }

  .end[data-intent='warn'] .end-word {
    color: var(--warn);
  }

  .out {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .out-head {
    display: flex;
    align-items: center;
    inline-size: fit-content;
    min-block-size: var(--ctl-h-sm);
    cursor: pointer;
  }

  .out[data-failed] .out-head {
    color: var(--danger);
  }

  .out-text {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-sm);
    background: var(--s2);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-block-size: 20lh;
    overflow-y: auto;
  }

  .cut {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* STOP, AT THE FOOT WHILE THE RUN IS LIVE: sticky on a phone, no taller than `--sticky`, and in the flow from 900 up
     where the whole screen is in reach. */
  .stop-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .stop-fix {
    margin: 0;
    color: var(--danger);
    font-size: var(--t-sm);
    max-inline-size: var(--measure);
  }

  /* ABOVE THE TAB BAR, NOT UNDER IT: below 900 the shell's scroller runs to the bottom of the window and `TabBar` is
     fixed over its last `--tabbar`, so a bar stuck to 0 was drawn behind it, as the automation screen's footer says. */
  @media (width < 900px) {
    .stop-bar {
      position: sticky;
      inset-block-end: var(--tabbar);
      z-index: var(--z-raise);
      min-block-size: var(--sticky);
      max-block-size: var(--sticky);
      background: var(--bg);
      border-block-start: 1px solid var(--line-soft);
      overflow: hidden;
    }
  }
</style>
