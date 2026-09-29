<!--
  One question from a `queue` block, answered where it is shown: on Home,
  Money, Work, a project's page and the Agents page, a press on an option is the answer, and nobody is sent to Decide.

  THE OPTION GOES ALONE AND THE KERNEL DECIDES WHETHER IT OWES A REASON (`answerQuestion` with no `reason`). A light
  question a rule or Slash opened (band `call`) is answered in one press, through `govern.ts`'s `oneAnswer`; every
  other question still refuses `REQUIRED_MISSING` at `reason`, so the card then opens one line under itself,
  "Why? (one line)", focused, and Enter sends it with the option already chosen. Nothing here changes for either case:
  the card sends the option alone and opens the reason line only when the record asks for one.

  WHO ASKED IS A FACE AND A NAME: `proposer` words the signer the way every other screen does (`names.ts` `actor`), with
  the reader and the people `boot` named from the shell, so a card says "Claude", "A rule: chase late payments" or
  "Slash" and never `p_seed` or `rule:cash-stale`.

  ANSWERED, THE CARD BECOMES ONE LINE ("Chase it · you, just now") and `onanswered` tells the host, which lowers its
  count. There is no Put back on that line: the kernel reopens a question only after an accepted change fails to
  install (`govern.ts` `reopen`), no route offers it to a person, and a way back that is refused on every press is a
  promise the line cannot keep.

  THE SAME CLASSES THE RENDERER'S QUEUE DRAWS (`packages/render/svelte/Queue.svelte`), so the card reads as every other
  queue card through `blocks.css`, and the `queue` gate still finds its card, its cost chip and its one act per option.
  An answered line is not a `queue-card`: it has no band, and a card without one is ranked last.

  A READER WHO MAY NOT ANSWER READS THE SAME CARD WITH THE OPTIONS AS WORDS, which is the renderer's rule: a control
  that cannot act is absent, not greyed (`19 §6`). `may` reads the level the record named in `boot`.
