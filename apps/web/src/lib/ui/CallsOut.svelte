<!--
  What an install, an update or a proposal would call, inside a definition list.

  A `dt` AND A `dd`, NOT A WRAPPER, so it drops into the Packs screen's diff, Settings' plan and the gate alike. One
  line per action, then the runs a month they add against the hosted allowance, or with no limit on a
  self-host. Nothing when the pack calls nothing, because an empty section teaches people to skip it.

  `note` IS WHAT THE PRESS BELOW IT DOES, said once under the lines: the one approval that arms them.
-->
<script lang="ts">
  import { callLine, estimateOf, installWords, type CallOut } from '$lib/record/actions.ts';

  let { calls, hosted, note }: { calls: readonly CallOut[]; hosted: boolean; note?: string } = $props();

  const estimate = $derived(estimateOf(calls, hosted));
</script>

{#if calls.length > 0}
  <dt class="calls-h">{installWords.heading}</dt>
  <dd class="calls">
    <ul class="calls-list">
      {#each calls as c (c.ingest)}
        <li>
          <span class="calls-name">{c.ingest}</span>
          <span class="calls-line">{callLine(c)}</span>
          {#if c.note}<span class="calls-note">{c.note}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if estimate}<p class="calls-estimate">{estimate}</p>{/if}
    {#if note}<p class="calls-estimate">{note}</p>{/if}
  </dd>
{/if}

<style>
  /* THE HEADING AT THE META STEP IN THE SECOND INK, each call a line with its service in ink, and the estimate and the
     note under them in the quiet ink. A caller that heads its tile with the same words hides this one
     from sight and keeps it for a screen reader, so the list is never nameless. */
  .calls-h {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .calls {
    margin: 0;
    min-inline-size: 0;
  }

  .calls-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .calls-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    overflow-wrap: anywhere;
  }

  .calls-name {
    color: var(--ink);
    font-weight: 500;
  }

  .calls-line {
    color: var(--ink2);
    white-space: pre-line;
  }

  .calls-note {
    flex-basis: 100%;
    color: var(--dim);
  }

  .calls-estimate {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
