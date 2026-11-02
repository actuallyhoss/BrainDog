<!--
  Money's first-open setup: the home currency, a first account, and the Money add-ons to switch on, in the board's
  place on Money's home until it is done or skipped (`SetupGate.svelte`, `setup.ts`).

  A STEP IS LEFT OUT WHEN THE RECORD ALREADY HAS IT: a record with a currency starts on the account, one with an account
  goes from the currency to the add-ons.

  NOTHING IS WRITTEN UNTIL FINISH. The last press keeps the currency, adds the account and puts each add-on in through
  the store's own plan (`setup-live.ts`); one whose plan asks for something is named with a link to its own page, and
  Keep rates current links to where it asks for the address. Finish or Skip, it is kept as done, and never opens again.
-->
<script lang="ts">
  import { focusWhenDrawn } from '$lib/ui/keep-focus.ts';
  import { onMount, untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { goto } from '$app/navigation';
  import { at } from '$lib/at.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Currency from '../../routes/start/Currency.svelte';
  import { browserCurrencyEnv, currencyChoices } from '../../routes/start/building.ts';
  import type { Ledger } from './ledger.ts';
  import { balanceOf, likelyFirst, oneLine, SETUP_KEY, words, type Addon } from './setup.ts';
  import { speakingPackNow } from '$lib/voice.svelte.ts';
  import type { Finished, SetupRead } from './setup-live.ts';

  let {
    base,
    ledger,
    currency: held,
    accounts,
    locale,
    onclose,
  }: {
    base: string;
    ledger: Ledger;
    /** The record's home currency, `null` where nobody chose one. */
    currency: string | null;
    /** How many accounts the record holds. */
    accounts: number;
    locale: string;
    /** The setup is done with: the page draws its board. */
    onclose: () => void;
  } = $props();

  type Step = 'currency' | 'account' | 'addons';
  /* THE STEPS AS THE RECORD STOOD WHEN THE SETUP OPENED: an account it adds on Finish does not take a step away. */
  const steps: Step[] = untrack(() => [...(held === null ? (['currency'] as const) : []), ...(accounts === 0 ? (['account'] as const) : []), 'addons']);
  let place = $state(0);
  const step = $derived(steps[place] ?? 'addons');

  /* ── the choices ── */
  let code = $state<string | null>(untrack(() => held));
  let name = $state('');
  let kind = $state<string | null>(null);
  let typed = $state('');
  let picked = $state<string[]>([]);
  let rates = $state(false);
  let said = $state<string | null>(null);

  const ask = $derived.by(() => {
    if (typeof navigator === 'undefined') return null;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    return currencyChoices('', browserCurrencyEnv(locale, [...(navigator.languages ?? [])], zone));
  });

  let read = $state.raw<SetupRead | null>(null);
  /* THE ACCOUNT'S CURRENCY IS THE HOME ONE, AND THE ONE HE HAS USED IS BESIDE IT (AM22, RN8): a founder whose every line
     was in dollars was asked "Balance today (EGP)" with no other way, so the told one is one press away. It does not
     lead: two USD payouts on an EGP record made a balance typed as 85,000 USD 85,000, fifty times what was there, and
     Cash ahead and runway read from it. Only a record with no home currency starts on the told one (`onMount`). */
  let acct = $state<string | null>(null);
  const home = $derived(code ?? held);
  const told = $derived(read?.told ?? null);
  const twoWays = $derived(told !== null && home !== null && told !== home);
  const money = $derived(acct ?? home ?? told ?? '');
  onMount(() => {
    void import('./setup-live.ts').then(async (m) => {
      const got = await m.readSetup(base, ledger);
      read = got;
      if (kind === null) kind = got.kinds[0]?.value ?? null;
      /* WITH NO HOME CURRENCY YET, the one he has used is the one offered first. */
      if (code === null && held === null && got.told !== null) code = got.told;
    });
  });

  function next(): void {
    said = null;
    if (step === 'currency' && code === null) return void (said = words.needCurrency);
    if (step === 'account') {
      if (name.trim() === '') return void (said = words.needName);
      if (balanceOf(typed, money) === null) return void (said = words.needBalance);
    }
    place = Math.min(place + 1, steps.length - 1);
    /* THE NEXT STEP TAKES THE FOCUS (first-hour audit AH20): its heading, or its first field, never the top of the page. */
    focusWhenDrawn(() => document.querySelector<HTMLElement>('.ms .ms-body h3, .ms .ms-body input, .ms .ms-body button'), document.activeElement);
  }

  function toggle(id: string, on: boolean): void {
    picked = on ? [...picked, id] : picked.filter((p) => p !== id);
  }

  /* ── the press ── */
  let busy = $state(false);
  let finished = $state.raw<Finished | null>(null);

  /**
   * FINISH, AND WHERE TO GO AFTER (2 Nov, a walk: a new person added their bank account and the setup never said a
   * statement could come next, so the account sat at its one balance). `then` is a path; the setup closes either way.
   */
  async function finish(then: string | null = null): Promise<void> {
    if (busy || !read) return;
    busy = true;
    said = null;
    try {
      const { finishSetup } = await import('./setup-live.ts');
      const minor = balanceOf(typed, money);
      const out = await finishSetup(base, ledger, read, {
        currency: held === null ? code : null,
        account: steps.includes('account') && minor !== null && kind !== null ? { name, kind, minor, currency: money } : null,
        addons: picked,
        rates,
      });
      await navPrefs.dismiss(SETUP_KEY);
      /* THE RAIL READS THE RECORD AGAIN (audit 31 Oct h, AH15): the first account brings Accounts, Coming up, Forecast and
         Reports onto it, and they showed only after a reload. */
      (await import('$lib/record/boot-live.ts')).forget();
      await invalidateAll();
      if (out.failed.length === 0 && out.left.length === 0) {
        toasts.push(words.done, { intent: 'good' });
        onclose();
        if (then !== null) return void goto(at(then));
        /* AND MONEY'S OWN HEADING once the board is drawn in its place, where the focus would have fallen to the page. */
        focusWhenDrawn(() => document.querySelector<HTMLElement>('main h1'));
      } else {
        finished = out;
        focusWhenDrawn(() => document.getElementById('ms-title'));
      }
    } finally {
      busy = false;
    }
  }

  async function skip(): Promise<void> {
    await navPrefs.dismiss(SETUP_KEY);
    onclose();
  }
</script>

{#snippet addonRow(a: Addon, on: boolean)}
  <li>
    <label class="ms-addon">
      <input type="checkbox" checked={on || picked.includes(a.id)} disabled={on} onchange={(e) => toggle(a.id, e.currentTarget.checked)} />
      <span class="ms-addon-text"><span class="ms-addon-name">{a.title}{#if on}<span class="ms-quiet"> · {words.installed}</span>{/if}</span><span class="ms-quiet ms-one" title={a.summary}>{oneLine(a.summary)}</span></span>
    </label>
  </li>
{/snippet}

<section class="ms" aria-labelledby="ms-title">
  {#if finished}
    <h2 class="ms-title" id="ms-title">{finished.left.length > 0 || finished.failed.length > 0 ? words.doneSome : words.done}</h2>
    {#each finished.failed as f, i (i)}<p class="ms-warn" role="alert">{f}</p>{/each}
    {#if finished.left.length > 0}
      <ul class="ms-left">
        {#each finished.left as l (l.href)}<li><a href={at(l.href)}>{l.label}</a></li>{/each}
      </ul>
    {/if}
    <div class="ms-actions"><Button weight="primary" onclick={onclose}>{words.toMoney}</Button></div>
  {:else}
    <header class="ms-head">
      <h2 class="ms-title" id="ms-title">{words.title}</h2>
      {#if place === 0}<p class="ms-line">{words.lead}</p>{/if}
    </header>

    {#if step === 'currency'}
      <div class="ms-body">
        <p class="ms-line">{words.currencyLine}</p>
        <Currency bind:value={code} {locale} choices={ask?.choices ?? []} suggested={ask?.suggested ?? null} />
      </div>
    {:else if step === 'account'}
      <div class="ms-body">
        <h3 class="ms-sub">{words.account}</h3>
        <p class="ms-line">{words.accountLine}</p>
        <label class="ms-field">
          <span class="ms-label">{words.name}</span>
          <input class="ms-box" autocomplete="off" placeholder={words.namePlaceholder} bind:value={name} />
        </label>
        {#if (read?.kinds.length ?? 0) > 0}
          <span class="ms-label" id="ms-kind">{words.kind}</span>
          <Segmented role="group" aria-labelledby="ms-kind">
            {#each read?.kinds ?? [] as k (k.value)}
              <button type="button" class="segment" data-on={kind === k.value ? '' : undefined} aria-pressed={kind === k.value} onclick={() => (kind = k.value)}>{k.label}</button>
            {/each}
          </Segmented>
        {/if}
        {#if twoWays && told !== null && home !== null}
          <span class="ms-label" id="ms-in">{words.accountIn}</span>
          <Segmented role="group" aria-labelledby="ms-in">
            {#each [home, told] as c (c)}
              <button type="button" class="segment" data-on={money === c ? '' : undefined} aria-pressed={money === c} onclick={() => (acct = c)}>{c}</button>
            {/each}
          </Segmented>
        {/if}
        <label class="ms-field">
          <span class="ms-label">{words.balance(money)}</span>
          <input class="ms-box ms-num" inputmode="decimal" autocomplete="off" placeholder="0" bind:value={typed} />
        </label>
      </div>
    {:else}
      <div class="ms-body">
        <h3 class="ms-sub">{words.addons}</h3>
        <p class="ms-line">{words.addonsLine}</p>
        {#if read && read.addons.length > 0}
          {@const split = likelyFirst(read.addons, speakingPackNow()?.replace(/^usecase-/u, '') ?? null)}
          <ul class="ms-addons">
            {#each split.first as a (a.id)}{@render addonRow(a, read.on.includes(a.id))}{/each}
            <li>
              <label class="ms-addon">
                <input type="checkbox" checked={read.rates || rates} disabled={read.rates} onchange={(e) => (rates = e.currentTarget.checked)} />
                <span class="ms-addon-text"><span class="ms-addon-name">{words.rates}{#if read.rates}<span class="ms-quiet"> · {words.installed}</span>{/if}</span><span class="ms-quiet">{words.ratesLine}</span></span>
              </label>
            </li>
          </ul>
          {#if split.more.length > 0}
            <details class="ms-more">
              <summary class="tap">{words.moreAddons(split.more.length)}</summary>
              <ul class="ms-addons">
                {#each split.more as a (a.id)}{@render addonRow(a, read.on.includes(a.id))}{/each}
              </ul>
            </details>
          {/if}
        {:else if read}
          <p class="ms-line">{read.storeFix ?? words.noStore}</p>
          <div class="ms-actions"><Button href={at('/addons')}>{words.openAddons}</Button></div>
        {/if}
      </div>
    {/if}

    {#if said}<p class="ms-warn" role="alert">{said}</p>{/if}
    <div class="ms-actions">
      {#if place > 0}<Button disabled={busy} onclick={() => ((place -= 1), (said = null))}>{words.back}</Button>{/if}
      {#if step === 'addons'}
        <Button weight="primary" disabled={busy || read === null} onclick={() => void finish()}>{busy ? words.finishing : words.finish}</Button>
        {#if steps.includes('account') && (kind === 'bank' || kind === 'card')}<Button disabled={busy || read === null} onclick={() => void finish('/add/statement')}>{words.finishImport}</Button>{/if}
      {:else}
        <Button weight="primary" onclick={next}>{words.next}</Button>
      {/if}
      <span class="ms-gap"></span>
      <Button weight="quiet" disabled={busy} onclick={() => void skip()}>{words.skip}</Button>
    </div>
  {/if}
</section>

<style>
  .ms {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    max-inline-size: 40rem;
    margin: var(--sp-3) var(--gutter) var(--sp-9);
    padding: var(--tile-pad-lead);
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .ms-head,
  .ms-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .ms-title,
  .ms-sub {
    margin: 0;
    color: var(--ink);
  }

  .ms-sub {
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .ms-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .ms-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .ms-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .ms-box {
    inline-size: 100%;
    min-block-size: 44px;
    padding-inline: var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .ms-box:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .ms-num {
    max-inline-size: 16rem;
    font-variant-numeric: tabular-nums;
  }

  .ms-addons,
  .ms-left {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ms-addon {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    border-block-end: 1px solid var(--rule);
    cursor: pointer;
  }

  .ms-addons li:last-child .ms-addon {
    border-block-end: 0;
  }

  .ms-addon input {
    margin-block-start: 3px;
  }

  .ms-addon-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .ms-addon-name {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .ms-quiet {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  /* ONE LINE EACH (AH32), the whole summary on hover. */
  .ms-one {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ms-more > summary {
    cursor: pointer;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    padding-block: 8px;
  }

  .ms-left li {
    padding-block: var(--sp-2);
  }

  .ms-warn {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .ms-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .ms-gap {
    flex: 1;
  }

  @media (width < 640px) {
    .ms {
      padding: var(--tile-pad);
    }
  }
</style>