-->
<script module lang="ts">
  /* EVERY CARD'S IDS ARE ITS OWN, so two queues on one page holding the same question never share a field's id. */
  let made = 0;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { page as route } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { queueCost, since } from 'braindog-render';
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { may } from '$lib/record/may.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { changesSomething, proposer, queueWords, saidOf, waysOf, type Way } from './queue-answer.ts';

  let { question, onanswered }: { question: QueueQuestion; onanswered: () => void } = $props();

  const uid = `qa-${(made += 1)}`;

  /* THE SHELL THE LAYOUT DREW, read as partial because a page drawn outside the signed-in shell carries no `me`. */
  const shell = $derived(route.data as unknown as Partial<Shell>);
  const me = $derived(shell.me ?? null);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  const answerable = $derived(me !== null && (me.owner || may({ me }, 'decide')));

  const asker = $derived(proposer(question.who, me?.person ?? null, names));
  const ways = $derived(waysOf(question));
  const when = $derived(since(question.at, Date.now()));
  const band = $derived(question.cost ? queueCost(question.cost) : '');

  /**
   * WHERE THE CARD IS. `open` offers the options; `asking` has one chosen and the reason line open under it;
   * `answered` is the one line the card becomes.
   */
  let phase = $state<'open' | 'asking' | 'answered'>('open');
  let chosen = $state<Way | null>(null);
  let reason = $state('');
  let fix = $state('');
  let answeredAt = $state('');
  /* ONE WRITE IN FLIGHT, so a double press answers once. The options are not disabled for it: a pressed
     button that turns disabled drops the focus it holds to the page. */
  let busy = $state(false);

  let field = $state<HTMLInputElement | null>(null);
  let done = $state<HTMLParagraphElement | null>(null);

  /**
   * The press, and the send from the reason line. `said` is the reason, or nothing when nobody has been asked for one.
   *
   * A REFUSAL THAT WANTS A REASON OPENS THE LINE and says nothing else, because the line is the whole answer to it. Any
   * other refusal is the record's own sentence under the card, and a row that moved since the question was filed is
   * said as that, with nothing written and the whole change one link away.
   */
  async function send(way: Way, said?: string) {
    if (busy) return;
    busy = true;
    fix = '';
    try {
      const out = await answerQuestion(apiBase(), question.id, way.key, said);
      if (out.from === 'written') {
        answeredAt = new Date().toISOString();
        phase = 'answered';
        await tick();
        done?.focus();
        onanswered();
        /* AND THE RAIL'S COUNT FOLLOWS, as it does from Decide: the write dropped the kept `boot` (`decide-write.ts`),
           and the layout reads it again. `/p/<slug>` reads its body by its slug and not from the layout, so there this does
           not read the card away. */
        void invalidateAll();
        return;
      }
      if (out.from === 'refused' && out.wants === 'reason' && phase !== 'asking') {
        phase = 'asking';
        await tick();
        reveal();
        return;
      }
      fix = out.from === 'conflict' ? queueWords.moved : out.fix;
    } finally {
      busy = false;
    }
  }

  /** An option pressed. With the reason line open it changes the choice and keeps the words already typed. */
  function press(way: Way) {
    if (busy) return;
    chosen = way;
    if (phase === 'asking') return reveal();
    void send(way);
  }

  /**
   * A BLANK LINE IS NOT SENT. `writeDecision` would refuse it in Decide's sentence, which promises a button that turns on,
   * and this Send is never off; so the field keeps the focus instead, and `required` lets the browser say why.
   */
  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    if (reason.trim() === '') return reveal();
    void send(chosen, reason);
  }

  /* ESC PUTS THE LINE AWAY and hands focus back to the option it was opened for, as nothing was sent. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    phase = 'open';
    fix = '';
    const key = chosen?.key;
    void tick().then(() => document.getElementById(`${uid}-opt-${key}`)?.focus());
  }

  /**
   * THE LINE IS FOCUSED AND KEPT ABOVE THE KEYBOARD. Its scroll margins clear the sticky bar and `--kb`, the keyboard's
   * height written at run time (`lib/a11y/keyboard.ts`), so on a phone the field and Send stay in sight while typing.
   */
  function reveal() {
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
  }

  /* AND AGAIN ONCE THE KEYBOARD HAS OPENED, because it arrives after the focus that summoned it and `--kb` grows then. */
  $effect(() => {
    if (phase !== 'asking') return;
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    const again = () => {
      if (document.activeElement === field) field?.scrollIntoView({ block: 'nearest' });
    };
    viewport.addEventListener('resize', again);
    return () => viewport.removeEventListener('resize', again);
  });
</script>

