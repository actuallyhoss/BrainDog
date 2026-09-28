<!--
  The hub's rows (`loop/finish/shell.md` EDT-3): one list shape for automations, scheduled actions, scripts and runs.

  TWO LINES EACH, AS THE AUTOMATIONS LIST ALWAYS WAS: the name and what it is, then where it stands. One shape for all
  four because they sit one tab apart, and a failed script and a failed automation should not be two different reads.
  DESIGN-SYSTEM 4.4: a subject and a line of detail, `--line-soft` between rows and nothing round the list.

  A DOT FOR WHAT NEEDS A LOOK, AND ONLY THAT, leading the sentence that says it, so the dot never stands alone
  (DESIGN-SYSTEM 1.2).
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import type { HubRow } from './hub.ts';

  let { rows }: { rows: readonly HubRow[] } = $props();
</script>

{#snippet body(r: HubRow)}
  <span class="head">
    <span class="name">{r.name}</span>
    {#if r.what}
      <span class="sep" aria-hidden="true">·</span>
      <span class="what">{r.what}</span>
    {/if}
  </span>
  <span class="said" data-dot={r.dot ?? undefined}>{r.said}</span>
{/snippet}

<ul class="rows">
  {#each rows as r (r.key)}
    <li>
      {#if r.path}
        <a class="row tap" href={at(r.path)}>{@render body(r)}</a>
      {:else}
        <div class="row">{@render body(r)}</div>
      {/if}
      {#if r.fix}
        <a class="fix tap" href={at(r.fix.path)}>{r.fix.label}</a>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  /* THE HOVER WASH BLEEDS 8PX PAST THE GUTTER AND THE TEXT DOES NOT (DESIGN-SYSTEM 3.1), so the names sit on the
     heading's edge. */
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    margin-inline: calc(-1 * var(--sp-2));
    padding: var(--sp-3) var(--sp-2);
    border-radius: var(--r-sm);
    color: inherit;
    text-decoration: none;
  }

  a.row:hover {
    background: var(--hover-wash);
  }

  /* THE FIRST LINE GIVES WAY, what-it-is first and down to a few words, so on a phone the name keeps its room. */
  .head {
    display: flex;
    gap: var(--sp-2);
    min-inline-size: 0;
    align-items: baseline;
  }

  .name,
  .what {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    flex: 0 1 auto;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .what {
    flex: 0 1 auto;
    min-inline-size: 6ch;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .sep {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .said {
    color: var(--dim);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .said[data-dot]::before {
    content: '';
    display: inline-block;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: var(--sp-1);
    border-radius: var(--r-pill);
    background: var(--faint);
    vertical-align: middle;
  }

  .said[data-dot='bad']::before {
    background: var(--danger-fill);
  }

  /* THE THEME HAS NO WARNING HUE, and a paused thing is not a failure, so it takes the ink: darker than off, not red. */
  .said[data-dot='warn']::before {
    background: var(--ink);
  }

  .fix {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
    margin-block-start: calc(-1 * var(--sp-2));
    color: var(--ink);
    font-size: var(--t-sm);
  }
</style>
