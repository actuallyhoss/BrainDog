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
  import { ROWS, job as jobById, runName } from '$lib/record/api.ts';
  import { page as route } from '$app/state';
  import Empty from '$lib/ui/Empty.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { drew } from '../../../lib/ui/screen.svelte.ts';

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

  /**
   * WHAT THE RUN IS DOING, WHICH IS WHAT EVERY OTHER SCREEN CALLS IT.
   *
   * The heading was the job's `kind`, `qa`, lower case, then `j_9K4A` in the id face: a stranger
   * asked what qa is. `/t/1` lists the same run among its project's agents by the run's `doing`,
   * the sentence the agent keeps about itself, and so does the run's own row. That is the title
   * now. The kicker is the noun, Run, and the id stays the chip beside the title rather than
   * joining the kicker, because an upper-cased `J_9K4A` is another id.
   *
   * A job that names no run keeps the kind as its title, which is what the heading said before.
   */
  const doing = $derived(
    JOB?.run ? String((ROWS.session ?? []).find((s) => runName(s) === JOB.run)?.fields.doing ?? '') : '',
  );
  const named = $derived(doing || JOB?.kind || copy.run);

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<!-- THE SCREEN'S OWN NOUN, AND IT HAD TWO. The kicker and this title were the literal `Job` while
     the refusal below said "There is no run called …", the only action said "Stop the run", and the
     register this screen is reached from is called Agent runs. `job` stays in the address, in the
     field on a session row and in the type; the words a reader sees are one word now, and they are
     in `copy.ts` so the next rename reaches them. -->
<svelte:head><title>{titleOf(named, copy.run)}</title></svelte:head>

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

<PageHead icon="session" kicker={copy.run} title={named} id={JOB.id}>
  {#snippet actions()}
    <Chip label={JOB.status} tone={JOB.status === 'failed' ? 'bad' : JOB.status === 'running' ? 'info' : 'good'} />
    <Button weight="quiet" onclick={() => toasts.push(copy.notWritten(copy.runWouldStop), { intent: 'warn' })}><Icon name="stop" size="s" />{copy.stopRun}</Button>
  {/snippet}
</PageHead>

<div class="page">
  <!-- IT SAID "RUNNING" WHATEVER THE STATUS WAS. The chip above reads `failed` and this line read
       "Running search" underneath it — one screen, two answers, and the wrong one is the sentence.
       The status is the subject of the line now, and the tool is the detail. The model id is
       gone: it is a string for whoever set up the runner, not for somebody reading what it did. -->
  <p class="status">
    {copy.jobStatus[JOB.status] ?? JOB.status}{#if last}
      · last step <span class="tool">{last.tool}</span>{/if}
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
          <p class="detail">
            <!-- AND THE FOLD FOLDS. It printed `2000 of 41000 characters` under the whole 41,000 of
                 them — a label describing a truncation that had not happened. -->
            {open.has(e.seq) ? e.out : e.out.slice(0, FOLD)}
            {#if long && !open.has(e.seq)}<span class="fold">{FOLD} of {e.out.length} characters</span>{/if}
          </p>
        {/if}
      </li>
    {/each}
  </ol>

  <!-- WHOSE RUN THIS IS, ON A RECORD THAT HAS ONE.

       The transcript above is written into the app rather than read from a record: there is no
       method that answers with a run's tool calls, so the same six steps are drawn whichever record
       the reader is signed in to. On the sample that is what the whole screen is and the bar at the
       top of the page already says so. On a live record it is somebody being shown invented steps
       under their own record's chrome, which is worse than an empty screen, because nothing tells
       them what they are looking at. So the screen says which it is, once, in a note. -->
  {#if route.data.live}<p class="note" role="note">{copy.exampleRun}</p>{/if}

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

  /* Ink and a little weight, not the accent and not monospace. It is the name of the step the run
     is on, a fact, and the identifier face was what made this line read as a terminal. */
  .status .tool {
    color: var(--ink);
    font-weight: 500;
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
    font-size: var(--t-xs);
    /* `text-overflow` does nothing on the flex parent, so the ellipsis lives on this span, which is
       the one holding the text. */
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* RED ON THE GLYPH AND NOWHERE ELSE. The word beside it says `failed`, so the colour marks the
     row without setting a sentence in the alarm hue. */
  .out:not([data-ok]) {
    color: var(--ink2);
  }

  .out:not([data-ok]) :global(svg) {
    color: var(--danger);
  }

  /* THE REASON IN THE BODY FACE AND INK, failure or not. It is the sentence somebody opened this
     page to read, and red text in the identifier face was the hardest way to read it. */
  .detail {
    padding: 0 var(--sp-4) var(--sp-3) calc(12ch + var(--sp-4) * 2);
    background: var(--s1);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
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