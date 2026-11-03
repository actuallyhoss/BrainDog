<!--
  One run: `/jobs/<id>`, its transcript while a machine works on it and after.

  THE TITLE ROW SAYS WHERE IT STANDS: the outcome as a dot and its word, then where it runs and since when, or how
  long, where and in how many turns it ran. The word is red only for a failure or a machine gone quiet. The status is
  read from the last line (`headerStatus` in `lib/record/jobs.ts`), so the sentence and the transcript never disagree
  for a poll.

  ONE TILE, "THIS RUN": its facts as a list, and once it has called tools, the tools it called as bars, busiest in ink,
  with the line saying what that means. Nothing here is guessed: a fact the record did not send is not listed.

  THE TRANSCRIPT IS ON THE GROUND, NOT IN A TILE: the runner's distillation, one row per line it sent, each
  with a well for its kind and the time it came in Geist Mono. A tool call carries its result folded onto the same row,
  what Claude said is prose, its thinking is folded away, and the end says how it ended.

  IT ASKS EVERY `POLL_MS` WHILE THE RUN IS LIVE AND NEVER ONCE IT HAS ENDED. Each ask names the last line it holds, so
  the record answers only what is new; a full page means more are waiting, and it asks again at once rather than
  waiting a beat per page. Leaving the screen stops the asking.

  STOP IS HERE WHILE THE RUN IS LIVE, a quiet pill and never red, and on a phone it sits in a tile at the foot of the
  screen, no taller than `--sticky`, where a thumb finds it while the transcript scrolls. It stops a waiting run at once and flags a running one, which its
  machine reads within seconds; the status says "Stopping" until the machine has stopped.

  AN ID NAMING NO RUN SAYS SO, as an empty screen and not a failure: nothing failed, the address names nothing here.
  A REFUSED SHELL IS NOT A RUN TO SHOW, and the record's sentence is the page, as it is on Home (`data.refused`).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { TONES, since } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
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
  import IconWell from '$lib/ui/IconWell.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import { machineOf, outcomeOf, runTail, toolsOf, toolsSaid, words as runWords } from '../charts.ts';
  import { costWords } from './cost.ts';
  import SendButton from '$lib/send/SendButton.svelte';
  import SendStrip from '$lib/send/SendStrip.svelte';
  import { refs as sendRefs } from '$lib/send/send.ts';

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

  /* THE RECORD'S CLOCK (`recordNow`), moved on with each poll: every date here is the record's, so it is read against the
     record's now. Against this browser's clock a run asked for at 15:00 read "Started 8w ago" on a record whose clock is
     not the browser's. */
  let now = $state(recordNow());

  /* ONE POLL PER RUN ON SCREEN. A new id or a new record starts over from line 0, and leaving stops the timer and drops
     whatever answer was still out, so a run's lines never land under another's header. */
  $effect(() => {
    const job = id;
    const at = base;
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seq = 0;
    let first = true;
    /* UNTRACKED, because `opened()` reads the pending count it raises: tracked, every answer that lowered it ran this
       effect again, and an id naming no run asked the record over and over until Svelte gave up on the loop. */
    const mark = untrack(opened);
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
      now = recordNow();
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
  const gone = 'This run is not here';

  const title = $derived(row ? runName(row) : words.run1);
  const args = $derived(row ? Object.entries(row.args).filter(([, v]) => v !== '') : []);

  /* WHAT THE RUN CALLED, from its own transcript, and when each line came in. */
  const tally = $derived(toolsOf(steps));
  const sentAt = $derived(new Map(events.map((e) => [e.seq, e.ts])));
  /* RED ONLY FOR A FAILURE OR A MACHINE GONE QUIET: those are the two that need him. */
  const red = $derived(said !== null && (said.tone === 'bad' || (lost && live)));
  const outcome = $derived(status === null ? null : outcomeOf({ status }));

  const STAMP = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const stampOf = (iso: string | undefined): string => {
    const t = iso === undefined ? Number.NaN : Date.parse(iso);
    return Number.isFinite(t) ? STAMP.format(t) : '';
  };

  /** A line's well: a tool call, prose, thinking, the start, the end as it went, a limit, a note or an error. */
  function iconFor(s: { kind: string; status: JobStatus | null; tool: unknown }): IconName {
    if (s.kind === 'tool') return 'code';
    if (s.kind === 'think') return 'learning';
    if (s.kind === 'start') return 'play';
    if (s.kind === 'limit') return 'stop';
    if (s.kind === 'note') return 'info';
    if (s.kind === 'error') return 'alert';
    if (s.kind === 'end') return s.status === 'ok' ? 'check' : s.status === 'cancelled' ? 'stop' : 'alert';
    return 'doc';
  }
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<!-- WHERE THE RUN STANDS, AS THE TITLE ROW'S SENTENCE: the outcome's dot and word, then where and since when or how
     long. A live region, so a run that ends is heard to end. One line of markup, so no space lands before a stop. -->
{#snippet sentence()}{#if status !== null && said !== null}<span class="state" data-intent={said.tone ?? undefined} data-outcome={outcome} role="status"
      >{#if said.tone}<span class="dot glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{:else}<span class="dot" aria-hidden="true"
        ></span>{/if}{#if red}<span class="state-word" data-needs>{said.word}</span>{:else}<span class="state-word">{said.word}</span>{/if}{runTail(status, lost, row)}</span
    >{/if}{/snippet}

<!-- A FAILED RUN, SENT: to Slash to say why, or to an agent to try again (`$lib/send`). Only a failure; a run that is
     going or went well has nothing to hand on. -->
{#snippet sendRun()}<SendButton kind="run" attach={[{ ref: sendRefs.run(id), label: title }]} fallback={`Why did “${title}” fail, and what would fix it?`} />{/snippet}

<PageHead {title} named kicker={words.heading} back="/jobs" sentence={status !== null && said !== null ? sentence : undefined} actions={outcome === 'failed' ? sendRun : undefined} />

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
    <SendStrip ref={sendRefs.run(id)} kind="run" label={title} />
    {#if row || tally.calls > 0}
      <Tile icon="session" title={runWords.runTitle}>
        {#if row}
          <!-- THE FACTS ARE A PURE LIST, meta words over their values, two to a line where there is room. -->
          <dl class="facts">
            <div class="fact">
              <dt>{words.machine}</dt>
              <dd>{machineOf(row.runner) ?? words.noMachine}</dd>
            </div>
            <div class="fact">
              <dt>{words.started}</dt>
              <dd>{since(startedAt(row), now)}</dd>
            </div>
            {#if row.ms !== null}
              <div class="fact">
                <dt>{words.took}</dt>
                <dd class="num">{duration(row.ms)}</dd>
              </div>
            {/if}
            {#if row.turns !== null}
              <div class="fact">
                <dt>{words.turnsLabel}</dt>
                <dd class="num">{row.turns}</dd>
              </div>
            {/if}
            {#if row.cost_minor !== null && row.cost_currency !== null}
              {@const saidCost = costWords(row.cost_minor, row.cost_currency)}
              <div class="fact">
                <dt>{runWords.cost}</dt>
                <dd>{#if saidCost !== null}{saidCost}{:else}<Money minor={row.cost_minor} currency={row.cost_currency} />{/if}</dd>
              </div>
            {/if}
            {#if args.length}
              <div class="fact fact-wide">
                <dt>{words.args}</dt>
                <dd>{args.map(([, v]) => v).join(', ')}</dd>
              </div>
            {/if}
          </dl>
        {/if}
        {#if tally.calls > 0}
          <Bars items={tally.items} subject={runWords.toolsSubject} />
          <p class="reading">{toolsSaid(tally)}</p>
        {/if}
      </Tile>
    {/if}

    <Tile icon="doc" class="section" data-surface="tile" title={runWords.transcript} count={steps.length || undefined}>
      <div class="section-body">
        {#if steps.length === 0}
          <p class="none">{words.empty}</p>
        {:else}
          <ol class="transcript">
            {#each steps as s (s.seq)}
              {@const ended = s.kind === 'end' && s.status !== null ? statusOf(s.status) : null}
              <li class="step" data-kind={s.kind}>
                <IconWell name={iconFor(s)} size="l" tone={s.kind === 'error' || ended?.tone === 'bad' ? 'danger' : undefined} />
                <div class="step-body">
                  {#if s.kind === 'tool' && s.tool}
                    <!-- A TOOL ROW: its name on its own line on a phone and in a fixed track from 640 up, what it was
                         called with beside it, and the result folded under it once the result has come. -->
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
                  {:else if ended !== null}
                    <p class="end" data-intent={ended.tone ?? undefined}>
                      {#if ended.tone}<span class="glyph" role="img" aria-label={TONES[ended.tone].label}>{TONES[ended.tone].glyph}</span>{/if}<span
                        class="end-word">{ended.word}</span
                      >{#if s.text}. {s.text}{/if}
                    </p>
                  {:else}
                    <p class="say">{s.text}</p>
                    {#if s.cut !== null}<p class="cut">{words.cutAt(s.cut)}</p>{/if}
                  {/if}
                </div>
                <!-- THE MINUTE IT CAME IN, in Geist Mono as a feed's times are. -->
                {#if sentAt.get(s.seq)}<time class="step-at" datetime={sentAt.get(s.seq)}>{stampOf(sentAt.get(s.seq))}</time>{/if}
              </li>
            {/each}
          </ol>
        {/if}
      </div>
    </Tile>

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
  /* TILES 12 APART, THE BOARD'S GAP (G27): this page stood its tiles 24 apart where every other page stands them 12. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--page-head-gap, 24px) var(--gutter) var(--page-bottom, 64px);
    /* NO CAP: the page runs the window's width to the gutters, and each line of prose keeps `--measure` below. */
  }

  /* ── the sentence ── */

  .state {
    display: inline;
  }

  .state-word {
    color: var(--ink);
    font-weight: 500;
  }

  /* THE OUTCOME DOT, as the list draws it: done in ink, running in the live hue, a look in amber, failed in red, and
     waiting or stopped in the quiet ink. It holds still: nothing pulses. */
  .dot {
    display: inline-block;
    inline-size: 6px;
    block-size: 6px;
    margin-inline-end: var(--sp-2);
    overflow: hidden;
    border-radius: var(--r-ctl);
    background: var(--ink-3);
    color: transparent;
    text-indent: 100%;
    white-space: nowrap;
    vertical-align: 0.2em;
  }

  .state[data-outcome='done'] .dot {
    background: var(--ink);
  }

  .state[data-intent='info'] .dot {
    background: var(--live);
  }

  .state[data-intent='warn'] .dot {
    background: var(--warn-fill);
  }

  .state[data-intent='bad'] .dot {
    background: var(--red);
  }

  /* ── this run ── */

  /* META WORDS OVER THEIR VALUES, as many to a line as fit, and the arguments across the whole line. */
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr));
    gap: var(--sp-3) var(--sp-4);
    margin: 0;
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: var(--row-stack, 2px);
    min-inline-size: 0;
  }

  .fact-wide {
    grid-column: 1 / -1;
  }

  .fact dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  /* THE ONE LINE UNDER THE CHART that says what it means. */
  .reading {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui, 20px);
  }

  /* ── the transcript, on the ground ── */

  .none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    max-inline-size: var(--measure);
  }

  .transcript {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A WELL, THE LINE, AND ITS TIME AT THE RIGHT. The time drops under the line on a phone, where the width is the line's. */
  .step {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    min-inline-size: 0;
  }

  .step + .step {
    border-block-start: 1px solid var(--sep, var(--rule));
  }

  .step-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    padding-block-start: 6px;
  }

  .step-at {
    padding-block-start: 7px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    font-size: var(--fs-cap);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  @media (width < 640px) {
    .step {
      grid-template-columns: var(--well-l) minmax(0, 1fr);
    }

    .step-at {
      grid-column: 2;
      padding-block-start: 0;
    }
  }

  /* A TOOL'S NAME ON ITS OWN LINE ON A PHONE, and in a fixed track beside its input from 640 up, so the calls read
     down one column. */
  .call {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--row-stack, 2px);
  }

  @media (min-width: 640px) {
    .call {
      grid-template-columns: 16ch minmax(0, 1fr);
      gap: var(--sp-3);
    }
  }

  .call-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .call-input {
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .say,
  .think,
  .end {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-inline-size: var(--measure);
  }

  .think {
    color: var(--ink-2);
  }

  .step[data-kind='note'] .say,
  .step[data-kind='start'] .say,
  .step[data-kind='limit'] .say {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .step[data-kind='error'] .say {
    color: var(--red);
  }

  .end .glyph {
    margin-inline-end: var(--sp-2);
    vertical-align: 0.15em;
  }

  .end-word {
    font-weight: 600;
  }

  .end[data-intent='bad'] .end-word {
    color: var(--red);
  }

  .out {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .out-head {
    display: flex;
    align-items: center;
    inline-size: fit-content;
    min-block-size: var(--ctl-h-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .out[data-failed] .out-head {
    color: var(--red);
  }

  /* WHAT A TOOL ANSWERED, AS IT CAME: monospace on the tile's own white, rounded as a field is, scrolling inside
     itself rather than the page. */
  .out-text {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pop);
    background: var(--tile);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-block-size: 20lh;
    overflow-y: auto;
  }

  .cut {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* STOP, AT THE FOOT WHILE THE RUN IS LIVE: in the flow from 900 up, where the whole screen is in reach. */
  .stop-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .stop-fix {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
    max-inline-size: var(--measure);
  }

  /* ABOVE THE TAB BAR, NOT UNDER IT: below 900 the shell's scroller runs to the bottom of the window and `TabBar` is
     docked to the bottom edge over its last `--tabbar`, so the bar sticks a step above it. An opaque tile with one
     hairline round it, no glass, so the steps passing under it are never read through it. */
  @media (width < 900px) {
    .stop-bar {
      position: sticky;
      inset-block-end: calc(var(--tabbar) + var(--sp-2));
      z-index: var(--z-raise);
      min-block-size: var(--sticky);
      max-block-size: var(--sticky);
      padding-inline: var(--sp-3);
      background: var(--tile);
      border-radius: var(--r-tile);
      border: 1px solid var(--rule-strong);
      overflow: hidden;
    }
  }

  @media (forced-colors: active) {
    .dot {
      background: CanvasText;
    }

    .stop-bar {
      border: 1px solid CanvasText;
    }
  }
</style>
