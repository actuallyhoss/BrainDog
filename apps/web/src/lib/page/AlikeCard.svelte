<!--
  A FAMILY OF ALIKE QUESTIONS AS ONE CARD: the first question, "and N like it", one answer that goes to every member,
  and the members listed under it. One run's rowsets are a family too, headed "Approve all N from <what it did>?".
  The answer is one `decide { ids }` (`answerMany`), so the record moves once and one Undo puts every member back.
  "Go through them" draws each member as its own card, to answer one at a time.
-->
<script lang="ts">
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase } from '$lib/at.ts';
  import { answerMany } from '$lib/record/decide-write.ts';
  import { undoDecision } from '$lib/record/undo-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { alikeWords, memberLines, runFamily, sharedWays } from './alike.ts';
  import { queueWords } from './queue-answer.ts';
  import QueueAnswer from './QueueAnswer.svelte';

  let { lead, rest, onanswered }: { lead: QueueQuestion; rest: QueueQuestion[]; onanswered: () => void } = $props();

  const all = $derived([lead, ...rest]);
  const run = $derived(runFamily(lead, rest));
  const ways = $derived(sharedWays(lead, rest));

  let busy = $state(false);
  let said = $state('');
  /* The decision one Undo takes back: every member shares its batch, so undoing it puts all of them back. */
  let decision = $state<string | null>(null);
  let through = $state(false);

  async function send(key: string) {
    if (busy) return;
    busy = true;
    try {
      const out = await answerMany(apiBase(), all.map((q) => q.id), key);
      if (out.from !== 'written') {
        said = out.fix;
        return;
      }
      const left = out.refused.length;
      decision = out.decision;
      said = `${alikeWords.done(out.done)}${left > 0 ? ` ${alikeWords.left(left)} ${out.refused[0]!.fix}` : ''}`;
      onanswered();
    } finally {
      busy = false;
    }
  }

  async function undo() {
    if (busy || decision === null) return;
    busy = true;
    try {
      const out = await undoDecision(apiBase(), decision);
      said = out.from === 'undone' ? out.said : out.fix;
      if (out.from === 'undone') decision = null;
      onanswered();
    } finally {
      busy = false;
    }
  }

  const labelOf = (key: string, label: string, hard: boolean): string => (run !== null && key === 'accept' ? alikeWords.approveAll : hard ? queueWords.hard(label) : label);
</script>

<section class="alike" data-alike={all.length} data-run={run?.id} aria-label={run ? alikeWords.fromRun(all.length, run.name) : lead.question}>
  {#if run}
    <h3 class="q">{alikeWords.fromRun(all.length, run.name)}</h3>
  {:else}
    <h3 class="q">{lead.question}</h3>
    <p class="more">{alikeWords.more(rest.length)}</p>
    {#if lead.why !== ''}<p class="why">{lead.why}</p>{/if}
  {/if}
  {#if said === ''}
    <div class="ways">
      {#each ways as way (way.key)}
        <Button weight={way.recommended || (run !== null && way.key === 'accept') ? 'ink' : 'quiet'} disabled={busy} onclick={() => void send(way.key)}>{labelOf(way.key, way.label, way.hard)}</Button>
      {/each}
      {#if run}<Button weight="quiet" disabled={busy} onclick={() => (through = !through)}>{alikeWords.goThrough}</Button>{/if}
    </div>
  {:else}
    <p class="said" role="status">{said}</p>
    {#if decision !== null}<Button weight="quiet" disabled={busy} onclick={() => void undo()}>{alikeWords.undo}</Button>{/if}
  {/if}
  {#if through && said === ''}
    <div class="members-open">
      {#each all as q (q.id)}<QueueAnswer question={q} {onanswered} compact />{/each}
    </div>
  {:else}
    <details class="members">
      <summary>{alikeWords.members}</summary>
      <ul>
        {#each memberLines(all) as m (m.id)}<li>{m.line}</li>{/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .alike {
    container-type: inline-size;
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }
  .q {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
  }
  .more,
  .why {
    margin: 0;
    color: var(--ink-2);
  }
  .ways {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
  .members-open {
    display: grid;
    gap: var(--sp-2);
  }
  .members ul {
    margin: var(--sp-2) 0 0;
    padding-inline-start: calc(18px * var(--dense, 1));
    color: var(--ink-2);
  }
</style>
