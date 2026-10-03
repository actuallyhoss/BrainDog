<!--
  Sign-up, for a stranger: a record of their own, free or paid for, in three or four steps.

  ONE: an email and a name for the record, the name checked as it is typed, and Cloudflare Turnstile when the host asks
  for it. TWO: "Check your mail". THREE: the link from the mail proves the address and signs the person in.

  ON FREE, WHICH IS NO `?plan=` (DIRECTION §35, "Free leads"), the record is made there and then: checkout with
  `plan: 'free'` makes it and answers its `/start`, the page opens it and goes there, with no Stripe and no wait. A
  name taken since is the host's sentence over the name to try again, and a way to pay for one instead; a person who
  already has their free record is told which, with only the way to pay.

  ON `?plan=cloud` OR `?plan=plus`, step three asks them to pay for the name on Stripe's page on that plan. FOUR: Stripe
  sends them back with `#paid=`, the page waits for the record the payment made to be listed, opens it, and lands on
  its `/start`, whose first ask is a passkey. `#cancelled` is step three again, with a sentence that nothing was charged.

  THE PLAN OUTLIVES THE MAIL in `localStorage` (`keepPlan`), because the link opens a new tab with nothing of this one.

  WHILE BILLING IS OFF THE PAGE ASKS NOTHING. `/auth/signup/name` says whether sign-up is open, because it is the one
  door a stranger can ask; closed, the page says so and points at sign-in.

  THE ANSWER TO STEP ONE IS THE SAME FOR EVERY ADDRESS: the host sends a sign-in link to an address that already has an
  account and a proof to a new one, and says which to nobody watching this page.

  THE FORM IS ONE SHEET AND THE STEPS ARE A RAIL BESIDE IT: the sheet
  holds the mark and the form with its one ink button, and "What happens next" stands to its right from 900px and under
  it on a phone, with the step this person is on marked. The rail is drawn from `step` and nothing else.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { at, BASE } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import {
    arrivalOf,
    billing,
    checkName,
    checkout,
    HELD_KEY,
    heldOf,
    hold,
    keepPlan,
    madeFor,
    openOwned,
    planKept,
    planOf,
    startSignup,
    verifySignup,
    zone,
    type Held,
    type Plan,
  } from '$lib/signup.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Entry from '../signin/Entry.svelte';
  import { words } from '../signin/words.ts';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import NoRecord from '../start/NoRecord.svelte';
  import NameField from './NameField.svelte';
  import { freeWords } from './words.ts';

  type Step =
    | 'loading'
    | 'unreachable'
    | 'closed'
    | 'ask'
    | 'sent'
    | 'verifying'
    | 'link-failed'
    | 'making'
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

  let email = $state('');
  let slug = $state('');
  let free = $state(false);
  let person = $state('');
  let busy = $state(false);
  let said = $state<string | null>(null);
  /* A FREE RECORD REFUSED FOR ITS PLAN, not its name: the person has theirs, so the name is not offered again. */
  let paidOnly = $state(false);
  let sentTo = $state('');

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
   * `size: 'flexible'` FILLS THE COLUMN, which is what keeps it inside the 16px gutter at 390 rather than a fixed 300px
   * box that pushes the page sideways at 320. The answer is single use, so every failed send resets it.
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
    if (step === 'ask' && siteKey !== null && widget !== null) loadTurnstile(siteKey, widget);
  });

  function resetHuman(): void {
    human = null;
    const t = turnstileOf();
    if (t && widgetId !== null) t.reset(widgetId);
  }

  /* ── arriving ────────────────────────────────────────────────────────────── */

  let gone = false;
  onDestroy(() => {
    gone = true;
    const t = turnstileOf();
    try {
      if (t && widgetId !== null) t.remove(widgetId);
    } catch {
      /* A widget Cloudflare already dropped has nothing to remove. */
    }
  });

  onMount(() => {
    /* THE FRAGMENT IS WIPED AS IT IS READ, so the proof never sits in the tab's history or a copied address. */
    const arrived = arrivalOf(location.hash, () => history.replaceState(history.state, '', location.pathname + location.search));
    const kept = heldOf(globalThis.sessionStorage);
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

  /** `localStorage`, or `null` where reading it throws (storage blocked). */
  function localStore(): Storage | null {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  async function ask(): Promise<void> {
    step = 'loading';
    const out = await checkName('');
    /* A HOST THAT REFUSES THE QUESTION ANSWERED IT: one with no sign-up door (a self-host has none) has not opened
       sign-up, which is the closed page and its way to sign in. Only a host nobody reached is "did not answer". */
    if (!out.ok) {
      step = out.kind === 'refused' ? 'closed' : 'unreachable';
      return;
    }
    if (!out.value.open) {
      step = 'closed';
      return;
    }
    siteKey = out.value.turnstile;
    step = 'ask';
  }

  /* ── step one: the address and the name ──────────────────────────────────── */

  const ready = $derived(email.trim() !== '' && free && !busy && (siteKey === null || human !== null));

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    /* ONE PRESS, ONE MAIL: a second press while the first is out does nothing. */
    if (!ready) return;
    busy = true;
    said = null;
    const out = await startSignup({ email, slug, name: person, tz: zone(), turnstile: human });
    busy = false;
    if (out.ok) {
      sentTo = email.trim();
      /* KEPT NOW AS WELL AS IN THE PROOF, so a proof opened in this tab still finds the name if the mail was slow. */
      hold(globalThis.sessionStorage, { slug, name: person.trim() || null, tz: zone(), plan });
      keepPlan(localStore(), plan);
      step = 'sent';
      await tick();
      document.getElementById('sent-h')?.focus();
      return;
    }
    resetHuman();
    said = out.kind === 'refused' ? (out.fix ?? copy.signupFailed) : out.kind === 'locked' ? copy.signupLocked(Math.ceil(out.retryAfter / 60)) : copy.unreachableWhy;
  }

  /* BACK TO STEP ONE. The widget's slot left the page with the step, so its widget goes too and a fresh one is drawn. */
  function again(): void {
    said = null;
    const t = turnstileOf();
    try {
      if (t && widgetId !== null) t.remove(widgetId);
    } catch {
      /* A widget Cloudflare already dropped has nothing to remove. */
    }
    widgetId = null;
    human = null;
    void ask();
  }

  /* ── step three: the proof, then the record on Free or the payment ───────── */

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
  }

  /**
   * A free record, made there and then: the host answers its `/start`, the session moves to it, and the page goes there.
   *
   * NO WAIT FOR A LIST, as `#paid` has: the record exists when the answer comes back. A refusal is the host's sentence
   * over the name, which can be changed and made again; an open that fails still goes, because the address names it.
   */
  async function makeFree(asked: Held): Promise<void> {
    step = 'making';
    busy = true;
    said = null;
    const out = await checkout({ ...asked, plan: 'free' });
    if (out.ok) {
      await openOwned(asked.slug);
      forget();
      location.assign(at(out.value));
      return;
    }
    busy = false;
    slug = asked.slug;
    paidOnly = out.kind === 'refused' && out.at === 'plan';
    said = out.kind === 'refused' ? (out.fix ?? freeWords.makeFailed) : out.kind === 'locked' ? copy.signupLocked(Math.ceil(out.retryAfter / 60)) : copy.unreachableWhy;
    step = 'make-failed';
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

  /* ── step four: the payment is in, and the record is made from it ───────── */

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
            forget();
            location.assign(at('/start', `${BASE}/${found.slug}/`));
            return;
          }
        }
      }
      await new Promise((r) => setTimeout(r, EVERY_MS));
    }
    if (!gone) step = 'slow';
  }

  /* ── the rail: where this person is in the six steps ────────────────────── */

  /** Each step's glyph, in `words.steps` order: the mail, the link, the payment, the passkey, the sentence, the Home. */
  const STEP_ICONS: readonly IconName[] = ['inbox', 'link', 'money', 'key', 'edit', 'home'];

  /* ON FREE THE THIRD STEP IS THE RECORD BEING MADE, not Stripe's page, and the reading line says no card. */
  const steps = $derived(plan === 'free' ? words.steps.map((s, i) => (i === 2 ? freeWords.step : s)) : words.steps);
  const icons = $derived(plan === 'free' ? STEP_ICONS.map((g, i) => (i === 2 ? 'plus' : g)) : STEP_ICONS);

  /**
   * THE STEP THIS SCREEN IS, counted from 0, or null where the rail is not drawn. Waiting for the host's first answer is
   * step one still, so the sheet does not jump sideways when the form arrives; a proof being checked is step two. A
   * host that is out of reach or closed has no steps to offer, and "making your record" is past the payment and not
   * yet at the passkey, so neither draws the rail.
   */
  const stepNow = $derived.by((): number | null => {
    switch (step) {
      case 'loading':
      case 'ask':
        return 0;
      case 'verifying':
      case 'sent':
      case 'link-failed':
        return 1;
      case 'making':
      case 'make-failed':
      case 'pay':
        return 2;
      default:
        return null;
    }
  });

  /* THIS SCREEN'S FIRST DRAW IS ITS STEP, whichever it is, once the host has answered or the address has said. */
  $effect(() => {
    if (step !== 'loading' && step !== 'verifying') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(copy.signupTitle)}</title></svelte:head>

{#snippet next()}
  {#if stepNow !== null}
    <Tile icon="arrow" title={words.nextTitle} meta={words.stepOf(stepNow + 1, steps.length)}>
      <ol class="steps">
        {#each steps as s, i (i)}
          <li class="step" aria-current={i === stepNow ? 'step' : undefined}>
            <IconWell name={i < stepNow ? 'check' : (icons[i] ?? 'task')} size="l" tone={i < stepNow ? 'earn' : i === stepNow ? 'ink' : undefined} />
            <span class="step-text">
              <span class="step-title" class:now={i === stepNow}>{s.title}</span>
              <span class="step-line">{s.line}</span>
            </span>
            {#if i === stepNow}
              <span class="step-state now">{words.now}</span>
            {:else if i < stepNow}
              <span class="step-state">{words.done}</span>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="reading">{plan === 'free' ? freeWords.note : words.payNote}</p>
    </Tile>
  {/if}
{/snippet}

<!-- THE ENTRY FRAME EVERY WAY IN SHARES (`signin/Entry.svelte`): the sheet with the mark at its top, and the rail. -->
<Entry aside={stepNow !== null ? next : undefined}>
  <div class="col">
    {#if step === 'loading' || step === 'verifying'}
      <h1 class="title">{copy.signupTitle}</h1>
      <p class="quiet" role="status">{step === 'verifying' ? copy.signupVerifying : copy.checkingWays}</p>
    {:else if step === 'unreachable'}
      <h1 class="title">{copy.signupTitle}</h1>
      <div class="said">
        <Empty kind="error" title={copy.unreachableTitle} body={copy.unreachableWhy}>
          {#snippet actions()}<Button onclick={again}>{copy.askAgain}</Button>{/snippet}
        </Empty>
      </div>
    {:else if step === 'closed'}
      <h1 class="title">{copy.signupClosedTitle}</h1>
      <p class="lede">{copy.signupClosedWhy}</p>
      <div class="go"><Button weight="primary" href="/signin">{copy.signIn}</Button></div>
    {:else if step === 'ask'}
      <h1 class="title">{copy.signupTitle}</h1>
      <p class="lede">{copy.signupLede}</p>
      <form class="form" onsubmit={send}>
        <div class="row">
          <label class="field-label" for="up-email">{copy.emailLabel}</label>
          <span class="field">
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

        <NameField bind:value={slug} bind:free id="up-name" />

        <div class="row">
          <label class="field-label" for="up-person">{copy.signupYourName}</label>
          <span class="field">
            <input id="up-person" class="field-input" type="text" autocomplete="name" maxlength="200" bind:value={person} />
          </span>
        </div>

        {#if siteKey !== null}
          <div class="human" role="group" aria-label={copy.signupHuman} bind:this={widget}></div>
        {/if}

        {#if said}<p class="bad" role="alert">{said}</p>{/if}

        <div class="go sticky">
          <Button weight="primary" type="submit" disabled={!ready} aria-busy={busy}>{busy ? copy.signupSending : copy.signupSend}</Button>
        </div>
      </form>
      <p class="aside"><a class="link" href={at('/signin')}>{copy.signupHaveRecord}</a></p>
    {:else if step === 'sent'}
      <h1 class="title" id="sent-h" tabindex="-1">{copy.signupCheckMail}</h1>
      <p class="lede">{copy.signupMailSent(sentTo)}</p>
      <div class="go"><Button weight="quiet" onclick={again}>{copy.signupOtherAddress}</Button></div>
    {:else if step === 'link-failed'}
      <h1 class="title">{copy.signupLinkFailed}</h1>
      <p class="lede">{copy.signupLinkFailedWhy}</p>
      <div class="go"><Button weight="primary" onclick={again}>{copy.signupStartAgain}</Button></div>
    {:else if step === 'making'}
      <h1 class="title">{freeWords.making}</h1>
      <p class="lede" role="status">{freeWords.makingWhy}</p>
    {:else if step === 'make-failed'}
      <h1 class="title">{copy.signupTitle}</h1>
      {#if said}<p class="lede" role="alert">{said}</p>{/if}
      {#if paidOnly}
        <div class="go"><Button weight="primary" onclick={payInstead}>{freeWords.payInstead}</Button></div>
      {:else}
        <form class="form" onsubmit={makeAgain}>
          <NameField bind:value={slug} bind:free id="make-name" />
          <div class="go sticky">
            <Button weight="primary" type="submit" disabled={busy || !free || slug === ''} aria-busy={busy}>
              {busy ? freeWords.makingNow : slug === '' ? freeWords.makeRecord : freeWords.makeFor(slug)}
            </Button>
          </div>
        </form>
        <p class="aside"><button class="link plain" type="button" onclick={payInstead}>{freeWords.payInstead}</button></p>
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
</Entry>

<style>
  /* THE COLUMN INSIDE THE SHEET. The frame, the sheet, the brand and the rail are `signin/Entry.svelte`'s;
     `min-inline-size: 0` so a long address cannot widen the column past the screen and take the page sideways. A title
     and its line sit 8 apart, and what follows them a step further down. */
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .col > :is(.form, .go, .said, .aside) {
    margin-block-start: var(--sp-4);
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
    /* focus-ok: `tabindex="-1"` moves focus here for a screen reader after mail sends; it is never in the tab order and has no interactive affordance a sighted keyboard user needs a ring to find. */
    outline: none;
  }

  .lede {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .quiet {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* A label above its field (`.field-label` puts 6 under it), as every field in the product has. */
  .row {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  .bad {
    margin: 0;
    color: var(--danger-text);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  /* THE ONE INK BUTTON, the column's width, as tall as the fields above it: 40 under a mouse, 44 under a thumb. */
  .go :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
    white-space: normal;
  }

  /* THE SEND BUTTON STAYS ABOVE THE PHONE'S KEYBOARD: `--kb` is the keyboard's height, written at run time, and the
     button rides it rather than sitting under it while the address is typed. The sheet's own fill behind it, so the
     fields it passes over do not show through. */
  .sticky {
    position: sticky;
    inset-block-end: calc(var(--kb, 0px) + var(--sp-4));
    background: var(--bg);
    padding-block: var(--sp-2);
  }

  /* THE FOOT OF THE SHEET: a hairline, then the way back to sign in (the board's "Already have a record?"). */
  .aside {
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--link);
    font-weight: 500;
  }

  /* THE WAY TO PAY INSTEAD IS A BUTTON DRAWN AS THE LINK BESIDE IT: it changes the step, it goes nowhere. */
  .link.plain {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  /* A FOCUSED FIELD SCROLLS CLEAR OF THE KEYBOARD, with room under it for the Send button riding `--kb` below. */
  .row .field-input {
    scroll-margin-block: var(--sp-6) calc(var(--tap) + var(--sp-7));
  }

  /* ── The rail: what happens next ───────────────────────────────────────── */

  /* SIX ROWS, NO BOX ROUND ANY OF THEM: each a 32px well, the step's title and its one line, and at the end where
     this person stands. A hairline between rows, as a list inside a tile has. A pure list, so no chart. */
  .steps {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .step + .step {
    border-block-start: 1px solid var(--line);
  }

  .step-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }

  .step-title {
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
  }

  .step-title.now {
    font-weight: 600;
  }

  .step-line {
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
    text-wrap: pretty;
  }

  .step-state {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .step-state.now {
    color: var(--ink);
    font-weight: 500;
  }

  /* THE TILE'S ONE WRITTEN LINE: when money moves, which is what a stranger wants to know before typing anything. */
  .reading {
    margin: 0;
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
    text-wrap: pretty;
  }

  /* UNDER A THUMB EVERY FIELD READS AT 16, the phone's body size, which is also the size below which a
     phone's browser zooms the page in on focus. */
  @media (pointer: coarse) {
    .row .field-input {
      font-size: var(--t-md);
    }
  }

  @media (width < 900px) {
    .title {
      font-size: var(--t-figure);
      line-height: 36px;
    }

    .step {
      min-block-size: 60px;
    }
  }
</style>
