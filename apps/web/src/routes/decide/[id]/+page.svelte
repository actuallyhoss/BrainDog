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
  import { day, since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { iconFor, whoDid } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { installWords } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import Cited from '$lib/ui/Cited.svelte';
  import { figuresIn, reasonIn } from '$lib/cite.ts';
  import Changes from './Changes.svelte';
  import Proposed from './Proposed.svelte';
  import Arranged from './Arranged.svelte';
  import Applied from './Applied.svelte';
  import { heard } from '$lib/voice.svelte.ts';
  import {
    appliedLines,
    arrangedOf,
    asksTwice,
    heldOf,
    isArranging,
    KEYS_CONTEXT,
    partialOf,
    stopping,
    TICKS_CONTEXT,
    ticksOf,
    type KeysContext,
    type Partial,
    type TicksContext,
  } from './arranged.ts';
  import { proposedOf } from './proposed.ts';
  import { updatesOf, words as changeWords } from './changes.ts';
  import { joinedCount, pickableOf, rowsToSend, words as pickWords } from './picked.ts';
  import { answerFor, type Answer } from '$lib/record/answer.ts';
  import { COMMENT_MOST, sayComment } from '$lib/record/comments.ts';
  import { everyGovernance, plainOf, readOne, type One } from '$lib/record/governance.ts';
  import { answerQuestion, parkQuestion, type Written } from '$lib/record/decide-write.ts';
  import { proposer, queueMergeOf, queueWords, type FileAt } from '$lib/page/queue-answer.ts';
  import '$lib/decide/form.css';
  import { cardWords, spoken } from '$lib/decide/card.ts';
  import { mayAnswer, whyNotAnswering } from '../answering.ts';
  import { acceptKey, declineKey, fromInput, hold, HOLD_MS, keyAct, labelOf, movesOf, notedAfter, twoWords, type Held } from '../press.ts';
  import { mergeListOf, mergeOf, words as mergeWords, type Press } from '../merge.ts';
  import MergeCard from '../MergeCard.svelte';
  import { nextOpen, stillWaiting, words as onwardWords } from './onward.ts';
  import { sideOf, words as sideWords } from './side.ts';
  import { readFiles, visualsOf } from './option-visual.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { hostedHere } from '../../settings/billing.ts';
  import { goto, invalidateAll } from '$app/navigation';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { pressedOnly } from '@braindog/kernel';
  import { setContext, tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Thread from '$lib/ui/Thread.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import { WORDS as LEAD } from '../lead.ts';
  import { words as gate } from '../words.ts';
  import Face from '$lib/ui/Face.svelte';
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
    partsOff = [];
    again = false;
    chosenKey = null;
    refusal = out.from === 'refused' ? out.fix : '';
    from = out.from;
    closed(out.from !== 'refused', at);
    keysHeld = undefined;
    if (live?.about && isArranging(live.about.kind)) void readHeld();
    void readPictures(id);
  }

  /**
   * WHICH KEYS THE RECORD HOLDS, by label, for an arrangement's sitting: read from `listGrants`, which carries a label and
   * how it is sealed and never a value. Read again after a key is put in, so the tick is the record's and not this
   * screen's guess. A refused read leaves it unknown, and the page then says nothing about holding either way.
   */
  let keysHeld = $state<ReadonlyMap<string, 'connector' | 'person'> | undefined>(undefined);
  async function readHeld() {
    if (!client) return;
    const out = await client.listGrants();
    keysHeld = out.ok ? heldOf(out.value) : undefined;
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
     was filed with, because the question's words carry none, and through `visualsOf`, which holds a swatch to the
     renderer's own spelling before it reaches a style.

     A PICTURE IS SERVED BY THE RECORD THE PAGE IS ON. The queue's tile is handed its way to a file by the page that drew
     it; this page has no block, so it asks the record for the entry a picture option names (`readFiles`) and places the
     address under this record. Until that answers, and for a reader the record will not show the entry to, the option
     reads by its name. */
  const offered = $derived(about?.kind === 'options' ? about.body.options : undefined);
  let optionFile = $state.raw<FileAt | undefined>(undefined);
  const visuals = $derived(visualsOf(offered, optionFile));
  async function readPictures(id: string) {
    if (!client) return;
    const file = await readFiles(client.get, offered, (path) => at(path));
    /* KEPT ACROSS A RE-READ, so a picture does not blink out while the question is read again: it is the same record,
       and an entry's file is the same file whichever question names it. An answer for a question already left is dropped. */
    if (String(page.params.id) === id) optionFile = file;
  }
  const lists = $derived(
    new Map<string, string>(((page.data.lists ?? page.data.index?.registers ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name])),
  );
  const story = $derived(
    about ? arrangedOf(about.kind, about.body, { lists, labels: heard(), pagesNow: live?.pagesNow, held: keysHeld }) : null,
  );
  /* A KEY'S FIELD ONLY FOR A READER WHO MAY ANSWER: the record refuses anybody else's key, and a field that can only be
     refused is a control that cannot change anything. */
  const keyClient = $derived(from === 'live' && answerable ? client : null);
  /* HANDED DOWN BY CONTEXT, so the story keeps its one spelling on this page and on the queue, and only this page, the
     question's own, gives a key a field. */
  setContext(KEYS_CONTEXT, {
    get client() {
      return keyClient ?? undefined;
    },
    onheld: readHeld,
  } satisfies KeysContext);

  /* THE PARTS OF AN ARRANGEMENT, A TICK EACH (REC-A07 step 2): the ones unticked by hand are kept here, and what Accept
     sends is worked out from them and the keys the record holds (`ticksOf`), so a part whose key is missing is off
     without anybody unticking it and comes back on once the key is held. */
  let partsOff = $state<string[]>([]);
  const taking = $derived(story?.takes ? ticksOf(story.takes, new Set(partsOff)) : null);
  /* A LIVE DOOR THAT GOES WITH NOBODY TO TAKE IT (REC-A16) asks twice: the first press says what stops, the second sends. */
  let again = $state(false);
  setContext(TICKS_CONTEXT, {
    get unticked() {
      return new Set(partsOff);
    },
    tick(id: string, on: boolean) {
      partsOff = on ? partsOff.filter((x) => x !== id) : [...partsOff, id];
      noneTicked = false;
      again = false;
    },
  } satisfies TicksContext);

  /** What an accepted arrangement did, and how far one got when the record stopped part way. */
  let applied = $state<string[]>([]);
  /* WHAT THE RECORD KEPT ON THE DECISION, for a reload and for anybody who did not press accept. */
  const kept = $derived(from === 'live' && live?.applied ? appliedLines(live.applied.did, live.applied.body) : []);
  let part = $state<Partial | null>(null);
  const sidebarNow = (): Map<string, string> =>
    new Map(((page.data.nav ?? []) as { href: string; title: string }[]).map((n) => [n.href, n.title]));

  /* A MERGE IS ASKED AS WHO IS WHO (`../merge.ts`): the names, where each was seen, Merge all, Keep apart and Pick.
     THE RECORD'S OWN GROUP FIRST, as the suggestion row carries it (`merge`), with the answers it names, so this page
     offers the Picks the queue's card does; a rowset with none is read off its patches as before. */
  const merge = $derived(
    question && from === 'live' && live
      ? (queueMergeOf({ kind: 'rowset', merge: live.about?.merge }, []) ??
          mergeOf(live.about, question.options.map((o) => o.key), live.rowset ? (live.rows[live.rowset.register] ?? []) : []))
      : null,
  );
  /* THE OPTIONS' TILE WEARS THE MERGED LIST'S OWN ICON, read off the record (`mergeListOf`) and never named here. */
  const optionsIcon = $derived.by(() => {
    if (!merge) return 'decide' as const;
    const list = mergeListOf(merge, REGISTERS);
    return iconFor(list === null ? undefined : REGISTERS[list]?.icon, 'rows');
  });

  /* A `rowset` that updates rows: each changed field, as a diff for prose and before and after for the rest. A merge's
     patches are the card's names, and drawn as a diff they were the record's handles and a deleted day. */
  const updates = $derived(question && live && !merge ? updatesOf(live.rowset, live.registers, live.rows, plainOf(live.registers)) : []);

  /* A QUESTION THAT GATHERED SEVERAL, each arrival joining the one already open (`kernel/ingest.ts` `openRowset`), says
     how many it holds beside its title, so a reader never accepts twelve having read one. */
  const joined = $derived(merge ? undefined : joinedCount(about?.kind, about?.body));

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
  /* AND THE SUGGESTION, the first one an agent marked, on every question: where it is hard to undo or money moves, the
     dot stays and only Enter is taken away (`press.ts` `acceptKey`). */
  const suggestedKey = $derived(question?.options.find((o) => o.recommended === true)?.key);

  /**
   * THE ANSWER CHOSEN, ON A QUESTION OF OPTIONS (DIRECTION §39, "Decide reads like a form"): a press on a choice chooses
   * it and Decide gives it. The form starts on the answer Enter would give (`acceptKey`), the suggestion where a key may
   * give it, and on nothing where the answer is hard to undo or money moves. The record's own two answers and a merge
   * have no choice to start on: their buttons are the answers.
   */
  let chosenKey = $state<string | null>(null);
  const startKey = $derived(question && !two && !merge ? acceptKey(question, moves.length > 0) : null);
  const selectedKey = $derived(chosenKey ?? startKey);
  /* A BUTTON WHOSE ANSWER IS HARD TO TAKE BACK SAYS SO IN ITS WORDS, never in a chip beside it. THE QUESTION'S BAND SAYS
     IT OF EVERY ANSWER, AND AN OPTION'S OWN MARK OF THAT ONE (`hard`, the record's `option_costs`): "Keep my page"
     beside "Take the update's page" is a call, and only taking is worded as hard. */
  const hardOption = (key: string | null): boolean => key !== null && question?.options.find((o) => o.key === key)?.hard === true;
  const pressSaid = (label: string, key: string | null = null): string => (question?.band === 'undo' || hardOption(key) ? queueWords.hard(label) : label);

  /* WHO ASKED AND WHEN, the quiet line over the answers, by the name every screen gives them, never a handle. */
  const asker = $derived(about?.by ? proposer(about.by, String(page.data.me?.person ?? '') || null, new Map(Object.entries((page.data.names ?? {}) as Record<string, string>))) : null);

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
    if (sending !== null || holding !== null || !question) return;
    deferring = false;
    fix = '';
    noneTicked = key === 'accept' && ((pickable.length > 0 && picked === null) || taking?.parts?.length === 0);
    if (noneTicked) return;
    /* THE FIRST ACCEPT OF ONE THAT STOPS MESSAGES BEING FILED SAYS SO AND SENDS NOTHING; the second sends. */
    if (key === 'accept' && !again && asksTwice(story, taking?.parts)) {
      again = true;
      return;
    }
    if (key !== 'accept') again = false;
    /* WITH THE RECORD'S ONE LINE OPEN, another answer changes the choice and keeps the words already typed. */
    if (asked !== null) {
      asked = key;
      void tick().then(() => field?.focus());
      return;
    }
    void send(key);
  }

  /** A choice chosen, and nothing sent: Decide sends it. With the record's one line open it changes the answer there. */
  function pick(key: string) {
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
    if (sending !== null || holding !== null) return;
    if (asked !== null) return choose(key);
    chosenKey = key;
  }

  /** DECIDE: the answer chosen, given. With none chosen yet the focus goes to the first choice, and nothing is sent. */
  function commit() {
    if (selectedKey === null) return void document.getElementById(`opt-${question?.options[0]?.key ?? ''}`)?.focus();
    choose(selectedKey);
  }

  /**
   * ENTER ON A CHOICE CHOOSES IT AND GIVES IT, as Enter sends a form and as `1` to `9` then Enter always has; the arrows
   * walk the choices and choose as they go. Space is the button's own press, which only chooses.
   */
  function onChoiceKey(e: KeyboardEvent, key: string) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !question) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      chosenKey = key;
      choose(key);
      return;
    }
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const all = question.options;
    const at = all.findIndex((o) => o.key === key);
    const next = all[(at + step + all.length) % all.length];
    if (!next) return;
    pick(next.key);
    document.getElementById(`opt-${next.key}`)?.focus();
  }

  /* ── an answer held for its Undo ─────────────────────────────────────── */

  /**
   * THE PRESS BEING HELD FOR ITS UNDO: a merge's answer, and a decline Backspace gave. Neither can be taken back once it
   * is in (a declined question is never reopened, and a pair kept apart is never asked about again), so the press waits
   * six seconds with Undo on the line it leaves, and only then goes to the record (`press.ts` `hold`).
   */
  let holding = $state<{ key: string; id: string; held: Held; toast: number } | null>(null);
  /** Whether this screen is still the one drawn, so a press that outlives it is sent without touching the next one. */
  let mounted = true;

  function held(key: string, line: string, rows?: number[]) {
    if (!answerable) {
      toasts.push(whyNot, { intent: 'warn' });
      return;
    }
    if (sending !== null || holding !== null || !question) return;
    /* WITH THE RECORD'S ONE LINE OPEN, the answer goes with the words the record asked for, as any press does there. */
    if (asked !== null) return choose(key);
    const id = question.id;
    deferring = false;
    fix = '';
    const h = hold(() => {
      if (holding) toasts.dismiss(holding.toast);
      holding = null;
      /* SENT FROM HERE ONLY WHILE THIS SCREEN STILL SHOWS THE QUESTION IT WAS GIVEN ON. `j`, `k` and Next keep the gate
         and change its question, and `send` answers whichever question the gate holds now. */
      if (mounted && question?.id === id && String(page.params.id) === id) void send(key, undefined, rows);
      else void sendAway(id, key, rows);
    });
    holding = { key, id, held: h, toast: toasts.push(line, { undo: unhold, life: HOLD_MS, intent: 'good' }) };
  }

  /** Undo, from the line or with ⌘Z: the press is taken back and nothing is sent, unless it has already gone. */
  function unhold() {
    const was = holding;
    if (!was) return void toasts.push(mergeWords.tooLate);
    if (!was.held.undo()) return void toasts.push(mergeWords.tooLate);
    holding = null;
    toasts.push(mergeWords.undone);
    void tick().then(() => document.getElementById(`opt-${was.key}`)?.focus());
  }

  /** A merge's press, held for its Undo. */
  const pressMerge = (press: Press, line: string) => held(press.option, line, press.rows);

  /**
   * A HELD PRESS THAT OUTLIVED ITS SCREEN, sent on its own: the reader moved on to the next question inside the six
   * seconds, and the answer they gave is still theirs. Only a refusal is said, as a warning, since nothing on the screen
   * they are on now is about it.
   */
  async function sendAway(id: string, option: string, rows?: number[]) {
    const out = await answerQuestion(apiBase(), id, option, undefined, undefined, rows);
    if (out.from !== 'written') toasts.push(out.fix, { intent: 'warn' });
  }

  /* LEAVING THE SCREEN, OR THE TAB, SENDS WHAT IS HELD AT ONCE rather than dropping it. */
  $effect(() => {
    const leave = () => holding?.held.flush();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      mounted = false;
      leave();
    };
  });

  /* AND MOVING ON TO ANOTHER QUESTION SENDS IT TOO, so the next question's answers are not held off behind it. */
  $effect(() => {
    const id = String(page.params.id);
    untrack(() => {
      if (holding && holding.id !== id) holding.held.flush();
    });
  });

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
    /* AND THE ONE TEST FOR TYPING, not a narrower copy, with the key's own target beside it: a key that starts inside a
       field or a box is that field's, whatever holds the focus by now (`press.ts` `fromInput`). */
    if (typing() || fromInput(e.target)) return;
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
      /* A MERGE IS ANSWERED ON ITS OWN BUTTONS: folding a person away is hard to undo, and Enter never gives it. */
      if (act === 'accept' && merge) return;
      const key = act === 'accept' ? acceptKey(question, moves.length > 0) : declineKey(question);
      /* NOTHING ENTER MAY GIVE ON ITS OWN, on a question that is hard to undo, moves money or suggests nothing: the focus
         goes to the first answer (Accept, whose words name the amount), so the next Enter is a press on that button. */
      if (key === null && act === 'accept') {
        e.preventDefault();
        document.getElementById(`opt-${question.options[0]?.key ?? ''}`)?.focus();
        return;
      }
      /* BACKSPACE IS HELD FOR ITS UNDO: a decline is never reopened, and a merge kept apart is never asked again. */
      if (act === 'decline' && merge) {
        e.preventDefault();
        pressMerge(merge.apart, mergeWords.keptApart);
        return;
      }
      if (key === null) return;
      e.preventDefault();
      if (act === 'decline') held(key, gate.declinedHeld(spoken(question.title)));
      else choose(two ? key : (selectedKey ?? key));
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

  async function send(key: string, said?: string, only?: number[]) {
    const a = answerFor(question, key, new Date(now).toISOString());
    if (!a || from !== 'live' || !client || sending !== null) return;
    sending = key;
    const accepting = a.option === 'accept' && about !== undefined && isArranging(about.kind) ? about : null;
    const had = accepting ? sidebarNow() : null;
    const rows = only ?? (a.option === 'accept' && picked ? picked : undefined);
    /* THE PARTS TICKED, on accepting an arrangement some of which is off; every part ticked sends none, the whole. */
    const parts = accepting && taking?.parts ? taking.parts : undefined;
    const out = await answerQuestion(apiBase(), a.question, a.option, said, undefined, rows, parts);
    sending = null;
    again = false;
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
    /* TAKEN IN PART: what was ticked is in, and the rest is the same question, open, read again so what is left is
       what is drawn. Nothing is committed on this screen, since the question is not answered yet. */
    if (accepting && out.from === 'written' && out.open && parts) {
      toasts.push(copy.arrangeTookSome(parts.length), { intent: 'good' });
      await invalidateAll();
      await readLive(a.question);
      return;
    }
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
    if (from !== 'live' || !client || !question || sending !== null || holding !== null) return;
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


  /* ── what accepting does, one folded tile under the options ───────────── */

  /** Still open here: neither settled on this screen nor closed on the record. */
  const costed = $derived(question !== undefined && !settled && !(from === 'live' && live?.closed));
  /** The rows to tick, while there is still a decision for them to be part of. */
  const picking = $derived(pickable.length > 0 && costed);
  /** What accepting would call out, while it can still be approved. */
  const calling = $derived(from === 'live' && live !== null && live.calls.length > 0 && costed);
  /* WHAT ACCEPTING DOES HAS SOMETHING TO SAY: an arrangement, what a proposal puts in place, the rows to tick, the rows
     it changes, what it calls out, or what deciding late costs. A question of options alone has none of these. */
  const doesAny = $derived(
    Boolean((story && !settled) || (preview && !settled) || picking || updates.length || calling || (costed && question?.cost)),
  );

  /**
   * THE SIDE BESIDE THE CHOICES (`side.ts`), for a question still open: the share the asker gave on the question's body
   * and the things the reasons name, each only where the record holds it. Who asked and why it is asked lead it. What
   * answering changes is drawn whole under the answers (`section.does`) and is not said again beside them.
   */
  const side = $derived.by(() => {
    if (!question || !costed) return null;
    const body = about?.body;
    return sideOf({
      why: question.context ? spoken(question.context) : '',
      reasons: question.options.map((o) => ({ text: reasonIn(body, o.key) ?? o.body })),
      body,
      figures: figuresIn(body),
      now,
    });
  });
  /* A QUESTION WITH NOTHING FOR THE SIDE HAS NONE: who asked is the quiet line over the answers, and the tile reads as
     one centred column at a form's measure, never a blank column beside the choices. A receipt reads the same way. */
  const sided = $derived(side?.any === true);
  /** The side's parts under the answers on a phone, beside them on a laptop: the evidence and what is linked. */
  const sideMore = $derived(side !== null && (side.evidence !== null || side.links.length > 0));

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

<svelte:head><title>{titleOf(question ? spoken(question.title) : undefined, copy.decide)}</title></svelte:head>

<svelte:window {onkeydown} />

<!-- THE WAY ON, ONE SNIPPET FOR EVERY STATE THAT IS NOT AN OPEN QUESTION: settled, closed, refused and
     not found. The settled block drew `Next question` only for a press made in this session and only
     when the question was not last in the queue, so a decision reached from the Decided list, or the
     last one answered, ended the page with nothing to press. The queue is offered whatever else is,
     and the inbox when something waits there, which is what `/decide` offers when it is clear. -->
<!-- NOT NOW, THE THIRD VERB, kept beside the answers: a queue with only yes and no is a queue that gets rubber-stamped.
     It opens the step that asks why not yet and until when. -->
{#snippet later()}
  {#if !deferring}
    <button type="button" class="dc-btn" data-weight="bare" disabled={!answerable} aria-describedby={answerable ? undefined : 'cannot-decide'} onclick={defer}>{gate.notNow}</button>
  {/if}
{/snippet}

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
  <!-- THE QUESTION IS THE PAGE'S TITLE, and a question that gathered several says how many beside it. No sentence under
       it: how many answers there are and which is suggested is what the tile under it shows, and saying it twice was
       the trivia the reset took out (DIRECTION §39). -->
  <PageHead icon="decide" kicker={copy.decide} back="/decide" title={spoken(question.title)} count={joined} />

  <div class="page" data-plain={sided ? undefined : ''}>
    <!-- HOW FAR AN ACCEPTED ARRANGEMENT GOT LEADS, because it is the news and the reason the options came back. -->
    {#if part && !settled}<Applied partial={part} />{/if}
    <!-- WHO DECIDES THIS ONE, and for the owner the way to name them: its own chunk, read only on an open question. -->
    {#if !settled}{#await import('./Decider.svelte') then m}<m.default {question} owner={me.owner} me={me.person} />{/await}{/if}

    <!-- ONE TILE, READ LIKE A FORM (DIRECTION §39): who asked and when, why, the answers as choices, Decide and Not now,
         then what accepting does as a plain part of the same tile, and the comments under it all. A settled question
         is its receipt in the same place, and its comments stay under it. -->
    <Tile class="gate">
      {#if settled}
        <!-- THE RECEIPT, WITH ITS GREEN CHECK: who, when, which option, and the reason as it was written. -->
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
          {#if preview?.pattern}{#await import('./PatternReads.svelte') then loaded}<loaded.default pattern={preview.pattern} resolved said={live?.about?.body.said} />{/await}{/if}
          <!-- WHERE IT WENT, and what still waits. A receipt here is always a written decision. -->
          <p class="settled-where">{onwardWords.where} {onwardWords.left(waiting)}</p>
          <div class="settled-next">{@render onward()}</div>
        </div>
      {:else if from === 'live' && live?.closed}
        <!-- SETTLED, AND ITS DECISION IS NOT AMONG THE ONES READ. Nothing here can answer it again, and the line says so
             without the question's handle: its title is the heading above. -->
        <p class="cost-age">{gate.closedNow} {onwardWords.left(waiting)}</p>
        {@render onward()}
      {:else}
        <!-- WHY THE ANSWERS ARE OFF COMES FIRST, ABOVE THE OPTIONS AND NOT AFTER A PRESS AND A PARAGRAPH. It is the
             record's own refusal, said before anybody has chosen anything, and it ends by saying that reading is what
             this colleague still holds. Every answer's button and Not now point at it. Over the form and its side both. -->
        {#if !answerable}
          <p class="cannot" id="cannot-decide">{whyNot}</p>
        {/if}

        <!-- THE FORM AND ITS SIDE (DIRECTION §39). On a wide tile the answers and what accepting does are the first
             column, and beside them a side says who asked and when, why, the evidence and what is linked, each only
             where the record holds it. On a narrow one both are let go of and read in one column:
             who asked, why, the answers, what accepting does, then the evidence and what is linked. A QUESTION WITH
             NOTHING FOR THE SIDE HAS NO SIDE: who asked is one quiet line over the answers and the tile is one centred
             column (`side.ts`). The side's parts are groups with a name, never landmarks of their own. -->
        {#snippet askedBy(said: boolean)}
          <p class="gate-by">
            {#if said}<span class="dc-sr">{cardWords.askedBy}</span>{/if}
            {#if asker}<Face name={asker.name} kind={asker.kind} size="s" /><span class="gate-who">{asker.name}</span>{/if}
            <span class="gate-when">{since(question.opened, now)}</span>
          </p>
        {/snippet}
        <div class="gate-form" data-side={sided ? '' : undefined}>
          {#if sided}
            <!-- WHO ASKED AND WHEN, quiet, then WHY it is asked, in the asker's own words, before the answers. -->
            <div class="gate-side">
              <div class="gate-part" role="group" aria-labelledby="gate-by-h">
                <h2 class="gate-side-h" id="gate-by-h">{cardWords.askedBy}</h2>
                {@render askedBy(false)}
              </div>
              {#if question.context}
                <div class="gate-part" role="group" aria-labelledby="gate-why-h">
                  <h2 class="gate-side-h" id="gate-why-h">{cardWords.why}</h2>
                  <p class="gate-why">{symbolText(spoken(question.context))}</p>
                </div>
              {/if}
            </div>
          {/if}

          <div class="gate-main">
            {#if !sided}{@render askedBy(true)}{/if}
            <!-- ONE ANSWER'S BUTTON, for the record's own two answers: it says what it does (`press.ts` `labelOf`), Decline for
                 the record's Reject and the amount on Accept when money moves, and the care a hard one asks for in its words.

                 OFF FOR A READER WHO MAY NOT ANSWER, pointing at the sentence above the answers that says why.
                 `aria-describedby` rather than a title, so the reason is read out with the control and not only seen. -->
            {#snippet answer(option: { key: string; title: string }, q: { options: readonly { key: string; title: string }[] })}
              {@const marked = suggestedKey === option.key}
              <button
                type="button"
                class="dc-btn"
                id="opt-{option.key}"
                data-answer={option.key}
                data-suggested={marked ? '' : undefined}
                data-weight={option.key === 'accept' ? 'primary' : undefined}
                data-on={asked === option.key ? '' : undefined}
                aria-pressed={asked === null ? undefined : asked === option.key}
                disabled={!answerable || holding !== null}
                aria-describedby={answerable ? undefined : 'cannot-decide'}
                onclick={() => choose(option.key)}
              >
                {option.key === 'accept' ? pressSaid(labelOf(option, q, moves)) : hardOption(option.key) ? queueWords.hard(labelOf(option, q, moves)) : labelOf(option, q, moves)}{#if marked}<span class="dc-sr">, {gate.suggested}</span>{/if}
              </button>
            {/snippet}

            <section class="options" aria-label={merge ? mergeWords.heading : copy.theOptions}>
              {#if merge}
                <!-- WHO IS WHO: each name and where it was seen, and one press each, held for its Undo. -->
                <MergeCard
                  {merge}
                  {answerable}
                  holding={holding?.key ?? null}
                  titleOf={(key) => spoken(question.options.find((o) => o.key === key)?.title ?? '')}
                  onpress={pressMerge}
                />
              {:else if two}
                <!-- THE RECORD'S TWO ANSWERS ARE TWO BUTTONS, Accept and Decline, with Not now beside them. -->
                <div class="dc-actions">
                  {#each question.options as option (option.key)}{@render answer(option, question)}{/each}
                  {@render later()}
                </div>
              {:else}
                <!-- THE ANSWERS AS CHOICES: each a full-width rectangle with its name and what it does, the suggested one
                     saying so in the accent's words, the one chosen ringed (`form.css`). A press chooses; Decide gives it. -->
                <ul class="dc-choices" role="radiogroup" aria-label={copy.theOptions}>
                  {#each question.options as option}
                    <!-- THE REASON AS IT WAS FILED, so its rows are links (`Cited`), each named by its list; where the body
                         holds no reason, the words `questionOf` made of it. -->
                    {@const because = reasonIn(about?.body, option.key) ?? option.body}
                    {@const shows = visuals.get(option.key)}
                    {@const marked = suggestedKey === option.key}
                    {@const on = asked === null ? selectedKey === option.key : asked === option.key}
                    <li role="none">
                      <div class="dc-choice" data-checked={on ? '' : undefined}>
                        <span class="dc-ring" aria-hidden="true"></span>
                        <span class="dc-choice-main">
                          <!-- WHAT THE OPTION IS LEADS IT, inside its own box and nowhere else: a swatch writes its colour
                               into `--swatch` on its chip alone, hidden from a screen reader because the name says it. -->
                          {#if shows && 'swatch' in shows}
                            <span class="card-visual" data-shows="swatch" aria-hidden="true">
                              {#each shows.swatch as colour, s (s)}<span class="card-swatch" style:--swatch={colour}></span>{/each}
                            </span>
                          {:else if shows && 'figure' in shows}
                            <span class="card-visual" data-shows="figure"><span class="card-figure num">{shows.figure}</span></span>
                          {:else if shows && 'file' in shows}
                            <!-- A PICTURE SAYS WHICH OPTION IT IS, in the option's own name, for a reader who cannot see it. -->
                            <span class="card-visual" data-shows="file"
                              ><img class="card-file" src={shows.file.src} alt={labelOf(option, question, moves)} loading="lazy" decoding="async" /></span
                            >
                          {/if}
                          <button
                            type="button"
                            role="radio"
                            class="dc-choice-hit"
                            id="opt-{option.key}"
                            data-answer={option.key}
                            data-suggested={marked ? '' : undefined}
                            aria-checked={on}
                            disabled={!answerable || holding !== null}
                            aria-describedby={answerable ? undefined : 'cannot-decide'}
                            onclick={() => pick(option.key)}
                            onkeydown={(e) => onChoiceKey(e, option.key)}
                            >{labelOf(option, question, moves)}{#if marked}<span class="dc-sr">, {gate.suggested}</span>{/if}</button
                          >
                          <!-- AN OPTION WITH NO REASON SHOWS NONE, rather than an empty line under its name. -->
                          {#if because.trim() !== ''}
                            <span class="dc-choice-does card-body"><Cited text={because} figures={figuresIn(about?.body)} {now} /></span>
                          {/if}
                        </span>
                        {#if marked}<span class="dc-rec" aria-hidden="true">{gate.suggested}</span>{/if}
                      </div>
                    </li>
                  {/each}
                </ul>
                <div class="dc-actions">
                  {#if asked === null}
                    <button
                      type="button"
                      class="dc-btn"
                      data-weight="primary"
                      id="gate-decide"
                      aria-disabled={selectedKey === null}
                      disabled={!answerable || holding !== null || sending !== null}
                      aria-describedby={answerable ? undefined : 'cannot-decide'}
                      onclick={commit}>{pressSaid(gate.decide, selectedKey)}</button
                    >
                  {/if}
                  {@render later()}
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
              {#if noneTicked}<p class="commit-fix" role="status" data-intent="bad">{pickable.length > 0 ? pickWords.none : copy.arrangeTakeNone}</p>{/if}
              <!-- ASKED TWICE: what stops being filed, said on the first Accept, with the mark and the words, never colour alone. -->
              {#if again && story?.stops}<p class="commit-fix" role="status" data-intent="bad">{copy.arrangeStopsAgain(stopping(story, taking?.parts).map((s) => s.name))}</p>{/if}
              {#if fix && !deferring}<p class="commit-fix" role="status" data-intent="bad">{fix}</p>{/if}
            </section>

            <!-- NOT NOW OPENS THE STEP THAT PUTS IT OFF, in the same tile: why not yet, and until when. -->
            {#if deferring}
              <section class="commit" aria-labelledby="defer-title">
                <h2 class="commit-title" id="defer-title">{copy.deferTitle}</h2>
                <!-- A FIELD WITH ITS LABEL ABOVE IT, so the words stay once somebody types. -->
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
            {/if}

            <!-- WHAT ACCEPTING DOES, A PLAIN PART OF THE SAME TILE under the answers: what an arrangement does, what a
                 proposal puts in place, the rows to tick, the rows it changes, what it calls out, and what deciding late
                 costs. Each under its own small heading, open, read before the press and never in the way of it. -->
            {#if doesAny}
              <section class="does" aria-labelledby="does-title">
                <h2 class="gate-h" id="does-title">{LEAD.does}</h2>
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
                       sent, as the record worked them out when the proposal was filed. -->
                  {#if calling && live}
                    <section class="changed">
                      <h3 class="does-h">{installWords.heading}</h3>
                      <dl class="calls-out">
                        <CallsOut calls={live.calls} hosted={hostedHere(page.data as unknown as Shell)} note={installWords.acceptApproves} />
                      </dl>
                    </section>
                  {/if}

                  <!-- WHAT DECIDING LATE COSTS, as whoever asked wrote it. What getting it wrong costs is said in the button. -->
                  {#if costed && question.cost}
                    <section class="cost">
                      <h3 class="does-h">{copy.costOfDelay}</h3>
                      <p class="cost-body">{symbolText(question.cost)}</p>
                    </section>
                  {/if}
                </div>
              </section>
            {/if}
          </div>

          <!-- THE REST OF THE SIDE, written after the answers so a phone reads it under them: the share the asker gave
               on the question's body, and the things the reasons name, each a link to it by its own name. What answering
               changes is not here: it is whole under the answers, at every width, and said once. -->
          {#if side && sided && sideMore}
            <div class="gate-side gate-more">
              {#if side.evidence}
                {@const ev = side.evidence}
                <div class="gate-part" role="group" aria-labelledby="gate-ev-h">
                  <h2 class="gate-side-h" id="gate-ev-h">{sideWords.evidence}</h2>
                  <!-- THE SQUARES ARE FOR THE EYE; the sentence under them is what they mean, and a screen reader hears it
                       there, once. -->
                  <div class="gate-ev" aria-hidden="true">
                    <Waffle
                      parts={[
                        { label: '', value: ev.value, tone: 'ink' },
                        { label: '', value: ev.max - ev.value, tone: 'g3' },
                      ]}
                      summary={ev.said}
                    />
                  </div>
                  <p class="gate-ev-said">{ev.said}</p>
                </div>
              {/if}
              {#if side.links.length > 0}
                <div class="gate-part" role="group" aria-labelledby="gate-linked-h">
                  <h2 class="gate-side-h" id="gate-linked-h">{sideWords.linked}</h2>
                  <ul class="gate-links">
                    {#each side.links as link (link.href)}<li><a class="gate-link" href={at(link.href)}>{link.title}</a></li>{/each}
                    {#if side.more > 0}<li class="gate-links-more">{sideWords.more(side.more)}</li>{/if}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- THE QUESTION'S COMMENTS, IN THE SAME TILE, open or settled, since what was said about it is worth as much after
           the decision as before. On the question and not on each option. A Reads colleague may comment here too. -->
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
    </Tile>
  </div>
{/if}

<style>
  /* THE GATE IS ONE TILE ON THE BOARD, running the window's width; what is read inside it keeps a form's measure. */
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* THE TILE IS A FORM'S COLUMN: who asked, why, the answers, the buttons, what accepting does, the comments. */
  .page :global(.tile.gate) {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* ── the form and its side ─────────────────────────────────────────────── */

  /* ONE COLUMN, ON A NARROW PAGE: the form and the side are let go of, and their parts are the tile's own, read in the
     order a question always was: who asked, why, the answers, what accepting does, then the evidence and what is linked. */
  .gate-form,
  .gate-side,
  .gate-main,
  .gate-part {
    display: contents;
  }

  /* A QUIET HEADING OVER EACH PART OF THE SIDE, said to a screen reader in one column, where who asked and why sit at
     the top of the tile as they always did and need no name. */
  .gate-side-h {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 1.4;
  }

  /* THE PARTS UNDER THE ANSWERS KEEP THEIR HEADINGS at every width, since nothing about their place says what they are;
     each is its heading and what is under it, a step apart. */
  .gate-more .gate-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .gate-more .gate-side-h {
    position: static;
    inline-size: auto;
    block-size: auto;
    overflow: visible;
    clip-path: none;
  }

  /* TWO COLUMNS, ON A WIDE PAGE WITH SOMETHING FOR THE SIDE: the answers and what accepting does, and beside them a
     side under quiet headings, a hairline at its start. The side is written in two halves, who asked and why before the
     answers and the rest after them, so one column reads in order; here both sit in the second column, one under the
     other, and the answers span them. The page is the container, its tile 40px inside it, so the threshold is the
     card's (52rem of tile) and the tile's padding. */
  @container (inline-size >= 55rem) {
    .gate-form[data-side] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) clamp(280px, 26cqi, 360px);
      grid-template-rows: auto 1fr;
      column-gap: var(--sp-6);
      align-items: start;
    }

    .gate-form[data-side] > .gate-main {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      grid-row: 1 / span 2;
      grid-column: 1;
      min-inline-size: 0;
    }

    .gate-form[data-side] > .gate-side {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
      grid-row: 1;
      grid-column: 2;
      align-self: stretch;
      min-inline-size: 0;
      padding-inline-start: var(--sp-5);
      border-inline-start: 1px solid var(--rule);
    }

    .gate-form[data-side] > .gate-more {
      grid-row: 2;
      padding-block-start: var(--sp-5);
    }

    .gate-form[data-side] .gate-part {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      min-inline-size: 0;
    }

    .gate-form[data-side] .gate-side-h {
      position: static;
      inline-size: auto;
      block-size: auto;
      overflow: visible;
      clip-path: none;
    }

    .gate-side .gate-why {
      max-inline-size: none;
      margin: 0;
    }
  }

  /* NO SIDE, SO ONE CENTRED COLUMN: the tile still runs the board's width, and what is read inside it (who asked, the
     answers, what accepting does, a receipt, the comments) keeps a form's measure in its middle, with no blank column
     beside it. On a narrow page the measure is wider than the tile and nothing moves. */
  .page[data-plain] :global(.tile.gate) {
    padding-inline: max(20px, calc((100% - 46rem) / 2));
  }

  /* ── the side's own parts ──────────────────────────────────────────────── */

  .gate-links {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  /* THE SHARE AS SQUARES, and under it the sentence it was read from, which is what the squares mean. */
  .gate-ev {
    max-inline-size: 20rem;
  }

  .gate-ev-said {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .gate-link {
    display: inline-flex;
    align-items: center;
    color: var(--link);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .gate-links-more {
    color: var(--dim);
    font-size: var(--fs-meta);
  }

  /* UNDER A THUMB EACH LINK IS A 44px LINE of its own, so two that sit one over the other never share a press. */
  @media (pointer: coarse) {
    .gate-link {
      min-block-size: var(--tap);
    }
  }

  /* ── who asked, and why ────────────────────────────────────────────────── */

  .gate-by {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-meta);
  }

  /* WITH NO SIDE, WHO ASKED IS THE LINE OVER THE ANSWERS, close over them as a card's by-line is over its question. */
  .gate-main > .gate-by {
    margin-block-end: calc(var(--sp-1) * -1);
  }

  .gate-who {
    color: var(--ink2);
    font-weight: var(--fw-medium);
  }

  .gate-when {
    font-variant-numeric: tabular-nums;
  }

  /* WHY IT IS ASKED, in the asker's words, read and not skimmed: the body's size, its lines kept, at a measure. */
  .gate-why {
    max-inline-size: var(--measure);
    margin: calc(var(--sp-2) * -1) 0 0;
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-line;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* THE STANDING SENTENCE OVER THE OPTIONS, at the weight of a hint rather than an alarm, and the same rule `/decide`
     draws it by: nothing has gone wrong, and this reader is doing exactly what they were invited to do. */
  .cannot {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE OPTION'S VISUAL, AT THE CHOICE'S SIZE: swatches share its width in one band, a figure is its largest type.
     `--swatch` is set on a chip and read by this one rule, so the colour stays inside its option's box. */
  .card-visual {
    display: flex;
    gap: 2px;
    max-inline-size: 20rem;
    min-inline-size: 0;
    margin-block-end: var(--sp-1);
    overflow: hidden;
    border-radius: var(--r-sm);
  }

  .card-swatch {
    flex: 1;
    block-size: 2rem;
    background: var(--swatch);
    border: 1px solid var(--line);
    forced-color-adjust: none;
  }

  /* A PICTURE AT THE BAND'S HEIGHT AND NO TALLER THAN A SMALL TILE, cut to its box and never stretched, on the field's
     colour while it loads. */
  .card-file {
    display: block;
    max-inline-size: 100%;
    block-size: 6rem;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--field);
  }

  .card-figure {
    padding: var(--sp-2) var(--sp-3);
    background: var(--field);
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  /* ── what accepting does, a plain part of the tile ─────────────────────── */

  /* A HAIRLINE OVER IT, the one mark between the answers and what they would do. */
  .does {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .gate-h {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: var(--lh-head);
  }

  /* EACH PART UNDER ITS OWN SMALL HEADING. */
  .does-parts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .does-h {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .cost {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    max-inline-size: var(--measure);
  }

  .cost-body {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .cost-age {
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-body);
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
    font-weight: var(--fw-medium);
  }

  .pick-detail,
  .pick-hint {
    color: var(--ink2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .pick-hint {
    margin: 0 0 var(--sp-2);
  }

  .source-fold {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--fs-body);
  }

  .source-fold > summary {
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .source-fold > summary {
      min-block-size: var(--tap);
    }
  }

  /* The canvas's written body (`automations/[id]`), so a script reads the same wherever it is shown. */
  .source {
    margin: var(--sp-2) 0 0;
    padding: var(--sp-3);
    overflow: auto;
    max-block-size: 60vh;
    background: var(--field);
    border-radius: var(--r-ctl);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--fs-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* THE HEADING IS THE PART'S, so the list's own `dt` is said to a screen reader and not drawn twice. */
  .calls-out {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--fs-meta);
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

  /* ── not now, and the reason the record asks for ───────────────────────── */

  .commit {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--measure);
  }

  .commit-label {
    display: block;
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .commit-wake {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  /* A FIELD IS THE FIELD FILL AT THE CONTROL RADIUS, no border: the fill is its edge. */
  .commit-date {
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: var(--field);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
  }

  /* A HEADING IS AS TALL AS ITS DESCENDERS, AND HAS ROOM UNDER IT, or the tails of "Why" and "yet" are painted over by
     the field under them. */
  .commit-title {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 1.4;
  }

  .commit-field {
    inline-size: 100%;
    min-block-size: 40px;
    padding: 10px var(--sp-3);
    background: var(--field);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    resize: vertical;
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .commit-fix {
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-body);
  }

  .commit-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
  }

  /* ── one line: the reason the record asks for, and a note after a decline or an edit ── */

  .line-form {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .line-label {
    color: var(--ink2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .line-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* A FIELD IS THE FIELD FILL AT THE CONTROL RADIUS. Kept clear of the sticky bar when focused. */
  .line-field {
    flex: 1 1 18ch;
    min-inline-size: 0;
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: var(--field);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  .note-offer {
    margin: var(--sp-3) 0 0;
    margin-inline-start: calc(-1 * var(--sp-3));
  }

  .note-kept {
    margin: var(--sp-3) 0 0;
    color: var(--ink2);
    font-size: var(--fs-meta);
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
    font-size: var(--fs-meta);
  }

  .settled-choice {
    margin: var(--sp-3) 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: var(--lh-head);
  }

  .settled-reason {
    margin: 0;
    color: var(--ink2);
  }

  .settled-note {
    margin: var(--sp-3) 0 0;
    color: var(--dim);
    font-size: var(--fs-meta);
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
    font-size: var(--fs-meta);
  }

  /* THE WAY ON WRAPS, because on a phone the next question, the queue and the inbox do not fit one line. */
  .onward {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE COMMENTS, UNDER A HAIRLINE IN THE SAME TILE, so what was said is read with the question it is about. */
  .thread {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  /* THE THREAD'S OWN AIR IS THE TILE'S NOW, and its heading reads as the tile's other heading does. */
  .thread > :global(.thread) {
    margin-block: 0;
  }

  .thread :global(.thread-title) {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }
  }
</style>
