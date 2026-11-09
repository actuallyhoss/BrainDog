<!--
  ONE DECISION CARD, EVERYWHERE A QUESTION IS ANSWERED: Home, Money, Work, a project's page, the Agents
  page and Decide (through `QueueAnswer.svelte`), and Slash's palette. What it says is `card.ts`'s; this draws it and answers it.

  IT READS LIKE A FORM. Who asked and when, one quiet line over the question on a laptop and a phone
  alike; the question; why it is asked; then the answers as a vertical list of full-width choices, each its name and one
  line of what it does, with "Suggested" in the accent's words beside the one an agent suggests. The drawing is
  `form.css`, which the question's own page draws its choices with too.

  TWO OR THREE ANSWERS ARE ONE PRESS EACH (`card.ts` `pressOf`), whether or not they carry a line of what they do: the
  choices stay full-width rectangles, with no ring and no Decide under them, and pressing one decides, held for its Undo
  like every answer. THE RING AND DECIDE STAY WHERE A PRESS SHOULD BE TWO: an answer that is hard to undo, where nothing
  is chosen for anybody and the button says the care it asks for in its own words ("Answer, can’t be undone easily",
  never a chip); a fourth answer, where the suggestion is already chosen where a key may give it (`startsOn`); a record
  that asks for a reason, while its line is open; and a host that asks for one itself (`onpress`).

  TWO OR THREE ANSWERS THAT ARE ONLY THEIR NAMES ARE A ROW OF BUTTONS (`card.ts` `inlineOf`): "Chase it" and "Not yet",
  the record's own Accept and Decline. The suggested one, or else the first, is filled with the accent and the rest are
  quiet, and one press decides. SO ARE TWO OR THREE WHERE ONE IS SUGGESTED (`suggestsOf`): the suggestion is the red
  primary in its own words, and the full choices, each with what it does and its drawing, are on the question's page.

  THE SIDE IS THERE ONLY WHEN IT HAS SOMETHING TO SAY: on a wide tile, why it is asked and what it changes sit in a
  280px column beside the form. A question with neither is one column, and no column is kept for who asked alone.

  COMPACT, OUTSIDE DECIDE (Home, a declared page): the question, a link to its own page, and its answers as buttons,
  nothing else. Who asked, why and what it moves are read on its page; a question with more than three answers says
  where to choose them. Decide itself draws the whole form.

  ONE PRESS ANSWERS, WITH UNDO. Decide (or Accept, or Decline) makes the card its answered line at once ("Per seat ·
  you, just now", or "Slash suggested · Mara accepted" for what Slash drafted), with Undo on it for six seconds, and
  only then is the answer sent (`press.ts` `hold`). Leaving the page, or the card leaving it, sends what was held at
  once. A record on an older build that still wants a reason opens one line under the card when the answer reaches it.

  THE KEYS KEEP THEIR PATHS. Where Decide gives the answer, a pointer or Space on a choice chooses it; Enter on a choice
  chooses it and answers, as Enter in a form sends it; a page's number key (`PageBody.svelte`) presses a choice from
  outside it and answers with it, as it always did; the host's Enter presses whichever button carries `data-enter`,
  which is only on a card that costs nothing. The arrow keys walk the choices, and choose only where a press does.

  A MERGE IS THE SAME CARD with `MergeCard` for its answers (Merge all, Keep apart, Pick), read off the record's own
  options question (`merge.ts`), and held for its Undo the same way.

  A HOST THAT ANSWERS FOR ITSELF hands `onpress` (Decide's classic screen, which keeps its own reason flow), and the
  card then only draws the press. A READER WHO MAY NOT ANSWER reads the choices as words: a control that cannot act is
  absent, not greyed (`19 §6`).
-->
<script module lang="ts">
  /* EVERY CARD'S IDS ARE ITS OWN, so two queues on one page holding the same question never share a field's id. */
  let made = 0;
</script>

<script lang="ts">
  import '@braindog/skin/kinds/queue.css';
  import './form.css';
  import OptionVisual from './OptionVisual.svelte';
  import { foldedLine, plainReason, repeatedReasons, sharedBefore } from './fold.ts';
  import { visualOf as optionVisualOf, type VisualContext } from './option-visual.ts';
  import { groundNow, want } from './ground.svelte.ts';
  import { getContext, tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import MentionPicker from '$lib/ui/MentionPicker.svelte';
  import { invalidateAll } from '$app/navigation';
  import { since } from 'braindog-render';
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { COMMENT_MOST, readMentionable, sayComment, type Mentionable } from '$lib/record/comments.ts';
  import { answerQuestion, replayWords } from '$lib/record/decide-write.ts';
  import { may as mayOf } from '$lib/record/may.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { QUEUE_FILE, queueWords, type FileAt, type Way } from '$lib/page/queue-answer.ts';
  import LeadPreview from '$lib/page/LeadPreview.svelte';
  import type { Picked } from '$lib/page/picked.svelte.ts';
  import { words as pageWords } from '$lib/page/words.ts';
  import { words as decide } from '../../routes/decide/words.ts';
  import type { Press } from '../../routes/decide/merge.ts';
  import { hold, type Held } from '../../routes/decide/press.ts';
  import MergeCard from '../../routes/decide/MergeCard.svelte';
  import { answeredLine, answerRowOf, cardOf, cardWords, hardSaid, hardWhy, inlineOf, keptWay, ladderLine, leadOf, pressOf, pressSaid, primaryOf, putsOff, saysChanges, startsOn, wayTail } from './card.ts';
  import { leave, pointerOff, settle, snapshot } from './settle.ts';
  import { answerPressed, answerTakenBack, answerWritten, waitsSaid } from '$lib/home/waits.svelte.ts';
  import { dropOut, heldOut, lineHere } from '$lib/record/answers-out.ts';
  import { haptic } from '$lib/shell.ts';
  import { step } from '$lib/funnel.ts';
  import { othersLine, namer } from '../../routes/decide/[id]/decider.ts';
  import IconWell from '$lib/ui/IconWell.svelte';
  import ItemMenu from '$lib/ui/ItemMenu.svelte';
  import { refs as sendRefs } from '$lib/send/send.ts';
  import { ownMenu } from '$lib/ui/context-menu.ts';
  import { amountAnswer, moneyRowOf, outcomeOf } from './money-row.ts';
  import { stateWord } from './state-word.ts';
  import { presses } from '$lib/data/held.svelte.ts';
  import { history } from '$lib/data/undo.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import VisualStrip from '$lib/visual/VisualStrip.svelte';

  let {
    question,
    onanswered = () => {},
    pick = null,
    lead = false,
    n = 0,
    keys = false,
    link = false,
    whole = true,
    may,
    onpress,
    idOf,
    compact = false,
    ground,
  }: {
    question: QueueQuestion;
    /** Once the answer is written: the host lowers its count. */
    onanswered?: () => void;
    /** The page's choice of questions to answer at once: the card leads with its box only where a page holds one. */
    pick?: Picked | null;
    /** The queue's lead question, drawn whole: what accepting it does, and what it would put on the screen. */
    lead?: boolean;
    /** Where the card sits in its queue. Every card says what each answer does now, so it changes nothing drawn. */
    n?: number;
    /** Whether each option carries the number key that presses it, on a host whose keys do. */
    keys?: boolean;
    /** Whether the question is a link to its own page, where the host has no other door to it. */
    link?: boolean;
    /** Whether the card offers "See what it changes"; a host with its own door to the question says no. */
    whole?: boolean;
    /** Whether this reader may answer, where the host knows better than the shell. */
    may?: boolean | undefined;
    /** A host that answers for itself: the press is handed over and the card writes nothing. */
    onpress?: ((key: string) => void) | undefined;
    /** The id an option's button carries, where a host's keys find it by one. */
    idOf?: ((key: string) => string) | undefined;
    /** A question shown outside Decide (Home, a declared page): the question and its answers as buttons, nothing else. */
    compact?: boolean;
    /** What the host knows to draw an option against: the balance, the month's spend, the list a filing goes into. */
    ground?: Omit<VisualContext, 'now'> | undefined;
  } = $props();

  /* WHO DECIDES THIS ONE, said on the card of a reader it is not named for; nothing for nobody or for her. */
  const decidesLine = $derived(
    othersLine(
      question as { id: string; decider?: string | null },
      (route.data as { me?: { person?: string } }).me?.person ?? null,
      namer([], (route.data as { names?: Record<string, string> }).names ?? {}),
    ),
  );

  const uid = `dc-${(made += 1)}`;

  /* THE HOST'S GROUND WINS; else the screen's one batched read of it (`ground.svelte.ts`). */
  untrack(() => want(question));
  const grounded = $derived(ground ?? groundNow(question.id));

  /* THE SHELL THE LAYOUT DREW, read as partial because a page drawn outside the signed-in shell carries no `me`. */
  const shell = $derived(route.data as unknown as Partial<Shell>);
  const me = $derived(shell.me ?? null);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  const answerable = $derived(may ?? (me !== null && (me.owner || mayOf({ me }, 'decide'))));
  /* THE KEPT COPY OFFERS NO ANSWERS, BUT IT KEEPS THEIR PLACES (VERIFY H45). On a cold open the shell is the saved copy
     (`boot-copy.ts`), which reads every reader as `read`, so the card drew its answers as words and then as buttons
     when the live shell landed, and the cards under it moved. While the copy is drawn the card is laid out as for
     somebody who may answer, every control in its own box, quiet and `aria-disabled`, and nothing presses. Only the
     live shell says who may answer; a reader who may not then reads the words, as before. */
  const kept = $derived(may === undefined && shell.stale === true && !answerable);
  /** Whether the card is laid out with its controls: for somebody who may answer, or held in place for the copy. */
  const drawn = $derived(answerable || kept);
  /* THE READER BY THE NAME THE RECORD GIVES THEM, for the line a Slash proposal leaves ("Slash suggested · Mara accepted"). */
  const person = $derived((me?.person ? names.get(me.person) : undefined)?.trim() || copy.feedYou);

  /* WHERE THE PAGE THAT DREW THIS CARD SERVES A FILE IT HOLDS (`QueueAnswer.svelte` hands it down by name), or nothing on a
     host that holds none: the card keeps no address of its own. */
  const fileAt = getContext<FileAt | undefined>(QUEUE_FILE);

  /* AN OPTION THAT IS A PICTURE (each option shown as what it is) carries its address from `cardOf`, which
     reads the options once with the page's way to a file (`waysOf` keeps an address of another host off the card).
     Before `inlineOf`, so answers that are pictures are the form's choices and not a row of bare buttons. */
  const card = $derived(cardOf(question, { me: me?.person ?? null, names, now: recordNow(), lead, file: fileAt }));
  /* THE LEAD'S QUESTION IS A HEADING OF THE PAGE'S OWN RANK, beside the columns' names: it stands in a tile of its own
     under the page's name, and an h3 there skipped a level wherever no column's name was drawn above it (a phone). */
  const questionLevel = $derived(lead && !compact ? 'h2' : 'h3');
  /* WHO ASKED IS A NAME AND THE APP, NEVER THE RUN'S TITLE: "Built the big round on master
     lo…" cut at 24 characters said nothing, and on a phone it wrapped. The run is named on the question's own page. */
  const from = $derived([card.by.app].filter((s): s is string => s !== null));
  /* THE ANSWERS AS A ROW OF BUTTONS, one press each (`inlineOf`), or the form's list to choose from and Decide. */
  const inline = $derived(inlineOf(card, compact));
  /* The one the row fills with the accent: the suggested answer, or the first. */
  const primary = $derived(primaryOf(card));
  /* RED IS THE ONE MAIN ACTION ON A SCREEN: only the lead card fills its answer with the red. Every other card's
     suggested answer is ink, the neutral strong button, so a queue of ten is not ten red buttons. */
  const filled = $derived(lead && !compact ? 'primary' : 'ink');
  /** What the filled answer does, in its own words, where it says: the line under a row of buttons. */
  /* THE CARE IS SAID OF THE ANSWER THE CARD LEADS WITH, filled or not: an unfilled hard answer still says so. */
  const leadKey = $derived(leadOf(card));
  const hardLine = $derived(hardSaid(card, primary, leadKey));
  const primaryDoes = $derived(card.ways.find((w) => w.key === primary)?.because.trim() ?? '');
  /* AT MOST TWO ANSWERS AND ONE QUIET LATER (`answerRowOf`): the asker's own "Later" is that Later, never beside ours. */
  const answerRow = $derived(answerRowOf(card.ways, primary));
  /* AN ANSWER OF THE ASKER'S OWN ON THE ROW THAT ONLY PUTS IT OFF ("Not now") IS THE CARD'S LATER: a second, quiet
     "Later" beside it said the same thing twice, as the question's own page already knows (`putsOff`). */
  const ownLater = $derived(answerRow.shown.some((w) => putsOff(w.label)));
  /* "CAN'T BE UNDONE EASILY" SAYS WHY, in words of what the answer does (`hardWhy`), never the bare warning. */
  const hardReason = $derived(hardLine ? hardWhy(card, Array.isArray(question.kinds) ? question.kinds : []) : '');
  /* THE LADDER'S RULE ("Changes like this ask until …") IS NOT WHY THIS QUESTION MATTERS: it waits behind an info mark. */
  const ladder = $derived(ladderLine(card.why));
  let ladderOpen = $state(false);
  /* THE QUESTION IS AT MOST TWO LINES, and "Read all" opens the rest where it was cut. */
  let readAll = $state(false);
  let clamped = $state(false);
  let titleEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = titleEl;
    if (!el || readAll || typeof ResizeObserver !== 'function') return;
    /* COUNTED IN LINES OF THE QUESTION'S OWN WORDS, not the heading's height: a pressable title grows its 44px hit box
       below a single line, which a height read as a third line. */
    const measure = () => {
      const own = el.querySelector('[data-own]');
      clamped = own ? new Set([...own.getClientRects()].map((r) => Math.round(r.top))).size > 2 : false;
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  });
  /* A READER WHO MAY NOT ANSWER reads a question of options as its answers in words; the record's two say nothing. */
  /* THE WORDS A LONG LIST REPEATS ARE SAID ONCE OVER IT (`fold.ts`). */
  const visualOfWay = (way: Way) => optionVisualOf(question, question.options.find((o) => o.key === way.key) ?? way, { ...grounded, now: recordNow(), home: grounded?.home ?? null });
  const folded = $derived(repeatedReasons(card.ways.map((w) => w.because)));
  const same = $derived(
    sharedBefore(
      card.ways.flatMap((w) => {
        const v = w.shows ? null : visualOfWay(w);
        return v?.kind === 'change' ? [{ what: v.what, before: v.before }] : v?.kind === 'filing' ? [{ what: '', before: v.figure }] : [];
      }),
    ),
  );
  const foldLines = $derived([...[...folded].map(([b, c]) => foldedLine(b, c)), ...(same !== null ? [`Each takes ${same}.`] : [])]);
  const listed = $derived(card.decline === null && card.merge === null && !compact && (!inline || !drawn));
  /* TWO OR THREE ANSWERS WITH SOMETHING TO DRAW STAND SIDE BY SIDE, each with what it changes (`form.css`), so they are
     compared at a glance; stacked on a phone. */
  const across = $derived(card.ways.length >= 2 && card.ways.length <= 3 && card.ways.some((w) => Boolean(w.shows) || visualOfWay(w) !== null));
  /* THE ANSWER CHOSEN: the reader's, or the one the form starts on (the suggestion, where a key may give it). */
  let picked = $state<string | null>(null);
  const selected = $derived(picked ?? startsOn(card));
  /* NOT NOW opens the question's own page at the step that puts it off; only where this card is the way in to it. */
  const notNow = $derived(drawn && whole && !link && !compact && onpress === undefined && card.merge === null);

  /* THE CARD'S VERBS AT THE POINTER: a right-click or a held thumb on it, or `⇧F10` (`ownMenu`). */
  let point = $state<{ x: number; y: number; height: number } | null>(null);
  const heard = ownMenu((p) => (point = p), card.href);
  const chosenForAll = $derived(pick?.has(question.id) ?? false);
  const bulkFix = $derived(pick?.fixes.get(question.id) ?? '');
  const optId = (key: string): string => idOf?.(key) ?? `${uid}-opt-${key}`;
  /* THE WHOLE CHANGE, ONE LINK AWAY, where it is worth a look and the host has no other door to the question. */
  const seeWhole = $derived(card.seeWhole && whole && !link);
  /* AND NOT WHERE THE CARD ALREADY SHOWS THE WHOLE CHANGE: its lines are drawn, none left out and none past the third. */
  const seeLink = $derived(seeWhole && !(card.lines.length > 0 && card.more === 0 && card.does === ''));
  /* WHETHER THE SIDE SAYS WHAT IT CHANGES: a line of what accepting does, money, or a change from what to what. The
     heading is drawn only over such a line; the link to the whole change alone is drawn alone. */
  /* THE MONEY AN ANSWER MOVES IS THE LINE OVER THE BUTTONS (the scope of 24 October), and the button says Accept:
     "Accept EGP 74,092.16 and $9,074.01 USD, can't be undone easily" wrapped to five lines at 390. Where nobody may
     answer, there are no buttons to stand over, and the side says it under what it changes as before. */
  const moneyAbove = $derived(drawn && card.money !== '' && (!card.merge || compact));
  const changesSaid = $derived(saysChanges(moneyAbove ? { ...card, money: '' } : card));
  const changesAny = $derived(changesSaid || seeLink);
  /* THE SIDE IS DRAWN ONLY WITH SOMETHING IN IT: why it is asked, or what it changes. Who asked is the line over the question. */
  const side = $derived(!compact && ((card.why !== '' && !ladderLine(card.why)) || changesAny));

  /**
   * WHERE THE CARD IS. `open` offers the options; `asking` has one chosen and the reason line open under it, for a record
   * that still keeps one; `answered` is the one line the card becomes, with Undo on it while the answer is held.
   */
  let phase = $state<'open' | 'asking' | 'answered'>('open');
  let chosen = $state<Way | null>(null);
  let reason = $state('');
  let fix = $state('');
  let answeredAt = $state('');
  /* THE LINE A MERGE LEAVES ("Merged into Ana"), in place of the option's own words. */
  let mergeLine = $state('');
  /* ONE WRITE IN FLIGHT, so a double press answers once. The options are not disabled for it: a pressed
     button that turns disabled drops the focus it holds to the page. */
  let busy = $state(false);
  /** The answer held for its Undo, or `null` once it has gone or was taken back. */
  let holding = $state<Held | null>(null);
  /* THE ANSWER WAITING OUT ITS SIX SECONDS IS ON THE TAB'S UNDO HISTORY, so ⌘Z takes it back as the Undo beside it does (fluid F15). */
  const mark = `held:${uid}`;
  /* THIS CARD DRAWS ITS OWN ANSWERED LINE, so nothing takes its row away while it does (`answers-out.ts`). */
  let ownLine: (() => void) | null = null;
  let here = true;
  /* AN ANSWER PRESSED WHILE THE SCREEN WAS A SAVED COPY, kept for the record: what it said, and which answer (fluid F5). */
  let waiting = $state<{ key: string; said: string } | null>(null);
  /* THE ROW IS ON ITS WAY OUT, sent and waiting for the pointer to leave its queue, or closing (`settle.ts` `leave`). It
     carries `data-held` meanwhile, so the page reads itself again only once the row has gone and nothing moves then. */
  let leaving = $state(false);
  /** How long a declined line stays for its note where no pointer rests on the queue. */
  const NOTE_MS = 4_000;
  /* ONE PRESS ON A CHOICE DECIDES (`card.ts` `pressOf`): two or three answers, none hard to undo. Not while the record's
     reason line is open, where the choice is changed and Send gives it, nor on a host that takes the press for itself. */
  const oneTap = $derived(listed && drawn && onpress === undefined && phase !== 'asking' && pressOf(card));

  let field = $state<HTMLInputElement | null>(null);
  let done = $state<HTMLParagraphElement | null>(null);
  let cardEl = $state<HTMLElement | null>(null);

  /**
   * THE CARD BECOMES ITS LINE, OR THE LINE ITS CARD, WITHOUT A JUMP (`settle.ts`): where the cards under it stand is
   * taken before the change, and after it they glide from there to their new places while the new one rises and fades
   * in, over `--d-rows`, on transform and opacity alone. Nothing moves for a reader who asked for less motion.
   */
  async function morph(change: () => void) {
    const before = snapshot(phase === 'answered' ? done : cardEl);
    change();
    await tick();
    settle(phase === 'answered' ? done : cardEl, before);
  }

  /**
   * A QUESTION ABOUT MONEY THAT FELL DUE IS ONE ROW (today F4): what it is, the amount at the end, how late in red, and
   * the answer that names the amount. Any other question, and a merge, is the card it always was.
   */
  const row = $derived(card.merge === null ? moneyRowOf(card.question, card.ways.map((w) => w.label)) : null);

  /**
   * "Asked by your rule Chase late payments · 12h ago": who asked, at the row's foot and never leading it, and how long
   * it has waited in the words every other card says it (audit 2, B14: this row alone said "3 Sep" beside "12h ago").
   */
  /* AN AGE IS ONE PIECE: "12h ago" never breaks between its two words at a line's end (phone, 390). */
  const whenSaid = $derived(card.when.replace(/ /gu, '\u00a0'));

  /* WHO ASKED, AS EVERY OTHER CARD'S BY-LINE SAYS IT (3 Nov): the face and the name, then how long ago. "By Ask whether to
     keep a service before it renews" read as a broken sentence; the rule's glyph says it is a rule, and a screen reader
     hears "Asked by your rule". */
  const askedName = $derived.by(() => {
    if (card.by.kind === 'rule') {
      const rule = card.by.name.replace(/^A rule: /u, '');
      return rule.charAt(0).toUpperCase() + rule.slice(1);
    }
    return card.by.kind === 'you' ? cardWords.you : card.by.name;
  });

  /**
   * WHAT AN ANSWER DID, said with its object (today F7): "Chased Invoice 2026-041: brand system for £4,800". A proposal
   * Slash drafted says its history as before, and a merge its own line.
   */
  const line = $derived.by(() => {
    if (chosen === null) return '';
    if (mergeLine) return mergeLine;
    if (card.slash) return answeredLine(card, chosen, person, since(answeredAt || new Date(recordNow()).toISOString(), recordNow()));
    return outcomeOf(chosen.label, row ? { title: row.title, amount: row.amount } : { title: card.question });
  });

  /* A NOTE, AFTER A DECLINE: offered in the line the card became, opened only by its press, and kept with the question as
     a comment on it, in Decide's own words. */
  let note = $state<'shut' | 'open' | 'kept'>('shut');
  let noteBody = $state('');
  let noteFix = $state('');
  let noteBusy = $state(false);
  let noteField = $state<HTMLInputElement | null>(null);
  /* WHO AN "@" IN THE NOTE OFFERS (`MentionPicker`): the people the record says may see this question, less the reader,
     asked when the note opens (`readMentionable`), by the check a mention on a question rings by. */
  let mentionable = $state<Mentionable[]>([]);

  async function openNote() {
    note = 'open';
    void readMentionable(apiBase(), `suggestion:${question.id}`).then((got) => (mentionable = got));
    await tick();
    noteField?.focus();
  }

  async function sendNote(e: SubmitEvent) {
    e.preventDefault();
    const body = noteBody.trim();
    if (noteBusy) return;
    if (body === '') return void noteField?.focus();
    noteBusy = true;
    noteFix = '';
    try {
      const out = await sayComment(apiBase(), { on: `suggestion:${question.id}`, body });
      if (out.ok) note = 'kept';
      else noteFix = out.fix;
    } finally {
      noteBusy = false;
    }
  }

  /**
   * The answer, sent. `said` is the reason, or nothing when nobody has been asked for one.
   *
   * A REFUSAL THAT WANTS A REASON OPENS THE LINE and says nothing else, because the line is the whole answer to it. Any
   * other refusal puts the card back with the record's own sentence under it, and a row that moved since the question
   * was filed is said as that, with nothing written and the whole change one link away.
   */
  async function send(way: Way, said?: string) {
    if (busy) return;
    busy = true;
    fix = '';
    try {
      const out = await answerQuestion(apiBase(), question.id, way.key, said);
      if (out.from === 'written') {
        phase = 'answered';
        answerWritten(question.id);
        step('needs_answered');
        onanswered();
        void goOut();
        /* AND THE RAIL'S COUNT FOLLOWS: the write dropped the kept `boot` (`decide-write.ts`), and the layout reads it
           again. `/p/<slug>` reads its body by its slug and not from the layout, so there this does not read the card away. */
        void invalidateAll();
        return;
      }
      mergeLine = '';
      answerTakenBack(question.id);
      ownLine?.();
      ownLine = null;
      /* A CARD ALREADY GONE (he moved on inside the six seconds) HAS NOWHERE TO SAY IT, so a toast does: the question is
         back on the list, and never silently. */
      if (!here) return void toasts.push(replayWords.failed(card.question, out.fix), { intent: 'warn' });
      /* THE REFUSAL IS FELT IN THE IPHONE APP (`shell.ts`), as the press that sent it was. */
      haptic('warning');
      /* A REFUSED ANSWER OPENS THE CARD BACK OUT OF ITS LINE as Undo does, rather than in one jump. */
      if (out.from === 'refused' && out.wants === 'reason') {
        await morph(() => (phase = 'asking'));
        reveal();
        return;
      }
      await morph(() => {
        phase = 'open';
        fix = out.from === 'conflict' ? queueWords.moved : out.fix;
      });
    } finally {
      busy = false;
    }
  }

  /**
   * ONE PRESS: the card becomes its answered line at once, focused, with Undo on it, and the answer waits six seconds
   * before it goes. A second press while one is held does nothing.
   */
  async function answer(way: Way, said = '') {
    if (busy || holding !== null) return;
    chosen = way;
    mergeLine = said;
    answeredAt = new Date().toISOString();
    /* THE COUNT MOVES ON THE PRESS (`waits.svelte.ts`): the rail, the tab and the head say one less now, not after the
       six seconds of Undo and the poll that follows the write. AND THE IPHONE APP'S HAND FEELS THE ANSWER (`shell.ts`). */
    answerPressed(question.id);
    /* WRITTEN DOWN BEFORE ANYTHING ELSE, so a reload from here on neither draws the question nor loses the answer. */
    ownLine ??= lineHere(question.id);
    heldOut(apiBase(), question.id, { decide: { option: way.key } }, card.question, waitsSaid());
    haptic('success');
    await morph(() => {
      phase = 'answered';
      holding = hold(() => {
        holding = null;
        history.spend(mark);
        void send(way);
      });
      history.push({ batch: mark, said: '', local: () => void undo() });
    });
    done?.focus();
  }

  /**
   * THE SENT ANSWER'S ROW GOES WITHOUT MOVING WHAT THE READER IS AIMING AT: it waits for the mouse to leave its queue,
   * then closes to nothing with the gap under it (`settle.ts`), and the page's next read takes it out with nothing left to
   * move. Only a row of a queue (`.qa`); a host that draws the card alone reads itself again as it always did.
   */
  async function goOut() {
    const row = done?.closest<HTMLElement>('.qa') ?? null;
    if (!row || note !== 'shut') return;
    leaving = true;
    try {
      await pointerOff(row.parentElement);
      /* A DECLINE OFFERS ITS NOTE IN THE LINE: on a screen with no pointer to wait for, the line stays a moment for it. */
      if (chosen?.key === 'reject' && typeof matchMedia === 'function' && !matchMedia('(hover: hover)').matches) await new Promise((r) => setTimeout(r, NOTE_MS));
      /* A NOTE BEING WRITTEN KEEPS ITS LINE. */
      if (note === 'shut') await leave(row);
    } finally {
      leaving = false;
    }
  }

  /** Undo, while the answer is held: the card comes back as it was, focus on the answer that was pressed. */
  async function undo() {
    const was = holding;
    if (!was?.undo()) return;
    holding = null;
    history.spend(mark);
    answerTakenBack(question.id);
    dropOut(apiBase(), question.id);
    ownLine?.();
    ownLine = null;
    mergeLine = '';
    const key = chosen?.key;
    await morph(() => (phase = 'open'));
    if (key) document.getElementById(optId(key))?.focus();
  }

  /** An answer given. With the reason line open it changes the choice and keeps the words already typed. */
  /* NOR WHILE THE SCREEN IS A SAVED COPY OR WHAT THIS TAB KEPT (`held.svelte.ts`): a key reaches this as a press does. THE
     PRESS IS KEPT, NOT DROPPED (fluid F5): it goes once the record has answered, if the same answer is still on offer. */
  function press(way: Way) {
    if (busy || holding !== null) return;
    if (kept || presses.held) {
      if (phase === 'open' && onpress === undefined) waiting = { key: way.key, said: buttonSays(way) };
      return;
    }
    if (onpress) return onpress(way.key);
    if (phase === 'asking') {
      chosen = way;
      return reveal();
    }
    /* AN ANSWER THAT ASKS FOR WORDS OPENS ITS LINE FIRST ("Who is Hussam to you?"), and Send gives both. */
    if (way.asks) {
      chosen = way;
      void morph(() => (phase = 'asking')).then(() => tick()).then(reveal);
      return;
    }
    void answer(way);
  }

  /** A choice chosen, and nothing sent: the form's Decide sends it. With the reason line open it is the answer's change. */
  function selectWay(way: Way) {
    if (kept || presses.held || busy || holding !== null) return;
    if (phase === 'asking') return press(way);
    picked = way.key;
  }

  /**
   * DECIDE: the answer chosen, given. With nothing chosen yet (a card that is hard to undo starts on none) the focus goes
   * to the first choice, so the press that answers is still the reader's own.
   */
  function commit() {
    const way = card.ways.find((w) => w.key === selected);
    if (!way) return void document.getElementById(optId(card.ways[0]?.key ?? ''))?.focus();
    press(way);
  }

  /**
   * A PRESS ON A CHOICE. A pointer, Space and Enter on the focused choice come from the choice itself; a page's number key
   * presses it from outside (`PageBody.svelte`, the focus elsewhere and no pointer behind it), and that has always been
   * the answer, so it still is.
   */
  function onChoice(e: MouseEvent, way: Way) {
    if (e.detail === 0 && document.activeElement !== e.currentTarget) return press(way);
    selectWay(way);
  }

  /**
   * Enter on a choice chooses it and answers, as Enter sends a form; the arrows walk the choices and choose as they go.
   * Where one press decides (`oneTap`) there is nothing to choose first: Enter answers and the arrows only walk.
   */
  function onChoiceKey(e: KeyboardEvent, i: number) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const way = card.ways[i];
    if (!way) return;
    const chooses = !oneTap;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (chooses) selectWay(way);
      press(way);
      return;
    }
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = card.ways[(i + step + card.ways.length) % card.ways.length];
    if (!next) return;
    if (chooses) selectWay(next);
    document.getElementById(optId(next.key))?.focus();
  }

  /** A merge's press, with the line it leaves (`MergeCard`). */
  function pressMerge(p: Press, said: string) {
    const way = card.ways.find((w) => w.key === p.option);
    if (!way) return;
    if (onpress) return onpress(way.key);
    void answer(way, said);
  }

  /** The option at `i` (from 0), as its number key presses it; a reader who may not answer presses nothing. */
  export function choose(i: number): boolean {
    const way = card.ways[i];
    if (!way || !answerable || phase === 'answered' || card.merge !== null) return false;
    press(way);
    return true;
  }

  /**
   * The answer Enter gives (`card.ts` `enter`): the suggested one, or Accept, and none where it is hard to undo or money
   * moves. `false` when there is none to give.
   */
  export function accept(): boolean {
    const way = card.ways.find((w) => w.key === card.enter);
    if (!way || !answerable || phase === 'answered') return false;
    press(way);
    return true;
  }

  /** Whether the card is answered, held for its Undo or sent. */
  export function answered(): boolean {
    return phase === 'answered';
  }

  /**
   * A BLANK LINE IS NOT SENT. `writeDecision` would refuse it in Decide's sentence, which promises a button that turns on,
   * and this Send is never off; so the field keeps the focus instead, and `required` lets the browser say why.
   */
  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    if (reason.trim() === '') return reveal();
    answeredAt = new Date().toISOString();
    answerPressed(question.id);
    ownLine ??= lineHere(question.id);
    heldOut(apiBase(), question.id, { decide: { option: chosen.key, reason } }, card.question, waitsSaid());
    haptic('success');
    void morph(() => (phase = 'answered'));
    void send(chosen, reason);
  }

  /* ESC PUTS THE LINE AWAY and hands focus back to the option it was opened for, as nothing was sent. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    phase = 'open';
    fix = '';
    const key = chosen?.key;
    void tick().then(() => key && document.getElementById(optId(key))?.focus());
  }

  /**
   * THE LINE IS FOCUSED AND KEPT ABOVE THE KEYBOARD. Its scroll margins clear the sticky bar and `--kb`, the keyboard's
   * height written at run time (`lib/a11y/keyboard.ts`), so on a phone the field and Send stay in sight while typing.
   */
  function reveal() {
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
  }

  /* A CARD THAT LEAVES THE PAGE SENDS WHAT IT HELD, and so does a tab that is closed: the answer given is still the
     reader's. */
  $effect(() => {
    const leave = () => untrack(() => holding)?.flush();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
      here = false;
      ownLine?.();
      ownLine = null;
    };
  });

  /* WHAT AN ANSWER'S BUTTON SAYS, the money row's naming the amount, so a kept press goes only if the button still says it. */
  const buttonSays = (way: Way): string => (row && way.key === primary ? amountAnswer(way.label, row.amount) : way.label);

  /* THE PRESS KEPT FOR THE RECORD GOES THE MOMENT IT HAS ANSWERED, as a press does, and the six seconds of Undo are its own.
     A question or an answer that is no longer there is said, not guessed at: the reader looks. */
  $effect(() => {
    if (waiting === null || kept || presses.held) return;
    const asked = waiting;
    waiting = null;
    untrack(() => {
      const way = keptWay(card.ways, asked, buttonSays);
      if (way && answerable) press(way);
      else toasts.push(copy.pressChanged, { intent: 'warn' });
    });
  });

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

