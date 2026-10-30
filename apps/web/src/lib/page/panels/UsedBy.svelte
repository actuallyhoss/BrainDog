<!--
  Who used one key or one tool: the ten runs that used it last, the newest first, each with its agent, its machine,
  how many times and when (`usedBy`).

  WHY A ROW PAGE SAYS IT: the record signs every open of a key and every use of a tool with the run that asked, and a
  key's row said what it opens and nothing about who opened it. The question a person has about a key or a tool is
  which agent is using it, so the answer is drawn where the row is.

  A LIST WITHOUT BOXES, as "Runs on" is: the run's name links to its page, and the rest is one quiet line under it.
  A refusal draws nothing, since `usedBy` answers a row the reader cannot read as one that is not there, and a row
  nobody used says so in one sentence.

  Mounted by a key's or a tool's row page, which hands over the row's spoken id, `credentials#3`, to ask with; it is never drawn.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { agentNamed, since } from 'braindog-render';
  import { apiBase, at } from '$lib/at.ts';
  import { runPath, type UsedByRun } from '$lib/record/keychain.ts';
  import { machineSaid } from '$lib/record/machine-name.ts';
  import { closed, opened } from '../../ui/screen.svelte.ts';

  let { spoken }: { spoken: string } = $props();

  const words = {
    heading: 'Who used it',
    none: 'No run has used this yet. An agent that opens it is named here.',
    count: (n: number) => (n === 1 ? 'once' : `${n.toLocaleString('en-GB')} times`),
    anAgent: 'An agent',
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
          {@const who = agentNamed(u.agent ?? undefined) || words.anAgent}
          <li class="used-row">
            <!-- THE RUN BY ITS AGENT AND ITS MACHINE BY ITS NAME, never "S42 (claude)" over "kiln-mbp": the agent's name opens
                 the run, and the machine is said as every screen says one (`machineSaid`). -->
            <span class="used-run">{#if href}<a href={at(href)}>{who}</a>{:else}{who}{/if}</span>
            <span class="used-what">{[u.machine ? machineSaid(u.machine, (runs ?? []).map((r) => r.machine ?? '').filter(Boolean)) : null, words.count(u.count), since(u.at, Date.now())].filter(Boolean).join(' · ')}</span>
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
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .used-none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
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
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .used-run a {
    color: inherit;
  }

  .used-what {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }
</style>
