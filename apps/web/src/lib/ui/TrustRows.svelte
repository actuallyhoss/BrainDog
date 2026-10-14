<!--
  What each agent may do on its own: the ladder of trust, read back (`trust`, ENG-A12, DIRECTION §37 "a ladder per
  agent and kind").

  ONE TILE, ONE SENTENCE A LINE: an agent, a kind of change, and what the rung means, "Claude Code may add tasks and do
  it quietly since 3 Oct". It goes under the connected list in Settings > Agents, so who is connected and how far each
  is trusted are read together. The sentences and the rules are `record/trust.ts`, which the tests hold.

  ONE CONTROL, "ASK AGAIN", beside each kind an agent does on its own: the owner's own way down (`trustTakeBack`, "undo"
  D37.167). It puts that kind back to asking and reads the ladder again, so the line says "Put back" and why. Nothing
  here climbs a rung: that is the owner's answer to an offer, on Decide. Under the lines, two say what no rung reaches.

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
  import { readTrust, takeBack, trustLines, words, type TrustLine } from '$lib/record/trust.ts';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';

  let standing = $state<TrustStanding | null>(null);
  /** The line whose press is on its way, so it is not sent twice. */
  let pressing = $state<string | null>(null);
  /** The record's sentence for a press that did not land, beside the line it was for. */
  let failed = $state<{ key: string; fix: string } | null>(null);

  const lines = $derived(standing ? trustLines(standing, Date.now()) : []);

  const client = () => createClient({ base: apiBase() });

  /* REREAD AFTER THE PRESS, not patched in place: the record says the new day and why, and every other line as it is. */
  async function askAgain(l: TrustLine): Promise<void> {
    if (l.take === null || pressing !== null) return;
    pressing = l.key;
    failed = null;
    const out = await takeBack(client(), l.take);
    if (out.ok) {
      const again = await readTrust(client());
      if (again) standing = again;
    } else failed = { key: l.key, fix: out.fix };
    pressing = null;
  }

  onMount(() => {
    if (!page.data.live) return;
    void readTrust(client()).then((out) => {
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
            <div class="trust-text">
              <!-- `dir="auto"`: the name is the owner's and the list's name is too, in whatever script they chose. -->
              <span class="trust-said" dir="auto">{l.text}</span>
              {#if l.back}
                <span class="trust-why"><span class="trust-back">{words.backMark}</span>{#if l.why}<span dir="auto">{l.why}</span>{/if}</span>
              {/if}
              {#if failed?.key === l.key}
                <span class="trust-why" role="status" dir="auto">{failed.fix}</span>
              {/if}
            </div>
            {#if l.take}
              <!-- The label says the verb and the line says what it is for, so a screen reader hears both. -->
              <Button size="sm" disabled={pressing !== null} aria-label={`${words.askAgain}: ${l.text}`} onclick={() => void askAgain(l)}>{words.askAgain}</Button>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="trust-floors">
        <p class="trust-floor">{words.asksFirst}</p>
        <p class="trust-floor">{words.alwaysAsks}</p>
      </div>
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

  /* THE BUTTON SITS AT THE LINE'S END, and wraps under the words when a narrow screen has no room for both. */
  .trust-line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-3);
    align-items: center;
    justify-content: space-between;
    min-block-size: var(--row-h);
    padding-block: var(--sp-2);
  }

  .trust-text {
    display: grid;
    flex: 1 1 16rem;
    gap: 2px;
    min-inline-size: 0;
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

  /* WHAT NO RUNG REACHES, quieter than the lines and under them, a sentence each. */
  .trust-floors {
    display: grid;
    gap: 2px;
    margin-block-start: var(--sp-3);
  }

  .trust-floor {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 22px;
  }

  .trust-empty {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 22px;
  }
</style>
