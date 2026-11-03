<!--
  The first run: a conversation on the left, and the BrainDog building beside it.

  A CONVERSATION, NOT A FIELD (1 Nov, the owner: "i need the who are you to be a conversation with questions"). BrainDog
  says hello and asks "What do you do?", then the follow-ups that matter for this person's build, one at a time, chosen
  from what they said (`$lib/start/chat.ts`, drawn by `Chat.svelte`): what they work on, the money side, the currency
  (guessed from this device or their words, and asked to confirm; asked outright when they named two), who they work
  with, their AI tools, what to keep first. A topic already answered is skipped; three to five questions as a rule, six
  at most, each one skippable, and "That's enough, build it" at any time.

  EACH ANSWER IS ONE QUICK MODEL TURN (`proposeTurn`, `quick` at the door, 1 Nov lane onboard-speed): what the answers
  point at and the next question, about fifty tokens on a fast model, about two seconds, six at most, laid over what the
  conversation's readings said before it (`mergeReplies`). It waits `QUICK_MS` at most: the rules read it at once after
  that, and the turn lands on the build when it comes, its question kept for the next answer. THE WHOLE READING (names,
  entries, a summary, a draft) is asked in the background after the second answer and again at the end (`readWhole`),
  once for each conversation, and lands on the build when it comes; Make it mine never waits on it. Where there is no
  model, or the reads are spent, the rules read every answer.

  BESIDE IT, YOUR BRAINDOG FORMS (`Forming.svelte`): Today, then each part as an answer turns it on, each saying where
  in the answers it came from, each one press from being taken out. At the end the summary stands where the field was
  (what it is set up as, the money's currency, what it makes, each with Change) over one "Make it mine".

  OR POINT AT AN EXPORT. A CSV or JSON file from another app, dropped on the screen or picked, is read on this device
  (`lib/start/export.ts`); the model reads its first entries and says which list it goes into and which column fills
  what, and the pages below are drawn over the file's own entries. A file no list holds becomes a list of its own. A
  zip, as Notion exports a workspace, is one tile for each table inside, each mapped and left out on its own, and the
  pages of notes it held are counted and said once under them, never written.

  A BUSINESS NO USE CASE FITS IS DRAFTED FOR, where a model answers. Slash drafts lists,
  figures and pages made for what was said (`slashDraft`), which files nothing; they are drawn over its sample rows, and
  the same one press files and accepts them. The sample rows are never written.

  THEN ONE PRESS. "Make it mine" (or Ctrl Enter from anywhere) writes it all through the install path Browse uses
  (`accept.ts`), and the screen becomes its end (`Made.svelte`): one agent and one source, each saying what it would
  find here, a passkey for a person with none, then Home. `/start#made` opens on that end directly, which is where
  sign-up lands once it has written what was said there into the new record. There is no one-row form: a list with
  nothing in it draws its own empty state, and a record with no lists is sent here by the root layout.

  THE WHOLE WINDOW (`Frame.svelte`), as sign-up has it: the conversation and the build share it from 900px.

  NO SKIP, because a record with no lists has no other screen to show (19 §6). A colleague who holds lists and not the
  record, and an owner whose record is already made, are told so before the question, with the way back.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { standsOn, USE_CASES, type UseCase } from '@braindog/seed/usecases';
  import { dayOf } from '@braindog/seed/usecases/install';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { apiBase, at } from '$lib/at.ts';
  import { covered, typing } from '$lib/a11y/keys.svelte.ts';
  import { silenced } from '$lib/a11y/chars.ts';
  import { methods } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import * as pref from '$lib/pref.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { onNoRecord } from '$lib/record/boot-live.ts';
  import { landing } from '$lib/record/landing.ts';
  import { INSTALL_ORDER, LEANS_ON } from '$lib/shape.ts';
  import { byRules, draftChange, type Drafted, type SlashClient } from '$lib/record/slash.ts';
  import {
    askReply,
    becameShown,
    draftBrief,
    filledBy,
    mergeReplies,
    outsideCatalogue,
    propose,
    proposalOf,
    proposeFirst,
    proposeTurn,
    railPlaces,
    type Proposal,
  } from '$lib/start/propose.ts';
  import type { SetupReply } from '$lib/start/ask.ts';
  import { slashAsks } from '$lib/start/ask.ts';
  import { MADE_ADDONS, heardOf, offerOf, readCatalogueOffer, tradeAddons, tradesKept, type CatalogueOffer, type TradeOffer } from '$lib/start/offer.ts';
  import { BYTES_MOST, drawnWith, entriesOf, EXPORTS_MOST, leftSaid, mapExport, newListDeclarations, ownList, readExports, type Export, type Mapping } from '$lib/start/export.ts';
  import { allLists, listById } from '$lib/start/lists.ts';
  import { titleOf } from '$lib/title.ts';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { PEOPLE } from '$lib/who.ts';
  import { accept, pressKey, type NotMade, type SetupRow } from './accept.ts';
  import {
    added,
    browserCurrencyEnv,
    casePart,
    currencyChoices,
    iconOfBecame,
    joinTurns,
    making,
    makingStates,
    marksIn,
    missingIn,
    partsOf,
    statusOf,
    stepsOf,
    watchHeld,
    words,
    zoneCurrency,
    type CurrencyEnv,
    type Held,
    type MakingPart,
    type Refused,
    type Part as PartOf,
    type Said,
  } from './building.ts';
  import { caseOf, changesAsked, draftAsked, keepsCurrency, pagesOf, reminds, words as drawing } from './preview.ts';
  import Currency from './Currency.svelte';
  import FromFile from './FromFile.svelte';
  import PagesPreview from './PagesPreview.svelte';
  import Part from './Part.svelte';
  import Remind from './Remind.svelte';
  import NoRecord from './NoRecord.svelte';
  import Frame from './Frame.svelte';
  import Made from './Made.svelte';
  import { assemble } from '$lib/start/assembling.ts';
  import { MADE_SAID, saidMade, saidMadeOf, type SaidMade } from '$lib/start/made.ts';
  import Making from './Making.svelte';
  import { arrive } from '$lib/motion';
  import Chat from './Chat.svelte';
  import Forming from './Forming.svelte';
  import FormingStrip from './FormingStrip.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import {
    ackOf,
    toolsHeldBack,
    agentsNamed,
    askedLines,
    atLeast,
    caseTitle,
    chatWords,
    currencyUnclear,
    draftsSaid,
    entriesSaid,
    firstAsk,
    firstTurnsOn,
    namedCurrency,
    nextAsk,
    QUICK_MS,
    READS_MOST,
    saidOf,
    todosOf,
    toolRows,
    TURNS_ON,
    valueOf,
    withName,
    NO_NAME,
    within,
    type ChatAsk,
    type ChatTurn,
  } from '$lib/start/chat.ts';
  import type { ModelAsk } from '$lib/signup.ts';

  /**
   * A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD IS NEVER ASKED TO SET ONE UP. A record's shape is its owner's, and
   * every install this screen makes would be refused for them; they are told whose it is and sent to the lists they
   * came for (`landing.ts`).
   */
  const colleague = $derived(Boolean(page.data.live) && (page.data as unknown as Shell).me.lists != null);

  /**
   * SIGNED IN AND ON NO RECORD: a proved mailbox that has not paid yet, or a person whose only record closed.
   * `/` sends that session here, and the `boot` under it answered 403, so the screen asks for a name and a payment
   * instead of drawing an empty record that says nothing is here.
   */
  const noRecord = $derived(!page.data.live && onNoRecord((page.data as unknown as Shell).refused));
  const notTheirs = $derived(colleague ? landing(page.data as unknown as Shell) : null);

  /**
   * WHETHER THE RECORD BEHIND THIS SCREEN IS ALREADY MADE. The root layout spares `/start` from the redirect that sends
   * an empty record here, which is what lets somebody open it again on a record with pages and lists; they are told so
   * before the question, with the door back.
   */
  /* BY THE LISTS A PERSON OR A PACK DECLARED, as the root layout counts them (1 Nov): a record the operator door made
     holds a page or the kernel's own lists and nothing of his, and counting those sent it back and forth between here and
     a bare Today. */
  const alreadyMade = $derived(
    Boolean(page.data.live) && ((page.data as unknown as Shell).lists ?? []).some((l) => l.id !== 'session' && (l as { kernel?: true }).kernel !== true),
  );

  /**
   * THE END OF THE FIRST RUN: the BrainDog is made, and `Made` offers an agent and a source before Home. Set by a "Make it
   * mine" that wrote everything, and by arriving at `#made`, which sign-up opens once it wrote the build itself. The
   * fragment is wiped as it is read, so a reload is the question again, with the "already made" note over it.
   */
  let made = $state(false);
  let madeModules = $state.raw<string[] | null>(null);
  /* THE PLACES MADE, by name, which the end says first. */
  let madePlaces = $state.raw<string[] | null>(null);
  /* THE ADD-ONS A TRADE SAID NAMES, offered by name at the end and never installed (AH8, FB5). */
  let madeAddons = $state.raw<TradeOffer[]>([]);
  /* THE WORDS AND WHAT THEY BUILT (1 Nov), which the end has the model read once more for drafts on Today. */
  let madeSaid = $state.raw<SaidMade | null>(null);
  /* `/start` IS A BRAINDOG ASSEMBLING for as long as it is open (`assembling.ts`). */
  onMount(() => assemble());
  onMount(() => {
    /* A SET-UP BRAINDOG GOES TO TODAY (first hour audit, AH31): its address back at /start drew sign-up again over
       "This BrainDog is set up". Only the end of the run (`#made`), an agent's set-up (`?agent=1`) and "Or bring in a
       file" (`?more=1`, `made.ts`) open the question on a made record. */
    if (location.hash !== '#made' && alreadyMade && !colleague && !page.url.searchParams.has('agent') && !page.url.searchParams.has('more')) {
      void goto(at('/'), { replaceState: true });
      return;
    }
    if (location.hash !== '#made') return;
    history.replaceState(history.state, '', location.pathname + location.search);
    if (page.data.live) made = true;
    /* AND THE PLACES SIGN-UP MADE, which it left in this tab, read once and let go. */
    try {
      const kept: unknown = JSON.parse(globalThis.sessionStorage?.getItem('braindog.made.places') ?? 'null');
      globalThis.sessionStorage?.removeItem('braindog.made.places');
      if (Array.isArray(kept) && kept.every((x) => typeof x === 'string')) madePlaces = kept;
    } catch {
      /* Nothing kept: the end says only that it is made. */
    }
    try {
      madeAddons = tradesKept(globalThis.sessionStorage?.getItem(MADE_ADDONS) ?? null);
      globalThis.sessionStorage?.removeItem(MADE_ADDONS);
    } catch {
      /* Storage off: no add-on is offered. */
    }
    try {
      madeSaid = saidMadeOf(globalThis.sessionStorage?.getItem(MADE_SAID) ?? null);
      globalThis.sessionStorage?.removeItem(MADE_SAID);
    } catch {
      /* Storage off: the end reads nothing more. */
    }
  });

  /* WHERE AND HOW THE SENTENCE WAS TYPED, for a date such as "on the 1st", for the currency names and for the currency
     worth suggesting. */
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  const zone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  })();
  /* THE CURRENCY THIS DEVICE'S ZONE KEEPS, read in with the words, so a shop in Cairo keeps EGP without being asked. */
  const deviceCurrency = zoneCurrency(zone);

  /* THE CATALOGUE'S USE CASES, read once as the page opens: the rules listen for their words (`heardOf`) and the model may
     choose them (`offerOf`). Until it answers, or when there is none, only what this build ships is offered. */
  let cat = $state.raw<CatalogueOffer | null>(null);
  onMount(() => {
    void readCatalogueOffer().then((c) => (cat = c));
  });

  /* ── the prompt ─────────────────────────────────────────────────────────── */

  /* The sentence stays in memory and never in the address, so it is nowhere a link or a history entry can carry it. */
  let sentence = $state('');


  /**
   * WHAT IT HEARS WHILE THE SENTENCE IS TYPED, read a beat after the last key so a fast typist is not slowed. It draws
   * the parts lighting up beside the field and the phrases under it, and decides nothing: the press reads it for real.
   */
  let live = $state.raw<Proposal | null>(null);
  $effect(() => {
    const said = sentence;
    if (proposal !== null) return;
    if (said.trim() === '') {
      live = null;
      return;
    }
    const wait = setTimeout(() => {
      live = propose(said, { zone, locale, currency: deviceCurrency, catalogue: heardOf(cat), offer: offerOf(cat) });
    }, 140);
    return () => clearTimeout(wait);
  });

  /* ── the proposal ───────────────────────────────────────────────────────── */

  let proposal = $state<Proposal | null>(null);
  /** The use case chosen, which starts as the one proposed. */
  let chosen = $state<string | null>(null);
  /** The modules the person left on, beside the ones something chosen needs. */
  let kept = $state<string[]>([]);
  let currency = $state<string | null>(null);

  /**
   * WHAT THE PERSON DECIDED BY HAND OUTLIVES A NEW READING. Telling it more reads the whole of what was said again, and
   * a part they turned on or off, or a use case they picked, stays as they left it rather than snapping back.
   */
  let onByHand = $state.raw<Set<string>>(new Set());
  let offByHand = $state.raw<Set<string>>(new Set());
  let caseByHand = $state(false);
  /** The use case the first answer read, kept through later readings without saying the person chose it. */
  let caseKept = false;


  /**
   * Take a reading, keeping what the person decided by hand. `merge`: a reading that landed in the background (the whole
   * reading, a late turn) is laid over what stands and takes nothing away, so the build and its count of pages never
   * shrink under the person while they talk (1 Nov, a live run: "Its pages" went from 16 to 8 as the whole reading landed).
   */
  function take(p: Proposal, merge = false) {
    const handCurrency = currencyByHand || (currency !== null && currency !== (proposal?.currency ?? null));
    /* A NAME ANSWERED IN THE CONVERSATION STANDS OVER EVERY LATER READING. */
    if (nameAnswer !== null) p = withName(p, nameAnswer);
    if (merge && proposal !== null) {
      const was = proposal;
      /* EVERY ENTRY A READING NAMED STANDS (1 Nov, a live run: the whole reading landed with its own entries and the tool
         and the clients the turns had kept were gone by Make it mine): the newer reading's first, then each earlier one
         it does not name (`sameEntry`). */
      p = { ...p, rows: unionRows(p.rows, was.rows), heard: p.heard.length > 0 ? p.heard : was.heard, ...(p.names ? {} : was.names ? { names: was.names } : {}) };
    }
    /* THE TOOLS THEY NAMED ARE KEPT IN AGENTS' TOOLS, whichever reading stands and whatever it read (`toolRows`): the
       tools question turns Agents on by itself (`TURNS_ON`), so a reading that left Agents out still keeps them. */
    if (toolsSaid.length > 0) p = { ...p, rows: unionRows(p.rows, toolsSaid) };
    const before = merge ? kept : [];
    proposal = p;
    owed = undefined;
    if (!caseByHand && !caseKept) chosen = p.usecase;
    kept = [...new Set([...before, ...p.modules.filter((id) => !offByHand.has(id)), ...onByHand])];
    /* A CURRENCY TYPED IS THE ANSWER; one chosen by hand stands until a later turn types one. */
    currency = handCurrency && currency !== null ? currency : (namedCurrency(sentence, deviceOf()) ?? p.currency ?? null);
    failed = null;
    draft = null;
    drafting = false;
    drafts += 1;
    /* A FILE ALONE, WITH NOTHING SAID, IS NOT A BUSINESS TO DRAFT FOR: its own list is what it makes. */
    /* ONLY ONCE THE TALK IS DONE: a draft is a model ask of its own, and the conversation asks one per answer already. */
    if (talkDone) draftIfOutside();
  }

  /** Two entries are one where they name the same thing in one list, or the same somebody in People's two lists. */
  const sameEntry = (a: { register: string; fields: Record<string, unknown> }, b: { register: string; fields: Record<string, unknown> }): boolean => {
    const t = (r: typeof a) => String(r.fields['name'] ?? r.fields['what'] ?? r.fields['title'] ?? '').trim().toLowerCase();
    const who = (r: typeof a) => r.register === 'people' || r.register === 'organisations';
    return t(a) !== '' && t(a) === t(b) && (a.register === b.register || (who(a) && who(b)));
  };
  /** `first`'s entries, then each of `then`'s that none of them names. A `party` between them is kept only within `first`. */
  function unionRows<R extends { register: string; fields: Record<string, unknown>; party?: number }>(first: readonly R[], then: readonly R[]): R[] {
    const out = [...first];
    for (const r of then) {
      if (out.some((x) => sameEntry(x, r))) continue;
      const { party: _party, ...rest } = r;
      out.push(rest as R);
    }
    return out;
  }

  /** The entries without the things to do, each `party` pointed again at its entry's new place. */
  function withoutTasks<R extends { register: string; party?: number }>(rows: readonly R[]): R[] {
    const place = new Map<number, number>();
    const out: R[] = [];
    for (const [i, r] of rows.entries()) {
      if (r.register === 'tasks') continue;
      place.set(i, out.length);
      out.push(r);
    }
    return out.map((r) => {
      if (r.party === undefined) return r;
      const to = place.get(r.party);
      const { party: _p, ...rest } = r;
      return (to === undefined ? rest : { ...rest, party: to }) as R;
    });
  }

  function draftIfOutside() {
    const p = proposal;
    if (p === null) return;
    const brief = draftBrief(p, sentence).trim();
    if (model && outsideCatalogue(p) && brief !== '' && draft === null && !drafting) void draftFor(brief);
  }

  /* ── the conversation ───────────────────────────────────────────────────── */

  /** The questions asked and answered, and the one being asked now (`$lib/start/chat.ts`). */
  let chatTurns = $state.raw<ChatTurn[]>([]);
  let asking = $state.raw<ChatAsk | null>(firstAsk());
  /** The talk is over: the summary and Make it mine stand where the field was. */
  let talkDone = $state(false);
  /** The whole build as a sheet, opened from the phone's strip at the top of the talk. */
  let formingOpen = $state(false);
  /** A name answered in the conversation, laid over every reading (`withName`). */
  let nameAnswer = $state<string | null>(null);
  /**
   * THE NAME THIS BRAINDOG ALREADY KNOWS FOR THEM (1 Nov, a live run asked "And what should I call you?" of a record made
   * for Layla Hassan): `boot`'s own name for the reader, on a record provisioned for them or a person signed in. Then the
   * name is never asked.
   */
  const knownName = $derived(page.data.live ? ((page.data as unknown as Shell).me?.name ?? '').trim() || null : null);
  /** The tools they named that are not AI apps, kept in Agents' Tools (`toolRows`). */
  let toolsSaid = $state.raw<{ register: string; fields: Record<string, unknown> }[]>([]);
  /** The AI apps they named that BrainDog knows as agents, kept as agents not yet connected (`agentsNamed`). */
  let agentsSaid = $state.raw<{ kind: string; name: string }[]>([]);
  /** A currency answered in the conversation, which no reading replaces. */
  let currencyByHand = $state(false);
  /** The model reads this conversation has spent, `READS_MOST` at most; the rules read after that. */
  let modelReads = 0;
  /** A model's question that came after the rules had already asked: offered for the next turn, if still open. */
  let lateAsk: ModelAsk | null = null;
  /**
   * WHAT THE CONVERSATION'S MODEL READINGS HAVE SAID SO FAR, each turn and whole reading laid on as it lands
   * (`mergeReplies`): the next turn's reading is drawn over it, so a part one answer turned on is not lost by the next.
   */
  let modelSaid: SetupReply | null = null;

  const readCtx = () => ({ zone, locale, currency: deviceCurrency, catalogue: heardOf(cat), offer: offerOf(cat) });

  /**
   * ONE ANSWER, READ: one quick turn of the model's where there is one and reads are left (`proposeTurn`), for at most
   * `QUICK_MS`; the rules' reading answers at once after that, and the turn lands on the build when it comes (its
   * question kept for the next answer).
   */
  async function readTurn(said: string, asked: string): Promise<Proposal> {
    const ctx = readCtx();
    const ask = door?.setup ?? null;
    if (ask === null || modelReads >= READS_MOST || said.trim() === '') return proposeFirst(said, ctx, null);
    modelReads += 1;
    const read = proposeTurn(said, ctx, ask, asked, modelSaid);
    const quick = await within(read, QUICK_MS);
    if (quick !== null) {
      if (quick.turn !== null) modelSaid = mergeReplies(modelSaid, quick.turn);
      return quick.proposal;
    }
    void read.then(({ turn }) => {
      if (turn === null) return;
      modelSaid = mergeReplies(modelSaid, turn);
      if (busy || made) return;
      /* LATE, IT IS DRAWN OVER THE WORDS AS THEY STAND NOW, which hold the words it read, and laid on what stands. */
      const p = proposalOf(modelSaid, sentence, readCtx());
      take(p, true);
      lateAsk = p.ask ?? null;
    });
    return proposeFirst(said, ctx, null);
  }

  /**
   * THE WHOLE READING, IN THE BACKGROUND: names, entries, a summary and a draft, which a turn never carries, asked of the
   * included model (`setup`) after the second answer and again when the talk ends, once for each conversation (`wholes`
   * by its words and questions). It lands on the build when it comes, keeping the question being asked; nobody waits on
   * it, and Make it mine reads what stands.
   */
  const wholes = new Set<string>();
  /** The most whole readings in one conversation: after the second answer, at the end, and once more after more talk. */
  const WHOLE_MOST = 3;
  function readWhole(said: string, asked: string) {
    const ask = wholeDoor?.setup ?? null;
    const key = `${said}\u0000${asked}`;
    if (ask === null || said.trim() === '' || wholes.has(key) || wholes.size >= WHOLE_MOST) return;
    wholes.add(key);
    void askReply(said, readCtx(), ask, asked, false).then((out) => {
      if (!out.ok) return;
      modelSaid = mergeReplies(modelSaid, out.value);
      if (busy || made) return;
      const p = proposalOf(modelSaid, sentence, readCtx());
      take({ ...p, ask: proposal?.ask ?? null }, true);
    });
  }

  /** The names of the places that will be made, for BrainDog's "That adds …" and "What first". */
  const placeNames = (): string[] => madeParts.map((p) => p.name);

  async function answerChat(text: string | null) {
    const q = asking;
    if (q === null || thinking || busy) return;
    const since = Date.now();
    thinking = true;
    asking = null;
    const adds = text === null ? '' : saidOf(q, text);
    const value = text === null ? null : valueOf(q, text);
    const before = placeNames();
    const said = adds === '' ? sentence : joinTurns(sentence, adds);
    const turned: ChatTurn = { ask: q, answer: text, at: Date.now(), ack: null };
    const all = [...chatTurns, turned];
    /* HER ANSWER STAYS WHERE SHE SENT IT, under its question, while BrainDog reads it (1 Nov: both went for the dots and
       came back with the reply). BrainDog's line back is laid on the same turn when the reading lands. */
    chatTurns = all;
    const laid: { currency?: string | null; usecase?: string | null; name?: string | null; entries?: string | null } = {};
    if (q.topic === 'currency' && value !== null) {
      currency = value;
      currencyByHand = true;
      laid.currency = currencyName(value);
      /* A CURRENCY CHOSEN IS MONEY KEPT, where no answer had turned Money on yet. */
      if (money === null && offered.includes('money-core') && !kept.includes('money-core')) {
        onByHand = new Set([...onByHand, 'money-core']);
        offByHand = new Set([...offByHand].filter((x) => x !== 'money-core'));
        kept = [...kept, 'money-core'];
      }
    }
    if (q.topic === 'tools' && text !== null) {
      toolsSaid = toolRows(text);
      agentsSaid = agentsNamed(text);
    }
    const rowsBefore = proposal?.rows ?? [];
    const keptBefore = [...kept];
    if (q.topic === 'closest' && value !== null) {
      caseByHand = true;
      chosen = value;
      laid.usecase = caseOf(value)?.title ?? null;
    }
    if (q.topic === 'name' && value !== null) {
      nameAnswer = value;
      laid.name = value;
    }
    try {
      if (adds !== '' || proposal === null) {
        const mine = ++readings;
        const p = await readTurn(said, askedLines(all));
        if (mine !== readings) return;
        sentence = said;
        /* LAID ON WHAT STANDS: a part an earlier answer turned on is not taken away by a reading of the next one. */
        take(p, true);
        /* THE FIRST ANSWER SETTLES WHAT KIND OF BRAINDOG IT IS: a later answer read with it adds parts, and never swaps
           the use case under the person (a founder's money answer read the whole as a small business). */
        if (q.topic === 'what' && chosen !== null) caseKept = true;
        /* THE PART THE QUESTION WAS ABOUT COMES ON with any answer that is not a no (`TURNS_ON`), kept as by hand. */
        const part = TURNS_ON[q.topic] ?? (text !== null && (q.topic === 'first' || /\bfirst\b/iu.test(q.question)) ? firstTurnsOn(text) : null) ?? undefined;
        if (part !== undefined && adds !== '' && !(q.topic === 'people' && /^just me$/iu.test(text ?? '')) && !kept.includes(part) && offered.includes(part)) {
          onByHand = new Set([...onByHand, part]);
          offByHand = new Set([...offByHand].filter((x) => x !== part));
          kept = [...kept, part];
          /* MONEY COMES ON IN THE CURRENCY THIS DEVICE POINTS AT, which the next question confirms. */
          if (keepsCurrency(part) && currency === null) currency = currencyChoices(sentence, deviceOf()).suggested;
        }
      } else if (nameAnswer !== null && proposal !== null && laid.name) {
        proposal = withName(proposal, nameAnswer);
      }
      if (!currencyByHand) {
        const named = namedCurrency(sentence, deviceOf());
        if (named !== null) currency = named;
      }
      /* A TOOLS ANSWER TURNS ON AGENTS AND NOTHING ELSE (`toolsHeldBack`): Services only for a paid subscription named. */
      if (q.topic === 'tools' && text !== null) {
        const held = toolsHeldBack(keptBefore, kept, text);
        if (held.length > 0) {
          kept = kept.filter((x) => !held.includes(x));
          offByHand = new Set([...offByHand, ...held]);
          onByHand = new Set([...onByHand].filter((x) => !held.includes(x)));
        }
      }
      await tick();
      /* WHAT IT ADDED BY NAME (`entriesSaid`): the clients, people and projects this answer brought, never the tools,
         which "That adds Agents" already says. */
      laid.entries = q.topic === 'tools' ? null : entriesSaid(rowsBefore, proposal?.rows ?? []);
      chatTurns = [...chatTurns.filter((t) => t !== turned), { ...turned, ack: ackOf(q, text, before, placeNames(), all.length, laid) }];
      await atLeast(since);
    } finally {
      thinking = false;
    }
    /* A NAME BRAINDOG COULD NOT BE SURE OF IS ASKED FOR ONCE MORE, plainly (`nameIn`), never made into "<word>'s BrainDog";
       a plain no, or a second answer it still cannot read, leaves the name unasked. */
    const nameAgain = q.topic === 'name' && text !== null && value === null && !NO_NAME.test(text.trim().replace(/[.!]+$/u, '')) && all.filter((t) => t.ask.topic === 'name').length === 1;
    const next = nameAgain ? { topic: 'name' as const, question: chatWords.nameAgain, choices: [], by: 'rules' as const } : nextAsk(where());
    lateAsk = null;
    if (next === null) finishTalk();
    else asking = next;
    /* THE WHOLE READING, ONCE TWO ANSWERS ARE IN AND THE NEXT QUESTION IS ON SCREEN (1 Nov, a live run: the first
       question took eight seconds while two calls ran at once). Never before the second answer, never while a turn is
       being read, and nothing waits on it: by the end it has usually landed. */
    if (next !== null && chatTurns.filter((t) => t.answer !== null).length === 2) wholeSoon();
  }

  /** The whole reading, a beat after the question is drawn, and only while no turn is being read. */
  let wholeTimer: ReturnType<typeof setTimeout> | undefined;
  function wholeSoon() {
    clearTimeout(wholeTimer);
    wholeTimer = setTimeout(() => {
      if (busy || made || talkDone) return;
      if (thinking) return void wholeSoon();
      readWhole(sentence, askedLines(chatTurns));
    }, 400);
  }
  $effect(() => () => clearTimeout(wholeTimer));

  /** What the next question is chosen from (`nextAsk`). */
  function where() {
    const guessed = !currencyByHand && (currencyUnclear(sentence, deviceOf()) || (namedCurrency(sentence, deviceOf()) === null && (proposal?.currencyBy === 'device' || proposal?.currency == null)));
    return {
      said: sentence,
      turns: chatTurns,
      proposal,
      usecase: u?.usecase ?? null,
      placed: !(u === null && modules.length === 0 && using === null && !drafting),
      money: { kept: money !== null, currency, guessed },
      name: proposal?.name ?? nameAnswer ?? knownName,
      env: deviceOf(),
      places: [...new Set(onParts.flatMap((p) => (p.id.startsWith('usecase-') ? p.lists.slice(0, 2) : [p.name])))],
      model: proposal?.ask ?? lateAsk,
    };
  }

  /** The currency's name as this device says it ("US dollars"), or its code. */
  function currencyName(code: string): string {
    try {
      return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  /** The talk ends: the summary and Make it mine, with the press in reach. */
  function finishTalk() {
    asking = null;
    talkDone = true;
    readWhole(sentence, askedLines(chatTurns));
    draftIfOutside();
    void tick().then(() => document.getElementById('summary-h')?.focus());
  }

  /** Whether the summary's currency is open to change. */
  let currencyOpen = $state(false);

  /** A part taken out on the build: a use case is put down, a module turned off (`flip` brings it back). */
  function leaveOut(p: PartOf) {
    if (p.id.startsWith('usecase-')) {
      caseByHand = true;
      if (chosen === p.id.slice('usecase-'.length)) chosen = null;
      return;
    }
    if (kept.includes(p.id)) flip(p.id);
  }

  /** Back to talking from the summary: one open question, typed. */
  function talkMore() {
    talkDone = false;
    asking = nextAsk(where()) ?? { topic: 'things', question: 'What else should it know?', choices: [], by: 'rules' };
  }

  /**
   * WHETHER SLASH IS READING WHAT WAS SAID. The rules' reading stays beside the field meanwhile, and each press is
   * numbered, so an answer that lands after the words were edited again is not drawn under them.
   */
  let thinking = $state(false);
  let readings = 0;

  /** The model's reading, or the rules' where there is no model, for the words as they stand. */
  const readingOf = (said: string): Promise<Proposal> => proposeFirst(said, { zone, locale, currency: deviceCurrency, catalogue: heardOf(cat), offer: offerOf(cat) }, door?.setup ?? null);


  /* ── telling it more ────────────────────────────────────────────────────── */




  /* ── what Slash drafts for a business outside the catalogue ─────────────── */

  /** Whether this host has a model behind Slash, the same fact the page sheet stands on (`ChangePage.svelte`). */
  const model = $derived(page.data.slash === true);
  /** The first run's two asks of Slash (`ask.ts`), `null` where no model is behind it and the rules read everything. */
  const door = $derived(model && typeof location !== 'undefined' ? slashAsks(apiBase()) : null);
  /* THE WHOLE READING'S OWN DOOR, which waits a minute: nobody watches it, and on 1 November it took up to 42 seconds. */
  const wholeDoor = $derived(model && typeof location !== 'undefined' ? slashAsks(apiBase(), undefined, 60_000) : null);
  /** What Slash drafted for the sentence, `null` when it drafted nothing or was not asked. */
  let draft = $state.raw<Drafted | null>(null);
  let drafting = $state(false);
  /* EACH DRAFT IS NUMBERED, so an answer that arrives after the sentence changed is not drawn under the new words. */
  let drafts = 0;

  /**
   * ASK SLASH FOR LISTS AND PAGES MADE FOR THIS BUSINESS (`slashDraft`), which drafts, repairs and draws them and files
   * nothing. An answer from its own rules, which cannot read a sentence, or one with no draft that drew clean, leaves the
   * proposal as the lexicon made it: its modules, or the use cases to choose from.
   */
  async function draftFor(said: string) {
    const mine = drafts;
    drafting = true;
    try {
      const out = await draftChange(createClient({ base: apiBase() }) as unknown as SlashClient, said);
      if (mine !== drafts) return;
      draft = out.ok && !byRules(out.drafted) ? (out.drafted.drafts[0] ?? null) : null;
    } catch {
      if (mine === drafts) draft = null;
    } finally {
      if (mine === drafts) drafting = false;
    }
  }


  const u = $derived(caseOf(chosen));
  /* THE USE CASES BESIDE IT belong to the proposal they were heard with, so choosing another use case leaves them out. */
  /* ONE KIND PER RECORD (onboarding9): no use case stacked beside the one it is made as (`picked` in signup/build.ts). */
  const also = $derived<UseCase[]>([]);
  const cases = $derived(u ? [u, ...also] : []);

  /** Whether the person opened the other use cases beside the one chosen. */
  let picking = $state(false);

  /** Choose a use case from the conversation, or put the one chosen down. */
  function pickCase(id: string) {
    caseByHand = true;
    chosen = chosen === id ? null : id;
  }

  /**
   * WHY A MODULE CANNOT BE TURNED OFF, or `null` when it can: a use case chosen stands on it, or a module kept leans on
   * it (`LEANS_ON`: Money points at the person an invoice is to), so the record would refuse the one without the other.
   */
  function heldBy(id: string): string | null {
    for (const b of brought) if (b.mapping?.module === id) return b.file.file;
    for (const c of cases) if (standsOn(c).includes(id)) return c.title;
    for (const m of kept) if (m !== id && (LEANS_ON[m] ?? []).includes(id)) return moduleName(m);
    return null;
  }

  /**
   * EVERY PACK THE PERSON CAN TURN ON HERE: the modules this build ships, in install order, then any other catalogue pack
   * the sentence was heard asking for or a use case chosen stands on, in the order they came.
   */
  const offered = $derived<string[]>([
    ...new Set([...INSTALL_ORDER, ...(proposal?.modules ?? []), ...kept, ...cases.flatMap((c) => c.modules)]),
  ]);

  /** What is installed: every pack kept, and every one something kept or chosen needs, in install order. */
  const modules = $derived<string[]>(offered.filter((id) => kept.includes(id) || heldBy(id) !== null));

  function flip(id: string) {
    if (heldBy(id) !== null) return;
    const on = !kept.includes(id);
    kept = on ? [...kept, id] : kept.filter((m) => m !== id);
    const drop = (s: Set<string>) => new Set([...s].filter((x) => x !== id));
    onByHand = on ? new Set([...drop(onByHand), id]) : drop(onByHand);
    offByHand = on ? drop(offByHand) : new Set([...drop(offByHand), id]);
    /* THE SWITCH MOVES BETWEEN A TILE AND A ROW, so focus goes with it rather than to the top of the page. */
    void tick().then(() => document.querySelector<HTMLElement>(`[data-keep="${id}"]`)?.focus());
  }

  /* THE CURRENCY IS ASKED ONLY WHEN MONEY IS KEPT AND THE SENTENCE TYPED NONE; the module that keeps it says so. */
  const money = $derived(modules.find(keepsCurrency) ?? null);
  const asksCurrency = $derived(money !== null && proposal !== null && proposal.currency === null);
  const ring = $derived(proposal !== null && reminds(cases, modules));
  const pages = $derived(pagesOf(cases, modules));

  /* ── the files they pointed at ─────────────────────────────────────────── */

  /**
   * ONE TILE FOR EACH FILE BROUGHT: one plain file is one, and a zip is one for each table inside it, eight at most
   * (`readExports`). Each holds the export read, how it maps (`null` while it is being read), and its own handle, so a
   * tile left out does not move the others' state.
   */
  type Brought = { key: number; file: Export; mapping: Mapping | null };
  let brought = $state.raw<Brought[]>([]);
  /** What the file held and left out, said once under the tiles ("14 pages of notes were left out"), or `null`. */
  let leftLine = $state<string | null>(null);
  /** Why a file could not be read, said under the field. */
  let fileWhy = $state<string | null>(null);
  let picker = $state<HTMLInputElement | undefined>(undefined);
  let dragging = $state(false);
  /* EACH FILE IS NUMBERED, so a mapping that lands after another file was brought in is not drawn over it. */
  let files = 0;
  /** The handle each tile is keyed by, never given twice on this page. */
  let tileKeys = 0;
  /** The name of the file as it was picked, which stands where the words would when nothing was said. */
  let source = '';

  /**
   * READ ON THIS DEVICE, THEN MAPPED: the model sees each table's first entries, one ask for each in the order the tiles
   * stand, and the rules map them where there is no model. The module that keeps the list a table goes into is turned on,
   * and stays on while that tile is in (`heldBy`).
   */
  async function bring(f: File | undefined) {
    if (!f || busy) return;
    fileWhy = null;
    if (!/\.zip$/iu.test(f.name) && f.size > BYTES_MOST) {
      fileWhy = firstRun.exportTooBig;
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer().catch(() => new ArrayBuffer(0)));
    const got = await readExports(f.name, bytes);
    if ('why' in got) {
      /* THE PLAIN FILE'S TWO WHYS ARE SAID AS THEY ALWAYS WERE; a zip's is a sentence of its own, drawn as it is. */
      fileWhy = got.why === 'notJson' ? firstRun.exportNotJson : got.why === 'noEntries' ? firstRun.exportNoEntries : got.why;
      return;
    }
    const mine = ++files;
    source = f.name;
    const read = got.exports.slice(0, EXPORTS_MOST).map((file): Brought => ({ key: ++tileKeys, file, mapping: null }));
    brought = read;
    leftLine = leftSaid(got.left);
    for (const b of read) {
      /* A TILE LEFT OUT BEFORE ITS TURN IS NOT ASKED ABOUT. */
      if (!brought.some((x) => x.key === b.key)) continue;
      const m = await mapExport(b.file, door?.mapping ?? null, locale);
      if (mine !== files) return;
      if (!brought.some((x) => x.key === b.key)) continue;
      brought = brought.map((x) => (x.key === b.key ? { ...x, mapping: m } : x));
      if (m.module !== null) {
        onByHand = new Set([...onByHand, m.module]);
        offByHand = new Set([...offByHand].filter((x) => x !== m.module));
        if (proposal !== null && !kept.includes(m.module)) kept = [...kept, m.module];
      }
    }
  }

  /** Take one file off the build. Its module stays as the person left it; the last one out takes the left-out line too. */
  function leaveFile(key: number) {
    brought = brought.filter((b) => b.key !== key);
    if (brought.length > 0) return;
    files += 1;
    leftLine = null;
    fileWhy = null;
  }

  function pick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    void bring(input.files?.[0]);
    input.value = '';
  }

  /* A FILE DRAGGED ONTO THE SCREEN is taken anywhere on it; only a drag that carries files says "Drop it here". */
  const carriesFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes('Files');
  /* EVERY FILE DRAG IS HELD, busy or not: one let through is the browser opening the file in place of the first run. */
  function dragover(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragging = !busy;
  }
  function drop(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragging = false;
    if (!busy) void bring(e.dataTransfer?.files[0]);
  }

  /**
   * EACH TILE AS IT IS DRAWN: a list of the file's own while it maps to none this build ships, named so no tile before
   * it took the name; its entries as their list stores them, in the currency as it stands; each column that fills a
   * field of a list this build ships, with that field's name; and what it becomes, in the one line the conversation
   * says it in.
   */
  const tiled = $derived.by(() => {
    const taken = allLists().map((l) => l.id);
    return brought.map((b) => {
      const { file, mapping } = b;
      const own = mapping && mapping.list === null ? ownList(file, mapping.name, currency, locale, taken) : null;
      if (own) taken.push(own.id);
      const entries = mapping ? entriesOf(file, mapping, currency, locale, own ?? undefined) : null;
      const pairs =
        mapping && mapping.list !== null
          ? mapping.fields.map((m) => ({ column: m.column, label: listById(mapping.list ?? '')?.fields.find((f) => f.id === m.field)?.label ?? m.field }))
          : [];
      const said =
        mapping === null
          ? firstRun.exportReading
          : (mapping.summary ?? (mapping.list === null ? firstRun.exportOwn(mapping.name) : firstRun.exportInto(entries?.fields.length ?? 0, mapping.name)));
      return { ...b, own, entries, pairs, said };
    });
  });
  /** The rail with each file's own page on it. */
  const rail = $derived([...pages, ...tiled.flatMap((t) => (t.own ? [{ section: t.own.name, pages: [t.own.name] }] : []))]);
  /** HOW MANY PAGES IT MAKES, ONE NUMBER FROM ONE SOURCE (the rail it will install), said by the build and by its pages. */
  const pageCount = $derived(rail.reduce((n, s) => n + s.pages.length, 0));

  /* THE DRAFT STANDS ONLY WHILE NO USE CASE IS CHOSEN: choosing one from the chips is choosing its pages instead. */
  const using = $derived(chosen === null ? draft : null);
  const today = dayOf(Date.now());
  /**
   * WHAT THE RECORD IS ASKED TO DRAW: the draft as Slash drew it, over its sample rows, beside the modules kept; or every
   * page of the use cases and modules, over the person's own entries and file rows. Every one is a rehearsal that keeps
   * nothing.
   *
   * ASKED AGAIN ONLY WHEN IT CHANGES: a turn that adds a client to People asks for the same pages, and the record is not
   * asked to draw them twice.
   */
  const plain = $derived(using ? [draftAsked(using), ...changesAsked([], modules, today)] : changesAsked(cases, modules, today));
  const asks = $derived(
    tiled.reduce(
      (drawn, t) => (t.mapping && t.entries ? drawnWith(drawn, t.entries.register, t.entries.fields, t.own ? { declarations: newListDeclarations(t.own, t.mapping.summary) } : null) : drawn),
      plain as Record<string, unknown>[],
    ),
  );
  let drawAsked = $state.raw<Record<string, unknown>[]>([]);
  let drawKey = '';
  $effect(() => {
    /* ONLY ONCE THE TALK IS DONE, where the pages are drawn (1 Nov): every module's install document was built and read
       on every answer while nobody could see it, and the next question waited behind it. */
    if (!talkDone) return;
    const key = JSON.stringify(asks);
    if (key === drawKey) return;
    drawKey = key;
    drawAsked = asks as Record<string, unknown>[];
  });

  /* ── the one question ──────────────────────────────────────────────────── */

  /* THE DEVICE'S FACTS ARE READ ONCE: every currency and the zones of each region, which is a few dozen milliseconds. */
  let device: CurrencyEnv | null = null;
  const deviceOf = (): CurrencyEnv =>
    (device ??= browserCurrencyEnv(locale, typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])], zone));
  const ask = $derived(asksCurrency ? currencyChoices(sentence, deviceOf()) : null);

  /**
   * NOTHING PLACED: no use case, nothing Slash drafted or is drafting, and no part on. The question then is which use
   * case is closest, numbered, and turning parts on by hand is the other way on.
   */
  const closest = $derived(proposal !== null && u === null && using === null && !drafting && modules.length === 0);
  /** The open question's short form, for the sentence under the title, or `null` when nothing waits. */
  const waitingOn = $derived(
    asksCurrency && currency === null ? (ask && ask.said.length > 0 ? words.whichOf(ask.said) : words.whichCurrency) : closest ? words.whatClosest : null,
  );

  /* ── the parts ─────────────────────────────────────────────────────────── */

  /**
   * WHAT THE RIGHT-HAND SIDE DRAWS: while typing, the live reading, with no switches; once read, the proposal as the
   * person has left it. A use case is a part too, since it carries lists and pages of its own.
   */
  const reading = $derived(proposal ?? live);
  const caseParts = $derived.by<PartOf[]>(() => {
    if (proposal !== null) return cases.map((c) => casePart({ ...c, title: caseTitle(c, sentence) }, proposal?.heard ?? [], caseByHand));
    if (live === null) return [];
    return [live.usecase].flatMap((id) => caseOf(id) ?? []).map((c) => casePart({ ...c, title: caseTitle(c, sentence) }, live?.heard ?? [], false));
  });
  const moduleParts = $derived.by<PartOf[]>(() => {
    if (proposal !== null)
      return partsOf({ offered, modules, heard: proposal.heard, rows: proposal.rows, names: proposal.names, heldBy, byHand: onByHand, waiting: asksCurrency && currency === null ? money : null });
    const liveOffered = [...new Set([...INSTALL_ORDER, ...(live?.modules ?? [])])];
    return partsOf({ offered: liveOffered, modules: live?.modules ?? [], heard: live?.heard ?? [], rows: live?.rows ?? [], heldBy: () => null, byHand: new Set(), waiting: null });
  });
  const allParts = $derived([...caseParts, ...moduleParts]);
  const steps = $derived(stepsOf(allParts));
  /** Whether anything is on at all: a yes or a no, never how many. */
  const anyOn = $derived(steps.length > 0);

  /**
   * WHAT THE LAST THING SAID ADDED TAKES THE ARRIVAL TINT for a second and a half: a part that came on
   * and an entry that came in, while typing and after each turn alike. The first drawing is not an arrival.
   */
  let fresh = $state.raw<Set<string>>(new Set());
  let seen: Set<string> | null = null;
  let fading: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const now = new Set([...allParts.filter((p) => p.on).map((p) => `part:${p.id}`), ...allParts.flatMap((p) => p.entries.map((e) => e.key))]);
    const was = seen;
    seen = now;
    if (was === null || reading === null) return;
    const came = [...now].filter((k) => !was.has(k));
    if (came.length === 0) return;
    fresh = new Set([...fresh, ...came]);
    clearTimeout(fading);
    fading = setTimeout(() => (fresh = new Set()), 1500);
  });
  $effect(() => () => clearTimeout(fading));

  /* ── the accept ─────────────────────────────────────────────────────────── */

  let busy = $state(false);
  /**
   * THE RECORD BEING MADE, WATCHED (`Making.svelte`): the parts that were on when the press landed, what the record holds
   * of them, read every 400 ms while `setup` runs, and the call's own answer once it is back. `null` before a press, and
   * again once the person goes back from a press that left something not made.
   */
  let watched = $state.raw<{ parts: MakingPart[]; held: readonly Held[]; answer: readonly Refused[] | null } | null>(null);
  /** Whether a press has come back already, so the next one asks the record only for what is missing. */
  let pressed = false;
  /**
   * THE HANDLE OF A PRESS THAT NEVER CAME BACK, and the entries it carried. Pressed again with the same entries, it is
   * sent under the same handle and with `again`, so a call that went in and lost its answer writes nothing twice. A
   * press that answers clears it, and other entries are another press.
   */
  let unanswered: { key: string; rows: string } | null = null;
  /**
   * THE USE CASE'S PLAN STILL TO MAKE, as the last answered press handed it back (`Accepted.plan`), sent with the next
   * press in place of the plan formed whole from the sentence: an answered press is followed by one under a new key,
   * and the record passes over only a key it holds, so the whole plan would be written a second time. `undefined`
   * until a press has answered with one, and again once the reading it belonged to is replaced.
   */
  let owed: readonly SetupRow[] | undefined;
  /** What could not be made, `null` until a press has come back with something refused. */
  let failed = $state<NotMade[] | null>(null);
  const nothing = $derived(u === null && modules.length === 0 && using === null && !brought.some((b) => b.mapping !== null));
  /* A FILE STILL BEING READ HOLDS THE PRESS, so no tile on screen is left out of what it writes. */
  const ready = $derived(proposal !== null && !busy && !nothing && !(asksCurrency && currency === null) && !brought.some((b) => b.mapping === null));

  async function make() {
    if (!proposal || !ready) return;
    /* WHAT THE PRESS MAKES IS WHAT WAS ON SCREEN WHEN IT LANDED, read once here, before the first call goes out.
       EVERY TOOL NAMED GOES IN WITH IT, through the same rows (1 Nov, a live run: "Claude, and Figma" and then "Nothing in
       Tools yet"), and Agents with them. A THING TO DO IS NOT WRITTEN UNASKED: it waits on Today with the to-dos drawn
       from what they said, for a press (`todos` below). */
    const tools = toolsSaid.length > 0 || agentsSaid.length > 0;
    const shown = proposal;
    const build = { ...proposal, rows: withoutTasks(unionRows(proposal.rows, toolsSaid)) };
    const todo = proposal.rows.filter((r) => r.register === 'tasks').map((r) => String(r.fields['what'] ?? '').trim()).filter((x) => x !== '');
    const asked = {
      sentence,
      proposal: build,
      usecase: u?.usecase ?? null,
      also: also.map((a) => a.usecase),
      modules: tools && !modules.includes('agents') && offered.includes('agents') ? [...modules, 'agents'] : modules,
      agents: agentsSaid,
      currency: money === null ? null : currency,
      today: dayOf(Date.now()),
      nav: pref.read().nav ?? [],
      drafted: using,
      imported: brought.flatMap((b) => (b.mapping ? [{ file: b.file, mapping: b.mapping }] : [])),
      locale,
    };
    busy = true;
    failed = null;
    /* THE SAME TILES THE BUILD WAS DRAWN IN, now each saying where it is. Read from the record, never timed. */
    const tiles = steps.map((p): MakingPart => ({ id: p.id, name: p.name, icon: p.icon, why: p.why }));
    watched = { parts: tiles, held: [], answer: null };
    const client = createClient({ base: apiBase() });
    const stop = watchHeld(
      async () => {
        const read = await client.packs();
        return read.ok ? (read.value as readonly Held[]) : null;
      },
      (held) => {
        if (watched && watched.answer === null) watched = { ...watched, held };
      },
    );
    try {
      const signed = await methods();
      const rows = JSON.stringify(asked.proposal.rows);
      const resent = unanswered !== null && unanswered.rows === rows;
      if (!resent) unanswered = { key: pressKey(), rows };
      const out = await accept(client, { ...asked, key: unanswered!.key, again: alreadyMade || pressed || resent, email: signed.ok ? (signed.value.me?.email ?? null) : null, ...(owed === undefined ? {} : { plan: owed }) });
      if (!out.unheard) unanswered = null;
      if (!out.unheard && out.plan !== undefined) owed = out.plan;
      stop();
      pressed = true;
      /* WHAT THE RECORD REFUSED STAYS ON ITS TILE, in the record's own sentence, until the person goes back. A press
         that failed some other way (a draft, a file, the whole call) has no tile to say it on, so it is said in the
         conversation as it always was. */
      const refused = out.refused ?? [];
      watched = refused.length > 0 ? { parts: tiles, held: watched?.held ?? [], answer: refused } : null;
      if (out.nav) pref.write({ nav: out.nav });
      /* THE SHELL READS THE RECORD AGAIN, so the rail shows the new pages and speaks in the new voice. */
      (await import('$lib/record/boot-live.ts')).forget();
      if (out.failed.length === 0) {
        madeModules = asked.modules;
        madePlaces = railPlaces(asked.proposal.places, filledBy(asked.proposal.rows)).filter((x) => x.kind !== 'today').map((x) => x.name);
        madeAddons = tradeAddons(sentence, cat).map((u) => ({ id: u.id, title: u.title, summary: u.summary }));
        /* ONLY WHAT MAY HOLD A THING TO DO is read again for Today (`draftsSaid`): never the answers that set it up. With
           it, the things to do the readings found and the first to-dos drawn from what to keep first and the clients
           named (`todosOf`), one to three, each offered on Today for a press. */
        const clients = asked.proposal.rows
          .filter((r) => (r.register === 'organisations' && r.fields['kind'] === 'client') || (r.register === 'people' && r.fields['role'] === 'client'))
          .map((r) => String(r.fields['name'] ?? ''));
        const crew = asked.proposal.rows.filter((r) => r.register === 'people' && r.fields['role'] === 'contractor').map((r) => String(r.fields['name'] ?? ''));
        const todos = [...todo, ...todosOf(chatTurns, clients, todo, crew)].slice(0, 3);
        const forDrafts = chatTurns.length > 0 ? draftsSaid(chatTurns, todos) : sentence;
        madeSaid = forDrafts.trim() === '' ? null : saidMade(forDrafts, asked.proposal.rows, asked.proposal.usecase);
        made = true;
        globalThis.scrollTo?.({ top: 0 });
        return;
      }
      /* WHAT WENT IN STAYS IN, AND IS NOT ASKED FOR AGAIN: the proposal keeps only the entries not written, so pressing
         "Make it mine" after a refusal writes only the ones that were not made. */
      if (out.left.length < asked.proposal.rows.length && proposal === shown) proposal = { ...asked.proposal, rows: out.left };
      /* A DRAFT ON DECIDE IS NOT FILED TWICE: kept, or waiting there, the next press leaves it where it is. */
      if (out.filed && draft === asked.drafted) draft = null;
      failed = out.failed;
    } catch (e) {
      watched = null;
      throw e;
    } finally {
      stop();
      busy = false;
    }
  }

  /* ── the keys ───────────────────────────────────────────────────────────── */

  /**
   * CTRL ENTER FINISHES from anywhere on the page once the talk is done and the summary stands; never through a page
   * opened over this one. While BrainDog asks, Enter is the conversation's own (`Chat.svelte`).
   */
  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || covered() || proposal === null || !talkDone) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void make();
    }
  }

  /* THIS SCREEN DRAWS FROM WHAT IS TYPED, with no read to wait on, so it is ready as soon as it is drawn. */
  $effect(() => drew('ready'));

  /* THE PHRASES MISSING A FACT, said by BrainDog only where Money is kept to hold the entry they began. */
  /** Words that say an amount comes round again: "every month", "monthly", "rent", "a retainer", "400 a month". */
  const REPEATS = /\b(?:(?:every|each|a|per)\s+(?:month|week|year|quarter)|monthly|weekly|yearly|annually|retainer|rent|salary|subscriptions?)\b|\d[\d,.]*\s*(?:a|per|\/)\s*(?:month|mo|week|year)\b/iu;
  /* AND ONLY WHERE A REPEATING AMOUNT WAS SAID (1 Nov): "invoices" alone is what she keeps, not an amount half told. */
  const missing = $derived(proposal !== null && money !== null && REPEATS.test(sentence) ? missingIn(sentence, today) : []);
  /** How many answers the number keys reach, printed beside the conversation's heading: at most three caps. */
  const onParts = $derived(allParts.filter((p) => p.on));
  /**
   * WHAT THE SUMMARY SAYS IS MADE IS WHAT THE SIDE OF THE SCREEN WILL SHOW (1 Nov, a live run: the summary said Projects,
   * and after Make it mine the sidebar had none). Projects with no project in it is made but shows on the side only from
   * its first project (`holdsProjects`), so it is not said as made; its tile on the build says what it waits for.
   */
  const holdsProject = $derived((proposal?.rows ?? []).some((r) => r.register === 'things'));
  /** The build as the tile, the phone's strip and its sheet draw it: Projects says it waits until it holds a project. */
  const buildParts = $derived(steps.map((p) => (p.id === 'portfolio' && !holdsProject ? { ...p, waits: words.projectsWait } : p)));
  const buildGhost = $derived(proposal === null && brought.length === 0);
  /* AND THE USE CASE IS WHAT IT IS SET UP AS, said on its own line: its page is Today, never a place on the side called
     Freelance or Small business. */
  const madeParts = $derived(onParts.filter((p) => !p.id.startsWith('usecase-') && (p.id !== 'portfolio' || holdsProject)));
  const offParts = $derived(moduleParts.filter((p) => !p.on));
