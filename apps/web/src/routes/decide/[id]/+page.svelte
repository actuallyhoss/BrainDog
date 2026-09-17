<!--
  The gate. One question, its options, one decider, a mandatory reason.

  DELIBERATELY SLOWER THAN EVERY PRECEDENT, and every part of that is on purpose:

    1–9   HIGHLIGHT an option. It does not choose it.
    ↵     opens the commit step, and focus moves to the EMPTY, REQUIRED reason field.
    ⌘↵    commits — only from inside the reason, only with content.
    d     defers: also a reason, plus a wake date.
    Esc   leaves. The question stays open. Leaving costs nothing.

  NO SINGLE KEYSTROKE EVER COMMITS A DECISION. Linear binds 1 accept / 3 decline, which is correct
  for triaging an issue and wrong for an immutable row with a named decider.

  And THE RECOMMENDATION IS DISPLAYED, NEVER PRE-SELECTED. If it were highlighted on open, three
  keystrokes would rubber-stamp the machine's answer with a reason typed under its influence (19 §4).

  THIS IS NO LONGER THE ONLY WAY TO ANSWER, AND IT IS BETTER FOR IT. `/decide` used to print a
  question's options as a sentence inside the card's own link, so every answer in the queue came
  through here: open the question, choose, write prose, commit. The cards press now. One press
  records an answer, the reason is asked for after it and never blocks it, the card keeps saying it
  is not saved, and the way back is on the row.

  So the two screens are two different acts rather than one act and its detour. The card answers a
  question you have already thought about. THIS screen is where one gets EXAMINED: the cost of
  deciding late, the body of every option, the recommendation beside the reasoning it came from, the
  defer with its wake date, and a commit that takes a named decider and a written reason and cannot
  be edited afterwards. Everything below is unchanged, and the reason is still required, because
  that is the ceremony somebody came here for. What both screens now share is one sentence for what
  a decision would write: `record/answer.ts`, so the two cannot drift into telling different stories
  about one act.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { day, since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { DECIDED, DEPLOYMENT, NOW, QUESTIONS, REGISTERS, ROWS, display, whoDid } from '$lib/record/api.ts';
  import { installWords } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import { ARRANGING, PROPOSALS, ROWSETS } from '$lib/record/data.ts';
  import Changes from './Changes.svelte';
  import Proposed from './Proposed.svelte';
  import Arranged from './Arranged.svelte';
  import Applied from './Applied.svelte';
  import { heard } from '$lib/voice.svelte.ts';
  import { appliedLines, arrangedOf, isArranging, partialOf, type Partial } from './arranged.ts';
  import { proposedOf } from './proposed.ts';
  import { updatesOf, words as changeWords } from './changes.ts';
  import { answerFor, wouldRecord, type Answer } from '$lib/record/answer.ts';
  import { plainOf, readOne, words as governed, type One } from '$lib/record/governance.ts';
  import { answerQuestion, parkQuestion, type Written } from '$lib/record/decide-write.ts';
  import { goto, invalidateAll } from '$app/navigation';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  /**
   * WHERE THE QUESTION CAME FROM, as `/decide` decides it: the record through `governance`, the sample
   * when there is no record here, or the record's own sentence when it refuses.
   */
  let from = $state<'reading' | 'live' | 'sample' | 'refused'>('reading');
  let live = $state<One | null>(null);
  let refusal = $state('');
  let client: ReturnType<typeof createClient> | null = null;

  async function readLive(id: string) {
    const at = opened();
    client ??= createClient({ base: location.origin });
    const [out, opens] = await Promise.all([readOne(client, id), client.governance({ status: 'open' })]);
    queue = opens.ok && Array.isArray(opens.value) ? opens.value.map((r: { id?: unknown }) => String(r.id)) : [];
    /* An answer for a question somebody has already navigated away from draws nothing. */
    if (String(page.params.id) !== id) return closed(true, at);
    live = out.from === 'live' ? out.value : null;
    refusal = out.from === 'refused' ? out.fix : '';
    from = out.from;
    closed(out.from !== 'refused', at);
  }

  $effect(() => {
    const id = String(page.params.id);
    untrack(() => void readLive(id));
  });

  /**
   * THE OPEN QUESTIONS IN THE QUEUE'S ORDER, so `j` and `k` and the button after a decision go to the next
   * one rather than back to the list (DESIGN-SYSTEM D2). Read with the question, and not again after a
   * decision, so the one just decided keeps its place and the next is the one after it.
   */
  let queue = $state<string[]>([]);
  const openIds = $derived(from === 'live' ? queue : [...QUESTIONS, ...ARRANGING].sort((a, b) => a.rank - b.rank).map((q) => q.id));
  const here = $derived(openIds.indexOf(String(page.params.id)));
  const nextId = $derived(here >= 0 ? openIds[here + 1] : openIds[0]);
  const prevId = $derived(here > 0 ? openIds[here - 1] : undefined);

  /** The clock a band is read against: the reader's on a live record, the sample's own otherwise. */
  const now = $derived(from === 'live' ? Date.now() : NOW);

  const question = $derived(
    from === 'live'
      ? (live?.question ?? undefined)
      : from === 'sample'
        ? [...QUESTIONS, ...ARRANGING, ...DECIDED].find((q) => q.id === page.params.id)
        : undefined,
  );

  /* WHAT A PAGE, A LIST, A RULE OR A LOOK WOULD PUT ON THE SCREEN, for a proposal that arranges the record. */
  const preview = $derived(from === 'live' && live?.about ? proposedOf(live.about.kind, live.about.body) : null);

  /* A PACK, A SETTINGS CHANGE OR A WHOLE ARRANGEMENT, drawn whole: why, the calls out, the packs, what appears, the words. */
  const about = $derived(from === 'live' ? live?.about : from === 'sample' ? PROPOSALS[String(page.params.id)] : undefined);
  const lists = $derived(
    new Map<string, string>(((page.data.lists ?? page.data.index?.registers ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])),
  );
  const story = $derived(
    about ? arrangedOf(about.kind, about.body, { lists, labels: heard(), pagesNow: from === 'live' ? live?.pagesNow : PROPOSALS[String(page.params.id)]?.pagesNow }) : null,
  );

  /** What an accepted arrangement did, and how far one got when the record stopped part way. */
  let applied = $state<string[]>([]);
  /* WHAT THE RECORD KEPT ON THE DECISION, for a reload and for anybody who did not press accept. */
  const kept = $derived(from === 'live' && live?.applied ? appliedLines(live.applied.did, live.applied.body) : []);
  let part = $state<Partial | null>(null);
  const sidebarNow = (): Map<string, string> =>
    new Map(((page.data.nav ?? []) as { href: string; title: string }[]).map((n) => [n.href, n.title]));

  /* A `rowset` that updates rows: each changed field, as a diff for prose and before and after for the rest. */
  const updates = $derived(
    !question
      ? []
      : from === 'live' && live
        ? updatesOf(live.rowset, live.registers, live.rows, plainOf(live.registers))
        : updatesOf(ROWSETS[question.id], REGISTERS, ROWS, (r, f, v) => display(r, f, v)),
  );

  /** Sent and waiting, and what the record refused, in its own sentence. */
  let sending = $state(false);
  let fix = $state('');
  /** A decision the record took on this screen, which has no way back. */
  let saved = $state(false);

  /** Highlighted, not chosen. The two are different states and the interface says so. */
  let highlighted = $state<string | null>(null);
  let committing = $state<string | null>(null);
  /**
   * Deferring is a DECISION about when, and it takes a reason like every other one.
   *
   * 20 §3's rule is that a choice is immutable and carries a mandatory reason; a defer is a choice
   * to not choose yet, and the thing worth recording is why. "Waiting on Halden's answer" six weeks
   * later is the difference between a question you parked and a question you forgot.
   *
   * The wake date is required too, because a defer without one is a dismissal wearing a nicer word.
   */
  let deferring = $state(false);
  let wake = $state('');
  let reason = $state('');
  let field = $state<HTMLTextAreaElement>();

  const short = $derived(reason.trim().length > 0 && reason.trim().length < 25);

  function choose(key: string) {
    committing = key;
    deferring = false;
    reason = '';
    fix = '';
    queueMicrotask(() => field?.focus());
  }

  function defer() {
    deferring = true;
    committing = null;
    reason = '';
    fix = '';
    /* Seeded a fortnight out — 21 A5, seeds not blanks. A date picker opened on nothing makes the
       person do arithmetic before they can say the thing they already know. */
    wake = new Date(now + 14 * 86_400_000).toISOString().slice(0, 10);
    queueMicrotask(() => field?.focus());
  }

  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    /* AND A COMMITTED QUESTION IS AS INERT AS A DECIDED ONE. The guard tested the record and not
       this session, so after a commit the number keys still moved a highlight behind the settled
       block and the commit chord was one field away from firing twice. */
    /* THE NEXT AND THE PREVIOUS OPEN QUESTION, from anywhere on the gate but a field, decided or not. */
    if ((e.key === 'j' || e.key === 'k') && !e.metaKey && !e.ctrlKey && !e.altKey && !typing() && !silenced(e)) {
      const to = e.key === 'j' ? nextId : prevId;
      if (to && to !== page.params.id) {
        e.preventDefault();
        void goto(`/decide/${to}`);
      }
      return;
    }
    if (!question || question.decided || committed || (from === 'live' && live?.closed)) return;
    /* THE COMMIT CHORD KEEPS THE NARROW TEST, AND THE BARE KEYS BELOW DO NOT. This const is read
       two ways: below it gates Mod+Enter, where it must be TRUE, and further down it silences bare
       keys, where it must be FALSE. Widening it would widen both, and the direction that matters is
       that the one keystroke here writing an immutable row should fire from fewer places rather than
       more. So the chord keeps this event-target test and the bare keys use `typing()`. */
    const inField = e.target instanceof HTMLElement && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');

    /* ONLY FROM INSIDE THE REASON FIELD, and only with content — 19 §4's own row. This branch ran
       before the bare key test below it, so the one keystroke in this product that writes an
       immutable row with a named decider on it fired from anywhere on the page: with focus on
       Cancel, or aimed at another application. A gate this file's header calls "deliberately slower
       than every precedent" had a commit chord that was faster than everything. */
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (!inField) return;
      e.preventDefault();
      if (committing && reason.trim()) commit();
      return;
    }
    /* AND THE ONE TEST FOR TYPING, not a narrower copy. This read the event target for INPUT and
       TEXTAREA only, so a bare number key moved the highlight while somebody was inside an open
       select or a contenteditable block. */
    if (typing()) return;
    if (silenced(e)) return;

    const n = Number(e.key);
    if (n >= 1 && n <= question.options.length) {
      e.preventDefault();
      highlighted = question.options[n - 1]!.key;
      return;
    }
    if (e.key === 'Enter' && highlighted) {
      e.preventDefault();
      choose(highlighted);
      return;
    }
    if (e.key === 'd' && !committing && !deferring) {
      e.preventDefault();
      defer();
      return;
    }
    if (e.key === 'Escape' && deferring) {
      e.preventDefault();
      deferring = false;
      return;
    }
    if (e.key === 'Escape' && committing) {
      e.preventDefault();
      committing = null;
    }
  }

  /**
   * The mock-up stops here — and it says what it would have written.
   *
   * IT ANSWERED THE PRODUCT'S CENTRAL ACT WITH THE GENERIC NOTICE. Every other terminal action in
   * this app names the change it would make: the rule that would be written and tested against the
   * last thirty days, the pack whose install plan would be shown first, the row that would be
   * created from an arrival. This one — the immutable row, with a person's name and their reason on
   * it, that the whole gate exists to slow down — said "nothing writes" and stopped. The one act
   * worth describing described itself least.
   *
   * AND THE SENTENCE IS NOT TYPED HERE ANY MORE. `/decide` answers the same question with one press
   * on the card and owes its reader the same receipt; this screen assembled its own copy of the
   * words out of `question.options.find(…)` and a template literal, which is two spellings of one
   * act sitting a refactor away from disagreeing. Both read it out of `record/answer.ts` now, and
   * `answerFor` is what refuses a key the question does not offer rather than printing `undefined`
   * into the middle of a receipt, which is what the old `?? committing` fallback did with a blank
   * question id beside it.
   */
  /**
   * AND COMMITTING CHANGED NOTHING BUT A BOOLEAN, on the central act of this product.
   *
   * `committed = true` pushed the toast and stopped there. The reason field stayed filled, the
   * button stayed live behind `disabled={!reason.trim()}`, and one line appeared under it saying
   * nothing is saved yet, so pressing again gave a second identical receipt for one immutable row
   * with a person's name on it. Somebody who watched the toast fade had no way to tell whether the
   * first press had landed, and the shape of a dead control is the shape a person retries.
   *
   * THE ANSWER IS KEPT NOW, NOT A FLAG SAYING ONE HAPPENED, because the settled block below needs
   * the four facts a receipt is made of: who, when, which option, and the reason as it was written
   * at the press. `/decide` already answers this same act correctly, with an answered state and a
   * way back, and two screens must not answer one act two ways.
   */
  let committed = $state<Answer | null>(null);
  async function commit() {
    const a = committing ? answerFor(question, committing, new Date(now).toISOString()) : null;
    if (!a) return;
    const said: Answer = { ...a, reason };
    if (from !== 'live' || !client) {
      committed = said;
      toasts.push(copy.notWritten(wouldRecord(said)), { intent: 'warn' });
      setTimeout(() => document.getElementById('next-question')?.focus());
      return;
    }
    /* ON A LIVE RECORD IT IS SENT, with the reason `decide` requires, and only a yes settles it. */
    if (sending) return;
    sending = true;
    const accepting = a.option === 'accept' && about !== undefined && isArranging(about.kind) ? about : null;
    const had = accepting ? sidebarNow() : null;
    const out = await answerQuestion(location.origin, a.question, a.option, reason);
    sending = false;
    /* AN ARRANGEMENT THAT DID NOT ALL LAND. The record reopened the question, so the options come back under what was
       done and what was not, and the rail reads again for what did land. */
    if (accepting && out.from === 'refused') {
      part = partialOf(accepting.kind, accepting.body, out.fix) ?? { why: out.fix, done: [], left: [] };
      committing = null;
      fix = '';
      toasts.push(part.done.length ? copy.arrangePartial : copy.arrangeNotApplied, { intent: 'warn' });
      await invalidateAll();
      return;
    }
    if (await unsent(out, a.question)) return;
    fix = '';
    part = null;
    saved = true;
    committed = said;
    toasts.push(copy.decisionRecorded(a.title, a.question), { intent: 'good' });
    if (accepting && out.from === 'written' && had) {
      applied = appliedLines(out.applied ?? {}, accepting.body);
      await invalidateAll();
      const added = [...sidebarNow()].filter(([href]) => !had.has(href)).map(([, title]) => title);
      if (added.length) applied = appliedLines(out.applied ?? {}, accepting.body, added);
    } else void invalidateAll();
    setTimeout(() => document.getElementById('next-question')?.focus());
  }

  /**
   * A WRITE THAT DID NOT LAND, said under the control and as a warning. A conflict is a row the
   * proposal changes that moved since it was filed, so the question is read again before it is
   * answered again. True when there is nothing more to do.
   */
  async function unsent(out: Written, id: string): Promise<boolean> {
    if (out.from === 'written') return false;
    fix = out.fix;
    toasts.push(out.fix, { intent: 'warn' });
    if (out.from === 'conflict') await readLive(id);
    return true;
  }

  /** Parking it: said on the sample, sent to `decide` with the day and the why on a live record. */
  async function deferIt() {
    if (from !== 'live' || !client) {
      deferring = false;
      /* THE DAY, SPELLED. Every other date in the product reads "17 Sep 2026"; this one printed
         `2026-09-17`, the storage spelling, in a sentence about when somebody will next look at a
         decision. `day()` is the one formatter and it was one call away. */
      toasts.push(copy.deferred(day(wake)), { intent: 'warn' });
      if (nextId && nextId !== page.params.id) void goto(`/decide/${nextId}`);
      return;
    }
    if (!question || sending) return;
    sending = true;
    const out = await parkQuestion(location.origin, question.id, wake, reason);
    sending = false;
    if (await unsent(out, question.id)) return;
    fix = '';
    deferring = false;
    toasts.push(copy.parkedUntil(day(wake)), { intent: 'good' });
    void invalidateAll();
    /* PARKED, SO IT HAS LEFT THE QUEUE: the next question, as a decision takes you to it. */
    if (nextId && nextId !== page.params.id) void goto(`/decide/${nextId}`);
  }

  /**
   * The decision this screen is showing, whichever of the two ways it got here.
   *
   * A question the record already carries and one answered a moment ago are the same thing to a
   * reader, so they are drawn by one block rather than by two that can drift. The option's title
   * is resolved here for the stored case and travels with the answer for the fresh one, which is
   * `answer.ts`'s own rule: a receipt that re-reads the question to find out what it was about is
   * a receipt that changes its story if the question does.
   */
  const settled = $derived(
    committed ??
      (question?.decided
        ? {
            by: question.decided.by,
            at: question.decided.at,
            title:
              question.options.find((o) => o.key === question.decided?.option)?.title ?? question.decided.option,
            reason: question.decided.reason,
          }
        : null),
  );

  /**
   * The inverse of the press, and it puts the reason back where it was typed.
   *
   * `loop/REWORK.md` §4 is why it exists at all: nothing was written, and a person who has just
   * watched a receipt appear needs a way to check they pressed the right thing that is not
   * pressing it again. Focus follows, because the field it goes back to is the one they were in.
   */
  function takeBack() {
    committed = null;
    queueMicrotask(() => field?.focus());
  }

  /**
   * DRAWN ONCE THE READ HAS ANSWERED, live or the sample. The read is bracketed by `opened()` and
   * `closed()`, so a call still out takes `data-screen` away whatever this says.
   */
  $effect(() => {
    if (from === 'live' || from === 'sample') drew('ready');
  });

  /* `d` ON THE QUEUE LANDS HERE WITH `?defer`, and opens the defer step it asked for, once per question. */
  let deferOpened = '';
  $effect(() => {
    const id = question?.id;
    if (!id || deferOpened === id || !page.url.searchParams.has('defer')) return;
    if (question.decided || (from === 'live' && live?.closed)) return;
    deferOpened = id;
    untrack(() => defer());
  });