<div class="qa">
  {#if phase === 'answered' && chosen}
    <p class="qa-done" role="status" tabindex="-1" bind:this={done}>
      <Face name={copy.feedYou} you size="s" /><span class="qa-done-words">{queueWords.answered(chosen.label, since(answeredAt, Date.now()))}</span>
    </p>
  {:else}
    <article class="queue-card" aria-busy={busy}>
      <!-- The band is last on the by-line, in the register of who asked and when, as the renderer draws it. -->
      <p class="queue-by">
        <Face name={asker.name} kind={asker.kind} size="s" /><span class="queue-who">{asker.name}</span><span class="queue-when">{when}</span
        >{#if band}<span class="queue-cost" data-cost={question.cost}>{band}</span>{/if}
      </p>
      <h3 class="queue-question" dir="auto">{saidOf(question.question)}</h3>
      {#if question.why}<p class="queue-why" dir="auto">{saidOf(question.why)}</p>{/if}
      {#if changesSomething(question)}
        <a class="qa-see tap" href={at(`/decide/${encodeURIComponent(question.id)}`)}>{queueWords.seeWhole}</a>
      {/if}
      <ul class="queue-options">
        {#each ways as way (way.key)}
          <li class="queue-option" data-recommended={way.recommended ? '' : undefined}>
            <!-- WHAT THE OPTION IS, in the renderer's own box and classes: a swatch writes its colour into `--swatch` on
                 its chip and nowhere else (`05 §5`), after `visualOf` held it to the renderer's reading. -->
            {#if way.shows && 'swatch' in way.shows}<span class="queue-visual" data-shows="swatch" aria-hidden="true"
                >{#each way.shows.swatch as colour}<span class="queue-swatch" style="--swatch:{colour}"></span>{/each}</span
              >{:else if way.shows}<span class="queue-visual" data-shows="figure"><span class="queue-figure num">{way.shows.figure}</span></span>{/if}
            {#if answerable}
              <button
                type="button"
                class="queue-act"
                id="{uid}-opt-{way.key}"
                data-on={chosen?.key === way.key && phase === 'asking' ? '' : undefined}
                aria-pressed={phase === 'asking' ? chosen?.key === way.key : undefined}
                onclick={() => press(way)}>{way.label}</button
              >
            {:else}
              <span class="queue-label">{way.label}</span>
            {/if}
            {#if way.recommended}<span class="queue-rec">{queueWords.suggested}</span>{/if}
            {#if way.because}<span class="queue-because" dir="auto">{way.because}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if phase === 'asking' && chosen}
        <form class="qa-reason" onsubmit={submit}>
          <label class="qa-label" for="{uid}-why">{queueWords.why}</label>
          <div class="qa-line">
            <span class="field field-lg qa-field">
              <input
                id="{uid}-why"
                class="field-input qa-input"
                type="text"
                autocomplete="off"
                enterkeyhint="send"
                required
                bind:value={reason}
                bind:this={field}
                {onkeydown}
              />
            </span>
            <Button type="submit">{queueWords.send}</Button>
          </div>
        </form>
      {/if}
      {#if fix}<p class="qa-fix" role="status">{fix}</p>{/if}
    </article>
  {/if}
</div>

<style>
  /* THE CARD IS ITS OWN CONTAINER, so it answers the width of the slot it sits in, as a queue block does. */
  .qa {
    container-type: inline-size;
  }

  /* A FACE IN THE BY-LINE sits on the line's middle, not its baseline, or the disc rides above the words. */
  .queue-by {
    align-items: center;
    flex-wrap: wrap;
    column-gap: var(--sp-2);
  }

  /* AN ANSWER IS A PILL, and a long one wraps inside it rather than pushing the card sideways. */
  .queue-act {
    border-radius: var(--r-pill);
    padding-inline: var(--sp-4);
    white-space: normal;
    text-align: start;
    overflow-wrap: anywhere;
  }

  /* THE OPTION THE REASON IS FOR, while the line is open: the selected surface and an ink edge, a shape and not a shade. */
  .queue-act[data-on] {
    background: var(--selected);
    border-color: var(--ink2);
  }

  .qa-see {
    justify-self: start;
    color: var(--link);
    font-size: var(--t-sm);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .qa-reason {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-1);
  }

  .qa-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .qa-line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }

  .qa-field {
    flex: 1 1 16ch;
    min-inline-size: 0;
  }

  /* CLEAR OF THE STICKY BAR ABOVE AND THE KEYBOARD BELOW, whichever way the field is scrolled to. */
  .qa-input {
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
    scroll-margin-block-end: calc(var(--kb) + var(--sp-4));
  }

  .qa-fix {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--danger);
    font-size: var(--t-sm);
  }

  /* ONE LINE, QUIET: what was chosen, by whom and when, where the card was. */
  .qa-done {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    min-block-size: var(--ctl-h);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .qa-done-words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* ON A NARROW SLOT EVERY ANSWER IS A FULL-WIDTH PILL, the suggestion and the reason under it, and Send takes the
     line's whole width under the field so it is never pushed off the edge. */
  @container (inline-size < 30rem) {
    .queue-options {
      grid-template-columns: minmax(0, 1fr);
    }

    .queue-act {
      justify-self: stretch;
      text-align: center;
    }

    .queue-rec,
    .queue-because {
      grid-column: 1;
    }

    .qa-line > :global(.btn) {
      flex: 1 1 100%;
    }
  }
</style>
