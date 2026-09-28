<!--
  One open question on Today, answered where it is shown: the question, who asked and when, and its options as plain
  buttons. A press sends the option alone and the record says whether it wants a reason (`answerQuestion`); when it
  does, one line opens under the options, focused, and Enter sends it with the option already chosen.

  THE SAME WRITE AND THE SAME WORDS AS A QUEUE CARD (`lib/page/QueueAnswer.svelte`, `queue-answer.ts`), drawn as a row
  rather than a card, because Today is a list and a card per question is three boxes stacked above the tasks.

  A READER WHO MAY NOT ANSWER READS THE OPTIONS AS WORDS, and the question still opens on Decide.
-->
<script module lang="ts">
  let made = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { page as route } from '$app/state';
  import { since } from 'braindog-render';
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase, at } from '$lib/at.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { may } from '$lib/record/may.ts';
  import { proposer, queueWords, saidOf, waysOf, type Way } from '$lib/page/queue-answer.ts';

  let { question, now, onanswered }: { question: QueueQuestion; now: number; onanswered: () => void } = $props();

  const uid = `tq-${(made += 1)}`;

  const shell = $derived(route.data as unknown as Partial<Shell>);
  const me = $derived(shell.me ?? null);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  const answerable = $derived(me !== null && (me.owner || may({ me }, 'decide')));
  const asker = $derived(proposer(question.who, me?.person ?? null, names));
  const ways = $derived(waysOf(question));

  let phase = $state<'open' | 'asking' | 'answered'>('open');
  let chosen = $state<Way | null>(null);
  let reason = $state('');
  let fix = $state('');
  let busy = $state(false);
  let field = $state<HTMLInputElement | null>(null);

  async function send(way: Way, said?: string) {
    if (busy) return;
    busy = true;
    fix = '';
    try {
      const out = await answerQuestion(apiBase(), question.id, way.key, said);
      if (out.from === 'written') {
        phase = 'answered';
        onanswered();
        return;
      }
      if (out.from === 'refused' && out.wants === 'reason' && phase !== 'asking') {
        phase = 'asking';
        await tick();
        field?.focus();
        return;
      }
      fix = out.from === 'conflict' ? queueWords.moved : out.fix;
    } finally {
      busy = false;
    }
  }

  function press(way: Way) {
    if (busy) return;
    chosen = way;
    if (phase === 'asking') return field?.focus();
    void send(way);
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    if (reason.trim() === '') return field?.focus();
    void send(chosen, reason);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    phase = 'open';
    fix = '';
  }
</script>

{#if phase === 'answered' && chosen}
  <p class="done" role="status">{queueWords.answered(chosen.label, since(new Date(now).toISOString(), now))}</p>
{:else}
  <div class="q" aria-busy={busy}>
    <a class="q-text" href={at(`/decide/${encodeURIComponent(question.id)}`)} dir="auto">{saidOf(question.question)}</a>
    <span class="q-by">{asker.name} · {since(question.at, now)}</span>
    <div class="q-opts" role="group" aria-label={saidOf(question.question)}>
      {#each ways as way (way.key)}
        {#if answerable}
          <button
            type="button"
            class="opt"
            title={way.because || undefined}
            data-on={chosen?.key === way.key && phase === 'asking' ? '' : undefined}
            aria-pressed={phase === 'asking' ? chosen?.key === way.key : undefined}
            onclick={() => press(way)}
          >
            {way.label}{#if way.recommended}<span class="rec"> · {queueWords.suggested.toLowerCase()}</span>{/if}
          </button>
        {:else}
          <span class="opt-said">{way.label}</span>
        {/if}
      {/each}
    </div>
    {#if phase === 'asking' && chosen}
      <form class="why" onsubmit={submit}>
        <label class="why-label" for="{uid}-why">{queueWords.why}</label>
        <input
          id="{uid}-why"
          class="why-input"
          type="text"
          autocomplete="off"
          enterkeyhint="send"
          required
          bind:value={reason}
          bind:this={field}
          {onkeydown}
        />
        <button type="submit" class="opt">{queueWords.send}</button>
      </form>
    {/if}
    {#if fix}<p class="fix" role="status">{fix}</p>{/if}
  </div>
{/if}

<style>
  .q {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-1) var(--sp-3);
    align-items: baseline;
  }

  .q-text {
    color: var(--ink);
    font-size: var(--t-ui);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .q-text:hover {
    text-decoration: underline;
  }

  /* WHO ASKED IS A QUIET LINE THAT NEVER TAKES THE QUESTION'S ROOM: cut at a width, and under it on a phone. */
  .q-by {
    max-inline-size: 28ch;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (width < 640px) {
    .q {
      grid-template-columns: minmax(0, 1fr);
    }

    .q-by {
      max-inline-size: none;
    }
  }

  .q-opts,
  .why {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }

  /* A PLAIN BUTTON: a hairline box at the small radius, the option's words in it, and nothing else. */
  .opt {
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    text-align: start;
    cursor: pointer;
  }

  .opt:hover {
    background: var(--hover-wash);
  }

  .opt[data-on] {
    background: var(--selected);
    border-color: var(--ink2);
  }

  .rec {
    color: var(--dim);
  }

  .opt-said {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .why-label {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .why-input {
    flex: 1;
    min-inline-size: 12ch;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
  }

  .fix {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--warn);
    font-size: var(--t-sm);
  }

  .done {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  @media (pointer: coarse) {
    .opt,
    .why-input {
      min-block-size: var(--tap);
    }
  }
</style>
