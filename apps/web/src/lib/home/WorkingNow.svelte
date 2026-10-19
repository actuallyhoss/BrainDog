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
          <AgentFace agent={r.agent} run={r.run} live={r.live} size="s" />
          <span class="r-main">
            <span class="r-who">
              <b>{r.agent}</b>
              {#if r.project}
                <span class="r-project"><span class="r-dot" data-hued={r.hue === null ? undefined : ''} style={r.hue === null ? undefined : `--hue:${r.hue}`} aria-hidden="true"></span>{r.project}</span>
              {/if}
            </span>
            {#if r.doing}<span class="r-doing" dir="auto">{r.doing}</span>{/if}
          </span>
          <span class="r-time num">{r.live === 'quiet' ? words.quiet : r.began}</span>
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

  .run {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
    padding-block: var(--sp-2);
  }

  .run + .run {
    border-block-start: 1px solid var(--rule);
  }

  .r-main {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .r-who {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    font-size: var(--t-base);
  }

  .r-project {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .r-dot {
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--dim);
  }

  .r-dot[data-hued] {
    background: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .r-doing {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .r-time {
    color: var(--dim);
    font-size: var(--t-sm);
    white-space: nowrap;
  }

  .r-more {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
