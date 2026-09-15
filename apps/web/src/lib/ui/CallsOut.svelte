<!--
  What an install or update would call, inside the diff's definition list (`research-scheduled-actions.md` §5).

  A `dt` AND A `dd`, NOT A WRAPPER, so it drops into the Packs screen's diff and Settings' plan alike. One
  line per action, then the runs a month they add against the hosted allowance, or with no limit on a
  self-host. Nothing when the pack calls nothing, because an empty section teaches people to skip it.
-->
<script lang="ts">
  import { callLine, estimateOf, installWords, type CallOut } from '$lib/record/actions.ts';

  let { calls, hosted }: { calls: readonly CallOut[]; hosted: boolean } = $props();

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
        </li>
      {/each}
    </ul>
    {#if estimate}<p class="calls-estimate">{estimate}</p>{/if}
  </dd>
{/if}

<style>
  .calls-h {
    color: var(--dim);
    font-weight: 600;
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
  }

  .calls-line {
    color: var(--ink2);
  }

  .calls-estimate {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
  }
</style>
