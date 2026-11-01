<!--
  The front door. `/signin`.

  WHY THIS ADDRESS AND NOT `/in`. `12 §3` gives the inbound webhook `/in/webhook/…` and the self-host
  forwards inbound email to `/in/email/…`, so a screen at `/in` would stop existing the day that prefix
  is claimed; and every native screen is one lower-case word that is the job (`19 §2`, `§9`).

  WHICH WAYS IN DRAW IS THE HOST'S ANSWER, NOT THIS FILE'S. `GET /auth/methods` says what the host
  offers and `lib/signin.ts` reduces it to what this browser can use. A way that cannot act is absent,
  never greyed (`23 §3.1`), and exactly one of the rest is the filled button.

  NOTHING HAPPENS ON ARRIVAL. A passkey sheet nobody asked for is alarming, and a link in the address
  is spent by a press rather than on load, so a mail scanner that opens it spends nothing. The passkey offered in
  the email field's autofill is asked for on arrival and shows nothing until the field is touched (`offerPasskey`).

  ONE SHEET UNDER THE BRAND (`Entry.svelte`): "Sign in to BrainDog", one line on what the ways do, then every way in
  straight under it, the email first and filled, Google and a passkey quiet under it (first
  F7). A state screen is its own heading. No figure, so no chart and no tile inside the sheet.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';

  import {
    canAutofill,
    exchangeKey,
    forgetLapsed,
    methods,
    passkeyAutofill,
    passkeyRegister,
    passkeySignIn,
    linkFor,
    redeemLink,
    requestLink,
    signOut,
    support,
    takeLink,
    type Autofill,
    type Link,
    type Methods,
    type Said,
    type Who,
  } from '$lib/auth.ts';
  import { at, BASE } from '$lib/at.ts';
  import { appLink, CHALLENGE, desktopStart, handOff, keepVerifier, pkce } from '$lib/desktop-signin.ts';
  import { isApp, openOutside } from '$lib/shell.ts';
  import { copy } from '$lib/copy.ts';
  import { forgetRead } from '$lib/record/forget-read.ts';
  import { words } from './words.ts';
  import { googleStart, googleWhy, onwardOf, stateOf, type GoogleWhy, type How, type Shelf, type Step, type Ways } from '$lib/signin.ts';
  import { actable, mailHeld, noDoorYet } from './first-door.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';
  import Entry from './Entry.svelte';
  import Human from './Human.svelte';
  import { widgetWords } from '../signup/turnstile.ts';
  import { signupMode, type SignupMode } from '$lib/signup-door.ts';

  const here = support();

  /* IN THE MAC APP GOOGLE RUNS IN THE DEFAULT BROWSER (it refuses an app window) and comes back as a one-time code. */
  async function openGoogleInBrowser(e: MouseEvent): Promise<void> {
    e.preventDefault();
    const { verifier, challenge } = await pkce();
    if (keepVerifier(verifier, undefined, goTo)) openOutside(desktopStart(goTo, origin, challenge));
  }

  /* AN EMAILED LINK THE MAC APP ASKED FOR, opened here in a browser (`?app=` beside the link): handed back to the app as
     a one-time code on a press, rather than spent in this browser. The press is what hands it, as a press is what spends
     a link, so a mail scanner that opens it hands nothing. */
  let handoff = $state<string | null>(null);
  let handing = $state<'idle' | 'asking' | 'sent' | 'failed'>('idle');
  let handed = '';
  async function handBack(): Promise<void> {
    const l = link;
    if (handoff === null || l === null || l.kind !== 'magic' || handing === 'asking') return;
    if (handed === '') {
      handing = 'asking';
      handed = (await handOff(l.token, handoff, origin)) ?? '';
    }
    if (handed === '') {
      handing = 'failed';
      return;
    }
    location.href = appLink(handed);
    handing = 'sent';
  }

  let asked = $state<Said<Methods> | null>(null);
  let entered = $state<{ who: Who; via: 'passkey' | 'key' | 'link' } | null>(null);
  let link = $state<Link | null>(null);
  /* WHOSE ACCOUNT THE LINK IN THE ADDRESS OPENS (`linkFor`), asked once per link and said above its button. */
  let linkEmail = $state<{ token: string; email: string } | null>(null);
  $effect(() => {
    const l = link;
    if (l === null || linkEmail?.token === l.token) return;
    void linkFor(l).then((email) => {
      if (email !== null && link?.token === l.token) linkEmail = { token: l.token, email };
    });
  });
  let step = $state<Step>({ at: 'idle' });
  let now = $state(Date.now());
  /** Where the ways on from here go: see `onwardOf`, which is read once on arrival while the fragment is still there. */
  let goTo = $state(`${BASE}/`);

  /* WHAT IS TYPED IS COMPONENT STATE AND NOTHING ELSE. The key is emptied the moment it is handed to
     the request, so it is never on screen, in storage or in the address after the press. */
  let email = $state('');
  let key = $state('');
  let shown = $state(false);
  /** The email field, when the link is not the lead way in and somebody asked for it. */
  let mailing = $state(false);
  /* CLOUDFLARE'S CHECK on the link request, only where `/auth/methods` hands a site key. */
  const siteKey = $derived(asked?.ok === true ? (asked.value.turnstile ?? null) : null);
  let human = $state<string | null>(null);
  /* WHILE THE CHECK IS ASKED AND NOT YET ANSWERED, the button says so and a press sends nothing, as sign-up's does:
     sent without an answer, the host could only refuse it. */
  const waitsForCheck = $derived(siteKey !== null && human === null);
  let humanBox = $state<{ reset: () => void } | null>(null);
  /**
   * WHETHER THE SERVER-KEY BLOCK IS OPEN IS THE READER'S, ONCE IT IS DRAWN. The first run opens it, and
   * nothing a press does closes it again: bound to the derived state, a wrong key shut the block the
   * key had just been typed into.
   */
  let keyOpen = $state(false);
  let emailField = $state<HTMLInputElement | undefined>(undefined);
  /** Why a sign-in through Google came back here without a session, until the next press. */
  let fromGoogle = $state<GoogleWhy | null>(null);
  let origin = $state('');

  /**
   * THE PASSKEY IN THE EMAIL FIELD'S AUTOFILL. Where the browser offers it (`canAutofill`), the email field is
   * drawn whenever a link can be sent, marked `username webauthn`, and this site's passkeys are offered in its autofill,
   * so a returning phone signs in with one touch while the link stays for a device with none.
   *
   * NOT A SHEET NOBODY ASKED FOR. A conditional request shows nothing until the person touches the field, so the
   * header's rule (nothing happens on arrival) still holds.
   *
   * ONE REQUEST AT A TIME. Every press withdraws the offer and waits for the browser to let go of it before asking for
   * its own (`run`). `held` is the offer's own failure, so the effect that makes the offer does not make it again
   * straight away; the next press clears it.
   */
  let autofill = $state(false);
  let offer: Autofill | null = null;
  let held = false;

  const view = $derived(stateOf({ methods: asked, entered, link, step, secure: here.secure, webauthn: here.webauthn, now }));
  const asking = $derived(step.at === 'asking' ? step.how : null);

  /**
   * The ways in drawn under the message, or none. A send that is locked out leaves the others open.
   *
   * `actable` IS WHAT MAKES "none" MEAN NONE. `stateOf` carries a `Ways` whenever the host NAMED a
   * method, and on a brand new record's first run all three of its ways are false at once, because
   * the passkey button is switched off where no passkey exists yet. Read as a set of doors, that
   * object drew an empty block and the lede above it. See `first-door.ts` for the measured answer.
   */
  const doors = $derived.by((): Ways | null => {
    switch (view.name) {
      case 'signed-out':
      case 'asking':
      case 'rejected':
      case 'link-expired':
        return actable(view.ways);
      case 'locked':
        return view.how === 'send' && view.ways ? actable({ ...view.ways, magic: false }) : null;
      default:
        return null;
    }
  });

  /** What the host answered, or null while it is out or it did not answer at all. */
  const host = $derived(asked && asked.ok ? asked.value : null);

  /**
   * A record with no way into it yet, which is a fact about the record and not about this browser.
   *
   * ONLY IN `signed-out`, the state that would otherwise draw the doors. A claim link in the address
   * puts the screen in `link-landing` with a button to press, and a spent one in `link-expired` with
   * its own sentence; neither of those is a record nobody can reach.
   *
   * THE NOTE GOES IN BECAUSE SIGNING OUT LOOKS THE SAME FROM HERE. `leave()` sets `me` to null and
   * leaves `firstRun` alone, which is the shape of a record nobody has opened; `note: 'out'` is what
   * says somebody just did. See `first-door.ts`.
   */
  const noDoor = $derived(view.name === 'signed-out' && host !== null && noDoorYet(host, doors, view.note));
  /** A first run whose way in is a letter that cannot go out now: the mail-down line, never the claim link one. */
  const noMail = $derived(view.name === 'signed-out' && host !== null && mailHeld(host, doors, view.note));

  /** Whether the email field is on screen: the link's way in when it leads or was asked for, and wherever autofill is. */
  const fieldShown = $derived(doors !== null && doors.magic && (doors.lead === 'magic' || mailing || autofill));

  /** Whether a way in other than a passkey is drawn, so a sentence never points at one that is not there. */
  const otherWays = (ways: Ways | null): boolean => ways !== null && (ways.magic || ways.key);
  /** How many ways in are drawn: after one is refused, "another" is only true when there is more than one. */
  const wayCount = (ways: Ways | null): number => (ways ? [ways.passkey, ways.magic, ways.key].filter(Boolean).length : 0);

  /* `noDoor` AND `noMail` TAKE THE NOTE AWAY, and that is the repair. `stateOf` says `unsupported` whenever no
     way can act, and on the first run it said so about a browser that was working perfectly. The
     only note they can swallow is that one: both refuse `out`, so the confirmation somebody
     gets for pressing Sign out still arrives on a record that holds no passkey. */
  const note = $derived(
    view.name !== 'signed-out' || noDoor || noMail
      ? null
      : view.note === 'cancelled'
        ? copy.passkeyCancelled
        : view.note === 'unsupported'
          ? copy.passkeyUnusable(otherWays(view.ways))
          : view.note === 'out'
            ? copy.signedOut
            : null,
  );

  const added = $derived(
    view.name !== 'signed-in'
      ? null
      : view.add === 'added'
        ? copy.passkeyAdded
        : view.add === 'cancelled'
          ? copy.passkeyNotAdded
          : view.add === 'exists'
            ? copy.passkeyExists
            : view.add === 'failed'
              ? copy.passkeyFailed
              : null,
  );

  async function load() {
    const at = opened();
    asked = await methods();
    /* A SESSION THAT RAN OUT WITH NO SIGN-OUT LEFT ITS COPIES HERE (RE7): gone once the account says nobody is in. */
    void forgetLapsed(asked);
    /* `true` whatever came back: a host without sign-in is a state this screen draws, not a refusal of
       it. The error states draw an `Empty`, which says `refused` for as long as it is on screen. */
    closed(true, at);
  }

  onMount(() => {
    /* THE LINK LEAVES THE ADDRESS BEFORE THE ONE REQUEST MADE ON ARRIVAL. The browser's own
       `replaceState`, with the router's state kept so its history stays whole. SvelteKit's wrapper is
       not used: importing it keeps its shallow-routing code in the entry chunk, which measured 0.8 KB
       brotli on every screen for one call on this one.
       WHERE HE GOES AFTERWARDS IS READ FIRST, because it needs to know whether a link came, and `takeLink` is about
       to clear the fragment that says so. */
    goTo = onwardOf(location.search, location.hash, tabShelf());
    origin = location.origin;
    /* WHAT GOOGLE'S WAY BACK SAID LEAVES THE ADDRESS TOO, so a reload does not say it again. */
    fromGoogle = googleWhy(location.search);
    if (fromGoogle) {
      const kept = new URLSearchParams(location.search);
      kept.delete('google');
      history.replaceState(history.state, '', `${location.pathname}${kept.size > 0 ? `?${kept}` : ''}${location.hash}`);
    }
    /* AN ADDRESS HANDED ON BY A SPENT SIGN-UP LINK (`/signin#email=`), filled in so the link's way in is one press. In
       the fragment, so it never reaches a server's log; and it leaves the address at once. */
    const handed = /^#email=(.+)$/su.exec(location.hash);
    if (handed) {
      clearHash();
      const to = decodeURIComponent(handed[1] ?? '').trim();
      if (/^[^\s@]+@[^\s@]+$/u.test(to)) {
        email = to;
        mailing = true;
      }
    }
    /* THE MAC APP'S CHALLENGE, read before the link leaves the address and taken out of it too. Only in a browser: a
       link opened in the app itself is spent where it is. */
    const query = new URLSearchParams(location.search);
    const app = query.get('app');
    if (app !== null) {
      if (!isApp && CHALLENGE.test(app)) handoff = app;
      query.delete('app');
      history.replaceState(history.state, '', `${location.pathname}${query.size > 0 ? `?${query}` : ''}${location.hash}`);
    }
    link = takeLink(location.hash, clearHash);
    void load();
    if (here.secure && here.webauthn) void canAutofill().then((yes) => (autofill = yes));
    window.addEventListener('hashchange', arrived);
    return () => {
      window.removeEventListener('hashchange', arrived);
      void withdraw();
    };
  });

  /** This tab's storage, or `null` where reading the property itself throws, as it does with site data blocked. */
  function tabShelf(): Shelf | null {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }

  function clearHash() {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }

  /**
   * A LINK PASTED INTO A TAB ALREADY HERE IS TAKEN TOO. A change to the fragment alone is a same-document navigation,
   * so nothing mounts again: a claim link pasted over `/signin` changed the address, left
   * "Sign in to open your record." on screen, made no request, and stayed so until a reload. The owner will very likely
   * have this page open when he pastes it, from the site's own "Sign in". A press that is out keeps its moment; anything
   * else on screen gives way to the landing, which needs the step idle to be drawn.
   *
   * WHERE SOMEBODY IS ALREADY IN, THE LINK IS KEPT AND SAID, NOT LANDED. `stateOf` answers `signed-in` before it looks
   * at a link, and was measured drawing "You are signed in" with the address emptied and nothing to
   * say a link had come. The signed-in state carries the link now, the
   * screen says so in one line, and Sign out lands on it.
   */
  function arrived() {
    const l = takeLink(location.hash, clearHash);
    if (!l) return;
    link = l;
    if (step.at !== 'asking') step = { at: 'idle' };
  }

  /**
   * FOCUS FOLLOWS THE STEP (audit f, AF15). A press that changes the screen took its own button away, and focus fell to
   * `<body>`: after "Email me a sign-in link", a spent link and a lockout a keyboard started again from the top, and a
   * screen reader heard the status line at best. So once somebody has pressed something, a screen that is a message
   * (`SAYS`) puts focus on its heading or its sentence, and any other screen does so only where focus was lost. Nothing
   * moves on arrival: the skip link stays the first Tab.
   */
  const SAYS = new Set<string>(['link-sent', 'link-expired', 'locked', 'rejected', 'unreachable', 'signed-in', 'open']);
  let col = $state<HTMLElement | undefined>(undefined);
  let pressed = false;
  let shownAs = '';
  $effect(() => {
    const name = view.name;
    if (name === shownAs) return;
    shownAs = name;
    if (!pressed || name === 'asking' || name === 'loading') return;
    void tick().then(() => land(SAYS.has(name)));
  });

  function land(always: boolean): void {
    const was = document.activeElement;
    if (!always && was !== null && was !== document.body && was.isConnected) return;
    const to = col?.querySelector<HTMLElement>('.act h1, .act .empty-title') ?? col?.querySelector<HTMLElement>('h1') ?? null;
    if (to === null) return;
    if (!to.hasAttribute('tabindex')) to.setAttribute('tabindex', '-1');
    to.focus();
  }

  /** One press: the step says it is out, and what came back decides the next one. */
  async function run<T>(how: How, work: () => Promise<Said<T>>, then: (value: T) => void) {
    if (step.at === 'asking') return;
    pressed = true;
    fromGoogle = null;
    step = { at: 'asking', how };
    held = false;
    /* THE OFFER IN THE FIELD LETS GO FIRST, and a pick made just before the press is a sign-in that stands. */
    if (await withdraw()) return;
    const at = opened();
    const out = await work();
    closed(true, at);
    now = Date.now();
    if (out.ok) then(out.value);
    else step = { at: 'failed', how, failure: out, when: now };
  }

  /**
   * SIGNING IN DROPS THE BOOT THIS TAB KEPT. The screen's own load asked `boot` at the bare address with no session, was
   * refused, and kept the sample for the tab; signing in is a `fetch` that sets a cookie and nothing more. Walked through,
   * "Open BrainDog" then drew The Studio with no request,
   * after the claim link and again after the passkey. The onward buttons are full page loads, which is the repair.
   * That refusal is not kept any more, since the sample went; this stays for a tab that came here from
   * a record it had read, so a move out that is not a full load asks the record again rather than drawing the old one.
   */
  const enter = (via: 'passkey' | 'key' | 'link') => (who: Who) => {
    forgetRead();
    entered = { who, via };
    link = null;
    step = { at: 'idle' };
  };

  const withPasskey = () => void run('passkey', () => passkeySignIn(), enter('passkey'));

  /**
   * STRAIGHT IN WHEN NOTHING IS LEFT TO ASK (first hour audit, E21). Signing in by email stopped twice: "Sign in with
   * this link", which stays (a scanner must not spend it), and then "You're signed in / Open BrainDog" with one BrainDog
   * to open. A sign-in made on this screen, with no passkey to offer first (`lead` is `open`: the person has one), no
   * link waiting and a BrainDog behind the session, goes on to it. Somebody who came here already in still sees the
   * screen, with Sign out on it.
   */
  let going = $state(false);
  $effect(() => {
    if (going || entered === null || view.name !== 'signed-in' || view.lead !== 'open' || view.link !== null) return;
    if (view.who.record === null && goTo === `${BASE}/`) return;
    if (view.add === 'asking' || step.at !== 'idle') return;
    going = true;
    location.assign(goTo);
  });

  /** Offer this site's passkeys in the email field's autofill, once, until it signs somebody in or is withdrawn. */
  function offerPasskey() {
    if (offer) return;
    const mine = passkeyAutofill();
    offer = mine;
    void mine.done.then((out) => {
      const ours = offer === mine;
      if (ours) offer = null;
      if (out.ok) return enter('passkey')(out.value);
      /* WITHDRAWN BY A PRESS, which says what happens next itself; or closed by the person, which is not a failure. */
      if (!ours || out.kind === 'cancelled') return;
      held = true;
      /* NOBODY PRESSED ANYTHING YET. A challenge that would not come, or a browser that said no before a pick, is the
         offer's own trouble: drawn, it would turn the screen into "unreachable" or "locked" on arrival. The field and
         the button stay, and the button's press says what is wrong if it still is. */
      if (!mine.picked) return;
      now = Date.now();
      step = { at: 'failed', how: 'passkey', failure: out, when: now };
    });
  }

  /** Take the offer away and wait for the browser to let go of it: `true` when it signed somebody in meanwhile. */
  async function withdraw(): Promise<boolean> {
    const mine = offer;
    offer = null;
    return mine ? (await mine.stop()).ok : false;
  }

  function withKey(e: SubmitEvent) {
    e.preventDefault();
    const typed = key;
    key = '';
    void run('key', () => exchangeKey(typed), enter('key'));
  }

  function send(e: SubmitEvent) {
    e.preventDefault();
    if (waitsForCheck) return;
    sendTo(email.trim());
  }

  /** `when` starts the sent screen's minute, after which it says what fixes a letter that did not come (`SENT_LATE`). */
  /* IN THE MAC APP THE LINK CARRIES THIS WINDOW'S CHALLENGE, so the browser the mail opens it in hands it back here. */
  const appChallenge = async (): Promise<string | null> => {
    if (!isApp) return null;
    const { verifier, challenge } = await pkce();
    return keepVerifier(verifier, undefined, goTo) ? challenge : null;
  };

  const sendTo = (to: string) =>
    void run(
      'send',
      async () => requestLink(to, goTo === `${BASE}/` ? null : goTo, undefined, human, await appChallenge()),
      () => (step = { at: 'sent', email: to, when: Date.now() }),
    ).then(() => {
      /* THE ANSWER IS GOOD ONCE, so the check is asked again whatever came back. */
      humanBox?.reset();
    });

  function spend() {
    const l = link;
    if (l) void run('link', () => redeemLink(l), enter('link'));
  }

  const addPasskey = () => void run('add', () => passkeyRegister(), () => (step = { at: 'added' }));

  const leave = () =>
    void run('out', () => signOut(), () => {
      entered = null;
      if (asked?.ok) asked = { ok: true, value: { ...asked.value, me: null } };
      step = { at: 'out' };
    });

  /* WHEN TRY AGAIN LAST CAME BACK, so a second failure does not draw the same screen as the first and read as a dead button. */
  let retried = $state('');

  function again() {
    pressed = true;
    retried = '';
    step = { at: 'idle' };
    asked = null;
    void load().then(() => {
      retried = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });
  }

  async function mail() {
    step = { at: 'idle' };
    mailing = true;
    await tick();
    emailField?.focus();
  }

  $effect(() => {
    if (doors?.keyOpen) keyOpen = true;
  });

  /* THE LOCKOUT COUNTS DOWN ON ITS OWN, so the ways in come back when the minutes run out rather
     than when somebody reloads. */
  $effect(() => {
    if (view.name !== 'locked') return;
    const t = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(t);
  });

  /* THE OFFER IS MADE WHILE THE FIELD IT LIVES IN IS ON SCREEN and a passkey can act, and nothing is out. */
  $effect(() => {
    if (fieldShown && doors?.passkey === true && step.at !== 'asking' && !held) untrack(offerPasskey);
  });

  /* THE SENT SCREEN'S MINUTE RUNS ON ITS OWN, so its second line arrives without a reload. */
  $effect(() => {
    if (view.name !== 'link-sent' || view.late) return;
    const t = setInterval(() => (now = Date.now()), 5_000);
    return () => clearInterval(t);
  });

  /** What the line under the ways in says: only the ways that are drawn. */
  const lede = $derived(doors ? copy.signInLede(doors.magic, doors.google === true, doors.passkey) : null);

  /** Who may sign up here, for the foot's one line; `null` until the host says, and then no line is drawn. */
  let mode = $state<SignupMode | null>(null);
  /** Whether the first 400ms have passed with the host still out, so "Getting sign-in ready" may show. */
  let slow = $state(false);
  onMount(() => {
    const t = setTimeout(() => (slow = true), 400);
    return () => clearTimeout(t);
  });
  /* ASKED ONLY OF A HOST THAT SAYS IT SERVES SIGN-UP (`signup` on `/auth/methods`, the hosted app): a self-host has no such
     door, and asking it was a 404 in the console on every sign-in. Asked once, after the host has said. */
  let modeAsked = false;
  $effect(() => {
    if (modeAsked || asked?.ok !== true || asked.value.signup !== true) return;
    modeAsked = true;
    void signupMode().then((m) => (mode = m));
  });

  /* The shell is drawn synchronously and says so. While a call is out, `opened()` takes the claim back. */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.signIn)}</title></svelte:head>

