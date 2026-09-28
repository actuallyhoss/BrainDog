<!--
  Who used one key or one tool: the ten runs that used it last, the newest first, each with its agent, its machine,
  how many times and when (`usedBy`, agents C7).

  WHY A ROW PAGE SAYS IT: the record signs every open of a key and every use of a tool with the run that asked, and a
  key's row said what it opens and nothing about who opened it. The question a person has about a key or a tool is
  which agent is using it, so the answer is drawn where the row is (`loop/finish/agents.md` AGT-10).

  A LIST WITHOUT BOXES, as "Runs on" is: the run's name links to its page, and the rest is one quiet line under it.
  A refusal draws nothing, since `usedBy` answers a row the reader cannot read as one that is not there, and a row
  nobody used says so in one sentence.

  Mounted by a key's or a tool's row page, which hands over the row as a person says it, `credentials#3`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { runPath, type UsedByRun } from '$lib/record/vault.ts';
  import { closed, opened } from '../../ui/screen.svelte.ts';

  let { spoken }: { spoken: string } = $props();

  const words = {
    heading: 'Who used it',
    none: 'No run has used this yet. An agent that opens it is named here.',
    count: (n: number) => (n === 1 ? 'once' : `${n.toLocaleString('en-GB')} times`),
  };

  let runs = $state<UsedByRun[] | null>(null);

  async function load(which: string) {
    const t = opened();
    const out = await createClient({ base: apiBase() }).usedBy({ spoken: which });
    closed(out.ok, t);
    runs = out.ok ? out.value.runs : null;
  }

  $effect(() => {
    const which = spoken;
    untrack(() => void load(which));
  });
</script>

{#if runs}
  <section class="used" aria-labelledby="used-h">
    <h3 class="used-h" id="used-h">{words.heading}</h3>
    {#if runs.length === 0}
      <p class="used-none">{words.none}</p>
    {:else}
      <ul class="used-list">
        {#each runs as u (u.run)}
          {@const href = runPath(u.run)}
          <li class="used-row">
            <span class="used-run">{#if href}<a href={at(href)}>{u.run}</a>{:else}{u.run}{/if}{#if u.agent}{' '}({u.agent}){/if}</span>
            <span class="used-what">{[u.machine, words.count(u.count), since(u.at, Date.now())].filter(Boolean).join(' · ')}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .used {
    margin-block-start: var(--sp-4);
  }

  .used-h {
    margin: 0 0 var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .used-none {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .used-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* NAME, THEN WHERE AND HOW OFTEN: one line on a wide screen, two on a phone, and nothing scrolls sideways. */
  .used-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    min-width: 0;
    padding-block: var(--sp-2);
  }

  .used-run {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .used-run a {
    color: inherit;
  }

  .used-what {
    color: var(--dim);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }
</style>
