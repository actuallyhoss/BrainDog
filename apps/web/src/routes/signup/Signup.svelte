<!--
  Sign-up, for a stranger: say who you are, watch the BrainDog build, then keep it with one email.

  LOADED AFTER THE FIRST PAINT (`+page.svelte`), with everything a sentence is read with: the starter catalogue, the
  rules, the build and the record's client. The page's first draw is its own first step, "Getting sign-in ready",
  drawn by `+page.svelte` from almost nothing, and this takes its place once it has loaded (first hour audit, E14).

  USE CASE 6, STEPS 1 TO 4 (set 9 October, "The onboarding target").

  SINCE 1 NOVEMBER STEPS 1 TO 3 ARE ONE CONVERSATION (`../start/Chat.svelte`, `$lib/start/chat.ts`), as on `/start`:
  BrainDog asks "What do you do?" and the follow-ups the answers call for, each answer read at the reading door with
  the questions asked (`readPressed` with `askedLines`, a fresh bot-check answer each, six reads at most, `QUICK_MS`
  each before the rules answer), and the build beside it forms (`../start/Forming.svelte`), each part one press from
  being taken out (`Amend.off`, kept beside the words). The end of the talk is the keep step. What follows describes the
  reading the conversation stands on; the one-field describe step and its one question are no longer drawn.

  1. DESCRIBE. "Who are you?", one field with one example in it, and three promises under it. As it is typed, the
     rules read it on this device, a beat after each key (`proposeFirst` with no model, `lib/start/propose.ts`), and
     nothing typed leaves the device. ON THE PERSON'S PRESS OF NEXT, AND ONLY THEN (`readerFor` in
     `lib/signup.ts`), a model reads it once at the host's reading door (`readAsks(origin).setup`, `/auth/signup/read`),
     with a fresh bot-check answer taken from the read's own widget first. One line under the field says so before the
     press, until the host answers 501 (no door, no model or no bot check), which this tab then remembers. A 501, any
     refusal or a silence leaves the rules' reading on screen, and the build says "Simple rules read this" whenever the
     reading is the rules', for any cause (`firstRun.readByRulesAny`, `../start/Building.svelte`). The model's reading
     stands for the words it read, so a press with nothing changed is not read twice; a key changes them back to the rules'.
  2. HER WORDS LIGHT UP. The words heard are marked in the field itself, where each line says it sits (`heard[].at`,
     `litIn`), under "What I heard": her name as "you", then each phrase and what it became. A line is pressed to change
     what it became or take it out (`amend`), and the BrainDog builds beside it (`../start/Building.svelte`). "That's me".
  3. ONE QUESTION, at most: the model's where its reading carried one (`askOf`), else the one `oneQuestion` picks, its
     answers each with what it means, and "That is the only question". Never two. The model's asking what the rules would
     (the name, the currency) is answered as theirs is (`answeredAs`); one about anything else is the person telling it
     more, and that press reads the words once again. With none to ask it goes straight on; with nothing placed at all,
     it asks what it is closest to.
  4. KEEP IT. The title with Change (`NameField`), the places, one email, "Email me a link", and where to open it.

  THEN ONE EMAIL. The record's name is chosen from what was heard, the business first, then the person, then the
  address (`lib/signup.ts` `recordNames`, `chooseName`, trying `-2` to `-9`), and said as one quiet line with Change.
  Turnstile stands under the field when the host asks for it. A person already signed in is asked for nothing more.

  THEN THE LINK, AND THE BUILD IS MADE IN THE PAGE. The sentence and the whole reading the person kept wait for the link
  in `localStorage` (`keepSaid`), because the link opens a new tab. Spending it makes the free record (`checkout` with
  `plan: 'free'`), opens it, and writes the kept reading into it with `/start`'s own `accept()`, here, never reading
  again (`readingKept`); then the record's `/start#made` offers one agent and one source before Home. A link opened on
  another device has only what the link carries (`said`, read back by `arrivalOf`): the reading too where all of it fits,
  else the sentence, which its rules read. BEFORE THE BUILD, the passkey is offered (`../start/PasskeyFirst.svelte`),
  and a passkey made or "Not now" goes on to the build. What was changed by hand and the answer wait beside the sentence
  on this device (`keepAmend`), laid over the kept reading so the build is what the screen showed.

  ON `?plan=cloud` OR `?plan=plus` the link leads to Stripe's page on that plan instead (`NoRecord`), and the build is
  written once the payment has made the record (`#paid`). `#cancelled` is the payment step again. Free leads (§35).

  WHILE SIGN-UP IS CLOSED THE PAGE ASKS NOTHING. `/auth/signup/name` says who may sign up (`mode`), because it is the
  one door a stranger can ask; closed, the page says so and points at sign-in. BY INVITATION the code comes in the
  address (`#code=`), is wiped from it as a mailed link is, waits in this tab and rides with the email; with no code the
  page is the closed one with its own line. Nobody types a code. The answer to the email is the same for every address:
  the host sends a sign-in link to one that already has an account and a proof to a new one.

  "MAKE IT AGAIN" IS DRAWN ONLY WHEN THE ACCOUNT SAYS A RECORD CAN BE MADE (`canMake` on `/account/billing`), so no
  control offers what checkout would refuse.

  ONE FRAME, TWO SHAPES (`../signin/Entry.svelte`): a one-column step in the 440 sheet, as sign in is; describing and
  keeping across the whole window (`../start/Frame.svelte`), the words in a tile on the left and the build on the right
  from 900px, the words first and the build under them on a phone. The brand stands top left in both.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { createClient } from '@braindog/client';
  import { standsOn, USE_CASES } from '@braindog/seed/usecases';
  import { dayOf } from '@braindog/seed/usecases/install';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { apiBase, at, BASE } from '$lib/at.ts';
  import { methods, support, type Who } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { amendKept, keepAmend, litIn, NO_AMEND, firstRun, type Amend, type Reply } from '$lib/first-run.ts';
  import * as pref from '$lib/pref.ts';
  import { INSTALL_ORDER, LEANS_ON } from '$lib/shape.ts';
  import {
    allWritten,
    arrivalOf,
    billing,
    checkout,
    chooseName,
    codeKept,
    HELD_KEY,
    heldOf,
    hold,
    keepCode,
    keepKey,
    keepLeft,
    keepPlan,
    keepSaid,
    keepSpent,
    madeFor,
    namesHeard,
    openOwned,
    planKept,
    planOf,
    pressKept,
    recordNames,
    saidForLink,
    saidFromLink,
    saidKept,
    spentFor,
    startSignup,
    verifySignup,
    zone,
    answeredAs,
    askOf,
    keepReadsOff,
    readerFor,
    readingKept,
    READS_OFF,
    readsOffKept,
    type Draft,
    type Held,
    type ModelAsk,
    type Plan,
    type ReadCause,
  } from '$lib/signup.ts';
  import { MADE_ADDONS, heardOf, offerOf, readCatalogueOffer, tradeAddons, type CatalogueOffer } from '$lib/start/offer.ts';
  import { MADE_SAID, saidMade } from '$lib/start/made.ts';
  import { assemble } from '$lib/start/assembling.ts';
  import { becameShown, filledBy, mergeReplies, placesOf, proposeFirst, proposeTurn, railPlaces, type HeardLine, type Proposal } from '$lib/start/propose.ts';
  import type { SetupReply } from '$lib/start/ask.ts';
  import { readAsks } from '$lib/start/ask.ts';
  import { currencyWord, keepCurrencyGuess } from '$lib/start/place-currency.ts';
  import { placeZone, zoneGroups, zonePlace } from '$lib/start/place-zone.ts';
  import { answer, oneQuestion, words as asked, type Question } from '$lib/start/question.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import {
    browserCurrencyEnv,
    casePart,
    makingStates,
    partIcon,
    partsOf,
    passkeyOffered,
    stepsOf,
    watchHeld,
    zoneCurrency,
    type CurrencyEnv,
    type Held as HeldPart,
    type MakingPart,
    type Refused,
    currencyChoices,
  } from '../start/building.ts';
  import { caseOf, keepsCurrency } from '../start/preview.ts';
  import Chat from '../start/Chat.svelte';
  import Forming from '../start/Forming.svelte';
  import {
    ackOf,
    toolsHeldBack,
    askedLines,
    atLeast,
    caseTitle,
    chatWords,
    entriesSaid,
    currencyUnclear,
    firstAsk,
    firstTurnsOn,
    namedCurrency,
    nextAsk,
    QUICK_MS as CHAT_QUICK_MS,
    READS_MOST,
    saidOf,
    TURNS_ON,
    valueOf,
    withTodos,
    type ChatAsk,
    type ChatTurn,
  } from '$lib/start/chat.ts';
  import { joinTurns, type Part as PartOf } from '../start/building.ts';
  import Currency from '../start/Currency.svelte';
  import Frame from '../start/Frame.svelte';
  import Entry from '../signin/Entry.svelte';
  import Making from '../start/Making.svelte';
  import NoRecord from '../start/NoRecord.svelte';
  import PasskeyFirst from '../start/PasskeyFirst.svelte';
  import type { Accepting, NotMade } from '../start/accept.ts';
  import { accepting, nameSent, ownName, picked, replyOf, settle, titleSent } from './build.ts';
  import Apply from './Apply.svelte';
  import { askFirst, takeEarly } from './early.ts';
  import NameField from './NameField.svelte';
  import { loadWidget, widgetWords, type WidgetState } from './turnstile.ts';
  import { words } from './words.ts';

  type Step =
    | 'loading'
    | 'unreachable'
    | 'closed'
    | 'invite-only'
    | 'describe'
    | 'keep'
    | 'sent'
    | 'verifying'
    | 'lock'
    | 'link-failed'
    | 'link-used'
    | 'making'
    | 'made-partly'
    | 'make-failed'
    | 'pay'
    | 'waiting'
    | 'slow';

  /** The one question as the screen asks it: the rules' (`Question`) or the model's, with the answer it fills. */
  type Shown = Omit<Question, 'about'> & { about: string; reply: Reply['about'] | null };

  let step = $state<Step>('loading');
  /* THE PLAN THE SITE'S BUTTON ASKED FOR, Free when it asked for none. */
  let plan = $state<Plan>('free');
  /* WHAT THIS TAB KEPT ACROSS THE ROUND TRIP TO STRIPE, or what the mailed proof said was typed at the start. */
  let held = $state<Held | null>(null);
  let cancelled = $state(false);
  /** Who is signed in already, a person with no record of their own yet, or `null`: they are asked for no email. */
  let signedIn = $state<Who | null>(null);

  let email = $state('');
  let slug = $state('');
  let free = $state(false);
  let busy = $state(false);
  let said = $state<string | null>(null);
  /* WHY THE MAILED LINK DID NOT WORK, when the answer said: null is a link spent or a day old, the screen's own line. */
  let linkWhy = $state<string | null>(null);
  /* A FREE RECORD REFUSED FOR ITS PLAN, not its name: the person has theirs, so the name is not offered again. */
  let paidOnly = $state(false);
  /* WHETHER THE ACCOUNT SAYS A RECORD CAN BE MADE NOW, asked when making one was refused: no means no "make it again". */
  let canMake = $state(false);
  /* WHETHER PRESSING AGAIN COULD GO DIFFERENTLY: a lock lifts and a host comes back, but a refusal says the same twice. */
  let retry = $state(false);
  let sentTo = $state('');

  /* WHERE AND HOW THE SENTENCE WAS TYPED, for a date such as "on the 1st" and the currencies worth offering. */
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  const here = zone();

  /*
   * THE TIME ZONE AND THE CURRENCY, GUESSED FROM THIS DEVICE AND SAID ON THE KEEP STEP IN ONE LINE WITH CHANGE (1 Nov,
   * "infer currency and time zone from the browser locale and Intl, and confirm in one tap"). Nothing is asked for them:
   * the device's clock is the zone, the words or the device give the currency, and a place named in the words that keeps
   * another clock is offered as one tap (`placeZone`), never taken without it.
   */
  let tzPick = $state<string | null>(null);
  let currencyPick = $state<string | null>(null);
  let setOpen = $state(false);
  /** The zone the record is made in: the one picked, else this device's. */
  const zoneSent = (): string | null => tzPick ?? here;

  /** `sessionStorage`, or `null` where reading it throws (storage blocked). */
  function tabStore(): Storage | null {
    try {
      return globalThis.sessionStorage ?? null;
    } catch {
      return null;
    }
  }

  /** `localStorage`, or `null` where reading it throws (storage blocked). */
  function localStore(): Storage | null {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  /* ── Turnstile ───────────────────────────────────────────────────────────── */

  let siteKey = $state<string | null>(null);
  let widget = $state<HTMLElement | null>(null);
  let human = $state<string | null>(null);
  let widgetId: string | null = null;
  /* WHERE CLOUDFLARE'S SCRIPT IS, for the form's widget: the box's line and Send's label read it (`widgetWords`). */
  let widgetState = $state<WidgetState>('loading');

  type Turnstile = {
    render: (el: HTMLElement, options: Record<string, unknown>) => string;
    reset: (id: string) => void;
    remove: (id: string) => void;
    execute: (el: HTMLElement | string) => void;
  };
  const turnstileOf = (): Turnstile | null => (globalThis as { turnstile?: Turnstile }).turnstile ?? null;

  /**
   * Cloudflare's script, once per page, rendered explicitly into the form's slot.
   *
   * `size: 'flexible'` FILLS THE COLUMN, which keeps it inside the 16px gutter on a phone rather than a fixed 300px box
   * that pushes the page sideways at 320. The answer is single use, so every failed send resets it.
   */
  function loadTurnstile(key: string, el: HTMLElement): void {
    widgetState = 'loading';
    void withTurnstile((t) => {
      if (widgetId !== null) return;
      widgetId = t.render(el, {
        sitekey: key,
        size: 'flexible',
        callback: (answer: string) => (human = answer),
        'expired-callback': () => (human = null),
        'error-callback': () => (human = null),
      });
    }).then((state) => (widgetState = state));
  }

  /**
   * Cloudflare's script, through `loadWidget` (`turnstile.ts`), and `then` once it is there. A script that failed or did
   * not arrive in ten seconds is `failed`, and `then` is not called: the box says so and offers Try again.
   */
  async function withTurnstile(then: (t: Turnstile) => void): Promise<WidgetState> {
    const state = await loadWidget({ doc: document });
    const t = turnstileOf();
    if (state === 'ready' && t) then(t);
    return state;
  }

  /* TRY AGAIN, after the script failed: a fresh tag, in the same held box. */
  function retryTurnstile(): void {
    if (siteKey !== null && widget !== null) loadTurnstile(siteKey, widget);
  }

  /*
   * THE READ'S OWN ANSWER, TAKEN FRESH BEFORE EACH READ. The describe step has its own slot, drawn only when Cloudflare
   * needs the person to do something (`interaction-only`) and run only when asked (`execute`), so the field stays the
   * screen. An answer is good once, so each read resets the widget and asks it again; one that does not come within
   * `HUMAN_MS` is none, and the rules read instead.
   */
  const HUMAN_MS = 15_000;
  let readSlot = $state<HTMLElement | null>(null);
  let readWidget: string | null = null;
  let readHuman: ((answer: string | null) => void) | null = null;

  /**
   * THE NEXT READ'S ANSWER, ASKED FOR WHILE THE QUESTION IS ON SCREEN (2 Nov, the model run: each turn's read left the
   * page some 1.7 seconds after the press, all of it the bot check, so the model's question came after the 3.5 seconds a
   * turn waits and the rules' stood on almost every turn). Taken once by the next read; an answer is good for 300 seconds,
   * so one older than `AHEAD_MS` is dropped and asked again.
   */
  const AHEAD_MS = 240_000;
  let ahead: { at: number; answer: Promise<string | null> } | null = null;
  function humanAhead(): void {
    if (ahead !== null || siteKey === null || readSlot === null) return;
    ahead = { at: Date.now(), answer: humanNow() };
  }
  function freshHuman(): Promise<string | null> {
    const held = ahead;
    ahead = null;
    if (held !== null && Date.now() - held.at < AHEAD_MS) return held.answer.then((a) => a ?? humanNow());
    return humanNow();
  }

  function humanNow(): Promise<string | null> {
    const key = siteKey;
    const el = readSlot;
    if (key === null) return Promise.resolve('');
    if (el === null) return Promise.resolve(null);
    return new Promise((done) => {
      let over = false;
      const end = (answer: string | null) => {
        if (over) return;
        over = true;
        clearTimeout(timer);
        readHuman = null;
        done(answer);
      };
      const timer = setTimeout(() => end(null), HUMAN_MS);
      readHuman = end;
      withTurnstile((t) => {
        try {
          if (readWidget === null || !el.isConnected) {
            readWidget = t.render(el, {
              sitekey: key,
              size: 'flexible',
              appearance: 'interaction-only',
              execution: 'execute',
              callback: (answer: string) => readHuman?.(answer),
              'expired-callback': () => readHuman?.(null),
              'error-callback': () => readHuman?.(null),
            });
          } else t.reset(readWidget);
          t.execute(el);
        } catch {
          end(null);
        }
        /* A SCRIPT THAT DID NOT LOAD IS NO ANSWER, at once: the rules read instead of waiting out `HUMAN_MS`. */
      }).then((state) => state === 'failed' && end(null));
    });
  }

  /* THE READ'S SLOT LEAVES WITH THE DESCRIBE AND QUESTION STEPS, and its widget with it. */
  $effect(() => {
    if (step === 'describe' || readWidget === null) return;
    try {
      turnstileOf()?.remove(readWidget);
    } catch {
      /* Already dropped by Cloudflare. */
    }
    readWidget = null;
  });

  $effect(() => {
    if (step === 'keep' && signedIn === null && siteKey !== null && widget !== null) loadTurnstile(siteKey, widget);
  });

  function resetHuman(): void {
    human = null;
    const t = turnstileOf();
    if (t && widgetId !== null) t.reset(widgetId);
  }

  /* THE WIDGET'S SLOT LEAVES THE PAGE WITH THE STEP, so its widget goes too and a fresh one is drawn on the way back. */
  function dropHuman(): void {
    const t = turnstileOf();
    try {
      if (t && widgetId !== null) t.remove(widgetId);
    } catch {
      /* A widget Cloudflare already dropped has nothing to remove. */
    }
    widgetId = null;
    human = null;
  }

  /* ── describing ──────────────────────────────────────────────────────────── */

  /* The sentence stays in memory, and in `localStorage` only once the person keeps it, never in the address. */
  let sentence = $state('');
  /** The sentence came off a link that carried only its start (`cut`), and this device holds no copy of the whole. */
  let linkCut = $state(false);
  /** The link just mailed carries only the start of what was said; the whole waits here. */
  let sentCut = $state(false);
  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  /** The rules' reading of the sentence as it stands, a beat after the last key. */
  let live = $state.raw<Proposal | null>(null);
  /** The use case the person picked by hand, which stands over the one the words point at. */
  let chosen = $state<string | null>(null);
  /** What the person changed in "What I heard" (`amend`), and the line open to change, by its phrase. */
  let amends = $state.raw<Amend>(NO_AMEND);
  let opened = $state<string | null>(null);
  let nameDraft = $state('');
  /** The answer to the one question, where a draft kept from before the mail holds one (`replyOf`). */
  let reply = $state.raw<Reply | null>(null);

  /* THE DEVICE'S CURRENCY GOES IN WITH THE WORDS, so a shop in Cairo keeps EGP without being asked (`zoneCurrency`). */
  /* THE CATALOGUE'S USE CASES ARE LISTENED FOR TOO (`heardOf`), once the host's catalogue answers. The host builds the
     model's offer from its own catalogue, so the page's (`offerOf`) is never sent (`readAsks`). */
  let cat = $state.raw<CatalogueOffer | null>(null);

  /* ── the reading: the rules on each key, the model on a press ─────────── */

  /** The host answered 501 to a read this session: it has no reading door, so the line about one is not said. */
  let readsOff = $state(readsOffKept(tabStore()));
  /** A read is out, on the press of Next: the button says so and nothing else moves. */
  let readingNow = $state(false);
  /**
   * THE MODEL'S READING OF ONE SENTENCE, and its one question: it stands while the words are the ones it read, so a
   * press with nothing changed is not read twice, and is gone the moment a key changes them.
   */
  let pressed = $state.raw<{ said: string; proposal: Proposal; ask: ModelAsk | null } | null>(null);
  /** The sentence `live` was read from, so what is kept with the words is the reading of these very words. */
  let liveFor = $state<string | null>(null);

  /** The door before there is an account, on this page's own origin (sign-up names no record, so `apiBase()` is the
      bare origin); `null` once the host said it has none. */
  const door = $derived(readsOff || typeof location === 'undefined' ? null : readAsks(apiBase()).setup);

  /**
   * THE WORDS, READ FOR ONE CAUSE: by the rules on this device for a key or a pause, and by the model only for the
   * person's press (`readerFor`). `ask` is told the model's one question, where its answer carried one.
   */
  /**
   * WHAT THE CONVERSATION'S TURNS HAVE SAID SO FAR (1 Nov, lane onboard-speed): each answer is one quick turn (`quick`,
   * about two seconds) laid over the ones before it (`mergeReplies`). No whole reading is asked here: each read needs its
   * own bot-check answer, and the record reads the words whole once it is made (`first`, on the house), so the reads a
   * conversation spends at this door stay six.
   */
  let turnsSaid: SetupReply | null = null;

  function reading(s: string, cause: ReadCause = 'key', ask?: (q: ModelAsk | null) => void, asked?: string): Promise<Proposal> {
    const reader = readerFor(cause, door, {
      zone: here,
      locale,
      human: freshHuman,
      heard: (out) => {
        if (!out.ok && out.refusal.code === READS_OFF) {
          readsOff = true;
          keepReadsOff(tabStore());
        }
        ask?.(out.ok ? askOf(out.value) : null);
      },
    });
    const ctx = { zone: here, locale, currency: zoneCurrency(here), catalogue: heardOf(cat), offer: offerOf(cat) };
    /* IN THE CONVERSATION (`asked`), ONE QUICK TURN; the describe step's press is still the whole reading. */
    if (asked === undefined || reader === null) return proposeFirst(s, ctx, reader, asked);
    return proposeTurn(s, ctx, reader, asked, turnsSaid).then(({ proposal, turn }) => {
      if (turn !== null) turnsSaid = mergeReplies(turnsSaid, turn);
      return proposal;
    });
  }

  $effect(() => {
    const s = sentence;
    if (s.trim() === '') {
      live = null;
      liveFor = null;
      return;
    }
    /* THE MODEL'S READING STANDS for the words it read; any other words are the rules', a beat after the last key. */
    const kept = pressed;
    if (kept !== null && kept.said === s) {
      live = kept.proposal;
      liveFor = s;
      return;
    }
    const wait = setTimeout(() => {
      void reading(s).then((p) => {
        /* NEVER OVER THE MODEL'S: a press that read these words while the rules were on their way keeps its reading. */
        if (sentence === s && pressed?.said !== s) {
          live = p;
          liveFor = s;
        }
      });
    }, 140);
    return () => clearTimeout(wait);
  });

  /**
   * HOW LONG A PRESS WAITS ON THE MODEL BEFORE IT GOES ON WITH THE RULES' READING (1 Nov, "make it much smarter and
   * smoother"): never a "Reading" button for more than about a second. The model's reading is not dropped: it lands in
   * place when it answers (`late`), on the build beside the words, and the person never waits on it.
   */
  const QUICK_MS = 1200;
  /** The words a model's reading is still out for, after the press went on without it: the build says it is still reading. */
  let lateFor = $state<string | null>(null);
  /** The words a late reading landed on, so the build says it was read again. */
  let landed = $state<string | null>(null);

  /** THE PRESS'S READ: the model once for these words (or the reading it already gave them), else the rules'. */
  async function readPressed(s: string, asked?: string, quickMs = QUICK_MS): Promise<Proposal> {
    if (pressed !== null && pressed.said === s) return pressed.proposal;
    let ask: ModelAsk | null = null;
    let late = false;
    const model = reading(s, 'press', (q) => (ask = q), asked).then(
      (p) => {
        if (lateFor === s) lateFor = null;
        if (p.by === undefined || p.by === 'rules' || sentence !== s) return p;
        /* LATE, ITS QUESTION IS NOT ASKED where the person has gone on; IN THE CONVERSATION A LATE QUESTION IS KEPT, for
           the next turn, where its topic is still open (`nextAsk`). */
        pressed = { said: s, proposal: p, ask: late && step !== 'describe' ? null : ask };
        if (late) landed = s;
        return p;
      },
      /* A READ THAT THREW IS NO READING, at once: the rules' stands and nothing says it is still reading. */
      () => {
        if (lateFor === s) lateFor = null;
        return 'failed' as const;
      },
    );
    readingNow = true;
    let quick: Proposal | 'failed' | null;
    try {
      quick = await Promise.race([model, new Promise<null>((done) => setTimeout(() => done(null), quickMs))]);
    } finally {
      /* NEVER STUCK ON "Reading": a read that threw leaves Next pressable again. */
      readingNow = false;
    }
    if (quick === 'failed') return reading(s);
    if (quick !== null) return quick;
    /* THE MODEL IS SLOW: on with the rules' reading of the same words, and the model's lands when it comes. */
    late = true;
    if (door !== null) lateFor = s;
    return reading(s);
  }

  /* THE CURRENCIES THIS DEVICE POINTS AT, for the one question when it is the currency. */
  let device: CurrencyEnv | null = null;
  const deviceOf = (): CurrencyEnv => (device ??= browserCurrencyEnv(locale, typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])], here));
  const base = $derived(live === null ? null : settle(live, amends, null, sentence));
  const read = $derived(base === null ? null : reply === null ? base : answer(base, reply.about, reply.value, sentence));
  /* WHERE THE BRAINDOG WILL LIVE, said apart from its name (AH26): this host, then its address. */
  const addressHost = typeof location === 'undefined' ? '' : location.host;
  /** The one question it could not guess (`oneQuestion`), or none. */
  /** The rules' one question (`oneQuestion`), or none. */
  const ruled = $derived(base === null ? null : oneQuestion(base, sentence, deviceOf()));
  /** The model's question, where its reading of these very words carried one. */
  const modelAsk = $derived(pressed !== null && pressed.said === sentence && live === pressed.proposal ? pressed.ask : null);
  /**
   * THE ONE QUESTION ON SCREEN (`reply` is the answer it fills, or `null` for words told more): the model's in place of
   * the rules', never beside it, and the rules' where the model asked nothing or did not read.
   */
  const q = $derived.by((): Shown | null => {
    if (modelAsk === null) return ruled === null ? null : { ...ruled, reply: ruled.about };
    const as = answeredAs(modelAsk, ruled?.about ?? null);
    if (as !== null && ruled !== null) return { ...ruled, question: modelAsk.question, reply: as };
    return {
      about: modelAsk.about,
      reply: null,
      question: modelAsk.question,
      choices: modelAsk.choices.map((c) => ({ value: c, label: c, means: null })),
      suggested: null,
      find: null,
      only: asked.only,
    };
  });
  /**
   * EVERY WORD LIT ON A LINE IS SAID ON IT (first-hour audit AH21): a later phrase folded into a line (`more`) was lit in
   * the field and said nowhere under it, so "bills", "rent" and "payday" lit up and only "budget" was read back.
   */
  const saidAll = (h: HeardLine): string => {
    const one = (t: string): string => t.replace(/\s+/gu, ' ').trim();
    const more = (h.more ?? []).map(([a, b]) => one(sentence.slice(a, b))).filter((t) => t !== '' && t.toLowerCase() !== h.phrase.toLowerCase());
    const all = [h.phrase, ...more];
    return all.length < 2 ? h.phrase : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
  };

  /** The sentence cut at the very words heard, for the marks under the field. */
  const lit = $derived(litIn(sentence, read?.heard ?? []));

  /* THE MARKS SCROLL WITH THE WORDS, since they sit under the field rather than in it. */
  let marks = $state<HTMLElement | undefined>(undefined);
  function scrolled() {
    if (marks && field) marks.scrollTop = field.scrollTop;
  }

  /* THE USE CASES AND MODULES THE BUILD WILL MAKE, chosen by the build's own `picked`, so the screen cannot drift from it. */
  const choice = $derived(picked(read, chosen));
  const u = $derived(choice.one);
  const cases = $derived(u ? [u, ...choice.beside] : []);
  const modules = $derived(choice.modules);
  /** Every part on offer, in install order, then any the words or a use case brought beyond them. */
  const offered = $derived([...new Set([...INSTALL_ORDER, ...modules])]);
  /**
   * WHO A PART IS MADE FOR, where it was not asked for: a use case that stands on it, or a part kept that leans on it
   * (Agents keeps its work in Projects), as `/start` says it. A part only leaned on is said as such on the tile, and is
   * not said as added in the line back (`placeNames`): a household that said ChatGPT was told "That adds Projects".
   */
  const heldBy = (id: string): string | null =>
    cases.find((c) => standsOn(c).includes(id))?.title ?? modules.filter((m) => m !== id && (LEANS_ON[m] ?? []).includes(id)).map((m) => moduleName(m))[0] ?? null;
  const leanedOnly = (p: { id: string; why: readonly string[] }): boolean => p.why.length === 0 && !cases.some((c) => standsOn(c).includes(p.id)) && modules.some((m) => m !== p.id && (LEANS_ON[m] ?? []).includes(p.id));

  /* THE CURRENCY IS THE ONE TYPED OR THE ONE ANSWERED, never guessed (`oneQuestion` asks it where an amount has none). */
  const money = $derived(modules.find(keepsCurrency) ?? null);
  /** A place named in the words that keeps another clock than this device, offered as one tap on the keep step. */
  const zoneOffer = $derived(sentence.trim() === '' ? null : placeZone(sentence));
  const zoneNow = $derived(tzPick ?? here);
  /**
   * THE CURRENCY SAID ON THE KEEP STEP, WHATEVER THE STARTER (audit AP9): the one picked, else the reading's, else the
   * one this device and the words point at. A Team or a Student keeps no Money yet, and was told the time alone; the
   * first amount then asked again. Where Money is kept the record is made in it; where not, it is kept for the BrainDog
   * on this device (`keepCurrencyGuess`) and Money is made in it the day it is turned on.
   */
  const moneyNow = $derived(currencyPick ?? read?.currency ?? (sentence.trim() === '' ? null : currencyChoices(sentence, deviceOf()).suggested));
  /** The currencies worth offering first when the person opens Change, as the one question offers them. */
  const moneyAsk = $derived(!setOpen ? null : currencyChoices(sentence, deviceOf()));
  const zonesOffered = $derived(setOpen ? zoneGroups([zoneNow, here, zoneOffer?.zone ?? null]) : []);
  const placed = $derived(u !== null || modules.length > 0);

  const parts = $derived([
    /* THE USE CASE IN THEIR OWN WORD (`caseTitle`), as `/start` says it: a freelancer's is Freelance, not Small business. */
    ...cases.map((c) => casePart({ ...c, title: caseTitle(c, sentence) }, read?.heard ?? [], chosen !== null)),
    ...partsOf({
      offered,
      modules,
      heard: read?.heard ?? [],
      rows: read?.rows ?? [],
      names: read?.names,
      heldBy,
      byHand: new Set(),
      waiting: q?.about === 'currency' && reply === null ? money : null,
    }),
  ]);
  /* WHERE THINGS WILL BE KEPT, with a use case picked by hand in place of the one heard. */
  const places = $derived(read === null ? undefined : chosen === null ? read.places : placesOf({ ...read, usecase: chosen, also: [] }));

  /* ── the conversation (1 Nov) ────────────────────────────────────────────── */

  /** The questions asked and answered, and the one being asked now (`$lib/start/chat.ts`). */
  let chatTurns = $state.raw<ChatTurn[]>([]);
  let asking = $state.raw<ChatAsk | null>(firstAsk());
  /** BrainDog is reading the last answer. */
  let talking = $state(false);
  /** The model reads this conversation has spent; the rules read once `READS_MOST` are. */
  let modelReads = 0;
  /* EACH QUESTION THE MODEL WILL READ THE ANSWER TO HAS ITS BOT-CHECK ANSWER ASKED FOR AS IT IS SHOWN (`humanAhead`). */
  $effect(() => {
    if (asking !== null && door !== null && modelReads < READS_MOST && readSlot !== null && siteKey !== null && step === 'describe') humanAhead();
  });

  const placeNames = (): string[] => parts.filter((p) => p.on && !leanedOnly(p)).map((p) => p.name);

  /** What the next question is chosen from (`nextAsk`). */
  function where() {
    const said = sentence;
    const cur = currencyPick ?? read?.currency ?? null;
    const guessed = currencyPick === null && (currencyUnclear(said, deviceOf()) || (namedCurrency(said, deviceOf()) === null && (read?.currencyBy === 'device' || read?.currency == null)));
    return {
      said,
      turns: chatTurns,
      proposal: read,
      usecase: u?.usecase ?? null,
      placed: placed,
      money: { kept: money !== null, currency: cur, guessed },
      name: read?.name ?? null,
      env: deviceOf(),
      places: [...new Set(parts.filter((p) => p.on).flatMap((p) => (p.id.startsWith('usecase-') ? p.lists.slice(0, 2) : [p.name])))],
      model: pressed !== null && pressed.said === said ? pressed.ask : null,
    };
  }

  function currencyName(code: string): string {
    try {
      return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  /**
   * ONE ANSWER: its words joined to what was said and read (by the model while reads are left, for at most
   * `CHAT_QUICK_MS`, else by the rules), a currency, a use case or a name laid on, then the next question or the end.
   */
  async function answerChat(text: string | null): Promise<void> {
    const q = asking;
    if (q === null || talking || busy) return;
    const since = Date.now();
    talking = true;
    asking = null;
    const adds = text === null ? '' : saidOf(q, text);
    const value = text === null ? null : valueOf(q, text);
    const before = placeNames();
    const modsBefore = [...modules];
    const rowsBefore = read?.rows ?? [];
    const s = adds === '' ? sentence : joinTurns(sentence, adds);
    const turned: ChatTurn = { ask: q, answer: text, at: Date.now(), ack: null };
    const all = [...chatTurns, turned];
    /* HER ANSWER STAYS WHERE SHE SENT IT, under its question, while BrainDog reads it; the line back is laid on it after. */
    chatTurns = all;
    const laid: { currency?: string | null; usecase?: string | null; name?: string | null; entries?: string | null } = {};
    if (q.topic === 'currency' && value !== null) {
      currencyPick = value;
      laid.currency = currencyName(value);
    }
    if (q.topic === 'closest' && value !== null) {
      chosen = value;
      laid.usecase = USE_CASES.find((x) => x.usecase === value)?.title ?? null;
    }
    if (q.topic === 'name' && value !== null) {
      amends = { ...amends, name: value };
      laid.name = value;
    }
    try {
      if (adds !== '') {
        sentence = s;
        const p = door !== null && modelReads < READS_MOST ? ((modelReads += 1), await readPressed(s, askedLines(all), CHAT_QUICK_MS)) : await reading(s);
        if (sentence === s) {
          live = p;
          liveFor = s;
        }
        /* THE FIRST ANSWER SETTLES WHAT KIND OF BRAINDOG IT IS, so a later answer adds parts and never swaps it. */
        if (q.topic === 'what' && chosen === null && p.usecase !== null) chosen = p.usecase;
        /* THE PART THE QUESTION WAS ABOUT COMES ON with any answer that is not a no (`TURNS_ON`). */
        /* AND "DEADLINES" OR "TASKS" KEPT FIRST KEEPS WORK, where the first to-dos wait (`firstTurnsOn`), as on `/start`. */
        const part = TURNS_ON[q.topic] ?? (q.topic === 'first' && text !== null ? (firstTurnsOn(text) ?? undefined) : undefined);
        /* KEPT ON EVEN WHERE THE READING HAS IT NOW (onboarding6, the creator walk: "ChatGPT, Descript" was answered "That
           adds Agents", and a later reading that left Agents out took it away, because it was on when answered). */
        if (part !== undefined && !(q.topic === 'people' && /^just me$/iu.test(text ?? ''))) {
          amends = { ...amends, on: [...new Set([...(amends.on ?? []), part])], off: (amends.off ?? []).filter((x) => x !== part) };
        }
      }
      if (currencyPick === null) {
        const named = namedCurrency(sentence, deviceOf());
        if (named !== null) currencyPick = named;
      }
      await tick();
      /* A TOOLS ANSWER TURNS ON AGENTS AND NOTHING ELSE (`toolsHeldBack`): Services only for a paid subscription named. */
      if (q.topic === 'tools' && text !== null) {
        const held = toolsHeldBack(modsBefore, modules, text);
        if (held.length > 0) {
          amends = { ...amends, off: [...new Set([...(amends.off ?? []), ...held])], on: (amends.on ?? []).filter((x) => !held.includes(x)) };
          await tick();
        }
      }
      /* WHAT IT ADDED BY NAME (`entriesSaid`), as `/start` says it: "Added Fenwick and Acme as clients." */
      laid.entries = q.topic === 'tools' ? null : entriesSaid(rowsBefore, read?.rows ?? []);
      chatTurns = [...chatTurns.filter((t) => t !== turned), { ...turned, ack: ackOf(q, text, before, placeNames(), all.length, laid) }];
      await atLeast(since);
    } finally {
      talking = false;
    }
    const next = nextAsk(where());
    if (next === null) await keep();
    else asking = next;
  }

  /** A part taken out on the build, or put back: kept beside the words as the other changes are (`keepAmend`). */
  function partOut(p: PartOf): void {
    if (p.id.startsWith('usecase-')) {
      amends = { ...amends, out: [...new Set([...amends.out, ...p.why])] };
      return;
    }
    amends = { ...amends, off: [...new Set([...(amends.off ?? []), p.id])], on: (amends.on ?? []).filter((x) => x !== p.id) };
  }
  function partBack(id: string): void {
    amends = { ...amends, on: [...new Set([...(amends.on ?? []), id])], off: (amends.off ?? []).filter((x) => x !== id) };
  }

  async function keep(): Promise<void> {
    step = 'keep';
    said = null;
    await tick();
    (signedIn ? document.getElementById('keep-h') : document.getElementById('up-email'))?.focus();
  }

  /* ── a line heard, changed by hand ─────────────────────────────────────── */

  const lineOf = (h: HeardLine): string => (h.you === true ? `you:${h.phrase}` : h.phrase);

  function openLine(h: HeardLine): void {
    opened = opened === lineOf(h) ? null : lineOf(h);
    if (h.you === true) nameDraft = read?.name ?? h.phrase;
  }

  function takeOut(h: HeardLine): void {
    amends = h.you === true ? { ...amends, name: null } : { ...amends, out: [...amends.out, h.phrase] };
    opened = null;
  }

  function turnInto(h: HeardLine, pack: string): void {
    amends = { ...amends, out: amends.out.filter((x) => x !== h.phrase), to: { ...amends.to, [h.phrase]: pack } };
    opened = null;
  }

  function rename(): void {
    const n = nameDraft.trim();
    amends = { ...amends, name: n === '' ? null : n };
    opened = null;
  }

  /** What a line can become instead: every part on offer but the ones it already became. */
  const insteadOf = (h: HeardLine): string[] => INSTALL_ORDER.filter((id) => !h.became.split(/,\s*|\s+and\s+/u).includes(moduleName(id)));

  /* THE SENTENCE AGAIN, AS A FIELD. The name chosen from it is chosen again from what it says next. */
  function edit() {
    dropHuman();
    step = 'describe';
    /* BACK TO THE CONVERSATION, with one open question to tell it more. */
    if (asking === null) asking = { topic: 'things', question: chatWords.tellMore, choices: [], by: 'rules' };
    /* THE WORDS ARE HERS TO FINISH NOW, so the line about what the link left out has said its piece. */
    linkCut = false;
    said = null;
    if (!nameByHand) slug = '';
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(sentence.length, sentence.length);
    });
  }

  /* ── the name, from what was heard ─────────────────────────────────────── */

  /** Whether the person opened the name to change it, after which it is theirs and never chosen for them again. */
  let nameByHand = $state(false);
  let naming = $state(false);
  let namings = 0;

  /**
   * THE NAMES TO TRY: the business and the person heard; where neither was, the address's own name, which is why the
   * address being typed asks again (a pause after the last key), and only then.
   */
  const heardBases = $derived(recordNames(namesHeard(read ?? { name: null, rows: [] }), ''));
  const bases = $derived(heardBases.length > 0 ? heardBases : recordNames({ person: null, business: null }, email));

  $effect(() => {
    const tries = bases;
    if (step !== 'keep' || nameByHand) return;
    const mine = ++namings;
    if (tries.length === 0) {
      naming = false;
      /* A WHOLE ADDRESS THAT GIVES NO NAME ("j@…", "d41@…") opens the name field, or the press would wait for nothing. */
      if (heardBases.length === 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) nameByHand = true;
      return;
    }
    naming = true;
    const wait = setTimeout(() => {
      void chooseName(tries).then((got) => {
        if (mine !== namings) return;
        naming = false;
        if (got === null) {
          nameByHand = true;
          return;
        }
        slug = got;
        free = true;
      });
    }, heardBases.length > 0 ? 0 : 400);
    return () => clearTimeout(wait);
  });

  function changeName() {
    nameByHand = true;
    namings += 1;
    naming = false;
    void tick().then(() => document.getElementById('up-name')?.focus());
  }

  /* ── arriving ────────────────────────────────────────────────────────────── */

  let gone = false;
  onDestroy(() => {
    gone = true;
    dropHuman();
  });

  /* THE SIGN-UP IS A BRAINDOG ASSEMBLING for as long as it is open (`assembling.ts`): what it builds rises into place. */
  onMount(() => assemble());

  onMount(() => {
    void readCatalogueOffer().then((c) => (cat = c));
    /* THE FRAGMENT IS WIPED AS IT IS READ, so the proof never sits in the tab's history or a copied address. */
    const arrived = arrivalOf(location.hash, () => history.replaceState(history.state, '', location.pathname + location.search));
    const kept = heldOf(globalThis.sessionStorage);
    /* WHAT WAS SAID BEFORE THE MAIL, so the tab the link opened draws the build it is about to make. */
    const draft = saidKept(localStore());
    if (draft) {
      sentence = draft.said;
      /* ONLY THE LINK'S COPY SAYS `cut`: this device's own is the whole of it. */
      linkCut = arrived?.kind === 'verify' && draft.cut === true;
      chosen = draft.usecase;
      /* AND THE MODEL'S READING, where one was kept: it is what the screen shows of these words, and is not read again. */
      if (draft.reading !== undefined && draft.reading.by !== undefined && draft.reading.by !== 'rules') pressed = { said: draft.said, proposal: draft.reading, ask: null };
      /* AND WHAT WAS CHANGED AND ANSWERED, where this device kept it; a currency answered also rides in the link. */
      const kept = amendKept(localStore(), draft.said);
      amends = kept.amend;
      reply = replyOf(draft, kept);
    }
    /* THIS TAB'S PLAN FIRST, then the one kept across the mail; a link opened anywhere else is Free. */
    const lasting = kept?.plan ?? planKept(localStore());
    /* AN INVITATION: the code waits in this tab for the start, and the page opens as a plain visit does (the last branch). */
    if (arrived?.kind === 'code') keepCode(tabStore(), arrived.code);
    if (arrived?.kind === 'verify') {
      plan = lasting ?? 'free';
      void verify(arrived.token);
    } else if (arrived?.kind === 'paid') void waitForRecord(kept);
    else if (arrived?.kind === 'cancelled') {
      /* BACK FROM STRIPE UNPAID: they were paying, so a plan nobody kept is Cloud, the checkout's own default. */
      plan = lasting === 'plus' ? 'plus' : 'cloud';
      held = kept ? { ...kept, plan } : null;
      cancelled = true;
      step = 'pay';
    } else {
      plan = planOf(location.search);
      void ask();
    }
  });

  async function ask(): Promise<void> {
    step = 'loading';
    /* WHO MAY SIGN UP IS ASKED ONLY OF A HOST THAT SERVES SIGN-UP (`signup` on `/auth/methods`): a self-host has no such
       door, and asking it printed a 404 in the console. A host that says nothing of it has not opened sign-up, which is
       the closed page; one nobody reached is still asked, so it says "did not answer" as it did. */
    /* ASKED AS THE PAGE DREW, WHERE IT WAS (`early.ts`), so the field does not wait two more round trips after the page. */
    const { who, named } = await (takeEarly() ?? askFirst());
    if (named === null) {
      step = 'closed';
      return;
    }
    const out = named;
    /* A HOST THAT REFUSES THE QUESTION ANSWERED IT: one with no sign-up door (a self-host has none) has not opened
       sign-up, which is the closed page and its way to sign in. Only a host nobody reached is "did not answer". */
    if (!out.ok) {
      step = out.kind === 'refused' ? 'closed' : 'unreachable';
      return;
    }
    signedIn = who.ok ? who.value.me : null;
    /* CLOSED IS NO NEW RECORD FOR ANYBODY, signed in or not: checkout refuses a free one while it is. */
    if (out.value.mode === 'closed') {
      step = 'closed';
      return;
    }
    siteKey = out.value.turnstile;
    /* BY INVITATION, A STRANGER WITH NO CODE IS ASKED TO APPLY (`Apply.svelte`), with the host's check when it gives one.
       A person signed in needs none: their account is made, and a record of their own is checkout's to say. */
    if (out.value.mode === 'invite' && signedIn === null && codeKept(tabStore()) === null) {
      step = 'invite-only';
      return;
    }
    step = 'describe';
    await tick();
    /* UNDER A THUMB THE FIELD WAITS FOR A TAP: focused on load, the phone's keyboard covered That's me and the promises
       before a word was read. A keyboard and mouse still land in it. */
    if (!onPhone) field?.focus();
  }

  /* ── keeping it: one email ───────────────────────────────────────────────── */

  const ready = $derived(slug !== '' && free && !busy && !naming && (signedIn !== null || (email.trim() !== '' && (siteKey === null || human !== null))));
  /* NEVER A DEAD SEND: when the check's answer is all the form still waits for, Send's label says so (`widgetWords`). */
  const waitsForCheck = $derived(slug !== '' && free && !busy && !naming && signedIn === null && email.trim() !== '' && siteKey !== null && human === null);
  const checkWords = $derived(widgetWords(widgetState));

  /**
   * The sentence as it is kept across the mail, and the whole reading on screen where it is the reading of these very
   * words, so the tab the link opens builds what was shown and reads nothing again.
   */
  const draftNow = (): Draft => ({
    said: sentence.trim(),
    /* THE CURRENCY SAID, Money or not (AP9): the build makes the record in it only where Money is kept. */
    currency: money === null ? moneyNow : (currencyPick ?? read?.currency ?? null),
    usecase: chosen,
    reply,
    ...(live !== null && liveFor === sentence && sentence === sentence.trim() ? { reading: live } : {}),
  });

  /** The sentence kept across the mail, and beside it what was changed by hand and answered. */
  function keepAll(): void {
    keepSaid(localStore(), draftNow());
    keepAmend(localStore(), { said: sentence, amend: amends, reply });
  }

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    /* ONE PRESS, ONE MAIL: a second press while the first is out does nothing. */
    if (!ready) return;
    /* HER NAME AT THE START, AND THE RECORD'S WHEN IT IS MADE (`nameSent`, `titleSent`): the record opens as the name she
       was shown, "Mariam's Candles", and she is Mariam. */
    const person = nameSent(read, email);
    if (signedIn !== null) {
      /* NO MAIL TO WAIT ON: kept now, because a paid plan leaves for Stripe's page and comes back to a new page load. */
      keepAll();
      held = { slug, name: titleSent(read, person || null), tz: zoneSent(), plan };
      hold(globalThis.sessionStorage, held);
      if (plan === 'free') void makeFree(held);
      else step = 'pay';
      return;
    }
    busy = true;
    said = null;
    /* WHAT WAS SAID RIDES IN THE LINK (`said`), so a link opened on another device builds the same BrainDog. */
    const out = await startSignup({ email, slug, name: person, tz: zoneSent(), turnstile: human, code: codeKept(tabStore()), said: draftNow() });
    busy = false;
    if (out.ok && out.value.proof !== null) {
      /* THE INVITATION WAS MAILED TO THIS ADDRESS, so it proved it: no second mail, straight on to the build. */
      keepCode(tabStore(), null);
      keepAll();
      hold(globalThis.sessionStorage, { slug, name: titleSent(read, person.trim() || null), tz: zoneSent(), plan });
      keepPlan(localStore(), plan);
      await verify(out.value.proof);
      return;
    }
    if (out.ok) {
      sentTo = email.trim();
      sentCut = saidFromLink(saidForLink(draftNow()))?.cut === true;
      /* THE CODE IS HELD BY THE PROOF JUST MAILED, so this tab has no more use for it. */
      keepCode(tabStore(), null);
      /* KEPT ONLY ONCE THE HOST SAID YES, so a refused address leaves nobody's words on this device. */
      keepAll();
      /* KEPT NOW AS WELL AS IN THE PROOF, so a proof opened in this tab still finds the name if the mail was slow. */
      hold(globalThis.sessionStorage, { slug, name: titleSent(read, person.trim() || null), tz: zoneSent(), plan });
      keepPlan(localStore(), plan);
      step = 'sent';
      await tick();
      document.getElementById('sent-h')?.focus();
      return;
    }
    resetHuman();
    said = out.kind === 'refused' ? (out.fix ?? words.sendFailed) : out.kind === 'locked' ? copy.signupLocked(Math.ceil(out.retryAfter / 60)) : copy.unreachableWhy;
  }

  /* ANOTHER ADDRESS: back to the one field, with the build and the name as they were. */
  function otherAddress(): void {
    dropHuman();
    said = null;
    step = 'keep';
    void tick().then(() => document.getElementById('up-email')?.focus());
  }

  /* ── the link: the record, then the build written into it ───────────────── */

  async function verify(token: string): Promise<void> {
    step = 'verifying';
    const out = await verifySignup(token);
    if (!out.ok) {
      /* A LINK THIS DEVICE SPENT ALREADY IS SAID AS USED, with the way on that fits (`usedLink`). */
      if (out.kind === 'refused' && (await usedLink(token))) return;
      /* THE HOST'S OWN SENTENCE when it refused with one, the wait when it locked, and never "expired" for a lost line. */
      linkWhy = out.kind === 'refused' ? out.fix : out.kind === 'locked' ? copy.signupLocked(Math.ceil(out.retryAfter / 60)) : words.linkUnreached;
      step = 'link-failed';
      return;
    }
    /* THE RECORD IS MADE UNDER THE NAME SHE WAS SHOWN, read again from the sentence the link carried while the page's own
       reading of it may not be back yet. */
    const shown = read ?? (sentence.trim() === '' ? null : settle(await readingKept(saidKept(localStore()), reading)(sentence), amends, null, sentence));
    held = { slug: out.value.slug, name: titleSent(shown, out.value.name), tz: out.value.tz, plan };
    hold(globalThis.sessionStorage, held);
    await keepSpent(localStore(), token, { email: out.value.email, slug: out.value.slug });
    if (plan !== 'free') {
      step = 'pay';
      return;
    }
    /* THE PASSKEY AT ONCE, BEFORE THE BUILD (use case 6, step 4): this device's own lock is the next sign-in, offered
       while the link is still in hand, and its "Not now" goes on without it. Where it cannot help, straight on. */
    if (await lockable()) {
      step = 'lock';
      await tick();
      document.getElementById('lock-h')?.focus();
      return;
    }
    void makeFree(held);
  }

  /** A link this device spent: for whom, and whether this browser is signed in and owns a BrainDog to open. */
  let used = $state<{ email: string; signedIn: boolean; owns: string | null } | null>(null);

  /**
   * WHETHER THE LINK WAS SPENT ON THIS DEVICE (`spentFor`), and if so the screen that says it was used (first hour
   * audit, E15): the BrainDog to open where this browser is signed in and owns one, the make where it owns none, and
   * Sign in with that address where it is signed out. A link this device never spent is the plain refusal, as before.
   */
  async function usedLink(token: string): Promise<boolean> {
    const was = await spentFor(localStore(), token);
    if (was === null) return false;
    const who = await methods();
    const me = who.ok ? who.value.me : null;
    let owns: string | null = null;
    if (me !== null) {
      const account = await billing();
      const records = account.ok ? account.value.records : [];
      owns = (records.find((r) => r.slug === was.slug) ?? records[0])?.slug ?? null;
    }
    used = { email: me?.email ?? was.email, signedIn: me !== null, owns };
    step = 'link-used';
    return true;
  }

  /** Open the BrainDog a used link made, in this browser. */
  async function openUsed(slug: string): Promise<void> {
    busy = true;
    await openOwned(slug);
    location.assign(at('/', `${BASE}/${slug}/`));
  }

  /**
   * Whether the passkey would help, by `PasskeyFirst`'s own rule (`passkeyOffered`): asked here first so a person it
   * would not help never sees the step at all.
   */
  async function lockable(): Promise<boolean> {
    const can = support();
    return can.webauthn && can.secure && passkeyOffered(can, await methods());
  }

  function lockDone(): void {
    if (step === 'lock' && held !== null) void makeFree(held);
  }

  /** Whether this is a phone, for "Open it on this phone". */
  const onPhone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  /** Storage the made record no longer needs, in this tab and across the mail. */
  function forget(): void {
    try {
      globalThis.sessionStorage?.removeItem(HELD_KEY);
    } catch {
      /* Storage off: nothing was kept, so nothing is left behind. */
    }
    keepPlan(localStore(), null);
    keepSaid(localStore(), null);
    keepAmend(localStore(), null);
  }

  /** The line under "Making your BrainDog": which stage it is at. */
  let stage = $state('');
  /** What the call said it could not make: each part in the person's words, with the record's own sentence for why. */
  let missed = $state.raw<NotMade[]>([]);
  /**
   * THE RECORD BEING MADE, WATCHED (`../start/Making.svelte`, as `/start` mounts it): the parts this press writes, what
   * the new record holds of them, read every 400 ms while `setup` runs, and the call's own answer once it is back.
   * `null` until a build is being written, so making the record itself is still the title and its one line.
   */
  let watched = $state.raw<{ parts: MakingPart[]; held: readonly HeldPart[]; answer: readonly Refused[] | null } | null>(null);

  /**
   * THE TILES OF THIS PRESS: what `asked` writes and nothing else, drawn as the build drew them (their name, glyph and
   * the phrase that turned each on) and in the order heard. A part the screen never drew, since the sentence came off a
   * link and was read here only to be built, is named from the catalogue.
   */
  function tilesOf(asked: Accepting): MakingPart[] {
    const cases = [asked.usecase, ...asked.also].filter((id): id is string => id !== null);
    const ids = new Set([...cases.map((id) => `usecase-${id}`), ...asked.modules]);
    const drawn = stepsOf(parts)
      .filter((p) => ids.has(p.id))
      .map((p): MakingPart => ({ id: p.id, name: p.name, icon: p.icon, why: p.why }));
    const rest: MakingPart[] = [];
    for (const id of cases) {
      const one = caseOf(id);
      if (one && !drawn.some((p) => p.id === `usecase-${id}`)) rest.push({ id: `usecase-${id}`, name: one.title, icon: 'home' });
    }
    for (const id of asked.modules) if (!drawn.some((p) => p.id === id)) rest.push({ id, name: moduleName(id), icon: partIcon(id) });
    return [...drawn, ...rest];
  }
  let madeAt = $state('');
  /**
   * The press that did not finish, to make again from here: the record by its name, and what is still to write. `null`
   * once everything went in, or when there is nothing to make again.
   */
  let again = $state.raw<{ name: string; asked: Accepting } | null>(null);

  /** The person moved on to the record as it is: nothing more is made from here, so the words are forgotten. */
  function openAsIs(): void {
    forget();
    location.assign(at(madeAt));
  }

  /**
   * A free record, made there and then, and opened in this browser; then the build written into it.
   *
   * A REFUSAL IS THE HOST'S SENTENCE OVER THE NAME, which can be changed and made again; a free record refused for its
   * plan is offered the paid way instead.
   */
  async function makeFree(asked: Held): Promise<void> {
    step = 'making';
    stage = words.makingRecord;
    busy = true;
    said = null;
    const out = await checkout({ ...asked, plan: 'free' });
    if (out.ok) {
      await openOwned(asked.slug);
      await build(asked.slug, out.value);
      return;
    }
    /* ONLY THE ACCOUNT'S OWN YES DRAWS "MAKE IT AGAIN": a host that did not answer is a no. */
    const account = await billing();
    canMake = account.ok && account.value.canMake;
    retry = out.kind !== 'refused';
    busy = false;
    slug = asked.slug;
    paidOnly = out.kind === 'refused' && out.at === 'plan';
    said = out.kind === 'refused' ? (out.fix ?? words.makeFailed) : out.kind === 'locked' ? copy.signupLocked(Math.ceil(out.retryAfter / 60)) : copy.unreachableWhy;
    step = 'make-failed';
  }

  /**
   * THE BUILD, WRITTEN INTO THE RECORD JUST MADE, IN THIS PAGE: the reading the person kept, never read again
   * (`readingKept`), then `/start`'s own `accept()` against the new record by its name, then its `/start#made`. Only a
   * sentence kept with no reading (kept before there were readings, or a link too long to carry one) is read again, by the
   * rules. With no sentence to build from, its `/start` asks the question there. `fallback` is where the host said the
   * record opens.
   */
  async function build(name: string, fallback: string): Promise<void> {
    const draft = saidKept(localStore()) ?? (sentence.trim() === '' ? null : draftNow());
    const signed = draft ? await methods() : null;
    /* THE READING KEPT, WITH WHAT WAS CHANGED AND ANSWERED LAID OVER IT, so the build is the one the screen showed (`accepting`). */
    const asked = draft
      ? await accepting(draft, amendKept(localStore(), draft.said), readingKept(draft, reading), {
          device: deviceOf(),
          today: dayOf(Date.now()),
          email: signed?.ok ? (signed.value.me?.email ?? null) : null,
          nav: pref.read().nav ?? [],
          locale,
        })
      : null;
    if (asked === null) {
      forget();
      location.assign(at(draft ? `${BASE}/${name}/start` : fallback));
      return;
    }
    /* THE CURRENCY SAID ON THE KEEP STEP, KEPT FOR THIS BRAINDOG ON THIS DEVICE (AP9): the record keeps it only where
       Money is; elsewhere it waits here for the day Money is turned on, and the drafts on Today read amounts in it. */
    keepCurrencyGuess(apiBase({ origin: apiBase(), pathname: `${BASE}/${name}/` }), asked.currency ?? draft?.currency ?? currencyChoices(draft?.said ?? '', deviceOf()).suggested);
    const one = caseOf(asked.usecase);
    stage = words.makingParts([...(one ? [one.title] : []), ...asked.modules.map(moduleName)].slice(0, 4));
    /* A BUILD THIS DEVICE ALREADY PRESSED FOR (a reload mid-press): the same key, sent with `again`, so the record
       writes only what it does not hold yet and nothing a second time. AFTER A PRESS THAT ANSWERED IN PART, only what
       it left, under its Try again's own key (`pressKept`): the whole plan under the first key would write a second
       time whatever a Try again had put in under its own. */
    await write(name, pressKept(asked, draft));
  }

  /**
   * ONE CALL TO THE RECORD'S OWN `setup` AGAINST THE NEW RECORD, and what it came back with. It goes through
   * `/start`'s `accept()`, which hands `bodyOf(asked)` to `client.setup`, so a closed tab no longer leaves the record
   * part made: the record carries the call through by itself.
   *
   * WATCHED WHILE IT RUNS: what the record holds is read every 400 ms and drawn tile by tile (`Making.svelte`).
   *
   * THE WORDS ARE FORGOTTEN ONLY WHEN ALL OF IT WENT IN. A press that did not answer, or that missed something, keeps the
   * sentence and offers Try again, which is sent with `again`, so the record writes only what is still missing.
   */
  async function write(name: string, given: Accepting): Promise<void> {
    step = 'making';
    busy = true;
    const tiles = tilesOf(given);
    watched = tiles.length > 0 ? { parts: tiles, held: [], answer: null } : null;
    const { accept, pressAgain, pressKey } = await import('../start/accept.ts');
    /* ONE HANDLE FOR THE BUILD, set here once and kept through every Try again of a press nobody answered: a call that
       went in and never answered is told from a new press by it, so its entries are not written a second time. */
    const asked: Accepting = given.key === undefined ? { ...given, key: pressKey() } : given;
    /* KEPT BESIDE THE SENTENCE, so a reload presses under this key and not a new one. Only the build's first key is
       kept: a Try again's new one passes through here too, and `keepKey` leaves the first where it is. */
    keepKey(localStore(), asked.key!);
    /* THE NEW RECORD BY ITS NAME: this page is under no slug, so its own base is the host's, and the record's is under it. */
    const client = createClient({ base: apiBase({ origin: apiBase(), pathname: `${BASE}/${name}/` }) });
    /* NOTHING TO DRAW, NOTHING READ: a build with no part on is the title and its one line, and the record is left alone. */
    const stop =
      watched === null
        ? () => {}
        : watchHeld(
            async () => {
              const held = await client.packs();
              return held.ok ? (held.value as readonly HeldPart[]) : null;
            },
            (held) => {
              if (watched && watched.answer === null) watched = { ...watched, held };
            },
          );
    const out = await accept(client, asked).catch(() => null);
    stop();
    if (out?.nav) pref.write({ nav: out.nav });
    /* NOTHING ANSWERED: the record may be empty, so opening it as it is lands on its /start, which asks the question
       there, not on the end of a first run that never wrote anything. */
    madeAt = at(out === null ? '/start' : '/start#made', `${BASE}/${name}/`);
    /* THE PLACES MADE, BY NAME, for the end to say first ("Your BrainDog is made, with Orders, People and Money"): this
       tab opens it next, so they wait in the tab (`MADE_PLACES` in `start/+page.svelte`). */
    try {
      globalThis.sessionStorage?.setItem('braindog.made.places', JSON.stringify(railPlaces(asked.proposal.places, filledBy(asked.proposal.rows)).filter((x) => x.kind !== 'today').map((x) => x.name)));
      /* AND THE ADD-ONS A TRADE SAID NAMES (AH8, FB5): offered by name at the end, never installed by the sentence. */
      globalThis.sessionStorage?.setItem(MADE_ADDONS, JSON.stringify(tradeAddons(sentence, cat).map((u) => ({ id: u.id, title: u.title, summary: u.summary }))));
      /* AND THE WORDS WITH WHAT THEY BUILT (1 Nov): the made screen has the model read them once more, as the owner now,
         and offers what it finds beyond the build as drafts on Today (`first-drafts.ts`). Never the whole reading. */
      /* WITH THE FIRST TO-DOS DRAWN FROM WHAT THEY KEEP FIRST AND THE CLIENTS THEY NAMED (`withTodos`), as `/start` does. */
      const clients = given.proposal.rows
        .filter((r) => (r.register === 'organisations' && r.fields['kind'] === 'client') || (r.register === 'people' && r.fields['role'] === 'client'))
        .map((r) => String(r.fields['name'] ?? ''));
      /* AND WHO THEY PAY FOR THE WORK, so "paying editors" first is "Pay Kai and Rosa" (onboarding7). */
      const crew = given.proposal.rows.filter((r) => r.register === 'people' && r.fields['role'] === 'contractor').map((r) => String(r.fields['name'] ?? ''));
      globalThis.sessionStorage?.setItem(MADE_SAID, JSON.stringify(saidMade(withTodos(given.sentence, clients, crew), given.proposal.rows, given.proposal.usecase)));
    } catch {
      /* Storage off: the end says only that it is made. */
    }
    if (allWritten(out)) {
      again = null;
      forget();
      /* THE CALL'S OWN WORD, newer than the last reading: nothing refused, so every tile says made as the record opens. */
      if (watched) watched = { ...watched, answer: [] };
      stage = words.makingOpen;
      location.assign(at(madeAt));
      return;
    }
    /* WHAT IS LEFT, ASKED FOR WITH `again`: the record writes only what it does not hold yet. A call that never answered
       here but may have gone in there is sent under the same key, so it is not written twice; one that answered hands
       back the entries it did not write, which go under a new key, over the rail order this press already wrote
       (`pressAgain`). */
    const next = pressAgain(asked, out);
    again = { name, asked: next };
    /* AN ANSWERED PRESS HANDS BACK A NEW KEY FOR WHAT IS LEFT, AND BOTH ARE KEPT BESIDE THE SENTENCE (`keepLeft`), so a
       reload sends what Try again would have: only what is left, under that key, with `again`. A Try again that went
       in before the reload is passed over, and nothing is written twice. The first key stays
       where it is (`keepKey`) and is what a reload uses when this cannot be kept. A press nobody answered keeps its
       key and what it asked for, so there is nothing new to keep. */
    if (out !== null && !out.unheard) {
      keepLeft(localStore(), { key: next.key!, rows: [...next.proposal.rows], ...(next.plan === undefined ? {} : { plan: [...next.plan] }), ...(next.drafted === null ? { filed: true } : {}) });
    }
    /* THE PART-MADE STATE IS THE CALL'S OWN ANSWER: what it said it could not make, and why, and nothing guessed. */
    missed = out === null ? [] : out.failed;
    watched = null;
    busy = false;
    step = 'made-partly';
  }

  function writeAgain(): void {
    if (busy || again === null) return;
    stage = words.makingAgain;
    void write(again.name, again.asked);
  }

  function makeAgain(e: SubmitEvent): void {
    e.preventDefault();
    if (busy || !free || slug === '' || held === null) return;
    held = { ...held, slug };
    hold(globalThis.sessionStorage, held);
    void makeFree(held);
  }

  /* A SECOND RECORD IS ON A PAID PLAN: the payment step, on Cloud, with the name as it stands. */
  function payInstead(): void {
    plan = 'cloud';
    held = held ? { ...held, slug: slug || held.slug, plan } : null;
    if (held) hold(globalThis.sessionStorage, held);
    keepPlan(localStore(), plan);
    said = null;
    step = 'pay';
  }

  /* ── a paid plan: the payment is in, and the record is made from it ─────── */

  /** How often the list is asked while Stripe's word travels to the Directory, and how many times before the page says so. */
  const EVERY_MS = 2_000;
  const TRIES = 30;

  async function waitForRecord(kept: Held | null): Promise<void> {
    held = kept;
    step = 'waiting';
    for (let i = 0; i < TRIES && !gone; i += 1) {
      const out = await billing();
      if (out.ok) {
        /* THE NAME ASKED FOR OR ITS FIRST FREE NEIGHBOUR; with nothing kept in this tab, the one record that is paid for. */
        const found = kept ? madeFor(out.value.records, kept.slug) : (out.value.records.find((r) => r.state === 'active') ?? null);
        if (found) {
          const opened = await openOwned(found.slug);
          if (opened.ok) {
            step = 'making';
            stage = words.makingRecord;
            await build(found.slug, at('/start', `${BASE}/${found.slug}/`));
            return;
          }
        }
      }
      await new Promise((r) => setTimeout(r, EVERY_MS));
    }
    if (!gone) step = 'slow';
  }

  /* ── drawing ─────────────────────────────────────────────────────────────── */

  /** Whether the build is being written into the record now, so its tiles are the whole screen (`Making.svelte`). */
  const watching = $derived(step === 'making' && watched !== null);
  /** Whether the build stands beside the words: while describing, asking and keeping. */
  const showBuild = $derived(step === 'describe' || step === 'keep');
  /**
   * Whether the step is one column, drawn in the entry sheet as sign in is (first F5): every step but the three that
   * stand beside the build, and the build being written, which takes the whole board.
   */
  const sheet = $derived(!showBuild && !watching);

  /* THIS SCREEN'S FIRST DRAW IS ITS STEP, whichever it is, once the host has answered or the address has said. */
  $effect(() => {
    if (step !== 'loading' && step !== 'verifying') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

{#snippet signInLink()}
  {#if step === 'describe' || step === 'keep'}
    <!-- ON A PHONE A QUIET 44PX "Sign in"; FROM 640 THE SENTENCE in the second ink with only "Sign in" a link (first F9). -->
    <span class="have-wide">{words.haveAsk} <a class="have-link" href={at('/signin')}>{copy.signIn}</a></span>
    <span class="have-narrow"><Button href="/signin">{copy.signIn}</Button></span>
  {/if}
{/snippet}

<!-- THE SENTENCE ONCE KEPT: her words as she typed them, with no indent, and the bare way back to them on the same edge. -->
{#snippet saidLine()}
  <div class="said-line">
    <p class="said-text">{sentence.trim()}</p>
    <button type="button" class="link plain said-edit" disabled={busy} onclick={edit}>{words.edit}</button>
  </div>
  {#if linkCut}<p class="quiet">{words.linkCut}</p>{/if}
{/snippet}

<!-- APPLY'S RAIL: what happens next, three plain lines each with its number in a quiet well (first F5). -->
{#snippet nextSteps()}
  <section class="next" aria-labelledby="next-h">
    <h2 class="next-h" id="next-h">{words.nextTitle}</h2>
    <ol class="next-list">
      {#each words.nextLines as line, i (line)}
        <li class="next-line"><span class="next-n" aria-hidden="true">{i + 1}</span>{line}</li>
      {/each}
    </ol>
  </section>
{/snippet}

{#snippet stepNow()}
  {#if step === 'loading' || step === 'verifying'}
    <!-- NOTHING IS ASKED BEFORE THE HOST SAYS SIGN-UP IS OPEN: the page's name, never "Who are you?", which a closed
         host would take straight back. -->
    <h1 class="entry-title">{step === 'verifying' ? words.making : words.title}</h1>
    <p class="quiet" role="status">{step === 'verifying' ? copy.signupVerifying : copy.checkingWays}</p>
  {:else if step === 'unreachable'}
    <Empty kind="error" heading title={copy.unreachableTitle} body={copy.unreachableWhy}>
      {#snippet actions()}<Button weight="primary" onclick={() => void ask()}>{copy.askAgain}</Button>{/snippet}
    </Empty>
  {:else if step === 'closed'}
    <!-- THE QUESTION, AND ITS ANSWER IS THE BUTTON: "Sign in." said in the line and again on the button was one way said
         twice. -->
    <h1 class="entry-title">{copy.signupClosedTitle}</h1>
    <p class="entry-lede">{words.haveAsk}</p>
    <div class="go"><Button weight="primary" href="/signin">{copy.signIn}</Button></div>
  {:else if step === 'invite-only'}
    <Apply {siteKey} />
  {:else if step === 'describe'}
    <h1 class="entry-title" id="who-h">{chatWords.title}</h1>
    <!-- THE CONVERSATION (1 Nov): BrainDog asks, one question at a time, and the build beside it forms with each answer.
         Each answer is read by the model at this host's reading door while reads are left (`readPressed`), else here. -->
    <Chat turns={chatTurns} current={asking} thinking={talking} {busy} onanswer={(a) => void answerChat(a)} onskip={() => void answerChat(null)} onenough={() => void keep()} />
    <ul class="promises">
      {#each words.promises as line, i (line)}
        {#if i > 0 || plan === 'free'}<li><Icon name="check" size="s" />{line}</li>{/if}
      {/each}
    </ul>
  {:else if step === 'keep'}
    <h1 class="entry-title" id="keep-h" tabindex="-1">{words.keepTitle}</h1>
    {@render saidLine()}
    {#if signedIn || plan !== 'free'}
      <p class="entry-lede">{signedIn ? (plan === 'free' ? words.keepSignedIn : words.keepSignedInPaid) : words.keepLedePaid}</p>
    {/if}
    <form class="form" onsubmit={send}>
      <!-- THE NAME IT WILL HAVE, with Change: the places are on the build beside, and are not said twice (first F10). -->
      <section class="kept">
        {#if nameByHand}
          <NameField bind:value={slug} bind:free id="up-name" />
        {:else if naming || read?.title || slug !== ''}
          <!-- WHAT THE BOX HOLDS: a name alone in a box read as anybody's, the email's local part above all. -->
          <!-- THE NAME, AND THE ADDRESS APART (AH26): "Sam's BrainDog" over "app.brain.dog/sam", and Change changes the address. -->
          <p class="field-label kept-label">{words.calledLabel}</p>
          <h2 class="kept-name" aria-live="polite">{naming ? words.calledFinding : (read?.title ?? ownName(nameSent(read, email)) ?? words.calledNone)}</h2>
          {#if !naming && slug !== ''}
            <div class="kept-head">
              <p class="kept-at"><span class="kept-at-label">{words.addressLabel}</span> <span class="kept-at-url">{addressHost}/{slug}</span></p>
              <button type="button" class="link plain" onclick={changeName}>{words.change}</button>
            </div>
          {/if}
        {/if}
      </section>

      <!-- THE ZONE AND THE CURRENCY, GUESSED AND SAID IN ONE LINE (1 Nov): Change opens both in place, and a place the words
           named that keeps another clock is one tap. Nothing here is asked; the press below keeps what the line says. -->
      {#if zoneNow !== null}
        <section class="set" data-forming="set" aria-labelledby="set-h">
          <p class="field-label" id="set-h">{words.setTitle}</p>
          {#if !setOpen}
            <div class="set-row set-said">
              <p class="set-line">{words.setLine(zonePlace(zoneNow), moneyNow === null ? null : currencyWord(moneyNow))}</p>
              <button
                type="button"
                class="link plain"
                aria-expanded="false"
                onclick={() => {
                  /* THE CURRENCY SAID IS THE ONE SHOWN CHOSEN (AP19), never a row of bare words under "Suggested". */
                  currencyPick ??= moneyNow;
                  setOpen = true;
                }}>{words.setChange}</button
              >
            </div>
            {#if zoneOffer !== null && zoneOffer.zone !== zoneNow}
              {@const offer = zoneOffer}
              <div class="set-row">
                <p class="quiet">{words.setPlaced(offer.place)}</p>
                <Button size="sm" weight="quiet" onclick={() => (tzPick = offer.zone)}>{words.setUse(zonePlace(offer.zone))}</Button>
              </div>
            {/if}
          {:else}
            <label class="field-label" for="set-zone">{words.setZone}</label>
            <span class="field">
              <select id="set-zone" class="field-input" value={zoneNow} onchange={(e) => (tzPick = e.currentTarget.value)}>
                {#each zonesOffered as g (g.area)}
                  <optgroup label={g.area}>
                    {#each g.zones as z (z)}<option value={z}>{zonePlace(z)}</option>{/each}
                  </optgroup>
                {/each}
              </select>
            </span>
            {#if moneyAsk !== null}
              <Currency
                bind:value={currencyPick}
                {locale}
                choices={moneyAsk.choices}
                suggested={moneyNow ?? moneyAsk.suggested}
                quiet
                find={moneyAsk.find}
              />
            {/if}
            <div class="chips"><Button weight="quiet" onclick={() => (setOpen = false)}>{words.setDone}</Button></div>
          {/if}
        </section>
      {/if}

      {#if signedIn === null}
        <!-- `email-row`, NEVER `row`: the ledger's global `.row` drew a rule under it and cut the field short. -->
        <div class="email-row">
          <label class="field-label" for="up-email">{copy.emailLabel}</label>
          <span class="field field-lg">
            <input
              id="up-email"
              class="field-input"
              type="email"
              inputmode="email"
              autocomplete="email"
              spellcheck="false"
              autocapitalize="none"
              required
              maxlength="254"
              placeholder={copy.emailLike}
              bind:value={email}
            />
          </span>
        </div>
        {#if siteKey !== null}
          <!-- THE HELD BOX STAYS WHEN THE SCRIPT FAILS: its line and Try again sit in it, side by side, at its height. -->
          <div class="human" role="group" aria-label={copy.signupHuman} bind:this={widget}>
            {#if widgetState === 'failed'}
              <div class="human-failed">
                <p class="human-line" role="alert">{checkWords.line}</p>
                <span class="human-again"><Button onclick={retryTurnstile}>{checkWords.again}</Button></span>
              </div>
            {/if}
          </div>
        {/if}
      {/if}

      {#if said}<p class="bad" role="alert">{said}</p>{/if}

      <!-- NOT HELD TO THE FOOT WHILE TIME AND MONEY ARE OPEN (AP19): on a phone it sat over the email field. -->
      <div class="go" class:sticky={!setOpen}>
        <Button weight="primary" type="submit" disabled={busy || naming || slug === '' || !free} aria-busy={busy}>
          {signedIn ? words.makeNow : busy ? words.sending : waitsForCheck ? checkWords.send : words.send}
        </Button>
      </div>
      {#if signedIn === null && plan === 'free'}<p class="quiet open-here">{onPhone ? words.openHere : words.openHereWide}</p>{/if}
      <p class="quiet agree">
        {words.agree} <a class="link" href="https://brain.dog/legal/terms" target="_blank" rel="noopener">{words.terms}</a>
        {words.agreeAnd} <a class="link" href="https://brain.dog/legal/privacy" target="_blank" rel="noopener">{words.privacy}</a>.
      </p>
    </form>
  {:else if step === 'lock'}
    <h1 class="entry-title" id="lock-h" tabindex="-1">{words.lockTitle}</h1>
    <!-- ITS ONE PRESS IS THE STEP'S PRIMARY, and "Not now" or a passkey made goes on to the build (`ondone`). -->
    <PasskeyFirst ondone={lockDone} />
  {:else if step === 'sent'}
    <h1 class="entry-title" id="sent-h" tabindex="-1">{copy.signupCheckMail}</h1>
    <p class="entry-lede">{copy.signupMailSent(sentTo)}</p>
    {#if sentence.trim() !== ''}<p class="quiet">{sentCut ? words.sentCut : words.sentWhy}</p>{/if}
    <div class="go"><Button weight="quiet" onclick={otherAddress}>{copy.signupOtherAddress}</Button></div>
  {:else if step === 'link-failed'}
    <h1 class="entry-title">{copy.signupLinkFailed}</h1>
    <p class="entry-lede" role="alert">{linkWhy ?? copy.signupLinkFailedWhy}</p>
    <div class="go"><Button weight="primary" onclick={() => void ask()}>{copy.signupStartAgain}</Button></div>
    <p class="aside"><a class="link" href={at('/signin')}>{words.usedElsewhere}</a></p>
  {:else if step === 'link-used' && used}
    <h1 class="entry-title">{words.linkUsedTitle}</h1>
    {#if used.signedIn && used.owns}
      {@const mine = used.owns}
      <p class="entry-lede" role="status">{words.linkUsedOpen}</p>
      <div class="go"><Button weight="primary" onclick={() => void openUsed(mine)} disabled={busy}>{words.openMine}</Button></div>
    {:else if used.signedIn}
      <p class="entry-lede" role="status">{words.linkUsedMake}</p>
      <div class="go"><Button weight="primary" onclick={() => void ask()}>{words.makeRecord}</Button></div>
    {:else}
      <p class="entry-lede" role="status">{words.linkUsedSignIn(used.email)}</p>
      <div class="go"><Button weight="primary" href={`${at('/signin')}#email=${encodeURIComponent(used.email)}`}>{words.signIn}</Button></div>
    {/if}
  {:else if step === 'making'}
    <h1 class="entry-title">{words.making}</h1>
    <p class="entry-lede" role="status">{stage}</p>
  {:else if step === 'made-partly'}
    <h1 class="entry-title">{words.madeTitle}</h1>
    <p class="entry-lede" role="status">{missed.length > 0 ? words.madePartly : words.madeUnreached}</p>
    {#if missed.length > 0}
      <ul class="missed">
        <!-- THE CALL'S OWN ANSWER: the part in the person's words, and under it the record's sentence for why. -->
        {#each missed as m, i (i)}
          <li>
            {m.said}
            {#if m.why.trim() !== '' && m.why !== m.said}<span class="missed-why">{m.why}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    <div class="go"><Button weight="primary" onclick={writeAgain} disabled={busy || again === null}>{words.tryAgain}</Button></div>
    <p class="aside"><button class="link plain" type="button" onclick={openAsIs}>{words.openAsIs}</button></p>
  {:else if step === 'make-failed'}
    <h1 class="entry-title">{words.makeRecord}</h1>
    {#if said}<p class="entry-lede" role="alert">{said}</p>{/if}
    {#if paidOnly}
      <div class="go"><Button weight="primary" onclick={payInstead}>{words.payInstead}</Button></div>
    {:else if canMake}
      <form class="form" onsubmit={makeAgain}>
        <NameField bind:value={slug} bind:free id="make-name" />
        <div class="go sticky">
          <Button weight="primary" type="submit" disabled={busy || !free || slug === ''} aria-busy={busy}>
            {busy ? words.makingNow : slug === '' ? words.makeRecord : words.makeFor(slug)}
          </Button>
        </div>
      </form>
      <p class="aside"><button class="link plain" type="button" onclick={payInstead}>{words.payInstead}</button></p>
    {:else if retry}
      <!-- THE ACCOUNT DID NOT SAY A RECORD CAN BE MADE (or did not answer): no name to change, only the same press
           again, and only after a lock or a host that did not answer. A refusal, sign-up closed among them, is its
           sentence alone, since pressing again would be refused the same way. -->
      <div class="go"><Button weight="primary" disabled={busy || held === null} onclick={() => held && void makeFree(held)}>{words.tryAgain}</Button></div>
    {/if}
  {:else if step === 'pay'}
    <NoRecord title={held ? copy.signupPayFor(held.slug) : copy.noRecordTitle} {held} note={cancelled ? copy.signupCancelled : null} />
  {:else if step === 'waiting' || step === 'slow'}
    <h1 class="entry-title">{copy.signupWaiting}</h1>
    <p class="entry-lede" role="status">{step === 'slow' ? copy.signupWaitingSlow : copy.signupWaitingWhy}</p>
    {#if step === 'slow'}
      <div class="go"><Button weight="primary" onclick={() => void waitForRecord(held)}>{copy.signupCheckAgain}</Button></div>
    {/if}
  {/if}
  {#if step === 'describe' && siteKey !== null}
    <!-- THE READ'S OWN BOT CHECK, drawn only when Cloudflare needs the person to do something (`freshHuman`). -->
    <div class="read-human" role="group" aria-label={copy.signupHuman} bind:this={readSlot}></div>
  {/if}
{/snippet}

<!-- ONE FRAME, TWO SHAPES (`../signin/Entry.svelte`, first F5). A step that is one column (closed, Apply, check your email,
     the lock, made partly) stands in the 440 sheet, as sign in does; describing and keeping stand across the window, the
     words in a tile on the left and the build beside them. The brand is in the same place either way. -->
{#if sheet}
  <Entry aside={step === 'invite-only' ? nextSteps : undefined}>
    <div class="talk">{@render stepNow()}</div>
  </Entry>
{:else}
  <Frame end={signedIn === null ? signInLink : undefined}>
    <div class="board" data-paired={showBuild ? '' : undefined}>
      {#if watching && watched}
        <!-- THE BUILD BEING WRITTEN, tile by tile across the whole board: each part says where it is, read from the record. -->
        <Making parts={watched.parts} states={makingStates(watched.parts, watched.held, watched.answer)} />
      {:else}
        <div class="talk" data-tile>{@render stepNow()}</div>

        {#if showBuild}
          <aside class="build" aria-label={firstRun.mineTitle} data-forming="build">
            <Forming
              parts={stepsOf(parts)}
              left={read ? parts.filter((p) => !p.on && !p.id.startsWith('usecase-')).map((p) => ({ id: p.id, name: p.name })) : []}
              said={sentence}
              title={read?.title ?? null}
              ghost={read === null}
              settled={step !== 'describe'}
              {busy}
              {locale}
              onremove={step === 'describe' || step === 'keep' ? partOut : undefined}
              onrestore={step === 'describe' || step === 'keep' ? partBack : undefined}
            />
            <!-- A TURN'S MODEL READING STILL OUT AFTER THE CONVERSATION WENT ON WITH THE RULES' (1 Nov; onboarding10: the only
                 reading this page asks is a turn's, the whole one is the record's once made): said, so a build that changes
                 in a moment is expected, and once it lands, that it did. One slot, so the line moves nothing above it. -->
            <p class="late" role="status" data-late={lateFor !== null && lateFor === sentence ? 'reading' : landed === sentence ? 'landed' : undefined}>
              {lateFor !== null && lateFor === sentence ? words.stillReading : landed === sentence ? words.readAgain : ''}
            </p>
          </aside>
        {/if}
      {/if}
    </div>
  </Frame>
{/if}

<style>
  /* THE WORDS AND THE BUILD, side by side from 900px across the whole window, the words first on a phone. The words keep
     a reading measure inside their tile; the build takes the rest. */
  .board {
    display: grid;
    align-items: start;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .board[data-paired] {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      column-gap: clamp(var(--sp-5), 3vw, var(--sp-7));
    }

    /* THE WORDS STAY IN VIEW while the build grows under a long answer. */
    .board[data-paired] .talk {
      position: sticky;
      inset-block-start: var(--sp-5);
    }
  }

  .talk {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE TALK COLUMN IS A TILE (first F5), so its fields sit on white as they do on sign in, never on the bare ground. */
  .talk[data-tile] {
    box-sizing: border-box;
    max-inline-size: 40rem;
    padding: var(--sp-5);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  @media (width < 640px) {
    .talk[data-tile] {
      padding: 20px;
    }
  }

  .talk > :is(.form, .go, .aside, .missed) {
    margin-block-start: var(--sp-3);
  }

  .build {
    min-inline-size: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    .build {
      animation: build-in var(--d-page) var(--ease-out) both;
    }
  }

  @keyframes build-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  /* `Empty` stands in a tile or the sheet with no tile of its own. */
  .talk :global(.empty) {
    padding: 0;
    background: none;
  }

  .quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: 22px;
    /* NO WORD LEFT ALONE ON A PHONE'S LAST LINE ("wrote." under a full line at 390). */
    text-wrap: pretty;
  }

  /* THE TERMS LINE IS THE FORM'S SMALL PRINT, one line on a phone. */
  .agree {
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* ── The header's way to sign in ───────────────────────────────────────── */

  .have-wide {
    color: var(--ink-2);
  }

  /* A LINK IS INK, UNDERLINED (Look B): red is kept for what is late or failing, and a stranger's first screen has none. */
  .have-link {
    color: var(--ink);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }

  .have-narrow {
    display: none;
  }

  .have-narrow :global(.btn) {
    min-block-size: var(--tap);
  }

  @media (width < 640px) {
    .have-wide {
      display: none;
    }

    .have-narrow {
      display: inline-flex;
    }
  }

  /* ── The sentence ──────────────────────────────────────────────────────── */

  /* THE ONE FIELD, at the size of a sentence rather than a form row, 16px so a phone does not zoom it. */
  .prompt {
    position: relative;
    display: block;
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--sp-3) var(--sp-4);
    background: transparent;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: 24px;
    /* A field takes the browser's own tracking, not the body's, and the marks under it take the body's: the same here,
       or every word drifts a little further from its mark. The gutter is kept on both, so a scrollbar wraps neither. */
    letter-spacing: inherit;
    scrollbar-gutter: stable;
    resize: vertical;
    scroll-margin-block: var(--sp-6) var(--sp-9);
  }

  .prompt::placeholder {
    color: var(--ink-3);
  }

  /* THE FIELD DRAWS NO RING OF ITS OWN: the wrapper takes the house's one ring (first F16). */
  .prompt:focus,
  .prompt:focus-visible {
    /* focus-ok: `.lit-field:focus-within` draws the 2px ring at 2px offset, as every `.field` does. */
    outline: none;
    box-shadow: none;
  }

  /* THE FIELD AND ITS MARKS: the marks are the same words in the same box under a clear field, so the words heard
     light up where they are typed. Same padding, size, line and wrapping as the field, or the marks drift. On the
     field's own fill, so it is a field to the eye before it is touched (first F5). */
  .lit-field {
    position: relative;
    background: var(--tile-2);
    border-radius: var(--r-ctl);
  }

  .lit-field:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .lit {
    position: absolute;
    inset: 0;
    overflow: hidden;
    padding: var(--sp-3) var(--sp-4);
    color: transparent;
    font-size: var(--fs-body);
    line-height: 24px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    scrollbar-gutter: stable;
    pointer-events: none;
  }

  /* UNDER A THUMB THE FIELD READS AT 16 AT LEAST (`base.css`, so a phone does not zoom it), and the marks with it. */
  @media (pointer: coarse) {
    .lit {
      font-size: max(16px, var(--fs-body));
    }
  }

  /* A WORD HEARD, IN A NEUTRAL WASH: heard is not late, so it is never red. Translucent, so it reads on the field's fill. */
  .lit mark {
    border-radius: var(--r-xs);
    background: color-mix(in oklab, var(--ink) 12%, transparent);
    color: transparent;
  }

  /* ── What I heard ──────────────────────────────────────────────────────── */

  .heard {
    display: grid;
    gap: var(--sp-2);
  }

  .heard-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .heard-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: var(--lead-head);
  }

  .lines,
  .promises {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A LINE HEARD: her words on the left, what they became on the right in ink with a chevron, the whole line one press. */
  .heard-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
    box-sizing: border-box;
    inline-size: calc(100% + 2 * var(--sp-3));
    min-block-size: var(--tap);
    margin-inline: calc(-1 * var(--sp-3));
    padding: var(--sp-2) var(--sp-3);
    border: 0;
    border-radius: var(--r-ctl);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-body);
    line-height: 22px;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .heard-line[aria-expanded='true'] {
    background: var(--hover);
  }

  @media (hover: hover) and (pointer: fine) {
    .heard-line:hover {
      background: var(--hover);
    }
  }

  .line-said {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .line-became {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink);
    font-weight: 500;
  }

  .line-became :global(svg) {
    color: var(--ink-3);
  }

  .line-edit {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-2) 0 var(--sp-3);
  }

  .promises li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* ── Keep it ───────────────────────────────────────────────────────────── */

  /* THE SENTENCE ONCE KEPT: her words with no indent, quiet, and the way back to them on the same start edge. */
  .said-line {
    display: grid;
    justify-items: start;
    gap: var(--sp-1);
  }

  .said-text {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  /* THE NAME IT WILL HAVE, on the field's fill inside the talk tile: a tile never holds a tile. */
  .kept {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  .kept:empty {
    display: none;
  }

  .kept-label {
    margin: 0;
  }

  .kept-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .kept-at {
    margin: 0;
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  .kept-at-url {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .kept-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: var(--lead-head);
  }

  /* THE ZONE AND THE CURRENCY (1 Nov): one quiet line under the name, with Change on its end; opened, the two pickers. */
  .set {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .set > .field-label {
    margin: 0;
  }

  .set .field {
    inline-size: 100%;
  }

  .set-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* CHANGE BESIDE WHAT IT CHANGES, as the name's sits beside the address (AP19), never wrapped to a line of its own. */
  .set-said {
    flex-wrap: nowrap;
  }

  .set-said .set-line {
    flex: 1 1 auto;
  }

  .set-said > .link {
    flex: none;
  }

  .set-line {
    margin: 0;
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* THE LATE READING'S LINE (1 Nov): one held slot under the build, so its words coming and going move nothing. */
  .late {
    min-block-size: 22px;
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 22px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .late[data-late] {
      animation: late-in var(--d-page) var(--ease-out) both;
    }
  }

  @keyframes late-in {
    from {
      opacity: 0;
    }
  }

  /* `email-row` AND NOT THE LEDGER'S `.row`: a label over a field the column's width. */
  .email-row {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .email-row .field {
    inline-size: 100%;
  }

  .email-row .field-input {
    scroll-margin-block: var(--sp-6) calc(var(--tap) + var(--sp-7));
  }

  .open-here {
    text-align: start;
  }

  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  /* THE FAILED LINE AND ITS BUTTON IN ONE ROW, so the box keeps the 65px it held for the widget. */
  .human-failed {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 65px;
  }

  .human-line,
  .bad {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .human-line {
    flex: 1;
    min-inline-size: 0;
  }

  .human-again :global(.btn) {
    min-block-size: var(--tap);
  }

  /* THE READ'S BOT CHECK TAKES NO ROOM until Cloudflare draws something the person must do. */
  .read-human {
    inline-size: 100%;
  }

  .go {
    display: flex;
    gap: var(--sp-2);
  }

  .go :global(.btn) {
    min-block-size: var(--tap);
  }

  /* THE PRESS STAYS ABOVE THE PHONE'S KEYBOARD: `--kb` is the keyboard's height, written at run time. On the talk tile's
     own fill, so no band of another colour crosses the column (first F10). */
  @media (width < 900px) {
    .go :global(.btn) {
      inline-size: 100%;
    }

    .sticky {
      position: sticky;
      inset-block-end: calc(var(--kb, 0px) + var(--sp-4));
      padding-block: var(--sp-2);
      background: var(--tile);
    }
  }

  .aside {
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-underline-offset: 3px;
  }

  .link.plain {
    min-block-size: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 500;
    color: var(--ink);
    cursor: pointer;
  }

  .said-edit {
    min-block-size: var(--tap);
  }

  .missed {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .missed-why {
    display: block;
    color: var(--ink-3);
  }

  /* ── Apply's rail ──────────────────────────────────────────────────────── */

  .next {
    display: grid;
    gap: var(--sp-3);
    padding-block-start: var(--sp-2);
  }

  .next-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: var(--lead-head);
  }

  .next-list {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .next-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* A STEP'S NUMBER IN A WELL OF THE TILE'S FILL, on the ground beside the sheet: a count of steps is not an alarm. */
  .next-n {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    background: var(--tile);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* UNDER THE SHEET ON A PHONE, a step down from it, on the same start edge as the brand and the sheet. */
  @media (width < 900px) {
    .next {
      padding-block-start: var(--sp-4);
    }
  }
</style>
