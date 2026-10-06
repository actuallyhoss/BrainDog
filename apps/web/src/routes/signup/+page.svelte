<!--
  Sign-up, for a stranger: say who you are, watch the BrainDog build, then keep it with one email (DIRECTION §37).

  DESCRIBE FIRST. "Who are you?", one field and the first run's four chips. As it is typed, the rules read it on this
  device (`proposeFirst` with no model, `lib/start/propose.ts`), and the BrainDog builds beside it with /start's own parts
  and its pages by name (`../start/Building.svelte`). No model and no record are asked before there is an account, so
  nothing typed here leaves the device until the person keeps it. The one question the words cannot answer (which
  currency, or what it is closest to) is asked under the field when Continue is pressed, as /start asks it.

  THEN ONE EMAIL. The record's name is chosen from what was heard, the business first, then the person, then the
  address (`lib/signup.ts` `recordNames`, `chooseName`, trying `-2` to `-9`), and said as one quiet line with Change.
  Turnstile stands under the field when the host asks for it. A person already signed in is asked for nothing more.

  THEN THE LINK, AND THE BUILD IS MADE IN THE PAGE. The sentence waits for the link in `localStorage` (`keepSaid`),
  because the link opens a new tab. Spending it makes the free record (`checkout` with `plan: 'free'`), opens it, and
  writes the build into it with `/start`'s own `accept()`, here, with no jump to a second screen to answer again; then
  the record's `/start#made` offers one agent and one source before Home. A link opened on another device has no
  sentence, and its `/start` asks the question there.

  ON `?plan=cloud` OR `?plan=plus` the link leads to Stripe's page on that plan instead (`NoRecord`), and the build is
  written once the payment has made the record (`#paid`). `#cancelled` is the payment step again. Free leads (§35).

  WHILE SIGN-UP IS CLOSED THE PAGE ASKS NOTHING. `/auth/signup/name` says whether it is open, because it is the one door
  a stranger can ask; closed, the page says so and points at sign-in. The answer to the email is the same for every
  address: the host sends a sign-in link to one that already has an account and a proof to a new one.

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
  import { methods, type Who } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import * as pref from '$lib/pref.ts';
  import { INSTALL_ORDER } from '$lib/shape.ts';
  import {
    allWritten,
    arrivalOf,
    billing,
    checkout,
    checkName,
    chooseName,
    HELD_KEY,
    heldOf,
    hold,
    keepPlan,
    keepSaid,
    madeFor,
    namesHeard,
    openOwned,
    planKept,
    planOf,
    recordNames,
    saidKept,
    startSignup,
    verifySignup,
    zone,
    type Draft,
    type Held,
    type Plan,
  } from '$lib/signup.ts';
  import { proposeFirst, type Proposal } from '$lib/start/propose.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import { withChip } from '$lib/who.ts';
  import { browserCurrencyEnv, casePart, currencyChoices, partsOf, type CurrencyEnv } from '../start/building.ts';
  import { caseOf, keepsCurrency, pagesOf } from '../start/preview.ts';
  import Building from '../start/Building.svelte';
  import Currency from '../start/Currency.svelte';
  import Frame from '../start/Frame.svelte';
  import NoRecord from '../start/NoRecord.svelte';
  import type { Accepting } from '../start/accept.ts';
  import NameField from './NameField.svelte';
  import { words } from './words.ts';

  type Step =
    | 'loading'
    | 'unreachable'
    | 'closed'
    | 'describe'
    | 'keep'
    | 'sent'
    | 'verifying'
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
  let sentTo = $state('');

  /* WHERE AND HOW THE SENTENCE WAS TYPED, for a date such as "on the 1st" and the currencies worth offering. */
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;
  const here = zone();

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
  let field = $state<HTMLTextAreaElement | undefined>(undefined);
  /** The rules' reading of the sentence as it stands, a beat after the last key. */
  let live = $state.raw<Proposal | null>(null);
  /** The use case the person picked by hand, which stands over the one the words point at. */
  let chosen = $state<string | null>(null);
  let currency = $state<string | null>(null);
  /** Whether Continue was pressed with a question open, which is when the question is drawn under the field. */
  let asking = $state(false);

  const reading = (s: string): Promise<Proposal> => proposeFirst(s, { zone: here, locale }, null);

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

  const usecase = $derived(chosen ?? live?.usecase ?? null);
  const u = $derived(caseOf(usecase));
  /* THE USE CASES BESIDE IT belong to the reading they were heard with, so picking another use case leaves them out. */
  const also = $derived(live && usecase === live.usecase ? live.also.flatMap((id) => caseOf(id) ?? []) : []);
  const cases = $derived(u ? [u, ...also] : []);
  /** Every part on offer, in install order, then any the words or a use case brought beyond them. */
  const offered = $derived([...new Set([...INSTALL_ORDER, ...(live?.modules ?? []), ...cases.flatMap((c) => c.modules)])]);
  const modules = $derived(offered.filter((id) => (live?.modules ?? []).includes(id) || cases.some((c) => c.modules.includes(id))));
  const heldBy = (id: string): string | null => cases.find((c) => c.modules.includes(id))?.title ?? null;

  /* THE CURRENCY IS ASKED ONLY WHEN MONEY IS KEPT AND THE SENTENCE TYPED NONE, as on /start. */
  const money = $derived(modules.find(keepsCurrency) ?? null);
  const asksCurrency = $derived(money !== null && (live?.currency ?? null) === null);
  let device: CurrencyEnv | null = null;
  const deviceOf = (): CurrencyEnv => (device ??= browserCurrencyEnv(locale, typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? [])], here));
  const currencyAsk = $derived(asksCurrency ? currencyChoices(sentence, deviceOf()) : null);
  const placed = $derived(u !== null || modules.length > 0);

  const parts = $derived([
    ...cases.map((c) => casePart(c, live?.heard ?? [], chosen !== null)),
    ...partsOf({
      offered,
      modules,
      heard: live?.heard ?? [],
      rows: live?.rows ?? [],
      heldBy,
      byHand: new Set(),
      waiting: asksCurrency && currency === null ? money : null,
    }),
  ]);
  const rail = $derived(pagesOf(cases, modules));

  /** What stops Continue: nothing said, the currency, or nothing placed. */
  const open = $derived(sentence.trim() === '' ? 'empty' : asksCurrency && currency === null ? 'currency' : !placed ? 'closest' : null);

  async function next(): Promise<void> {
    if (sentence.trim() === '') {
      field?.focus();
      return;
    }
    /* READ AGAIN NOW, so a press straight after the last key acts on every word of it. */
    live = await reading(sentence);
    await tick();
    if (open !== null) {
      asking = true;
      await tick();
      document.getElementById('first-q')?.focus();
      return;
    }
    asking = false;
    step = 'keep';
    said = null;
    await tick();
    (signedIn ? document.getElementById('keep-h') : document.getElementById('up-email'))?.focus();
  }

  function pickCase(id: string) {
    chosen = chosen === id ? null : id;
  }

  /* THE SENTENCE AGAIN, AS A FIELD. The name chosen from it is chosen again from what it says next. */
  function edit() {
    dropHuman();
    step = 'describe';
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
  const heardBases = $derived(recordNames(namesHeard(live ?? { name: null, rows: [] }), ''));
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
      currency = draft.currency;
      chosen = draft.usecase;
    }
    /* THIS TAB'S PLAN FIRST, then the one kept across the mail; a link opened anywhere else is Free. */
    const lasting = kept?.plan ?? planKept(localStore());
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
    /* A PERSON SIGNED IN NEEDS NO OPEN DOOR: their account is made, and a record of their own is checkout's to say. */
    if (!out.value.open && signedIn === null) {
      step = 'closed';
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
  const draftNow = (): Draft => ({ said: sentence.trim(), currency: money === null ? null : currency, usecase: chosen });

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    /* ONE PRESS, ONE MAIL: a second press while the first is out does nothing. */
    if (!ready) return;
    const person = live?.name ?? '';
    if (signedIn !== null) {
      /* NO MAIL TO WAIT ON: kept now, because a paid plan leaves for Stripe's page and comes back to a new page load. */
      keepSaid(localStore(), draftNow());
      held = { slug, name: person || null, tz: zone(), plan };
      hold(globalThis.sessionStorage, held);
      if (plan === 'free') void makeFree(held);
      else step = 'pay';
      return;
    }
    busy = true;
    said = null;
    const out = await startSignup({ email, slug, name: person, tz: zone(), turnstile: human });
    busy = false;
    if (out.ok) {
      sentTo = email.trim();
      /* KEPT ONLY ONCE THE HOST SAID YES, so a refused address leaves nobody's words on this device. */
      keepSaid(localStore(), draftNow());
      /* KEPT NOW AS WELL AS IN THE PROOF, so a proof opened in this tab still finds the name if the mail was slow. */
      hold(globalThis.sessionStorage, { slug, name: person.trim() || null, tz: zone(), plan });
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
    held = { slug: out.value.slug, name: out.value.name, tz: out.value.tz, plan };
    hold(globalThis.sessionStorage, held);
    if (plan === 'free') void makeFree(held);
    else step = 'pay';
  }

  /** Storage the made record no longer needs, in this tab and across the mail. */
  function forget(): void {
    try {
      globalThis.sessionStorage?.removeItem(HELD_KEY);
    } catch {
      /* Storage off: nothing was kept, so nothing is left behind. */
    }
    keepPlan(localStore(), null);
    keepSaid(localStore(), null);
  }

  /** The line under "Making your BrainDog": which stage it is at. */
  let stage = $state('');
  /** What could not be written into the new record, said in the person's words. */
  let missed = $state.raw<string[]>([]);
  let madeAt = $state('');
  /**
   * The press that did not finish, to make again from here: the record by its name, and what is still to write. `null`
   * once everything went in, or when there is nothing to make again.
   */
  let again = $state.raw<{ name: string; asked: Accepting } | null>(null);

  /** The person moved on to the record as it is: nothing more is made from here, so the words are forgotten. */
  function openAsIs(): void {
    forget();
    location.assign(madeAt);
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
    const p = draft ? await reading(draft.said) : null;
    const one = p ? caseOf(draft?.usecase ?? p.usecase) : null;
    const beside = one && p && one.usecase === p.usecase ? p.also.flatMap((id) => caseOf(id) ?? []) : [];
    const asked = p ? new Set([...p.modules, ...[one, ...beside].flatMap((c) => c?.modules ?? [])]) : new Set<string>();
    /* IN /start's ORDER, install order first, so the record is made in the order /start would have made it. */
    const kept = [...new Set([...INSTALL_ORDER, ...asked])].filter((id) => asked.has(id));
    if (!draft || !p || (one === null && kept.length === 0)) {
      forget();
      location.assign(at(draft ? `${BASE}/${name}/start` : fallback));
      return;
    }
    stage = words.makingParts([...(one ? [one.title] : []), ...kept.map(moduleName)].slice(0, 4));
    const keepsMoney = kept.some(keepsCurrency);
    const signed = await methods();
    await write(name, {
      sentence: draft.said,
      proposal: p,
      usecase: one?.usecase ?? null,
      also: beside.map((b) => b.usecase),
      modules: kept,
      currency: keepsMoney ? (p.currency ?? draft.currency) : null,
      today: dayOf(Date.now()),
      email: signed.ok ? (signed.value.me?.email ?? null) : null,
      nav: pref.read().nav ?? [],
      locale,
    });
  }

  /**
   * ONE PRESS OF `/start`'s `accept()` AGAINST THE NEW RECORD, and what it came back with.
   *
   * THE WORDS ARE FORGOTTEN ONLY WHEN ALL OF IT WENT IN. A press that did not answer, or that missed something, keeps the
   * sentence and offers Try again, which writes only what is still missing (`left`), as a second press on `/start` does.
   */
  async function write(name: string, asked: Accepting): Promise<void> {
    step = 'making';
    busy = true;
    const { accept } = await import('../start/accept.ts');
    /* THE NEW RECORD BY ITS NAME: this page is under no slug, so its own base is the host's, and the record's is under it. */
    const out = await accept(createClient({ base: apiBase({ origin: apiBase(), pathname: `${BASE}/${name}/` }) }), asked).catch(() => null);
    if (out?.nav) pref.write({ nav: out.nav });
    /* NOTHING ANSWERED: the record may be empty, so opening it as it is lands on its /start, which asks the question
       there, not on the end of a first run that never wrote anything. */
    madeAt = at(out === null ? '/start' : '/start#made', `${BASE}/${name}/`);
    if (allWritten(out)) {
      again = null;
      forget();
      stage = words.makingOpen;
      location.assign(madeAt);
      return;
    }
    /* NOTHING ANSWERED: the record is made and may be empty, so it is the whole press again. Otherwise only what is left,
       over the rail order this press already wrote. */
    again = { name, asked: out === null ? asked : { ...asked, nav: out.nav ?? asked.nav, proposal: { ...asked.proposal, rows: out.left } } };
    missed = out === null ? [] : out.failed.map((f) => f.said);
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

  /** Whether the build stands beside the words: while describing and keeping, and while what was said is being made. */
  const showBuild = $derived(
    step === 'describe' || step === 'keep' || ((step === 'sent' || step === 'verifying' || step === 'making' || step === 'waiting') && sentence.trim() !== ''),
  );

  /* THIS SCREEN'S FIRST DRAW IS ITS STEP, whichever it is, once the host has answered or the address has said. */
  $effect(() => {
    if (step !== 'loading' && step !== 'verifying') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

{#snippet signInLink()}
  {#if step === 'describe' || step === 'keep'}
    <a class="link" href={at('/signin')}>{words.haveOne}</a>
  {/if}
{/snippet}

{#snippet saidLine()}
  <button type="button" class="said-line" disabled={busy} onclick={edit}>
    <q class="said-text">{sentence.trim()}</q>
    <span class="said-edit">{words.edit}</span>
  </button>
{/snippet}

<Frame end={signedIn === null ? signInLink : undefined}>
  <div class="board" data-paired={showBuild ? '' : undefined}>
    <div class="talk">
      {#if step === 'loading' || step === 'verifying'}
        <h1 class="title">{step === 'verifying' ? words.making : firstRun.whoQuestion}</h1>
        <p class="quiet" role="status">{step === 'verifying' ? copy.signupVerifying : copy.checkingWays}</p>
      {:else if step === 'unreachable'}
        <Empty kind="error" title={copy.unreachableTitle} body={copy.unreachableWhy}>
          {#snippet actions()}<Button onclick={() => void ask()}>{copy.askAgain}</Button>{/snippet}
        </Empty>
      {:else if step === 'closed'}
        <h1 class="title">{copy.signupClosedTitle}</h1>
        <p class="lede">{copy.signupClosedWhy}</p>
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
          ></textarea>
          <div class="chips" role="group" aria-label={firstRun.whoChipsLabel}>
            {#each firstRun.whoChips as c (c)}
              <!-- A mouse press keeps focus in the field, so the caret stays where the words are going. -->
              <Button size="sm" onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={() => chip(c)}>{c}</Button>
            {/each}
          </div>

          <!-- THE ONE QUESTION THE WORDS CANNOT ANSWER, drawn once Continue was pressed with it open. -->
          {#if asking && open === 'currency'}
            <section class="question" aria-labelledby="first-q">
              <h2 class="question-h" id="first-q" tabindex="-1">{firstRun.currencyQuestion}</h2>
              <Currency bind:value={currency} {locale} choices={currencyAsk?.choices ?? []} suggested={currencyAsk?.suggested ?? null} find={currencyAsk?.find ?? null} />
            </section>
          {:else if asking && (open === 'closest' || (chosen !== null && !live?.usecase))}
            <section class="question" aria-labelledby="first-q">
              <h2 class="question-h" id="first-q" tabindex="-1">{words.closest}</h2>
              <p class="quiet">{words.closestWhy}</p>
              <div class="chips" role="group" aria-label={firstRun.mineFor}>
                {#each USE_CASES as one (one.usecase)}
                  <Button weight="quiet" aria-pressed={chosen === one.usecase} onclick={() => pickCase(one.usecase)}>{one.title}</Button>
                {/each}
              </div>
            </section>
          {/if}

          <div class="go">
            <Button weight="primary" type="submit" kbd={sentence.trim() === '' ? undefined : '↵'}>{words.next}</Button>
          </div>
        </form>
      {:else if step === 'keep'}
        <h1 class="title" id="keep-h" tabindex="-1">{words.keepTitle}</h1>
        {@render saidLine()}
        <p class="lede">{signedIn ? (plan === 'free' ? words.keepSignedIn : words.keepSignedInPaid) : plan === 'free' ? words.keepLede : words.keepLedePaid}</p>
        <form class="form" onsubmit={send}>
          {#if nameByHand}
            <NameField bind:value={slug} bind:free id="up-name" />
          {:else if naming || slug !== ''}
            <p class="called" role="status">
              {#if naming}{words.calledFinding}{:else}{words.calledLine(slug)}
                <button type="button" class="link plain" onclick={changeName}>{words.change}</button>{/if}
            </p>
          {/if}

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
        </form>
      {:else if step === 'sent'}
        <h1 class="title" id="sent-h" tabindex="-1">{copy.signupCheckMail}</h1>
        <p class="lede">{copy.signupMailSent(sentTo)}</p>
        {#if sentence.trim() !== ''}<p class="quiet">{words.sentWhy}</p>{/if}
        <div class="go"><Button weight="quiet" onclick={otherAddress}>{copy.signupOtherAddress}</Button></div>
      {:else if step === 'link-failed'}
        <h1 class="title">{copy.signupLinkFailed}</h1>
        <p class="lede">{copy.signupLinkFailedWhy}</p>
        <div class="go"><Button weight="primary" onclick={() => void ask()}>{copy.signupStartAgain}</Button></div>
      {:else if step === 'making'}
        <h1 class="title">{words.making}</h1>
        <p class="lede" role="status">{stage}</p>
        <span class="bar" aria-hidden="true"><span class="bar-fill"></span></span>
      {:else if step === 'made-partly'}
        <h1 class="title">{words.madeTitle}</h1>
        <p class="lede" role="status">{missed.length > 0 ? words.madePartly : words.madeUnreached}</p>
        {#if missed.length > 0}
          <ul class="missed">
            {#each missed as m, i (i)}<li>{m}</li>{/each}
          </ul>
        {/if}
        <div class="go"><Button weight="primary" onclick={writeAgain} disabled={busy || again === null}>{words.tryAgain}</Button></div>
        <p class="aside"><button class="link plain" type="button" onclick={openAsIs}>{words.openAsIs}</button></p>
      {:else if step === 'make-failed'}
        <h1 class="title">{words.makeRecord}</h1>
        {#if said}<p class="lede" role="alert">{said}</p>{/if}
        {#if paidOnly}
          <div class="go"><Button weight="primary" onclick={payInstead}>{words.payInstead}</Button></div>
        {:else}
          <form class="form" onsubmit={makeAgain}>
            <NameField bind:value={slug} bind:free id="make-name" />
            <div class="go sticky">
              <Button weight="primary" type="submit" disabled={busy || !free || slug === ''} aria-busy={busy}>
                {busy ? words.makingNow : slug === '' ? words.makeRecord : words.makeFor(slug)}
              </Button>
            </div>
          </form>
          <p class="aside"><button class="link plain" type="button" onclick={payInstead}>{words.payInstead}</button></p>
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
        <Building {parts} heard={live?.heard ?? []} {rail} {locale} />
      </aside>
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

  .title:focus,
  .question-h:focus {
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
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    line-height: var(--lh-body);
    resize: vertical;
    scroll-margin-block: var(--sp-6) var(--sp-9);
  }

  .prompt::placeholder {
    color: var(--dim);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .chips :global(.btn[aria-pressed='true']) {
    background: var(--selected);
  }

  .question {
    display: grid;
    gap: var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
    animation: build-in var(--d-swap) var(--ease-out) both;
  }

  .question-h {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
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

  .called {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
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

  /* MAKING IT: one quiet bar that moves, never a spinner, under the stage it is at. */
  .bar {
    position: relative;
    display: block;
    inline-size: 100%;
    max-inline-size: 20rem;
    block-size: 4px;
    margin-block-start: var(--sp-2);
    overflow: hidden;
    border-radius: var(--r-pill);
    background: var(--s1);
  }

  .bar-fill {
    position: absolute;
    inset-block: 0;
    inline-size: 40%;
    border-radius: inherit;
    background: var(--ink);
    animation: bar-move 1.4s var(--ease-standard) infinite;
  }

  @keyframes bar-move {
    from {
      inset-inline-start: -40%;
    }
    to {
      inset-inline-start: 100%;
    }
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

  @media (prefers-reduced-motion: reduce) {
    .build,
    .question {
      animation: none;
    }

    .bar-fill {
      animation: none;
      inset-inline-start: 0;
    }
  }

  @media (width < 900px) {
    .title {
      font-size: var(--t-figure);
      line-height: 36px;
    }
  }
</style>
