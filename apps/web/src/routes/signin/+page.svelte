<!--
  The front door. `/signin`.

  WHY THIS ADDRESS AND NOT `/in`. `12 §3` gives the inbound webhook `/in/webhook/…` and the self-host
  forwards inbound email to `/in/email/…`, so a screen at `/in` would stop existing the day that prefix
  is claimed; and every native screen is one lower-case word that is the job (`19 §2`, `§9`).

  WHICH WAYS IN DRAW IS THE HOST'S ANSWER, NOT THIS FILE'S. `GET /auth/methods` says what the host
  offers and `lib/signin.ts` reduces it to what this browser can use. A way that cannot act is absent,
  never greyed (`23 §3.1`), and exactly one of the rest is the filled button.

  NOTHING HAPPENS ON ARRIVAL. A passkey sheet nobody asked for is alarming, and a link in the address
  is spent by a press rather than on load, so a mail scanner that opens it spends nothing.

  ON A PHONE THE WAYS IN SIT AT THE FOOT OF THE SCREEN, where a thumb already is, and the brand and
  the slogan keep the top.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';

  import {
    exchangeKey,
    methods,
    passkeyRegister,
    passkeySignIn,
    redeemLink,
    requestLink,
    signOut,
    support,
    takeLink,
    type Link,
    type Methods,
    type Said,
    type Who,
  } from '$lib/auth.ts';
  import { at, BASE } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { onwardOf, stateOf, type How, type Shelf, type Step, type Ways } from '$lib/signin.ts';
  import { actable, firstDoor, noDoorYet } from './first-door.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';

  const here = support();

  let asked = $state<Said<Methods> | null>(null);
  let entered = $state<{ who: Who; via: 'passkey' | 'key' | 'link' } | null>(null);
  let link = $state<Link | null>(null);
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
  /**
   * WHETHER THE SERVER-KEY BLOCK IS OPEN IS THE READER'S, ONCE IT IS DRAWN. The first run opens it, and
   * nothing a press does closes it again: bound to the derived state, a wrong key shut the block the
   * key had just been typed into.
   */
  let keyOpen = $state(false);
  let emailField = $state<HTMLInputElement | undefined>(undefined);

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

  /** Whether a way in other than a passkey is drawn, so a sentence never points at one that is not there. */
  const otherWays = (ways: Ways | null): boolean => ways !== null && (ways.magic || ways.key);
  /** How many ways in are drawn: after one is refused, "another" is only true when there is more than one. */
  const wayCount = (ways: Ways | null): number => (ways ? [ways.passkey, ways.magic, ways.key].filter(Boolean).length : 0);

  /* `noDoor` TAKES THE NOTE AWAY, and that is the repair. `stateOf` says `unsupported` whenever no
     way can act, and on the first run it said so about a browser that was working perfectly. The
     only note it can swallow is that one: `noDoorYet` refuses `out`, so the confirmation somebody
     gets for pressing Sign out still arrives on a record that holds no passkey. */
  const note = $derived(
    view.name !== 'signed-out' || noDoor
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
    link = takeLink(location.hash, clearHash);
    void load();
    window.addEventListener('hashchange', arrived);
    return () => window.removeEventListener('hashchange', arrived);
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
   * so nothing mounts again: walked on 23 September, a claim link pasted over `/app/signin` changed the address, left
   * "Sign in to open your record." on screen, made no request, and stayed so until a reload. The owner will very likely
   * have this page open when he pastes it, from the site's own "Sign in". A press that is out keeps its moment; anything
   * else on screen gives way to the landing, which needs the step idle to be drawn.
   *
   * WHERE SOMEBODY IS ALREADY IN, THE LINK IS KEPT AND SAID, NOT LANDED. `stateOf` answers `signed-in` before it looks
   * at a link, and measured by the audit's probe that drew "You are signed in" with the address emptied and nothing to
   * say a link had come (`loop/research-batch-forty-six-audit.md` §9). The signed-in state carries the link now, the
   * screen says so in one line, and Sign out lands on it.
   */
  function arrived() {
    const l = takeLink(location.hash, clearHash);
    if (!l) return;
    link = l;
    if (step.at !== 'asking') step = { at: 'idle' };
  }

  /** One press: the step says it is out, and what came back decides the next one. */
  async function run<T>(how: How, work: () => Promise<Said<T>>, then: (value: T) => void) {
    if (step.at === 'asking') return;
    step = { at: 'asking', how };
    const at = opened();
    const out = await work();
    closed(true, at);
    now = Date.now();
    if (out.ok) then(out.value);
    else step = { at: 'failed', how, failure: out, when: now };
  }

  /**
   * SIGNING IN DROPS THE BOOT THIS TAB KEPT. The screen's own load asked `boot` at the bare `/app` with no session, was
   * refused, and kept the sample for the tab; signing in is a `fetch` that sets a cookie and nothing more. Walked on
   * 23 September (`loop/research-first-sign-in.md` friction 1), "Open BrainDog" then drew The Studio with no request,
   * after the claim link and again after the passkey. The onward buttons are full page loads, which is the repair.
   * That refusal is not kept any more, since the sample went (DIRECTION 26); this stays for a tab that came here from
   * a record it had read, so a move out that is not a full load asks the record again rather than drawing the old one.
   */
  const enter = (via: 'passkey' | 'key' | 'link') => (who: Who) => {
    forget();
    entered = { who, via };
    link = null;
    step = { at: 'idle' };
  };

  const withPasskey = () => void run('passkey', () => passkeySignIn(), enter('passkey'));

  function withKey(e: SubmitEvent) {
    e.preventDefault();
    const typed = key;
    key = '';
    void run('key', () => exchangeKey(typed), enter('key'));
  }

  function send(e: SubmitEvent) {
    e.preventDefault();
    const to = email.trim();
    void run('send', () => requestLink(to, goTo === `${BASE}/` ? null : goTo), () => (step = { at: 'sent', email: to }));
  }

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

<div class="door">
  <div class="col">
    <header class="brand">
      <Mark height={36} />
      <span class="wordmark">{copy.product}</span>
    </header>

    <div class="intro">
      <!-- The slogan, the same five words the README and the marketing site lead with. -->
      <h1 class="slogan">{copy.tagline}</h1>
      {#if doors}<p class="lede">{copy.signInLede}</p>{/if}
    </div>

    <div class="act">
      {#if view.name === 'loading'}
        <p class="status" role="status">{copy.checkingWays}</p>
      {:else if view.name === 'unreachable'}
        <div class="said">
          <Empty kind="error" title={copy.unreachableTitle} body={retried ? copy.unreachableStill(retried) : copy.unreachableWhy}>
            {#snippet actions()}<Button onclick={again}>{copy.askAgain}</Button>{/snippet}
          </Empty>
        </div>
      {:else if view.name === 'no-host'}
        <div class="calm">
          <span class="door-glyph"><Icon name="info" size="l" /></span>
          <p class="calm-title">{copy.noHostTitle}</p>
          <p class="calm-body">{copy.noHostWhy}</p>
        </div>
      {:else if view.name === 'open'}
        <div class="calm">
          <span class="door-glyph ok"><Icon name="check" size="l" /></span>
          <p class="calm-title">{copy.openTitle}</p>
          <p class="calm-body">{copy.openWhy}</p>
        </div>
        <!-- A FULL PAGE LOAD, like every way on from this screen: see "Open BrainDog" below. -->
        <div class="doors"><Button weight="primary" href={goTo} data-sveltekit-reload>{copy.openYourRecord}</Button></div>
      {:else if view.name === 'not-configured'}
        <div class="said"><Empty kind="no-permission" title={copy.notConfiguredTitle} body={copy.notConfiguredWhy} /></div>
      {:else if view.name === 'insecure'}
        <div class="said"><Empty kind="no-permission" title={copy.insecureTitle} body={copy.insecureWhy} /></div>
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
          <Empty kind="error" title={copy.linkExpiredTitle} body={copy.linkExpiredWhy(view.link, view.ways?.magic === true)} />
        </div>
      {:else if view.name === 'link-sent'}
        <div class="calm" role="status">
          <span class="door-glyph ok"><Icon name="check" size="l" /></span>
          <p class="calm-title">{copy.linkSentTitle}</p>
          <p class="calm-body">{copy.linkSentBody(view.email)}</p>
        </div>
        <div class="doors"><Button onclick={mail}>{copy.useAnotherEmail}</Button></div>
      {:else if view.name === 'link-landing'}
        <div class="calm">
          <span class="door-glyph"><Icon name="link" size="l" /></span>
          <p class="calm-title">{view.link.kind === 'claim' ? copy.claimLandingTitle : copy.linkLandingTitle}</p>
        </div>
        <div class="doors">
          <Button weight="primary" onclick={spend} aria-busy={view.asking}>
            {view.asking ? copy.signingIn : view.link.kind === 'claim' ? copy.claimRecord : copy.useLink}
          </Button>
        </div>
      {:else if view.name === 'signed-in'}
        <div class="calm">
          <span class="door-glyph ok"><Icon name="check" size="l" /></span>
          <p class="calm-title">{copy.signedInTitle}</p>
          <p class="calm-who">{view.who.email}</p>
          <p class="calm-body">{copy.signedInReads}</p>
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
          <!-- A FULL PAGE LOAD, AND THAT IS THE REPAIR. A client-side move to `/app/` kept everything this tab
               decided before the sign-in: the boot (the sample, then), the switcher's list, the voice. Walked twice, it drew
               The Studio, "Nothing you do here is saved.", with no request made; a reload drew his own record,
               because the Worker answers `/app/` with a 302 to `/app/<slug>/` once there is a session. -->
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
        <div class="said"><Empty kind="no-permission" title={firstDoor.title} body={firstDoor.why} /></div>
      {/if}

      {#if note}<p class="status" role="status">{note}</p>{/if}

      <!-- ONE BLOCK FOR EVERY STATE THAT OFFERS A WAY IN, so moving between signed out, asking and
           rejected never remounts it: an open server-key block stays open, and a typed email stays. -->
      {#if doors}
        <div class="doors">
          {#if doors.passkey}
            <Button weight={doors.lead === 'passkey' ? 'primary' : 'quiet'} onclick={withPasskey} aria-busy={asking === 'passkey'}>
              <Icon name="key" size="m" />{asking === 'passkey' ? copy.waitingForPasskey : copy.withPasskey}
            </Button>
          {/if}

          {#if doors.magic}
            {#if doors.lead === 'magic' || mailing}
              <form class="form" onsubmit={send}>
                <label class="lbl" for="in-email">{copy.emailLabel}</label>
                <span class="field field-lg">
                  <input
                    id="in-email"
                    class="field-input"
                    type="email"
                    autocomplete="email"
                    spellcheck="false"
                    autocapitalize="none"
                    required
                    placeholder={copy.emailLike}
                    bind:value={email}
                    bind:this={emailField}
                  />
                </span>
                <Button weight={doors.lead === 'magic' ? 'primary' : 'quiet'} type="submit" aria-busy={asking === 'send'}>
                  {asking === 'send' ? copy.sendingLink : copy.sendLink}
                </Button>
              </form>
            {:else}
              <Button onclick={mail}><Icon name="link" size="m" />{copy.emailLink}</Button>
            {/if}
          {/if}

          <!-- THE SELF-HOST'S DOOR, and only a self-host offers it. Open on first run, when no passkey
               exists yet and this is the only way the first person can get in. -->
          {#if doors.key}
            <details class="own" bind:open={keyOpen}>
              <summary class="own-q"><Icon name="chevronDown" size="s" />{copy.serverKeyWay}</summary>
              <form class="form" onsubmit={withKey}>
                <label class="lbl" for="in-key">{copy.serverKeyLabel}</label>
                <span class="field field-lg">
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
            </details>
          {/if}
        </div>
      {/if}

      <!-- A STRANGER'S WAY TO A RECORD OF THEIR OWN (OPS-17). Not where the server key is offered: that is a self-host,
           made by its operator, and it has no sign-up to send anybody to. -->
      {#if doors && !doors.key}
        <p class="new-here"><a class="new-link" href={at('/signup')}>{copy.signupNewHere}</a></p>
      {/if}

      <!-- NO DEMO PILL. It opened the sample business at `/app/` for anybody not signed in, and there is no
           sample now (DIRECTION 26): `/app/` with no session is this screen, so the pill led back here. -->
    </div>
  </div>
</div>

<style>
  /* `minmax(0, …)` and `safe`, for the reasons `/start` records: a centred track sized to its content
     outgrows a phone, and centred content taller than the screen loses its top above the scroll
     origin. */
  .door {
    display: grid;
    grid-template-columns: minmax(0, min(400px, 100%));
    justify-content: center;
    align-content: safe center;
    min-block-size: 100dvh;
    padding-block: var(--sp-7);
    padding-inline: var(--sp-5);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.026em;
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    text-align: center;
  }

  .slogan {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-3xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: var(--lh-3xl);
    text-wrap: balance;
  }

  .lede {
    color: var(--dim);
    font-size: var(--t-md);
    line-height: var(--lh-body);
  }

  .act {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .doors {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* EVERY WAY IN IS THE WIDTH OF THE COLUMN, and a label may wrap: at 320 the longest one is wider
     than a nowrap pill can be. 48 is above the 44 floor on any pointer. */
  .col :global(.btn) {
    inline-size: 100%;
    min-block-size: var(--sp-7);
    white-space: normal;
    text-align: center;
  }

  .new-here {
    text-align: center;
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* A 44PX TARGET ON A PHONE, as every way on from this screen is, without making a line of text look like a button. */
  .new-link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--link);
  }

  .status {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    text-align: center;
  }

  .small {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    text-align: center;
  }

  /* A state that is not a problem: a glyph, a sentence and what it means, centred under the slogan. */
  .calm {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    text-align: center;
  }

  /* NOT `.glyph`, WHICH `blocks.css` DRAWS AS AN INTENT DOT. Under that name this set `display` and `color` and
     inherited the rest: measured on 23 September, a 6 by 6 grey box around a 20-pixel icon, over "Your record is
     ready to claim." and "You are signed in" (`loop/research-first-sign-in.md` friction 7). */
  .door-glyph {
    display: flex;
    margin-block-end: var(--sp-1);
    color: var(--dim);
  }

  .door-glyph.ok {
    color: var(--earn);
  }

  .calm-title {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  .calm-who {
    color: var(--ink2);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .calm-body {
    max-inline-size: 42ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  /* `Empty` is the house's refusal and it is left-aligned everywhere else. Here everything above and
     below it is centred, so it is too. */
  .said :global(.empty) {
    align-items: center;
    margin-inline: auto;
    padding-block: 0;
    text-align: center;
  }

  .said :global(.empty-actions) {
    align-self: stretch;
  }

  /* Short centred sentences, where a last word on its own line is the first thing the eye lands on. */
  .said :global(.empty-body),
  .calm-body,
  .small {
    text-wrap: pretty;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .lbl {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .hint {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* The key is 43 characters of base64url checked glyph for glyph, which is what `--font-id` is for. */
  .field-lg .field-input#in-key {
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .peek {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .peek:hover {
    color: var(--ink);
  }

  .own-q {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
  }

  .own-q::-webkit-details-marker {
    display: none;
  }

  .own-q:hover {
    color: var(--ink);
  }

  .own-q :global(svg) {
    transition: transform var(--d-state) var(--ease-out);
  }

  .own[open] .own-q :global(svg) {
    transform: rotate(180deg);
  }

  .own .form {
    margin-block-start: var(--sp-3);
  }

  /* ON A PHONE THE COLUMN FILLS THE SCREEN: the brand keeps the top, everything to press sits at the
     foot where the thumb is, and the slogan floats in the space between rather than leaving a hole
     under itself. `stretch` lets the one grid row take the full height. */
  @media (width < 640px) {
    .door {
      align-content: stretch;
      padding-block: var(--sp-6) var(--sp-5);
    }

    .intro {
      margin-block: auto;
    }
  }
</style>
