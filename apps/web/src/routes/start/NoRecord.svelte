<!--
  A record of your own, for somebody signed in and on none.

  THE LAST STEP OF SIGN-UP, AND THE WAY OUT OF AN EMPTY SHELL. A person whose mailbox is proved but who has not paid,
  and a person whose only record was closed, both used to land on `/start` over a `boot` that answered 403 and draw a
  record with nothing in it. Now they are asked for a name and sent to pay for it, which is how a record is made on the
  Cloud: the record comes into being when Stripe says the payment is in (`/account/billing/checkout`, then its webhook).

  WHAT IS KEPT ACROSS THE ROUND TRIP TO STRIPE is written just before the payment page opens (`hold`), so the sign-up
  page can find the record the payment made when Stripe sends the person back to it.

  `held` IS WHAT WAS TYPED EARLIER, when there was an earlier: the name asked for at the start of sign-up, the person's
  own name and their zone. On `/start` there was none, and the name field starts empty.

  ON `/start`, SAYING WHO YOU ARE LEADS (`describe`): the ink press opens `/signup`, which builds a
  free BrainDog from the answer, and the paid name is the quieter way under it, never the lead.

  IN THE IPHONE APP THERE IS NO PAID NAME (App Store 3.1.1): no price and no payment page, only the free way where it is
  offered, and the one line saying where the plan is managed.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import { inIosApp } from '$lib/shell.ts';
  import { firstRun } from '$lib/first-run.ts';
  import { billing, checkout, hold, zone, type Held } from '$lib/signup.ts';
  import Button from '$lib/ui/Button.svelte';
  import NameField from '../signup/NameField.svelte';

  let {
    title,
    why = null,
    held = null,
    note = null,
    describe = false,
  }: { title: string; why?: string | null; held?: Held | null; note?: string | null; describe?: boolean } = $props();

  let slug = $state('');
  let free = $state(false);
  let price = $state<string | null>(null);
  let open = $state<boolean | null>(null);
  let busy = $state(false);
  let said = $state<string | null>(null);

  onMount(() => {
    /* THE FIELD STARTS AT THE NAME ASKED FOR, once: typing a new one is the person's, and a prop arriving later does
       not overwrite it. */
    slug = held?.slug ?? '';
    void billing().then((out) => {
      if (!out.ok) {
        open = true;
        return;
      }
      open = out.value.open;
      /* THE PRICE OF THE PLAN THIS PERSON CHOSE, Cloud Plus's when they came for Cloud Plus; the first sold plan's when
         they chose none. */
      price = (held?.plan ? out.value.prices[held.plan] : undefined) ?? out.value.price;
    });
  });

  async function pay(e: SubmitEvent) {
    e.preventDefault();
    /* ONE PRESS, ONE PAYMENT PAGE: a second press while the first is out does nothing. */
    if (busy || !free || slug === '') return;
    busy = true;
    said = null;
    /* THE PAID PLAN CHOSEN GOES WITH IT, or Cloud Plus would be charged as Cloud (no plan is the checkout's Cloud). */
    const asked: Held = { slug, name: held?.name ?? null, tz: held?.tz ?? zone(), ...(held?.plan && held.plan !== 'free' ? { plan: held.plan } : {}) };
    hold(globalThis.sessionStorage, asked);
    const out = await checkout(asked);
    if (out.ok) {
      /* STRIPE'S OWN PAGE, on its own origin, so this is not an address in the app and `at()` has nothing to do. The
         press stays busy: the page is leaving. */
      globalThis.location.href = out.value;
      return;
    }
    busy = false;
    said = out.kind === 'refused' ? (out.fix ?? copy.signupFailed) : out.kind === 'locked' ? copy.signupLocked(Math.ceil(out.retryAfter / 60)) : copy.unreachableWhy;
  }
</script>

<section class="own" aria-labelledby="own-h">
  <h1 class="own-h" id="own-h">{title}</h1>
  {#if why}<p class="own-why">{why}</p>{/if}
  {#if note}<p class="own-note" role="status">{note}</p>{/if}

  {#if describe}
    <div class="own-lead"><Button weight="primary" href="/signup">{firstRun.noRecordDescribe}</Button></div>
  {/if}

  {#if inIosApp}
    <p class="own-why">{copy.planManaged}</p>
  {:else if open === false}
    {#if !describe}<p class="own-why">{copy.signupClosedWhy}</p>{/if}
  {:else}
    {#if describe}<h2 class="own-paid">{firstRun.noRecordPaid}</h2>{/if}
    <form class="own-form" onsubmit={pay}>
      <NameField bind:value={slug} bind:free id="own-name" />
      {#if price}<p class="own-price">{copy.signupPayWhy(price)}</p>{/if}
      {#if said}<p class="own-said" role="alert">{said}</p>{/if}
      <div class="own-go">
        <Button weight={describe ? 'quiet' : 'primary'} type="submit" disabled={busy || !free || open === null} aria-busy={busy}>
          {busy ? copy.signupPaying : slug === '' ? copy.signupPayRecord : copy.signupPayFor(slug)}
        </Button>
      </div>
    </form>
  {/if}
</section>

<style>
  .own {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE ENTRY SCREENS' ONE TITLE: this stands where /start's question and sign up's title stand, in the same
     `signin/Entry.svelte` frame, so it takes their size and face: `t-title` in Geist, and the phone's
     large title, 30/36, below 900px. */
  .own-h {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  @media (width < 900px) {
    .own-h {
      font-family: var(--font-display);
      font-size: var(--fs-figure);
      line-height: 36px;
    }
  }

  /* THE BODY IS `t-body` AT THE SENTENCE'S 16/24 in the second ink, as the title row's sentence is. */
  .own-why,
  .own-price {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 24px;
  }

  .own-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* A REFUSED PAYMENT IS WORDS IN INK, not a red line: nothing here is late or urgent, it is a thing to try again
     (red is only for "needs you"). The `role="alert"` says it. */
  .own-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: var(--lead-meta);
  }

  .own-lead :global(.btn) {
    min-block-size: var(--tap);
  }

  /* THE PAID WAY, UNDER THE LEAD: a quiet heading over a hairline, so it reads as the other way and not the next step. */
  .own-paid {
    margin: var(--sp-4) 0 0;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: var(--lead-meta);
  }

  .own-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* THE PAY BUTTON STAYS ABOVE THE PHONE'S KEYBOARD: `--kb` is the keyboard's height, written at run time, and the
     button rides it rather than sitting under it while the name is typed. */
  .own-go {
    position: sticky;
    inset-block-end: calc(var(--kb, 0px) + var(--sp-4));
    background: var(--tile);
    padding-block: var(--sp-2);
  }

  .own-go :global(.btn) {
    inline-size: 100%;
    min-block-size: var(--tap);
  }
</style>
