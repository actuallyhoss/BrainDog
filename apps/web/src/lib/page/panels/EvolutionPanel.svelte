<!--
  How the brain changed, as one timeline (`panel: evolution`): week by week, newest first, each learning that arrived
  with the failure that taught it, each skill that took a new version with its text before and after, and each learning
  that faded, marked on the day it faded. A learning about to fade says so on its line.

  THE RECORD'S OWN READS: the learnings and skills lists (`list`) and each changed skill's history (`history`), read as
  any reader of those lists reads them, so a person who cannot open the learnings sees no timeline. What each line says
  is `$lib/agents/evolution.ts`. With nothing in six months the tile says so in one line.
-->
<script lang="ts">
  /* `Diff` is drawn here outside a declared block, so its kind's sheet comes with it (`kinds/diff.css`). */
  import '@braindog/skin/kinds/diff.css';
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { diffPlan, diffRows, type Block } from 'braindog-render';
  import { Diff } from 'braindog-render/svelte';
  import { apiBase, at } from '$lib/at.ts';
  import {
    evolution,
    evolutionLists,
    evolutionWords as words,
    skillsToRead,
    versionsOf,
    WINDOW_DAYS,
    type EvolutionWeek,
    type HistoryLine,
    type LearningRow,
    type SkillRow,
    type Version,
  } from '$lib/agents/evolution.ts';

  let { owner: _owner = false }: { owner?: boolean } = $props();

  let weeks = $state.raw<EvolutionWeek[]>([]);
  let read = $state(false);
  let refused = $state(false);

  /* THE FADED ONES BY THE LIST'S OWN RULE (`fade:` on its declaration, `FADED` in the agents add-on), read apart from
     the newest, since a learning written a year ago may have faded last week. */
  const fadedBy = (fade: { field: string; after: string }) => ({
    all: [
      { field: 'state', is: 'active' },
      { any: [{ field: fade.field, before: `-${fade.after}` }, { all: [{ field: fade.field, empty: true }, { field: 'created_at', before: `-${fade.after}` }] }] },
    ],
  });

  /* THE LISTS, READ OFF THE RECORD'S DECLARATIONS (`evolutionLists`), so a record whose learnings go by another id
     still has its timeline. */
  let lists = $state.raw<{ learnings: string; skills: string | null } | null>(null);

  const rowsOf = (out: unknown): unknown[] => {
    const a = out as { ok?: unknown; value?: { rows?: unknown } } | null;
    return a?.ok === true && Array.isArray(a.value?.rows) ? (a.value.rows as unknown[]) : [];
  };

  async function load(): Promise<void> {
    const client = createClient({ base: apiBase() });
    const said = (await client.call<{ lists?: unknown }>('schemas', { every: true }).catch(() => null)) as { ok?: unknown; value?: { lists?: unknown } } | null;
    const found = said?.ok === true ? evolutionLists(said.value?.lists) : null;
    if (found === null) {
      refused = true;
      read = true;
      return;
    }
    lists = found;
    const [recent, faded, skills] = await Promise.all([
      client.list({ register: found.learnings, where: `created_at after -${WINDOW_DAYS}d`, order: [{ field: 'created_at', dir: 'desc' }], limit: 200 }).catch(() => null),
      client.list({ register: found.learnings, where: fadedBy(found.fade), order: [{ field: 'created_at', dir: 'desc' }], limit: 200 }).catch(() => null),
      found.skills === null ? Promise.resolve(null) : client.list({ register: found.skills, limit: 200 }).catch(() => null),
    ]);
    if ((recent as { ok?: unknown } | null)?.ok !== true) {
      refused = true;
      read = true;
      return;
    }
    const learnings = new Map<string, LearningRow>();
    for (const r of [...rowsOf(recent), ...rowsOf(faded)] as (LearningRow & { id?: string })[]) learnings.set(r.id ?? String(r.seq), r);
    const skillRows = rowsOf(skills) as SkillRow[];
    const versions = new Map<number, readonly Version[]>();
    await Promise.all(
      skillsToRead(skillRows).map(async (s) => {
        const out = (found.skills === null ? null : await client.history(found.skills, s.seq!).catch(() => null)) as { ok?: unknown; value?: unknown } | null;
        if (out?.ok === true && Array.isArray(out.value)) versions.set(s.seq!, versionsOf(out.value as HistoryLine[], 'body'));
      }),
    );
    weeks = evolution([...learnings.values()], skillRows, versions, Date.now());
    read = true;
  }

  onMount(() => void load());

  const blockOf = (before: string, after: string): Block => ({
    type: 'block',
    kind: 'diff',
    rows: diffRows(before, after).map((line) => ({ cells: [line] })),
    raw: '',
    start: 0,
    end: 0,
  });

  /* THE ROW'S PATH IN THE APP, which the link renders through `at()`. */
  const learningPath = (seq: number | null): string | null => (seq === null || lists === null ? null : `/r/${lists.learnings}/${seq}`);
  const skillPath = (seq: number | null): string | null => (seq === null || !lists?.skills ? null : `/r/${lists.skills}/${seq}`);
</script>

