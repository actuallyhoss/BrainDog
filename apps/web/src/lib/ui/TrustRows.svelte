<!--
  What each agent may do on its own: the ladder of trust, read back (`trust`, ENG-A12, DIRECTION §37 "a ladder per
  agent and kind").

  ONE TILE, ONE SENTENCE A LINE: an agent, a kind of change, and what the rung means, "Claude Code may add tasks and do
  it quietly since 3 Oct". It goes under the connected list in Settings > Agents, so who is connected and how far each
  is trusted are read together. The sentences and the rules are `record/trust.ts`, which the tests hold.

  NOTHING HERE CHANGES A RUNG. The ladder moves when an agent's change is kept, when the owner answers an offer and when
  a change is undone, so this is a reading and has no control.

  ONLY THE OWNER SEES IT. For anyone the record refuses, on the sample, and on a host built before the call, nothing is
  drawn. With no agent connected the tile says so in one sentence.

  A KIND PUT BACK TO ASKING CARRIES THE WORDS, never the colour alone: "Put back" in the deeper red, then why, as the
  record worded it.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type TrustStanding } from '@braindog/client';
  import { readTrust, trustLines, words } from '$lib/record/trust.ts';
  import Tile from '$lib/ui/Tile.svelte';

  let standing = $state<TrustStanding | null>(null);

  const lines = $derived(standing ? trustLines(standing, Date.now()) : []);

  onMount(() => {
    if (!page.data.live) return;
    void readTrust(createClient({ base: apiBase() })).then((out) => {
      standing = out;
    });
  });
</script>

{#if standing}
  <Tile icon="vault" title={words.title} data-part="trust-rows">
    {#if lines.length === 0}
      <p class="trust-empty">{words.empty}</p>
    {:else}
      <ul class="trust-lines">
        {#each lines as l (l.key)}
          <li class="trust-line">
            <!-- `dir="auto"`: the name is the owner's and the list's name is too, in whatever script they chose. -->
            <span class="trust-said" dir="auto">{l.text}</span>
            {#if l.back}
              <span class="trust-why"><span class="trust-back">{words.backMark}</span>{#if l.why}<span dir="auto">{l.why}</span>{/if}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Tile>
{/if}

<style>
  /* THE LINES ARE THE TILE'S BODY, straight on its fill with a hairline between two, as the connected list above. */
  .trust-lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .trust-line {
    display: grid;
    gap: 2px;
    align-content: center;
    min-block-size: var(--row-h);
    padding-block: var(--sp-2);
  }

  .trust-line + .trust-line {
    border-block-start: 1px solid var(--line);
  }

  /* A NAME MAY BE ONE LONG WORD, and it breaks rather than pushing the line past the edge at 320. */
  .trust-said {
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .trust-why {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 22px;
  }

  /* THE WORD CARRIES IT AND THE RED AGREES. No pill and no fill: a word in the line. */
  .trust-back {
    color: var(--danger-text);
    font-weight: 500;
  }

  .trust-empty {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 22px;
  }
</style>
