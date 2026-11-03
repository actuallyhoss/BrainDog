<!--
  One script, where it stands: the sentence of its state, its recent runs as cells, what starts it, Resume when it is
  paused, what it may touch (how close it is to pausing only once it is any closer), and its recent runs and versions
  folded. On the script's own page, over the form that changes it: the list at `/scripts` is one row a script.

  PAUSED IS THE ONE STATE WITH A PRESS. Resume sends `resumeScript`; the owner-only and recent-sign-in refusals offer
  Sign in again and resume once signed in. A paused script is `warn` and a refused last run `bad`, each with its dot
  and its sentence, so the colour never stands alone.

  RUNS, LOGS AND VERSIONS FOLD inside the tile. The log is only there when the record handed it over: `logOf` gives it
  to the owner who reads every list the run touched, and `--redacted--` to everybody else, which draws as no log.
-->
<script lang="ts">
  import { TONES, since } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { factsOf, outcomeOf, resumeScript, startsBy, stateOf, words, type Script } from '$lib/record/scripts.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { signInFor } from '$lib/record/packs.ts';
  import { reprove } from '$lib/record/keychain.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Segments from '$lib/viz/Segments.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { recentOf, toneOf, words as shown } from './reading.ts';
  import { plainSay } from '$lib/flow/plain-fail.ts';

  let { s, named, onresumed }: { s: Script; named: (list: string) => string; onresumed?: (() => void | Promise<void>) | undefined } = $props();

  /* THE RECORD'S CLOCK: every date on the tile is the record's, read against its own now. */
  const now = (): number => recordNow();
  const said = $derived(stateOf(s, now()));
  const recent = $derived(recentOf(s));

  let busy = $state(false);
  /** The last refused resume: the record's sentence, and whether signing in again answers it. */
  let failed = $state<{ script: string; fix: string; signin: boolean } | null>(null);
  let reproving = $state(false);

  async function resume(row: Script) {
    if (busy) return;
    busy = true;
    failed = null;
    const started = opened();
    const out = await resumeScript(apiBase(), row.script);
    closed(true, started);
    busy = false;
    if (!out.ok) {
      const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: copy.writeRaced };
      failed = { script: row.script, fix: refusal.fix, signin: signInFor(refusal) };
      return;
    }
    toasts.push(words.resumed(row.title), { intent: 'good' });
    await onresumed?.();
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it, and the same script is resumed again. */
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await resume(s);
  }
</script>

