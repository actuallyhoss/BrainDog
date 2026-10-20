<!--
  Working now: the agents working this minute, each with its project and what it says it is doing (Today as the desk).

  FROM `boot`'S ANSWER, so the count is the rail's and the header's. A project the desk draws a card for lends its colour
  to the dot before its name. Four are named and the rest are counted. NOTHING IS DRAWN FOR NOBODY: no agents, no tile.
-->
<script lang="ts">
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { WORKING_MOST, type WorkingRow } from './desk.ts';

  let { rows }: { rows: readonly WorkingRow[] } = $props();

  const words = {
    title: 'Working now',
    open: 'All agents',
    more: (n: number) => `and ${n} more`,
    quiet: 'gone quiet',
  } as const;

  const shown = $derived(rows.slice(0, WORKING_MOST));
</script>

{#if rows.length > 0}
  <Tile icon="session" tone="live" title={words.title} count={rows.length} href="/p/agents" hrefLabel={words.open} data-working>
    <ol class="runs">
      {#each shown as r (r.key)}
        <li class="run">
          <span class="r-face"><AgentFace agent={r.agent} run={r.run} live={r.live} size="s" /></span>
          <span class="r-who">
            <b class="r-name">{r.agent}</b>
            {#if r.project}
              <span class="r-project"><span class="r-dot" data-hued={r.hue === null ? undefined : ''} style={r.hue === null ? undefined : `--hue:${r.hue}`} aria-hidden="true"></span>{r.project}</span>
            {/if}
          </span>
          {#if r.doing}<span class="r-doing" dir="auto">{r.doing}</span>{/if}
          <span class="r-time num" data-live={r.live === 'working' && r.began ? '' : undefined}>{r.live === 'quiet' ? words.quiet : r.began}</span>
        </li>
      {/each}
    </ol>
    {#if rows.length > shown.length}<p class="r-more">{words.more(rows.length - shown.length)}</p>{/if}
  </Tile>
{/if}

<style>
  .runs {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE AGENT, TWO LINES, AT EVERY WIDTH (Today polish 4): the face, who and the project, and how long at that line's
     end; what it is on under it in the second ink, the whole width of the words, so a phone does not wrap it. */
  .run {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'face who time'
      'face doing doing';
    align-items: baseline;
    column-gap: var(--sp-3);
    row-gap: 2px;
    padding-block: var(--sp-3);
  }

  .run:first-child {
    padding-block-start: 0;
  }

  .run:last-child {
    padding-block-end: 0;
  }

  .run + .run {
    border-block-start: 1px solid var(--rule);
  }

  .r-face {
    grid-area: face;
    align-self: start;
    display: flex;
    padding-block-start: 2px;
  }

  .r-who {
    grid-area: who;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    min-inline-size: 0;
  }

  .r-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
  }

  .r-project {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .r-dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }

  .r-dot[data-hued] {
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .r-doing {
    grid-area: doing;
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .r-time {
    grid-area: time;
    justify-self: end;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    white-space: nowrap;
  }

  /* WORKING THIS MINUTE: a still live dot before how long (frame F22: one pulse on a change, never a loop). */
  .r-time[data-live]::before {
    content: '';
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  .r-more {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
