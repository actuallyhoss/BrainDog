<!--
  Settings > Billing: what each record you own costs on the Cloud and where its bill stands, or on a self-host the
  one line that says there is nothing to bill; then where usage and the export are.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { at } from '$lib/at.ts';
  import { words as actionWords } from '$lib/record/actions.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { billingLine, hostedHere, paymentPage, planLine, readBilling, stateLine, type BilledRecord } from '../../billing.ts';
  import { untrack } from 'svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  let { shell }: AreaProps = $props();

  /* WHETHER THIS HOST HAS THE MAIL DOOR IS SHARED with Ingest, and the owner question with every area
     that has an owner's control (`settings-state.svelte.ts`). The names below are the ones this markup reads. */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const mintsHere = $derived(s.mintsHere);

  /* THE CLOUD IS THE ONLY HOST THAT BILLS, and the only one with `/account/billing`: a self-host answers 404, which
     `read()` would draw as a refusal on a screen that has nothing wrong with it. So the question is asked only where
     `boot` said the host is the Cloud, and everywhere else the key is `null` and nothing is asked. */
  const hosted = $derived(hostedHere(shell));
  const bill = read(() => (hosted ? 'account-billing' : null), readBilling, { empty: (v) => v.records.length === 0 });

  /**
   * AND BILLING ASKS THE MAIL DOOR, because it is the one answer only a self-host gives.
   *
   * `billing.ts` says why: a host older than `boot`'s `host` names none, and a live Cloud record was
   * told it ran on the reader's own machine. Only a live record is asked, because a shell with no
   * record has no door to ask. `untrack` for the reason the Ingest area's effect gives, and asked here
   * as well as there, because a self-host whose owner opened Billing first would otherwise keep `null`
   * and be given the Cloud's sentence for as long as the screen was open.
   */
  $effect(() => {
    if (!shell.live) return;
    untrack(() => {
      if (s.mintsHere === null) void s.askMailDoor();
    });
  });

  /** The record's own name, from the switcher's rows, which hold every record this person can open. */
  function nameOf(r: BilledRecord): string {
    if (r.slug === shell.index.slug) return shell.index.name;
    return shell.me.records.find((x) => x.slug === r.slug)?.name ?? r.slug ?? shell.index.name;
  }

  /* ONE PAYMENT PAGE AT A TIME. A second press while Stripe is being asked would open a second checkout, and the
     Worker counts five an hour a person, so the guard spares the person one of them as well as the double page. */
  let going = $state<string | null>(null);

  async function goPay(kind: 'portal' | 'checkout', r: BilledRecord) {
    if (going !== null) return;
    going = r.record;
    const out = await paymentPage(kind, r.record);
    if (out.ok) {
      /* LEAVING FOR STRIPE, and `going` stays set, so the button keeps saying so until the page is gone. Stripe's
         own host, so `at()` hands it back unchanged; the argument still starts with `at(` (rules.md §7). */
      location.assign(at(out.value));
      return;
    }
    going = null;
    toasts.push(out.refusal.fix, { intent: 'warn' });
  }
</script>

<!--
  THERE IS NOTHING TO BILL ON A SELF-HOST, and `23 §8`'s precedent for exactly this shape is
  "one line in Settings". `53 §5.10` puts the whole ladder "in the Worker and nothing in the
  record, so the record package stays billing-agnostic"; `33 §10` holds the state in the Cloud
  Directory, which `GET /account/billing` reads. So the Cloud draws each record the person owns
  with its plan and its state, and every other host says which deployment this is in one line.

  `ADR-059`'s line is here because it is the promise the whole product rests on and it is TRUE
  on both hosts: "At no point is export withheld." A lapsed record says so in its own sentence.
