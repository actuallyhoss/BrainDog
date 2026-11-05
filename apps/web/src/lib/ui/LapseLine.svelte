<!--
  The shell's one line over a record whose billing has lapsed: read-only, the day it is deleted, and the two ways out.

  THE WORKER ALREADY REFUSES EVERY WRITE ON A LAPSED RECORD WITH `LAPSED_FIX` (`apps/worker/src/lapse.ts`), and a
  person who meets that refusal on one screen should not have to find Settings > Billing to learn why every other
  screen will say the same. So the shell says it once, above whatever screen is open, in the refusal's own words.

  ASKED ONCE PER PAGE LOAD, AND ONLY ON THE CLOUD. `GET /account/billing` is the Cloud's door and a self-host answers
  404, so a host that is not the Cloud is never asked. The answer is held for the life of the page (the module script
  below), so moving between screens asks nothing again; a payment made in Stripe's page comes back as a new page load,
  which asks afresh.

  IN THE FLOW, NEVER FIXED, AND DRAWN AS THE ONE BANNER (`Banner.svelte`): the
  red tint with the red lock, "Pay again" primary and "Export" quiet. It sits where the layout mounts it and pushes the
  screen down, so it can never cover the phone's tab bar, and at 390 its buttons stack under its sentence.

  IN THE IPHONE APP NOTHING HERE PAYS (App Store 3.1.1): a lapsed record keeps its sentence and Export, with the one line
  saying where the plan is managed in place of Pay again, and a late payment, which locks nothing, is not drawn at all.
-->
<script module lang="ts">
  import { readBilling, type BillingAnswer, type Said } from '../../routes/settings/billing.ts';

  /** The one question this page load asks, shared by every mount of the banner. */
  let asked: Promise<Said<BillingAnswer>> | null = null;
</script>

<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { inStoreApp, openOutside } from '$lib/shell.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';
  import { hostedHere, lapseLines, paymentPage, thisRecord } from '../../routes/settings/billing.ts';
  import { untrack } from 'svelte';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { toasts } from './toast.svelte.ts';

  let { shell }: { shell: Shell } = $props();

  let answer = $state.raw<BillingAnswer | null>(null);

  $effect(() => {
    if (!hostedHere(shell)) return;
    untrack(() => {
      asked ??= readBilling();
      void asked.then((out) => {
        if (out.ok) answer = out.value;
      });
    });
  });

  /* THE RECORD ON SCREEN, by its address: the answer lists every record this person owns, and only the one open now
     is the banner's business. A member of somebody else's record is not listed, because billing is the owner's. */
  const here = $derived(thisRecord(answer, shell.index.slug));
  const lines = $derived(lapseLines(here, shell.now));
  /* A CARD THAT FAILED IS SAID TOO, KINDLY AND IN AMBER: nothing is locked yet, Stripe tries again, and one press opens
     the page where the card is changed. Only to the owner, who is the only one the answer lists the record for. */
  const behind = $derived(answer?.open === true && here?.state === 'past_due' && !here.gift);

  /* ONE CHECKOUT AT A TIME, for the reason Settings > Billing gives: a second press would open a second payment. */
  let going = $state(false);

  async function newCard() {
    if (going || !here) return;
    going = true;
    const out = await paymentPage('portal', here.record);
    if (out.ok) {
      openOutside(out.value, { here: true });
      return;
    }
    going = false;
    toasts.push(out.refusal.fix, { intent: 'warn' });
  }

  async function payAgain() {
    if (going || !here) return;
    going = true;
    const out = await paymentPage('checkout', here.record);
    if (out.ok) {
      /* Stripe's page opens through the shell, so the Mac app sends it to the browser. */
      openOutside(out.value, { here: true });
      return;
    }
    going = false;
    toasts.push(out.refusal.fix, { intent: 'warn' });
  }
</script>

{#if lines && here}
  <Banner tone="late" icon="lock">
    {lines.fix}{#if lines.deletes}{' '}{lines.deletes}{/if}{#if inStoreApp}{' '}{copy.planManaged}{/if}
    {#snippet actions()}
      {#if !inStoreApp}
        <Button weight="primary" onclick={payAgain} aria-busy={going} disabled={going}
          >{going ? copy.billingOpening : copy.billingPayAgain}</Button
        >
      {/if}
      <Button href="/settings/export"><Icon name="download" size="m" />{copy.export}</Button>
    {/snippet}
  </Banner>
{/if}
{#if behind && here && !lines && !inStoreApp}
  <Banner tone="warn" icon="money">
    {copy.billingPastDueLine}
    {#snippet actions()}
      <Button onclick={newCard} aria-busy={going} disabled={going}>{going ? copy.billingOpening : copy.billingUpdateCard}</Button>
      <Button weight="quiet" href="/settings/billing">{copy.billingSee}</Button>
    {/snippet}
  </Banner>
{/if}
