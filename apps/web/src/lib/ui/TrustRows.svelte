<!--
  What each agent may do on its own: the ladder of trust, read back (`trust`, a ladder per
  agent and kind).

  ONE TILE, ONE SENTENCE A LINE: an agent, a kind of change, and what the rung means, "Claude Code may add tasks and do
  it quietly since 3 Oct". It goes under the connected list in Settings > Agents, so who is connected and how far each
  is trusted are read together. The sentences and the rules are `record/trust.ts`, which the tests hold.

  ONE CONTROL, "ASK AGAIN", beside each kind an agent does on its own: the owner's own way down (`trustTakeBack`, the
  ladder's undo). It puts that kind back to asking and reads the ladder again, so the line says "Put back" and why. Nothing
  here climbs a rung: that is the owner's answer to an offer, in Needs you. Under the lines, two say what no rung reaches.

  ONLY THE OWNER SEES IT. For anyone the record refuses, on the sample, and on a host built before the call, nothing is
  drawn. With no agent connected the tile says so in one sentence.

  A KIND PUT BACK TO ASKING CARRIES THE WORDS, never the colour alone: "Put back" in the deeper red, then why, as the
  record worded it.

  EACH AGENT'S ONE NUMBER: under its last line, the share of its suggestions you accepted unchanged over 90 days
  (`keptSentence`), the same number the Agents page draws with its kinds.

  OUTSIDE TEXT SAYS SO: under an agent whose run read the inbox, or anything else from outside the
  record, one muted line says it asks about everything in that run and why. Under the floors, each import asks whether
  all of it is his (`ImportAsk.svelte`), loaded only when the record holds one, so no other screen carries it. A host
  that sends neither draws exactly what it drew before.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type TrustStanding } from '@braindog/client';
  import { readTrust, takeBack, trustLines, words, type LevelOf, type TrustLine } from '$lib/record/trust.ts';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { markedLine, readImports, type ImportRow } from './imports.ts';
  import { keptSentence } from '$lib/record/kept.ts';

  /* `levelOf` (additive): how far each agent may go by its settings row, so a line with no rung says the page's level. */
  let { levelOf }: { levelOf?: LevelOf } = $props();

  let standing = $state<TrustStanding | null>(null);
  /** The line whose press is on its way, so it is not sent twice. */
  let pressing = $state<string | null>(null);
  /** The record's sentence for a press that did not land, beside the line it was for. */
  let failed = $state<{ key: string; fix: string } | null>(null);

  /** Each agent's marked line, by its place in the record's order, read off the standing `readTrust` keeps. */
  const marked = $derived(standing ? standing.agents.map(markedLine) : []);

  /* EACH AGENT'S ACCEPTED-UNCHANGED SHARE, the one number its suggestions are judged by, under its last line. */
  const kept = $derived(standing ? standing.agents.map((a) => (a.kept ? keptSentence(a.kept) : null)) : []);

  /* THE AGENTS THAT ASK BEFORE EVERY CHANGE ARE ONE LINE, unless a marked line or a share is said under one of them. */
  const lines = $derived(standing ? trustLines(standing, Date.now(), (i) => !marked[i] && !kept[i], levelOf) : []);
  /** The imports the record holds, or `null` when it sent none or has no such call. */
  let imports = $state<ImportRow[] | null>(null);

  /* The marked line goes after an agent's last line: an agent's lines are keyed by its place, `0` or `0:1`. */
  const lastOf = (i: number): number | null => {
    const at = lines[i]?.key.split(':')[0];
    if (at === undefined || lines[i + 1]?.key.split(':')[0] === at) return null;
    return Number(at);
  };
  const markedAfter = (i: number): string | null => {
    const at = lastOf(i);
    return at === null ? null : (marked[at] ?? null);
  };
  const keptAfter = (i: number): string | null => {
    const at = lastOf(i);
    return at === null ? null : (kept[at] ?? null);
  };

  const client = () => createClient({ base: apiBase() });

  /* ONE READ: `readTrust` carries each agent's `asking` beside its ladder, and the marked line is read off that. */
  const read = () => readTrust(client());

  const rereadImports = async (): Promise<void> => {
    const out = await readImports(client());
    imports = out && out.length > 0 ? out : null;
  };

  /* REREAD AFTER THE PRESS, not patched in place: the record says the new day and why, and every other line as it is. */
  async function askAgain(l: TrustLine): Promise<void> {
    if (l.take === null || pressing !== null) return;
    pressing = l.key;
    failed = null;
    const out = await takeBack(client(), l.take);
    if (out.ok) {
      const again = await read();
      if (again) standing = again;
    } else failed = { key: l.key, fix: out.fix };
    pressing = null;
  }

  onMount(() => {
    if (!page.data.live) return;
    void read().then((out) => {
      standing = out;
      if (out) void rereadImports();
    });
  });
</script>

{#if standing}
  <Tile icon="vault" title={words.title} data-part="trust-rows">
    {#if lines.length === 0}
      <p class="trust-empty">{words.empty}</p>
    {:else}
      <ul class="trust-lines">
        {#each lines as l, i (l.key)}
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
            {#if keptAfter(i)}
              <p class="trust-marked">{keptAfter(i)}</p>
            {/if}
            {#if markedAfter(i)}
              <p class="trust-marked" dir="auto">{markedAfter(i)}</p>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="trust-floors">
        <p class="trust-floor">{words.asksFirst}</p>
        <p class="trust-floor">{words.alwaysAsks}</p>
      </div>
      {#if imports}
        {#await import('./ImportAsk.svelte') then loaded}
          <loaded.default {imports} {client} reread={rereadImports} />
        {/await}
      {/if}
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
    border-block-start: 1px solid var(--rule);
  }

  /* A NAME MAY BE ONE LONG WORD, and it breaks rather than pushing the line past the edge at 320. */
  .trust-said {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .trust-why {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  /* THE WORD CARRIES IT AND THE RED AGREES. No pill and no fill: a word in the line. */
  .trust-back {
    color: var(--red);
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
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  /* THE MARK ON A RUN, its own line under the agent's last one, quiet as the floors: the words say it, no colour. */
  .trust-marked {
    flex-basis: 100%;
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  .trust-empty {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }
</style>