<!-- A CHOICE'S WORDS: what it is, where it says (its colours, its figure or its picture, inside the choice and nowhere
     else, after `visualOf` held it to the renderer's reading), its name, and one line of what it does. A PICTURE SAYS
     NOTHING ALOUD (`alt=""`): the option's name beside it is what it is called. -->
{#snippet choiceBody(way: Way)}
  <span class="dc-choice-main">
    {#if way.shows && 'swatch' in way.shows}<span class="queue-visual" data-shows="swatch" aria-hidden="true"
        >{#each way.shows.swatch as colour}<span class="queue-swatch" style="--swatch:{colour}"></span>{/each}</span
      >{:else if way.shows && 'file' in way.shows}<span class="queue-visual" data-shows="file"><img class="queue-file dc-choice-file" src={way.shows.file.src} alt="" /></span
      >{:else if way.shows}<span class="queue-visual" data-shows="figure"><span class="queue-figure num">{way.shows.figure}</span></span>{/if}
    <span class="queue-label dc-choice-name own-dir">{way.label}</span>
    {#if way.because && !folded.has(way.because)}<span class="dc-choice-does own-dir">{plainReason(way.because)}</span>{/if}
    <!-- WHAT IT WOULD CHANGE, drawn small; an option with a swatch, figure or picture of its own keeps that. A change every
         row shares is said once over the list (`fold.ts`), and its row keeps its name. -->
    {#if !way.shows}{@const v = visualOfWay(way)}{#if !(v?.kind === 'change' && ((same !== null && v.before === same) || v.after === way.label)) && !(v?.kind === 'filing' && ((same !== null && v.figure === same) || v.list === way.label))}<OptionVisual visual={v} />{/if}{/if}
  </span>
{/snippet}

<!-- THE END OF A CHOICE'S FIRST LINE: "Suggested", and the number key that presses it on a host whose keys do. -->
{#snippet choiceEnd(way: Way, i: number)}
  {#if way.recommended || (keys && i < 9)}<span class="dc-end"
      >{#if way.recommended}<span class="dc-rec">{queueWords.suggested}</span>{/if}{#if keys && i < 9}<span class="queue-key dc-key" aria-hidden="true">{i + 1}</span
        >{/if}</span
    >{/if}
{/snippet}

<!-- THE ANSWERS AS A ROW OF BUTTONS, one press each: the suggested one, or else the first, filled with the accent. On a
     money row the filled one names the amount ("Chase £4,800"). -->
{#snippet inlineButtons(amount: string | null)}
  {#each answerRow.shown as way (way.key)}
    {@const i = card.ways.indexOf(way)}
    <button
      type="button"
      class="queue-act dc-btn"
      data-weight={way.key === primary ? filled : undefined}
      data-recommended={way.recommended ? '' : undefined}
      id={optId(way.key)}
      data-enter={way.key === card.enter ? '' : undefined}
      data-on={(chosen?.key === way.key && phase === 'asking') || waiting?.key === way.key ? '' : undefined}
      data-keeps
      aria-pressed={waiting?.key === way.key ? true : phase === 'asking' ? chosen?.key === way.key : undefined}
      aria-disabled={kept ? 'true' : undefined}
      aria-describedby={wayTail(card, way, primary ?? leadKey) !== '' ? `${uid}-hard` : undefined}
      onclick={() => press(way)}
      >{#if keys && i < 9}<span class="queue-key dc-key" aria-hidden="true">{i + 1}</span>{/if}<span class="own-dir"
        ><span class="dc-btn-name">{amount !== null && way.key === primary ? amountAnswer(way.label, amount) : way.label}</span></span
      >{#if way.recommended}{#if lead && !compact}<span class="dc-rec-in">{queueWords.suggested}</span>{:else}<span class="dc-sr">{queueWords.suggestedSaid}</span>{/if}{/if}</button
    >
  {/each}
{/snippet}

<!-- ASK ME LATER (today F11): a quiet clock and its words at the row's end, opening the question's own page at the step
     that puts it off. The clock alone floated under the answers on every card and said nothing until it was pressed. -->
<ItemMenu label={card.question} bind:at={point} href={card.href}>
  {#if notNow && !kept}<a role="menuitem" href={at(`${card.href}?defer`)}><Icon name="clock" size="s" /><span class="mi-name">{queueWords.notNow}</span></a>{/if}
  {#if pick && drawn && !kept}<button role="menuitemcheckbox" type="button" aria-checked={chosenForAll} onclick={() => pick?.toggle(question)}><Icon name="check" size="s" /><span class="mi-name">{copy.select}</span></button>{/if}
</ItemMenu>

{#snippet later(inlined = false)}
  {#if inlined && answerRow.later}
    <!-- THE ASKER'S OWN LATER IS THE CARD'S ONE QUIET LATER: an answer like any other, drawn bare. -->
    {@const way = answerRow.later}
    <button type="button" class="queue-act dc-btn dc-later" data-weight="bare" id={optId(way.key)} aria-disabled={kept ? 'true' : undefined} onclick={() => press(way)}
      ><Icon name="clock" size="s" /><span class="dc-later-words own-dir">{way.label}</span></button
    >
  {:else if inlined && answerRow.more > 0 && drawn}
    <!-- MORE ANSWERS THAN A ROW HOLDS: the rest, and putting it off, are chosen on the question's own page. -->
    <a class="dc-btn dc-later" data-weight="bare" href={at(card.href)}><span class="dc-later-words">{cardWords.otherAnswers(answerRow.more)}</span></a>
  {:else if notNow && kept && !ownLater}
    <button type="button" class="dc-btn dc-later" data-weight="bare" aria-disabled="true" aria-label={queueWords.notNow}><Icon name="clock" size="s" /><span class="dc-later-words">{queueWords.notNow}</span></button>
  {:else if notNow && !ownLater}
    <a class="dc-btn dc-later" data-weight="bare" href={at(`${card.href}?defer`)} aria-label={queueWords.notNow} title={queueWords.notNow}><Icon name="clock" size="s" /><span class="dc-later-words">{queueWords.notNow}</span></a>
  {/if}
{/snippet}

{#if phase === 'answered' && chosen}
  <!-- ONE LINE, QUIET: what was chosen, by whom and when, where the card was, with Undo while the answer waits. -->
  <p class="qa-done" role="status" tabindex="-1" bind:this={done} data-held={holding || busy || leaving ? '' : undefined}>
    <Icon name="check" size="s" /><span class="qa-done-words">{line}</span>
    {#if holding}
      <button type="button" class="qa-see qa-undo tap" onclick={undo}>{cardWords.undo}</button>
    {:else if chosen.key === 'reject' && note === 'shut' && !busy}
      <button type="button" class="qa-see qa-offer tap" onclick={openNote}>{decide.noteOffer}</button>
    {/if}
    {#if note === 'kept'}<span class="qa-done-words">{decide.noteKept}</span>{/if}
  </p>
  {#if note === 'open'}
    <form class="qa-reason" onsubmit={sendNote} aria-busy={noteBusy}>
      <label class="qa-label" for="{uid}-note">{decide.noteLabel}</label>
      <div class="qa-line">
        <span class="field field-lg qa-field">
          <input id="{uid}-note" class="field-input qa-input" type="text" autocomplete="off" enterkeyhint="send" maxlength={COMMENT_MOST} bind:value={noteBody} bind:this={noteField} />
          <MentionPicker field={noteField} people={mentionable} />
        </span>
        <Button type="submit">{decide.noteSend}</Button>
      </div>
      {#if noteFix}<p class="qa-fix" role="status">{noteFix}</p>{/if}
    </form>
  {/if}
{:else if row}
  <!-- A MONEY ROW (today F4): the well, what it is and the amount, how late in red, the answers, and who asked at the
       foot. The question in full is on its own page, which the title opens. THE WELL IS NEUTRAL here as on Today
       (polish 8, VERIFY P7): the late word carries the red, once. -->
  <article class="queue-card dc dc-row" aria-busy={busy} data-selected={chosenForAll ? '' : undefined} data-compact={compact ? '' : undefined} bind:this={cardEl} {@attach heard}>
    <span class="dr-well"><IconWell name={row.kind === 'renews' ? 'service' : row.owed ? 'arrowDown' : 'money'} size="l" /></span>
    <svelte:element this={questionLevel} class="queue-question dr-title own-dir"><a class="dc-open tap" href={at(card.href)}><span data-own>{row.title}</span></a>{#if card.band}<span class="queue-cost" data-cost={card.cost} hidden>{card.band}</span>{/if}</svelte:element>
    <span class="dr-amount num">{row.amount}</span>
    <p class="dr-meta"><span class="dr-late" data-kind={row.kind} data-soon={row.kind === 'renews' && row.days <= 7 ? '' : undefined}>{row.late}</span>{#if row.asks}<span class="dr-asks own-dir">{' · '}{row.asks}</span>{/if}</p>
    {#if drawn}
      <div class="dc-actions dr-actions" data-inline>
        {@render inlineButtons(row.amount)}
        {@render later(true)}
      </div>
    {/if}
    {#if fix || bulkFix}<p class="qa-fix dr-fix" role="status">{fix || bulkFix}</p>{/if}
    {#if !compact}<p class="dr-asked own-dir"
        ><span class="dc-sr">{card.by.kind === 'rule' ? cardWords.askedByRule : cardWords.askedBy}</span><Face name={card.by.name} kind={card.by.kind} size="s" /><span class="dr-who">{askedName}</span>{#if card.when}<span class="dr-when">{whenSaid}</span>{/if}</p
      >{/if}
    {#if pick && drawn}
      <button type="button" role="checkbox" class="queue-select qa-select tap dr-select" aria-checked={chosenForAll} aria-label={pageWords.pick(card.question)} aria-disabled={kept ? 'true' : undefined} onclick={kept ? undefined : () => pick?.toggle(question)}
        ><span aria-hidden="true">{chosenForAll ? '✓' : ''}</span></button
      >
    {/if}
  </article>
{:else}
  <article
    class={lead && !compact ? 'queue-card queue-lead dc' : 'queue-card dc'}
    aria-busy={busy}
    data-selected={chosenForAll ? '' : undefined}
    data-compact={compact ? '' : undefined}
    data-side={side ? '' : undefined}
    bind:this={cardEl}
    {@attach heard}
  >
    {#if pick && drawn}
      <!-- THE BOX THE RENDERER'S QUEUE DRAWS FOR A BULK ANSWER, named for the question alone. `x` presses it from the
           keyboard (`PageBody.svelte`). -->
      <button
        type="button"
        role="checkbox"
        class="queue-select qa-select tap"
        aria-checked={chosenForAll}
        aria-label={pageWords.pick(card.question)}
        aria-disabled={kept ? 'true' : undefined}
        onclick={kept ? undefined : () => pick?.toggle(question)}><span aria-hidden="true">{chosenForAll ? '✓' : ''}</span></button
      >
    {/if}
    <!-- THE FORM: who asked, the question, the answers and the buttons. On a wide tile with a side it is the card's first
         column and the side is beside it; anywhere else both are let go of (`display: contents`) and their parts read in
         one column in the order a question is read: who asked, the question, why, the answers, the buttons, what it
         changes. -->
    <div class="dc-main">
      <!-- COMPACT, THE QUESTION IS THE DOOR TO ITS OWN PAGE, where who asked, why and what it moves are read; the band
           is kept on it, unseen, for the keys and the ranking. -->
      <svelte:element this={questionLevel} class="queue-question own-dir" data-clamp={readAll ? undefined : ''} bind:this={titleEl}>
        {#if link || compact}<a class="dc-open tap" href={at(card.href)}><span data-own>{card.question}</span></a>{:else}<span data-own>{card.question}</span>{/if}{#if card.joined}{' '}<span
            class="qa-joined num">{queueWords.joined(card.joined)}</span
          >{/if}{#if compact && card.band}<span class="queue-cost" data-cost={card.cost} hidden>{card.band}</span>{/if}
      </svelte:element>
      <!-- A QUESTION LONGER THAN TWO LINES IS CUT THERE, and read whole on a press. -->
      {#if clamped && !readAll}<button type="button" class="dc-read tap" onclick={() => (readAll = true)}>{cardWords.readAll}</button>{/if}
      <!-- COMPACT, WHO ASKED AND HOW LONG IT HAS WAITED ARE ONE QUIET LINE: the kind of thing, who, and when. -->
      {#if compact}<p class="dc-meta own-dir">{[card.by.name, ...from, whenSaid].filter((s) => s !== '').join(' · ')}</p>{/if}
      {#if !compact}
        <!-- WHO ASKED AND WHEN, one quiet line UNDER the question at every width, so every card starts with its sentence:
            the face and name, and the app it ran in where it has a name. "Asked by" is said to a screen reader, where the eye reads
             the line's place. The band is kept here for the keys and the ranking, and said in the answering button's
             words instead. -->
        <p class="queue-by">
          <span class="dc-sr">{cardWords.askedBy}</span>
          <Face name={card.by.name} kind={card.by.kind} size="s" /><span class="queue-who own-dir" title={card.by.name}>{card.by.name}</span>
          {#each from as part, i (i)}<span class="dc-from own-dir">{part}</span>{/each}
          <span class="queue-when">{card.when}</span>
          {#if card.band}<span class="queue-cost" data-cost={card.cost} hidden>{card.band}</span>{/if}
          {#if ladder}<button type="button" class="dc-info" aria-expanded={ladderOpen} aria-controls="{uid}-ladder" title={cardWords.whyAsks} onclick={() => (ladderOpen = !ladderOpen)}
              ><Icon name="info" size="s" /><span class="dc-sr">{cardWords.whyAsks}</span></button
            >{/if}
        </p>
        {#if ladder && ladderOpen}<p class="qa-later dc-ladder own-dir" id="{uid}-ladder">{card.why}</p>{/if}
      {/if}
      {#if decidesLine}<p class="qa-later own-dir">{decidesLine}</p>{/if}
      {#if !compact && card.later}<p class="qa-later own-dir">{card.later}</p>{/if}
      <!-- HOW LONG IT WAITS: under why, in the side, where whoever asked wrote one; here, under the question,
           where nobody did. -->
      {#if !compact && (!card.why || ladder) && card.lapses}<p class="dc-lapses own-dir">{card.lapses}</p>{/if}
      <!-- WHAT THE QUESTION HOLDS TO LOOK AT, a still or a quiet card under it, opened full width on a press. -->
      <VisualStrip on={question.id} {compact} />
      {#if card.merge && !compact}
        <MergeCard merge={card.merge} {answerable} holding={busy ? '' : null} titleOf={(key) => card.ways.find((w) => w.key === key)?.label} onpress={pressMerge} />
      {:else if oneTap}
        <!-- THE ANSWERS, ONE PRESS EACH: the same full-width rectangles, each its name and what it does, with no ring to
             fill and no Decide under them. They are buttons in a list, not radios: nothing is chosen before it is given.
             Only the one a key may press carries `data-enter`. -->
        <ul class="queue-options dc-choices" aria-label={queueWords.choices}>
          {#each card.ways as way, i (way.key)}
            <li class="queue-option" data-recommended={way.recommended ? '' : undefined}>
              <button
                type="button"
                class="queue-act dc-choice"
                data-press
                id={optId(way.key)}
                data-enter={way.key === card.enter ? '' : undefined}
                onclick={() => press(way)}
                aria-disabled={kept ? 'true' : undefined}
                onkeydown={(e) => onChoiceKey(e, i)}
              >
                {@render choiceBody(way)}
                {@render choiceEnd(way, i)}
              </button>
            </li>
          {/each}
        </ul>
      {:else if listed}
        <!-- THE ANSWERS, A LIST TO CHOOSE FROM: each a full-width choice with its name and what it does, the suggested
             one saying so in the accent's words. A press chooses; Decide answers (`form.css`). -->
        {#each foldLines as line (line)}<p class="dc-fold own-dir">{line}</p>{/each}
        <ul class="queue-options dc-choices" data-long={card.ways.length > 6 ? '' : undefined} data-across={across ? '' : undefined} role={drawn ? 'radiogroup' : undefined} aria-label={queueWords.choices}>
          {#each card.ways as way, i (way.key)}
            {@const marked = way.recommended}
            {@const on = phase === 'asking' ? chosen?.key === way.key : selected === way.key}
            <li class="queue-option" data-recommended={marked ? '' : undefined} role={drawn ? 'none' : undefined}>
              {#if drawn}
                <button
                  type="button"
                  role="radio"
                  class="queue-act dc-choice"
                  id={optId(way.key)}
                  aria-checked={on}
                  data-on={chosen?.key === way.key && phase === 'asking' ? '' : undefined}
                  aria-disabled={kept ? 'true' : undefined}
                  onclick={(e) => onChoice(e, way)}
                  onkeydown={(e) => onChoiceKey(e, i)}
                >
                  <span class="dc-ring" aria-hidden="true"></span>
                  {@render choiceBody(way)}
                  {@render choiceEnd(way, i)}
                </button>
              {:else}
                <div class="dc-choice" data-read>
                  {@render choiceBody(way)}
                  {#if marked}<span class="dc-rec">{queueWords.suggested}</span>{/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if drawn && (!card.merge || compact)}
        <!-- THE BUTTONS: a row of answers, one press each, or Decide with the answer chosen; then Not now. Only the one a
             key may press carries `data-enter`: nothing hard to undo, nothing that moves money. Where the choices
             themselves decide, only Not now is here, and with neither the row is not drawn (`form.css`). DECIDE NEVER
             LOOKS SWITCHED OFF (VERIFY H9): pressed with nothing chosen, it puts the focus on the first answer. -->
        {#if moneyAbove}<p class="dc-money dc-money-above num own-dir">{card.money}</p>{/if}
        <div class="dc-actions" data-inline={inline ? '' : undefined}>
          {#if inline}
            <!-- ONE PRESS DECIDES: the suggested answer, or the first, filled with the accent, the rest quiet. Its name is
                 its own span, so the line it leaves and the queue gate read the name without the care said after it. -->
            {@render inlineButtons(null)}
          {:else if compact}
            <!-- MORE ANSWERS THAN A ROW HOLDS, OR A MERGE: chosen on the question's own page. -->
            <a class="dc-btn" href={at(card.href)}>{queueWords.choose}</a>
          {:else if phase !== 'asking' && !oneTap}
            <button
              type="button"
              class="dc-btn"
              data-weight={filled}
              data-decide
              data-enter={card.enter !== null && selected !== null ? '' : undefined}
              aria-disabled={kept ? 'true' : undefined}
              onclick={commit}>{pressSaid(card, queueWords.decide, card.ways.find((w) => w.key === selected))}</button
            >
          {/if}
          {@render later(inline)}
        </div>
        <!-- WHAT THE FILLED ANSWER DOES, one line under the row, where its answers each carry one: "File them" says
             what filing does before the press, as its rectangle did. -->
        <!-- THE CARE A HARD ANSWER ASKS FOR, A LINE UNDER THE ROW: on the button it wrapped to two lines at 390. -->
        {#if inline && hardLine}<p class="dc-hard own-dir" id="{uid}-hard"><span class="dc-hard-word">{hardLine}.</span>{#if hardReason}{' '}{hardReason}{/if}</p>{/if}
        {#if inline && !compact && primaryDoes}<p class="dc-does own-dir">{primaryDoes}</p>{/if}
      {/if}
      {#if phase === 'asking' && chosen}
        <form class="qa-reason" onsubmit={submit}>
          <label class="qa-label" for="{uid}-why">{chosen.asks || queueWords.why}</label>
          <div class="qa-line">
            <span class="field field-lg qa-field">
              <input id="{uid}-why" class="field-input qa-input" type="text" autocomplete="off" enterkeyhint="send" required bind:value={reason} bind:this={field} {onkeydown} />
            </span>
            <Button type="submit">{queueWords.send}</Button>
          </div>
        </form>
      {/if}
      {#if fix || bulkFix}<p class="qa-fix" role="status">{fix || bulkFix}</p>{/if}
      <!-- ASK SLASH AND HAND IT OFF, under the answers on Decide itself: Slash explains and compares them, the answer drawn
           under the card, and the send sheet hands the question on (`$lib/send`). Fetched with the first whole card. -->
      {#if drawn && !compact && phase !== 'asking'}
        <!-- ITS ROW HELD WHILE ITS CODE COMES (one 44px row of verbs): it landed under the answers and pushed the cards
             under it down on a phone. -->
        <!-- IN A BOX OF THE CARD'S OWN, so it keeps its place under the answers: Ask Slash and Hand it off are another
             component's, which the card's order rule did not reach, so once loaded they jumped over the answers. -->
        <div class="dc-ask">{#await import('$lib/send/DecideAsk.svelte')}<div class="da-held" aria-hidden="true"></div>{:then { default: DecideAsk }}<DecideAsk id={question.id} title={card.question} />{/await}</div>
      {/if}
    </div>
    {#if side}
      <!-- THE CARD'S SIDE, only where there is something to put in it: on a wide tile a 280px column
           beside the form with why it is asked and what it changes, each under a quiet heading. On a narrow one why
           follows the question and what it changes comes under the buttons. -->
      <div class="dc-side">
        <!-- WHY: under the question on a narrow card, beside it on a wide one, before what it moves. -->
        {#if card.why && !ladder}
          <div class="dc-part dc-part-why" role="group" aria-labelledby="{uid}-why-h">
            <h4 class="dc-h" id="{uid}-why-h">{cardWords.why}</h4>
            <p class="queue-why own-dir">{card.why}</p>
            {#if card.lapses}<p class="dc-lapses own-dir">{card.lapses}</p>{/if}
          </div>
        {/if}
        <!-- WHAT IT CHANGES: what accepting the lead does, the money it writes, what changes from what to what, and the
             whole change one link away. A value where there was none is a phrase ("Set to Friday"); only a value that
             replaces another is struck, with the arrow to what it becomes. -->
        {#if changesSaid}
          <div class="dc-part dc-part-changes" role="group" aria-labelledby="{uid}-changes">
            <h4 class="dc-h own-dir" id="{uid}-changes">{#if card.list}{cardWords.changesIn(card.list)}{:else}{cardWords.changes}{/if}</h4>
            {#if card.does}<p class="dc-does own-dir">{card.does}</p>{/if}
            {#if (card.money && !moneyAbove) || card.lines.length > 0}
              <ul class="dc-moves">
                {#if card.money && !moneyAbove}<li class="dc-money num">{card.money}</li>{/if}
                {#each card.lines as s, i (i)}
                  <li class="dc-shift">
                    {#if s.what}<span class="dc-what">{s.what}</span>{/if}
                    {#if s.said !== null}
                      <span class="own-dir">{s.said}</span>
                    {:else}
                      <span class="dc-before own-dir">{stateWord(s.before)}</span><span class="dc-to"><Icon name="arrow" size="s" /><span class="dc-said">{cardWords.to}</span></span><span class="own-dir">{stateWord(s.after)}</span>
                    {/if}
                  </li>
                {/each}
                <!-- PAST THE THIRD CHANGE, how many more there are and where they are said, in place of nothing. -->
                {#if card.more > 0}<li class="dc-more">{cardWords.more(card.more)}</li>{/if}
              </ul>
            {/if}
            {#if seeLink}<a class="qa-see tap" href={at(card.href)}>{queueWords.seeWhole}</a>{/if}
          </div>
        {:else if seeLink}
          <!-- NOTHING TO SAY UNDER THE HEADING, so no heading: the link to the whole change stands on its own. -->
          <div class="dc-part dc-part-changes"><a class="qa-see tap" href={at(card.href)}>{queueWords.seeWhole}</a></div>
        {/if}
      </div>
    {/if}
  </article>
  {#if lead && !compact}<LeadPreview id={question.id} kind={card.filed} />{/if}
{/if}

<style>
  /* DecideAsk's verbs' height while its code comes. */
  .da-held {
    block-size: var(--btn-h-sm);
  }

  @media (pointer: coarse) {
    .da-held {
      block-size: var(--tap);
    }
  }

  /* THE CARD IS A FORM'S COLUMN: who asked, the question, why, the choices, the buttons, at one steady step. */
  .dc {
    row-gap: var(--sp-3);
  }

  /* ── one column: the form and the side let go of, their parts in the order a question is read ───────────────

     The skin lays every part of a card across both its tracks (`.queue-card > *`); the parts here are the wrappers'
     children, so they say it themselves. Who asked leads and the question follows it, as they are written; why comes
     next, then the answers and the buttons, and what it changes is under them all. */
  .dc-main,
  .dc-side,
  .dc-part {
    display: contents;
  }

  .dc-main > *,
  .dc-side > *,
  .dc-part > * {
    grid-column: 1 / -1;
  }

  /* A part let go of hands its order to its own children, which are the grid's items now: why, written after the form,
     is read before the form's answers. */
  .dc-main > :not(.queue-by, .queue-question, .dc-read, .dc-meta) {
    order: 1;
  }

  .dc-part-changes > * {
    order: 2;
  }

  /* ASK SLASH AND HAND IT OFF COME LAST, after the answers and what they change: they are the card's other ways on. */
  .dc-main > .dc-ask {
    order: 3;
  }

  /* THE BULK BOX SITS AT THE END OF THE QUESTION'S FIRST LINE, since the question leads the card; it sat at the end
     of the by-line while the by-line was the card's first. */
  .dc:has(> .qa-select) > .dc-main > .queue-question {
    grid-row: 1;
    grid-column: 1;
  }

  .dc > .qa-select {
    grid-row: 1;
    grid-column: 2;
  }

  /* A QUIET HEADING OVER EACH PART OF THE SIDE: said to a screen reader in one column, where why sits where a card
     always had it and needs no name, and drawn only over what it changes, under the buttons. */
  .dc-h {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta);
  }

  .dc-part-changes > .dc-h {
    position: static;
    inline-size: auto;
    block-size: auto;
    overflow: visible;
    clip-path: none;
    margin-block-start: var(--sp-2);
    margin-block-end: calc(var(--sp-2) * -1);
  }

  /* WHO ASKED AND WHEN ARE ALWAYS THERE: the skin's by-line waits for a hover on its card before the
     time shows, which it reads off a by-line that is the card's own child. This one is the form's, so it says it here. */
  .queue-by > :is(.queue-when, .dc-from) {
    opacity: 1;
    transition: none;
  }

  /* ── two columns, on a wide tile with something for the side: the form, and beside it a 280px side ───────────

     The form takes what the side leaves, and the side reads down its own column under its quiet headings, a hairline
     at its start, with why it is asked and what it changes. A card with neither keeps one column at any width: a
     column that held only who asked and when was 280px of a tile for five words. The host's slot is the container
     (`QueueAnswer.svelte`'s `.qa`, Today's row, the palette's sheet), so a narrow slot stays one column whatever the
     window. */
  @container (inline-size >= 52rem) {
    .dc[data-side]:not([data-compact]) {
      grid-template-columns: minmax(0, 1fr) 280px;
      column-gap: var(--sp-6);
      align-items: start;
    }

    .dc[data-side]:not([data-compact]) > .dc-main {
      display: grid;
      grid-row: 1;
      grid-column: 1;
      align-content: start;
      row-gap: var(--sp-3);
    }

    .dc[data-side]:not([data-compact]) > .dc-side {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
      grid-row: 1;
      grid-column: 2;
      min-inline-size: 0;
      padding-inline-start: var(--sp-5);
      border-inline-start: 1px solid var(--sep, var(--rule));
    }

    .dc[data-side]:not([data-compact]) .dc-part {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      min-inline-size: 0;
    }

    .dc[data-side]:not([data-compact]) .dc-h {
      position: static;
      inline-size: auto;
      block-size: auto;
      margin: 0;
      overflow: visible;
      clip-path: none;
    }

    /* The bulk box keeps the end of the side's first line, over the short heading there, and lifted over the side so a
       press reaches it. A row of its own would share the form's height with the side and push the side down. */
    .dc[data-side]:not([data-compact]) > .qa-select {
      position: relative;
      z-index: var(--z-raise);
      justify-self: end;
      align-self: start;
    }

    /* The link to the whole change keeps its own width in the side's column. */
    .dc[data-side]:not([data-compact]) .dc-part > .qa-see {
      align-self: start;
    }

    /* Why, in the side, is the column's measure and the body's size. */
    .dc[data-side]:not([data-compact]) .dc-part-why > .queue-why {
      max-inline-size: none;
    }
  }

  /* WHO ASKED AND WHEN, THE META LINE OVER THE QUESTION: 13 in the muted ink, the name a step darker. A face sits on the
     line's middle, not its baseline, or the disc rides above the words. */
  .queue-by {
    align-items: center;
    flex-wrap: wrap;
    column-gap: var(--sp-2);
    font-size: var(--fs-meta);
  }

  /* WHO ASKED WRAPS TO TWO LINES, THEN AN ELLIPSIS (leftovers 2 Nov, 4): a rule's name is a sentence ("Ask whether to keep
     a service before it renews"), and the skin's one-line cut at 28ch stopped it at "before it …" on a 1190px card. Its
     whole name is on the question's own page and in the title a pointer reads. The time keeps its place after it. */
  .queue-by > .queue-who {
    display: -webkit-box;
    max-inline-size: min(100%, 60ch);
    overflow: hidden;
    white-space: normal;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* THE QUESTION, 17 AND SEMIBOLD, close under who asked it: the lead and every card alike, on a laptop and a phone. */
  .dc-main > .queue-question {
    margin-block-start: calc(var(--sp-1) * -1);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: var(--lead-head);
    /* NO WORD LEFT ALONE ON THE LAST LINE (UI pass 1 Nov): at 390 "…for £14. Keep" broke before a lone "it?". */
    text-wrap: pretty;
  }

  /* COMPACT, A QUESTION IS ITS LINE AND ITS BUTTONS, a step apart, with no by-line above it to sit close under. */
  .dc[data-compact] {
    row-gap: var(--sp-2);
  }

  .dc[data-compact] > .dc-main > .queue-question {
    margin-block-start: 0;
  }

  .dc[data-compact] > .dc-main > .dc-actions {
    margin-block-start: var(--sp-1);
  }

  /* ON A PHONE the question is 16 and not a heading: a card is its question, its answers and one line of care, not mostly title. */
  @media (width < 600px) {
    .dc-main > .queue-question {
      font-size: var(--fs-body);
      line-height: var(--lead-ui);
    }

    .dc-main > .dc-hard,
    .dc-main > .dc-does {
      margin-block-start: calc(var(--sp-1) * -1);
    }
  }

  /* A QUESTION IS AT MOST TWO LINES UNTIL "READ ALL": the rest is cut at a word with an ellipsis. */
  .dc-main > .queue-question[data-clamp] {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  /* "READ ALL", a quiet ink link right under the cut question. */
  /* 24px TALL AT THE LEAST (audit 31 Oct i, AI5): its words alone were a 49 by 20 target. */
  .dc-read {
    display: inline-flex;
    align-items: center;
    min-block-size: 24px;
    justify-self: start;
    margin-block-start: calc(var(--sp-2) * -1);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 30%, transparent);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  /* THE INFO MARK AT THE END OF WHO ASKED: the ladder's rule waits behind it, quiet until pressed. */
  .dc-info {
    display: inline-grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    margin-inline-start: calc(var(--sp-1) * -1);
    padding: 0;
    border: 0;
    border-radius: var(--r-pill, 999px);
    background: none;
    color: var(--ink-3);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .dc-info:hover {
      background: var(--row-wash);
    }
  }

  .dc-info:hover,
  .dc-info[aria-expanded='true'] {
    color: var(--ink);
  }

  @media (pointer: coarse) {
    .dc-info,
    .dc-read {
      min-inline-size: var(--tap);
      min-block-size: var(--tap);
    }
  }

  .dc-meta {
    margin: calc(var(--sp-1) * -1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* ON THE LEAD THE SUGGESTION IS SAID ON ITS BUTTON, "Accept, suggested", in the button's own ink. */
  .dc-rec-in {
    font-weight: 400;
    opacity: 0.85;
  }

  .dc-hard-word {
    color: var(--ink);
    font-weight: var(--fw-medium);
  }

  /* THE CARE A HARD ANSWER ASKS FOR, quiet, under the row of answers. */
  .dc-hard {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  /* WHAT ACCEPTING THE LEAD DOES, one plain line in the second ink, with no rule down its side. */
  .dc-does {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE BUTTONS SIT A LITTLE CLEAR OF THE LAST CHOICE, as a form's do. */
  .dc-main > .dc-actions {
    margin-block-start: var(--sp-1);
  }

  /* THE APP AND THE RUN, after the name and quieter than it, each giving way in an ellipsis before the time does. */
  .dc-from {
    min-inline-size: 0;
    max-inline-size: 24ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dc-from::before {
    content: '·';
    margin-inline-end: var(--sp-2);
    color: var(--ink-3);
  }

  /* The question as the door to its own page, where the host has no other: ink, underlined only under the pointer. */
  .dc-open {
    color: inherit;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .dc-open:hover {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  /* WHY IS READ, NOT SKIMMED: body size and air, in the second ink, at a measure. */
  .dc-part-why > .queue-why {
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* WHAT IT MOVES, a short list without a box: the amount in figures, then each change from what to what. */
  .dc-moves {
    display: grid;
    gap: var(--sp-1);
    max-inline-size: var(--measure);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .dc-money {
    color: var(--ink);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .dc-money-above {
    max-inline-size: var(--measure);
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .dc-shift {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    min-inline-size: 0;
  }

  .dc-what {
    color: var(--ink-3);
  }

  /* HOW MANY MORE CHANGES WAIT ON THE QUESTION'S PAGE: the quiet ink of a field's name, under the last line. */
  .dc-more {
    color: var(--ink-3);
  }

  /* THE DAY IT IS TAKEN BACK, under why: quiet, and at the body's size, since a person reads it whole. */
  .dc-lapses {
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .dc-what::first-letter {
    text-transform: uppercase;
  }

  .dc-before {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--ink-2) 50%, transparent);
  }

  .dc-to {
    display: inline-flex;
    color: var(--ink-3);
  }

  /* "to", for a screen reader: the arrow says it to the eye. */
  .dc-said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* NO KEY CAPS UNDER A THUMB: there is no keyboard to press them with. */
  @media (pointer: coarse) {
    .dc-key {
      display: none;
    }
  }

  /* THE BULK BOX IS A SECONDARY CONTROL, drawn on hover or focus of its card, and on every card once one
     is chosen so the choice can be widened; under a thumb, where nothing hovers, it is always there. */
  @media (hover: hover) and (pointer: fine) {
    .qa-select {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    .queue-card:hover > .qa-select,
    .queue-card:focus-within > .qa-select,
    :global([data-picking]) .qa-select,
    :global([data-row-cursor]) .qa-select,
    .qa-select[aria-checked='true'] {
      opacity: 1;
    }
  }

  /* A CARD CHOSEN FOR A BULK ANSWER keeps an ink edge, a shape and not a shade. */
  /* PICKED FOR ANSWERING TOGETHER: the chosen tint with the accent's edge (ops: a selected row is the accent, never a
     darker grey). */
  .queue-card[data-selected] {
    background: var(--chosen);
    box-shadow: inset 0 0 0 1.5px var(--on);
  }

  /* HOW MANY THINGS A JOINED QUESTION CHANGES, quiet beside its words. Held to the question's last word by a no-break
     space, so "· 2 changes" never wraps onto a line of its own (VERIFY P5). */
  .qa-joined {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 400;
    white-space: nowrap;
  }

  /* QUIET: the day a put-off question comes back is a note under it, in the second ink and the small size. */
  .qa-later {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .qa-see {
    justify-self: start;
    padding: 0;
    background: none;
    border: 0;
    font: inherit;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 35%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .qa-reason {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-1);
  }

  .qa-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
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
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* ONE LINE, QUIET (today F7): what the answer did, said with its object, on the second ground at the control radius,
     with Undo while the answer waits. IT IS THERE IN THE FRAME THE CARD GOES: it faded in from nothing, and for those
     frames the answer was a hole in the page (fluid F12); the room it settles into is `settle.ts`'s. */
  .qa-done {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
    align-items: center;
    min-block-size: var(--ctl-h);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .qa-done > :global(.icon) {
    flex: none;
    color: var(--good);
  }

  /* ── a money row (today F4) ────────────────────────────────────────────────
     The well over two lines, what it is with the amount at the end, how late in red under it, the answers under that,
     and who asked at the foot. Every part names its own cell, so the skin's "every part across the card" does not hold. */
  .dc-row {
    /* The row spans its card, so the amount sits at the card's right edge, not at the end of a reading measure. */
    max-inline-size: none;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
    align-items: start;
  }

  .dc-row > * {
    grid-column: 2 / -1;
  }

  .dr-well {
    grid-row: 1 / span 2;
    grid-column: 1;
    align-self: center;
    display: flex;
  }

  .dc-row > .dr-title {
    grid-row: 1;
    grid-column: 2;
    margin: 0;
    text-wrap: pretty;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(22px * var(--type, 1));
  }

  .dr-amount {
    grid-row: 1;
    grid-column: 3;
    justify-self: end;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: var(--lead-head);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .dr-meta {
    grid-row: 2;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .dr-late {
    color: var(--red);
    font-weight: 600;
  }

  /* A RENEWAL IS NOT LATE (2 Nov): its when is in the second ink, and amber within the week it renews, never red. */
  .dr-late[data-kind='renews'] {
    color: var(--ink-2);
    font-weight: 500;
  }

  .dr-late[data-kind='renews'][data-soon] {
    color: var(--warn);
    font-weight: 600;
  }

  .dc-row > .dr-actions {
    margin-block-start: var(--sp-2);
  }

  /* THE FOOT IS A BY-LINE LIKE ANY CARD'S: the face, the name (a rule's runs to two lines at most), how long ago. */
  .dr-asked {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .dr-asked > :global(.face) {
    flex: none;
  }

  .dr-who {
    display: -webkit-box;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-2);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .dr-when {
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  .dc-row > .dr-select {
    grid-row: 3;
    grid-column: 3;
    justify-self: end;
    align-self: center;
  }

  /* ON A WIDE TILE OUTSIDE NEEDS YOU the answers sit at the end of the second line, under the amount, so a money row is
     two lines tall and the first screen holds more of them. */
  @container (inline-size >= 34rem) {
    .dc-row[data-compact] > .dr-actions {
      grid-row: 2;
      grid-column: 3;
      justify-self: end;
      margin: 0;
    }

    .dc-row[data-compact] > .dr-meta {
      grid-column: 2;
      align-self: center;
    }
  }

  /* ASK ME LATER (today F11): the clock and its words, quiet, at the end of the row of answers; 44 tall under a thumb.
     RIGHT AFTER THE LAST ANSWER, never pushed to the far edge, where it sat alone on a row of its own. */
  .dc-actions > :global(.dc-later) {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding-inline: var(--sp-2);
    color: var(--ink-2);
  }

  /* THE LINE OF WHAT THE FILLED ANSWER DOES, quiet, under the row. */
  .dc-does {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  @media (pointer: coarse) {
    .dc-actions > :global(.dc-later) {
      min-block-size: var(--btn-h);
    }
  }

  /* WHERE TWO ANSWERS SHARE A PHONE'S LINE WITH IT (`form.css`, 400 to 600px), it keeps its square and its words go to
     its name alone, so the answers keep the room they need. */
  @media (width < 600px) {
    .dc-actions[data-inline] > :global(.dc-later) {
      inline-size: auto;
    }
  }

  /* A PICTURE OPTION AT A SWATCH'S SIZE (the skin's `.queue-swatch`, 20px), so a choice led by a picture stands where one
     led by a colour does. The skin's tile size is for the renderer's own queue, where the picture is the tile. */
  .dc-choice-file {
    flex: none;
    inline-size: 20px;
  }

  .qa-done-words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* UNDO IS THE LINE'S ONE CONTROL while the answer waits, in the ink a person presses. */
  .qa-undo {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  @media (pointer: coarse) {
    .qa-see {
      min-block-size: var(--tap);
    }
  }

  /* ON A NARROW SLOT Send takes the line's whole width under the field, so it is never pushed off the edge. */
  @container (inline-size < 30rem) {
    .qa-line > :global(.btn) {
      flex: 1 1 100%;
    }
  }
</style>
