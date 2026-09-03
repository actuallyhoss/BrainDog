<!--
  A tier-C run: your own machine, your own subscription, nobody paying per token.

  This is the RETURN ADDRESS for a run you walked away from. Closing the panel stops nothing, and
  the transcript is of a RUN, never of a conversation — one row per tool call, its result folded on
  the same row, and a header that reads its status from the last event (23 §3.1).

  Job events are polled, never pushed: the socket carries a version and the names of what changed
  and nothing else, because a payload push would mean authorising the socket per record — a second
  authorisation path the agent API does not have (22 §5).
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { JOB } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Chip from '$lib/ui/Chip.svelte';

  const FOLD = 2000;
  let open = $state(new Set<number>());

  const toggle = (seq: number) => {
    const next = new Set(open);
    if (next.has(seq)) next.delete(seq);
    else next.add(seq);
    open = next;
  };

  const last = $derived(JOB.events.at(-1));
</script>

<PageHead kicker="Job" title={JOB.kind} id={JOB.id}>
  {#snippet actions()}
    <Chip label={JOB.status} tone={JOB.status === 'failed' ? 'bad' : JOB.status === 'running' ? 'info' : 'good'} />
    <Button weight="quiet" tone="bad"><Icon name="stop" size="s" />Stop</Button>
  {/snippet}
</PageHead>

<div class="page">
  <p class="status">
    Running <code>{last?.tool}</code> · {JOB.model}
  </p>

  <ol class="ledger">
    {#each JOB.events as e}
      {@const long = e.out.length > FOLD}
      <li>
        <!-- A tool call and its result are ONE row. Two rows per call doubles a transcript nobody
             wanted to read in the first place. -->
        <button type="button" class="line line-short" onclick={() => toggle(e.seq)} aria-expanded={open.has(e.seq)}>
          <span class="seq">{e.tool}</span>
          <span class="line-main"><span class="line-title">{e.input}</span></span>
          <span class="line-amount out" data-ok={e.ok ? '' : undefined}>
            {e.ok ? e.out : 'failed'}
          </span>
          <span class="line-when">{e.seq}</span>
        </button>
        {#if !e.ok || open.has(e.seq)}
          <p class="detail" data-ok={e.ok ? '' : undefined}>
            {e.out}
            {#if long}<span class="fold">{FOLD} of {e.out.length} characters</span>{/if}
          </p>
        {/if}
      </li>
    {/each}
  </ol>

  <p class="note">
    {copy.mockNotice} A real run polls every 700 ms while it is live and stops on a terminal status.
  </p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1000px;
  }

  .status {
    color: var(--dim);
    font-size: var(--t-ui);
  }

  /* Ink, not the accent. This is the name of the step the job is on — a fact, and one that is red
     in a line that already carries a red `failed` further down the page. Monospace already sets it
     apart from the sentence around it; colour on top of that is the same distinction made twice,
     in the one hue this product reserves for something being wrong. */
  .status code {
    color: var(--ink);
    font-family: var(--font-id);
  }

  .line {
    inline-size: 100%;
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .out {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .out:not([data-ok]) {
    color: var(--danger);
  }

  .detail {
    padding: 0 var(--sp-4) var(--sp-3) calc(12ch + var(--sp-4) * 2);
    background: var(--s1);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    line-height: 1.7;
  }

  .detail:not([data-ok]) {
    color: var(--danger);
  }

  .fold {
    display: block;
    margin-block-start: var(--sp-1);
    color: var(--dim);
  }

  .note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }

    .detail {
      padding-inline-start: var(--sp-4);
    }
  }
</style>
