<!--
  Who is running now, in the panel: one short row each, the ones at work first, pressed to open the run. Nothing at all
  when nothing runs. No heading and no count: it is there to be glanced at.

  LIVE THROUGH THE VERSION THE TAB ALREADY POLLS (`live.version`): a run's doing line moving is a write, which moves it.
  The time since it was heard ticks in the tab and asks nothing.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { live } from '../data/live.svelte.ts';
  import { agentsNow, isQuietNow, ordered, readAgents, sinceSaid } from './agents-now.svelte.ts';

  let { base, onleave }: { base: string; onleave?: (() => void) | undefined } = $props();

  /** Three rows, then the Agents page, which holds the rest and everything else about them. */
  const MOST = 3;
  const words = {
    label: 'Agents running now',
    between: 'Between steps',
    more: 'All agents',
    quiet: (who: string) => `${who} has gone quiet`,
    working: (who: string) => `${who} is working`,
  } as const;

  let now = $state(Date.now());
  $effect(() => {
    void live.version;
    void readAgents(base);
  });
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  const all = $derived(ordered(agentsNow.rows, now));
  const shown = $derived(all.slice(0, MOST));
</script>

{#if shown.length > 0}
  <ul class="an" aria-label={words.label}>
    {#each shown as r (r.run)}
      {@const quiet = isQuietNow(r, now)}
      <li>
        <a class="an-row tap" href={at(`/r/session/${r.seq}`)} title={quiet ? words.quiet(r.who) : words.working(r.who)} data-quiet={quiet ? '' : undefined} onclick={() => onleave?.()}>
          <span class="an-dot" aria-hidden="true"></span>
          <span class="an-where" dir="auto">{r.project ?? r.who}</span>
          <span class="an-doing" dir="auto">{r.doing ?? words.between}</span>
          <span class="an-when">{sinceSaid(r, now)}</span>
        </a>
      </li>
    {/each}
    {#if all.length > MOST}
      <li><a class="an-more tap" href={at('/p/agents')} onclick={() => onleave?.()}>{words.more}</a></li>
    {/if}
  </ul>
{/if}

<style>
  .an {
    display: grid;
    gap: 0;
    margin: 0 0 var(--sp-2);
    padding: 0;
    list-style: none;
  }

  .an-row {
    display: grid;
    grid-template-columns: auto minmax(0, max-content) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-decoration: none;
  }

  @media (pointer: coarse) {
    .an-row {
      min-block-size: var(--tap);
    }
  }

  .an-dot {
    inline-size: 7px;
    block-size: 7px;
    border-radius: var(--r-round);
    background: var(--live);
  }

  .an-row[data-quiet] .an-dot {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--ink-3);
  }

  .an-where {
    max-inline-size: 16ch;
    overflow: hidden;
    color: var(--ink);
    font-weight: var(--fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .an-doing {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .an-when {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .an-more {
    display: inline-flex;
    align-items: center;
    min-block-size: 28px;
    padding-inline: calc(var(--sp-2) + 7px + var(--sp-2));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-decoration: none;
  }

  @media (hover: hover) {
    .an-row:hover {
      background: var(--hover);
    }

    .an-more:hover {
      color: var(--ink);
    }
  }
</style>