</script>

<svelte:head><title>{titleOf(question?.title, copy.decide)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if from === 'reading'}
  <!-- Bars, and after 300ms, until the read answers. -->
  <Waiting head />
{:else if from === 'refused'}
  <div class="page">
    <Empty kind="error" heading title={refusal}>
      {#snippet actions()}<Button href="/decide">Back to Decide</Button>{/snippet}
    </Empty>
  </div>
{:else if !question}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty kind="error" heading title={copy.noSuch('question', String(page.params.id))}>
      {#snippet actions()}<Button href="/decide">Back to Decide</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon="decide" kicker={copy.decide} title={question.title} id={question.id} />

  <div class="page">
    <!-- THE BLOCK EXISTED AND ONLY THE RECORD COULD REACH IT. It was gated on `question.decided`,
         so a question decided a moment ago on this screen went on showing the options, the reason
         field and a live commit button, which is the one state where the product has to say plainly
         that it is finished. -->
    <!-- HOW FAR AN ACCEPTED ARRANGEMENT GOT LEADS, because it is the news; what it would do follows, unchanged. -->
    {#if part && !settled}<Applied partial={part} />{/if}
    {#if story && !settled}
      <section class="changed" aria-label={story.lead}>
        <Arranged arranged={story} />
      </section>
    {/if}

    {#if preview && !settled}
      <section class="changed">
        <div class="options-head">
          <h2 class="options-title">{copy.proposalWillAppear}</h2>
        </div>
        <Proposed proposed={preview} />
      </section>
    {/if}

    {#if updates.length}
      <section class="changed">
        <div class="options-head">
          <h2 class="options-title">{changeWords.heading}</h2>
        </div>
        <Changes {updates} />
      </section>
    {/if}

    <!-- WHAT ACCEPTING WOULD CALL OUT, before the press: every host, how often, the key by label and the fields
         sent, as the record worked them out when the proposal was filed. Accept and Decline below are the one
         approval (`research-scheduled-actions.md` §5), so the lines go once the question is settled. -->
    {#if from === 'live' && live && live.calls.length > 0 && !settled && !live.closed}
      <section class="changed">
        <dl class="calls-out">
          <CallsOut calls={live.calls} hosted={DEPLOYMENT.kind !== 'self-host'} note={installWords.acceptApproves} />
        </dl>
      </section>
    {/if}

    {#if settled}
      <div class="settled">
        <p class="settled-head">
          <Icon name="check" size="m" />
          {copy.decidedBy}
          {whoDid(settled.by, String(page.data.me?.person ?? '') || null, new Map(Object.entries((page.data.names ?? {}) as Record<string, string>))).name}, {since(settled.at, now)}
        </p>
        <p class="settled-choice">{settled.title}</p>
        <p class="settled-reason">“{settled.reason}”</p>
        <p class="settled-note">{copy.immutable}</p>
        {#if applied.length}<div class="settled-applied"><Applied lines={applied} /></div>
        {:else if kept.length}<div class="settled-applied"><Applied lines={kept} /></div>{/if}
        <!-- NOT SAVED, ON THE RECEIPT, and the way back beside it. `Chip` draws it because the tone
             carries its own glyph and nothing in this app renders an intent without one (13 §5.1):
             a receipt that only went amber says nothing to a screen reader. Only for a decision
             made in this session, because one the record carries IS saved. -->
        {#if committed && !saved}
          <div class="settled-mock">
            <Chip label={copy.markNotWritten} tone="warn" />
            <Button weight="bare" aria-label={copy.takeItBackOf(question.title)} onclick={takeBack}>
              {copy.takeItBack}
            </Button>
          </div>
        {/if}
        {#if committed && nextId && nextId !== question.id}
          <div class="settled-next">
            <Button weight="primary" href="/decide/{nextId}" id="next-question">{copy.decideNext}</Button>
          </div>
        {/if}
      </div>
    {:else if from === 'live' && live?.closed}
      <!-- SETTLED, AND ITS DECISION IS NOT AMONG THE ONES READ. Nothing here can answer it again. -->
      <p class="cost-age">{governed.closed(question.id)}</p>
    {:else}
      <section class="cost">
        {#if question.context}
          <h2 class="cost-label">{copy.whyAsked}</h2>
          <p class="cost-body context">{symbolText(question.context)}</p>
        {/if}
        {#if question.cost}
          <h2 class="cost-label">{copy.costOfDelay}</h2>
          <p class="cost-body">{symbolText(question.cost)}</p>
        {/if}
        <p class="cost-age">Opened {since(question.opened, now)}. Nobody has decided it.</p>
      </section>

      <section class="options">
        <div class="options-head">
          <h2 class="options-title">{copy.theOptions}</h2>
        </div>

        <div class="cards" data-cells={question.options.length}>
          {#each question.options as option, i}
            <article class="card" data-on={highlighted === option.key ? '' : undefined}>
              <header class="card-head">
                <span class="card-n num">{i + 1}</span>
                <h3 class="card-title">{option.title}</h3>
                <!-- Shown, never pre-selected. -->
                {#if option.recommended}<span class="card-rec">{copy.recommended}</span>{/if}
              </header>
              <p class="card-body">{option.body}</p>
              <Button weight={highlighted === option.key ? 'primary' : 'quiet'} onclick={() => choose(option.key)}>
                {copy.chooseThis(option.title)}
              </Button>
            </article>
          {/each}
        </div>
      </section>

      {#if deferring}
        <section class="commit">
          <h2 class="commit-title">
            {copy.deferTitle}
            <span class="commit-required">{copy.required}</span>
          </h2>
          <textarea
            bind:this={field}
            bind:value={reason}
            class="commit-field"
            rows="2"
            placeholder={copy.deferHint}
            spellcheck="true"
          ></textarea>
          <label class="commit-wake">
            {copy.wakeOn}
            <input class="commit-date" type="date" bind:value={wake} />
          </label>
          <div class="commit-actions">
            <Button weight="primary" disabled={!reason.trim() || !wake || sending} onclick={deferIt}>
              {copy.deferAction}
            </Button>
            <Button weight="bare" onclick={() => (deferring = false)}>{copy.arrangeCancel}</Button>
          </div>
          {#if fix}<p class="commit-fix" role="status" data-intent="bad">{fix}</p>{/if}
        </section>
      {:else if committing}
        <section class="commit">
          <h2 class="commit-title">
            {copy.yourReason}
            <span class="commit-required">required</span>
          </h2>
          <p class="commit-choice">
            You are choosing <strong>{question.options.find((o) => o.key === committing)?.title}</strong>.
          </p>
          <textarea
            bind:this={field}
            bind:value={reason}
            class="commit-field"
            rows="3"
            placeholder={copy.reasonHint}
            spellcheck="true"
          ></textarea>
          <!-- Nudged once, never blocked: a person who means it should be able to keep it (20 §3). -->
          {#if short}<p class="commit-nudge">{copy.reasonNudge}</p>{/if}
          <!-- A DISABLED CONTROL SAYS WHY IT IS DISABLED. The only cue was the small word "required"
               above the box, and 23 §8's rule is that a control which refuses without a reason is
               the thing this product does not ship. It is announced too: `aria-describedby` points
               at the sentence, so somebody who cannot see the greying is told the same fact. -->
          {#if !reason.trim()}<p class="commit-why" id="commit-why">{copy.reasonRequired}</p>{/if}
          <div class="commit-actions">
            <Button
              weight="primary"
              disabled={!reason.trim() || sending}
              aria-describedby={reason.trim() ? undefined : 'commit-why'}
              onclick={commit}
            >
              {copy.commit}
            </Button>
            <Button weight="bare" onclick={() => (committing = null)}>Cancel</Button>
            <!-- ONE WARNING AT A TIME. `commit-why` above already says "kept for ever and cannot be
                 edited"; this said the same thing in different words six lines below it, so an empty
                 reason produced the same caution twice and neither read as the reason the button was
                 off. It belongs where it is the only thing left to say: the button is live, and the
                 next press is the irreversible one. -->
            {#if reason.trim()}<span class="commit-note">{copy.immutable}</span>{/if}
          </div>
          {#if fix}<p class="commit-fix" role="status" data-intent="bad">{fix}</p>{/if}
          <!-- THE LINE THAT SAID "Nothing you do here is saved yet." UNDER A STILL-LIVE BUTTON is
               gone: this panel is replaced by the settled block the moment the press lands, and the
               chip on that block carries the same fact where it is the whole of the news. -->
        </section>
      {:else}
        <div class="third">
          <!-- The third verb, kept: a queue with only yes and no is a queue that gets rubber-stamped.
               It had no handler, so the one control that stops a gate being cleared by dismissing
               things did nothing — while `d` on the keyboard opened the same flow correctly. -->
          <Button onclick={defer}>{copy.defer}</Button>
          <span class="third-note">{copy.deferHint}</span>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .cost {
    max-inline-size: var(--measure);
  }

  .cost-label {
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .cost-body {
    margin-block-start: var(--sp-1);
    color: var(--ink);
  }

  /* THE REASONING KEEPS ITS LINES, and the cost heading after it has room above it. */
  .context {
    white-space: pre-line;
    margin-block-end: var(--sp-3);
  }

  .cost-age {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .options-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-3);
  }

  .options-title {
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .calls-out {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
  }


  /* Told how many things it contains. `auto-fit` with three items in a 962px column generated SEVEN
     tracks, four of them empty — a 550px slab of border colour, with every selector correct (05 §4). */
  /* The options sit on the page's own ground, side by side, with space between them. The chosen one
     takes the raised surface; its button is the page's one primary. The negative inset keeps the text
     of the first option on the heading's edge while the chosen one still has room for its surface. */
  .cards {
    display: grid;
    grid-template-columns: repeat(var(--cells, 3), minmax(0, 1fr));
    gap: var(--sp-2);
    margin-inline: calc(-1 * var(--sp-4));
  }

  .cards[data-cells='2'] {
    --cells: 2;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    border-radius: var(--r-md);
    transition: background var(--d-state) var(--ease-out);
  }

  .card[data-on] {
    background: var(--s1);
  }

  .card > :global(.btn) {
    align-self: start;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* The option's number, in the body face with nothing round it. A boxed digit in the id face
     read as a key to press, and the card is already the box. */
  .card-n {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .card[data-on] .card-n {
    color: var(--ink);
  }

  .card-title {
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 500;
    letter-spacing: -0.005em;
  }

  /* The suggestion as a word in the quiet ink, not a green chip. */
  .card-rec {
    margin-inline-start: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .card-body {
    flex: 1;
    color: var(--dim);
    font-size: var(--t-ui);
    line-height: 1.55;
  }

  /* An inline callout: the raised surface and nothing round it in the dark, a hairline in the light. */
  .commit {
    max-inline-size: var(--measure);
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 1px solid transparent;
    border-radius: var(--r-md);
  }

  :global(:root[data-scheme='light']) .commit,
  :global(:root[data-scheme='light']) .settled {
    border-color: var(--line);
  }

  @media (prefers-color-scheme: light) {
    :global(:root:not([data-scheme='dark'])) .commit,
    :global(:root:not([data-scheme='dark'])) .settled {
      border-color: var(--line);
    }
  }

  .commit-wake {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .commit-date {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  /* A HEADING IS AS TALL AS ITS DESCENDERS, AND HAS ROOM UNDER IT. Measured 18.297px against a
     `line-height` of 18.3, with the textarea starting flush at that boundary, so the tails of "Why"
     and "yet" were painted over. An earlier version of this comment blamed `display: flex` for
     collapsing the box; that is wrong — the `display: block` sibling `.options-title` measures the
     same 18.297px, because the height comes from the line box either way. What fixed it is the two
     declarations below: a line-height with room for a descender, and space between the heading and
     the field. The commit-reason panel uses the same `h2` and escaped only because a sub-line
     happens to sit between it and its field. */
  .commit-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
    line-height: 1.4;
  }

  .commit-required {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 400;
  }

  .commit-choice {
    margin-block: var(--sp-1) var(--sp-3);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .commit-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--bg);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    resize: vertical;
  }

  .commit-why {
    margin-block: var(--sp-2) 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .commit-fix {
    margin-block-start: var(--sp-2);
    font-size: var(--t-ui);
  }

  .commit-nudge {
    margin-block-start: var(--sp-2);
    color: var(--warn);
    font-size: var(--t-ui);
  }

  .commit-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
  }

  .commit-note,
  .third-note {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .third {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .settled {
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    max-inline-size: var(--measure);
  }

  .settled-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .settled-head :global(.icon) {
    color: var(--earn);
  }

  .settled-choice {
    margin-block: var(--sp-2) var(--sp-1);
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 500;
    letter-spacing: -0.01em;
  }

  .settled-reason {
    color: var(--ink2);
  }

  .settled-note {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .settled-applied {
    margin-block-start: var(--sp-4);
  }

  /* The chip and the way back, on one line, under the receipt they belong to. */
  .settled-next {
    margin-block-start: var(--sp-4);
  }

  .settled-mock {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    /* The gate is a first-class phone surface, not a degraded one: options as stacked cards, and the
       reason field above the fold. Decisions get made from a phone (19 §3). */
    .cards {
      grid-template-columns: minmax(0, 1fr);
      margin-inline: 0;
    }

    .card {
      padding-inline: 0;
      border-block-start: 1px solid var(--line-soft);
      border-radius: 0;
    }

    .card[data-on] {
      padding-inline: var(--sp-3);
      border-block-start-color: transparent;
      border-radius: var(--r-md);
    }
  }
</style>
