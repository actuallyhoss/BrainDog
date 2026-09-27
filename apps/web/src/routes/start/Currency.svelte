<!--
  "Which currency do you use?": the one question the preview asks, and only when Money is kept and the sentence typed no
  currency (`loop/finish/modules.md` C10).

  EVERY CURRENCY THE BROWSER KNOWS, NAMED IN THE PERSON'S LANGUAGE, and no table of codes in this file: the list is
  `Intl.supportedValuesOf('currency')` and the names are `Intl.DisplayNames` (`preview.ts` `currencies`). A currency is
  one somebody chose, so nothing is chosen for them: the field starts empty and "Make it mine" waits for an answer.

  A FIELD AND THE MATCHES UNDER IT, at most `SHOWN` of them, each a 44px pill a thumb can press. Typing narrows by name or
  by code, so a word of the currency's name finds it as surely as its three letters do. Each is said by its name alone:
  a code is for typing, never for reading (`loop/finish/design-brief.md`).
-->
<script lang="ts">
  import { firstRun } from '$lib/first-run.ts';
  import { currencies } from './preview.ts';

  let { value = $bindable(null), locale }: { value?: string | null; locale: string } = $props();

  /* AT MOST EIGHT MATCHES, so the list under the field stays short while a phone's keyboard is up; typing more narrows
     it further. */
  const SHOWN = 8;

  const all = $derived(currencies(locale));
  let find = $state('');
  const matches = $derived.by(() => {
    const q = find.trim().toLowerCase();
    if (q === '') return [];
    return all.filter((c) => c.code.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q)).slice(0, SHOWN);
  });
  const chosen = $derived(value === null ? null : (all.find((c) => c.code === value) ?? null));

  function pick(code: string) {
    value = code;
    find = '';
  }
</script>

<div class="currency" role="group" aria-labelledby="currency-q">
  <h3 class="currency-q" id="currency-q">{firstRun.currencyQuestion}</h3>
  {#if chosen}
    <p class="currency-chosen" role="status">{chosen.name}</p>
  {:else}
    <p class="currency-why">{firstRun.currencyFirst}</p>
  {/if}
  <label class="currency-label" for="currency-find">{firstRun.currencyFind}</label>
  <input
    class="currency-find"
    id="currency-find"
    type="search"
    autocomplete="off"
    spellcheck="false"
    bind:value={find}
  />
  {#if find.trim() !== ''}
    {#if matches.length === 0}
      <p class="currency-why" role="status">{firstRun.currencyNone}</p>
    {:else}
      <div class="currency-matches" role="group" aria-label={firstRun.currencyFind}>
        {#each matches as c (c.code)}
          <button type="button" class="currency-match" aria-pressed={value === c.code} onclick={() => pick(c.code)}>{c.name}</button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .currency {
    display: grid;
    gap: var(--sp-2);
  }

  .currency-q {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .currency-chosen {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 500;
  }

  .currency-why {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .currency-label {
    margin-block-start: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* SIXTEEN PIXELS OF TEXT, or a phone zooms the page when the field takes focus. */
  .currency-find {
    inline-size: 100%;
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
  }

  .currency-matches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .currency-match {
    min-block-size: var(--tap);
    padding-inline: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--edge);
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .currency-match[aria-pressed='true'] {
    background: var(--selected);
  }
</style>