{#if !read || refused}
  <!-- NOT READ YET, OR NOT A READER OF THE LEARNINGS: the tile is left out whole (`BlockSlot.svelte`'s rule). -->
  <span data-seen-none hidden aria-busy={!read ? 'true' : undefined}></span>
{:else if weeks.length === 0}
  <p class="evo-empty">{words.empty}</p>
{:else}
  <ol class="evo">
    {#each weeks as w (w.key)}
      <li class="evo-week">
        <h3 class="evo-when">{w.label}</h3>
        <ol class="evo-events">
          {#each w.events as e (e.key)}
            <li class="evo-event" data-kind={e.kind}>
              <span class="evo-dot" aria-hidden="true"></span>
              {#if e.kind === 'learned'}
                <p class="evo-what">
                  <span class="evo-tag">{words.arrived}</span>
                  {#if e.mark}<span class="evo-mark" data-faded={e.faded ? '' : undefined}>{e.mark}</span>{/if}
                </p>
                <p class="evo-title" dir="auto">
                  {#if learningPath(e.seq)}<a href={at(learningPath(e.seq) ?? '')}>{e.lesson}</a>{:else}{e.lesson}{/if}
                </p>
                {#if e.because}
                  <p class="evo-because" dir="auto"><span class="evo-label">{words.because}:</span> {e.because}</p>
                {/if}
                {#if e.topic || e.replaces}
                  <p class="evo-meta">
                    {#if e.topic}<span><span class="evo-label">{words.bearsOn}:</span> <span dir="auto">{e.topic}</span></span>{/if}
                    {#if e.replaces}<span>{words.replaces}</span>{/if}
                  </p>
                {/if}
              {:else if e.kind === 'faded'}
                <p class="evo-what"><span class="evo-mark" data-faded="">{words.faded}</span></p>
                <p class="evo-title evo-title-faded" dir="auto">
                  {#if learningPath(e.seq)}<a href={at(learningPath(e.seq) ?? '')}>{e.lesson}</a>{:else}{e.lesson}{/if}
                </p>
                <p class="evo-because">{words.fadedLine}</p>
              {:else}
                {@const plan = diffPlan(diffRows(e.before, e.after))}
                <p class="evo-what"><span class="evo-tag">{words.changed}</span><span class="evo-sub">{words.version(e.from, e.to)}</span></p>
                <p class="evo-title" dir="auto">
                  {#if skillPath(e.seq)}<a href={at(skillPath(e.seq) ?? '')}>{e.skill}</a>{:else}{e.skill}{/if}
                </p>
                <details class="evo-diff">
                  <summary>{words.showText} <span class="evo-sub">{plan.summary}</span></summary>
                  <Diff block={blockOf(e.before, e.after)} />
                </details>
              {/if}
            </li>
          {/each}
        </ol>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .evo,
  .evo-events {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A STEP UNDER THE TILE'S HEADING AND MORE AIR BETWEEN LEARNINGS (pages pass, 2 Nov): the week's date sat flush under
     "Over time", and each learning's three lines ran into the next one's tag 16px on. */
  .evo {
    padding-block-start: var(--sp-2);
  }

  .evo-week + .evo-week {
    margin-block-start: var(--sp-5);
  }

  .evo-when {
    margin: 0 0 var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* A LINE DOWN THE LEFT, A DOT AN EVENT: the timeline reads as one thread through the weeks. */
  .evo-event {
    position: relative;
    display: grid;
    gap: 2px;
    padding-block: var(--sp-3);
    padding-inline-start: var(--sp-4);
    border-inline-start: 1px solid var(--rule);
    min-inline-size: 0;
  }

  .evo-dot {
    position: absolute;
    inset-block-start: calc(var(--sp-3) + 6px);
    inset-inline-start: -4px;
    inline-size: 7px;
    block-size: 7px;
    border-radius: 50%;
    background: var(--ink-3);
  }

  .evo-event[data-kind='learned'] .evo-dot {
    background: var(--ink);
  }

  .evo-event[data-kind='changed'] .evo-dot {
    background: var(--red);
  }

  .evo-what,
  .evo-title,
  .evo-because,
  .evo-meta {
    margin: 0;
    max-inline-size: var(--measure);
    overflow-wrap: anywhere;
  }

  .evo-what {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .evo-tag {
    font-weight: 500;
  }

  .evo-sub {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE WORD CARRIES THE MARK, the colour only agrees: fading and faded are words on the line. */
  .evo-mark {
    color: var(--ink-2);
    font-weight: 500;
  }

  .evo-mark[data-faded] {
    color: var(--red);
  }

  .evo-title {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .evo-title a {
    color: inherit;
    text-decoration: none;
  }

  .evo-title a:hover,
  .evo-title a:focus-visible {
    text-decoration: underline;
  }

  .evo-title-faded {
    color: var(--ink-2);
  }

  .evo-because,
  .evo-meta {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .evo-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-3);
  }

  .evo-label {
    color: var(--ink-3);
  }

  .evo-diff summary {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 22px;
    cursor: pointer;
  }

  .evo-diff[open] summary {
    margin-block-end: var(--sp-2);
  }

  .evo-empty {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }
</style>
