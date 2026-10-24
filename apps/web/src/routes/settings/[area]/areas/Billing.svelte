<!--
  Settings > Billing: this month's plan and usage as a tile of meters, then what each record you own costs on the Cloud
  and where its bill stands, or on a self-host the one line that says there is nothing to bill; then where usage and
  the export are. A free record says Free and offers the first paid plan once, quietly.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { apiBase } from '$lib/at.ts';
  import { openOutside } from '$lib/shell.ts';
  import { readUsage, words as actionWords, type Meter, type UsageView } from '$lib/record/actions.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import {
    backFromCheckout, billingLine, hostedHere, managedAtStripe, meterBars, monthDay, packPage, packsOf, paymentPage, planLine, planShown,
    readBilling, shareOf, stateLine, thisRecord, tileWords, upgradeOf, words as billWords, type BilledRecord,
  } from '../../billing.ts';
  import { untrack } from 'svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import { homeCurrency } from '$lib/record/api.ts';

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
   * THIS MONTH AGAINST THE ALLOWANCE, which only `/usage` asked for until this tile.
   *
   * THE SAME READ AS `/usage`, and asked only on the Cloud for the reason the bill is: a self-host keeps no ledger, and
   * its record's events carry no allowance to draw a meter against. A host without the route answers `none`, which is
   * no tile rather than a refusal; a refusal is no tile too, because the bill below already says what the host said.
   */
  async function usageOf(): Promise<Result<UsageView | null>> {
    const out = await readUsage((url, init) => fetch(url, init), Date.now(), '', apiBase(page.url), undefined, homeCurrency());
    if (out.ok === true) return { ok: true, value: out.view };
    if (out.ok === 'none') return { ok: true, value: null };
    return { ok: false, refusal: out.refusal };
  }
  const usage = read(() => (hosted ? `usage ${apiBase(page.url)}` : null), usageOf);

  /**
   * THIS RECORD'S MONTH, AND NO OTHER'S. The ledger holds every record the person owns, each named by its address, so
   * the tile draws the one whose address is this record's. A colleague's ledger holds none of this record's, and a
   * member is shown no meters: the allowance is the owner's to see (`actions.ts`, `notOwner`).
   */
  const allowed = $derived(usage.value?.from === 'ledger' ? (usage.value.records.find((r) => r.name === shell.index.slug) ?? null) : null);
  const meters = $derived<Meter[]>(allowed?.meters ?? []);
  const billed = $derived(bill.value ? thisRecord(bill.value, shell.index.slug) : null);
  const month = $derived(monthDay(shell.now));
  /* THE ONE THE MONTH TURNS ON, whose own sentence joins the reading line once it is near its limit. */
  const nearest = $derived(meters.find((m) => m.binding) ?? null);
  const figure = $derived(
    billed && (billed.state !== 'unbilled' || billed.plan === 'free' || billed.gift) ? planLine(billed) : (allowed?.plan ?? null),
  );
  const needs = $derived(nearest && nearest.share >= 0.8 ? nearest.said : null);
  const reading = $derived(
    [allowed?.binding ? actionWords.binding(allowed.binding) : `${actionWords.noUsage}.`, allowed?.slash ?? null, allowed?.extra ?? null]
      .filter((x): x is string => x !== null)
      .join(' '),
  );

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

  /* `plan` IS A FREE RECORD'S UPGRADE: checkout for the record on that plan. Paying again names none. */
  async function goPay(kind: 'portal' | 'checkout', r: BilledRecord, plan?: string) {
    if (going !== null) return;
    going = r.record;
    const out = await paymentPage(kind, r.record, undefined, plan);
    if (out.ok) {
      /* LEAVING FOR STRIPE, and `going` stays set, so the button keeps saying so until the page is gone. The shell
         opens it in the browser in the Mac app. */
      openOutside(out.value, { here: true });
      return;
    }
    going = null;
    toasts.push(out.refusal.fix, { intent: 'warn' });
  }

  /* A PACK OF SLASH CREDITS, bought on Stripe's page under the same one-page guard. `going` holds the record and the
     pack, so only the pressed button says it is opening. Nothing is bought until the person pays there. */
  async function goBuy(r: BilledRecord, pack: string) {
    if (going !== null) return;
    going = `${r.record} ${pack}`;
    const out = await packPage(r.record, pack);
    if (out.ok) {
      openOutside(out.value, { here: true });
      return;
    }
    going = null;
    toasts.push(out.refusal.fix, { intent: 'warn' });
  }

  /* BACK FROM STRIPE'S PAGE, the credits may land a moment after the person does: the webhook adds them, not the
     redirect. So billing is read again twice, a little apart, and the address loses its mark so a reload asks nothing. */
  $effect(() => {
    if (!hosted || !backFromCheckout(location.hash)) return;
    history.replaceState(history.state, '', location.pathname + location.search);
    const timers = [2_000, 6_000].map((ms) => setTimeout(() => void bill.reread(), ms));
    return () => timers.forEach(clearTimeout);
  });
