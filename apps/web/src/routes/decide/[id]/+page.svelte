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
  picks an answer, the reason that sends it is asked for after it, and the way back is on the row.

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
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { day, queueCost, since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { whoDid } from '$lib/record/api.ts';
  import { installWords } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import Cited from '$lib/ui/Cited.svelte';
  import { figuresIn, reasonIn } from '$lib/cite.ts';
  import Changes from './Changes.svelte';
  import Proposed from './Proposed.svelte';
  import Arranged from './Arranged.svelte';
  import Applied from './Applied.svelte';
  import { heard } from '$lib/voice.svelte.ts';
  import { appliedLines, arrangedOf, isArranging, partialOf, type Partial } from './arranged.ts';
  import { proposedOf } from './proposed.ts';
  import { updatesOf, words as changeWords } from './changes.ts';
  import { pickableOf, rowsToSend, words as pickWords } from './picked.ts';
  import { answerFor, type Answer } from '$lib/record/answer.ts';
  import { everyGovernance, plainOf, readOne, words as governed, type One } from '$lib/record/governance.ts';
  import { answerQuestion, parkQuestion, type Written } from '$lib/record/decide-write.ts';
  import { visualOf, type Visual } from '$lib/page/queue-answer.ts';
  import { mayAnswer, whyNotAnswering } from '../answering.ts';
  import { nextOpen, stillWaiting, words as onwardWords } from './onward.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { hostedHere } from '../../settings/billing.ts';
  import { goto, invalidateAll } from '$app/navigation';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Thread from '$lib/ui/Thread.svelte';
  import { gateSentence, WORDS as LEAD } from '../lead.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  /**
   * WHERE THE QUESTION CAME FROM, as `/decide` decides it: the record through `governance`, or the
   * host's own sentence when it refuses. The sample that stood in for a host with no record is gone,
   * and with it every press on this screen that wrote nothing.
   */
  let from = $state<'reading' | 'live' | 'refused'>('reading');
  let live = $state<One | null>(null);
  let refusal = $state('');
  let client: ReturnType<typeof createClient> | null = null;

  async function readLive(id: string) {
    const at = opened();
    client ??= createClient({ base: apiBase() });
    const [out, opens] = await Promise.all([readOne(client, id), everyGovernance(client, { status: 'open' })]);
    queue = opens.ok ? opens.value.map((r) => String(r.id)) : [];
    /* An answer for a question somebody has already navigated away from draws nothing. */
    if (String(page.params.id) !== id) return closed(true, at);
    live = out.from === 'live' ? out.value : null;
    unticked = [];
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
   * one rather than back to the list. Read with the question, and not again after a
   * decision, so the one just decided keeps its place and the next is the one after it.
   */
  let queue = $state<string[]>([]);
  /* THE RECORD'S OWN QUEUE, AND AN EMPTY ONE WHEN THAT READ WAS REFUSED TOO. A refused screen once offered
     `Next question` to a sample id the record never held, because the sample's queue stood in for every
     state but `live`. */
  const here = $derived(queue.indexOf(String(page.params.id)));
  const nextId = $derived(here >= 0 ? queue[here + 1] : queue[0]);
  const prevId = $derived(here > 0 ? queue[here - 1] : undefined);
  /* AND THE WAY ON ONCE THIS QUESTION IS NO LONGER OPEN, which is not `nextId`: that one stops at the
     end of the queue for `j`, and a screen that has just settled a question must not stop anywhere.
     See `onward.ts` for the two cases `nextId` got wrong. */
  const onwardTo = $derived(nextOpen(queue, String(page.params.id)));
  const waiting = $derived(stillWaiting(queue, String(page.params.id)));

  /* THE CLOCK A BAND IS READ AGAINST, taken when the read answers. Nothing reads it before then: the
     question and every press on it are drawn only once `from` is `live`. */
  const now = $derived(from === 'live' ? Date.now() : 0);

  /**
   * WHETHER THIS READER MAY ANSWER, WHICH THIS SCREEN NEVER ASKED EITHER.
   *
   * `/decide` WAS REPAIRED AND THIS WAS NOT, AND IT IS THE DEEPER DEAD END OF THE TWO. A reader gets
   * here from the card link on that same queue. The queue answers in one press, so its dead end cost
   * a press, a paragraph and a second press. This screen is deliberately slower than the queue, and
   * every part of that slowness is spent by somebody who is going to be refused: `Choose this` opens
   * a REQUIRED reason box, the commit stays off while the box is empty, "required" is said twice
   * above it, and the reason is the whole ceremony somebody came here for. Then the record answers.
   *
   * COUNTED FROM THIS FILE for a three-option question, before: four controls inside the
   * decision, being three `Choose this` buttons and `Defer`, NOT ONE of them disabled, and no word
   * anywhere on the page about access. Two ways in and neither asked: the buttons, and the keyboard,
   * where `Enter` on a highlighted option calls `choose` and `d` calls `defer`.
   *
   * SO THE SENTENCE IS THE RECORD'S OWN, MOVED IN FRONT OF THE OPTIONS, and the module it comes from
   * is the one the queue already reads. `answering.ts` exists so that this screen is not a fourth
   * spelling of one rule, and a colleague who reads the hint here, reads it on the queue, or presses
   * through to the refusal meets the same words three times over.
   */
  const me = $derived((page.data as unknown as Shell).me);
  const answerable = $derived(mayAnswer(me.level, me.owner));
  const whyNot = $derived(whyNotAnswering(me.level, me.lists));

  const question = $derived(from === 'live' ? (live?.question ?? undefined) : undefined);

  /* WHAT A PAGE, A LIST, A RULE OR A LOOK WOULD PUT ON THE SCREEN, for a proposal that arranges the record. */
  const preview = $derived(from === 'live' && live?.about ? proposedOf(live.about.kind, live.about.body) : null);

  /* A PACK, A SETTINGS CHANGE OR A WHOLE ARRANGEMENT, drawn whole: why, the calls out, the packs, what appears, the words. */
  const about = $derived(from === 'live' ? live?.about : undefined);

  /* WHAT EACH OPTION IS, drawn inside its own card as the queue's tile draws it. It is read from the body the question
     was filed with, because the question's words carry none, and through `visualOf`, which holds a swatch to the
     renderer's own spelling before it reaches a style. A file is left out here for the reason the tile leaves it out:
     only a page's renderer is handed the address a file is served at. */
  const visuals = $derived.by(() => {
    const offered = about?.kind === 'options' && Array.isArray(about.body.options) ? (about.body.options as unknown[]) : [];
    const out = new Map<string, Visual>();
    for (const o of offered) {
      if (o === null || typeof o !== 'object') continue;
      const { id, shows } = o as { id?: unknown; shows?: unknown };
      const seen = typeof id === 'string' ? visualOf(shows) : null;
      if (seen !== null && typeof id === 'string') out.set(id, seen);
    }
    return out;
  });
  const lists = $derived(
    new Map<string, string>(((page.data.lists ?? page.data.index?.registers ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])),
  );
  const story = $derived(
    about ? arrangedOf(about.kind, about.body, { lists, labels: heard(), pagesNow: live?.pagesNow }) : null,
  );

  /** What an accepted arrangement did, and how far one got when the record stopped part way. */
  let applied = $state<string[]>([]);
  /* WHAT THE RECORD KEPT ON THE DECISION, for a reload and for anybody who did not press accept. */
  const kept = $derived(from === 'live' && live?.applied ? appliedLines(live.applied.did, live.applied.body) : []);
  let part = $state<Partial | null>(null);
  const sidebarNow = (): Map<string, string> =>
    new Map(((page.data.nav ?? []) as { href: string; title: string }[]).map((n) => [n.href, n.title]));

  /* A `rowset` that updates rows: each changed field, as a diff for prose and before and after for the rest. */
  const updates = $derived(question && live ? updatesOf(live.rowset, live.registers, live.rows, plainOf(live.registers)) : []);

  /** Sent and waiting, and what the record refused, in its own sentence. */
  let sending = $state(false);
  let fix = $state('');

  /** Highlighted, not chosen. The two are different states and the interface says so. */
  let highlighted = $state<string | null>(null);
  let committing = $state<string | null>(null);

  /* A PROPOSAL THAT ADDS SEVERAL ROWS, one tick each: Accept takes the ticked ones and declines the rest. */
  const pickable = $derived(from === 'live' && live?.about ? pickableOf(live.about.kind, live.about.body) : []);
  let unticked = $state<number[]>([]);
  const picked = $derived(rowsToSend(pickable.length, unticked));
  const noneTicked = $derived(committing === 'accept' && pickable.length > 0 && picked === null);
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
    /* A READER WHO MAY NOT ANSWER IS TOLD BEFORE THE REASON BOX OPENS, AND NOT AFTER THE PARAGRAPH.
       The buttons below are off, but off is not closed: `Enter` on a highlighted option arrives here
       with no button in the way, and a required reason box that opens for somebody whose access
       cannot reach the commit is the dead end this screen is being repaired for, with one more
       keystroke in it. The words are the standing hint's, so the toast and the sentence agree. */
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
    committing = key;
    deferring = false;
    reason = '';
    fix = '';
    queueMicrotask(() => field?.focus());
  }

  function defer() {
    /* AND THE THIRD VERB IS A DECISION TOO. A defer takes a reason and a wake date and is sent to
       `decide` like every other answer, so a gate with its two answers off and its defer live is
       still a dead end, just a quieter one. Guarded here rather than in `deferIt` because `d` on the
       keyboard and `?defer` on the URL both land on this function, and both of them precede the
       typing that the refusal would otherwise arrive after. */
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
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
        void goto(at(`/decide/${to}`));
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
   * THE ANSWER IS BUILT BY `record/answer.ts`, NOT TYPED HERE. `/decide` answers the same question with
   * one press on the card; this screen assembled its own copy of the words out of `question.options.find(…)`
   * and a template literal, which is two spellings of one act sitting a refactor away from disagreeing.
   * `answerFor` is what refuses a key the question does not offer rather than printing `undefined` into
   * the middle of a receipt, which is what the old `?? committing` fallback did with a blank question id
   * beside it.
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
    /* IT IS SENT, with the reason `decide` requires, and only a yes settles it. */
    if (from !== 'live' || !client || sending) return;
    sending = true;
    const accepting = a.option === 'accept' && about !== undefined && isArranging(about.kind) ? about : null;
    const had = accepting ? sidebarNow() : null;
    const out = await answerQuestion(apiBase(), a.question, a.option, reason, undefined, a.option === 'accept' && picked ? picked : undefined);
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
    committed = said;
    toasts.push(copy.decisionRecorded(a.title), { intent: 'good' });
    if (accepting && out.from === 'written' && had) {
      applied = appliedLines(out.applied ?? {}, accepting.body);
      await invalidateAll();
      const added = [...sidebarNow()].filter(([href]) => !had.has(href)).map(([, title]) => title);
      if (added.length) applied = appliedLines(out.applied ?? {}, accepting.body, added);
    } else void invalidateAll();
    setTimeout(() => document.getElementById('way-on')?.focus());
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

  /** Parking it: sent to `decide` with the day and the why. */
  async function deferIt() {
    if (from !== 'live' || !client || !question || sending) return;
    sending = true;
    const out = await parkQuestion(apiBase(), question.id, wake, reason);
    sending = false;
    if (await unsent(out, question.id)) return;
    fix = '';
    deferring = false;
    /* THE DAY, SPELLED. Every other date in the product reads "17 Sep 2026"; the parked toast once printed
       `2026-09-17`, the storage spelling, in a sentence about when somebody will next look at a decision. */
    toasts.push(copy.parkedUntil(day(wake)), { intent: 'good' });
    void invalidateAll();
    /* PARKED, SO IT HAS LEFT THE QUEUE: the next question, as a decision takes you to it, and the
       queue when there is none. Staying put was the dead end: the read is not taken again here, so
       the question it had just parked was drawn open underneath the toast that said it was parked. */
    void goto(at(onwardTo ? `/decide/${onwardTo}` : '/decide'));
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

  /* THE SENTENCE UNDER THE TITLE, while the question is still open: how many options, which is suggested, and how long
     it has been open (`../lead.ts`). A settled or closed question says what happened in its own block instead. */
  const gateSaid = $derived(question && !settled && !(from === 'live' && live?.closed) ? gateSentence(question, now) : undefined);

  /* WHAT THE COST TILE IS CALLED: the cost of deciding late when whoever asked wrote one, else the cost of getting it
     wrong, which the record worked out; so a tile is never headed by a cost it does not hold. */
  const costTitle = $derived(question?.cost || !queueCost(question?.band ?? '') ? copy.costOfDelay : copy.costOfWrong);

  /**
   * DRAWN ONCE THE READ HAS ANSWERED LIVE. The read is bracketed by `opened()` and `closed()`, so a call
   * still out takes `data-screen` away whatever this says.
   */
  $effect(() => {
    if (from === 'live') drew('ready');
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

  /* AND AN OPTION PRESSED IN A `queue` BLOCK LANDS HERE HIGHLIGHTED, once per question. That does not
     break the rule at the top of this file: what is marked is the reader's own press on the page they
     came from, not the machine's recommendation, and highlighted is still not chosen. The reason is
     typed here and nothing is written without it. An option this question does not offer is ignored. */
  let cameWith = '';
  $effect(() => {
    const id = question?.id;
    const want = page.url.searchParams.get('option');
    if (!id || cameWith === id || !want) return;
    if (question.decided || (from === 'live' && live?.closed)) return;
    cameWith = id;
    if (question.options.some((o) => o.key === want)) highlighted = want;
  });
</script>

<svelte:head><title>{titleOf(question?.title, copy.decide)}</title></svelte:head>

<svelte:window {onkeydown} />

<!-- THE WAY ON, ONE SNIPPET FOR EVERY STATE THAT IS NOT AN OPEN QUESTION: settled, closed, refused and
     not found. The settled block drew `Next question` only for a press made in this session and only
     when the question was not last in the queue, so a decision reached from the Decided list, or the
     last one answered, ended the page with nothing to press. The queue is offered whatever else is,
     and the inbox when something waits there, which is what `/decide` offers when it is clear. -->
{#snippet onward()}
  <div class="onward">
    {#if onwardTo}<Button weight="primary" href="/decide/{onwardTo}" id="way-on">{copy.decideNext}</Button>{/if}
    <Button weight={onwardTo ? 'quiet' : 'primary'} href="/decide" id={onwardTo ? undefined : 'way-on'}>{onwardWords.back}</Button>
    {#if !onwardTo && Number(page.data.inbox ?? 0) > 0}<Button href="/inbox">{copy.decideOpenInbox}</Button>{/if}
  </div>
{/snippet}

{#if from === 'reading'}
  <!-- Bars, and after 300ms, until the read answers. -->
  <Waiting head />
{:else if from === 'refused'}
  <div class="page">
    <Empty kind="error" heading title={refusal}>
      {#snippet actions()}{@render onward()}{/snippet}
    </Empty>
  </div>
{:else if !question}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty kind="error" heading title={copy.noSuch('question', String(page.params.id))} body={onwardWords.left(waiting)}>
      {#snippet actions()}{@render onward()}{/snippet}
    </Empty>
  </div>
{:else}
  <!-- THE QUESTION IS THE TITLE, and the sentence under it says how many ways there are to answer, which one is
       suggested, and how long it has been open. -->
  <PageHead icon="decide" kicker={copy.decide} back="/decide" title={question.title} sentence={gateSaid} />

  <div class="page">
    <!-- THE BLOCK EXISTED AND ONLY THE RECORD COULD REACH IT. It was gated on `question.decided`,
         so a question decided a moment ago on this screen went on showing the options, the reason
         field and a live commit button, which is the one state where the product has to say plainly
         that it is finished. -->
    <!-- HOW FAR AN ACCEPTED ARRANGEMENT GOT LEADS, because it is the news; what it would do follows, each part in a
         tile of its own: what accepting does, what it puts in place, the rows it adds or changes, and what it calls. -->
    {#if part && !settled}<Applied partial={part} />{/if}
    {#if story && !settled}
      <Tile icon="settings" title={LEAD.does}>
        <section class="changed" aria-label={story.lead}>
          <Arranged arranged={story} />
        </section>
      </Tile>
    {/if}

    {#if preview && !settled}
      <Tile icon="doc" title={copy.proposalWillAppear}>
        <section class="changed">
          <Proposed proposed={preview} />
          <!-- A SCRIPT'S SOURCE, WHOLE AND FOLDED: it is what runs, and code keeps its lines, which a line of the preview
               cannot. A scrolling box a keyboard can reach, as the canvas's written body is. -->
          {#each preview.appears.filter((a) => a.source !== undefined) as a, i (i)}
            <details class="source-fold">
              <summary>{copy.proposalSource(a.title)}</summary>
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <pre class="source" tabindex="0">{a.source}</pre>
            </details>
          {/each}
        </section>
      </Tile>
    {/if}

    {#if pickable.length && !settled && !live?.closed}
      <Tile icon="rows" title={pickWords.heading} count={pickable.length}>
        <section class="changed">
          <p class="pick-hint">{pickWords.hint}</p>
          <ul class="picks">
            {#each pickable as row (row.n)}
              <li>
                <label class="pick">
                  <input
                    type="checkbox"
                    checked={!unticked.includes(row.n)}
                    aria-label={pickWords.keep(row.title)}
                    onchange={(e) => (unticked = e.currentTarget.checked ? unticked.filter((n) => n !== row.n) : [...unticked, row.n])}
                  />
                  <span class="pick-title">{row.title}</span>
                  {#if row.detail}<span class="pick-detail">{row.detail}</span>{/if}
                </label>
              </li>
            {/each}
          </ul>
          {#if picked}<p class="pick-hint" role="status">{pickWords.some(picked.length, pickable.length)}</p>{/if}
        </section>
      </Tile>
    {/if}

    {#if updates.length}
      <Tile icon="rows" title={changeWords.heading} count={updates.length}>
        <Changes {updates} />
      </Tile>
    {/if}

    <!-- WHAT ACCEPTING WOULD CALL OUT, before the press: every host, how often, the key by label and the fields
         sent, as the record worked them out when the proposal was filed. Accept and Decline below are the one
         approval, so the lines go once the question is settled. -->
    {#if from === 'live' && live && live.calls.length > 0 && !settled && !live.closed}
      <Tile icon="globe" title={installWords.heading}>
        <dl class="calls-out">
          <CallsOut calls={live.calls} hosted={hostedHere(page.data as unknown as Shell)} note={installWords.acceptApproves} />
        </dl>
      </Tile>
    {/if}

    {#if settled}
      <!-- THE RECEIPT, A TILE WITH ITS GREEN CHECK: who, when, which option, and the reason as it was written. -->
      <Tile>
        <div class="settled">
          <p class="settled-head">
            <IconWell name="check" size="l" tone="earn" />
            <span>
              {copy.decidedBy}
              {whoDid(settled.by, String(page.data.me?.person ?? '') || null, new Map(Object.entries((page.data.names ?? {}) as Record<string, string>))).name}, {since(settled.at, now)}
            </span>
          </p>
          <p class="settled-choice">{settled.title}</p>
          <p class="settled-reason">“{settled.reason}”</p>
          <p class="settled-note">{copy.immutable}</p>
          {#if applied.length}<div class="settled-applied"><Applied lines={applied} /></div>
          {:else if kept.length}<div class="settled-applied"><Applied lines={kept} /></div>{/if}
          <!-- WHERE IT WENT, and what still waits. A receipt here is always a written decision: the sample's
               unsaved one, with its chip and its way back, went with the sample. -->
          <p class="settled-where">{onwardWords.where} {onwardWords.left(waiting)}</p>
          <div class="settled-next">{@render onward()}</div>
        </div>
      </Tile>
    {:else if from === 'live' && live?.closed}
      <!-- SETTLED, AND ITS DECISION IS NOT AMONG THE ONES READ. Nothing here can answer it again. -->
      <p class="cost-age">{governed.closed(question.id)} {onwardWords.left(waiting)}</p>
      {@render onward()}
    {:else}
      <!-- WHY IT WAS ASKED AND WHAT IT COSTS, side by side when both are there: the reasoning whoever asked wrote,
           then the cost of deciding late, the cost of getting it wrong the record worked out, and its age. -->
      <div class="about" data-pair={question.context ? '' : undefined}>
        {#if question.context}
          <Tile icon="ask" title={copy.whyAsked}>
            <p class="cost-body context">{symbolText(question.context)}</p>
          </Tile>
        {/if}
        <Tile icon="clock" title={costTitle}>
          <section class="cost">
            {#if question.cost}
              <p class="cost-body">{symbolText(question.cost)}</p>
            {/if}
            <!-- AND THE OTHER COST, WHICH NOBODY TYPED. The one above is why deciding late is expensive,
                 written by whoever asked; this is what the record worked out getting it wrong would cost,
                 from what accepting the proposal would do, and it is what puts the question where it is
                 in the queue. Absent on a question whose body this build cannot read. -->
            {#if queueCost(question.band ?? '')}
              {#if question.cost}<h3 class="cost-label">{copy.costOfWrong}</h3>{/if}
              <p class="cost-body" data-cost={question.band}>{queueCost(question.band ?? '')}</p>
            {/if}
            <p class="cost-age">Opened {since(question.opened, now)}. Nobody has decided it.</p>
          </section>
        </Tile>
      </div>

      <!-- WHY THE ANSWERS ARE OFF, ABOVE THE OPTIONS AND NOT AFTER A PRESS AND A PARAGRAPH. It is
           the record's own refusal, said before anybody has chosen anything, and it ends by saying
           that reading is what this colleague still holds. Every option's button and the defer
           point at it. It sits BELOW the cost and the context on purpose: those are reading, this
           reader was invited to read, and a screen that opens by naming what you cannot do reads as
           a door rather than as the question it is. -->
      {#if !answerable}
        <p class="cannot" id="cannot-decide">{whyNot}</p>
      {/if}

      <Tile icon="decide" title={copy.theOptions} count={question.options.length}>
        <section class="options">
          <div class="cards" data-cells={question.options.length}>
            {#each question.options as option, i}
              <!-- THE REASON AS IT WAS FILED, so its rows are links (`Cited`), each named by its list, since a filed question
                   keeps no titles or values for a reader who may not read them; where the body holds no reason, the words
                   `questionOf` made of it. -->
              {@const because = reasonIn(about?.body, option.key) ?? option.body}
              {@const shows = visuals.get(option.key)}
              <article class="card" data-on={highlighted === option.key ? '' : undefined}>
                <!-- WHAT THE OPTION IS LEADS IT, inside its own well and nowhere else: a swatch writes its colour into
                     `--swatch` on its chip alone, hidden from a screen reader because the option's name says what it is. -->
                {#if shows && 'swatch' in shows}
                  <span class="card-visual" data-shows="swatch" aria-hidden="true">
                    {#each shows.swatch as colour, s (s)}<span class="card-swatch" style:--swatch={colour}></span>{/each}
                  </span>
                {:else if shows}
                  <span class="card-visual" data-shows="figure"><span class="card-figure num">{shows.figure}</span></span>
                {/if}
                <header class="card-head">
                  <!-- THE KEY THAT HIGHLIGHTS IT, as a cap: `1` to `9` mark an option here, and never choose it. -->
                  <kbd class="card-n num">{i + 1}</kbd>
                  <h3 class="card-title">{option.title}</h3>
                  <!-- Shown, never pre-selected. -->
                  {#if option.recommended}<span class="card-rec">{copy.recommended}</span>{/if}
                </header>
                <!-- AN OPTION WITH NO REASON SHOWS NONE, rather than an empty line under its name: a rule's own options
                     carry no `because`, and a blank paragraph reads as a reason that failed to load. -->
                {#if because.trim() !== ''}
                  <p class="card-body"><Cited text={because} figures={figuresIn(about?.body)} {now} /></p>
                {/if}
                <!-- OFF FOR A READER WHO MAY NOT ANSWER, pointing at the sentence above the options
                     that says why. `aria-describedby` rather than a title, so the reason is read out
                     with the control and not only seen beside it, which is the shape `/decide` and
                     `/settings/people` both use. The card around it is untouched: the number, the
                     title, the recommendation and the body are what this reader came for.
                     THE BUTTON SAYS THE OPTION'S OWN NAME ("Per seat", not "Choose Per seat"), and the
                     Suggested one is drawn as the primary until another is highlighted: shown, and
                     still not chosen, because pressing it only opens the reason. ONLY THE FIRST SUGGESTED ONE: a body
                     from an agent may mark two, and a screen has one primary. -->
                <Button
                  weight={highlighted === option.key || (highlighted === null && option.recommended === true && question.options.find((o) => o.recommended)?.key === option.key)
                    ? 'primary'
                    : 'quiet'}
                  disabled={!answerable}
                  aria-describedby={answerable ? undefined : 'cannot-decide'}
                  onclick={() => choose(option.key)}
                >
                  {option.title}
                </Button>
              </article>
            {/each}
          </div>
        </section>
      </Tile>

      {#if deferring}
        <Tile>
          <section class="commit">
            <h2 class="commit-title">
              {copy.deferTitle}
              <span class="commit-required">{copy.required}</span>
            </h2>
            <!-- A FIELD WITH ITS LABEL ABOVE IT. "What has to happen first" was grey words beside the Defer button and
                 a placeholder inside this box, so it read as loose text on the queue and vanished once anybody typed. -->
            <label class="commit-label" for="defer-why">{copy.deferHint}</label>
            <textarea
              id="defer-why"
              bind:this={field}
              bind:value={reason}
              class="commit-field"
              rows="2"
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
        </Tile>
      {:else if committing}
        <Tile>
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
                disabled={!reason.trim() || sending || noneTicked}
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
            {#if noneTicked}<p class="commit-fix" role="status" data-intent="bad">{pickWords.none}</p>{/if}
            {#if fix}<p class="commit-fix" role="status" data-intent="bad">{fix}</p>{/if}
            <!-- THE LINE THAT SAID "Nothing you do here is saved yet." UNDER A STILL-LIVE BUTTON is
                 gone: this panel is replaced by the settled block the moment the press lands, and the
                 chip on that block carries the same fact where it is the whole of the news. -->
          </section>
        </Tile>
      {:else}
        <div class="third">
          <!-- The third verb, kept: a queue with only yes and no is a queue that gets rubber-stamped.
               It had no handler, so the one control that stops a gate being cleared by dismissing
               things did nothing — while `d` on the keyboard opened the same flow correctly. -->
          <Button disabled={!answerable} aria-describedby={answerable ? undefined : 'cannot-decide'} onclick={defer}>{copy.defer}</Button>
        </div>
      {/if}
    {/if}

    <!-- THE QUESTION'S COMMENTS, open or settled, since what was said about it is worth as much after the
         decision as before. On the question and not on each option: the record keeps a thread on a question or a
         decision, and an option is part of the question. A Reads colleague may comment here too. -->
    {#if from === 'live'}
      <div class="thread">
        <Thread
          on="suggestion:{question.id}"
          me={String(page.data.me?.person ?? '') || null}
          people={new Map(Object.entries((page.data.names ?? {}) as Record<string, string>))}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  /* THE GATE IS ONE COLUMN OF TILES ON THE GROUND, 12 apart, capped where a card of options still reads as one row. */
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* WHY IT WAS ASKED AND WHAT IT COSTS: one column, and two side by side once there is room for both. */
  .about {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  @container (inline-size >= 48rem) {
    .about[data-pair] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .cost {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    max-inline-size: var(--measure);
  }

  .cost-label {
    margin: var(--sp-2) 0 0;
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .cost-body {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* THE REASONING KEEPS ITS LINES. */
  .context {
    white-space: pre-line;
    max-inline-size: var(--measure);
  }

  .cost-age {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE STANDING SENTENCE OVER THE OPTIONS, at the weight of a hint rather than an alarm, and the
     same rule `/decide` draws it by: nothing has gone wrong, and this reader is doing exactly what
     they were invited to do. `--measure` because it is three sentences and a line that runs the
     width of the page is a line nobody reads. */
  .cannot {
    margin: var(--sp-2) 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .picks {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pick {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-2);
    cursor: pointer;
  }

  .pick-title {
    color: var(--ink);
    font-weight: 500;
  }

  .pick-detail,
  .pick-hint {
    color: var(--ink2);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .pick-hint {
    margin: 0 0 var(--sp-2);
  }

  .source-fold {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .source-fold > summary {
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .source-fold > summary {
      min-block-size: var(--tap);
    }
  }

  /* The canvas's written body (`automations/[id]`), so a script reads the same wherever it is shown: tile-2, no edge. */
  .source {
    margin: var(--sp-2) 0 0;
    padding: var(--sp-3);
    overflow: auto;
    max-block-size: 60vh;
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* THE HEADING IS THE TILE'S, so the list's own `dt` is said to a screen reader and not drawn twice. */
  .calls-out {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .calls-out :global(.calls-h) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE OPTIONS ARE WELLS OF TILE-2 SIDE BY SIDE IN THEIR TILE, told how many there are: `auto-fit` with three
     items in a wide column once generated seven tracks, four of them empty (05 §4). The highlighted one takes an ink
     ring, a shape and not a shade; its button is the page's one primary. */
  .cards {
    display: grid;
    grid-template-columns: repeat(var(--cells, 3), minmax(0, 1fr));
    gap: var(--sp-2);
  }

  .cards[data-cells='1'] {
    --cells: 1;
  }

  .cards[data-cells='2'] {
    --cells: 2;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
    transition: box-shadow var(--d-state) var(--ease-out);
  }

  .card[data-on] {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  .card > :global(.btn) {
    align-self: start;
    margin-block-start: auto;
  }

  /* A QUIET PILL ON A TILE-2 WELL IS THE TILE'S WHITE, or it would be the well's own grey and no pill at all. */
  .cards .card > :global(.btn[data-weight='quiet']) {
    background: var(--bg);
  }

  @media (hover: hover) and (pointer: fine) {
    .cards .card > :global(.btn[data-weight='quiet']:hover:not(:disabled)) {
      background: var(--s2);
    }
  }

  /* THE OPTION'S VISUAL, THE TILE'S SHAPE AT THE CARD'S SIZE: swatches share the card's width in one band, a figure
     is the card's largest type. `--swatch` is set on a chip and read by this one rule, so the colour stays inside its
     option's box, and forced colours leave it alone because the lining is the thing being chosen. */
  .card-visual {
    display: flex;
    gap: 2px;
    min-inline-size: 0;
    overflow: hidden;
    border-radius: var(--r-sm);
  }

  .card-swatch {
    flex: 1;
    block-size: 3rem;
    background: var(--swatch);
    border: 1px solid var(--line);
    forced-color-adjust: none;
  }

  .card-figure {
    padding: var(--sp-3);
    flex: 1;
    background: var(--bg);
    color: var(--ink);
    font-size: var(--t-xl);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE KEY CAP: Geist Mono 12 on the tile's white inside a tile-2 well, 18 square at its smallest. */
  .card-n {
    display: inline-grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    min-inline-size: 18px;
    block-size: 18px;
    padding: 0 var(--sp-1);
    background: var(--bg);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-weight: 500;
    line-height: 1;
  }

  .card[data-on] .card-n {
    background: var(--ink);
    color: var(--on-ink);
  }

  .card-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  /* The suggestion as a word in the quiet ink, not a green chip. */
  .card-rec {
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .card-body {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* ── the reason and the defer, one tile each ───────────────────────────── */

  .commit {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--measure);
  }

  .commit-label {
    display: block;
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .commit-wake {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* A FIELD IS 40 ON TILE-2, radius 12, no border: the fill is its edge. */
  .commit-date {
    min-block-size: 40px;
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  /* A HEADING IS AS TALL AS ITS DESCENDERS, AND HAS ROOM UNDER IT: a line-height with room for a descender, and space
     between the heading and the field, or the tails of "Why" and "yet" are painted over by the field under them. */
  .commit-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 1.4;
  }

  .commit-required {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .commit-choice {
    margin: var(--sp-1) 0 var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .commit-field {
    inline-size: 100%;
    min-block-size: 40px;
    padding: 10px var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    line-height: var(--lh-body);
    resize: vertical;
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .commit-why {
    margin: var(--sp-2) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .commit-fix {
    margin: var(--sp-2) 0 0;
    font-size: var(--t-ui);
  }

  .commit-nudge {
    margin: var(--sp-2) 0 0;
    color: var(--warn);
    font-size: var(--t-ui);
  }

  .commit-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
  }

  .commit-note {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .third {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
  }

  /* ── the receipt ───────────────────────────────────────────────────────── */

  .settled {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--measure);
  }

  .settled-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .settled-choice {
    margin: var(--sp-3) 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .settled-reason {
    margin: 0;
    color: var(--ink2);
  }

  .settled-note {
    margin: var(--sp-3) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .settled-applied {
    margin-block-start: var(--sp-4);
  }

  /* The way on, under the receipt it belongs to. */
  .settled-next {
    margin-block-start: var(--sp-4);
  }

  .settled-where {
    margin: var(--sp-3) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* THE WAY ON WRAPS, because on a phone the next question, the queue and the inbox are three
     buttons that do not fit one line at 44px each. */
  .onward {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  .thread {
    margin-block-start: var(--sp-5);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    /* The gate is a first-class phone surface, not a degraded one: options as stacked wells, and the
       reason field above the fold. Decisions get made from a phone (19 §3). */
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }

    .card-n {
      display: none;
    }
  }
</style>