<Tile icon="code" title={words.standing}>
  <p class="card-state" data-intent={said.tone}>
    {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
    {said.line}
  </p>

  <!-- ONE CELL A RECENT RUN, the ones that went through filled, and the line saying what starts it and how its
       runs went. No chart when the history held none of its runs. -->
  {#if recent}
    <Segments total={recent.total} done={recent.ok} subject={shown.recentSubject} />
    <p class="reading legend">{shown.legend(recent.total, recent.ok)}</p>
  {/if}
  <p class="reading">{startsBy(s)} {recent?.said ?? words.noRuns}</p>

  {#if said.resume || failed?.script === s.script}
    <div class="card-do">
      {#if said.resume}
        <Button weight="quiet" disabled={busy} aria-label={words.resumeOne(s.title)} onclick={() => void resume(s)}>{words.resume}</Button>
      {/if}
      {#if failed?.script === s.script && failed.signin}
        <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
      {/if}
    </div>
    {#if failed?.script === s.script}<p class="card-fix" role="status">{failed.fix}</p>{/if}
  {/if}

  <!-- WHAT IT MAY TOUCH, AND HOW CLOSE IT IS TO PAUSING: a pure list, meta words over their values. -->
  <dl class="facts">
    {#each factsOf(s, named) as f (f.label)}
      <div class="fact">
        <dt>{f.label}</dt>
        <dd>{f.value}</dd>
      </div>
    {/each}
  </dl>

  <details class="fold">
    <summary class="fold-head tap"><Icon name="chevron" size="s" />{words.recent}</summary>
    {#if s.recent.length === 0}
      <p class="fold-none">{words.noRuns}</p>
    {:else}
      <ol class="runs">
        {#each s.recent as r (r.id)}
          <li class="run" data-tone={toneOf(r.outcome)}>
            <p class="run-line">
              <span class="dot" aria-hidden="true"></span>
              <span class="run-outcome" data-outcome={r.outcome}>{outcomeOf(r.outcome)}</span>
              <span class="run-when">{since(r.at, now())}{#if r.version !== null}, {words.version(r.version).toLowerCase()}{/if}</span>
            </p>
            {#if r.say}<p class="run-say">{plainSay(r.say)}</p>{/if}
            {#if r.log !== null}
              <details class="run-log">
                <summary class="run-log-head tap">{words.showLog(since(r.at, now()))}</summary>
                <!-- A LONG LOG SCROLLS INSIDE ITSELF (`.log`'s block size), and a box with nothing focusable in it cannot
                     be scrolled from the keyboard, so the box itself takes focus. -->
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <pre class="log" tabindex="0">{r.log}</pre>
              </details>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </details>

  <details class="fold">
    <summary class="fold-head tap"><Icon name="chevron" size="s" />{words.versions}</summary>
    <p class="fold-none">{words.versionsFrom}</p>
    <ol class="versions">
      {#each s.versions as v (v.version)}
        <li class="version">
          <p class="version-line">
            <span class="version-name">{words.version(v.version)}</span>
            {#if v.current}<span class="version-now">{words.now}</span>{/if}
          </p>
          <p class="version-detail">
            {#if v.at !== null}{words.installed(since(v.at, now()))}. {/if}{words.versionRuns(v.runs, v.refused)}.
          </p>
          {#if v.note}<p class="version-detail">{v.note}</p>{/if}
        </li>
      {/each}
    </ol>
  </details>
</Tile>

<style>
  .card-state,
  .card-fix {
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    max-inline-size: var(--measure);
  }

  .card-state {
    color: var(--ink);
  }

  .card-state .glyph {
    margin-inline-end: var(--sp-2);
    vertical-align: 0.15em;
  }

  .card-fix {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE ONE LINE UNDER THE CHART that says what it means. */
  .reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .card-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* META WORDS OVER THEIR VALUES, two to a line where there is room. An origin or a list name wraps rather than pushing
     the page sideways at 320. */
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr));
    gap: var(--sp-3) var(--sp-4);
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .fact dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }

  /* RUNS AND VERSIONS FOLD, each behind a chevron that turns when it opens. */
  .fold {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .fold + .fold {
    margin-block-start: calc(-1 * var(--sp-3));
  }

  /* A 44PX TARGET UNDER A THUMB, and the word stays where it reads (`.tap` grows the hit box, not the text). */
  .fold-head,
  .run-log-head {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    inline-size: fit-content;
    min-block-size: var(--ctl-h-sm);
    color: var(--ink);
    font-weight: 500;
    cursor: pointer;
  }

  .fold-head::-webkit-details-marker {
    display: none;
  }

  .fold-head {
    list-style: none;
  }

  .fold-head :global(.icon) {
    color: var(--ink-3);
    transition: rotate var(--d-state) var(--ease-out);
  }

  .fold[open] > .fold-head :global(.icon) {
    rotate: 90deg;
  }

  .fold-none {
    margin-block: var(--sp-1);
    margin-inline: 0;
    color: var(--ink-3);
    max-inline-size: var(--measure);
  }

  .runs,
  .versions {
    display: flex;
    flex-direction: column;
    margin-block: var(--sp-1) 0;
    margin-inline: 0;
    padding: 0;
    list-style: none;
  }

  /* A RUN IS A ROW: its outcome as a dot and a word, when, and its version, a hairline between rows. */
  .run,
  .version {
    padding-block: var(--sp-2);
  }

  .run + .run,
  .version + .version {
    border-block-start: 1px solid var(--rule);
  }

  .run-line,
  .version-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-2);
    margin: 0;
  }

  .dot {
    display: inline-block;
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-ctl);
    background: var(--ink-3);
  }

  .run[data-tone='done'] .dot {
    background: var(--ink);
  }

  .run[data-tone='bad'] .dot {
    background: var(--red);
  }

  .run[data-tone='warn'] .dot {
    background: var(--warn-fill);
  }

  .run-outcome,
  .version-name {
    color: var(--ink);
    font-weight: 500;
  }

  .run-when,
  .version-now {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .run-say,
  .version-detail {
    margin: 0;
    padding-inline-start: calc(6px + var(--sp-2));
    color: var(--ink-2);
    overflow-wrap: anywhere;
    max-inline-size: var(--measure);
  }

  .version-detail {
    padding-inline-start: 0;
  }

  .run-log {
    padding-inline-start: calc(6px + var(--sp-2));
  }

  /* THE LOG IS WHAT THE SCRIPT PRINTED, so it keeps its lines and its monospace, on the tile's inner fill, and a long
     line wraps inside the tile rather than scrolling the page. */
  .log {
    margin-block: var(--sp-1) 0;
    margin-inline: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pop);
    background: var(--tile-2);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-block-size: 20lh;
    overflow-y: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .fold-head :global(.icon) {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .dot {
      background: CanvasText;
    }
  }
</style>