-->
{#if hosted}
  <Section title={copy.billingYours}>
    {#if bill.state === 'ready' && bill.value}
      {#if !bill.value.open}<p class="hint">{copy.billingNotOpen}</p>{/if}
      <ul class="bills">
        {#each bill.value.records as r (r.record)}
          <li class="bill">
            <div class="bill-head">
              <span class="bill-name" dir="auto">{nameOf(r)}</span>
              <span class="bill-plan">{r.state === 'unbilled' ? copy.billingNotBilled : planLine(r)}</span>
            </div>
            {#if r.state !== 'unbilled'}
              <p class="bill-state" data-state={r.state}>{stateLine(r, shell.now)}</p>
            {/if}
            <!-- THE ACTIONS STRIPE CAN TAKE, and only while this host is taking payments: with billing off every
                 billing door refuses, so a button here would be a press that can only fail. A record with no row
                 has no customer at Stripe, so it has nothing to manage either. -->
            {#if bill.value.open && r.state !== 'unbilled'}
              <div class="bill-actions">
                {#if r.state === 'lapsed'}
                  <Button weight="primary" onclick={() => goPay('checkout', r)} aria-busy={going === r.record} disabled={going !== null}
                    >{going === r.record ? copy.billingOpening : copy.billingPayAgain}</Button
                  >
                {/if}
                <Button onclick={() => goPay('portal', r)} aria-busy={going === r.record} disabled={going !== null}
                  >{copy.billingManage}</Button
                >
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {:else if bill.state === 'empty'}
      <Empty kind="no-data-yet" compact title={copy.billingNoneOwned} />
    {:else if bill.state !== 'ready'}
      <ReadState state={bill.state} refusal={bill.refusal} onretry={() => void bill.reread()} />
    {/if}
  </Section>
{:else}
  <Section title={copy.billing}>
    <!-- THE HOST'S ANSWER AND NOT THE BUILD'S. The sample's `DEPLOYMENT.kind` read `self-host` in
         every shipped bundle, so a live Cloud record was told "This record runs on your own
         machine." (`research-first-sign-in.md` friction 5). `billing.ts` says what is asked instead. -->
    <!-- AS A ROW, NOT A PARAGRAPH (DSN-18): the state in its title, the host's sentence as its line. -->
    <StateRow icon="money" title={copy.billingNotBilled} line={billingLine({ host: shell.host, mintsMail: mintsHere })} />
  </Section>
{/if}

<div class="row-actions">
  <Button weight="quiet" href="/usage"><Icon name="history" size="s" />{actionWords.seeUsage}</Button>
  <!-- AND THE SECOND LINK IS THE OWNER'S, because the screen it leads to is. `export` needs
       `owner`, so offering a colleague *Export the record* here is an invitation to a screen
       where all four buttons refuse. Usage is the account's rather than the record's and
       stays.

       NOTHING IS SAID IN ITS PLACE HERE, AND THAT IS THE ONE EXCEPTION ON THIS SCREEN. The
       act lives on `/settings/export`, which is still in the rail and now says in its own
       words who may do it: a second copy of that sentence under a row holding an unrelated
       link would be a sentence with no clear subject. -->
  {#if anOwner}
    <Button weight="quiet" href="/settings/export"><Icon name="download" size="s" />{copy.export}</Button>
  {/if}
</div>

<style>
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .bills {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bill {
    display: grid;
    gap: var(--sp-1);
    padding-block: var(--sp-3);
    border-block-end: 1px solid var(--line-soft);
  }

  /* THE NAME AND THE PLAN SHARE A LINE WHILE THEY FIT, and the plan wraps under the name when they do not, so a long
     record name on a phone pushes nothing off the edge. */
  .bill-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-3);
    row-gap: var(--sp-1);
  }

  .bill-name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
  }

  .bill-plan {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .bill-state {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* PAST DUE AND LAPSED ARE THE TWO STATES THAT NEED THE PERSON, and red is the house's word for past due (design
     brief §10). The sentence says it too, so the colour is never the only sign. */
  .bill-state[data-state='past_due'],
  .bill-state[data-state='lapsed'] {
    color: var(--danger);
  }

  .bill-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* ON A PHONE EVERY BUTTON IS A FULL-WIDTH ROW AT THE TOUCH HEIGHT, stacked, so a thumb never has to aim between two
     pills that wrapped to odd widths. */
  @media (width < 640px) {
    .bill-actions,
    .row-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .bill-actions :global(.btn),
    .row-actions :global(.btn) {
      justify-content: center;
      min-block-size: 44px;
    }
  }
</style>
