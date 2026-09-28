<!--
  Scripts: `/scripts`, every installed script and where it stands (`loop/finish/shell.md` SCR-2).

  ONE CARD EACH, ONE COLUMN AT EVERY WIDTH. A script is read, not scanned: its name and one sentence of where it stands,
  then what starts it, then the facts a person checks before trusting it (how close it is to pausing, this month's
  runs, and what it may read, write, fetch and open). A table would cut the reach to a width it cannot fit on a phone.

  PAUSED IS THE ONE STATE WITH A PRESS, as it is on the scheduled actions under "Runs on" (`Actions.svelte`). Resume
  sends `resumeScript`; the owner-only and recent-sign-in refusals offer Sign in again and resume once signed in. A
  paused script is `warn` and a refused last run `bad`, each with its glyph, so the colour never stands alone.

  RUNS, LOGS AND VERSIONS FOLD. They are what somebody opens after reading the state line, so each card keeps them
  under a disclosure and the list stays a list. The log is only there when the record handed it over: `logOf` gives it
  to the owner who reads every list the run touched, and `--redacted--` to everybody else, which draws as no log.
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
  import ReadState from '$lib/ui/ReadState.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';

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
    const at = opened();
    const out = await resumeScript(apiBase(page.url), row.script);
    closed(true, at);
    busy = false;
    if (!out.ok) {
      const refusal = 'refusal' in out ? out.refusal : { code: 'CONFLICT', fix: copy.readRefused };
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

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1` and a refusal reads as this page's. -->
<PageHead icon="code" title={words.heading} count={scripts.state === 'ready' ? rows.length : undefined} />
<div class="page">
  {#if scripts.state === 'waiting' || scripts.state === 'refused' || scripts.state === 'offline'}
    <ReadState state={scripts.state} refusal={scripts.refusal} onretry={scripts.reread} />
  {:else if rows.length === 0}
    <Empty kind="no-data-yet" title={words.none} body={words.noneWhy} {agentPrompt} />
  {:else}
    <ul class="cards">
      {#each rows as s (s.id)}
        {@const said = stateOf(s, now())}
        <li class="card">
          <h2 class="card-title">{s.title}</h2>
          <p class="card-state" data-intent={said.tone}>
            {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
            {said.line}
          </p>
          <p class="card-starts">{startsBy(s)}</p>

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

          <dl class="facts">
            {#each factsOf(s) as f (f.label)}
              <div class="fact">
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            {/each}
          </dl>

          <details class="fold">
            <summary class="fold-head tap">{words.recent}</summary>
            {#if s.recent.length === 0}
              <p class="fold-none">{words.noRuns}</p>
            {:else}
              <ol class="runs">
                {#each s.recent as r (r.id)}
                  <li class="run">
                    <p class="run-line">
                      <span class="run-outcome" data-outcome={r.outcome}>{outcomeOf(r.outcome)}</span>
                      <span class="run-when">{since(r.at, now())}{#if r.version !== null}, {words.version(r.version).toLowerCase()}{/if}</span>
                    </p>
                    {#if r.say}<p class="run-say">{r.say}</p>{/if}
                    {#if r.log !== null}
                      <details class="run-log">
                        <summary class="run-log-head tap">{words.showLog(since(r.at, now()))}</summary>
                        <pre class="log">{r.log}</pre>
                      </details>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </details>

          <details class="fold">
            <summary class="fold-head tap">{words.versions}</summary>
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
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 820px;
  }

  /* ONE COLUMN AT EVERY WIDTH, with a hairline between cards and nothing round the list (DESIGN-SYSTEM 4.4). */
  .cards {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block: var(--sp-4);
    min-inline-size: 0;
  }

  .card + .card {
    border-block-start: 1px solid var(--line-soft);
  }

  .card-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .card-state,
  .card-starts,
  .card-fix {
    margin: 0;
    font-size: var(--t-ui);
    max-inline-size: var(--measure);
  }

  .card-state {
    color: var(--ink2);
  }

  .card-state[data-intent='warn'] .glyph {
    color: var(--warn);
  }

  .card-state[data-intent='bad'] .glyph {
    color: var(--danger);
  }

  .glyph {
    margin-inline-end: var(--sp-1);
  }

  .card-starts,
  .card-fix {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .card-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  /* LABEL ABOVE VALUE ON A PHONE, a label column at 16ch from 640 up (design-brief §5). An origin or a list name wraps
     rather than pushing the page sideways at 320. */
  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-2);
    margin: var(--sp-1) 0 0;
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

  .fold {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A 44PX TARGET UNDER A THUMB, and the word stays where it reads (`.tap` grows the hit box, not the text). */
  .fold-head,
  .run-log-head {
    display: flex;
    align-items: center;
    inline-size: fit-content;
    min-block-size: var(--ctl-h-sm);
    cursor: pointer;
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
    gap: var(--sp-3);
    margin-block: var(--sp-2) 0;
    margin-inline: 0;
    padding: 0;
    list-style: none;
  }

  .run-line,
  .version-line {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    margin: 0;
  }

  .run-outcome,
  .version-name {
    color: var(--ink);
    font-weight: 500;
  }

  .run-when,
  .version-now {
    color: var(--dim);
  }

  .run-say,
  .version-detail {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
    max-inline-size: var(--measure);
  }

  /* THE LOG IS WHAT THE SCRIPT PRINTED, so it keeps its lines and its monospace, and a long line wraps inside the card
     rather than scrolling the page. */
  .log {
    margin-block: var(--sp-1) 0;
    margin-inline: 0;
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
</style>
