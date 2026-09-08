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
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { job as jobById } from '$lib/record/api.ts';
  import { page as route } from '$app/state';
  import Empty from '$lib/ui/Empty.svelte';
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

  /* FROM THE ADDRESS, which is what an `[id]` segment is for. */
  const JOB = $derived(jobById(route.params.id ?? ''));
  const last = $derived(JOB?.events.at(-1));
</script>

<svelte:head><title>{titleOf(JOB?.kind ?? 'Job', 'Job')}</title></svelte:head>

{#if !JOB}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty kind="error" heading title={copy.noSuch('run', String(route.params.id))}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}

<PageHead icon="session" kicker="Job" title={JOB.kind} id={JOB.id}>
  {#snippet actions()}
    <Chip label={JOB.status} tone={JOB.status === 'failed' ? 'bad' : JOB.status === 'running' ? 'info' : 'good'} />
    <Button weight="quiet" tone="bad" onclick={() => toasts.push(copy.notWritten('The job would stop at its next step'), { intent: 'warn' })}><Icon name="stop" size="s" />{copy.stopRun}</Button>
  {/snippet}
</PageHead>

<div class="page">
  <!-- IT SAID "RUNNING" WHATEVER THE STATUS WAS. The chip above reads `failed` and this line read
       "Running search" underneath it — one screen, two answers, and the wrong one is the sentence.
       The status is the subject of the line now, and the tool is the detail. -->
  <p class="status">
    {copy.jobStatus[JOB.status] ?? JOB.status}{#if last}
      · last step <code>{last.tool}</code>{/if} · {JOB.model}
  </p>

  <!-- ONE ROW, DRAWN ONCE. A pressable step and a flat one differ in the element and in the chevron
       and in nothing else, and two copies of five spans is where the two stop agreeing. -->
  {#snippet step(e: (typeof JOB.events)[number], pressable: boolean)}
    <span class="seq" data-open={open.has(e.seq) ? '' : undefined}>
      {#if pressable}<Icon name="chevronDown" size="s" />{/if}{e.tool}
    </span>
    <span class="line-main"><span class="line-title">{e.input}</span></span>
    <span class="line-amount out" data-ok={e.ok ? '' : undefined}>
      <!-- `data-ok` was the only thing separating a result from a failure, which is colour carrying
           meaning alone. -->
      <Icon name={e.ok ? 'check' : 'ban'} size="s" />{e.ok ? e.out : 'failed'}
    </span>
    <span class="line-when">{e.seq}</span>
  {/snippet}

  <ol class="ledger">
    {#each JOB.events as e}
      {@const long = e.out.length > FOLD}
      <!-- A DISCLOSURE THAT DISCLOSES NOTHING TEACHES PEOPLE NOT TO PRESS THEM, and this row taught
           it twice. Expanding a successful `✓ 22 rows` said `22 rows` — the same six characters, one
           press later — so a failure was made pressable instead. But a failure's reason renders
           whether it is open or not: the button flipped `aria-expanded` and changed nothing on the
           screen, so a person heard "collapsed" while the reason was already in front of them, and
           pressing it moved a chevron and nothing else.

           SO THE FOLD IS THE ONLY THING A DISCLOSURE IS FOR. There is more text than fits, or there
           is nothing to press. A failure below the fold shows its reason and is a plain row. -->
      {@const more = long}
      <li>
        <!-- A tool call and its result are ONE row. Two rows per call doubles a transcript nobody
             wanted to read in the first place. -->
        {#if more}
          <button type="button" class="line line-short" onclick={() => toggle(e.seq)} aria-expanded={open.has(e.seq)}>
            {@render step(e, true)}
          </button>
        {:else}
          <div class="line line-short" data-flat>{@render step(e, false)}</div>
        {/if}
        <!-- A FAILURE ALWAYS CARRIES ITS REASON. `PROPOSAL_UNCITED — a proposal must attach the rows
             it read` is the whole content of that row; putting it behind a press would be hiding the
             one thing somebody opened this page to read. -->
        {#if !e.ok || open.has(e.seq)}
          <p class="detail" data-ok={e.ok ? '' : undefined}>
            <!-- AND THE FOLD FOLDS. It printed `2000 of 41000 characters` under the whole 41,000 of
                 them — a label describing a truncation that had not happened. -->
            {open.has(e.seq) ? e.out : e.out.slice(0, FOLD)}
            {#if long && !open.has(e.seq)}<span class="fold">{FOLD} of {e.out.length} characters</span>{/if}
          </p>
        {/if}
      </li>
    {/each}
  </ol>

  <p class="note">
    <!-- AND NOT HOW IT IS BUILT. "A real run polls every 700 ms while it is live and stops on a
         terminal status" is `23 §7`'s explaining-the-interface, in milliseconds, to somebody
         watching a job. -->
    {copy.mockNotice}
  </p>
</div>
{/if}

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

  /* A ROW WITH NOTHING BEHIND IT DOES NOT LOOK PRESSABLE. The pointer was the only difference and it
     is not one on a phone; the chevron is gone too, so the affordance and the behaviour agree. */
  .line[data-flat] {
    cursor: default;
  }

  .out {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    /* `text-overflow` does nothing on the flex parent, so the ellipsis lives on this span, which is
       the one holding the text. */
    min-inline-size: 0;
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

  .seq :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .seq[data-open] :global(svg) {
    transform: rotate(180deg);
  }

  .out {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }
</style>