{#snippet addDoor(lead: boolean)}
  {#if view.name === 'signed-in' && view.add !== 'absent' && view.add !== 'added'}
    <Button weight={lead ? 'primary' : 'quiet'} onclick={addPasskey} aria-busy={view.add === 'asking'}>
      <Icon name="key" size="m" />{view.add === 'asking' ? copy.addingPasskey : copy.addPasskeyHere}
    </Button>
  {/if}
{/snippet}

<!-- A PASSKEY, ITS NAME EXACTLY `copy.withPasskey` (the `passkey` gate presses it by that name). Said once it is made,
     not under its button: the explainer went (first F7). -->
{#snippet passkeyDoor(lead: boolean)}
  <Button weight={lead ? 'primary' : 'quiet'} onclick={withPasskey} aria-busy={asking === 'passkey'}>
    <Icon name="key" size="m" />{asking === 'passkey' ? copy.waitingForPasskey : copy.withPasskey}
  </Button>
{/snippet}

<!-- THE ENTRY FRAME EVERY WAY IN SHARES (`Entry.svelte`): the brand on the ground, one sheet under it, this column in it. -->
<Entry>
  <div class="col" bind:this={col}>
    <!-- THE TASK AS THE HEADING, where a way in is offered (or about to be): a state screen ("Check your email", "You're
         signed in", "BrainDog did not answer") is its own heading instead, and draws no title over it (first F7). A spent
         link leads with what happened, its ways in under it (audit f, AF17). -->
    {#if view.name === 'loading' || (doors && !noDoor && view.name !== 'link-expired')}
      <div class="intro">
        <h1 class="entry-title">{copy.signInTitle}</h1>
        {#if doors && lede}<p class="entry-lede">{lede}</p>{/if}
      </div>
    {/if}

    <div class="act">
      {#if view.name === 'loading'}
        <!-- NOTHING FOR THE FIRST 400MS, so a host that answers at once never flashes a line (first F15). -->
        <p class="status" role="status">{slow ? copy.checkingWays : ''}</p>
      {:else if view.name === 'unreachable'}
        <div class="said">
          <Empty kind="error" heading title={copy.unreachableTitle} body={retried ? copy.unreachableStill(retried) : copy.unreachableWhy}>
            {#snippet actions()}<Button weight="primary" onclick={again}>{copy.askAgain}</Button>{/snippet}
          </Empty>
        </div>
      {:else if view.name === 'no-host'}
        <div class="calm">
          <IconWell name="info" size="card" />
          <h1 class="entry-title">{copy.noHostTitle}</h1>
          <p class="calm-body">{copy.noHostWhy}</p>
        </div>
      {:else if view.name === 'open'}
        <div class="calm">
          <IconWell name="check" size="card" tone="earn" />
          <h1 class="entry-title">{copy.openTitle}</h1>
          <p class="calm-body">{copy.openWhy}</p>
        </div>
        <!-- A FULL PAGE LOAD, like every way on from this screen: see "Open BrainDog" below. -->
        <div class="doors"><Button weight="primary" href={goTo} data-sveltekit-reload>{copy.openYourRecord}</Button></div>
      {:else if view.name === 'not-configured'}
        <div class="said"><Empty kind="no-permission" heading title={copy.notConfiguredTitle} body={copy.notConfiguredWhy} /></div>
      {:else if view.name === 'insecure'}
        <div class="said"><Empty kind="no-permission" heading title={copy.insecureTitle} body={copy.insecureWhy} /></div>
      {:else if view.name === 'locked'}
        <div class="said"><Empty kind="no-permission" title={copy.lockedTitle(view.minutes)} body={copy.lockedWhy} /></div>
      {:else if view.name === 'rejected'}
        <div class="said">
          <Empty
            kind="error"
            title={view.closed ? copy.closedTitle : (view.fix ?? copy.rejectedTitle)}
            body={view.closed ? copy.closedNext : copy.rejectedNext(wayCount(view.ways) > 1)}
          />
        </div>
      {:else if view.name === 'link-expired'}
        <div class="said">
          <Empty kind="error" heading title={copy.linkExpiredTitle} body={copy.linkExpiredWhy(view.link, view.ways?.magic === true)} />
        </div>
      {:else if view.name === 'link-sent'}
        <div class="calm" role="status">
          <IconWell name="check" size="card" tone="earn" />
          <h1 class="entry-title">{copy.linkSentTitle}</h1>
          <p class="calm-body">{copy.linkSentBody(view.email)}</p>
          {#if isApp}<p class="calm-body">{words.appLinkSent}</p>{/if}
          <!-- THE SECOND LINE, a minute on (`SENT_LATE`): the screen cannot know a letter failed, so it says what fixes one. -->
          {#if view.late}<p class="calm-body">{copy.linkSentLater}</p>{/if}
        </div>
        <div class="doors">
          {#if view.late}
            {@const to = view.email}
            <Button weight="primary" onclick={() => (siteKey === null ? sendTo(to) : void mail())} aria-busy={asking === 'send'}>{copy.sendAgain}</Button>
          {/if}
          <Button onclick={mail}>{copy.useAnotherEmail}</Button>
        </div>
      {:else if handoff !== null && link?.kind === 'magic' && (view.name === 'link-landing' || view.name === 'signed-in')}
        <!-- THE LINK GOES BACK TO THE MAC APP THAT ASKED FOR IT (`handBack`), whether or not this browser is signed in
             already, and this browser is offered as the other way while it is not. -->
        <div class="calm" role={handing === 'sent' ? 'status' : undefined}>
          <IconWell name={handing === 'sent' ? 'check' : 'link'} size="card" tone={handing === 'sent' ? 'earn' : undefined} />
          <h1 class="entry-title">{handing === 'sent' ? words.handoffSentTitle : words.handoffTitle}</h1>
          <p class="calm-body">{handing === 'sent' ? words.handoffSentWhy : words.handoffWhy}</p>
          <!-- WHOSE ACCOUNT, here too: `?app=` must not be a way past the line a stranger's link is read by. -->
          {#if linkEmail !== null && linkEmail.token === link.token}<p class="calm-who">{copy.linkOpens(link.kind, linkEmail.email)}</p>{/if}
        </div>
        {#if handing === 'failed'}<p class="status" role="status">{words.handoffFailed}</p>{/if}
        <div class="doors">
          {#if handing !== 'failed'}
            <Button weight={handing === 'sent' ? 'quiet' : 'primary'} onclick={handBack} aria-busy={handing === 'asking'}>
              {handing === 'asking' ? words.handoffOpening : handing === 'sent' ? words.handoffAgain : words.handoffOpen}
            </Button>
          {/if}
          {#if view.name === 'link-landing'}
            <Button weight={handing === 'failed' ? 'primary' : 'bare'} onclick={spend} aria-busy={view.asking}>
              {view.asking ? copy.signingIn : words.handoffHere}
            </Button>
          {:else if view.name === 'signed-in'}
            <Button weight={handing === 'failed' ? 'primary' : 'bare'} href={goTo} data-sveltekit-reload>{copy.openBrainDog}</Button>
          {/if}
        </div>
      {:else if view.name === 'link-landing'}
        <div class="calm">
          <IconWell name="link" size="card" />
          <h1 class="entry-title">{view.link.kind === 'claim' ? copy.claimLandingTitle : copy.linkLandingTitle}</h1>
          {#if linkEmail !== null && linkEmail.token === view.link.token}<p class="calm-who">{copy.linkOpens(view.link.kind, linkEmail.email)}</p>{/if}
        </div>
        <div class="doors">
          <Button weight="primary" onclick={spend} aria-busy={view.asking}>
            {view.asking ? copy.signingIn : view.link.kind === 'claim' ? copy.claimRecord : copy.useLink}
          </Button>
        </div>
      {:else if view.name === 'signed-in' && going}
        <p class="status" role="status">{words.goingIn}</p>
      {:else if view.name === 'signed-in'}
        <div class="calm">
          <IconWell name="check" size="card" tone="earn" />
          <h1 class="entry-title">{copy.signedInTitle}</h1>
          <p class="calm-who">{view.who.email}</p>
        </div>
        {#if added}<p class="status" role="status">{added}</p>{/if}
        <!-- A LINK PASTED OVER THIS SCREEN IS SAID HERE, because the address no longer says it: `takeLink` cleared the
             fragment, and before this line the tab read "You are signed in" as if nothing had come. It is kept in
             state, so Sign out lands on it rather than on the ways in (`stateOf` lands on `out` with a link). -->
        {#if view.link}<p class="status" role="status">{copy.linkWaitsSignedIn}</p>{/if}
        <div class="doors">
          {#if view.lead === 'add'}
            {@render addDoor(true)}
            <p class="small">{copy.addPasskeyWhy(entered?.via ?? null)}</p>
          {/if}
          <!-- A FULL PAGE LOAD, AND THAT IS THE REPAIR. A client-side move to `/` kept everything this tab
               decided before the sign-in: the boot (the sample, then), the switcher's list, the voice. Walked twice, it drew
               The Studio, "Nothing you do here is saved.", with no request made; a reload drew his own record,
               because the Worker answers `/` with a 302 to `/<slug>/` once there is a session. -->
          <Button weight={view.lead === 'open' ? 'primary' : 'quiet'} href={goTo} data-sveltekit-reload>{copy.openBrainDog}</Button>
          {#if view.lead === 'open'}{@render addDoor(false)}{/if}
          <Button weight="bare" onclick={leave} aria-busy={view.out === 'asking'}>
            {view.out === 'asking' ? copy.signingOut : copy.signOut}
          </Button>
        </div>
        {#if view.out === 'failed'}<p class="status" role="status">{copy.signOutFailed}</p>{/if}
      {:else if noDoor}
        <!-- THE FIRST RUN, AND NOTHING CAN SIGN ANYBODY IN YET. The claim link is the way through,
             and it is in the terminal of whoever provisioned the record rather than in an inbox. -->
        <div class="said"><Empty kind="no-permission" heading title={copy.firstDoorTitle} body={copy.firstDoorWhy} /></div>
      {/if}

      {#if note}<p class="status" role="status">{note}</p>{/if}
      {#if host?.magic === 'down' && !noDoor && (doors || view.name === 'signed-out')}<p class="status" role="status">{noMail ? copy.firstDoorMailDown : copy.mailDown}</p>{/if}
      {#if fromGoogle && doors}<p class="status" role="status">{copy.googleSaid[fromGoogle]}</p>{/if}

      <!-- ONE BLOCK FOR EVERY STATE THAT OFFERS A WAY IN, so moving between signed out, asking and
           rejected never remounts it: an open server-key block stays open, and a typed email stays.
           THE EMAIL FIRST, THEN GOOGLE, THEN A PASSKEY (first F7): the email is a way in for anybody, and a passkey
           this device holds still opens in one touch from the field's own autofill. -->
      {#if doors}
        <div class="doors">
          {#if doors.magic}
            {#if fieldShown}
              <!-- `username webauthn`: the address, and this site's passkeys in the same autofill (`offerPasskey`). -->
              <form class="form" onsubmit={send}>
                <label class="field-label" for="in-email">{copy.emailLabel}</label>
                <span class="field field-lg">
                  <input
                    id="in-email"
                    class="field-input"
                    type="email"
                    autocomplete="username webauthn"
                    spellcheck="false"
                    autocapitalize="none"
                    required
                    placeholder={copy.emailLike}
                    bind:value={email}
                    bind:this={emailField}
                  />
                </span>
                {#if siteKey !== null}<Human {siteKey} bind:answer={human} bind:this={humanBox} />{/if}
                <Button weight={doors.lead === 'magic' ? 'primary' : 'quiet'} type="submit" aria-busy={asking === 'send'}>
                  {asking === 'send' ? copy.sendingLink : waitsForCheck ? widgetWords('ready').send : copy.emailLink}
                </Button>
              </form>
            {:else}
              <Button onclick={mail}><Icon name="link" size="m" />{copy.emailLink}</Button>
            {/if}
          {/if}

          {#if doors.passkey && doors.lead === 'passkey'}{@render passkeyDoor(true)}{/if}

          <!-- A LINK AND NOT A PRESS: the host sends the browser to Google and back, and the page is loaded again signed
               in. The mark is drawn in the ink, as every glyph here is. -->
          {#if doors.google}
            <Button href={googleStart(goTo, origin)} data-sveltekit-reload onclick={isApp ? openGoogleInBrowser : undefined}>
              <svg class="g" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                />
              </svg>{copy.withGoogle}
            </Button>
          {/if}

          {#if doors.passkey && doors.lead !== 'passkey'}{@render passkeyDoor(false)}{/if}

          <!-- THE SELF-HOST'S DOOR, and only a self-host offers it. Open on first run, when no passkey
               exists yet and this is the only way the first person can get in. -->
          {#if doors.key}
            <!-- THE ONLY DOOR IS NOT FOLDED (P48): where the server key is the one way in, it is the
                 form itself, not an open disclosure that reads as a second choice. -->
            {#snippet keyForm()}
              <form class="form" onsubmit={withKey}>
                <label class="field-label" for="in-key">{copy.serverKeyLabel}</label>
                <span class="field">
                  <!-- `value` and `oninput` rather than `bind:value`, because the type is what the show
                       control changes, and a two-way binding on a dynamic type is not legal. -->
                  <input
                    id="in-key"
                    class="field-input"
                    type={shown ? 'text' : 'password'}
                    autocomplete="current-password"
                    spellcheck="false"
                    autocapitalize="none"
                    required
                    aria-describedby="in-key-why"
                    value={key}
                    oninput={(e) => (key = e.currentTarget.value)}
                  />
                  <!-- A word on the control, because an eye alone is two states drawn as one picture. -->
                  <button type="button" class="peek tap" aria-pressed={shown} onclick={() => (shown = !shown)}>
                    <Icon name="eye" size="s" />{shown ? copy.hideToken : copy.showToken}
                  </button>
                </span>
                <p class="hint" id="in-key-why">{copy.serverKeyHint}</p>
                <Button weight={doors.lead === 'key' ? 'primary' : 'quiet'} type="submit" aria-busy={asking === 'key'}>
                  {asking === 'key' ? copy.signingIn : copy.signIn}
                </Button>
              </form>
            {/snippet}
            {#if !doors.google && !doors.passkey && !doors.magic}
              {@render keyForm()}
            {:else}
              <details class="own" bind:open={keyOpen}>
                <summary class="own-q"><Icon name="chevronDown" size="s" />{copy.serverKeyWay}</summary>
                {@render keyForm()}
              </details>
            {/if}
          {/if}
        </div>
      {/if}

      <!-- A STRANGER'S WAY TO A BRAINDOG OF THEIR OWN, BY WHO MAY SIGN UP (first F4): an invite where it is invite only,
           a BrainDog where it is open, and nothing where it is closed, so nobody is sent to a form they cannot finish.
           Not where the server key is offered: that is a self-host, made by its operator, with no sign-up. -->
      {#if doors && !doors.key && (mode === 'invite' || mode === 'open')}
        <p class="new-here">
          <a class="new-link" href={at('/signup')} data-sveltekit-reload>{mode === 'invite' ? copy.signupAskInvite : copy.signupCreate}</a>
        </p>
      {/if}

      <!-- NO DEMO PILL. It opened the sample business at `/` for anybody not signed in, and there is no
           sample now: `/` with no session is this screen, so the pill led back here. -->
    </div>
  </div>
</Entry>

<style>
  /* THE FRAME, THE SHEET, THE BRAND AND THE TITLE ARE `Entry.svelte`'s; this is the column inside the sheet, the title
     first and every way in straight under it, all on one start edge. */
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .act {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .doors {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .g {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    fill: currentColor;
  }

  /* EVERY WAY IN IS THE WIDTH OF THE COLUMN and as tall as a field beside it: 40 under a mouse, 44 under a thumb
     (`--ctl-h` is 44 there). A label may wrap: at 320 the longest one is wider than a nowrap pill can be. */
  .col :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
    white-space: normal;
    text-align: center;
  }

  /* THE FOOT OF THE SHEET: a hairline, then the one way to a BrainDog of your own. */
  .new-here {
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
    font-size: var(--fs-body);
    line-height: 22px;
  }

  /* A 44PX TARGET ON A PHONE, as every way on from this screen is, without making a line of text look like a button. */
  .new-link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--red);
    font-weight: 500;
  }

  /* SENTENCES, AT THE BODY SIZE AND MEASURE: what is happening, and what a link does. */
  .status,
  .small {
    margin: 0;
    font-size: var(--fs-body);
    line-height: 22px;
  }

  .status {
    color: var(--ink-2);
  }

  /* The loading line holds its one line while it waits its 400ms, so nothing moves when it arrives. */
  .status:empty {
    min-block-size: 22px;
  }

  .small {
    color: var(--ink-3);
  }

  /* A STATE THAT IS THE SCREEN: its glyph in a well (green when it went well), the state's title as the page's heading,
     the body under it. On the column's start edge, as `Empty` is everywhere else. */
  .calm {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--sp-2);
  }

  .calm :global(.well) {
    margin-block-end: var(--sp-2);
  }

  .calm-who {
    margin: 0;
    color: var(--ink);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .calm-body {
    margin: 0;
    max-inline-size: 42ch;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  /* `Empty` stands in the sheet with no tile of its own (a tile never holds a tile), and its padding goes, because the
     column's gap already spaces it. */
  .said :global(.empty) {
    padding: 0;
    background: none;
  }

  .said :global(.empty-actions) {
    align-self: stretch;
  }

  /* Short sentences, where a last word on its own line is the first thing the eye lands on. */
  .said :global(.empty-body),
  .calm-body,
  .small {
    text-wrap: pretty;
  }

  /* A FIELD: its label above, the field, a hint 8 under that, and its button 12 under. */
  .form {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .form .hint {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .form :global(.btn) {
    margin-block-start: var(--sp-3);
  }

  /* The key is 43 characters of base64url checked glyph for glyph, which is what the mono face is for. */
  .field-input#in-key {
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  .peek {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--d-state) var(--ease-out);
  }

  .own-q {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 500;
    list-style: none;
    cursor: pointer;
    transition: color var(--d-state) var(--ease-out);
  }

  .own-q::-webkit-details-marker {
    display: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .peek:hover,
    .own-q:hover {
      color: var(--ink);
    }
  }

  .own-q :global(svg) {
    transition: transform var(--d-panel) var(--ease-out);
  }

  .own[open] .own-q :global(svg) {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .own-q :global(svg) {
      transition: none;
    }
  }

  .own .form {
    margin-block-start: var(--sp-3);
  }

  /* A FOCUSED FIELD SCROLLS CLEAR OF THE EDGES WITH THE PHONE'S KEYBOARD UP, with the button under it in view. */
  .form .field-input {
    scroll-margin-block: var(--sp-6) var(--sp-8);
  }

  /* UNDER A THUMB EVERY FIELD READS AT 16, the size below which a phone's browser zooms the page in on focus. */
  @media (pointer: coarse) {
    .form .field-input,
    .field-input#in-key {
      font-size: var(--fs-body);
    }
  }

  @media (width < 640px) {
    .own-q {
      min-block-size: var(--tap);
    }
  }
</style>
