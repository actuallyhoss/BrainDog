<!--
  The gate. One question, its answers, and what accepting it does, examined whole.

  ONE PRESS ANSWERS (DIRECTION §37). Each answer is a button that says what it does, and pressing it is the decision:
  no reason box opens first and no second press commits it. The walk of 2 October found the queue making a round trip
  and then asking "Why?" before an answer landed (`loop/research-ux-walk.md` #3), and two of the owner's decisions
  carried the reasons "f" and "y", which agents later read back as the why. So the reason is offered, never demanded:
  after a decline or an edit the receipt offers a one-line note, kept with the question. Where the record itself still
  keeps a reason for a question (`govern.ts`), it says so on the press and one line opens under the answers, with the
  choice kept.

  THE SUGGESTION IS AN OUTLINE WITH A SMALL DOT, his pick, and it is drawn only where the choice can be taken back and
  no money moves (`press.ts`). A pre-selected answer reads as an endorsement, so where the other button tomorrow cannot
  undo it, nothing is marked. When money moves, Accept names the amount.

  THE KEYS: `j` and `k` go to the next and the last open question, Enter accepts, `e` edits what accepting takes (the
  rows to tick, where Space ticks and Enter is done), Backspace declines, `1` to `9` reach an answer's button, `d` puts
  the question off, and Esc steps back. Enter gives the suggested answer, or Accept, and nothing on a question that is
  hard to undo or that moves money: those are answered by a press on their own button, which a key puts the focus on.
  Nothing moves or fades on a key.

  THE RECORD'S TWO ANSWERS ARE TWO BUTTONS, Accept and Decline, with what accepting changes open under them. A card
  whose only content was an Accept button was the walk's #29; the cards are for a question's own options, each with
  what it is and why.
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
  import { COMMENT_MOST, sayComment } from '$lib/record/comments.ts';
  import { everyGovernance, plainOf, readOne, type One } from '$lib/record/governance.ts';
  import { answerQuestion, parkQuestion, type Written } from '$lib/record/decide-write.ts';
  import { visualOf, type Visual } from '$lib/page/queue-answer.ts';
  import { mayAnswer, whyNotAnswering } from '../answering.ts';
  import { acceptKey, declineKey, keyAct, labelOf, movesOf, notedAfter, suggestionShown, twoWords } from '../press.ts';
  import { nextOpen, stillWaiting, words as onwardWords } from './onward.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { hostedHere } from '../../settings/billing.ts';
  import { goto, invalidateAll } from '$app/navigation';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { pressedOnly } from '@braindog/kernel';
  import { tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Thread from '$lib/ui/Thread.svelte';
  import { gateSentence, WORDS as LEAD } from '../lead.ts';
  import { words as gate } from '../words.ts';
  import { doesLine } from './does.ts';
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
   * WHETHER THIS READER MAY ANSWER, WHICH THIS SCREEN ONCE NEVER ASKED.
   *
   * A reader gets here from the card link on the queue. Before the repair, a colleague at `read` pressed an answer,
   * typed the reason the screen then demanded, and only after all of it met the record's refusal. Counted from this
   * file for a three-option question: four controls inside the decision (three answers and `Defer`), none of them off,
   * and no word on the page about access, with the keyboard a second way in that asked nothing either.
   *
   * SO THE SENTENCE IS THE RECORD'S OWN, MOVED IN FRONT OF THE OPTIONS, and the module it comes from is the one the
   * queue reads. `answering.ts` exists so that this screen is not a fourth spelling of one rule, and a colleague who
   * reads the hint here, on the queue, or in the toast a key gives them meets the same words.
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
  /** A list by the name the reader knows it by. */
  const listName = (register: string | undefined): string => (register ? (lists.get(register) ?? copy.valueWord(register)) : '');
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

  /** The answer on its way, so a second press waits for the first; and what the record refused, in its own sentence. */
  let sending = $state<string | null>(null);
  let fix = $state('');

  /* A PROPOSAL THAT ADDS SEVERAL ROWS, one tick each: Accept takes the ticked ones and declines the rest. */
  const pickable = $derived(from === 'live' && live?.about ? pickableOf(live.about.kind, live.about.body) : []);
  let unticked = $state<number[]>([]);
  const picked = $derived(rowsToSend(pickable.length, unticked));
  /* A PRESS ON ACCEPT WITH NOTHING TICKED is a decline in disguise, so it is said and nothing is sent. */
  let noneTicked = $state(false);

  /* THE RECORD'S TWO ANSWERS, Accept and Decline, which are buttons and not cards (`press.ts` `twoWords`). */
  const two = $derived(question ? twoWords(question) : false);
  /* THE MONEY ACCEPTING WOULD WRITE, in each currency it is in, for the rows that are ticked: the button names it. */
  const moves = $derived(question && live ? movesOf(live.rowset, live.registers, picked) : []);
  /* AND THE SUGGESTION, only where the choice can be taken back and no money moves; the first one an agent marked. */
  const suggestedKey = $derived(
    question && suggestionShown(question.band, moves.length > 0) ? question.options.find((o) => o.recommended === true)?.key : undefined,
  );

  /**
   * WHEN THE RECORD STILL KEEPS A REASON FOR A QUESTION, it answers the press with `wants: 'reason'` (`decide-write.ts`),
   * and one line opens under the answers with the choice kept: the reason is the record's to ask for, once, and never
   * this screen's to demand before the press.
   */
  let asked = $state<string | null>(null);
  let reason = $state('');
  let field = $state<HTMLInputElement>();

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
  let parkWhy = $state('');
  let parkField = $state<HTMLTextAreaElement>();


  /**
   * ONE PRESS IS THE ANSWER: the option goes to the record at once, alone, and what comes back is the decision.
   *
   * A READER WHO MAY NOT ANSWER IS TOLD SO BEFORE ANYTHING IS SENT. The buttons are off for them, but off is not
   * closed: Enter and Backspace arrive here with no button in the way, and an answer that went out and came back
   * refused is the dead end this screen was repaired for. The words are the standing hint's, so the toast and the
   * sentence agree.
   */
  function choose(key: string) {
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
    if (sending !== null || !question) return;
    deferring = false;
    fix = '';
    noneTicked = key === 'accept' && pickable.length > 0 && picked === null;
    if (noneTicked) return;
    /* WITH THE RECORD'S ONE LINE OPEN, another answer changes the choice and keeps the words already typed. */
    if (asked !== null) {
      asked = key;
      void tick().then(() => field?.focus());
      return;
    }
    void send(key);
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
    asked = null;
    parkWhy = '';
    fix = '';
    /* Seeded a fortnight out — 21 A5, seeds not blanks. A date picker opened on nothing makes the
       person do arithmetic before they can say the thing they already know. */
    wake = new Date(now + 14 * 86_400_000).toISOString().slice(0, 10);
    queueMicrotask(() => parkField?.focus());
  }

  /**
   * `e` EDITS WHAT ACCEPTING TAKES, which on this screen is the rows to tick: the fold is open whenever there are rows,
   * so the key puts the focus on the first of them. A question with nothing to change has nothing for `e` to do.
   */
  function edit(): boolean {
    if (!picking) return false;
    void tick().then(() => document.querySelector<HTMLInputElement>('.picks input')?.focus());
    return true;
  }

  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    /* THE NEXT AND THE PREVIOUS OPEN QUESTION, from anywhere on the gate but a field, decided or not. */
    if ((e.key === 'j' || e.key === 'k') && !e.metaKey && !e.ctrlKey && !e.altKey && !typing() && !silenced(e)) {
      const to = e.key === 'j' ? nextId : prevId;
      if (to && to !== page.params.id) {
        e.preventDefault();
        void goto(at(`/decide/${to}`));
      }
      return;
    }
    /* A DECIDED QUESTION, AND ONE DECIDED HERE, TAKE NO ANSWER KEYS: the receipt is the end of it. */
    if (!question || question.decided || committed || (from === 'live' && live?.closed)) return;
    const inField = e.target instanceof HTMLElement && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');

    /* THE CHORD SENDS WHAT IS BEING TYPED, the reason the record asked for or why it can wait, and only from its field. */
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (!inField) return;
      e.preventDefault();
      if (deferring && parkWhy.trim()) void deferIt();
      else if (asked && reason.trim()) void send(asked, reason);
      return;
    }
    /* ENTER ON A ROW TO TICK IS "DONE": what `e` opened is finished. It accepts what is ticked where a key may accept,
       and otherwise puts the focus on Accept, whose words name the amount, so the press that sends money is the
       reader's own on the button. Space ticks, as on any box. */
    const onPick = e.target instanceof HTMLInputElement && e.target.type === 'checkbox' && e.target.closest('.picks') !== null;
    if (onPick && e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !silenced(e)) {
      e.preventDefault();
      if (acceptKey(question, moves.length > 0) === 'accept') choose('accept');
      else document.getElementById('opt-accept')?.focus();
      return;
    }
    /* AND THE ONE TEST FOR TYPING, not a narrower copy. */
    if (typing()) return;
    if (silenced(e)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    /* `1` TO `9` REACH AN ANSWER, and Enter on it then gives it: a number puts the focus there and sends nothing. */
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= question.options.length) {
      e.preventDefault();
      document.getElementById(`opt-${question.options[n - 1]!.key}`)?.focus();
      return;
    }
    const act = keyAct(e.key);
    /* ENTER ON A CONTROL IS THAT CONTROL'S: on an answer's button it presses that answer, as a pointer would, and on a
       link or a fold it opens it. Backspace has no meaning on a button, so it declines from anywhere but a field. */
    const onControl = e.target instanceof Element && e.target.closest('button, a[href], summary, input, select, textarea') !== null;
    if ((act === 'accept' && !onControl) || act === 'decline') {
      const key = act === 'accept' ? acceptKey(question, moves.length > 0) : declineKey(question);
      /* NOTHING ENTER MAY GIVE ON ITS OWN, on a question that is hard to undo, moves money or suggests nothing: the focus
         goes to the first answer (Accept, whose words name the amount), so the next Enter is a press on that button. */
      if (key === null && act === 'accept') {
        e.preventDefault();
        document.getElementById(`opt-${question.options[0]?.key ?? ''}`)?.focus();
        return;
      }
      if (key === null) return;
      e.preventDefault();
      choose(key);
      return;
    }
    if (act === 'edit') {
      if (edit()) e.preventDefault();
      return;
    }
    if (e.key === 'd' && !deferring) {
      e.preventDefault();
      defer();
      return;
    }
    if (e.key === 'Escape' && deferring) {
      e.preventDefault();
      deferring = false;
      return;
    }
    if (e.key === 'Escape' && asked) {
      e.preventDefault();
      asked = null;
      document.getElementById(`opt-${question.options[0]?.key ?? ''}`)?.focus();
    }
  }

  /**
   * THE ANSWER IS BUILT BY `record/answer.ts`, NOT TYPED HERE, so the queue and this screen say one act one way, and a
   * key this question does not offer is refused rather than printed into a receipt.
   *
   * THE ANSWER IS KEPT ONCE IT IS IN, NOT A FLAG SAYING ONE HAPPENED, because the receipt below needs the facts a
   * receipt is made of: who, when, which answer, and the reason when there is one. A pressed button that stayed live
   * behind a toast was a button people pressed again.
   */
  let committed = $state<Answer | null>(null);
  /* A NOTE IS OFFERED ONCE THE ANSWER IS IN, after a decline or an edit (`press.ts` `notedAfter`). */
  let noteOffered = $state(false);
  let note = $state('');
  let noting = $state(false);
  let noted = $state(false);
  let noteFix = $state('');
  let noteOpen = $state(false);
  /* THE THREAD UNDER THE QUESTION IS READ AGAIN once a note is kept in it, so the note is there to be seen. */
  let threadRead = $state(0);

  async function send(key: string, said?: string) {
    const a = answerFor(question, key, new Date(now).toISOString());
    if (!a || from !== 'live' || !client || sending !== null) return;
    sending = key;
    const accepting = a.option === 'accept' && about !== undefined && isArranging(about.kind) ? about : null;
    const had = accepting ? sidebarNow() : null;
    const rows = a.option === 'accept' && picked ? picked : undefined;
    const out = await answerQuestion(apiBase(), a.question, a.option, said, undefined, rows);
    sending = null;
    /* THE RECORD KEEPS A REASON FOR THIS ONE: the line opens under the answers, focused, with the choice kept. */
    if (out.from === 'refused' && out.wants === 'reason' && said === undefined) {
      asked = key;
      reason = '';
      await tick();
      field?.focus();
      return;
    }
    /* AN ARRANGEMENT THAT DID NOT ALL LAND. The record reopened the question, so the answers come back under what was
       done and what was not, and the rail reads again for what did land. */
    if (accepting && out.from === 'refused') {
      part = partialOf(accepting.kind, accepting.body, out.fix) ?? { why: out.fix, done: [], left: [] };
      asked = null;
      fix = '';
      toasts.push(part.done.length ? copy.arrangePartial : copy.arrangeNotApplied, { intent: 'warn' });
      await invalidateAll();
      return;
    }
    if (await unsent(out, a.question)) return;
    fix = '';
    part = null;
    asked = null;
    const shown = question ? labelOf({ key: a.option, title: a.title }, question, []) : a.title;
    committed = { ...a, title: shown, reason: said?.trim() ?? '' };
    noteOffered = notedAfter(a.option, rows !== undefined);
    toasts.push(copy.decisionRecorded(shown), { intent: 'good' });
    if (accepting && out.from === 'written' && had) {
      applied = appliedLines(out.applied ?? {}, accepting.body);
      await invalidateAll();
      const added = [...sidebarNow()].filter(([href]) => !had.has(href)).map(([, title]) => title);
      if (added.length) applied = appliedLines(out.applied ?? {}, accepting.body, added);
    } else void invalidateAll();
    /* THE WAY ON TAKES THE FOCUS, so `j` and Enter carry on to the next question. A note, when one is offered, is the
       button beside it, one step back: offered, and never in the way. */
    setTimeout(() => document.getElementById('way-on')?.focus());
  }

  /** The reason the record asked for, sent with the answer it was asked for. A blank line is not sent. */
  function sendReason(e: SubmitEvent) {
    e.preventDefault();
    if (!asked) return;
    if (reason.trim() === '') return void field?.focus();
    void send(asked, reason);
  }

  /** The note's one line, opened on the reader's own press and focused. */
  function openNote() {
    noteOpen = true;
    void tick().then(() => document.getElementById('note-field')?.focus());
  }

  /** A note kept with the question, on its thread, where everybody who reads the question reads it. */
  async function keepNote(e: SubmitEvent) {
    e.preventDefault();
    if (!question || noting || note.trim() === '') return;
    noting = true;
    noteFix = '';
    const out = await sayComment(apiBase(), { on: `suggestion:${question.id}`, body: note.trim() });
    noting = false;
    if (!out.ok) {
      noteFix = out.fix;
      return;
    }
    noted = true;
    threadRead += 1;
    setTimeout(() => document.getElementById('way-on')?.focus());
  }

  /**
   * A WRITE THAT DID NOT LAND, said under the answers and as a warning. A conflict is a row the
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
    if (from !== 'live' || !client || !question || sending !== null) return;
    sending = 'defer';
    const out = await parkQuestion(apiBase(), question.id, wake, parkWhy);
    sending = null;
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
            title: labelOf(
              { key: question.decided.option, title: question.options.find((o) => o.key === question.decided?.option)?.title ?? question.decided.option },
              question,
              [],
            ),
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

  /* ── what accepting does, one folded tile under the options ───────────── */

  /** Still open here: neither settled on this screen nor closed on the record. */
  const costed = $derived(question !== undefined && !settled && !(from === 'live' && live?.closed));
  /** The rows to tick, while there is still a decision for them to be part of. */
  const picking = $derived(pickable.length > 0 && costed);
  /** What accepting would call out, while it can still be approved. */
  const calling = $derived(from === 'live' && live !== null && live.calls.length > 0 && costed);
  /** The tile's one line, shut (`does.ts`): the first part of what accepting does that this question has. */
  const doesSaid = $derived(
    doesLine({
      story: story && !settled ? story : null,
      appears: preview && !settled ? preview.appears : [],
      picks: picking ? { on: picked?.length ?? pickable.length, of: pickable.length } : null,
      updates: updates.length ? { n: updates.length, list: listName(live?.rowset?.register) } : null,
      calls: calling ? (live?.calls.length ?? 0) : 0,
    }),
  );

  /**
   * DRAWN ONCE THE READ HAS ANSWERED LIVE. The read is bracketed by `opened()` and `closed()`, so a call
   * still out takes `data-screen` away whatever this says.
   */
  $effect(() => {
    if (from === 'live') drew('ready');
  });

  /* `e` ON THE QUEUE LANDS HERE WITH `?edit`, and puts the focus on what accepting takes, once per question. */
  let editOpened = '';
  $effect(() => {
    const id = question?.id;
    if (!id || editOpened === id || !page.url.searchParams.has('edit') || !picking) return;
    editOpened = id;
    untrack(() => edit());
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

  /* AND AN ANSWER NAMED ON THE WAY IN, `?option=`, LANDS HERE FOCUSED, once per question: the reader's own press on the
     page they came from, which Enter on that button then gives. Focused is still not chosen, and an option this
     question does not offer is ignored. */
  let cameWith = '';
  $effect(() => {
    const id = question?.id;
    const want = page.url.searchParams.get('option');
    if (!id || cameWith === id || !want) return;
    if (question.decided || (from === 'live' && live?.closed)) return;
    cameWith = id;
    if (question.options.some((o) => o.key === want)) void tick().then(() => document.getElementById(`opt-${want}`)?.focus());
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
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL. Nothing failed, so there is no request id to
         quote (`50 §13 D11`), and no filter ran, so "nothing matched" is about something that did not happen. It says
         the question is not here and lists what is (`10 §7`'s fourth rule: the refusal is the teacher), and it does not
         read the address back: the handle in it is the record's, not a name anybody gave the question. -->
    <Empty kind="error" heading title={gate.notHere} body={onwardWords.left(waiting)}>
      {#snippet actions()}{@render onward()}{/snippet}
    </Empty>
  </div>
{:else}
  <!-- THE QUESTION IS THE TITLE, and the sentence under it says how many ways there are to answer, which one is
       suggested, and how long it has been open. -->
  <PageHead icon="decide" kicker={copy.decide} back="/decide" title={question.title} sentence={gateSaid} />

  <div class="page">
    <!-- HOW FAR AN ACCEPTED ARRANGEMENT GOT LEADS, because it is the news and the reason the options came back. -->
    {#if part && !settled}<Applied partial={part} />{/if}

    <!-- THE BLOCK EXISTED AND ONLY THE RECORD COULD REACH IT. It was gated on `question.decided`,
         so a question decided a moment ago on this screen went on showing the options, the reason
         field and a live commit button, which is the one state where the product has to say plainly
         that it is finished. -->
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
          <!-- THE REASON WHEN THERE IS ONE. An answer given by its press alone is a whole answer, and a pair of quotation
               marks round nothing read as a reason that failed to load. Nor is the sentence the record wrote for a press
               (`pressedOnly`) quoted on a reloaded receipt, as though the person had written it. -->
          {#if settled.reason.trim() !== '' && !pressedOnly(settled.reason)}<p class="settled-reason">“{settled.reason}”</p>{/if}
          <p class="settled-note">{copy.immutable}</p>
          <!-- A NOTE, OFFERED AND NEVER ASKED FOR, after a decline or an edit, which are the answers somebody later asks
               about (`press.ts` `notedAfter`). One line, kept on the question's thread below, where everybody who reads
               the question reads it. The way on keeps the focus, so `j` still goes to the next question. -->
          {#if committed && noteOffered}
            {#if noted}
              <p class="note-kept" role="status">{gate.noteKept}</p>
            {:else if noteOpen}
              <form class="line-form" onsubmit={keepNote}>
                <label class="line-label" for="note-field">{gate.noteLabel}</label>
                <div class="line-row">
                  <input
                    id="note-field"
                    class="line-field"
                    bind:value={note}
                    maxlength={COMMENT_MOST}
                    autocomplete="off"
                    spellcheck="true"
                  />
                  <Button type="submit" disabled={noting || note.trim() === ''}>{gate.noteSend}</Button>
                </div>
                {#if noteFix}<p class="commit-fix" role="status" data-intent="bad">{noteFix}</p>{/if}
              </form>
            {:else}
              <p class="note-offer">
                <Button weight="bare" size="sm" onclick={openNote}>{gate.noteOffer}</Button>
              </p>
            {/if}
          {/if}
          {#if applied.length}<div class="settled-applied"><Applied lines={applied} /></div>
          {:else if kept.length}<div class="settled-applied"><Applied lines={kept} /></div>{/if}
          <!-- WHERE IT WENT, and what still waits. A receipt here is always a written decision: the sample's
               unsaved one, with its chip and its way back, went with the sample. -->
          <p class="settled-where">{onwardWords.where} {onwardWords.left(waiting)}</p>
          <div class="settled-next">{@render onward()}</div>
        </div>
      </Tile>
    {:else if from === 'live' && live?.closed}
      <!-- SETTLED, AND ITS DECISION IS NOT AMONG THE ONES READ. Nothing here can answer it again, and the line says so
           without the question's handle: its title is the heading above. -->
      <p class="cost-age">{gate.closedNow} {onwardWords.left(waiting)}</p>
      {@render onward()}
    {:else}
      <!-- THE OPTIONS COME STRAIGHT UNDER THE TITLE: they are what this screen is for. Everything accepting would do is
           one folded tile under them (`does`), one press away and read before the commit, never in the way of it.

           WHY THE ANSWERS ARE OFF COMES FIRST, ABOVE THE OPTIONS AND NOT AFTER A PRESS AND A PARAGRAPH. It is
           the record's own refusal, said before anybody has chosen anything, and it ends by saying
           that reading is what this colleague still holds. Every option's button and the defer
           point at it. -->
      {#if !answerable}
        <p class="cannot" id="cannot-decide">{whyNot}</p>
      {/if}

      <!-- ONE ANSWER'S BUTTON, drawn by the cards of a question's own options and by the record's two answers alike, so the
           one rule for who may press it is written once. It says what it does (`press.ts` `labelOf`): an option's own name,
           Decline for the record's Reject, and the amount on Accept when money moves.

           OFF FOR A READER WHO MAY NOT ANSWER, pointing at the sentence above the answers that says why. `aria-describedby`
           rather than a title, so the reason is read out with the control and not only seen beside it, which is the shape
           `/decide` and `/settings/people` both use.

           THE SUGGESTED ONE IS AN OUTLINE WITH A SMALL DOT, never the filled primary: shown, and not chosen for anybody. Only
           the first one an agent marked, only where the choice can be taken back, and never where money moves. -->
      {#snippet answer(option: { key: string; title: string }, q: { options: readonly { key: string; title: string }[] })}
        {@const marked = suggestedKey === option.key}
        <Button
          id="opt-{option.key}"
          data-answer={option.key}
          data-suggested={marked ? '' : undefined}
          data-on={asked === option.key ? '' : undefined}
          aria-pressed={asked === null ? undefined : asked === option.key}
          disabled={!answerable}
          aria-describedby={answerable ? undefined : 'cannot-decide'}
          onclick={() => choose(option.key)}
        >
          {#if marked}<span class="dot" aria-hidden="true"></span>{/if}{labelOf(option, q, moves)}{#if marked}<span class="sr">, {gate.suggested}</span>{/if}
        </Button>
      {/snippet}

      <!-- A COUNT ONLY OVER A QUESTION'S OWN OPTIONS: over Accept and Decline it would count the buttons. -->
      <Tile icon="decide" title={copy.theOptions} count={two ? undefined : question.options.length}>
        <section class="options">
          {#if two}
            <!-- THE RECORD'S TWO ANSWERS ARE TWO BUTTONS, Accept and Decline, side by side, with what accepting changes
                 open in the tile under them. Two cards whose only content was a button was the walk's #29. -->
            <div class="two">
              {#each question.options as option (option.key)}{@render answer(option, question)}{/each}
            </div>
          {:else}
            <div class="cards" data-cells={question.options.length}>
              {#each question.options as option}
                <!-- THE REASON AS IT WAS FILED, so its rows are links (`Cited`), each named by its list, since a filed question
                     keeps no titles or values for a reader who may not read them; where the body holds no reason, the words
                     `questionOf` made of it. -->
                {@const because = reasonIn(about?.body, option.key) ?? option.body}
                {@const shows = visuals.get(option.key)}
                <article class="card">
                  <!-- WHAT THE OPTION IS LEADS IT, inside its own well and nowhere else: a swatch writes its colour into
                       `--swatch` on its chip alone, hidden from a screen reader because the option's name says what it is. -->
                  {#if shows && 'swatch' in shows}
                    <span class="card-visual" data-shows="swatch" aria-hidden="true">
                      {#each shows.swatch as colour, s (s)}<span class="card-swatch" style:--swatch={colour}></span>{/each}
                    </span>
                  {:else if shows}
                    <span class="card-visual" data-shows="figure"><span class="card-figure num">{shows.figure}</span></span>
                  {/if}
                  <!-- THE OPTION'S NAME IS ITS BUTTON, so the name is said once and pressing it is the answer. No key cap:
                       `1` to `9` reach an answer, and the keys are said in the ? sheet, not on every card. -->
                  {@render answer(option, question)}
                  <!-- AN OPTION WITH NO REASON SHOWS NONE, rather than an empty line under its name: a rule's own options
                       carry no `because`, and a blank paragraph reads as a reason that failed to load. -->
                  {#if because.trim() !== ''}
                    <p class="card-body"><Cited text={because} figures={figuresIn(about?.body)} {now} /></p>
                  {/if}
                </article>
              {/each}
            </div>
          {/if}

          <!-- THE ONE LINE THE RECORD ASKS FOR, only when it answers the press with `wants: 'reason'`, with the answer
               kept: what was pressed is said, and the line is the one thing left to do. -->
          {#if asked}
            <form class="line-form" onsubmit={sendReason}>
              <label class="line-label" for="asked-why">{gate.reasonAsked}</label>
              <div class="line-row">
                <input
                  id="asked-why"
                  class="line-field"
                  bind:this={field}
                  bind:value={reason}
                  autocomplete="off"
                  spellcheck="true"
                />
                <Button type="submit" weight="primary" disabled={sending !== null}>{gate.send}</Button>
              </div>
            </form>
          {/if}
          {#if noneTicked}<p class="commit-fix" role="status" data-intent="bad">{pickWords.none}</p>{/if}
          {#if fix && !deferring}<p class="commit-fix" role="status" data-intent="bad">{fix}</p>{/if}
        </section>
      </Tile>

      {#if deferring}
        <Tile>
          <section class="commit">
            <h2 class="commit-title">{copy.deferTitle}</h2>
            <!-- A FIELD WITH ITS LABEL ABOVE IT. "What has to happen first" was grey words beside the Defer button and
                 a placeholder inside this box, so it read as loose text on the queue and vanished once anybody typed. -->
            <label class="commit-label" for="defer-why">{copy.deferHint}</label>
            <textarea
              id="defer-why"
              bind:this={parkField}
              bind:value={parkWhy}
              class="commit-field"
              rows="2"
              spellcheck="true"
            ></textarea>
            <label class="commit-wake">
              {copy.wakeOn}
              <input class="commit-date" type="date" bind:value={wake} />
            </label>
            <div class="commit-actions">
              <Button weight="primary" disabled={!parkWhy.trim() || !wake || sending !== null} onclick={deferIt}>
                {copy.deferAction}
              </Button>
              <Button weight="bare" onclick={() => (deferring = false)}>{copy.arrangeCancel}</Button>
            </div>
            {#if fix}<p class="commit-fix" role="status" data-intent="bad">{fix}</p>{/if}
          </section>
        </Tile>
      {:else}
        <div class="third">
          <!-- The third verb, kept: a queue with only yes and no is a queue that gets rubber-stamped. -->
          <Button disabled={!answerable} aria-describedby={answerable ? undefined : 'cannot-decide'} onclick={defer}>{copy.defer}</Button>
        </div>
      {/if}
    {/if}

    <!-- WHAT ACCEPTING DOES, ONE TILE, FOLDED: what an arrangement does, what a proposal puts in place, the rows to tick,
         the rows it changes, what it calls, why it was asked and what it costs, each a part of the tile rather than a
         tile of its own above the options. Shut, it says the first of them in one line (`does.ts`). The rows to tick
         open it, because what is left out is declined with the decision. -->
    {#if (story && !settled) || (preview && !settled) || picking || updates.length || calling || costed}
      <Tile icon="settings" title={LEAD.does}>
        <details class="does" open={picking || two}>
          <summary class="does-line">{doesSaid}</summary>
          <div class="does-parts">
            {#if story && !settled}
              <section class="changed" aria-label={story.lead}>
                <Arranged arranged={story} />
              </section>
            {/if}

            {#if preview && !settled}
              <section class="changed">
                <h3 class="does-h">{copy.proposalWillAppear}</h3>
                <Proposed proposed={preview} />
                <!-- A SCRIPT'S SOURCE, WHOLE AND FOLDED: it is what runs, and code keeps its lines, which a line of the
                     preview cannot. A scrolling box a keyboard can reach, as the canvas's written body is. -->
                {#each preview.appears.filter((a) => a.source !== undefined) as a, i (i)}
                  <details class="source-fold">
                    <summary>{copy.proposalSource(a.title)}</summary>
                    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                    <pre class="source" tabindex="0">{a.source}</pre>
                  </details>
                {/each}
              </section>
            {/if}

            {#if picking}
              <section class="changed">
                <h3 class="does-h">{pickWords.heading}</h3>
                <p class="pick-hint">{pickWords.hint}</p>
                <ul class="picks">
                  {#each pickable as row (row.n)}
                    <li>
                      <label class="pick">
                        <input
                          type="checkbox"
                          checked={!unticked.includes(row.n)}
                          aria-label={pickWords.keep(row.title)}
                          onchange={(e) => {
                            unticked = e.currentTarget.checked ? unticked.filter((n) => n !== row.n) : [...unticked, row.n];
                            noneTicked = false;
                          }}
                        />
                        <span class="pick-title">{row.title}</span>
                        {#if row.detail}<span class="pick-detail">{row.detail}</span>{/if}
                      </label>
                    </li>
                  {/each}
                </ul>
                {#if picked}<p class="pick-hint" role="status">{pickWords.some(picked.length, pickable.length)}</p>{/if}
              </section>
            {/if}

            {#if updates.length}
              <section class="changed">
                <h3 class="does-h">{changeWords.heading}</h3>
                <Changes {updates} />
              </section>
            {/if}

            <!-- WHAT ACCEPTING WOULD CALL OUT, before the press: every host, how often, the key by label and the fields
                 sent, as the record worked them out when the proposal was filed. Accept and Decline are the one
                 approval, so the lines go once the question is settled. -->
            {#if calling && live}
              <section class="changed">
                <h3 class="does-h">{installWords.heading}</h3>
                <dl class="calls-out">
                  <CallsOut calls={live.calls} hosted={hostedHere(page.data as unknown as Shell)} note={installWords.acceptApproves} />
                </dl>
              </section>
            {/if}

            <!-- WHY IT WAS ASKED AND WHAT IT COSTS: the reasoning whoever asked wrote, then the cost of deciding late,
                 the cost of getting it wrong the record worked out, and its age. -->
            {#if costed}
              {#if question.context}
                <section class="changed">
                  <h3 class="does-h">{copy.whyAsked}</h3>
                  <p class="cost-body context">{symbolText(question.context)}</p>
                </section>
              {/if}
              <section class="cost">
                <h3 class="does-h">{costTitle}</h3>
                {#if question.cost}
                  <p class="cost-body">{symbolText(question.cost)}</p>
                {/if}
                <!-- AND THE OTHER COST, WHICH NOBODY TYPED. The one above is why deciding late is expensive,
                     written by whoever asked; this is what the record worked out getting it wrong would cost,
                     from what accepting the proposal would do, and it is what puts the question where it is
                     in the queue. Absent on a question whose body this build cannot read. -->
                {#if queueCost(question.band ?? '')}
                  {#if question.cost}<h4 class="cost-label">{copy.costOfWrong}</h4>{/if}
                  <p class="cost-body" data-cost={question.band}>{queueCost(question.band ?? '')}</p>
                {/if}
                <p class="cost-age">{gate.opened(since(question.opened, now))}</p>
              </section>
            {/if}
          </div>
        </details>
      </Tile>
    {/if}

    <!-- THE QUESTION'S COMMENTS, open or settled, since what was said about it is worth as much after the
         decision as before. On the question and not on each option: the record keeps a thread on a question or a
         decision, and an option is part of the question. A Reads colleague may comment here too. -->
    {#if from === 'live'}
      <div class="thread">
        {#key threadRead}
          <Thread
            on="suggestion:{question.id}"
            me={String(page.data.me?.person ?? '') || null}
            people={new Map(Object.entries((page.data.names ?? {}) as Record<string, string>))}
          />
        {/key}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* THE GATE IS ONE COLUMN OF TILES ON THE GROUND, 12 apart, running the window's width; prose inside keeps `--measure`. */
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* ── what accepting does, one tile folded shut ─────────────────────────── */

  .does > summary {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .does > summary {
      min-block-size: var(--tap);
    }
  }

  /* EACH PART UNDER ITS OWN SMALL HEADING, the gap a row of tiles keeps between them. */
  .does-parts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    margin-block-start: var(--sp-4);
  }

  .does-h {
    margin: 0 0 var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
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
     items in a wide column once generated seven tracks, four of them empty (05 §4). Nothing on a card moves or fades
     when a key reaches it: the focus ring is the only change. */
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
  }

  /* AN ANSWER IS A PILL that wraps inside itself rather than pushing its card sideways at 390. */
  .options :global(.btn) {
    justify-content: flex-start;
    max-inline-size: 100%;
    white-space: normal;
    text-align: start;
    overflow-wrap: anywhere;
  }

  .card > :global(.btn) {
    align-self: start;
  }

  /* A QUIET PILL ON A TILE-2 WELL IS THE TILE'S WHITE, or it would be the well's own grey and no pill at all. */
  .cards .card > :global(.btn[data-weight='quiet']:not([data-suggested])) {
    background: var(--bg);
  }

  @media (hover: hover) and (pointer: fine) {
    .cards .card > :global(.btn[data-weight='quiet']:hover:not(:disabled)) {
      background: var(--s2);
    }
  }

  /* THE RECORD'S TWO ANSWERS, side by side at the start of the tile, and stacked full width under a thumb. */
  .two {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  /* THE SUGGESTED ANSWER IS AN OUTLINE WITH A SMALL DOT (DIRECTION §37, his pick): an ink ring and no fill, so it is
     said and not pre-pressed, and the dot before its words. A screen reader hears "Suggested" after the name. Off for a
     reader who may not answer, the ring goes quiet with the words. */
  .options :global(.btn.tap[data-suggested]) {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--ink);
  }

  .options :global(.btn.tap[data-suggested]:disabled) {
    box-shadow: inset 0 0 0 1.5px var(--line);
  }

  /* THE ANSWER THE RECORD'S ONE LINE IS FOR, while it is open: the selected ground and an ink edge, a shape and not a
     shade. */
  .options :global(.btn.tap[data-on]) {
    background: var(--selected);
    box-shadow: inset 0 0 0 1.5px var(--ink2);
  }

  .dot {
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-pill);
    background: currentColor;
  }

  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
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

  .commit-fix {
    margin: var(--sp-2) 0 0;
    font-size: var(--t-ui);
  }

  .commit-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
  }

  /* ── one line: the reason the record asks for, and a note after a decline or an edit ── */

  .line-form {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
    margin-block-start: var(--sp-4);
  }

  .line-label {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .line-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* A FIELD IS 40 ON TILE-2, radius 12, no border: the fill is its edge. Kept clear of the sticky bar when focused. */
  .line-field {
    flex: 1 1 18ch;
    min-inline-size: 0;
    min-block-size: 40px;
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .note-offer {
    margin: var(--sp-3) 0 0;
    margin-inline-start: calc(-1 * var(--sp-3));
  }

  .note-kept {
    margin: var(--sp-3) 0 0;
    color: var(--ink2);
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
  }

  @media (pointer: coarse) and (width < 600px) {
    .two {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