</script>

<!--
  PLAN AND USAGE, THE AREA'S LEAD TILE: the plan as the figure, one bar per meter with the nearest in
  ink, and one line saying which limit the month turns on. Drawn only where the ledger answered with this record's
  allowance: a plan with no limit has no meters, and a number tile without a chart is the one thing a tile may not be.
-->
<!-- THE TWO WAYS ON, AT THE TILE'S FOOT (UI pass of 21 October, H36): they were loose on the board under it. -->
{#snippet foot()}
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
{/snippet}

{#if meters.length > 0 && allowed}
  <Tile icon="money" title={tileWords.planTitle} meta={tileWords.monthMeta(month.day, month.of, allowed.resets)} lead>
    {#if figure}<p class="figure num">{figure}</p>{/if}
    <Bars items={meterBars(meters)} max={1} format={shareOf} subject={tileWords.metersSubject} />
    <p class="reading">{reading}{#if needs}{' '}<span data-needs>{needs}</span>{/if}</p>
  </Tile>
{/if}

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
  <Tile icon="money" class="section" data-surface="tile" title={copy.billingYours}>
    <div class="section-body">
      {#if bill.state === 'ready' && bill.value}
        <!-- A HOST THAT SELLS PACKS AND NO PLAN is taking payments, for credits, so it is never told it is not. -->
        {#if !bill.value.open && bill.value.packs.length === 0}<p class="hint">{copy.billingNotOpen}</p>{/if}
        <!-- ROWS ON THE GROUND: a well, the record and its plan, the state under them, and the verbs at the
             end. A bill that needs him wears the red well, and says so in its sentence, so red is never the only sign. -->
        <ul class="bills">
          {#each bill.value.records as r (r.record)}
            {@const late = r.state === 'past_due' || r.state === 'lapsed'}
            {@const upgrade = upgradeOf(r, bill.value)}
            {@const credits = packsOf(r, bill.value)}
            {@const said = r.state !== 'unbilled' || r.gift ? stateLine(r, shell.now) : ''}
            <li class="bill">
              <IconWell name="money" size="l" tone={late ? 'danger' : undefined} />
              <div class="bill-main">
                <div class="bill-head">
                  <span class="bill-name" dir="auto">{nameOf(r)}</span>
                  <span class="bill-plan">{planShown(r)}</span>
                </div>
                {#if upgrade}
                  <p class="bill-state">{upgrade.line}</p>
                {:else if said}
                  <p class="bill-state" data-state={r.state}>{said}</p>
                {/if}
                {#if credits.left}<p class="bill-state num">{credits.left}</p>{/if}
                <!-- SLASH CREDIT PACKS (LCH-A10), under what the record says of its plan: one quiet rectangle a pack, each
                     with its credits and the Worker's price. None while the host sells no pack, so that answer is today's. -->
                {#if credits.buy.length > 0}
                  <div class="bill-packs" role="group" aria-labelledby="packs-{r.record}">
                    <span class="bill-state" id="packs-{r.record}">{billWords.buyCredits}</span>
                    <div class="bill-pack-buttons">
                      {#each credits.buy as b (b.pack.id)}
                        {@const mine = going === `${r.record} ${b.pack.id}`}
                        <Button onclick={() => goBuy(r, b.pack.id)} aria-label={mine ? undefined : b.said} aria-busy={mine} disabled={going !== null}
                          >{mine ? copy.billingOpening : b.label}</Button
                        >
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
              <!-- A FREE RECORD'S ONE OFFER, as a quiet button: the page's one ink button stays the person's own act. -->
              {#if upgrade}
                <div class="bill-actions">
                  <Button onclick={() => goPay('checkout', r, upgrade.plan.id)} aria-busy={going === r.record} disabled={going !== null}
                    >{going === r.record ? copy.billingOpening : copy.billingUpgrade(upgrade.plan.name)}</Button
                  >
                </div>
              {/if}
              <!-- THE ACTIONS STRIPE CAN TAKE, and only while this host is taking payments: with billing off every
                   billing door refuses, so a button here would be a press that can only fail. A record with no row
                   has no customer at Stripe, so it has nothing to manage either, and nor has a gift. -->
              {#if managedAtStripe(r, bill.value)}
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
      {@render foot()}
    </div>
  </Tile>
{:else}
  <!-- THE CARD SAYS WHAT IT HOLDS (audit 25 October, X23): it was "Billing" under a page called Billing, over a row
       saying Not billed. The state is the card's title now, and the host's sentence its one line. -->
  <Tile icon="money" class="section" data-surface="tile" title={copy.billingNotBilled}>
    <div class="section-body">
      <!-- THE HOST'S ANSWER AND NOT THE BUILD'S. The sample's `DEPLOYMENT.kind` read `self-host` in
           every shipped bundle, so a live Cloud record was told "This record runs on your own
           machine." `billing.ts` says what is asked instead. -->
      <p class="hint">{billingLine({ host: shell.host, mintsMail: mintsHere })}</p>
      {@render foot()}
    </div>
  </Tile>
{/if}



<style>
  /* THE FIGURE IN A TILE (`t-figure`): the plan, which is what the meters under it are measured against. */
  .figure {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  /* THE ONE WRITTEN LINE under the chart, in ink, with the phrase that needs him in red. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .reading [data-needs] {
    color: var(--red);
    font-weight: 500;
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .bills {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A ROW: the 32px well, then the words, then the verbs, at the height of a two-line row. */
  .bill {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .bill + .bill {
    border-block-start: 1px solid var(--rule);
  }

  .bill-main {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  /* THE NAME AND THE PLAN SHARE A LINE WHILE THEY FIT, and the plan wraps under the name when they do not, so a long
     record name on a phone pushes nothing off the edge. */
  .bill-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-3);
    row-gap: 2px;
  }

  .bill-name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
  }

  .bill-plan {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  .bill-state {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  /* PAST DUE AND LAPSED ARE THE TWO STATES THAT NEED THE PERSON, and red is the house's word for what needs him.
     The sentence says it too, so the colour is never the only sign. */
  .bill-state[data-state='past_due'],
  .bill-state[data-state='lapsed'] {
    color: var(--red);
  }

  .bill-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  /* THE PACKS, a small heading and the buttons beside one another while they fit, under the record's own lines. */
  .bill-packs {
    display: grid;
    gap: 6px;
    margin-block-start: var(--sp-2);
  }

  .bill-pack-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
  }

  /* ON A PHONE THE VERBS GO UNDER THE WORDS, at the touch height, full width, so a thumb never has to aim between two
     pills that wrapped to odd widths. */
  @media (width < 640px) {
    .bill {
      grid-template-columns: var(--well-l) minmax(0, 1fr);
      align-items: start;
      row-gap: var(--sp-2);
      min-block-size: 60px;
    }

    .bill-actions {
      grid-column: 2;
      flex-direction: column;
      align-items: stretch;
    }

    .row-actions,
    .bill-pack-buttons {
      flex-direction: column;
      align-items: stretch;
    }

    .bill-actions :global(.btn),
    .bill-pack-buttons :global(.btn),
    .row-actions :global(.btn) {
      justify-content: center;
      min-block-size: 44px;
    }
  }
</style>
