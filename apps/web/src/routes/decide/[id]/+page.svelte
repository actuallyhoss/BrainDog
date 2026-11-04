<!--
  The gate. One question, its answers, and what accepting it does, examined whole.

  ONE PRESS ANSWERS. Each answer is a button that says what it does, and pressing it is the decision:
  no reason box opens first and no second press commits it. The walk of 2 October found the queue making a round trip
  and then asking "Why?" before an answer landed, and two of the owner's decisions
  carried the reasons "f" and "y", which agents later read back as the why. So the reason is offered, never demanded:
  after a decline or an edit the receipt offers a one-line note, kept with the question. Where the record itself still
  keeps a reason for a question (`govern.ts`), it says so on the press and one line opens under the answers, with the
  choice kept.

  THE SUGGESTION IS AN OUTLINE WITH A SMALL DOT, and it is drawn only where the choice can be taken back and
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
  /** A day from the picker as the app says one: `2026-11-12` is "12 Nov 2026". */
  const WAKE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const wakeSaid = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
    return m ? `${Number(m[3])} ${WAKE_MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}` : iso;
  };
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { day, since, symbolText } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { stillTyping } from '$lib/a11y/typed.ts';
  import { iconFor, whoDid } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { installWords } from '$lib/record/actions.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  import Cited from '$lib/ui/Cited.svelte';
  import { figuresIn, reasonIn } from '$lib/cite.ts';
  import Changes from './Changes.svelte';
  import Proposed from './Proposed.svelte';
  import Arranged from './Arranged.svelte';
  import MadeFor from './MadeFor.svelte';
  import { agentName, gitOfBody } from '$lib/market/made-here.ts';
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
  import { createsOf, updatesOf, words as changeWords } from './changes.ts';
  import { joinedCount, pickableOf, rowsToSend, words as pickWords } from './picked.ts';
  import { answerFor, type Answer } from '$lib/record/answer.ts';
  import { COMMENT_MOST, sayComment } from '$lib/record/comments.ts';
  import { everyGovernance, plainOf, readOne, type One } from '$lib/record/governance.ts';
  import { answerQuestion, parkQuestion, type Written } from '$lib/record/decide-write.ts';
  import { dropOut, heldOut } from '$lib/record/answers-out.ts';
  import { waitsSaid } from '$lib/home/waits.svelte.ts';
  import { publishAsked, publishAskOf } from '$lib/market/publish-asked.ts';
  import { kennelFetch } from '$lib/market/publish.ts';
  import { proposer, queueMergeOf, queueWords, type FileAt } from '$lib/page/queue-answer.ts';
  import '$lib/decide/form.css';
  import { cardWords, putsOff, queueOf, spoken } from '$lib/decide/card.ts';
  import { askOf } from '$lib/decide/ask.ts';
  import OptionVisual from '$lib/decide/OptionVisual.svelte';
  import { visualOf as drawingOf } from '$lib/decide/option-visual.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { mayAnswer, whyNotAnswering } from '../answering.ts';
  import { acceptKey, declineKey, fromInput, hold, HOLD_MS, keyAct, labelOf, movesOf, notedAfter, twoWords, type Held } from '../press.ts';
  import { mergeListOf, mergeOf, pressOfKey, words as mergeWords, type Press } from '../merge.ts';
  import MergeCard from '../MergeCard.svelte';
  import { nextOpen, stillWaiting, words as onwardWords } from './onward.ts';
  import { aboutLine, aboutOf, sideOf, words as sideWords } from './side.ts';
  import { doesBefore, doesOf } from './does.ts';
  import { amountAnswer, moneyRowOf } from '$lib/decide/money-row.ts';
  import { rowHref } from '$lib/record/row-href.ts';
  import { listName, nameWords, runByIn, type RunBy } from '$lib/record/names.ts';
  import { readFiles, visualsOf } from './option-visual.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { hostedHere } from '../../settings/billing.ts';
  import { goto, invalidateAll } from '$app/navigation';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { pressedOnly } from '@braindog/kernel';
  import { setContext, tick, untrack } from 'svelte';
  import { page } from '$app/state';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { WORDS as whoWords } from './decider.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Thread from '$lib/ui/Thread.svelte';
  import VisualStrip from '$lib/visual/VisualStrip.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import { words as gate } from '../words.ts';
  import Face from '$lib/ui/Face.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { recordToday } from '../../../lib/record/zone.ts';

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
    void readAbout(id);
    void readRun(id, live?.about?.by);
  }

  /**
   * THE ROW THE QUESTION IS ABOUT, by its title, read from the record once the question has answered (`side.ts`
   * `aboutOf`). A row the record will not show this reader, or one already gone, draws no part: the side never names a
   * thing by its handle.
   */
  let aboutRow = $state.raw<{ title: string; href: string | null; line: string } | null>(null);
  /* WHICH QUESTION'S ROW HAS BEEN READ, so the side holds the About part's room while it is out: it landed a beat after
     the question and pushed the comments under it down 110px on a phone (3 Nov). */
  let aboutDone = $state<string | null>(null);
  async function readAbout(id: string) {
    const named = aboutOf(live?.about?.body);
    if (!client || !named) {
      aboutRow = null;
      aboutDone = id;
      return;
    }
    const got = await client.get(named.list, named.seq).catch(() => ({ ok: false as const }));
    if (String(page.params.id) !== id) return;
    aboutDone = id;
    const fields = got.ok && got.value !== null && typeof got.value === 'object' ? ((got.value as { fields?: Record<string, unknown> }).fields ?? {}) : null;
    const held = fields ? fields[REGISTERS[named.list]?.title ?? 'title'] : undefined;
    const money = live?.question ? moneyRowOf(spoken(live.question.title)) : null;
    const title = typeof held === 'string' && held.trim() !== '' ? held.trim() : (money?.title ?? '');
    const href = rowHref(named.spoken) ?? `/r/${named.list}/${named.seq}`;
    /* THE LIST ALONE UNDER ITS NAME: the amount and how late are the question's title, one line over it (3 Nov). */
    aboutRow = fields && title !== '' ? { title, href, line: aboutLine(lists.get(named.list) ?? listName(named.list), null) } : null;
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

  /* WHEN THIS QUESTION OPENED, in the keys' own clock (`KeyboardEvent.timeStamp`): a key that lands within the second
     after is the hands still typing where they came from (the palette's box, a reason on the last question), and never
     an answer, a decline or a put-off here (3 Nov: typed on its way in, a key landed on the question it opened). */
  let openedAt = Number.NEGATIVE_INFINITY;
  $effect(() => {
    const id = String(page.params.id);
    openedAt = typeof performance === 'undefined' ? Number.NEGATIVE_INFINITY : performance.now();
    untrack(() => void readLive(id));
  });

  /** A phone's "mentioned you" opens `#thread` (`./thread/+page.ts`): the thread is drawn after the question is read, so it is brought into view once it is there. */
  const toThread = (el: HTMLElement): void => {
    if (typeof location !== 'undefined' && location.hash === '#thread') requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  };

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
  /* ON THE RECORD'S CLOCK, so "asked 9h ago" is the record's morning and never the browser's date. */
  const now = $derived(from === 'live' ? recordNow() : 0);

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
  /** Whether the owner opened who decides this, from the "⋯" at the right of the title (`Decider.svelte`). */
  let whoOpen = $state(false);
  const answerable = $derived(mayAnswer(me.level, me.owner));
  const whyNot = $derived(whyNotAnswering(me.level, me.lists));

  const question = $derived(from === 'live' ? (live?.question ?? undefined) : undefined);
  /* THE QUESTION ALONE IS THE TITLE, and what its asker wrote after it ("Unsigned: ...") the quiet line under it
     (`ask.ts`), as its card on Needs you says it. */
  const headed = $derived(question ? askOf(spoken(question.title)) : { ask: '', detail: '' });

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

  /* A CHANGE OF MANY ROWS SHOWS A FEW OF THEM: "File them" over 200 entries named none, so the press was taken on
     trust. The first five rows an answer's changes name, by their own titles, read once the page is drawn, and how many
     more there are. A row the reader may not see, or that is gone, is left out of the sample, not guessed at. */
  const SAMPLE_MOST = 5;
  let samples = $state.raw<ReadonlyMap<string, { names: string[]; more: number }>>(new Map());
  $effect(() => {
    const opts = offered;
    if (!Array.isArray(opts)) return;
    let here = true;
    void (async () => {
      const client = createClient({ base: apiBase() });
      const out = new Map<string, { names: string[]; more: number }>();
      for (const o of opts as unknown[]) {
        if (o === null || typeof o !== 'object') continue;
        const { id, patches } = o as { id?: unknown; patches?: unknown };
        if (typeof id !== 'string' || !Array.isArray(patches) || patches.length < 2) continue;
        const ats = patches.map((p) => (p !== null && typeof p === 'object' ? (p as { at?: unknown }).at : null)).filter((a): a is string => typeof a === 'string' && /^[a-z][a-z0-9_-]*#[1-9]\d*$/u.test(a));
        const names = await Promise.all(
          ats.slice(0, SAMPLE_MOST).map(async (spoken) => {
            const [list = '', seq = '0'] = spoken.split('#');
            const got = await client.get(list, Number(seq)).catch(() => null);
            const fields = got?.ok ? ((got.value as { fields?: Record<string, unknown> }).fields ?? {}) : null;
            const field = REGISTERS[list]?.title;
            const name = fields && field ? fields[field] : null;
            return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
          }),
        );
        const kept = names.filter((n): n is string => n !== null);
        if (kept.length > 0) out.set(id, { names: kept, more: patches.length - kept.length });
      }
      if (here) samples = out;
    })();
    return () => {
      here = false;
    };
  });
  let optionFile = $state.raw<FileAt | undefined>(undefined);
  const visuals = $derived(visualsOf(offered, optionFile));

  /* WHAT EACH OPTION WOULD CHANGE, DRAWN (plan of 20 October): a date it sets, a change from what to
     what, a merge, money against what it is set against, from the option as it was filed (`option-visual.ts`). An option
     with nothing it can draw truthfully draws nothing, and one that already shows a colour, a figure or a picture keeps
     that. */
  const asQueued = $derived(question ? queueOf(question) : null);
  /* THE ANSWERS THAT LEAVE THE RECORD AS IT IS (`option-visual.ts`), said as such beside the ones that change it. */
  const LEAVES_AS_IS: ReadonlySet<string> = new Set(['reject', 'apart', 'later', 'no', 'keep']);
  const drawingFor = (key: string) => {
    if (!asQueued || visuals.has(key)) return null;
    const raw = Array.isArray(offered) ? (offered as unknown[]).find((o) => (o as { id?: unknown } | null)?.id === key) : undefined;
    return drawingOf(asQueued, { ...(raw !== null && typeof raw === 'object' ? (raw as object) : {}), key }, { now, home: homeCurrency() });
  };
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

  /* THE PARTS OF AN ARRANGEMENT, A TICK EACH: the ones unticked by hand are kept here, and what Accept
     sends is worked out from them and the keys the record holds (`ticksOf`), so a part whose key is missing is off
     without anybody unticking it and comes back on once the key is held. */
  let partsOff = $state<string[]>([]);
  const taking = $derived(story?.takes ? ticksOf(story.takes, new Set(partsOff)) : null);
  /* A LIVE DOOR THAT GOES WITH NOBODY TO TAKE IT asks twice: the first press says what stops, the second sends. */
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
  /** The places an accept put in the sidebar, by their address, so the receipt links to them. */
  let addedNav = $state<{ title: string; href: string }[]>([]);
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
  const updates = $derived(question && live && !merge ? updatesOf(live.rowset, live.registers, live.rows, plainOf(live.registers, live.names), homeCurrency()) : []);

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
  /*
   * A QUESTION ABOUT MONEY THAT FELL DUE IS ANSWERED AS ITS CARD ANSWERS IT (audit of 30 October, 24): Needs you's card
   * offers a red "Chase £4,800" beside "Not yet", and this page offered a grey "Choose" under a card titled "Chase it".
   * The same buttons, the same words and the same weight here, from the same reading of the question (`money-row.ts`).
   */
  const moneyRow = $derived(question && !merge ? moneyRowOf(spoken(question.title), question.options.map((o) => o.title)) : null);
  /* A RULE BY ITS NAME ALONE, as its card's by-line says it (3 Nov): "Your rule Ask whether to keep a service before it
     renews" read as one broken sentence. The face's glyph says it is a rule, and a screen reader hears "Asked by your rule". */
  const askerSaid = $derived.by(() => {
    if (!asker) return '';
    if (asker.kind === 'automation') return nameWords.automation;
    if (asker.kind !== 'rule') return asker.name;
    const rule = asker.name.replace(/^A rule: /u, '');
    return `${rule.charAt(0).toUpperCase()}${rule.slice(1)}`;
  });
  /* THE MONEY ACCEPTING WOULD WRITE, in each currency it is in, for the rows that are ticked: the button names it. */
  const moves = $derived(question && live ? movesOf(live.rowset, live.registers, picked) : []);
  /* AND THE SUGGESTION, the first one an agent marked, on every question: where it is hard to undo or money moves, the
     dot stays and only Enter is taken away (`press.ts` `acceptKey`). */
  const suggestedKey = $derived(question?.options.find((o) => o.recommended === true)?.key);

  /**
   * THE ANSWER CHOSEN, ON A QUESTION OF OPTIONS ("Decide reads like a form"): a press on a choice chooses
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
  /* AN ANSWER THAT CANNOT BE TAKEN BACK, by the question's band or the option's own mark: its press asks first (today F9). */
  const hardly = (key: string): boolean => question?.band === 'undo' || hardOption(key);
  const pressSaid = (label: string, key: string | null = null): string => (question?.band === 'undo' || hardOption(key) ? queueWords.hard(label) : label);

  /**
   * THE RUN THAT ASKED, read once for its app and kind, so the line says "Claude Code" and never "An agent".
   * A run handle only; a refused or missing read leaves the plain word.
   */
  let runBy = $state.raw<RunBy | null>(null);
  async function readRun(id: string, by: string | undefined) {
    runBy = null;
    const seq = /^S(\d+)$/u.exec(by ?? '')?.[1];
    if (!client || seq === undefined) return;
    const got = await client.get('session', Number(seq)).catch(() => ({ ok: false as const }));
    if (String(page.params.id) !== id || !got.ok || got.value === null || typeof got.value !== 'object') return;
    const f = (got.value as { fields?: Record<string, unknown> }).fields ?? {};
    runBy = runByIn({ run: by, agent: f.agent, client: f.client, parent: f.parent });
  }

  /* WHO ASKED AND WHEN, the quiet line over the answers, by the name every screen gives them, never a handle. */
  const asker = $derived(about?.by ? proposer(about.by, String(page.data.me?.person ?? '') || null, new Map(Object.entries((page.data.names ?? {}) as Record<string, string>)), runBy) : null);

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

  /**
   * THE OPTION CARD'S OWN BUTTON (today F9): one press is the answer. One that cannot be taken back opens a confirm in its
   * card first, said in words, with the answer and Go back; the focus goes to the answer, and nothing is sent until then.
   */
  let confirming = $state<string | null>(null);
  async function press(key: string) {
    if (confirming !== key && hardly(key)) {
      confirming = key;
      await tick();
      document.getElementById(`confirm-${key}`)?.focus();
      return;
    }
    confirming = null;
    chosenKey = key;
    choose(key);
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
    /* WRITTEN DOWN FIRST (`answers-out.ts`): a reload from here on neither draws it on a list nor loses the answer. */
    heldOut(apiBase(), id, { decide: { option: key, ...(rows ? { rows } : {}) } }, question.title, waitsSaid());
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
    dropOut(apiBase(), was.id);
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
    wake = recordToday(now + 14 * 86_400_000);
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
    /* NOT AS THE PAGE OPENS: the hands may still be typing where they came from. */
    if (e.isComposing || stillTyping(openedAt, e.timeStamp)) return;

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
    /* A MERGE'S OWN PRESS (`merge`, `apart`, `pick:..`) IS AN ANSWER THE RECORD TAKES THOUGH THE QUESTION LISTS ONLY ACCEPT
       AND DECLINE; dropping it here said "Merged" and wrote nothing. A press that goes nowhere says so. */
    const own = merge && question && pressOfKey(merge, key) ? { question: question.id, option: key, title: key === merge.all.option ? mergeWords.mergeAll : key === merge.apart.option ? mergeWords.apart : mergeWords.pick, reason: '', at: new Date(now).toISOString(), by: 'you' } : null;
    const a = answerFor(question, key, new Date(now).toISOString()) ?? own;
    if (!a || from !== 'live' || !client || sending !== null) {
      if (sending === null) toasts.push(copy.recordNotReached, { intent: 'warn' });
      return;
    }
    sending = key;
    const accepting = a.option === 'accept' && about !== undefined && isArranging(about.kind) ? about : null;
    /* AN ASK TO PUBLISH SENDS THE FILE FIRST, signed in this browser, and is answered yes only once the store took it
       (`publish-asked.ts`). A refused send leaves the question open with the store's own sentence. */
    const publishing = accepting ? publishAskOf(accepting.kind, accepting.body) : null;
    let published: string | null = null;
    if (publishing !== null) {
      const sent = await publishAsked(client, publishing, kennelFetch);
      if (!sent.ok) {
        sending = null;
        toasts.push(sent.fix, { intent: 'warn' });
        return;
      }
      published = sent.said;
    }
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
    const shown = question && !own ? labelOf({ key: a.option, title: a.title }, question, []) : a.title;
    committed = { ...a, title: shown, reason: said?.trim() ?? '' };
    noteOffered = notedAfter(a.option, rows !== undefined);
    toasts.push(copy.decisionRecorded(shown), { intent: 'good' });
    if (published !== null) toasts.push(published, { intent: 'good' });
    /* AND WHAT THE PICK LEFT, said as the record says it: how many entries changed since and were not written. */
    if (out.from === 'written' && out.said) toasts.push(out.said, { intent: 'warn' });
    if (accepting && out.from === 'written' && had) {
      applied = appliedLines(out.applied ?? {}, accepting.body);
      await invalidateAll();
      const added = [...sidebarNow()].filter(([href]) => !had.has(href));
      addedNav = added.map(([href, title]) => ({ href, title }));
      if (added.length) applied = appliedLines(out.applied ?? {}, accepting.body, added.map(([, title]) => title));
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


  /* WHAT THE ANSWER SET GOING, said on the receipt with a link to what it is about (`does.ts`), and what it would set
     going, said under the answers before the press. */
  const settledOption = $derived.by(() => {
    const key = committed?.option ?? question?.decided?.option;
    return key === undefined ? undefined : question?.options.find((o) => o.key === key)?.title;
  });
  const did = $derived(settled ? doesOf(about?.by, settledOption) : null);
  /* THE RECEIPT'S ONE LINE: "You accepted this just now", by the name every screen gives them. */
  const resultSaid = $derived.by(() => {
    if (!settled) return '';
    const who = whoDid(settled.by, String(page.data.me?.person ?? '') || null, new Map(Object.entries((page.data.names ?? {}) as Record<string, string>))).name;
    const key = committed?.option ?? question?.decided?.option ?? '';
    return onwardWords.result(who, key, settled.title, since(settled.at, now));
  });
  /* WHAT CHANGED, a short list: what the record says it applied, and the places it put in the sidebar as links to them.
     A press here knows which places are new (`addedNav`); a reload reads them from the pages the add-on names. */
  const SIDEBAR_LINE = copy.arrangeDidSidebar([]);
  const changedLines = $derived((applied.length ? applied : kept).filter((l) => !l.startsWith(SIDEBAR_LINE) && l !== copy.arrangeDidNothing));
  const placesAdded = $derived.by((): { title: string; href: string }[] => {
    if (addedNav.length) return addedNav;
    if (changedLines.length === 0) return [];
    const names = about?.body?.names;
    if (names === null || typeof names !== 'object') return [];
    const nav = (page.data.nav ?? []) as { href: string; title: string }[];
    return Object.entries(names as Record<string, unknown>)
      .filter(([k, v]) => k.startsWith('page.') && typeof v === 'string')
      .map(([k, v]) => ({ title: String(v), href: nav.find((n) => n.title === v)?.href ?? `/p/${k.slice(5)}` }));
  });
  /* NOR THE OPTION'S OWN REASON THE RECORD WROTE FOR A PRESS ("Answered in one press, for the option's own reason: Mark
     an invoice as chased"), which is no words of the person's either; what the answer did is said above it (`does.ts`). */
  const ownReason = (reason: string): boolean => /^Answered in one press, for the option's own reason: /u.test(reason.trim());
  const willDo = $derived(question && !settled ? doesBefore(about?.by, question.options) : null);

  /* ── what accepting does, one folded tile under the options ───────────── */

  /** Still open here: neither settled on this screen nor closed on the record. */
  const costed = $derived(question !== undefined && !settled && !(from === 'live' && live?.closed));
  /** The rows to tick, while there is still a decision for them to be part of. */
  const picking = $derived(pickable.length > 0 && costed);
  /* A NEW ROW, OR ROWS THE TICKS DO NOT DRAW, field by field: what accepting adds is read before the press (`createsOf`). */
  const creates = $derived(question && live && !merge && pickable.length === 0 && costed ? createsOf(live.rowset, live.registers, plainOf(live.registers, live.names)) : []);
  /* WHAT IT CHANGES LEADS when it is entries changed and the answers are the record's two (`doesPart`). */
  const changesFirst = $derived(two && !story && !preview && (updates.length > 0 || creates.length > 0 || picking));
  /** What accepting would call out, while it can still be approved. */
  const calling = $derived(from === 'live' && live !== null && live.calls.length > 0 && costed);
  /* WHAT ACCEPTING DOES HAS SOMETHING TO SAY: an arrangement, what a proposal puts in place, the rows to tick, the rows
     it changes, what it calls out, or what deciding late costs. A question of options alone has none of these. */
  const doesAny = $derived(
    Boolean((story && !settled) || (preview && !settled) || picking || creates.length || updates.length || calling || (costed && question?.cost)),
  );
  /* A PART'S OWN HEADING ONLY BESIDE ANOTHER PART (3 Nov): alone under "What it changes", "Before and after" said the
     heading over it twice. What it calls out and what deciding late costs keep theirs, which say something else. */
  const doesParts = $derived(
    [Boolean(story && !settled), Boolean(preview && !settled), picking, creates.length > 0, updates.length > 0, Boolean(calling && live), Boolean(costed && question?.cost)].filter(Boolean).length,
  );
  const partHeads = $derived(doesParts > 1);

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
  /** The side's parts in the second tile: the evidence and what is linked. */
  const sideMore = $derived(side !== null && (side.evidence !== null || side.links.length > 0));
  /* STILL ASKED: not answered here or elsewhere. Only then are why and what it changes said beside it. */
  const asking = $derived(!settled && !(from === 'live' && live?.closed));
  /* THE SECOND TILE (today F9): why it is asked, what it changes, the evidence and what is linked, then the comments. */
  const aside = $derived(from === 'live' || (asking && (Boolean(question?.context) || doesAny || sideMore)));

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

<svelte:head><title>{titleOf(question ? headed.ask : undefined, copy.decide)}</title></svelte:head>

<svelte:window {onkeydown} />

<!-- THE WAY ON, ONE SNIPPET FOR EVERY STATE THAT IS NOT AN OPEN QUESTION: settled, closed, refused and
     not found. The settled block drew `Next question` only for a press made in this session and only
     when the question was not last in the queue, so a decision reached from the Decided list, or the
     last one answered, ended the page with nothing to press. The queue is offered whatever else is,
     and the inbox when something waits there, which is what `/decide` offers when it is clear. -->
<!-- NOT NOW, THE THIRD VERB, kept beside the answers: a queue with only yes and no is a queue that gets rubber-stamped.
     It opens the step that asks why not yet and until when. -->
{#snippet later()}
  <!-- NEVER BESIDE AN ANSWER OF THE ASKER'S OWN THAT ONLY PUTS IT OFF: one Later, not "Later" and "Later". -->
  {#if !deferring && !(question?.options ?? []).some((o) => putsOff(o.title))}
    <!-- A CLOCK AND ITS WORDS, as on every card (VERIFY H8): "Ask me later", 44 under a thumb. The clock alone floated
         under the answers and said nothing to anybody who had not pressed it. -->
    <button type="button" class="dc-btn dc-later" data-weight="bare" disabled={!answerable} aria-describedby={answerable ? undefined : 'cannot-decide'} aria-label={queueWords.notNow} title={queueWords.notNow} onclick={defer}
      ><Icon name="clock" size="s" /><span class="dc-later-words">{queueWords.notNow}</span></button
    >
  {/if}
{/snippet}

<!-- THE WAY ON UNDER A RECEIPT: Next question, the one red, with how many more wait as its context, and the list as a
     quiet link. With nothing more waiting, the list is the way on. -->
{#snippet wayOn()}
  <div class="way-on">
    {#if onwardTo}
      <Button weight="primary" href="/decide/{onwardTo}" id="way-on">{copy.decideNext}</Button>
      <span class="way-left">{onwardWords.more(waiting)}</span>
      <a class="way-back" href={at('/decide')}>{onwardWords.back}</a>
    {:else}
      <Button weight="primary" href="/decide" id="way-on">{onwardWords.back}</Button>
      <span class="way-left">{onwardWords.left(0)}</span>
      {#if Number(page.data.inbox ?? 0) > 0}<a class="way-back" href={at('/inbox')}>{copy.decideOpenInbox}</a>{/if}
    {/if}
  </div>
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
       the trivia the reset took out. -->
  <div class="q-head" data-narrow={asking ? undefined : ''}>
    <!-- NO SENTENCE, SO NONE IS HELD: the head's empty line held while the page read and then went, moving the question up
         56px on a phone. -->
    <PageHead named kicker={copy.decide} back="/decide" title={headed.ask} count={joined} countOf={(n) => (n === 1 ? 'change' : 'changes')} sentence={headed.detail} actions={asking && me.owner ? whoMore : undefined} />
  </div>
      <!-- A CHANGE OF ENTRIES IS READ BEFORE ITS TWO ANSWERS (2 Nov): Accept and Decline stood over "Before and after",
           so the press came before the thing it presses on. An arrangement, longer and with its own ticks and keys, keeps
           its answers on top. -->
      {#snippet doesPart()}{#if question}
      <!-- WHAT IT CHANGES, under the answers in their own tile (beside them it left half the board empty under
           two buttons): what an arrangement does, what a proposal puts in place, the rows to tick,
           the rows it changes, what it calls out, and what deciding late costs. Each under its own small heading, open, read
           before the press and never in the way of it. -->
      {#if asking && doesAny}
              <section class="does" aria-labelledby="does-title" data-first={changesFirst ? '' : undefined}>
                <h2 class="gate-h" id="does-title">{gate.changes}</h2>
                <div class="does-parts">
                  {#if story && !settled}
                    <section class="changed" aria-label={story.lead}>
                      <!-- AN ADD-ON AN AGENT MADE, its file in the question: who made it, unreviewed, and its scripts whole. -->
                      {#if about?.kind === 'pack' && ((typeof about.body?.doc === 'object' && about.body.doc !== null) || gitOfBody(about.body) !== null)}
                        <MadeFor doc={about.body?.doc} by={agentName(askerSaid || nameWords.agent)} git={gitOfBody(about.body)} />
                      {/if}
                      <Arranged arranged={story} />
                    </section>
                  {/if}

                  {#if preview && !settled}
                    <section class="changed">
                      {#if partHeads}<h3 class="does-h">{copy.proposalWillAppear}</h3>{/if}
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
                      {#if partHeads}<h3 class="does-h">{pickWords.heading}</h3>{/if}
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

                  {#if creates.length}
                    <section class="changed">
                      {#if partHeads}<h3 class="does-h">{pickWords.heading}</h3>{/if}
                      <Changes updates={creates} />
                    </section>
                  {/if}

                  {#if updates.length}
                    <section class="changed">
                      {#if partHeads}<h3 class="does-h">{changeWords.heading}</h3>{/if}
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
      {/if}{/snippet}
  {#snippet whoMore()}
    <Button weight="glass" size="sm" data-circle aria-expanded={whoOpen} aria-label={whoWords.more} onclick={() => (whoOpen = !whoOpen)}>⋯</Button>
  {/snippet}

  <div class="page" data-narrow={asking ? undefined : ''}>
    <!-- HOW FAR AN ACCEPTED ARRANGEMENT GOT LEADS, because it is the news and the reason the options came back. -->
    {#if part && !settled}<Applied partial={part} />{/if}
    <!-- TWO TILES ON A WIDE BOARD (today F9): the answers, each option a card with its own button, and beside them why
         it is asked, what it changes and the comments. One column on a phone, the answers first. A settled question is
         its receipt in the first tile, and its comments stay beside it. -->
    <div class="gate-grid" data-aside={aside && asking ? '' : undefined}>
    <Tile class="gate">
      {#if settled}
        <!-- THE RECEIPT (2 Nov, "this looks shit"): one line that says who answered it, which way and when, the reason as
             it was written, what changed as a short list with links to the places it made, and one way on. A decision
             is never edited, and nothing on the page offers to, so the page does not say it; Needs you keeps it under
             Decided, which its list says. A fresh one settles in once (`data-fresh`), a reload is simply there; the toast
             says it to a screen reader, so the receipt is not a second live region. -->
        <div class="settled" data-fresh={committed ? '' : undefined}>
          <p class="settled-head">
            <span class="settled-mark" data-way={(committed?.option ?? question.decided?.option) === 'accept' ? 'good' : undefined}><Icon name={(committed?.option ?? question.decided?.option) === 'reject' ? 'close' : 'check'} size="m" /></span>
            <span>{resultSaid}</span>
          </p>
          <!-- THE REASON WHEN THERE IS ONE. An answer given by its press alone is a whole answer, and a pair of quotation
               marks round nothing read as a reason that failed to load. Nor is the sentence the record wrote for a press
               (`pressedOnly`) quoted on a reloaded receipt, as though the person had written it. -->
          {#if settled.reason.trim() !== '' && !pressedOnly(settled.reason) && !ownReason(settled.reason)}<p class="settled-reason">“{settled.reason}”</p>{/if}
          {#if did && aboutRow}
            <p class="settled-did">{did.lead} {#if aboutRow.href}<a class="gate-link" href={at(aboutRow.href)}>{aboutRow.title}</a>{:else}{aboutRow.title}{/if}. {did.tail}</p>
          {/if}
          {#if changedLines.length || placesAdded.length}
            <section class="settled-changed" aria-labelledby="changed-h">
              <h2 class="settled-h" id="changed-h">{onwardWords.changed}</h2>
              <ul class="settled-list">
                {#each changedLines as line, i (i)}<li>{line}</li>{/each}
                {#if placesAdded.length}
                  <li>{onwardWords.sidebar} {#each placesAdded as place, i (place.href)}{i > 0 ? ', ' : ''}<a class="gate-link" href={at(place.href)}>{place.title}</a>{/each}</li>
                {/if}
              </ul>
            </section>
          {/if}
          <!-- WHAT IT WAS DECIDED ON, the question's visuals, kept beside its receipt. -->
          <VisualStrip on={question.id} />
          {#if preview?.pattern}{#await import('./PatternReads.svelte') then loaded}<loaded.default pattern={preview.pattern} resolved said={live?.about?.body.said} />{/await}{/if}
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
          {@render wayOn()}
        </div>
      {:else if from === 'live' && live?.closed}
        <!-- SETTLED, AND ITS DECISION IS NOT AMONG THE ONES READ. Nothing here can answer it again, and the line says so
             without the question's handle: its title is the heading above. -->
        <div class="settled">
          <p class="settled-head">
            <span class="settled-mark"><Icon name="archive" size="m" /></span>
            <span>{onwardWords.closed}</span>
          </p>
          {@render wayOn()}
        </div>
      {:else}
        <!-- WHY THE ANSWERS ARE OFF COMES FIRST, ABOVE THE OPTIONS AND NOT AFTER A PRESS AND A PARAGRAPH. It is the
             record's own refusal, said before anybody has chosen anything, and it ends by saying that reading is what
             this colleague still holds. Every answer's button and Not now point at it. Over the form and its side both. -->
        {#if !answerable}
          <p class="cannot" id="cannot-decide">{whyNot}</p>
        {/if}

        <!-- WHO ASKED AND WHEN, the quiet line over the answers, as a card's by-line is over its question. -->
        <p class="gate-by">
          <span class="dc-sr">{asker?.kind === 'rule' ? cardWords.askedByRule : cardWords.askedBy}</span>
          {#if asker}<Face name={asker.name} kind={asker.kind} size="s" /><span class="gate-who">{askerSaid}</span>{/if}
          <!-- WHEN, AS ITS CARD SAYS IT: a money row's card says the day ("3 Sep"), every other card how long ago. -->
          <span class="gate-when">{since(question.opened, now)}</span>
        </p>
        <!-- WHAT IT IS ASKED WITH TO LOOK AT, above the answers: a still or a quiet card, opened full width on a press. -->
        <VisualStrip on={question.id} />

            <!-- ONE ANSWER'S BUTTON, for the record's own two answers: it says what it does (`press.ts` `labelOf`), Decline for
                 the record's Reject and the amount on Accept when money moves, and the care a hard one asks for in its words.

                 OFF FOR A READER WHO MAY NOT ANSWER, pointing at the sentence above the answers that says why.
                 `aria-describedby` rather than a title, so the reason is read out with the control and not only seen. -->
            {#snippet answer(option: { key: string; title: string }, q: { options: readonly { key: string; title: string }[] }, label?: string, lead?: boolean)}
              {@const marked = suggestedKey === option.key}
              <button
                type="button"
                class="dc-btn"
                id="opt-{option.key}"
                data-answer={option.key}
                data-suggested={marked ? '' : undefined}
                data-weight={(lead ?? (marked || (suggestedKey === undefined && option.key === 'accept'))) && !hardly(option.key) ? 'primary' : undefined}
                data-on={asked === option.key ? '' : undefined}
                aria-pressed={asked === null ? undefined : asked === option.key}
                disabled={!answerable || holding !== null}
                aria-describedby={answerable ? undefined : 'cannot-decide'}
                onclick={() => choose(option.key)}
              >
                <!-- THE ANSWER'S NAME ALONE ON ITS BUTTON (Q20 of 29 October): "Accept EGP 74,092.16 and $9,074.01 USD, can't
                     be undone easily" wrapped to two lines on a phone. The care is the line under the answers, as the Needs
                     you card says it, and is read with the button. -->
                {label ?? labelOf(option, q, moves)}{#if marked && lead === undefined}<span class="gate-sug">, {gate.suggested.toLowerCase()}</span>{/if}
              </button>
            {/snippet}
            {#snippet hardUnder(q: { options: readonly { key: string; title: string }[] })}
              {@const hard = q.options.filter((o) => (o.key === 'accept' && pressSaid('x') !== 'x') || hardOption(o.key))}
              {#if hard.length > 0}<p class="dc-hard-line" id="hard-line">{queueWords.hardOf(hard.map((o) => labelOf(o, q, moves).split(' ')[0]).join(' and '))}.</p>{/if}
            {/snippet}

            <!-- NAMED BY A HEADING OF ITS OWN, one level under the question, so each option's name under it is the level
                 after it and a heading list reads question, options, each option. Said to a screen reader only: the eye
                 reads the cards as the answers without a word over them. -->
            {#if changesFirst}{@render doesPart()}{/if}
            <section class="options" aria-labelledby="options-h" data-after={changesFirst ? '' : undefined}>
              <h2 class="dc-sr" id="options-h">{merge ? mergeWords.heading : copy.theOptions}</h2>
              {#if merge}
                <!-- WHO IS WHO: each name and where it was seen, and one press each, held for its Undo. -->
                <MergeCard
                  {merge}
                  {answerable}
                  holding={holding?.key ?? null}
                  titleOf={(key) => spoken(question.options.find((o) => o.key === key)?.title ?? '')}
                  onpress={pressMerge}
                />
              {:else if moneyRow}
                <!-- MONEY THAT FELL DUE: its answers as the card's buttons, "Chase £4,800" leading, then Not yet. A renewal leads
                     with its first answer, Keep it, as its card fills it. -->
                <div class="dc-actions">
                  {#each question.options as option (option.key)}{@render answer(option, question, amountAnswer(option.title, moneyRow.amount), /^chase\b/iu.test(option.title.trim()) || (!question.options.some((o) => /^chase\b/iu.test(o.title.trim())) && suggestedKey === option.key) || (moneyRow.kind === 'renews' && suggestedKey === undefined && option.key === question.options[0]?.key))}{/each}
                  {@render later()}
                </div>
                {#if willDo}<p class="dc-will">{willDo}</p>{/if}
                {@render hardUnder(question)}
              {:else if two}
                <!-- THE RECORD'S TWO ANSWERS ARE TWO BUTTONS, Accept and Decline, with Not now beside them. -->
                <div class="dc-actions">
                  {#each question.options as option (option.key)}{@render answer(option, question)}{/each}
                  {@render later()}
                </div>
                {@render hardUnder(question)}
              {:else}
                <!-- THE ANSWERS AS CARDS (today F9), two or three side by side on a wide tile and stacked on a phone: each its name,
                     what it does, its drawing, and its own button at the foot. The suggested one's button is the primary, the
                     rest quiet, and one press decides. One that cannot be taken back asks first, in its own card; where the
                     suggestion is such a one, no button is red. -->
                <ul class="dc-options" data-across={question.options.length <= 2 ? '' : undefined} style:--across={question.options.length}>
                  {#each question.options as option}
                    <!-- THE REASON AS IT WAS FILED, so its rows are links (`Cited`), each named by its list; where the body
                         holds no reason, the words `questionOf` made of it. -->
                    {@const because = reasonIn(about?.body, option.key) ?? option.body}
                    {@const shows = visuals.get(option.key)}
                    {@const marked = suggestedKey === option.key}
                    {@const said = labelOf(option, question, moves)}
                    {@const on = asked === option.key || (holding?.key ?? null) === option.key}
                    {@const drawn = drawingFor(option.key)}
                    <!-- AN OPTION WITH NOTHING BUT ITS NAME IS ITS BUTTON, and no card: "It went through" was a heading over
                         a button saying "It went through". One with a reason or a picture keeps its name as the card's
                         heading, and its button says what a press does, so the same words are never read twice. -->
                    {@const still = drawn === null && !shows && because.trim() === '' && LEAVES_AS_IS.has(option.key) && question.options.some((o) => drawingFor(o.key) !== null)}
                    {@const bare = because.trim() === '' && !shows && drawn === null && !still && confirming !== option.key}
                    <li class="dc-option" data-bare={bare ? '' : undefined} data-suggested={marked ? '' : undefined} data-checked={on ? '' : undefined}>
                      <!-- WHAT THE OPTION IS LEADS IT, inside its own card and nowhere else: a swatch writes its colour into
                           `--swatch` on its chip alone, hidden from a screen reader because the name says it. -->
                      {#if shows && 'swatch' in shows}
                        <span class="card-visual" data-shows="swatch" aria-hidden="true">
                          {#each shows.swatch as colour, s (s)}<span class="card-swatch" style:--swatch={colour}></span>{/each}
                        </span>
                      {:else if shows && 'figure' in shows}
                        <span class="card-visual" data-shows="figure"><span class="card-figure num">{shows.figure}</span></span>
                      {:else if shows && 'file' in shows}
                        <!-- A PICTURE SAYS WHICH OPTION IT IS, in the option's own name, for a reader who cannot see it. -->
                        <span class="card-visual" data-shows="file"><img class="card-file" src={shows.file.src} alt={said} loading="lazy" decoding="async" /></span>
                      {/if}
                      {#if marked}<span class="dc-rec">{gate.suggested}</span>{/if}
                      {#if !bare}<h3 class="dc-option-name" dir="auto">{said}</h3>{/if}
                      <!-- AN OPTION WITH NO REASON SHOWS NONE, rather than an empty line under its name. -->
                      {#if because.trim() !== ''}
                        <span class="dc-choice-does card-body"><Cited text={because} figures={figuresIn(about?.body)} {now} /></span>
                      {/if}
                      <OptionVisual visual={drawn} />
                      <!-- AN ANSWER THAT LEAVES THINGS AS THEY ARE SAYS SO beside answers that draw a change, so the row
                           compares what each does rather than leaving one card blank. -->
                      {#if still}
                        <span class="dc-choice-does card-body">{gate.nothingChanges}</span>
                      {/if}
                      {#if samples.has(option.key)}
                        {@const sample = samples.get(option.key)!}
                        <ul class="dc-sample" aria-label={gate.sample}>
                          {#each sample.names as name, i (i)}<li dir="auto">{name}</li>{/each}
                          {#if sample.more > 0}<li class="dc-sample-more">{gate.sampleMore(sample.more)}</li>{/if}
                        </ul>
                      {/if}
                      <div class="dc-option-foot">
                        {#if confirming === option.key}
                          <!-- THE CONFIRM STAYS IN THE CARD, never a dialog over the page: what cannot be undone, then the
                               answer again and the way back. -->
                          <p class="dc-confirm" role="status">{gate.confirm(said)}</p>
                          <div class="dc-option-acts">
                            <button type="button" class="dc-btn" data-weight="primary" id="confirm-{option.key}" disabled={holding !== null || sending !== null} onclick={() => void press(option.key)}>{said}</button>
                            <button type="button" class="dc-btn" data-weight="bare" onclick={() => (confirming = null)}>{gate.goBack}</button>
                          </div>
                        {:else}
                          <button
                            type="button"
                            class="dc-btn"
                            id="opt-{option.key}"
                            data-answer={option.key}
                            data-suggested={marked ? '' : undefined}
                            data-weight={marked && !hardly(option.key) ? 'primary' : undefined}
                            data-on={on ? '' : undefined}
                            disabled={!answerable || holding !== null}
                            aria-describedby={answerable ? undefined : 'cannot-decide'}
                            onclick={() => void press(option.key)}
                            onkeydown={(e) => onChoiceKey(e, option.key)}
                            >{#if bare}{said}{:else}{gate.choose}<span class="dc-sr"> {said}</span>{/if}{#if marked}<span class="dc-sr">, {gate.suggested}</span>{/if}</button
                          >
                        {/if}
                      </div>
                    </li>
                  {/each}
                </ul>
                <div class="dc-actions">{@render later()}</div>
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
                  <!-- THE DAY SAID AS THE APP SAYS DAYS, "12 Nov 2026", over the browser's own picker, which wrote it 12/11/2026
                       (Q34 of 29 October). The picker stays the control and is what a screen reader reads. -->
                  <span class="commit-date-box">
                    <input class="commit-date" type="date" bind:value={wake} data-said={wake ? '' : undefined} />
                    {#if wake}<span class="commit-date-said" aria-hidden="true">{wakeSaid(wake)}</span>{/if}
                  </span>
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
      {/if}
      {#if !changesFirst}{@render doesPart()}{/if}
    </Tile>
    {#if aside}
    <Tile class="gate-aside">
      <!-- WHAT IT IS ABOUT, FIRST: the row by its title, a link to it, and its list, amount and how late under it. -->
      {#if from === 'live' && aboutDone !== String(page.params.id) && aboutOf(about?.body) !== null}
        <!-- ITS ROOM, HELD WHILE THE ROW IS READ: the heading and two quiet bars the height of its two lines. -->
        <section class="aside-part" aria-hidden="true">
          <h2 class="gate-h">{sideWords.about}</h2>
          <p class="gate-about"><span class="about-held"></span><span class="about-held about-held-meta"></span></p>
        </section>
      {:else if aboutRow && aboutDone === String(page.params.id)}
        <section class="aside-part" aria-labelledby="gate-about-h">
          <h2 class="gate-h" id="gate-about-h">{sideWords.about}</h2>
          <p class="gate-about">
            {#if aboutRow.href}<a class="gate-link" href={at(aboutRow.href)}>{aboutRow.title}</a>{:else}{aboutRow.title}{/if}
            {#if aboutRow.line}<span class="gate-about-line">{aboutRow.line}</span>{/if}
          </p>
        </section>
      {/if}
      <!-- WHO DECIDES THIS ONE, and for the owner the way to name them: its own chunk, read only on an open question. -->
      {#if !settled}{#await import('./Decider.svelte') then m}<m.default {question} owner={me.owner} me={me.person} bind:open={whoOpen} />{/await}{/if}
      <!-- WHY IT IS ASKED, in the asker's own words. -->
      {#if asking && question.context}
        <section class="aside-part" aria-labelledby="gate-why-h">
          <h2 class="gate-h" id="gate-why-h">{gate.whyAsked}</h2>
          <p class="gate-why">{symbolText(spoken(question.context))}</p>
        </section>
      {/if}
      <!-- AND THE REST OF THE SIDE: the share the asker gave on the question's body, and the things the reasons name, each
           a link to it by its own name. -->
      {#if asking && side && sideMore}
            <div class="aside-more">
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
      <!-- THE QUESTION'S COMMENTS, LAST IN THE SECOND TILE, open or settled, since what was said about it is worth as much
           after the decision as before. On the question and not on each option. A Reads colleague may comment here too. -->
      {#if from === 'live'}
        <div class="thread" id="thread" {@attach toThread}>
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
    {/if}
    </div>
  </div>
{/if}

<style>
  /* THE GATE IS ONE TILE ON THE BOARD, running the window's width; what is read inside it keeps a form's measure. */
  /* THE HEAD'S WRAPPER MAKES NO BOX, so the phone's bar still sticks inside the screen as it does on every page. */
  .q-head {
    display: contents;
  }

  /* ONE COLUMN WIDTH FOR THE HEAD AND THE TILES, so their left edges and the ⋯ and the tile's right edge line up: the
     answers and their side together up to 1120, a settled question's receipt and comments 720, and text in either at
     680 at most. Past that the board is the window's, and nothing stretches across it. */
  .q-head {
    --q-max: 1120px;
    --q-text: 680px;
  }

  .q-head[data-narrow],
  .page[data-narrow] {
    --q-max: 720px;
  }

  .page {
    --q-max: 1120px;
    --q-text: 680px;
    max-inline-size: calc(var(--q-max) + var(--gutter) * 2);
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  /* ASK ME LATER: the clock and its words, quiet, after the answers; 44 tall under a thumb. */
  .dc-actions > .dc-later {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding-inline: var(--sp-2);
    color: var(--ink-2);
  }

  @media (pointer: coarse) {
    .dc-actions > .dc-later {
      min-block-size: var(--tap);
    }
  }

  /* THE FIRST TILE IS THE ANSWERS: who asked, the option cards, Not now, and a receipt once it is answered. */
  .page :global(.tile.gate),
  .page :global(.tile.gate-aside) {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* ── two tiles on a wide board (today F9) ──────────────────────────────── */

  /* ONE COLUMN ON A PHONE AND A NARROW WINDOW, the answers first. From 1100px the answers take two thirds of the board
     and why, what it changes and the comments the third beside them, both tiles from the top. */
  .gate-grid {
    display: grid;
    gap: var(--tile-gap);
    align-items: start;
    min-inline-size: 0;
  }

  @media (width >= 1100px) {
    .gate-grid[data-aside] {
      grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
    }
  }

  /* EACH PART OF THE SECOND TILE UNDER A HAIRLINE, the first one bare. */
  .aside-part,
  .aside-more {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .gate-grid :global(.tile.gate-aside > * + :is(.aside-part, .decider, .does, .aside-more, .thread)) {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .aside-more {
    gap: var(--sp-4);
  }

  .aside-more .gate-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .gate-side-h {
    margin: 0;
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: 1.4;
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
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .gate-link {
    display: inline-flex;
    align-items: center;
    color: var(--red);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }

  .gate-links-more {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* UNDER A THUMB EACH LINK IS A 44px LINE of its own, so two that sit one over the other never share a press. */
  @media (pointer: coarse) {
    .gate-link {
      min-block-size: var(--tap);
    }
  }

  /* WHAT IT IS ABOUT: the row's title as its link, and under it the quiet line of its list, amount and how late. */
  .gate-about {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--sp-1);
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .about-held {
    display: block;
    inline-size: 9rem;
    block-size: calc(var(--fs-body) * var(--lh-body));
    border-radius: var(--r-xs);
    background: var(--tile-2);
  }

  .about-held-meta {
    inline-size: 6rem;
    block-size: calc(var(--fs-meta) * var(--lh-body));
  }

  /* THE LINK IS A THUMB TALL THERE, and so is the room held for it. */
  @media (pointer: coarse) {
    .about-held:not(.about-held-meta) {
      block-size: var(--tap);
    }
  }

  .gate-about-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  /* ── who asked, and why ────────────────────────────────────────────────── */

  /* ONE LINE, THE FACE, THE NAME AND WHEN: a long name (a rule's is a sentence) wraps inside its own span, at most two
     lines, and never leaves the face alone on a row over it and the time on a third (390, 3 Nov). */
  .gate-by {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .gate-by > :global(.face) {
    flex: none;
  }

  /* WHO ASKED IS THE LINE OVER THE ANSWERS, close over them as a card's by-line is over its question. */
  .gate-grid :global(.tile.gate > .gate-by) {
    margin-block-end: calc(var(--sp-1) * -1);
  }

  .gate-who {
    display: -webkit-box;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-2);
    font-weight: var(--fw-medium);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .gate-when {
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  /* WHY IT IS ASKED, in the asker's words, read and not skimmed: the body's size, its lines kept, at a measure. */
  .gate-why {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink-2);
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
    color: var(--ink-2);
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
    border-radius: var(--r-xs);
  }

  .card-swatch {
    flex: 1;
    block-size: 2rem;
    background: var(--swatch);
    border: 1px solid var(--rule);
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
    background: var(--tile-2);
  }

  .card-figure {
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  /* ── what accepting does, a plain part of the tile ─────────────────────── */

  /* UNDER THE ANSWERS IN THEIR TILE, a hairline over it. */
  .does {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-5);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  /* LEADING, it takes no rule over it, and the answers under it take one: they are the form's foot. */
  .does[data-first] {
    margin-block-start: 0;
    padding-block-start: 0;
    border-block-start: 0;
  }

  .options[data-after] {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .gate-h {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: var(--lead-ui);
  }

  /* EACH PART UNDER ITS OWN SMALL HEADING. */
  .does-parts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .does-h {
    margin: 0 0 var(--sp-2);
    color: var(--ink-3);
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
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .pick-hint {
    margin: 0 0 var(--sp-2);
  }

  .source-fold {
    margin-block-start: var(--sp-3);
    color: var(--ink-2);
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
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* THE HEADING IS THE PART'S, so the list's own `dt` is said to a screen reader and not drawn twice. */
  .calls-out {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
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

  /* PUTTING IT OFF IS ITS OWN STEP UNDER THE ANSWERS, a hairline over it, so its field is not read as an answer's. */
  .commit {
    display: flex;
    flex-direction: column;
    max-inline-size: var(--measure);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .commit-label {
    display: block;
    margin-block-end: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .commit-wake {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .dc-hard-line {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* WHAT THE ANSWER SETS GOING, one quiet line under the buttons (`does.ts`). */
  .dc-will {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .commit-date-box {
    position: relative;
    display: inline-grid;
  }

  /* THE PICKER'S OWN DIGITS ARE HIDDEN WHILE A DAY IS CHOSEN, and the day is said in words over them. */
  .commit-date[data-said] {
    color: transparent;
  }

  .commit-date-said {
    position: absolute;
    inset-block: 0;
    inset-inline-start: var(--sp-3);
    display: flex;
    align-items: center;
    color: var(--ink);
    font-size: var(--fs-ctl);
    pointer-events: none;
  }

  /* A FIELD IS THE FIELD FILL AT THE CONTROL RADIUS, no border: the fill is its edge. */
  .commit-date {
    min-block-size: var(--btn-h);
    padding: 0 var(--sp-3);
    background: var(--tile-2);
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
    line-height: var(--lead-ui);
  }

  .commit-field {
    inline-size: 100%;
    min-block-size: var(--field-h);
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
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
    color: var(--ink-2);
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
    background: var(--tile-2);
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
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* ── the receipt (2 Nov) ─────────────────────────────────────────────
     ONE LINE, THEN WHAT CHANGED, THEN THE WAY ON, at a reading measure and on one spacing step: 16 between parts. */

  .settled {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    max-inline-size: var(--q-text);
  }

  /* WHO ANSWERED IT, WHICH WAY AND WHEN: the body's size in ink, a small mark before it in the good ink for an accept. */
  .settled-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: var(--lh-body);
  }

  .settled-mark {
    display: inline-flex;
    flex: none;
    align-self: center;
    color: var(--ink-3);
  }

  .settled-mark[data-way='good'] {
    color: var(--good);
  }

  .settled-reason,
  .settled-did {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .settled-changed {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .settled-h {
    margin: 0;
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .settled-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  /* A FRESH DECISION SETTLES IN ONCE: the receipt takes the answers' place with a fade and a 4px rise, over the swap's
     160ms on the arriving curve. A reload draws it still. Reduced motion keeps only the fade, shorter. */
  .settled[data-fresh] {
    transition:
      opacity var(--d-swap) var(--ease-emphasis),
      transform var(--d-swap) var(--ease-emphasis);

    @starting-style {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .settled[data-fresh] {
      transition: opacity var(--d-enter) linear;

      @starting-style {
        opacity: 0;
        transform: none;
      }
    }
  }

  /* THE WAY ON: Next question, how many more as its context, and the list as a quiet link. */
  .way-on {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin-block-start: var(--sp-1);
  }

  .way-left {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  .way-back {
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
  }

  /* AT THE ROW'S END WHERE THE ROW HOLDS IT; on a phone it wraps under Next question, at the left edge. */
  @media (width >= 600px) {
    .way-back {
      margin-inline-start: auto;
    }
  }

  .way-back:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (pointer: coarse) {
    .way-back {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  /* THE WAY ON WRAPS, because on a phone the next question, the queue and the inbox do not fit one line. */
  .onward {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE COMMENTS, LAST IN THE SECOND TILE, under a hairline where something came before them. */
  .thread {
    min-inline-size: 0;
  }

  /* NO COMMENT YET IS NOTHING SAID (today F9): only the field, "Add a comment" inside it and a thumb tall. */
  .thread :global(.thread-quiet:empty) {
    display: none;
  }

  .thread :global(.box-input) {
    min-block-size: var(--tap);
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


  /* ── the options as cards (today F9) ──────────────────────────────────
     TWO SIDE BY SIDE where each has 240px, and three or more one under the other (2 Nov: three left one card alone on
     a second row), stacked on a phone: the name 17/600, what it does in the second ink,
     its drawing, and its own button at the foot, the cards of a row as tall as the tallest. */
  .dc-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dc-options:not([data-across]) {
    grid-template-columns: minmax(0, 1fr);
  }

  /* NOT NOW UNDER THE CARDS, its word level with their edge rather than its button's. */
  .dc-options + .dc-actions {
    margin-inline-start: calc(var(--sp-2) * -1);
  }

  /* AN ANSWER IS A BOX ON THE CARD, not a card in a card (ops 2.7.2): the field radius, a hairline, the card's own fill,
     and the row wash under a pointer. Chosen is the accent's tint with its edge, a different hue from the hover. */
  .dc-option {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    border: 1px solid var(--rule);
    border-radius: var(--r-field, 12px);
    background: var(--tile);
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .dc-option:not([data-bare], [data-checked]):hover {
      background: var(--tile) linear-gradient(var(--row-wash), var(--row-wash));
      border-color: var(--rule-strong);
    }
  }

  .dc-option[data-checked] {
    background: var(--chosen);
    border-color: var(--on);
  }

  /* THE SUGGESTED ONE WEARS THE ACCENT'S EDGE, as well as its word, so the row is read from it. */
  .dc-option[data-suggested]:not([data-bare], [data-checked]) {
    border-color: var(--on);
  }

  /* AN OPTION THAT IS ONLY ITS NAME IS ONLY ITS BUTTON: no card round it, the button the cell's width and a thumb's
     height, so a row of them reads as the answers side by side. */
  .dc-option[data-bare] {
    gap: var(--sp-1);
    padding: 0;
    background: none;
    border: 0;
  }

  .dc-option[data-bare] > .dc-option-foot {
    align-items: stretch;
    padding-block-start: 0;
  }

  .dc-option[data-bare] > .dc-option-foot > .dc-btn {
    min-block-size: var(--btn-h);
    font-size: var(--fs-body);
  }

  /* A FEW OF THE ROWS AN ANSWER CHANGES, a quiet list in the card, each one line. */
  .dc-sample {
    display: grid;
    gap: var(--row-stack);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .dc-sample > li {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dc-sample > .dc-sample-more {
    color: var(--ink-3);
  }

  /* THE SUGGESTED ANSWER SAYS SO ON ITS OWN BUTTON, "Accept, suggested", and is the one red primary. */
  .gate-sug {
    font-weight: 400;
    opacity: 0.85;
  }

  .dc-option > .dc-rec {
    margin: 0;
  }

  /* THE ANSWER'S NAME IS A CARD HEADER (ops 4.17): 15/600, a hair tight. */
  .dc-option-name {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-row, 15px);
    font-weight: var(--fw-semi);
    line-height: var(--lead-row);
    letter-spacing: -0.005em;
    overflow-wrap: anywhere;
  }

  .dc-option > .dc-choice-does {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE BUTTON AT THE FOOT, pushed down so a row of cards has its buttons on one line. */
  .dc-option-foot {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    margin-block-start: auto;
    padding-block-start: var(--sp-2);
  }

  .dc-option-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .dc-confirm {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: var(--lh-body);
  }

  /* ON A PHONE THE CARD'S BUTTON RUNS ITS WIDTH, a thumb's height. */
  @media (width < 600px) {
    .dc-option {
      padding: var(--sp-3);
    }

    .dc-option-foot,
    .dc-option-acts {
      align-items: stretch;
    }

    .dc-option-foot > .dc-btn,
    .dc-option-acts > .dc-btn {
      flex: 1 1 0;
      min-block-size: var(--btn-h);
    }
  }

  @media (forced-colors: active) {
    .dc-option[data-checked] {
      border: 2px solid Highlight;
    }
  }

  /* ── the title (2 Nov) ─────────────────────────────────────────────────
     THE QUESTION ALONE, at a tile figure's size (22/28) rather than a page name's 28: it is a sentence, read, not a
     place's name. The line its asker wrote after it is quiet under it, the body's size in the second ink. */
  .q-head :global(.page-head) {
    max-inline-size: calc(var(--q-max) + var(--gutter) * 2);
  }

  /* A LITTLE WIDER THAN THE TEXT'S MEASURE, so a question of one sentence is one line on a desk. */
  .q-head :global(.page-head .page-name) {
    max-inline-size: calc(var(--q-text) + 180px);
    font-size: var(--fs-figure);
    line-height: var(--lead-figure);
    letter-spacing: -0.01em;
  }

  .q-head :global(.page-said) {
    max-inline-size: calc(var(--q-text) + var(--gutter) * 2);
    margin-block-start: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* ── the title on a phone (today F9) ──────────────────────────────────
     THE ICON AND THE QUESTION IN A GRID is PageHead's own now, on every page; here only the ⋯ is held level with the
     question's first line. */
  @media (width < 900px) {
    .q-head :global(.page-head .head-actions) {
      align-self: start;
      margin-block-start: var(--sp-1);
    }

    /* THE QUESTION IS THE THING READ HERE, so it takes three lines before it gives way, not a page's two: "Ledger Post,
       sending plan was due 4 days …" cut off what it asked. */
    .q-head :global(.page-head .name-words) {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }
  }

  /* THE ⋯ BY THE TITLE IS A GLASS CIRCLE (ops 4.1): one glyph, so as wide as it is tall, a tap wide under a thumb. */
  .page :global(.btn[data-circle]),
  :global(.q-head .btn[data-circle]) {
    inline-size: var(--ctl-page, 36px);
    min-inline-size: 0;
    block-size: var(--ctl-page, 36px);
    padding: 0;
  }

  @media (pointer: coarse) {
    .page :global(.btn[data-circle]),
    :global(.q-head .btn[data-circle]) {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }
</style>
