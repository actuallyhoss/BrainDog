<!--
  A record of your own, for somebody signed in and on none (`loop/finish/ops.md` OPS-17).

  THE LAST STEP OF SIGN-UP, AND THE WAY OUT OF AN EMPTY SHELL. A person whose mailbox is proved but who has not paid,
  and a person whose only record was closed, both used to land on `/start` over a `boot` that answered 403 and draw a
  record with nothing in it. Now they are asked for a name and sent to pay for it, which is how a record is made on the
  Cloud: the record comes into being when Stripe says the payment is in (`/account/billing/checkout`, then its webhook).

  WHAT IS KEPT ACROSS THE ROUND TRIP TO STRIPE is written just before the payment page opens (`hold`), so the sign-up
  page can find the record the payment made when Stripe sends the person back to it.

  `held` IS WHAT WAS TYPED EARLIER, when there was an earlier: the name asked for at the start of sign-up, the person's
  own name and their zone. On `/start` there was none, and the name field starts empty.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { copy } from '$lib/copy.ts';
  import { billing, checkout, hold, zone, type Held } from '$lib/signup.ts';
  import Button from '$lib/ui/Button.svelte';
  import NameField from '../signup/NameField.svelte';

  let {
    title,
    why = null,
    held = null,
    note = null,
  }: { title: string; why?: string | null; held?: Held | null; note?: string | null } = $props();

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
      price = out.value.price;
    });
  });

  async function pay(e: SubmitEvent) {
    e.preventDefault();
    /* ONE PRESS, ONE PAYMENT PAGE: a second press while the first is out does nothing. */
    if (busy || !free || slug === '') return;
    busy = true;
    said = null;
    const asked: Held = { slug, name: held?.name ?? null, tz: held?.tz ?? zone() };
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

  {#if open === false}
    <p class="own-why">{copy.signupClosedWhy}</p>
  {:else}
    <form class="own-form" onsubmit={pay}>
      <NameField bind:value={slug} bind:free id="own-name" />
      {#if price}<p class="own-price">{copy.signupPayWhy(price)}</p>{/if}
      {#if said}<p class="own-said" role="alert">{said}</p>{/if}
      <div class="own-go">
        <Button weight="primary" type="submit" disabled={busy || !free || open === null} aria-busy={busy}>
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

  /* THE ENTRY SCREENS' ONE TITLE (DSN-18): this stands where /start's question and sign up's title stand, in the same
     `signin/Entry.svelte` frame, so it takes their size and face rather than a smaller one of its own. */
  .own-h {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-3xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: var(--lh-3xl);
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .own-why,
  .own-price {
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
  }

  .own-note {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .own-said {
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
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
    background: var(--bg);
    padding-block: var(--sp-2);
  }

  .own-go :global(.btn) {
    inline-size: 100%;
    min-block-size: var(--tap);
  }
</style>
