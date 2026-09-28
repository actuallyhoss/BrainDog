<!--
  Sign-up, for a stranger (`loop/finish/ops.md` OPS-17): a record of their own, paid for, in four steps.

  ONE: an email and a name for the record, the name checked as it is typed, and Cloudflare Turnstile when the host asks
  for it. TWO: "Check your mail". THREE: the link from the mail proves the address, signs the person in, and asks them
  to pay for the name on Stripe's page. FOUR: Stripe sends them back with `#paid=`, the page waits for the record the
  payment made to be listed, opens it, and lands on its `/start`, whose first ask is a passkey. `#cancelled` is step
  three again, with a sentence that nothing was charged.

  WHILE BILLING IS OFF THE PAGE ASKS NOTHING. `/auth/signup/name` says whether sign-up is open, because it is the one
  door a stranger can ask; closed, the page says so and points at sign-in.

  THE ANSWER TO STEP ONE IS THE SAME FOR EVERY ADDRESS: the host sends a sign-in link to an address that already has an
  account and a proof to a new one, and says which to nobody watching this page.
-->
<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { at, BASE } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import {
    arrivalOf,
    billing,
    checkName,
    HELD_KEY,
    heldOf,
    hold,
    madeFor,
    openOwned,
    startSignup,
    verifySignup,
    zone,
    type Held,
  } from '$lib/signup.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Entry from '../signin/Entry.svelte';
  import { drew } from '$lib/ui/screen.svelte.ts';
  import NoRecord from '../start/NoRecord.svelte';
  import NameField from './NameField.svelte';

  type Step = 'loading' | 'unreachable' | 'closed' | 'ask' | 'sent' | 'verifying' | 'link-failed' | 'pay' | 'waiting' | 'slow';

  let step = $state<Step>('loading');
  /* WHAT THIS TAB KEPT ACROSS THE ROUND TRIP TO STRIPE, or what the mailed proof said was typed at the start. */
  let held = $state<Held | null>(null);
  let cancelled = $state(false);

  let email = $state('');
  let slug = $state('');
  let free = $state(false);
  let person = $state('');
  let busy = $state(false);
  let said = $state<string | null>(null);
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
    if (arrived?.kind === 'verify') void verify(arrived.token);
    else if (arrived?.kind === 'paid') void waitForRecord(kept);
    else if (arrived?.kind === 'cancelled') {
      held = kept;
      cancelled = true;
      step = 'pay';
    } else void ask();
  });

  async function ask(): Promise<void> {
    step = 'loading';
    const out = await checkName('');
    if (!out.ok) {
      step = 'unreachable';
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
      hold(globalThis.sessionStorage, { slug, name: person.trim() || null, tz: zone() });
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

  /* ── step three: the proof, then the payment ─────────────────────────────── */

  async function verify(token: string): Promise<void> {
    step = 'verifying';
    const out = await verifySignup(token);
    if (!out.ok) {
      step = 'link-failed';
      return;
    }
    held = { slug: out.value.slug, name: out.value.name, tz: out.value.tz };
    hold(globalThis.sessionStorage, held);
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
            try {
              globalThis.sessionStorage?.removeItem(HELD_KEY);
            } catch {
              /* Storage off: nothing was kept, so nothing is left behind. */
            }
            location.assign(at('/start', `${BASE}/${found.slug}/`));
            return;
          }
        }
      }
      await new Promise((r) => setTimeout(r, EVERY_MS));
    }
    if (!gone) step = 'slow';
  }

  /* THIS SCREEN'S FIRST DRAW IS ITS STEP, whichever it is, once the host has answered or the address has said. */
  $effect(() => {
    if (step !== 'loading' && step !== 'verifying') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(copy.signupTitle)}</title></svelte:head>

<!-- THE ENTRY LAYOUT EVERY WAY IN SHARES (`signin/Entry.svelte`): the brand at the top left, then this column. -->
<Entry>
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
          <label class="lbl" for="up-email">{copy.emailLabel}</label>
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

        <NameField bind:value={slug} bind:free id="up-name" />

        <div class="row">
          <label class="lbl" for="up-person">{copy.signupYourName}</label>
          <span class="field field-lg">
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
  /* ONE COLUMN AT EVERY WIDTH. The frame, its gutter and the brand are `Entry.svelte`'s; `min-inline-size: 0` so a
     long address cannot widen the column past the screen and take the page sideways. */
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* THE ENTRY SCREENS' ONE TITLE: `--t-3xl` in the display face, as sign in's slogan and /start's question are
     (design §4), so moving from one of these screens to the next does not change the size of what it asks. */
  .title {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-3xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: var(--lh-3xl);
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .title:focus {
    /* focus-ok: `tabindex="-1"` moves focus here for a screen reader after mail sends; it is never in the tab order and has no interactive affordance a sighted keyboard user needs a ring to find. */
    outline: none;
  }

  .lede {
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .quiet {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .lbl {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  .bad {
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .go :global(.btn) {
    inline-size: 100%;
    min-block-size: var(--tap);
  }

  /* THE SEND BUTTON STAYS ABOVE THE PHONE'S KEYBOARD: `--kb` is the keyboard's height, written at run time, and the
     button rides it rather than sitting under it while the address is typed. */
  .sticky {
    position: sticky;
    inset-block-end: calc(var(--kb, 0px) + var(--sp-4));
    background: var(--bg);
    padding-block: var(--sp-2);
  }

  .aside {
    font-size: var(--t-sm);
  }

  .link {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--link);
  }

  /* A FOCUSED FIELD SCROLLS CLEAR OF THE KEYBOARD, with room under it for the Send button riding `--kb` below. */
  .row .field-input {
    scroll-margin-block: var(--sp-6) calc(var(--tap) + var(--sp-7));
  }
</style>
