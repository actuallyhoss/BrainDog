<!--
  "Which currency do you use?": the one question the first run asks, and only when Money is kept and the sentence typed
  no currency.

  NUMBERED CHOICES, EACH WITH THE FACT IT STANDS ON. At most three currencies come first (`building.ts`
  `currencyChoices`): the ones the person named ("pounds and dollars"), the one of the region whose time this device
  keeps, and the one of the language it is set to. One of them is suggested, with its reason in a sentence, and the keys
  1 to 3 answer from anywhere on the page (the page's own handler). A suggestion is never an answer: nothing is chosen
  for the person, and "Make it mine" waits until they press one.

  AND EVERY CURRENCY THE BROWSER KNOWS, ONE SEARCH AWAY. Typing narrows by name or by code, so a word of the currency's
  name finds it as surely as its three letters do. A word the person typed that names several currencies ("dollars",
  with no fact to pick between them) starts the search, so they are one press away rather than guessed at.
  Each is said by its name alone: a code is for typing, never for reading.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { words, type CurrencyChoice } from './building.ts';
  import { currencies } from './preview.ts';
  import { spokenName } from '$lib/start/place-currency.ts';

  let {
    value = $bindable(null),
    locale,
    choices = [],
    suggested = null,
    find: start = null,
    quiet = false,
  }: {
    value?: string | null;
    locale: string;
    /** The currencies worth offering first, numbered in this order. */
    choices?: readonly CurrencyChoice[];
    /** The one suggested, by code. */
    suggested?: string | null;
    /** A word to start the search with, when the person named several currencies with one word. */
    find?: string | null;
    /** Opened to change one already said (sign-up's Time and money): the one said is shown chosen, with no "Suggested" line over it. */
    quiet?: boolean;
  } = $props();

  /* AT MOST EIGHT MATCHES, so the list under the field stays short while a phone's keyboard is up; typing more narrows
     it further. */
  const SHOWN = 8;

  const all = $derived(currencies(locale));
  let find = $state('');
  /* THE SEARCH STARTS AT THE WORD THEY TYPED, once per word: typing over it is theirs, and a new word replaces it. */
  let seeded: string | null = null;
  $effect(() => {
    if (start !== null && start !== seeded && value === null) {
      seeded = start;
      find = start;
    }
  });

  const matches = $derived.by(() => {
    const q = find.trim().toLowerCase();
    if (q === '') return [];
    return all.filter((c) => c.code.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q)).slice(0, SHOWN);
  });
  const chosen = $derived(value === null ? null : (all.find((c) => c.code === value) ?? null));
  const offer = $derived(choices.find((c) => c.code === suggested) ?? null);

  function pick(code: string) {
    value = code;
    find = '';
  }
</script>

<div class="currency" role="group" aria-labelledby="currency-q">
  <h3 class="currency-q" id="currency-q">{firstRun.currencyQuestion}</h3>
  {#if offer && !(quiet && value !== null)}
    <p class="currency-offer"><span class="currency-offer-name">{words.suggested(copy.recommended, spokenName(offer.name), null)}</span> {offer.why ? `${offer.why.charAt(0).toUpperCase()}${offer.why.slice(1)}.` : ''}</p>
  {/if}

  {#if choices.length > 0}
    <div class="currency-choices" role="group" aria-label={firstRun.currencyQuestion}>
      {#each choices as c, i (c.code)}
        <Button weight="quiet" kbd={String(i + 1)} aria-pressed={value === c.code} data-suggested={c.code === suggested ? '' : undefined} onclick={() => pick(c.code)}>
          {#if value === c.code}<Icon name="check" size="m" />{/if}{spokenName(c.name)}
        </Button>
      {/each}
    </div>
  {/if}

  <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
  <p class="currency-said" role="status">{chosen && !choices.some((c) => c.code === chosen.code) ? spokenName(chosen.name) : ''}</p>
  <p class="currency-why">{firstRun.currencyFirst}</p>

  <label class="currency-label" for="currency-find">{firstRun.currencyFind}</label>
  <div class="field">
    <Icon name="search" size="m" />
    <input class="field-input currency-find" id="currency-find" type="search" autocomplete="off" spellcheck="false" bind:value={find} />
  </div>
  {#if find.trim() !== ''}
    {#if matches.length === 0}
      <p class="currency-why" role="status">{firstRun.currencyNone}</p>
    {:else}
      <div class="currency-matches" role="group" aria-label={firstRun.currencyFind}>
        {#each matches as c (c.code)}
          <Button weight="quiet" size="sm" aria-pressed={value === c.code} onclick={() => pick(c.code)}>{spokenName(c.name)}</Button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .currency {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE QUESTION ITSELF, at the row size: a person reads it as the thing asked, not as a section title. */
  .currency-q {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .currency-offer {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .currency-offer-name {
    color: var(--ink);
    font-weight: 500;
  }

  .currency-choices,
  .currency-matches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE ONE PRESSED IS ON: the selected fill with its check, never the ink of the screen's one primary. */
  .currency-choices :global(.btn[aria-pressed='true']),
  .currency-matches :global(.btn[aria-pressed='true']) {
    background: var(--red-tint);
    font-weight: 600;
  }

  .currency-said:empty {
    display: none;
  }

  .currency-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .currency-why {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .currency-label {
    margin-block-end: calc(var(--sp-1) - var(--sp-3));
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* NO KEY CAP UNDER A THUMB: there is no keyboard to press it with. */
  @media (width < 900px), (pointer: coarse) {
    .currency-choices :global(.btn-kbd) {
      display: none;
    }
  }
</style>
