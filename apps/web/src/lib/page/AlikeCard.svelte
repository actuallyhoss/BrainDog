<!--
  A FAMILY OF ALIKE QUESTIONS AS ONE CARD: the first question, "and N like it", one answer that goes to every member,
  and the members listed under it. The answer is each member's own `decide` in turn (`answerQuestion`), as the page's
  batch bar does; no new write path. A reason, when the record asks for one, is typed once and goes to all of them.
-->
<script lang="ts">
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase } from '$lib/at.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import { alikeWords, sharedOptions } from './alike.ts';
  import { queueWords } from './queue-answer.ts';

  let { lead, rest, onanswered }: { lead: QueueQuestion; rest: QueueQuestion[]; onanswered: () => void } = $props();

  const all = $derived([lead, ...rest]);
  const ways = $derived(sharedOptions(lead, rest));

  let busy = $state(false);
  /* The option waiting on a reason: the record said it wants one, so the field opens and the press is sent again. */
  let waitingOn = $state<string | null>(null);
  let reason = $state('');
  let said = $state('');

  async function send(key: string) {
    if (busy) return;
    busy = true;
    let done = 0;
    let wanted = false;
    let fix = '';
    try {
      for (const q of all) {
        const out = await answerQuestion(apiBase(), q.id, key, waitingOn === key ? reason : undefined);
        if (out.from === 'written') done++;
        else if (out.from === 'refused' && out.wants === 'reason') wanted = true;
        else fix = out.fix;
      }
    } finally {
      busy = false;
    }
    if (wanted && done === 0) {
      waitingOn = key;
      return;
    }
    waitingOn = null;
    reason = '';
    const left = all.length - done;
    said = `${alikeWords.done(done)}${left > 0 ? ` ${alikeWords.left(left)}` : ''}${fix !== '' ? ` ${fix}` : ''}`;
    onanswered();
  }
</script>

<section class="alike" data-alike={all.length} aria-label={lead.question}>
  <h3 class="q">{lead.question}</h3>
  <p class="more">{alikeWords.more(rest.length)}</p>
  {#if lead.why !== ''}<p class="why">{lead.why}</p>{/if}
  {#if said === ''}
    <div class="ways">
      {#each ways as way (way.key)}
        <Button weight={way.recommended ? 'primary' : 'quiet'} disabled={busy} onclick={() => void send(way.key)}>{way.hard ? queueWords.hard(way.label) : way.label}</Button>
      {/each}
    </div>
    {#if waitingOn !== null}
      <label class="reason">
        <span>{alikeWords.why}</span>
        <input type="text" bind:value={reason} />
      </label>
      <Button weight="primary" disabled={busy || reason.trim() === ''} onclick={() => void send(waitingOn!)}>{alikeWords.send}</Button>
    {/if}
  {:else}
    <p class="said" role="status">{said}</p>
  {/if}
  <details class="members">
    <summary>{alikeWords.members}</summary>
    <ul>
      {#each all as q (q.id)}<li>{q.question}</li>{/each}
    </ul>
  </details>
</section>

<style>
  .alike {
    container-type: inline-size;
    display: grid;
    gap: 8px;
    padding: 16px;
    border-radius: var(--r-md);
    background: var(--field);
  }
  .q {
    margin: 0;
    font-size: var(--t-base);
    font-weight: 600;
  }
  .more,
  .why {
    margin: 0;
    color: var(--ink2);
  }
  .ways {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .reason {
    display: grid;
    gap: 4px;
  }
  .members ul {
    margin: 8px 0 0;
    padding-inline-start: 18px;
    color: var(--ink2);
  }
</style>
