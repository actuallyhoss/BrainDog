<!--
  Scripts: `/scripts`, every installed script and where it stands (`loop/finish/shell.md` SCR-2).

  THE TITLE ROW SAYS HOW MANY, HOW MUCH THEY RAN THIS MONTH, AND WHAT HAS STOPPED. The month is the sum of each row's
  own count, never recounted from history, and the red phrases are a paused script and a refused last run.

  ONE TILE A SCRIPT (SYSTEM §6). A script is read, not scanned, and each one holds a figure: its name in the tile's
  heading, one sentence of where it stands, its recent runs as one cell each with the ones that went through filled,
  the line saying what starts it and how those runs went, and the facts a person checks before trusting it (how close
  it is to pausing, this month's runs, and what it may read, write, fetch and open) as a pure list. One column up to
  640 wide, two from 1100.

  PAUSED IS THE ONE STATE WITH A PRESS, as it is on the scheduled actions under "Runs on" (`Actions.svelte`). Resume is
  a quiet pill that sends `resumeScript`; the owner-only and recent-sign-in refusals offer Sign in again and resume
  once signed in. A paused script is `warn` and a refused last run `bad`, each with its dot and its sentence, so the
  colour never stands alone.

  RUNS, LOGS AND VERSIONS FOLD inside the tile, never as a tile inside it. A run is a row with its outcome as a dot and
  a word. The log is only there when the record handed it over: `logOf` gives it to the owner who reads every list the
  run touched, and `--redacted--` to everybody else, which draws as no log.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { TONES, since } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { afterResume, factsOf, outcomeOf, readScripts, resumeScript, startsBy, stateOf, words, type Script } from '$lib/record/scripts.ts';
  import { signInFor } from '$lib/record/packs.ts';
  import { reprove } from '$lib/record/vault.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Segments from '$lib/viz/Segments.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { recentOf, sentenceOf, toneOf, words as shown } from './reading.ts';

  /* THE RECORD'S ADDRESS IS THE QUESTION, so moving to another record under the same route asks again rather than
     drawing the last record's scripts under the new one's name. */
  const scripts = read(
    () => apiBase(page.url),
    () => readScripts(apiBase(page.url)),
    { empty: (v) => v.length === 0 },
  );

  /* A RESUMED SCRIPT IS DRAWN ON AT ONCE, from what the kernel leaves it as, until the read asked again lands. */
  let patched = $state<Script[] | null>(null);
  const rows = $derived(patched ?? scripts.value ?? []);
  const told = $derived(scripts.state === 'ready' ? sentenceOf(rows) : null);

  let busy = $state(false);
  /** The last refused resume: which script, the record's sentence, and whether signing in again answers it. */
  let failed = $state<{ script: string; fix: string; signin: boolean } | null>(null);
  let reproving = $state(false);

  /* THIS BROWSER'S CLOCK. Every date on a card is the record's, read against now (DIRECTION 26). */
  const now = (): number => Date.now();

  /* AN AGENT WRITES THESE AS READILY AS A PERSON ACCEPTS THEM (DIRECTION §22), so the empty list says what to ask one,
     in the form every other empty state's prompt takes. An example a person reads and replaces. */
  const agentPrompt = 'read my record, then propose a script that fetches the US dollar in euros from api.example.com every hour and writes it to a list';

  async function resume(row: Script) {
    if (busy) return;
    busy = true;
    failed = null;
    const started = opened();
    const out = await resumeScript(apiBase(page.url), row.script);
    closed(true, started);
    busy = false;
    if (!out.ok) {
      const refusal = 'refusal' in out ? out.refusal : { code: 'VERSION_STALE', fix: copy.writeRaced };
      failed = { script: row.script, fix: refusal.fix, signin: signInFor(refusal) };
      return;
    }
    patched = afterResume(rows, row.script, new Date(now()).toISOString());
    toasts.push(words.resumed(row.title), { intent: 'good' });
    await scripts.reread();
    patched = null;
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it, and the same script is resumed again. */
  async function signInAgain() {
    const want = failed ? rows.find((r) => r.script === failed?.script) : undefined;
    if (reproving || !want) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await resume(want);
  }
</script>

<svelte:head><title>{titleOf(words.heading)}</title></svelte:head>

<!-- THE SENTENCE IN ITS PIECES, the paused count and a refused last run in red. One line of markup, so no space is set
     between a piece and its punctuation. -->
{#snippet sentence()}{#each told ?? [] as p, i (i)}{#if p.tone === 'needs'}<span data-needs>{p.text}</span>{:else}{p.text}{/if}{/each}{/snippet}

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's. -->
<PageHead icon="code" title={words.heading} count={scripts.state === 'ready' ? rows.length : undefined} sentence={told ? sentence : undefined}>
  {#snippet actions()}
    <!-- THE ONE PRIMARY: an ink pill with its word, and on a phone the ink circle with the plus (SYSTEM §5). -->
    <Button weight="primary" href="/scripts/new" aria-label={words.newScript} data-circle><Icon name="plus" size="s" /><span class="new-word">{words.newScript}</span></Button>
  {/snippet}
</PageHead>
<div class="page">
  {#if scripts.state === 'waiting' || scripts.state === 'refused' || scripts.state === 'offline'}
    <ReadState state={scripts.state} refusal={scripts.refusal} onretry={scripts.reread} />
  {:else if rows.length === 0}
    <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt} />
  {:else}
    <ul class="cards">
      {#each rows as s (s.id)}
        {@const said = stateOf(s, now())}
        {@const recent = recentOf(s)}
        <li class="card">
          <Tile icon="code" title={s.title}>
            {#snippet actions()}
              <Button weight="bare" size="sm" href={`/scripts/${s.script}`} aria-label={shown.editOne(s.title)}>{shown.edit}<Icon name="arrow" size="s" /></Button>
            {/snippet}
            <p class="card-state" data-intent={said.tone}>
              {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
              {said.line}
            </p>

            <!-- ONE CELL A RECENT RUN, the ones that went through filled, and the line saying what starts it and how its
                 runs went. No chart when the history held none of its runs. -->
            {#if recent}<Segments total={recent.total} done={recent.ok} subject={shown.recentSubject} />{/if}
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
              {#each factsOf(s) as f (f.label)}
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
                      {#if r.say}<p class="run-say">{r.say}</p>{/if}
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
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* THE PAGE IS A CONTAINER, so the tiles take one column or two by the room the page has, not the window's width. */
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* ON A PHONE THE PRIMARY IS THE INK CIRCLE WITH THE PLUS: the word goes, and the button is 44 round. */
  @media (width < 640px) {
    .new-word {
      display: none;
    }

    :global(.head-actions .btn[data-circle]) {
      inline-size: var(--tap);
      padding: 0;
    }
  }

  /* ONE TILE A SCRIPT, one column up to 640 wide, and two side by side once the page has room for two (SCREENS,
     Scripts). A script is read, not scanned, and each tile holds its own chart. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 640px);
    gap: var(--inset);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @container (width >= 1100px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .card {
    display: grid;
    min-inline-size: 0;
  }

  .card-state,
  .card-fix {
    margin: 0;
    font-size: var(--t-base);
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
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE ONE LINE UNDER THE CHART that says what it means (SYSTEM §6). */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
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
    border-block-start: 1px solid var(--line);
  }

  .fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .fact dt {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    overflow-wrap: anywhere;
  }

  /* RUNS AND VERSIONS FOLD, each behind a chevron that turns when it opens. */
  .fold {
    color: var(--ink2);
    font-size: var(--t-sm);
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
    color: var(--dim);
    transition: rotate var(--d-state) var(--ease-out);
  }

  .fold[open] > .fold-head :global(.icon) {
    rotate: 90deg;
  }

  .fold-none {
    margin-block: var(--sp-1);
    margin-inline: 0;
    color: var(--dim);
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
    border-block-start: 1px solid var(--line);
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
    border-radius: var(--r-pill);
    background: var(--dim);
  }

  .run[data-tone='done'] .dot {
    background: var(--ink);
  }

  .run[data-tone='bad'] .dot {
    background: var(--danger);
  }

  .run[data-tone='warn'] .dot {
    background: var(--warn);
  }

  .run-outcome,
  .version-name {
    color: var(--ink);
    font-weight: 500;
  }

  .run-when,
  .version-now {
    color: var(--dim);
    font-variant-numeric: tabular-nums;
  }

  .run-say,
  .version-detail {
    margin: 0;
    padding-inline-start: calc(6px + var(--sp-2));
    color: var(--ink2);
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
    border-radius: var(--r-md);
    background: var(--s1);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
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
