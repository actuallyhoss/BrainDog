<!--
  A project's scheduled actions, under "Runs on" (`loop/research-scheduled-actions.md` §6.1 and §6.2).

  A LIST WITHOUT BOXES, in the the old tool feel: each action's name and this month's runs, what it does
  and how often with which key, and one calm sentence about where it stands. The project's own first;
  the ones for every project after, faintly, as the Keys, Tools and Skills beside them do.

  PAUSED IS THE ONE STATE WITH A PRESS. Resume sends `resumeAction`; the owner-only and recent-sign-in
  refusals offer Sign in again, as Settings, agents does, and resume once signed in. A held action says
  the Directory's sentence and points at usage. No red anywhere: paused is `warn`.

  Imported by the project page only, so nothing here reaches the entry chunk.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { TONES } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { afterResume, forProject, openActions, stateOf, whatOf, words, type ActionRow, type Source } from '$lib/record/actions.ts';
  import { signInFor } from '$lib/record/packs.ts';
  import { reprove } from '$lib/record/vault.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { closed, opened } from '../../../lib/ui/screen.svelte.ts';

  /* `null` lists every action, for Settings, ingest, and says so when there are none. */
  let { project }: { project: string | null } = $props();

  let from = $state<'reading' | 'ready' | 'absent' | 'refused'>('reading');
  let rows = $state<ActionRow[]>([]);
  let fix = $state('');
  let source: Source | null = null;
  let busy = $state(false);
  /** The last refused resume: which action, the record's sentence, and whether signing in again answers it. */
  let failed = $state<{ ingest: string; fix: string; signin: boolean } | null>(null);
  let reproving = $state(false);

  /* THE WALL CLOCK, AND ONLY IT. The sample's five actions were drawn at its own clock, 3 September, and said "Last ran"
     against that; with no sample every row is the record's, dated by the record, and read against now (DIRECTION 26). */
  const now = (): number => Date.now();

  async function load() {
    const at = opened();
    const out = await openActions((url, init) => fetch(url, init), apiBase());
    closed(out.first.ok || out.absent, at);
    source = out.source;
    if (out.absent) from = 'absent';
    else if (out.first.ok) {
      rows = out.first.value;
      from = 'ready';
    } else {
      fix = out.first.refusal.fix;
      from = 'refused';
    }
  }

  $effect(() => {
    void project;
    untrack(() => void load());
  });

  const split = $derived(forProject(rows, project));

  async function resume(row: ActionRow) {
    if (!source || busy) return;
    busy = true;
    failed = null;
    const at = opened();
    const out = await source.resume(row.ingest);
    closed(true, at);
    busy = false;
    if (!out.ok) {
      failed = { ingest: row.ingest, fix: out.refusal.fix, signin: signInFor(out.refusal) };
      return;
    }
    rows = afterResume(rows, row.ingest, new Date(now()).toISOString());
    toasts.push(words.resumed(row.ingest), { intent: 'good' });
    const again = await source.actions();
    if (again.ok) rows = again.value;
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it, and the same action is resumed again. */
  async function signInAgain() {
    const want = failed ? rows.find((r) => r.ingest === failed?.ingest) : undefined;
    if (reproving || !want) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await resume(want);
  }
</script>

{#snippet item(row: ActionRow, faint: boolean)}
  {@const said = stateOf(row, now())}
  <li class="action" data-faint={faint ? '' : undefined}>
    <div class="action-head">
      <span class="action-name">{row.ingest}</span>
      {#if faint}<span class="action-scope"><Icon name="globe" size="s" />{words.everywhere}</span>{/if}
      <span class="action-runs num">{words.runs(row.month.runs)}</span>
    </div>
    <p class="action-what">{whatOf(row)}</p>
    <p class="action-said" data-intent={said.tone}>
      {#if said.tone}<span class="glyph" role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span>{/if}
      {said.line}
    </p>
    {#if said.resume || said.usage || failed?.ingest === row.ingest}
      <div class="action-do">
        {#if said.reconnect}<Button weight="quiet" href={said.reconnect.href}>{said.reconnect.label}</Button>{/if}
        {#if said.resume}
          <Button weight="quiet" disabled={busy} aria-label="{words.resume} {row.ingest}" onclick={() => void resume(row)}>{words.resume}</Button>
        {/if}
        {#if said.usage}<Button weight="bare" href="/usage">{words.seeUsage}</Button>{/if}
        {#if failed?.ingest === row.ingest && failed.signin}
          <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
        {/if}
      </div>
      {#if failed?.ingest === row.ingest}<p class="action-fix" role="status">{failed.fix}</p>{/if}
    {/if}
  </li>
{/snippet}

{#if from === 'refused'}
  <section class="actions" aria-labelledby="actions-h">
    <h3 class="actions-h" id="actions-h">{words.heading}</h3>
    <p class="action-fix" role="status">{fix}</p>
  </section>
{:else if from === 'ready' && project === null && rows.length === 0}
  <Empty kind="no-data-yet" title={copy.noSources} body={copy.noSourcesWhy} agentPrompt={copy.ingestPrompt} />
{:else if from === 'ready' && split.own.length + split.everywhere.length > 0}
  <section class="actions" aria-labelledby="actions-h">
    <h3 class="actions-h" id="actions-h">{words.heading}</h3>
    <ul class="actions-list">
      {#each split.own as row (row.ingest)}{@render item(row, false)}{/each}
      {#each split.everywhere as row (row.ingest)}{@render item(row, true)}{/each}
    </ul>
  </section>
{/if}

<style>
  .actions {
    margin-block-start: var(--sp-4);
  }

  .actions-h {
    margin: 0 0 var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .actions-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* NO BOX AND NO RULE: the space between two actions is what separates them. */
  .action {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    padding-block: var(--sp-3);
  }

  .action-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2) var(--sp-3);
  }

  .action-name {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .action-scope {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .action-runs {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .action-what,
  .action-said,
  .action-fix {
    margin: 0;
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .action-what {
    color: var(--dim);
  }

  .action-said {
    color: var(--ink2);
  }

  .glyph {
    margin-inline-end: var(--sp-1);
  }

  /* FAINT, NOT HIDDEN: the ones for every project are read after the project's own. */
  .action[data-faint] .action-name,
  .action[data-faint] .action-said {
    color: var(--dim);
    font-weight: 500;
  }

  .action-do {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding-block-start: var(--sp-1);
  }
</style>