</script>

<svelte:head><title>{titleOf('Start')}</title></svelte:head>
<svelte:window {onkeydown} ondragover={dragover} ondrop={drop} ondragleave={(e) => (e.relatedTarget === null ? (dragging = false) : undefined)} />



{#snippet bringer()}
  <!-- ONE QUIET CONTROL, AND ITS HINT ONLY ON HOVER OR FOCUS: the screen asks one question, and a file is the other way
       to answer it. The input is the browser's own picker; a drop anywhere on the screen does the same. -->
  {#if brought.length === 0}
    <span class="bring">
      <input class="bring-input" type="file" accept=".csv,.tsv,.json,.txt,.zip,text/csv,text/tab-separated-values,application/json,text/plain,application/zip" tabindex="-1" aria-hidden="true" bind:this={picker} onchange={pick} />
      <Button weight="bare" size="sm" disabled={busy} aria-describedby="bring-hint" onclick={() => picker?.click()}>{firstRun.exportPoint}</Button>
      <span class="bring-hint" id="bring-hint">{firstRun.exportHint}</span>
    </span>
  {/if}
{/snippet}

{#snippet summary()}
  <!-- THE SUMMARY, WHERE THE FIELD WAS: what it will be for, the money's currency, what it makes, each with Change, and
       the one press. The parts themselves are taken out on the build beside (under it on a phone). -->
  <section class="summary" aria-labelledby="summary-h" in:arrive={{ rise: 8, delay: 80 }}>
    <h2 class="summary-h" id="summary-h" tabindex="-1">{words.summaryHead}</h2>
    <dl class="facts">
      {#if proposal?.name}
        <div class="fact"><dt>{words.factName}</dt><dd>{proposal.name}</dd></div>
      {/if}
      <div class="fact">
        <dt>{words.factFor}</dt>
        <dd>
          <span>{u ? caseTitle(u, sentence) : using ? drawing.drafted : drafting ? drawing.drafting : words.forYou}</span>
          <button type="button" class="change" disabled={busy} aria-expanded={picking} onclick={() => (picking = !picking)}>{words.changeCase}</button>
        </dd>
      </div>
      {#if money}
        <div class="fact">
          <dt>{words.factMoney}</dt>
          <dd>
            <span>{currency ? currencyName(currency) : words.noCurrency}</span>
            <button type="button" class="change" disabled={busy} aria-expanded={currencyOpen} onclick={() => ((currencyOpen = !currencyOpen), (currencyByHand = true))}>{words.changeCase}</button>
          </dd>
        </div>
      {/if}
      <div class="fact">
        <dt>{words.factMakes}</dt>
        <dd><span>{firstRun.and(['Today', ...madeParts.map((p) => p.name)])}</span></dd>
      </div>
    </dl>
    {#if picking}
      <div class="chips" role="group" aria-label={firstRun.mineFor}>
        {#each USE_CASES as one (one.usecase)}
          <Button size="sm" aria-pressed={chosen === one.usecase} disabled={busy} onclick={() => pickCase(one.usecase)}>{one.title}</Button>
        {/each}
      </div>
    {/if}
    {#if money && (currencyOpen || currency === null)}
      <Currency bind:value={currency} {locale} choices={ask?.choices ?? currencyChoices(sentence, deviceOf()).choices} suggested={ask?.suggested ?? null} find={ask?.find ?? null} />
    {/if}
    {#each missing as m (m.title)}<p class="quiet">{words.missing(m.title, m.missing)}</p>{/each}
    {#if ring}<Remind />{/if}
    {#if nothing}<p class="quiet" id="make-why">{firstRun.makeSomething}</p>{/if}
    {#if failed}
      <section class="failed-part" aria-labelledby="failed-h" role="status">
        <h3 class="reply-h" id="failed-h">{firstRun.notAllMade}</h3>
        <ul class="failed">
          {#each failed as f, i (i)}
            <li>
              {f.said}
              {#if f.why !== ''}
                <details class="why"><summary>{firstRun.whyDetails}</summary><p class="quiet">{f.why}</p></details>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="actions"><Button href="/">{firstRun.openHome}</Button></div>
      </section>
    {/if}
    <div class="summary-go">
      <div class="make-bar">
        <Button weight="primary" kbd={ready ? '⌘↵' : undefined} disabled={!ready} aria-busy={busy} onclick={() => void make()} aria-describedby={nothing ? 'make-why' : undefined}>
          {busy ? firstRun.makingIt : firstRun.makeIt}
        </Button>
      </div>
      <Button weight="bare" size="sm" disabled={busy} onclick={talkMore}>{words.tellMore}</Button>
    </div>
  </section>
{/snippet}


<!-- THE WHOLE WINDOW (`Frame.svelte`): the conversation on the ground at the left, the build in tiles at the right. -->
<Frame>
  <div class="frame" data-making={talkDone ? '' : undefined}>
    {#if noRecord}
      <div class="alone">
        <NoRecord title={copy.noRecordTitle} why={firstRun.noRecordWhy} describe />
      </div>
    {:else if colleague}
      <section class="again alone" aria-labelledby="again-h">
        <p class="again-h" id="again-h">{copy.startNotYours}</p>
        <p class="again-why">{copy.startNotYoursWhy}</p>
        <div class="actions">
          {#if notTheirs?.kind === 'list'}
            <Button weight="primary" href={notTheirs.href}>{copy.openList(notTheirs.name)}</Button>
          {:else if notTheirs}
            {#each notTheirs.lists as l (l.href)}<Button href={l.href}>{copy.openList(l.name)}</Button>{/each}
          {/if}
        </div>
      </section>
    {:else if made}
      <Made modules={madeModules} places={madePlaces} addons={madeAddons} said={madeSaid} tools={chatTurns.filter((t) => t.ask.topic === 'tools' && t.answer !== null).flatMap((t) => (t.answer ?? '').split(/,\s*|\s+and\s+/u))} />
    {:else if watched}
      <!-- AFTER THE PRESS: the record being made, tile by tile. Today opens when the call answers; where the record
           refused a part, its tile says why and the way back is one button. -->
      <div class="watched">
        <Making parts={watched.parts} states={makingStates(watched.parts, watched.held, watched.answer)} />
        {#if watched.answer}
          <div class="actions">
            <Button weight="primary" onclick={() => (watched = null)}>{making.back}</Button>
          </div>
        {/if}
      </div>
    {:else if page.url.searchParams.get('agent') === '1'}
      <!-- SET UP FROM HIS OWN AGENT: the agent proposes, the page draws it, and Make it mine is pressed here. Its own chunk. -->
      {#await import('./FromAgent.svelte') then { default: FromAgent }}<FromAgent />{/await}
    {:else}
      {#if alreadyMade}
        <section class="again made-note" data-surface="tile" aria-labelledby="again-h">
          <IconWell name="home" size="l" />
          <div class="again-main">
            <p class="again-h" id="again-h">{firstRun.againMade}</p>
            <p class="again-why">{firstRun.againMore}</p>
          </div>
          <Button href="/">{firstRun.againBack}</Button>
        </section>
      {/if}

      <!-- THE TITLE ROW: one plain line; the conversation under it does the asking. -->
      <header class="title">
        <h1 class="entry-title" id="who-h">{talkDone ? words.summaryTitle : words.talkTitle}</h1>
      </header>

      <div class="board">
        <!-- ── THE CONVERSATION ──────────────────────────────────────────── -->
        <section class="talk" aria-labelledby="who-h" data-dragging={dragging ? '' : undefined}>
          {#if dragging}<p class="drop" aria-hidden="true">{firstRun.exportDrop}</p>{/if}
          <!-- ON A PHONE, THE BUILD HELD AT THE TOP OF THE TALK while it lasts, opening whole as a sheet. -->
          {#if !talkDone}
            <FormingStrip parts={buildParts} ghost={buildGhost} title={proposal?.title ?? null} open={formingOpen} onopen={() => (formingOpen = true)} />
          {/if}
          <Chat
            turns={chatTurns}
            current={asking}
            {thinking}
            done={talkDone}
            {busy}
            closing={talkDone ? chatWords.done : null}
            onanswer={(a) => void answerChat(a)}
            onskip={() => void answerChat(null)}
            onenough={finishTalk}
          >
            {#snippet tools()}{@render bringer()}{/snippet}
            {#snippet after()}{@render summary()}{/snippet}
          </Chat>
          {#if fileWhy}<p class="nudge" role="status">{fileWhy}</p>{/if}
        </section>

        <!-- ── THE BUILD ─────────────────────────────────────────────────── -->
        <div class="build">
          <Forming
            parts={buildParts}
            left={proposal ? offParts.map((p) => ({ id: p.id, name: p.name })) : []}
            said={sentence}
            title={proposal?.title ?? null}
            ghost={buildGhost}
            settled={talkDone}
            {busy}
            {locale}
            pages={proposal ? pageCount || null : null}
            onremove={leaveOut}
            onrestore={flip}
          />

          {#each tiled as t (t.key)}
            <FromFile
              file={t.file}
              mapping={t.mapping}
              line={t.said}
              pairs={t.pairs}
              going={t.entries?.fields.length ?? 0}
              held={t.entries?.skipped ?? 0}
              reading={t.mapping === null}
              {busy}
              onremove={() => leaveFile(t.key)}
            />
          {/each}
          <!-- WHAT THE FILE HELD AND NOTHING WRITES, said once under its tiles, never as a tile of its own. -->
          {#if tiled.length > 0 && leftLine}<p class="quiet">{leftLine}</p>{/if}

          {#if proposal && talkDone}
            <!-- EVERY PAGE IT MAKES, one row a page, each opening as the record would draw it. -->
            <PagesPreview asked={drawAsked} {rail} count={pageCount} typed={proposal.rows} name={proposal.name} />
          {/if}
        </div>
      </div>

      <!-- THE WHOLE BUILD, FROM THE PHONE'S STRIP: the tile's rows on the sheet, a part taken out or put back here too. -->
      <Sheet bind:open={formingOpen} title={proposal?.title ?? words.formingTitle} subtitle={talkDone ? undefined : words.formingSub} caret={false}>
        <Forming
          bare
          parts={buildParts}
          left={proposal ? offParts.map((p) => ({ id: p.id, name: p.name })) : []}
          said={sentence}
          title={proposal?.title ?? null}
          ghost={buildGhost}
          settled={talkDone}
          {busy}
          {locale}
          pages={proposal ? pageCount || null : null}
          onremove={leaveOut}
          onrestore={flip}
        />
      </Sheet>
    {/if}
  </div>
</Frame>

<style>
  /* THE FRAME: the title row, then the board, 20 apart. `min-inline-size: 0` everywhere a long word could otherwise
     widen a track past the screen and take the page sideways. */
  .frame {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* A STATE THAT IS NOT THE BUILD (no record yet, a colleague's) is a column on the ground under the brand, no tile, at
     a reading measure and never floated in the middle of the window. */
  .alone {
    justify-self: start;
    inline-size: min(40rem, 100%);
  }

  /* THE RECORD BEING MADE takes the whole width of the frame, its tiles as many across as fit. */
  .watched {
    display: grid;
    align-content: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* ── the title row ─────────────────────────────────────────────────────── */

  .title {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* ── the board ─────────────────────────────────────────────────────────── */

  /* ONE COLUMN ON A PHONE; FROM 900PX THE CONVERSATION AND THE BUILD SIDE BY SIDE, 12 apart. */
  .board {
    display: grid;
    align-items: start;
    gap: var(--inset);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .board {
      grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 1fr);
    }

    /* THE BUILD STAYS IN VIEW BESIDE A LONG CONVERSATION, under the frame's own top edge. */
    .build {
      position: sticky;
      inset-block-start: var(--sp-5);
    }
  }.build {
    display: grid;
    gap: var(--inset);
    min-inline-size: 0;
  }

  /* WHILE TYPING ON A PHONE the build tile alone says what lit up; the part tiles arrive once the sentence is read. */

  /* A TILE THAT JUST CAME ON takes the arrival tint and fades back to the tile over a second and a half. */
  @media (prefers-reduced-motion: no-preference) {
    .build :global(.tile) {
      transition: background-color 1500ms var(--ease-out);
    }
  }

  .build :global(.tile[data-arrived]) {
    background: var(--arrived);
    transition: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE CHOICES ARE `Button`'S QUIET PILLS, as every other choice on the screen is; the chosen one on the selected fill. */
  .chips :global(.btn[aria-pressed='true']) {
    background: var(--chosen);
    color: var(--ink);
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* ── a file ────────────────────────────────────────────────────────────── */

  /* THE PICKER IS THE BROWSER'S, kept out of sight; the quiet button opens it. */
  /* THE BARE BUTTON'S WORDS ON THE COLUMN'S START EDGE, under the field's own edge (first F6). */
  .bring {
    position: relative;
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin-inline-start: calc(-1 * var(--sp-2));
  }

  .bring-input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }

  /* THE HINT ONLY ON HOVER OR FOCUS (§35): the control is one quiet word until a person reaches for it. */
  /* UNDER THE BUTTON, OUT OF THE ROW (P49): taking room in the row, the hidden hint pushed "Show
     my BrainDog" onto a line of its own at 1512, and beside it, it ran under that button. It lies in the tile's foot,
     on the words' start edge. */
  .bring-hint {
    position: absolute;
    inset-block-start: calc(100% + 2px);
    inset-inline-start: var(--sp-2);
    /* NEVER PAST THE WINDOW: at 320 the hint ran 200px off the screen's edge, its end cut. */
    max-inline-size: min(60ch, calc(100vw - 6rem));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    opacity: 0;
    transition: opacity 120ms var(--ease-out);
  }

  .bring:hover .bring-hint,
  .bring:focus-within .bring-hint {
    opacity: 1;
  }

  @media (pointer: coarse) {
    .bring-hint {
      display: none;
    }
  }

  /* A FILE HELD OVER THE SCREEN: the conversation says where it goes, in the ink, over a quiet wash. */
  /* ON A PHONE NOTHING FOCUSED SITS UNDER THE STRIP HELD AT THE TOP OF THE TALK (2.4.11): a control scrolled to by its
     focus stops a strip's height below the top. */
  @media (width < 900px) {
    .talk :global(:is(button, a, textarea, input, [tabindex])) {
      scroll-margin-block-start: calc(var(--tap, 44px) + var(--sp-5));
    }
  }

  .talk[data-dragging] {
    position: relative;
  }

  .drop {
    position: absolute;
    inset: 0;
    z-index: var(--z-raise);
    display: grid;
    place-items: center;
    margin: 0;
    border: 1px dashed var(--ink-2);
    border-radius: inherit;
    background: color-mix(in srgb, var(--tile) 92%, transparent);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    pointer-events: none;
  }

  /* ── the conversation ──────────────────────────────────────────────────── */

  /* IN A TILE (first F5): its fill and radius, 24 in and 20 on a phone, so the field and its words sit on white. */
  .talk {
    display: grid;
    gap: var(--sp-4);
    align-content: start;
    min-inline-size: 0;
    /* THE LEAD TILE'S PADDING (`--tile-pad-lead`: 24, 16 on a phone), the board's one step, not a 32 of its own beside
       the build's 20 (skills pass, bento, 2 Nov). */
    padding: var(--tile-pad-lead);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  /* THE HEADING FOCUS LANDS ON AFTER A READ is a place, not a control: focus-ok: it is `tabindex="-1"`, reached only
     by the script that moves the reader to the answer, and it takes no press, so no ring is drawn round it. */
  .reply-h:focus {
    outline: none;
  }

  .reply-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
  }

  /* CHANGE IS A WORD IN THE LINK INK, not another pill: the line says what was chosen, and this opens the rest. Ink and
     underlined, never the red, which is kept for what is late or failing. */
  .change {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    cursor: pointer;
  }

  .change:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  .nudge {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* A SENTENCE IN THE QUIET INK IS STILL A SENTENCE, read at the body size. */
  .quiet {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* ── the question ──────────────────────────────────────────────────────── */

  .failed-part {
    display: grid;
    gap: var(--sp-3);
  }

  .failed {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
  }

  .why summary {
    min-block-size: var(--tap);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  /* AND A BUTTON'S OWN CAP the same way: under the pointer or with keyboard focus. Without its cap a pill takes its
     even padding back, so it reads as every other pill on the screen. */
  .frame :global(.btn:not(:hover, :focus-visible) > .btn-kbd) {
    display: none;
  }

  .frame :global(.btn:not(:hover, :focus-visible):has(> .btn-kbd)) {
    padding-inline-end: var(--sp-4);
  }

  .frame :global(.btn[data-size='sm']:not(:hover, :focus-visible):has(> .btn-kbd)) {
    padding-inline-end: var(--sp-3);
  }

  /* ── the build ─────────────────────────────────────────────────────────── */

  /* THE ONE PRIMARY, AT THE END OF THE BUILD at 1440. */
  .make-bar {
    display: flex;
    justify-content: flex-start;
  }

  /* ── the again note ────────────────────────────────────────────────────── */

  /* THE NOTE SPANS THE FRAME, so its one press sits at the board's own right edge rather than wherever the words end. */
  .again {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
  }

  /* THE "ALREADY MADE" NOTE IS A TILE: on the bare board its words and its white button
     floated over the question like a stray line of the page. A tile, one row, its button the tile's quiet fill. */
  .made-note {
    padding: var(--sp-4) var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .made-note .again-h {
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .made-note .again-why {
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .again.alone {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .again-main {
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .again-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: var(--lead-head);
  }

  .again-why {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  /* ── the summary, where the field was ─────────────────────────────────── */

  .summary {
    display: grid;
    gap: var(--sp-4);
    padding-inline-start: calc(28px + var(--sp-3));
  }

  .summary-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
  }

  .summary-h:focus {
    outline: none;
  }

  /* THE FACTS, ONE A ROW: what it is in the second ink at the left, the answer and its Change at the right. */
  .facts {
    display: grid;
    margin: 0;
  }

  .fact {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .fact:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }

  .fact dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 24px;
  }

  .fact dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  .summary-go {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    padding-block-start: var(--sp-2);
  }

  @media (width < 640px) {
    .summary {
      padding-inline-start: 0;
    }

    .fact {
      grid-template-columns: 5.5rem minmax(0, 1fr);
    }
  }

  /* ── a phone ───────────────────────────────────────────────────────────── */

  @media (width < 900px) {
    /* MAKE IT MINE RIDES THE BOTTOM EDGE on the board's own flat colour (no glass), as the tab bar does:
       the button's own 44 and 4 either side, which is the `--sticky` height, with the home indicator's inset paid once
       under it. */
    .make-bar {
      position: fixed;
      inset-inline: 0;
      inset-block-end: 0;
      z-index: var(--z-sheet);
      padding: var(--sp-1) var(--gutter) calc(var(--sp-1) + env(safe-area-inset-bottom));
      background: var(--board);
    }

    .make-bar :global(.btn) {
      inline-size: 100%;
      min-block-size: var(--tap);
    }

    .frame[data-making] {
      padding-block-end: calc(var(--tap) + var(--sp-2) + env(safe-area-inset-bottom));
    }

    .again {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .again > :global(.btn) {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }

  /* NO KEY CAPS UNDER A THUMB OR ON A PHONE: there is no keyboard to press them with. */
  @media (width < 900px), (pointer: coarse) {.frame :global(.btn-kbd) {
      display: none;
    }
  }

  @media (forced-colors: active) {

    .make-bar {
      border-block-start: 1px solid CanvasText;
    }
  }
</style>
