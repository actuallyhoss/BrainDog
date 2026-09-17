<!--
  Exchange rates, fetched every day: a public rates address set up on Money's settings.

  IT FILES A PROPOSAL AND INSTALLS NOTHING. The pack is `ratesPollPack`'s, an ordinary poll, so it goes in front of the
  owner on Decide with the host and how often printed, and runs only once it is approved (`lib/record/rates-form.ts`,
  which also documents the addresses offered). The browser never calls the address.

  The currencies start as the ones the record's money is in, read from its accounts and obligations, plus the home
  currency. Imported by this route only, so nothing here reaches the entry chunk.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import { COMMON_CURRENCIES, OTHER_CURRENCIES } from '$lib/record/currencies.ts';
  import { RATES_SOURCES, currenciesIn, ratesFault, ratesProposal, rowsFor, type RatesDraft } from '$lib/record/rates-form.ts';

  let { home }: { home: string } = $props();

  const LISTS = ['accounts', 'obligations'] as const;

  let source = $state(RATES_SOURCES[0]!.id);
  let base = $state('USD');
  let url = $state('');
  let rows = $state<RatesDraft['rows']>([]);
  let busy = $state(false);
  let fault = $state<{ at: string; fix: string } | null>(null);
  let filed = $state<string | null>(null);
  /** The currencies the record holds money in, once read. */
  let held = $state<string[]>([]);

  const covers = $derived(RATES_SOURCES.find((s) => s.id === source)?.covers ?? copy.ratesCustomCovers);
  const wanted = (): string[] => [...held, ...(home ? [home] : [])];

  $effect(() => {
    const client = createClient({ base: location.origin });
    void Promise.all(LISTS.map((register) => client.list({ register, limit: 500 }))).then((reads) => {
      const found = reads.flatMap((r) => (r.ok && r.value && Array.isArray((r.value as { rows?: unknown }).rows) ? ((r.value as { rows: { fields: Record<string, unknown> }[] }).rows) : []));
      held = currenciesIn(found);
      rows = rowsFor(source, base, wanted());
    });
  });

  /* A NEW SOURCE OR BASE RE-PATHS THE ROWS AND KEEPS THE CURRENCIES CHOSEN. */
  function repath() {
    rows = rowsFor(source, base, rows.map((r) => r.currency).concat(rows.length ? [] : wanted()));
  }

  function add(select: HTMLSelectElement) {
    const code = select.value;
    select.value = '';
    if (!code || code === base || rows.some((r) => r.currency === code)) return;
    rows = rowsFor(source, base, [...rows.map((r) => r.currency), code]).map((r) => rows.find((x) => x.currency === r.currency) ?? r);
  }

  async function file(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const draft: RatesDraft = { source, base, url, rows };
    fault = ratesFault(draft);
    if (fault) return;
    busy = true;
    const out = await createClient({ base: location.origin }).call<{ id?: unknown }>('propose', ratesProposal(draft));
    busy = false;
    if (!out.ok) {
      fault = { at: 'file', fix: 'refusal' in out ? out.refusal.fix : copy.reportUnread };
      return;
    }
    filed = typeof out.value?.id === 'string' ? out.value.id : '';
  }
</script>

<div class="rates">
  <p class="rates-why">{copy.ratesWhy}</p>

  {#if filed !== null}
    <p class="rates-said" role="status">
      {copy.pollFiled}{#if filed}{' '}<a class="tap" href="/decide/{filed}">{copy.pollOpenDecide}</a>{/if}
    </p>
  {/if}

  <form class="rates-form" onsubmit={(e) => void file(e)} novalidate>
    <label class="rates-label" for="rates-source">{copy.ratesSource}</label>
    <select class="rates-select" id="rates-source" value={source} onchange={(e) => { source = e.currentTarget.value; repath(); }} aria-describedby="rates-covers">
      {#each RATES_SOURCES as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      <option value="custom">{copy.ratesCustom}</option>
    </select>
    <p class="rates-note" id="rates-covers">{covers}</p>

    {#if source === 'custom'}
      <label class="rates-label" for="rates-url">{copy.pollAddress}</label>
      <div class="field">
        <input
          class="field-input"
          id="rates-url"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder={copy.pollAddressHint}
          bind:value={url}
          aria-invalid={fault?.at === 'url' ? 'true' : undefined}
          aria-describedby={fault?.at === 'url' ? 'rates-fault' : undefined}
        />
      </div>
    {/if}

    <label class="rates-label" for="rates-base">{copy.ratesBase}</label>
    <select class="rates-select" id="rates-base" value={base} onchange={(e) => { base = e.currentTarget.value; repath(); }} aria-describedby="rates-base-note">
      <optgroup label={copy.currencyCommon}>{#each COMMON_CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
      <optgroup label={copy.currencyAll}>{#each OTHER_CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
    </select>
    <p class="rates-note" id="rates-base-note">{copy.ratesBaseNote(base)}</p>

    <fieldset class="rates-rows">
      <legend class="rates-label">{copy.ratesCurrencies}</legend>
      <p class="rates-note">{copy.ratesCurrenciesNote}</p>
      {#each rows as row, i (row.currency)}
        <div class="rates-row">
          <span class="rates-code">{row.currency}</span>
          {#if source === 'custom'}
            <div class="field">
              <input class="field-input" type="text" spellcheck="false" autocomplete="off" aria-label="{copy.pollPath} {row.currency}" placeholder={copy.pollPathHint} bind:value={rows[i]!.path} />
            </div>
          {:else}
            <span class="rates-path">{row.path}</span>
          {/if}
          <Button weight="bare" aria-label={copy.ratesRemove(row.currency)} onclick={() => (rows = rows.filter((r) => r.currency !== row.currency))}>{copy.ratesRemove(row.currency)}</Button>
        </div>
      {/each}
      <div class="rates-do">
        <select class="rates-select" aria-label={copy.ratesAdd} value="" onchange={(e) => add(e.currentTarget)}>
          <option value="">{copy.ratesAdd}</option>
          <optgroup label={copy.currencyCommon}>{#each COMMON_CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
          <optgroup label={copy.currencyAll}>{#each OTHER_CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}</optgroup>
        </select>
      </div>
    </fieldset>

    {#if fault}<p class="rates-fault" id="rates-fault" role="alert">{fault.fix}</p>{/if}
    <div class="rates-do">
      <Button weight="quiet" type="submit" disabled={busy}>{copy.ratesFile}</Button>
    </div>
  </form>
</div>

<style>
  .rates {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .rates-why,
  .rates-note,
  .rates-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }

  .rates-note {
    color: var(--dim);
  }

  .rates-form {
    display: grid;
    gap: var(--sp-2);
  }

  .rates-label {
    margin-block-start: var(--sp-2);
    padding: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .rates-select {
    justify-self: start;
    max-inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .rates-rows {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .rates-row {
    display: grid;
    grid-template-columns: 4ch minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
  }

  .rates-code {
    color: var(--ink);
    font-size: var(--t-ui);
    font-variant-numeric: tabular-nums;
  }

  .rates-path {
    overflow-wrap: anywhere;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .rates-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .rates-fault {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
  }
</style>
