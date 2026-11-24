<!--
  What agents asked him back, of what he told them (agents and MCP plan §2.3, §7.2: "Needs you, which counts in Needs you
  and Today"), as one tile on the Needs you page over the questions: one card each, the question on one line in the
  agent's words, who asks and on which project, and the answer in place (`AgentAsk`): Yes and No for a yes or no
  question, a box for anything else. The thread it lands in is a press away on the Agents page.

  FROM THE SHELL'S READ (`told-now.svelte.ts`), so it says the rows the badge counts and asks the record nothing. Nothing
  waiting draws nothing.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { heldPage } from '$lib/nav/rail.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import AgentAsk from '$lib/agents/AgentAsk.svelte';
  import type { ToldNeed } from '$lib/record/told-live.ts';

  let { rows }: { rows: readonly ToldNeed[] } = $props();

  const words = { title: 'Agents asking you' } as const;

  /* THE THREAD IS ON THE AGENTS PAGE, WHERE THE RECORD HOLDS IT (`heldPage`); without the agents add-on the card still
     answers, and links nowhere. */
  const threadAt = $derived(heldPage((page.data as { pages?: readonly string[] } | undefined)?.pages, 'agents'));
</script>

{#if rows.length > 0}
  <Tile icon="session" title={words.title} count={rows.length} data-told-needs>
    <ul class="tn-list">
      {#each rows as r (r.key)}
        <li class="tn-row"><AgentAsk need={r} thread={threadAt} /></li>
      {/each}
    </ul>
  </Tile>
{/if}

<style>
  .tn-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tn-row {
    padding-block: var(--sp-3);
    min-inline-size: 0;
  }

  .tn-row + .tn-row {
    border-block-start: 1px solid var(--rule);
  }

  .tn-row:first-child {
    padding-block-start: 0;
  }
</style>
