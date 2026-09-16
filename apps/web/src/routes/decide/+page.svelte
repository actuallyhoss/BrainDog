<!--
  Every open question, ranked by the COST OF BEING WRONG — never by age.

  Ranking by age is what turns a decision queue into a backlog: the oldest question is usually the
  one nobody has needed to answer. Ranking by what deciding late costs puts the expensive one first
  and makes the order arguable, which is the point (19 §2).

  AND THE OPTIONS ON A CARD ARE NOW THE ANSWER, WHICH FOR A LONG TIME THEY ONLY LOOKED LIKE.

  This screen printed every option as one `<span class="q-options">` reading "Per seat · Per product ·
  One studio price", inside the card's own link. Nine printed answers across the queue, none of them
  pressable, every one of them landing on `/decide/<id>` with nothing selected. Answering meant a
  second screen, a choice, and then a paragraph of prose before the commit button would turn on.
  `loop/research-friction.md` §6 ranks that ninth of the ten things that cost a person the most.

  A CARD CANNOT HOLD A BUTTON INSIDE ITS LINK, so the shape had to change first: a button inside an
  anchor is invalid HTML and an ambiguous target. `RowCards.svelte` had already answered this for the
  register: the anchor and the row's verbs are SIBLINGS under one card. This follows it rather
  than inventing a second answer.

  `/decide/<id>` KEEPS EVERYTHING IT HAD. It is where a decision is examined: the cost, the option
  bodies, the recommendation, the defer with its wake date, and a commit that takes a named decider
  and a written reason and cannot be edited afterwards. What changed is that the common case no
  longer has to go there.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { tick, untrack } from 'svelte';
  import { since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { DECIDED as SAMPLE_DECIDED, DOM_CAP, NOW, REGISTERS, ROWS, display, metric } from '$lib/record/api.ts';
  import { ROWSETS } from '$lib/record/data.ts';
  import Changes from './[id]/Changes.svelte';
  import { updatesOf } from './[id]/changes.ts';
  import { answerFor, optionsOf, reasonState, record, setReason, withdraw, wouldRecord, type Answer } from '$lib/record/answer.ts';
  import { plainOf, readQueue, type Queue } from '$lib/record/governance.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { invalidateAll } from '$app/navigation';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import type { Question } from '$lib/record/schema.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  let { data } = $props();

  /**
   * WHERE THE QUEUE CAME FROM. `live` is the record's open suggestions, through `governance`; `sample`
   * is a host with no record behind it, and it draws the sample questions; `refused` is a record that
   * answered no, and its own sentence is what is drawn. Nothing is drawn while the first read is out,
   * so the sample never shows over a live record.
   */
  let from = $state<'reading' | 'live' | 'sample' | 'refused'>('reading');
  let live = $state<Queue | null>(null);
  let refusal = $state('');
  let client: ReturnType<typeof createClient> | null = null;

  async function readLive() {
    const at = opened();
    client ??= createClient({ base: location.origin });
    const out = await readQueue(client);
    if (out.from === 'live') live = out.value;
    if (out.from === 'refused') refusal = out.fix;
    from = out.from;
    closed(out.from !== 'refused', at);
  }

  $effect(() => {
    untrack(() => void readLive());
  });

  /** The clock a band is read against: the reader's on a live record, the sample's own otherwise. */
  const now = $derived(from === 'live' ? Date.now() : NOW);

  const open = $derived(
    from === 'live' ? (live?.open ?? []) : from === 'sample' ? [...data.questions].sort((a, b) => a.rank - b.rank) : [],
  );
  /* Every decision ever taken: the record's, or the sample's. The name is the one the cap test reads. */
  const DECIDED = $derived(from === 'live' ? (live?.decided ?? []) : from === 'sample' ? SAMPLE_DECIDED : []);
  const target = metric('open-questions');
  /* The same aim on a live record, with its tone taken from the record's own count. */
  const aimTone = $derived(from === 'live' ? (open.length > 3 ? ('warn' as const) : ('good' as const)) : target.tone);

  /* THE ROWS A PROPOSAL WOULD CHANGE, drawn on its card, because one press here answers it. One drawing
     for both: the live record's rows and declarations, or the sample's. */
  const changed = $derived(
    new Map(
      open.map((q) => [
        q.id,
        from === 'live' && live
          ? updatesOf(live.rowsets[q.id], live.registers, live.rows, plainOf(live.registers))
          : updatesOf(ROWSETS[q.id], REGISTERS, ROWS, (r, f, v) => display(r, f, v)),
      ]),
    ),
  );

  /** What `decide` refused on each card, in the record's own sentence, and the card being sent. */
  let fixes = $state(new Map<string, string>());
  let sending = $state<string | null>(null);

  /**
   * SENDING AN ANSWER, on a live record. `decide` takes no answer without its reason, so the press picks
   * and this sends. A refusal stays on the card and is said as a warning; a conflict reads the queue
   * again, because a row the proposal changes has moved; a decision leaves the queue, which is read
   * again, and the shell reads `boot` again so the rail's count follows.
   */
  async function commit(q: Question, a: Answer) {
    if (!client || sending !== null) return;
    sending = q.id;
    const out = await answerQuestion(location.origin, q.id, a.option, a.reason);
    sending = null;
    const next = new Map(fixes);
    if (out.from !== 'written') {
      fixes = next.set(q.id, out.fix);
      toasts.push(out.fix, { intent: 'warn' });
      if (out.from === 'conflict') await readLive();
      return;
    }
    next.delete(q.id);
    fixes = next;
    answers = withdraw(answers, q.id);
    toasts.push(copy.decisionRecorded(a.title, q.id), { intent: 'good' });
    await readLive();
    void invalidateAll();
  }

  /**
   * SENTENCES THAT BELONG IN `copy.ts` AND ARE NOT THERE YET.
   *
   * `50 §3` gives that file the job of being the one place a sentence is typed, so the
   * no-over-explaining rule is reviewable in one read. These six are local only because `copy.ts`
   * was being edited elsewhere on the day this landed, and moving them is a rename rather than a
   * redesign. Everything already in `copy.ts` is used from there: `reasonHint` is the field's
   * placeholder and `markNotWritten` is the chip, both unchanged.
   */
  /* THE SENTENCES MOVED TO `copy.ts`, WHERE EVERY OTHER UI LITERAL IN THIS PRODUCT LIVES. They were
     local because the file that owns them was being edited elsewhere at the same time; `19 §9`'s
     rule is one place, so a word cannot be changed on one screen and not on another. */
  const SAY = {
    answered: copy.answeredOption,
    putBack: copy.takeItBack,
    putBackOf: copy.takeItBackOf,
    whyLabel: copy.whyForLater,
    reasonMissing: copy.reasonMissing,
    reasonThin: copy.reasonThinNudge,
  } as const;

  /**
   * ANSWERS MADE HERE, KEYED BY QUESTION.
   *
   * A `Map` rather than a field on the question, because the seed is the record and this screen has
   * no business editing it. Re-assigned rather than mutated on every change: Svelte 5 proxies
   * objects and arrays and not `Map`, which is the same reason the register grid writes
   * `receipts = new Map(receipts).set(…)`.
   *
   * IT DOES NOT SURVIVE LEAVING THE SCREEN, and that is deliberate rather than unfinished. An
   * answer here is not a write, so carrying it across a navigation would be this screen remembering
   * something the record does not know, which is the defect this repository hunts hardest.
   */
  let answers = $state(new Map<string, Answer>());

  /**
   * ONE PRESS ANSWERS THE QUESTION, AND THE REASON IS ASKED FOR AFTERWARDS. The decision, and why.
   *
   * What was here before: the reason was REQUIRED, on a second screen, before the commit button
   * would turn on, and the requirement was satisfied by ONE CHARACTER, at which point the product
   * asked "That will not mean anything in six weeks. Keep it anyway?". Every part of that argument
   * is correct except where it was made. Put in front of the answer it is an obstacle, and an
   * obstacle a single keystroke clears is not protecting the record from anything: it buys typing,
   * not a reason.
   *
   * SO THE DEMAND MOVED TO WHERE ITS VALUE IS, WHICH IS AFTER THE PRESS AND FOR AS LONG AS IT GOES
   * UNANSWERED. The answer costs one press. The card then holds an open field with the six-week
   * argument standing under it, and an answer with no prose behind it keeps saying so, on the card,
   * where the person who made it can see the gap they left. The reason is the whole subject of this
   * queue and it is asked for every time; it is not allowed to stop the queue moving.
   *
   * `/decide/<id>` STILL REQUIRES IT, and that is not an inconsistency. Going there is choosing the
   * ceremony: the option bodies, the reasoning behind the recommendation, a named decider and a row
   * that cannot be edited afterwards. Two screens, two acts. This one is answering a question you
   * have already thought about, and the receipt says exactly which of the two it was.
   *
   * THE RECOMMENDATION IS MARKED HERE NOW, AND IT WAS HIDDEN. The argument was that with the answer
   * one press away, a badge beside a button makes rubber-stamping the machine the cheapest thing on
   * the screen. It treated showing the recommendation as choosing it, and `19 §4` and `20 §3` keep
   * those apart: displayed, never pre-selected, a label and not an order. Nor did hiding it hide
   * anything. Home prints "Recommends …" under three of the four questions in this queue, one tap
   * before this screen, so a reader arrived having been told and found it gone from the one screen
   * whose job is choosing. What the hiding bought was having to remember it.
   *
   * WHAT KEEPS IT A SUGGESTION is everything the mark does not touch: every option is the same
   * weight, in the record's order, one press each, and nothing is filled or focused on arrival. The
   * word sits inside the control, so it is read with the option's name, and it is drawn the way the
   * gate's `.card-rec` is, so one fact looks the same on both screens.
   */
  async function take(q: Question, key: string) {
    const a = answerFor(q, key, new Date(now).toISOString());
    /* A key this question does not offer answers nothing. It cannot happen from these buttons; it
       is the guard for the day something else presses. */
    if (!a) return;
    answers = record(answers, a);

    /* ON A LIVE RECORD THE PRESS PICKS AND THE REASON SENDS IT, so focus goes to the reason. */
    if (from === 'live') {
      await tick();
      document.getElementById(`why-${q.id}`)?.focus();
      return;
    }

    /**
     * THE UNDO IS OFFERED IMMEDIATELY, WHICH IS ONLY HONEST BECAUSE NOTHING IS OUT.
     *
     * `loop/REWORK.md` §4's rule is that the inverse waits for the write to land, because a stack
     * entry for something that has not happened would write the old value over a record the server
     * never moved. This app is a synchronous mock over `@braindog/seed`: there is no request, so
     * there is no window in which that could be true. The day there is one, this offer moves into
     * the response and the chip below becomes the pending state.
     */
    toasts.push(copy.notWritten(wouldRecord(a)), {
      intent: 'warn',
      undo: () => (answers = withdraw(answers, q.id)),
    });

    /* THE PRESSED CONTROL IS GONE, SO FOCUS HAS TO BE PUT SOMEWHERE. Without this it falls to the
       document and a keyboard user is at the top of the page with no idea what happened. It lands
       on the inverse of what they just did, which is the one control they might want next. */
    await tick();
    document.getElementById(`undo-${q.id}`)?.focus();
  }

  /**
   * AND TAKING IT BACK PUTS THE FOCUS BACK TOO, on the option that was pressed.
   *
   * The same hole as `take`, in the other direction: this time the control that disappears is the
   * undo, and without this the round trip ends with focus on the document and the card somewhere
   * above. It lands on the button they chose rather than the first one, because that is the one they
   * were looking at and it is now pressable again.
   *
   * The toast's own undo does not come through here. It is pressed from the toast stack, where
   * focus is already somewhere else, and every undo in this product behaves the same way from there.
   */
  async function putBack(q: Question, option: string) {
    answers = withdraw(answers, q.id);
    await tick();
    document.getElementById(`opt-${q.id}-${option}`)?.focus();
  }

  /**
   * DRAWN ONCE THE FIRST READ HAS ANSWERED, live or the sample. The read is bracketed by `opened()` and
   * `closed()`, so a call still out takes `data-screen` away whatever this says; `Empty` says `refused`
   * for the state it draws.
   */
  $effect(() => {
    if (from === 'live' || from === 'sample') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(copy.decide)}</title></svelte:head>

<!-- NO COUNT IN THE HEAD, AND IT HAD ONE. It printed the same 4 that `Open questions` prints one line
     lower, for the same list, and at 390 it wrapped onto a line of its own: the head measured 91px
     there against 59 at 1440, so the first thing under the title on a phone was a lone number. -->
<PageHead icon="decide" title={copy.decide} />

<div class="page">
  {#if from === 'reading'}
    <!-- Bars, and after 300ms, until the first read answers. -->
    <Waiting />
  {:else if from === 'refused'}
    <Empty kind="error" title={refusal}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if open.length === 0}
    <Empty
      kind="cleared"
      title={copy.noQuestions}
      body={DECIDED[0] ? `${copy.lastDecided} ${since(DECIDED[0].decided?.at ?? '', now)}.` : undefined}
    />
  {:else}
    <!-- THE COUNTS DO NOT MOVE WHEN A CARD IS ANSWERED, and they are right not to. Nothing was
         written, so nothing left the queue: a heading that counted down would be this screen
         claiming a state the record has never heard of. -->
    <Section title={copy.openQuestions} count={open.length}>
      <!-- THE AIM, AS A SENTENCE WITH ITS TONE, AND IT WAS A FRAGMENT. The metric's note sat alone at
           the end of this row, `no more than 3`, grey, beside a count of 4 it was failing. The
           metric already knew it was failing (`tone: 'warn'` above three) and nothing drew it.
           `Chip` draws the tone with its glyph, so over the aim reads ⚠ and not only amber (13 §5.1). -->
      {#snippet aside()}
        <Chip label={copy.aimFor(target.note)} tone={aimTone} />
      {/snippet}

      <ol class="queue">
        {#each open as q (q.id)}
          {@const said = answers.get(q.id)}
          {@const updates = changed.get(q.id) ?? []}
          <li class="q">
            <a class="q-open" href="/decide/{q.id}">
              <span class="q-body">
                <!-- WHAT IT IS ABOUT LEADS, AND THE ID ENDS THE LINE. It led with `SG34` in the id
                     face, which Home took out of its leading column because `SG` is expanded
                     nowhere. It stays, because the feed says "Opened SG31" and a reader looking for
                     that question should find it here; it no longer comes first. -->
                <span class="q-title" id="q-{q.id}-title">{q.title}</span>
                {#if q.cost}<span class="q-cost">{symbolText(q.cost)}</span>{/if}
                <span class="q-head">
                  {#if q.entity}<span class="q-entity">{q.entity}</span>{/if}
                  <span class="q-age">opened {since(q.opened, now)}</span>
                  <span class="q-id">{q.id}</span>
                </span>
              </span>
            </a>

            {#if updates.length}
              <div class="q-changes"><Changes {updates} /></div>
            {/if}

            <!-- THE VERBS, BESIDE THE LINK AND NOT INSIDE IT. One card, two regions, separated by a
                 rule so the boundary is visible rather than inferred: above it opens the question,
                 below it answers it. -->
            <div class="q-act">
              {#if said}
                {@const state = reasonState(said.reason)}
                <div class="said">
                  <!-- NOT SAVED, SAID ON THE CARD. `Chip` is what draws it, because the tone comes
                       with its glyph and there is no way in this app to render an intent without one
                       (13 §5.1). An answered card that only went amber says nothing at all to a
                       screen reader and nothing to anybody who does not see amber. -->
                  <Chip label={copy.markNotWritten} tone="warn" />
                  <span class="said-what">{SAY.answered(said.title)}</span>
                  <!-- THE ROW STAYS AND OFFERS THE WAY BACK. Of eighty-five human writes over
                       thirteen days in the record this product is modelled on, thirteen reversed the
                       write immediately before them and twelve landed inside five seconds, because
                       the row vanished and the only way to check you had hit the right one was to do
                       the opposite and look. There is no confirmation dialog in this product for the
                       same reason: it asks before anything has happened, when the reader knows the
                       least they ever will (REWORK §1, §4). -->
                  <Button
                    weight="bare"
                    id="undo-{q.id}"
                    aria-label={SAY.putBackOf(q.title)}
                    onclick={() => putBack(q, said.option)}
                  >{SAY.putBack}</Button>
                </div>

                <div class="why">
                  <label class="why-label" for="why-{q.id}">{SAY.whyLabel}</label>
                  <textarea
                    id="why-{q.id}"
                    class="why-field"
                    rows="2"
                    placeholder={copy.reasonHint}
                    spellcheck="true"
                    aria-describedby={state === 'written' ? undefined : `why-note-${q.id}`}
                    value={said.reason}
                    oninput={(e) => (answers = setReason(answers, q.id, e.currentTarget.value))}
                  ></textarea>
                  <!-- THE ARGUMENT, STANDING RATHER THAN BLOCKING. It says nothing once there is a
                       sentence worth reading in six weeks: a note that never goes away is a note
                       nobody reads, and the reader has already done the thing it asks for. -->
                  {#if state !== 'written'}
                    <p class="why-note" id="why-note-{q.id}">
                      {state === 'missing' ? (from === 'live' ? copy.reasonRequired : SAY.reasonMissing) : SAY.reasonThin}
                    </p>
                  {/if}
                  <!-- A LIVE RECORD SENDS IT, and a refusal stays under the button in the record's words. -->
                  {#if from === 'live'}
                    <div class="send">
                      <Button weight="primary" disabled={!said.reason.trim() || sending !== null} onclick={() => commit(q, said)}>
                        {copy.commit}
                      </Button>
                    </div>
                    {#if fixes.get(q.id)}
                      <p class="why-fix" role="status" data-intent="bad">{fixes.get(q.id)}</p>
                    {/if}
                  {/if}
                </div>
              {:else}
                <!-- Named by the question, because "Per seat" repeated down a queue of nine is
                     three words with no subject. -->
                <div class="q-options" role="group" aria-labelledby="q-{q.id}-title">
                  <!-- THE HOUSE CONTROL, not a button styled to look like one. `Button` carries the
                       invisible 44 x 44 hit box, the press state and a fill whose contrast against
                       its own label is already solved; an option button hand-rolled here would be a
                       second control with the same job and its own drift. -->
                  <!-- THE RECOMMENDATION, AS A WORD INSIDE ITS OPTION. Not filled, not moved first,
                       not focused: the same weight as its neighbours and in the record's order, so it
                       is found rather than chosen. The argument is over `take`. -->
                  {#each optionsOf(q) as o (o.key)}
                    <Button id="opt-{q.id}-{o.key}" onclick={() => take(q, o.key)}>
                      {o.title}{#if o.recommended}<span class="rec">{copy.recommended}</span>{/if}
                    </Button>
                  {/each}
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    </Section>
  {/if}

  {#if DECIDED.length}
    <Section title="Decided" count={DECIDED.length}>
      <ul class="ledger">
        {#each DECIDED.slice(0, DOM_CAP) as q}
          <!-- THE OPTION BY ITS LABEL. A live decision keeps the option's id, and its options come from the suggestion it settled. -->
          {@const chose = q.options.find((o) => o.key === q.decided?.option)?.title}
          <li>
            <!-- A TICK LEADS AND THE ID ENDS THE LINE, the order the queue above keeps. `SG31` in the
                 leading column was a code expanded nowhere; the question is what tells these rows
                 apart, and the id stays, dim, for whoever meets "Decided SG31" in the log. -->
            <a class="line" href="/decide/{q.id}">
              <span class="seq"><Icon name="check" size="s" /></span>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                <span class="line-detail">{#if chose}<span class="decided-choice">{chose}</span> {/if}{q.decided?.reason}</span>
              </span>
              <span class="line-when">{since(q.decided?.at ?? '', now)}<span class="decided-id">{q.id}</span></span>
            </a>
          </li>
        {/each}
      </ul>
      <CapLine shown={Math.min(DECIDED.length, DOM_CAP)} total={DECIDED.length} />
    </Section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-7);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .queue {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /**
   * A QUESTION IS A SECTION OF THE LIST, NOT A CARD. Space and a soft divider separate one from the
   * next; a box, a border and a shadow round each made a queue of four read as four forms. The link
   * is the top of the item and the answers sit under it as siblings, because a button may not live
   * inside a link.
   */
  .q {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block: var(--sp-5);
    border-block-end: 1px solid var(--line-soft);
  }

  .q:first-child {
    padding-block-start: var(--sp-2);
  }

  .q:last-child {
    border-block-end: 0;
  }

  /* NO CHEVRON. One sat at the far edge of every question, 500px from the words it pointed at, on a
     list whose title already underlines under the pointer and whose whole block is the link. It was
     a mark repeated five times that said nothing the title did not. */
  .q-open {
    display: block;
    color: var(--ink);
    text-decoration: none;
  }

  .q-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .q-title {
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    letter-spacing: -0.005em;
  }

  .q-open:hover .q-title {
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }

  .q-cost {
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .q-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .q-entity {
    color: var(--ink2);
  }

  /* The identifier ends the line, in the id face and quiet: it is there for whoever meets it in the
     log, not to be read first. */
  .q-id {
    color: var(--dim);
    font-family: var(--font-id);
  }

  /* Between items, so a question about nothing does not open its line with a dot. */
  .q-head > span + span::before {
    content: '·';
    margin-inline-end: var(--sp-2);
    color: var(--dim);
  }

  .q-act {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* Wrapping, not scrolling: every answer stays visible on a phone. */
  .q-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (pointer: fine) {
    .q-options :global(.btn.btn) {
      min-block-size: var(--ctl-h-sm);
    }
  }

  /* THE SUGGESTION IS A WORD, IN THE QUIET INK. A green chip beside one answer made the machine's
     pick the loudest thing in the queue; a word inside the control is read with the option's name
     and leaves every option the same weight. */
  .rec {
    color: var(--dim);
    font-weight: 400;
  }

  .said {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .said-what {
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .why {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .why-label {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .why-field {
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    resize: vertical;
  }

  .why-note {
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .send {
    display: flex;
  }

  .why-fix {
    max-inline-size: var(--measure);
    font-size: var(--t-ui);
  }

  /* The row shape is `$lib/ui/rows.css`; the decided list uses three of its four columns. */
  /**
   * A DESKTOP TRACK LIST IS A DESKTOP RULE, AND HAS TO SAY SO.
   *
   * `rows.css` turns a row into a two-line card below 640px. This override said nothing about width,
   * and it is more specific than the card rule — Svelte compiles `.ledger :global(.line)` to
   * `.ledger.svelte-xxx .line`, three classes against one — so it won at every size. The children
   * took their card placements and the parent kept four desktop tracks underneath them: computed at
   * 390, `144px 63px 0px 81px`, a zero-width track with a nowrap note in it.
   *
   * The cost is measurable. The longest note in the audit log was 19% visible — `added a n…` — and
   * `/decide` lost 227px of a 551px sentence. Eight entries, none readable, on the two screens whose
   * whole job is to say what changed and why. Every desktop screenshot looked correct.
   *
   * `@layer components` alone does NOT fix it: within one layer the more specific rule still wins.
   * The width query is what makes the two rules describe two different screens instead of arguing
   * about one.
   */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 2ch minmax(0, 1fr) auto;
      min-block-size: 44px;
    }
  }

  /* ON A PHONE THE TICK IS A COLUMN, as on Home. `rows.css` gives the leading span a line of its
     own on a card, and a lone tick over every decided question is a line that says nothing. */
  @media (width < 640px) {
    .ledger :global(.line) {
      grid-template-columns: 20px minmax(0, 1fr);
      gap: var(--sp-1) var(--sp-3);
    }

    .ledger :global(.seq) {
      grid-column: 1;
      grid-row: 1;
      align-self: start;
      min-inline-size: 0;
      padding-block-start: 2px;
    }

    .ledger :global(.line-main) {
      grid-column: 2;
      grid-row: 1;
    }

    .ledger :global(.line-when) {
      grid-column: 2;
      grid-row: 2;
      justify-content: flex-start;
    }
  }

  .decided-choice {
    margin-inline-end: var(--sp-1);
    color: var(--ink2);
    font-weight: 500;
  }

  .decided-id::before {
    content: '·';
    margin-inline-end: 5px;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
