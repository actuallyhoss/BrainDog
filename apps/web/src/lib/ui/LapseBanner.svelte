<!--
  The shell's one line over a record whose billing has lapsed: read-only, the day it is deleted, and the two ways out.

  THE WORKER ALREADY REFUSES EVERY WRITE ON A LAPSED RECORD WITH `LAPSED_FIX` (`apps/worker/src/lapse.ts`), and a
  person who meets that refusal on one screen should not have to find Settings > Billing to learn why every other
  screen will say the same. So the shell says it once, above whatever screen is open, in the refusal's own words.

  ASKED ONCE PER PAGE LOAD, AND ONLY ON THE CLOUD. `GET /account/billing` is the Cloud's door and a self-host answers
  404, so a host that is not the Cloud is never asked. The answer is held for the life of the page (the module script
  below), so moving between screens asks nothing again; a payment made in Stripe's page comes back as a new page load,
  which asks afresh.

  IN THE FLOW, NEVER FIXED. It sits where the layout mounts it and pushes the screen down, so it can never cover the
  phone's tab bar, and at 390 its sentence wraps to two lines and its buttons stack under it.
-->
<script module lang="ts">
  import { readBilling, type BillingAnswer, type Said } from '../../routes/settings/billing.ts';

  /** The one question this page load asks, shared by every mount of the banner. */
  let asked: Promise<Said<BillingAnswer>> | null = null;
</script>

<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { at } from '$lib/at.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';
  import { hostedHere, lapseLines, paymentPage, thisRecord } from '../../routes/settings/billing.ts';
  import { untrack } from 'svelte';
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

  /* ONE CHECKOUT AT A TIME, for the reason Settings > Billing gives: a second press would open a second payment. */
  let going = $state(false);

  async function payAgain() {
    if (going || !here) return;
    going = true;
    const out = await paymentPage('checkout', here.record);
    if (out.ok) {
      /* Stripe's own host, so `at()` hands it back unchanged; the argument still starts with `at(`. */
      location.assign(at(out.value));
      return;
    }
    going = false;
    toasts.push(out.refusal.fix, { intent: 'warn' });
  }
</script>

{#if lines && here}
  <div class="lapse" role="status">
    <p class="lapse-text">
      <span class="lapse-glyph"><Icon name="lock" size="s" /></span>
      <span>{lines.fix}{#if lines.deletes}{' '}{lines.deletes}{/if}</span>
    </p>
    <div class="lapse-actions">
      <Button weight="primary" onclick={payAgain} aria-busy={going} disabled={going}
        >{going ? copy.billingOpening : copy.billingPayAgain}</Button
      >
      <Button href="/settings/export"><Icon name="download" size="s" />{copy.export}</Button>
    </div>
  </div>
{/if}

<style>
  /* A TILE ON THE GROUND, over whatever screen is open: opaque, radius 22, level 1, inside the work's own
     gutter. Red is the glyph and nothing else, because this is the one line on the screen that needs him. */
  .lapse {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
    margin: var(--inset) var(--gutter) 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5);
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
  }

  .lapse-text {
    display: flex;
    flex: 1 1 30ch;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .lapse-glyph {
    flex: none;
    color: var(--danger-text);
  }

  .lapse-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* ON A PHONE THE TWO BUTTONS ARE FULL-WIDTH ROWS UNDER THE SENTENCE, at the touch height, so neither is a narrow
     pill squeezed beside wrapped text. */
  @media (width < 640px) {
    .lapse-actions {
      flex: 1 1 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .lapse-actions :global(.btn) {
      justify-content: center;
      min-block-size: 44px;
    }
  }
</style>
