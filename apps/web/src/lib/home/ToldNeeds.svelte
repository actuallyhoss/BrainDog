<!--
  What agents asked him back, of what he told them (agents and MCP plan §2.3, §7.2: "Needs you, which counts in Needs you
  and Today"), as one tile on the Needs you page over the questions: one row each, "Claude needs you on “Merge wave 1”",
  the agent's question under it, and Answer, which opens the agents, where the thread and the box to tell it are.

  FROM THE SHELL'S READ (`told-now.svelte.ts`), so it says the rows the badge counts and asks the record nothing. Nothing
  waiting draws nothing. Red only for what needs him: the Answer word.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { at } from '$lib/at.ts';
  import { heldPage } from '$lib/nav/rail.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import type { ToldNeed } from '$lib/record/told-live.ts';

  let { rows }: { rows: readonly ToldNeed[] } = $props();

  const words = { title: 'Agents asking you', answer: 'Answer' } as const;

  /* ANSWERED ON THE AGENTS PAGE, WHERE THE RECORD HOLDS IT (`heldPage`): without the agents add-on there is no thread to
     open, so the row says who asks and what, and no Answer lands on a page that is not there. */
  const answerAt = $derived(heldPage((page.data as { pages?: readonly string[] } | undefined)?.pages, 'agents'));
</script>

{#if rows.length > 0}
  <Tile icon="session" title={words.title} count={rows.length} data-told-needs>
    <ul class="tn-list">
      {#each rows as r (r.key)}
        <li class="tn-row">
          <span class="tn-words"
            ><span class="tn-what" dir="auto">{r.line}</span>{#if r.reply}<span class="tn-reply" dir="auto">{r.reply}</span>{/if}</span
          >
          {#if answerAt}<a class="tn-go tap" href={at(answerAt)}>{words.answer}</a>{/if}
        </li>
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
  }

  .tn-row + .tn-row {
    border-block-start: 1px solid var(--rule);
  }

  .tn-row:first-child {
    padding-block-start: 0;
  }

  .tn-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .tn-what {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 22px;
  }

  .tn-reply {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .tn-go {
    display: inline-flex;
    align-items: center;
    min-block-size: 36px;
    color: var(--red);
    font-size: var(--fs-body);
    font-weight: 500;
    text-decoration: none;
  }

  @media (width < 900px) {
    .tn-go {
      min-block-size: 44px;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .tn-go:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
</style>
