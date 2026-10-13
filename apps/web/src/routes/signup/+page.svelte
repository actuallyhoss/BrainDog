<!--
  Sign-up, for a stranger: say who you are, watch the BrainDog build, then keep it with one email (DIRECTION §37).

  USE CASE 6, STEPS 1 TO 4 (his word of 9 October, `loop/progress/planner-45.md`, "The onboarding target").

  1. DESCRIBE. "Who are you?", one field, the first run's five chips and three promises under them. As it is typed, the
     rules read it on this device (`proposeFirst` with no model, `lib/start/propose.ts`): Turnstile is not keyed, so no
     model reads a stranger's words yet (USE-B05), and nothing typed leaves the device until the person keeps it.
  2. HER WORDS LIGHT UP. The words heard are marked in the field itself, where each line says it sits (`heard[].at`,
     `litIn`), under "What I heard": her name as "you", then each phrase and what it became. A line is pressed to change
     what it became or take it out (`amend`), and the BrainDog builds beside it (`../start/Building.svelte`). "That's me".
  3. ONE QUESTION, at most: the one `oneQuestion` picks, its answers each with what it means, and "That is the only
     question". With none to ask it goes straight on; with nothing placed at all, it asks what it is closest to.
  4. KEEP IT. The title with Change (`NameField`), the places, one email, "Email me a link", and where to open it.

  THEN ONE EMAIL. The record's name is chosen from what was heard, the business first, then the person, then the
  address (`lib/signup.ts` `recordNames`, `chooseName`, trying `-2` to `-9`), and said as one quiet line with Change.
  Turnstile stands under the field when the host asks for it. A person already signed in is asked for nothing more.

  THEN THE LINK, AND THE BUILD IS MADE IN THE PAGE. The sentence waits for the link in `localStorage` (`keepSaid`),
  because the link opens a new tab. Spending it makes the free record (`checkout` with `plan: 'free'`), opens it, and
  writes the build into it with `/start`'s own `accept()`, here, with no jump to a second screen to answer again; then
  the record's `/start#made` offers one agent and one source before Home. A link opened on another device has no
  sentence but the one the link carries (`said`, read back by `arrivalOf`). BEFORE THE BUILD, the passkey is offered
  (`../start/PasskeyFirst.svelte`), and a passkey made or "Not now" goes on to the build. What was changed by hand and the
  answer wait beside the sentence on this device (`keepAmend`), laid over the second reading so the build is what the
  screen showed.

  ON `?plan=cloud` OR `?plan=plus` the link leads to Stripe's page on that plan instead (`NoRecord`), and the build is
  written once the payment has made the record (`#paid`). `#cancelled` is the payment step again. Free leads (§35).

  WHILE SIGN-UP IS CLOSED THE PAGE ASKS NOTHING. `/auth/signup/name` says who may sign up (`mode`), because it is the
  one door a stranger can ask; closed, the page says so and points at sign-in. BY INVITATION the code comes in the
  address (`#code=`), is wiped from it as a mailed link is, waits in this tab and rides with the email; with no code the
  page is the closed one with its own line. Nobody types a code. The answer to the email is the same for every address:
  the host sends a sign-in link to one that already has an account and a proof to a new one.

  "MAKE IT AGAIN" IS DRAWN ONLY WHEN THE ACCOUNT SAYS A RECORD CAN BE MADE (`canMake` on `/account/billing`), so no
  control offers what checkout would refuse.

  THE WHOLE WINDOW (`../start/Frame.svelte`): the words on the left and the build on the right from 900px, the words
  first and the build under them on a phone.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { createClient } from '@braindog/client';
  import { USE_CASES } from '@braindog/seed/usecases';
  import { dayOf } from '@braindog/seed/usecases/install';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { apiBase, at, BASE } from '$lib/at.ts';
  import { methods, support, type Who } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { amendKept, keepAmend, litIn, NO_AMEND, firstRun, type Amend, type Reply } from '$lib/first-run.ts';
  import * as pref from '$lib/pref.ts';
  import { INSTALL_ORDER } from '$lib/shape.ts';
  import {
    allWritten,
    arrivalOf,
    billing,
    checkout,
    checkName,
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
    startSignup,
    verifySignup,
    zone,
    type Draft,
    type Held,
    type Plan,
  } from '$lib/signup.ts';
  import { placesOf, proposeFirst, type HeardLine, type Proposal } from '$lib/start/propose.ts';
  import { answer, oneQuestion } from '$lib/start/question.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { withChip } from '$lib/who.ts';
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
  } from '../start/building.ts';
  import { caseOf, keepsCurrency } from '../start/preview.ts';
  import Building from '../start/Building.svelte';
  import Currency from '../start/Currency.svelte';
  import Frame from '../start/Frame.svelte';
  import Making from '../start/Making.svelte';
  import NoRecord from '../start/NoRecord.svelte';
  import PasskeyFirst from '../start/PasskeyFirst.svelte';
  import type { Accepting, NotMade } from '../start/accept.ts';
  import { accepting, nameSent, picked, replyOf, settle, titleSent } from './build.ts';
  import NameField from './NameField.svelte';
  import { words } from './words.ts';

  type Step =
    | 'loading'
    | 'unreachable'
    | 'closed'
    | 'invite-only'
    | 'describe'
    | 'question'
    | 'keep'
    | 'sent'
    | 'verifying'
    | 'lock'
    | 'link-failed'
    | 'making'
    | 'made-partly'
    | 'make-failed'
    | 'pay'
    | 'waiting'
    | 'slow';

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

  type Turnstile = {
    render: (el: HTMLElement, options: Record<string, unknown>) => string;
    reset: (id: string) => void;
    remove: (id: string) => void;
  };
  const turnstileOf = (): Turnstile | null => (globalThis as { turnstile?: Turnstile }).turnstile ?? null;

  /**
   * Cloudflare's script, once per page, rendered explicitly into the form's slot.
   *
   * `size: 'flexible'` FILLS THE COLUMN, which keeps it inside the 16px gutter on a phone rather than a fixed 300px box
   * that pushes the page sideways at 320. The answer is single use, so every failed send resets it.
   */
  function loadTurnstile(key: string, el: HTMLElement): void {
    const draw = () => {
      const t = turnstileOf();
      if (!t || widgetId !== null) return;
      widgetId = t.render(el, {
        sitekey: key,
        size: 'flexible',
        callback: (answer: string) => (human = answer),
        'expired-callback': () => (human = null),
        'error-callback': () => (human = null),
      });
    };
    if (turnstileOf()) return draw();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = draw;
    document.head.append(script);
  }

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
  /** The answer to the one question once given or skipped, and the one tapped or typed before Continue. */
  let reply = $state.raw<Reply | null>(null);
  let pick = $state<string | null>(null);

  /* THE DEVICE'S CURRENCY GOES IN WITH THE WORDS, so a shop in Cairo keeps EGP without being asked (`zoneCurrency`). */
  const reading = (s: string): Promise<Proposal> => proposeFirst(s, { zone: here, locale, currency: zoneCurrency(here) }, null);

  $effect(() => {
    const s = sentence;
    if (s.trim() === '') {
      live = null;
      return;
    }
    const wait = setTimeout(() => {
      void reading(s).then((p) => {
        if (sentence === s) live = p;
      });
    }, 140);
    return () => clearTimeout(wait);
  });

  /* THE CURRENCIES THIS DEVICE POINTS AT, for the one question when it is the currency. */
  let device: CurrencyEnv | null = null;
  const deviceOf = (): CurrencyEnv => (device ??= browserCurrencyEnv(locale, typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])], here));
  const base = $derived(live === null ? null : settle(live, amends, null, sentence));
  const read = $derived(base === null ? null : reply === null ? base : answer(base, reply.about, reply.value, sentence));
  /** The one question it could not guess (`oneQuestion`), or none. */
  const q = $derived(base === null ? null : oneQuestion(base, sentence, deviceOf()));
  /** The sentence cut at the very words heard, for the marks under the field. */
  const lit = $derived(litIn(sentence, read?.heard ?? []));

  function chip(c: string) {
    sentence = withChip(sentence, c);
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(sentence.length, sentence.length);
    });
  }

  /* ENTER GOES ON AND SHIFT+ENTER STARTS A NEW LINE, as a chat box does, because the field is one answer. */
  function enter(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    void next();
  }

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
  const heldBy = (id: string): string | null => cases.find((c) => c.modules.includes(id))?.title ?? null;

  /* THE CURRENCY IS THE ONE TYPED OR THE ONE ANSWERED, never guessed (`oneQuestion` asks it where an amount has none). */
  const money = $derived(modules.find(keepsCurrency) ?? null);
  const placed = $derived(u !== null || modules.length > 0);

  const parts = $derived([
    ...cases.map((c) => casePart(c, read?.heard ?? [], chosen !== null)),
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

  /** What is asked before keeping: the one question, or what it is closest to where nothing was placed. */
  const asks = $derived(sentence.trim() === '' ? null : q !== null ? 'one' : !placed ? 'closest' : null);
  /** Whether that is already answered: the reply is to this very question, or a use case was picked. */
  const answered = $derived(asks === 'one' ? reply !== null && reply.about === q?.about : asks === 'closest' ? chosen !== null : true);

  /* "THAT'S ME": read again now, so a press straight after the last key acts on every word; then the one question, or
     straight on to keep. */
  async function next(): Promise<void> {
    if (sentence.trim() === '') {
      field?.focus();
      return;
    }
    live = await reading(sentence);
    opened = null;
    await tick();
    if (!answered) {
      pick = asks === 'one' ? (q?.suggested ?? null) : null;
      step = 'question';
      await tick();
      document.getElementById('first-q')?.focus();
      return;
    }
    await keep();
  }

  async function keep(): Promise<void> {
    step = 'keep';
    said = null;
    await tick();
    (signedIn ? document.getElementById('keep-h') : document.getElementById('up-email'))?.focus();
  }

  /* THE ANSWER, OR SKIPPED (`null`): a value on the reading, written nowhere until the build. */
  function answerIt(value: string | null): void {
    if (asks === 'one' && q !== null) reply = { about: q.about, value: value === null || value.trim() === '' ? null : value.trim() };
    void keep();
  }

  function pickCase(id: string) {
    chosen = chosen === id ? null : id;
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

  onMount(() => {
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
    const [out, who] = await Promise.all([checkName(''), methods()]);
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
    /* BY INVITATION, A STRANGER WITH NO CODE IS SHOWN THE CLOSED PAGE WITH ITS OWN LINE. A person signed in needs none:
       their account is made, and a record of their own is checkout's to say. */
    if (out.value.mode === 'invite' && signedIn === null && codeKept(tabStore()) === null) {
      step = 'invite-only';
      return;
    }
    siteKey = out.value.turnstile;
    step = 'describe';
    await tick();
    field?.focus();
  }

  /* ── keeping it: one email ───────────────────────────────────────────────── */

  const ready = $derived(slug !== '' && free && !busy && !naming && (signedIn !== null || (email.trim() !== '' && (siteKey === null || human !== null))));

  /** The sentence as it is kept across the mail. */
  const draftNow = (): Draft => ({ said: sentence.trim(), currency: money === null ? null : (read?.currency ?? null), usecase: chosen, reply });

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
    const person = nameSent(read);
    if (signedIn !== null) {
      /* NO MAIL TO WAIT ON: kept now, because a paid plan leaves for Stripe's page and comes back to a new page load. */
      keepAll();
      held = { slug, name: titleSent(read, person || null), tz: zone(), plan };
      hold(globalThis.sessionStorage, held);
      if (plan === 'free') void makeFree(held);
      else step = 'pay';
      return;
    }
    busy = true;
    said = null;
    /* WHAT WAS SAID RIDES IN THE LINK (`said`), so a link opened on another device builds the same BrainDog. */
    const out = await startSignup({ email, slug, name: person, tz: zone(), turnstile: human, code: codeKept(tabStore()), said: draftNow() });
    busy = false;
    if (out.ok) {
      sentTo = email.trim();
      sentCut = saidFromLink(saidForLink(draftNow()))?.cut === true;
      /* THE CODE IS HELD BY THE PROOF JUST MAILED, so this tab has no more use for it. */
      keepCode(tabStore(), null);
      /* KEPT ONLY ONCE THE HOST SAID YES, so a refused address leaves nobody's words on this device. */
      keepAll();
      /* KEPT NOW AS WELL AS IN THE PROOF, so a proof opened in this tab still finds the name if the mail was slow. */
      hold(globalThis.sessionStorage, { slug, name: titleSent(read, person.trim() || null), tz: zone(), plan });
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
      step = 'link-failed';
      return;
    }
    /* THE RECORD IS MADE UNDER THE NAME SHE WAS SHOWN, read again from the sentence the link carried while the page's own
       reading of it may not be back yet. */
    const shown = read ?? (sentence.trim() === '' ? null : settle(await reading(sentence), amends, null, sentence));
    held = { slug: out.value.slug, name: titleSent(shown, out.value.name), tz: out.value.tz, plan };
    hold(globalThis.sessionStorage, held);
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
   * THE BUILD, WRITTEN INTO THE RECORD JUST MADE, IN THIS PAGE: the sentence read again by the same rules, then `/start`'s
   * own `accept()` against the new record by its name, then its `/start#made`. With no sentence to build from (a link
   * opened on another device), its `/start` asks the question there. `fallback` is where the host said the record opens.
   */
  async function build(name: string, fallback: string): Promise<void> {
    const draft = saidKept(localStore()) ?? (sentence.trim() === '' ? null : draftNow());
    const signed = draft ? await methods() : null;
    /* READ AGAIN, WITH WHAT WAS CHANGED AND ANSWERED LAID OVER IT, so the build is the one the screen showed (`accepting`). */
    const asked = draft
      ? await accepting(draft, amendKept(localStore(), draft.said), reading, {
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
    const one = caseOf(asked.usecase);
    stage = words.makingParts([...(one ? [one.title] : []), ...asked.modules.map(moduleName)].slice(0, 4));
    /* A BUILD THIS DEVICE ALREADY PRESSED FOR (a reload mid-press): the same key, sent with `again`, so the record
       writes only what it does not hold yet and nothing a second time. AFTER A PRESS THAT ANSWERED IN PART, only what
       it left, under its Try again's own key (`pressKept`): the whole plan under the first key would write a second
       time whatever a Try again had put in under its own. */
    await write(name, pressKept(asked, draft));
  }

  /**
   * ONE CALL TO THE RECORD'S OWN `setup` AGAINST THE NEW RECORD (USE-B04), and what it came back with. It goes through
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
       in before the reload is passed over, and nothing is written twice (audit 59, claim 2). The first key stays
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
  /** Whether the build stands beside the words: while describing and keeping, and while what was said is being made. */
  const showBuild = $derived(
    step === 'describe' ||
      step === 'question' ||
      step === 'keep' ||
      ((step === 'sent' || step === 'verifying' || step === 'lock' || step === 'making' || step === 'waiting') && sentence.trim() !== '' && !watching),
  );

  /* THIS SCREEN'S FIRST DRAW IS ITS STEP, whichever it is, once the host has answered or the address has said. */
  $effect(() => {
    if (step !== 'loading' && step !== 'verifying') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

{#snippet signInLink()}
  {#if step === 'describe' || step === 'question' || step === 'keep'}
    <a class="link" href={at('/signin')}>{words.haveOne}</a>
  {/if}
{/snippet}

{#snippet saidLine()}
  <button type="button" class="said-line" disabled={busy} onclick={edit}>
    <q class="said-text">{sentence.trim()}</q>
    <span class="said-edit">{words.edit}</span>
  </button>
  {#if linkCut}<p class="quiet">{words.linkCut}</p>{/if}
{/snippet}

<Frame end={signedIn === null ? signInLink : undefined}>
  <div class="board" data-paired={showBuild ? '' : undefined}>
    {#if watching && watched}
      <!-- THE BUILD BEING WRITTEN, tile by tile across the whole board: each part says where it is, read from the record. -->
      <Making parts={watched.parts} states={makingStates(watched.parts, watched.held, watched.answer)} />
    {:else}
    <div class="talk">
      {#if step === 'loading' || step === 'verifying'}
        <!-- NOTHING IS ASKED BEFORE THE HOST SAYS SIGN-UP IS OPEN: the page's name, never "Who are you?", which a closed
             host would take straight back. -->
        <h1 class="title">{step === 'verifying' ? words.making : words.title}</h1>
        <p class="quiet" role="status">{step === 'verifying' ? copy.signupVerifying : copy.checkingWays}</p>
      {:else if step === 'unreachable'}
        <Empty kind="error" title={copy.unreachableTitle} body={copy.unreachableWhy}>
          {#snippet actions()}<Button onclick={() => void ask()}>{copy.askAgain}</Button>{/snippet}
        </Empty>
      {:else if step === 'closed' || step === 'invite-only'}
        <h1 class="title">{step === 'closed' ? copy.signupClosedTitle : words.inviteTitle}</h1>
        <p class="lede">{step === 'closed' ? copy.signupClosedWhy : words.inviteWhy}</p>
        <div class="go"><Button weight="primary" href="/signin">{copy.signIn}</Button></div>
      {:else if step === 'describe'}
        <h1 class="title" id="who-h">{firstRun.whoQuestion}</h1>
        <p class="lede">{words.lede}</p>
        <form
          class="form"
          onsubmit={(e) => {
            e.preventDefault();
            void next();
          }}
        >
          <!-- HER WORDS LIGHT UP AS SHE TYPES: the marks sit under the field, cut where each line heard says it is. -->
          <div class="lit-field">
            <!-- ONE LINE OF MARKUP: any space between these tags would be drawn, and the marks would drift off the words. -->
            <div class="lit" aria-hidden="true" bind:this={marks}>{#each lit as r, i (i)}{#if r.became}<mark>{r.text}</mark>{:else}{r.text}{/if}{/each}{'\n'}</div>
            <textarea
              class="prompt"
              rows="4"
              autocomplete="off"
              maxlength="2000"
              aria-labelledby="who-h"
              placeholder={firstRun.whoPlaceholder}
              bind:this={field}
              bind:value={sentence}
              onkeydown={enter}
              onscroll={scrolled}
            ></textarea>
          </div>

          {#if sentence.trim() === ''}
            <p class="quiet" id="chips-h">{words.startFrom}</p>
            <div class="chips" role="group" aria-labelledby="chips-h">
              {#each firstRun.whoChips as c (c)}
                <!-- A mouse press keeps focus in the field, so the caret stays where the words are going. -->
                <Button size="sm" onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={() => chip(c)}>{c}</Button>
              {/each}
            </div>
          {/if}

          {#if read !== null && read.heard.length > 0}
            <section class="tile heard" aria-labelledby="heard-h">
              <div class="tile-head">
                <h2 class="tile-h" id="heard-h">{firstRun.heardTitle}</h2>
                <span class="quiet">{words.heardTap}</span>
              </div>
              <ul class="lines">
                {#each read.heard as h, i (i)}
                  <li>
                    <button type="button" class="line" aria-expanded={opened === lineOf(h)} onclick={() => openLine(h)}>
                      <span class="line-said">{h.you === true ? (read.name ?? h.phrase) : h.phrase}</span>
                      <span class="line-became">{h.you === true ? words.you : h.became}</span>
                    </button>
                    {#if opened === lineOf(h)}
                      <div class="line-edit">
                        {#if h.you === true}
                          <label class="field-label" for="up-you">{words.nameLabel}</label>
                          <span class="field"><input id="up-you" class="field-input" type="text" autocomplete="name" maxlength="60" bind:value={nameDraft} /></span>
                          <div class="chips">
                            <Button weight="primary" onclick={rename}>{words.keepLine}</Button>
                            <Button weight="quiet" onclick={() => takeOut(h)}>{words.takeOut}</Button>
                          </div>
                        {:else}
                          <p class="quiet">{words.becomeInstead}</p>
                          <div class="chips" role="group" aria-label={words.becomeInstead}>
                            {#each insteadOf(h) as id (id)}
                              <Button size="sm" weight="quiet" onclick={() => turnInto(h, id)}>{moduleName(id)}</Button>
                            {/each}
                          </div>
                          <div class="chips"><Button weight="quiet" onclick={() => takeOut(h)}>{words.takeOut}</Button></div>
                        {/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>
          {/if}

          <div class="go sticky">
            <Button weight="primary" type="submit" kbd={sentence.trim() === '' ? undefined : '↵'}>{words.next}</Button>
          </div>
        </form>

        <ul class="promises">
          {#each words.promises as line, i (line)}
            {#if i > 0 || plan === 'free'}<li><Icon name="check" size="s" />{line}</li>{/if}
          {/each}
        </ul>
      {:else if step === 'question'}
        <button type="button" class="link plain back" onclick={edit}>{words.back}</button>
        <h1 class="title" id="first-q" tabindex="-1">{words.questionTitle}</h1>
        {#if asks === 'one' && q !== null}
          <p class="lede" id="first-q-ask">{q.question}</p>
          {#if q.about === 'currency'}
            <Currency bind:value={pick} {locale} choices={q.choices.map((c) => ({ code: c.value, name: c.label, why: c.means ?? '' }))} suggested={q.suggested} find={q.find} />
          {:else if q.about === 'name'}
            <span class="field field-lg"><input class="field-input" type="text" autocomplete="name" maxlength="60" aria-labelledby="first-q-ask" bind:value={pick} /></span>
          {:else}
            <div class="opts" role="radiogroup" aria-labelledby="first-q-ask">
              {#each q.choices as c (c.value)}
                <button type="button" class="opt" role="radio" aria-checked={pick === c.value} onclick={() => (pick = c.value)}>
                  <span class="opt-name">{#if pick === c.value}<Icon name="check" size="s" />{/if}{c.label}</span>
                  {#if c.means}<span class="opt-means">{c.means}</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
          <p class="quiet">{q.only}</p>
          <div class="go sticky">
            <Button weight="primary" disabled={pick === null || pick.trim() === ''} onclick={() => answerIt(pick)}>{words.questionNext}</Button>
            <Button weight="bare" onclick={() => answerIt(null)}>{words.questionSkip}</Button>
          </div>
        {:else}
          <p class="lede">{words.closest}</p>
          <p class="quiet">{words.closestWhy}</p>
          <div class="chips" role="group" aria-label={firstRun.mineFor}>
            {#each USE_CASES as one (one.usecase)}
              <Button weight="quiet" aria-pressed={chosen === one.usecase} onclick={() => pickCase(one.usecase)}>{one.title}</Button>
            {/each}
          </div>
          <div class="go sticky"><Button weight="primary" disabled={chosen === null} onclick={() => void keep()}>{words.questionNext}</Button></div>
        {/if}
      {:else if step === 'keep'}
        <h1 class="title" id="keep-h" tabindex="-1">{words.keepTitle}</h1>
        {@render saidLine()}
        {#if signedIn || plan !== 'free'}
          <p class="lede">{signedIn ? (plan === 'free' ? words.keepSignedIn : words.keepSignedInPaid) : words.keepLedePaid}</p>
        {/if}
        <form class="form" onsubmit={send}>
          <!-- THE TITLE AND ITS PLACES, as one tile: what will be kept, under the name it will have. -->
          <section class="tile">
            {#if nameByHand}
              <NameField bind:value={slug} bind:free id="up-name" />
            {:else if naming || read?.title || slug !== ''}
              <div class="tile-head">
                <h2 class="tile-h" aria-live="polite">{naming ? words.calledFinding : (read?.title ?? slug)}</h2>
                {#if !naming && slug !== ''}<button type="button" class="link plain" onclick={changeName}>{words.change}</button>{/if}
              </div>
            {/if}
            {#if places && places.length > 0}
              <ul class="places">
                {#each places as pl (`${pl.kind}:${pl.id}`)}<li>{pl.name}</li>{/each}
              </ul>
            {/if}
          </section>

          {#if signedIn === null}
            <div class="row">
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
              <div class="human" role="group" aria-label={copy.signupHuman} bind:this={widget}></div>
            {/if}
          {/if}

          {#if said}<p class="bad" role="alert">{said}</p>{/if}

          <div class="go sticky">
            <Button weight="primary" type="submit" disabled={!ready} aria-busy={busy}>
              {signedIn ? words.makeNow : busy ? words.sending : words.send}
            </Button>
          </div>
          {#if signedIn === null && plan === 'free'}<p class="quiet open-here">{onPhone ? words.openHere : words.openHereWide}</p>{/if}
        </form>
      {:else if step === 'lock'}
        <h1 class="title" id="lock-h" tabindex="-1">{words.lockTitle}</h1>
        <!-- ITS ONE PRESS IS THE STEP'S PRIMARY, and "Not now" or a passkey made goes on to the build (`ondone`). -->
        <PasskeyFirst ondone={lockDone} />
      {:else if step === 'sent'}
        <h1 class="title" id="sent-h" tabindex="-1">{copy.signupCheckMail}</h1>
        <p class="lede">{copy.signupMailSent(sentTo)}</p>
        {#if sentence.trim() !== ''}<p class="quiet">{sentCut ? words.sentCut : words.sentWhy}</p>{/if}
        <div class="go"><Button weight="quiet" onclick={otherAddress}>{copy.signupOtherAddress}</Button></div>
      {:else if step === 'link-failed'}
        <h1 class="title">{copy.signupLinkFailed}</h1>
        <p class="lede">{copy.signupLinkFailedWhy}</p>
        <div class="go"><Button weight="primary" onclick={() => void ask()}>{copy.signupStartAgain}</Button></div>
      {:else if step === 'making'}
        <h1 class="title">{words.making}</h1>
        <p class="lede" role="status">{stage}</p>
      {:else if step === 'made-partly'}
        <h1 class="title">{words.madeTitle}</h1>
        <p class="lede" role="status">{missed.length > 0 ? words.madePartly : words.madeUnreached}</p>
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
        <h1 class="title">{words.makeRecord}</h1>
        {#if said}<p class="lede" role="alert">{said}</p>{/if}
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
        <h1 class="title">{copy.signupWaiting}</h1>
        <p class="lede" role="status">{step === 'slow' ? copy.signupWaitingSlow : copy.signupWaitingWhy}</p>
        {#if step === 'slow'}
          <div class="go"><Button weight="primary" onclick={() => void waitForRecord(held)}>{copy.signupCheckAgain}</Button></div>
        {/if}
      {/if}
    </div>

    {#if showBuild}
      <aside class="build" aria-label={firstRun.mineTitle}>
        <Building {parts} title={read?.title ?? null} {places} {locale} />
      </aside>
    {/if}
    {/if}
  </div>
</Frame>

<style>
  /* THE WORDS AND THE BUILD, side by side from 900px across the whole window, the words first on a phone. The words keep
     a reading measure inside their column; the build takes the rest. */
  .board {
    display: grid;
    align-items: start;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  @media (width >= 900px) {
    .board[data-paired] {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      column-gap: clamp(var(--sp-6), 4vw, var(--sp-8));
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
    max-inline-size: 40rem;
    min-inline-size: 0;
  }

  .talk > :is(.form, .go, .aside, .missed) {
    margin-block-start: var(--sp-3);
  }

  .build {
    min-inline-size: 0;
    animation: build-in var(--d-page) var(--ease-out) both;
  }

  @keyframes build-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  /* THE ENTRY SCREENS' ONE TITLE: `t-title`, 28/34 at 600 in Geist, and the phone's large title 30/36. */
  .title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-title);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .title:focus {
    /* focus-ok: `tabindex="-1"` moves focus here for a screen reader when the step changes; it is never in the tab order. */
    outline: none;
  }

  .lede {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  .quiet {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* THE ONE FIELD, at the size of a sentence rather than a form row, 16px so a phone does not zoom it. */
  .prompt {
    position: relative;
    display: block;
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--sp-3) var(--sp-4);
    background: transparent;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    line-height: var(--lh-body);
    /* A field takes the browser's own tracking, not the body's, and the marks under it take the body's: the same here,
       or every word drifts a little further from its mark. The gutter is kept on both, so a scrollbar wraps neither. */
    letter-spacing: inherit;
    scrollbar-gutter: stable;
    resize: vertical;
    scroll-margin-block: var(--sp-6) var(--sp-9);
  }

  .prompt::placeholder {
    color: var(--dim);
  }

  /* THE FIELD AND ITS MARKS: the marks are the same words in the same box under a clear field, so the words heard
     light up where they are typed. Same padding, size, line and wrapping as the field, or the marks drift. */
  .lit-field {
    position: relative;
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .lit {
    position: absolute;
    inset: 0;
    overflow: hidden;
    padding: var(--sp-3) var(--sp-4);
    color: transparent;
    font-size: var(--t-md);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    scrollbar-gutter: stable;
    pointer-events: none;
  }

  .lit mark {
    border-radius: 4px;
    background: var(--action-tint-1);
    color: transparent;
  }

  /* A TILE: flat, opaque, no border, no shadow, radius 16 (DIRECTION §39). */
  .tile {
    display: grid;
    gap: var(--sp-3);
    padding: var(--tile-pad);
    border-radius: var(--tile-r);
    background: var(--tile);
  }

  .tile-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .tile-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .lines,
  .places,
  .promises {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A LINE HEARD: her words on the left, what they became on the right, the whole line one press. */
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-1) var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-2) var(--sp-3);
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    line-height: var(--lh-body);
    text-align: start;
    cursor: pointer;
  }

  .line[aria-expanded='true'] {
    background: var(--selected);
  }

  @media (hover: hover) and (pointer: fine) {
    .line:hover {
      background: var(--selected);
    }
  }

  .line-said {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .line-became {
    color: var(--action-text);
    font-weight: 500;
  }

  .line-edit {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
  }

  .places {
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    color: var(--ink);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .promises li {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  /* THE ANSWERS: full-width rectangles, each its name and what choosing it means; the chosen one in the accent's tint
     and with a tick, never the colour alone. */
  .opts {
    display: grid;
    gap: var(--sp-2);
  }

  .opt {
    display: grid;
    gap: 2px;
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-3) var(--sp-4);
    border: 0;
    border-radius: 8px;
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .opt[aria-checked='true'] {
    background: var(--action-tint-1);
  }

  .opt-name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--t-md);
    font-weight: 500;
  }

  .opt-means {
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .back {
    align-self: flex-start;
  }

  .open-here {
    text-align: center;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .chips :global(.btn[aria-pressed='true']) {
    background: var(--selected);
  }

  /* THE SENTENCE ONCE KEPT: one line in the field's own fill, which a press opens again for editing. */
  .said-line {
    display: grid;
    gap: var(--sp-1);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    line-height: var(--lh-body);
    text-align: start;
    cursor: text;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .said-line:hover:not(:disabled) {
      background: var(--s2);
    }
  }

  .said-text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    quotes: none;
  }

  .said-edit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .row {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .row .field-input {
    scroll-margin-block: var(--sp-6) calc(var(--tap) + var(--sp-7));
  }

  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  .bad {
    margin: 0;
    color: var(--danger-text);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .go {
    display: flex;
  }

  .go :global(.btn) {
    min-block-size: var(--tap);
  }

  /* THE PRESS STAYS ABOVE THE PHONE'S KEYBOARD: `--kb` is the keyboard's height, written at run time. */
  @media (width < 900px) {
    .go :global(.btn) {
      inline-size: 100%;
    }

    .sticky {
      position: sticky;
      inset-block-end: calc(var(--kb, 0px) + var(--sp-4));
      padding-block: var(--sp-2);
      background: var(--bg);
    }
  }

  .aside {
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  .link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--link);
    font-size: var(--t-base);
    font-weight: 500;
  }

  .link.plain {
    min-block-size: 0;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 500;
    color: var(--link);
    cursor: pointer;
  }

  .missed {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .missed-why {
    display: block;
    color: var(--dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .build {
      animation: none;
    }
  }

  @media (width < 900px) {
    .title {
      font-size: var(--t-figure);
      line-height: 36px;
    }
  }
</style>
