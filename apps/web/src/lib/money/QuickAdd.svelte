<!--
  ONE SHEET FOR ONE LINE OF MONEY: out, in, or a move between your own accounts.

  The amount first and big, in the account's currency, with its home figure under it when that differs. Then who it was
  paid to, with the names the ledger already holds offered as you type (and the five most used as chips on a phone),
  each with the category and the account it usually takes. Then the category, as tiles with their glyphs and colours,
  the most recently used first. Then the account and the day, today in the record's own zone. A note and a split into
  several categories wait behind a press each.

  WHAT IS WRITTEN IS THE LEDGER'S OWN ROW, through the record's ordinary create (`read.ts`), field by field as the
  declarations name them (`ledger.ts`): no list or field is named here. The receipt carries an Undo.

  THE ONE SHEET. It is `Sheet.svelte`, a bottom sheet on a phone; from 900px up it is hung in the middle of the window
  rather than at its edge, because this is a thing typed and sent, not a panel read beside the page.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { plainName, wordSlot, writeAmount } from 'braindog-render';

  import { homeCurrency } from '$lib/record/api.ts';
  import { recordToday } from '$lib/record/zone.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { HUES, type Ledger } from './ledger.ts';
  import {
    WAYS,
    accountFor,
    categoriesFor,
    daySaid,
    grouped,
    leftOf,
    linesOf,
    minorOf,
    payeeNamed,
    payeesOf,
    suggestions,
    typedOf,
    words,
    type Option,
    type Part,
    type Payee,
    type Way,
  } from './quick.ts';
  import { quick } from './quick.svelte.ts';
  import { approxOf, ageSaid } from './rates.ts';
  import { held as heldRates } from './rates.svelte.ts';
  import { readHeld, writeLines, type Held } from './read.ts';

  let {
    ledger,
    base,
    lists,
  }: {
    ledger: Ledger;
    base: string;
    lists: readonly { id: string; kernel?: true }[];
  } = $props();

  const uid = $props.id();
  let open = $state(true);
  let way = $state<Way>(untrack(() => quick.way));

  /* ── what the record holds ─────────────────────────────────────────────── */
  let held = $state<Held | null>(null);
  let unread = $state(false);
  $effect(() => {
    const at = base;
    const l = ledger;
    void readHeld(at, l, lists).then(
      (h) => {
        held = h;
        heldRates.keep(at, h.rates);
      },
      () => (unread = true),
    );
  });

  const home = $derived(homeCurrency());
  const today = recordToday();

  /* ── the draft ─────────────────────────────────────────────────────────── */
  let typed = $state('');
  let title = $state('');
  let account = $state<string | null>(null);
  let to = $state<string | null>(null);
  let received = $state('');
  let category = $state<string | null>(null);
  /** The category came from the payee's past lines, and says so until somebody picks another. */
  let usualFrom = $state<string | null>(null);
  let day = $state(today);
  let note = $state('');
  let noting = $state(false);
  let splitting = $state(false);
  let parts = $state<{ category: string | null; typed: string }[]>([]);
  let allCategories = $state(false);
  let busy = $state(false);
  let fix = $state<string | null>(null);

  const accounts = $derived(held?.accounts ?? []);
  const accountOf = (id: string | null): Option | undefined => accounts.find((a) => a.id === id);
  /* THE CURRENCY IS THE ACCOUNT'S: the record writes a line in the code of the account it moved through. */
  const currency = $derived(accountOf(account)?.currency ?? home ?? '');
  const toCurrency = $derived(way === 'move' ? (accountOf(to)?.currency ?? null) : null);
  const across = $derived(toCurrency !== null && toCurrency !== currency);
  const minor = $derived(currency ? minorOf(typed, currency) : null);

  const money = $derived(way === 'move' ? null : way);
  const payees = $derived(held && money ? payeesOf(held.past, money) : []);
  const offered = $derived(suggestions(payees, title));
  const chips = $derived(payees.slice(0, 5));
  const categories = $derived(held && money && ledger.category ? categoriesFor(held.categories, held.past, money, ledger.way) : []);
  const shown = $derived(allCategories ? categories : categories.slice(0, 8));

  /* ON OPENING, AND ON A NEW WAY: the account the ledger was last used on, the payee's own once one is picked. */
  $effect(() => {
    if (!held) return;
    untrack(() => {
      if (account === null || !accountOf(account)) account = accountFor(held!.accounts, held!.past, null);
      if (to === null || to === account) to = held!.accounts.find((a) => a.id !== account)?.id ?? null;
    });
  });

  /* ── the payee box and its suggestions ──────────────────────────────────── */
  let listOpen = $state(false);
  let lit = $state(0);
  const dropping = $derived(listOpen && title.trim() !== '' && way !== 'move' && (offered.length > 0 || title.trim() !== ''));

  function pick(p: Payee) {
    title = p.name;
    listOpen = false;
    if (p.category && categories.some((c) => c.id === p.category)) {
      category = p.category;
      usualFrom = p.category;
    }
    if (p.account && accountOf(p.account)) account = p.account;
  }

  function onpayeekey(e: KeyboardEvent) {
    if (!dropping) return;
    const n = offered.length + 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      lit = (lit + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = offered[lit];
      if (p) pick(p);
      else listOpen = false;
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      listOpen = false;
    }
  }

  /* A NAME TYPED WHOLE IS THAT PAYEE, so its usual category comes with it as if it had been picked. */
  $effect(() => {
    const p = payeeNamed(payees, title);
    untrack(() => {
      if (p && p.category && category === null && categories.some((c) => c.id === p.category)) {
        category = p.category;
        usualFrom = p.category;
      }
    });
  });

  /* ── the split ──────────────────────────────────────────────────────────── */
  const partsMinor = $derived<Part[]>(parts.map((p) => ({ category: p.category, minor: (currency ? minorOf(p.typed, currency) : null) ?? 0 })));
  const left = $derived(leftOf(minor, partsMinor));

  function startSplit() {
    splitting = true;
    if (parts.length === 0) {
      const first = category ?? categories[0]?.id ?? null;
      const second = categories.find((c) => c.id !== first)?.id ?? null;
      parts = [
        { category: first, typed: minor !== null ? typedOf(minor, currency) : '' },
        { category: second, typed: '' },
      ];
    }
  }

  /* ── the words for an amount ────────────────────────────────────────────── */
  const said = (m: number, code: string): string => writeAmount({ minor: m, currency: code }, home, 'exact')?.text ?? '';
  const athome = $derived(minor !== null && currency ? approxOf(minor, currency, home, held?.rates ?? heldRates.rates, today) : null);
  const leftSaid = $derived(currency ? said(Math.abs(left), currency) : '');

  /* ── saving ─────────────────────────────────────────────────────────────── */
  async function save(e?: Event) {
    e?.preventDefault();
    if (busy || !held) return;
    const drafted = linesOf(
      {
        way,
        minor,
        currency,
        title: way === 'move' && title.trim() === '' ? words.moveTitle(accountOf(account)?.name ?? '', accountOf(to)?.name ?? '') : title,
        day,
        account,
        to,
        received: toCurrency ? minorOf(received, toCurrency) : null,
        toCurrency,
        category,
        parts: splitting ? partsMinor : [],
        note,
      },
      ledger,
    );
    if (!drafted.ok) {
      fix = drafted.fix;
      return;
    }
    fix = null;
    busy = true;
    let out: Awaited<ReturnType<typeof writeLines>>;
    try {
      out = await writeLines(base, ledger, drafted.lines);
    } catch {
      out = { ok: false, fix: words.noLedger };
    }
    busy = false;
    if (!out.ok) {
      fix = out.fix;
      return;
    }
    const amount = said(minor!, currency);
    const name = (drafted.lines[0]?.[ledger.title] as string | undefined) ?? '';
    const receipt =
      way === 'move'
        ? words.moved(amount, accountOf(account)?.name ?? '', accountOf(to)?.name ?? '')
        : drafted.lines.length > 1
          ? words.addedSplit(name, drafted.lines.length, `${way === 'out' ? '−' : '+'}${amount}`)
          : words.added(name, `${way === 'out' ? '−' : '+'}${amount}`);
    const back = out.back;
    toasts.push(receipt, {
      undo: () =>
        void back().then(async (r) => {
          if (!r.ok && r.fix) toasts.push(r.fix, { intent: 'warn' });
          await reread();
        }),
    });
    open = false;
    await reread();
  }

  /** Every screen reads again, as a pull does, so the line is on the page that opened the sheet. */
  async function reread() {
    const { reread: again } = await import('$lib/data/live.svelte.ts');
    await again();
  }

  /* ── the day ────────────────────────────────────────────────────────────── */
  let dayBox = $state<HTMLInputElement | null>(null);
  function pickDay() {
    const box = dayBox;
    if (!box) return;
    try {
      box.showPicker();
    } catch {
      box.focus();
    }
  }

  /** A glyph name only from the set; anything else draws the tag. */
  const glyph = (name: string | null | undefined, or: IconName): IconName => (name && /^[a-z]+(?:-[a-z]+)*$/u.test(name) ? (name as IconName) : or);
  const chipOf = (c: string | null | undefined): string | undefined => (c && HUES.has(c) ? `var(--cat-${c})` : undefined);
  const tintOf = (c: string | null | undefined): string | undefined => (c && HUES.has(c) ? `var(--cat-${c}-tint)` : undefined);
  const KIND: Readonly<Record<string, IconName>> = { bank: 'landmark', cash: 'banknote', card: 'credit-card' };
  const accountGlyph = (a: Option | undefined): IconName => (a?.kind && KIND[a.kind]) || 'wallet';

  const usualName = $derived(usualFrom !== null && usualFrom === category ? (categories.find((c) => c.id === usualFrom)?.name ?? null) : null);
  const accountLabel = (a: Option): string => (a.currency ? `${a.name} · ${a.currency}` : a.name);
</script>

<Sheet bind:open title={words.title} onclose={() => quick.close()}>
  <form class="qa" id="{uid}-form" onsubmit={save} novalidate>
    <Segmented role="radiogroup" aria-label={words.title} class="qa-ways">
      {#each WAYS as w (w)}
        <button
          type="button"
          class="segment"
          role="radio"
          aria-checked={way === w ? 'true' : 'false'}
          data-on={way === w ? '' : undefined}
          onclick={() => {
            way = w;
            fix = null;
            if (w === 'move') splitting = false;
          }}><span class="qa-long">{words.ways[w]}</span><span class="qa-short">{words.short[w]}</span></button
        >
      {/each}
    </Segmented>

    <!-- THE AMOUNT, BIG, in the account's own code. -->
    <div class="qa-amount">
      <label class="qa-big" for="{uid}-amount">
        <span class="qa-code">{currency}</span>
        <input
          id="{uid}-amount"
          class="qa-figure num"
          data-own-size
          inputmode="decimal"
          autocomplete="off"
          placeholder="0.00"
          aria-label={words.amount}
          value={typed}
          oninput={(e) => {
            typed = grouped(e.currentTarget.value);
            e.currentTarget.value = typed;
            fix = null;
          }}
        />
      </label>
      <p class="qa-under">
        {#if athome}{words.approx(said(athome.minor, athome.currency))} · {ageSaid(athome.as_of, today)}{:else if way !== 'move' && accountOf(account)}{way === 'out' ? words.from : words.into} {accountOf(account)?.name}{/if}
      </p>
    </div>

    {#if unread}
      <p class="qa-fix" role="alert">{words.noLedger}</p>
    {:else if !held}
      <p class="qa-wait">{words.loading}</p>
    {:else if accounts.length === 0}
      <p class="qa-fix" role="alert">{words.noAccounts(ledger.one)}</p>
    {:else}
      <!-- WHO IT WAS PAID TO: the names the ledger holds, as you type. -->
      <div class="qa-f qa-payee">
        <label class="field-label" for="{uid}-payee">{words.paidTo[way]}{#if way !== 'move'}{' '}<em>· {words.payeeHint}</em>{/if}</label>
        {#if chips.length > 0 && title.trim() === '' && way !== 'move'}
          <div class="qa-chips" role="group" aria-label={words.paidTo[way]}>
            {#each chips as p (p.name)}
              <button type="button" class="qa-chip" onclick={() => pick(p)}>{plainName(p.name)}</button>
            {/each}
          </div>
        {/if}
        <div class="field">
          <input
            id="{uid}-payee"
            class="field-input"
            placeholder={way === 'move' ? undefined : words.payeeType}
            autocomplete="off"
            role="combobox"
            aria-expanded={dropping ? 'true' : 'false'}
            aria-controls="{uid}-payees"
            aria-autocomplete="list"
            bind:value={title}
            oninput={() => {
              listOpen = true;
              lit = 0;
              fix = null;
              if (usualFrom !== null && usualFrom === category) {
                category = null;
                usualFrom = null;
              }
            }}
            onfocus={() => (listOpen = true)}
            onblur={() => setTimeout(() => (listOpen = false), 120)}
            onkeydown={onpayeekey}
          />
        </div>
        {#if dropping}
          <div class="qa-drop" id="{uid}-payees" role="listbox">
            {#each offered as p, i (p.name)}
              {@const c = categories.find((x) => x.id === p.category)}
              <div
                class="qa-opt"
                role="option"
                tabindex="-1"
                aria-selected={lit === i ? 'true' : 'false'}
                data-lit={lit === i ? '' : undefined}
                onpointerdown={(e) => (e.preventDefault(), pick(p))}
              >
                <span class="qa-chipglyph" style:--chip={chipOf(c?.colour ?? wordSlot(c?.name))} style:--chip-tint={tintOf(c?.colour ?? wordSlot(c?.name))}><Icon name={glyph(c?.icon, 'tag')} size="s" /></span>
                <span class="qa-grow"><span class="qa-t">{plainName(p.name)}</span><span class="qa-d">{words.usual(p.count, c?.name ?? null)}</span></span>
                {#if lit === i}<kbd class="qa-kbd">↵</kbd>{/if}
              </div>
            {/each}
            <div
              class="qa-opt"
              role="option"
              tabindex="-1"
              aria-selected={lit === offered.length ? 'true' : 'false'}
              data-lit={lit === offered.length ? '' : undefined}
              onpointerdown={(e) => (e.preventDefault(), (listOpen = false))}
            >
              <span class="qa-chipglyph"><Icon name="plus" size="s" /></span>
              <span class="qa-grow"><span class="qa-t qa-plain">{words.asWritten(title.trim())}</span></span>
            </div>
          </div>
        {/if}
      </div>

      <!-- THE CATEGORY, AS TILES, the most recently used first. -->
      {#if way !== 'move' && ledger.category && categories.length > 0 && !splitting}
        <div class="qa-f">
          <span class="field-label" id="{uid}-cats">{words.category}{#if usualName} <em>· {words.categoryFrom(usualName)}</em>{/if}</span>
          <div class="qa-cats" role="radiogroup" aria-labelledby="{uid}-cats">
            {#each shown as c (c.id)}
              <button
                type="button"
                class="qa-cat"
                role="radio"
                aria-checked={category === c.id ? 'true' : 'false'}
                data-on={category === c.id ? '' : undefined}
                onclick={() => {
                  category = category === c.id ? null : c.id;
                  usualFrom = null;
                }}
              >
                <span class="qa-chipglyph" style:--chip={chipOf(c.colour ?? wordSlot(c.name))} style:--chip-tint={tintOf(c.colour ?? wordSlot(c.name))}><Icon name={glyph(c.icon, 'tag')} size="s" /></span>
                <span class="qa-catname">{c.name}</span>
              </button>
            {/each}
          </div>
          {#if categories.length > 8}
            <button type="button" class="qa-link" onclick={() => (allCategories = !allCategories)}>{allCategories ? words.fewer : words.all(categories.length)}</button>
          {/if}
        </div>
      {/if}

      {#if splitting && way !== 'move'}
        <div class="qa-f">
          <span class="field-label">{words.split}</span>
          {#each parts as part, i (i)}
            <div class="qa-part">
              <div class="field qa-part-cat">
                <select class="field-input" aria-label={words.category} bind:value={part.category}>
                  <option value={null}>{words.noCategory}</option>
                  {#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
                </select>
              </div>
              <div class="field qa-part-amount">
                <input class="field-input num" inputmode="decimal" aria-label={words.amount} placeholder="0.00" value={part.typed} oninput={(e) => (part.typed = grouped(e.currentTarget.value))} />
              </div>
              {#if parts.length > 2}
                <button type="button" class="qa-x tap" aria-label={words.splitDrop} title={words.splitDrop} onclick={() => (parts = parts.filter((_, j) => j !== i))}><Icon name="close" size="s" /></button>
              {/if}
            </div>
          {/each}
          <p class="qa-d">
            {#if left > 0}{words.splitLeft(leftSaid)}{:else if left < 0}{words.splitOver(leftSaid)}{/if}
            {#if parts.length < 8}<button type="button" class="qa-link" onclick={() => (parts = [...parts, { category: null, typed: left > 0 && currency ? typedOf(left, currency) : '' }])}>{words.splitAdd}</button>{/if}
          </p>
        </div>
      {/if}

      <div class="qa-two">
        <div class="qa-f">
          <label class="field-label" for="{uid}-from">{way === 'in' ? words.into : words.from}</label>
          <div class="field">
            <Icon name={accountGlyph(accountOf(account))} size="s" />
            <select id="{uid}-from" class="field-input" bind:value={account}>
              {#each accounts as a (a.id)}<option value={a.id}>{accountLabel(a)}</option>{/each}
            </select>
          </div>
        </div>
        {#if way === 'move'}
          <div class="qa-f">
            <label class="field-label" for="{uid}-to">{words.to}</label>
            <div class="field">
              <Icon name={accountGlyph(accountOf(to))} size="s" />
              <select id="{uid}-to" class="field-input" bind:value={to}>
                {#each accounts.filter((a) => a.id !== account) as a (a.id)}<option value={a.id}>{accountLabel(a)}</option>{/each}
              </select>
            </div>
          </div>
        {/if}
        <div class="qa-f">
          <label class="field-label" for="{uid}-day">{words.when}</label>
          <button type="button" class="field qa-day" onclick={pickDay}>
            <Icon name="calendar" size="s" />
            <span class="qa-grow">{day === today ? words.today(daySaid(day)) : daySaid(day)}</span>
            <input id="{uid}-day" class="qa-daybox" type="date" tabindex="-1" bind:this={dayBox} bind:value={day} max="9999-12-31" />
          </button>
        </div>
        {#if way === 'move' && across && toCurrency}
          <div class="qa-f">
            <label class="field-label" for="{uid}-received">{words.received(toCurrency)}</label>
            <div class="field">
              <input id="{uid}-received" class="field-input num" inputmode="decimal" placeholder="0.00" value={received} oninput={(e) => (received = grouped(e.currentTarget.value))} />
            </div>
          </div>
        {/if}
      </div>

      {#if noting}
        <div class="qa-f">
          <label class="field-label" for="{uid}-note">{words.note}</label>
          <div class="field"><input id="{uid}-note" class="field-input" placeholder={words.notePlaceholder} bind:value={note} /></div>
        </div>
      {/if}
    {/if}

    {#if held && ((ledger.note && !noting) || (way !== 'move' && ledger.category && !splitting))}
      <p class="qa-more">
        {#if ledger.note && !noting}<button type="button" class="qa-link" onclick={() => (noting = true)}>{words.addNote}</button>{/if}
        {#if way !== 'move' && ledger.category && !splitting}<button type="button" class="qa-link" onclick={startSplit}>{words.splitStart}</button>{/if}
      </p>
    {/if}

    {#if fix}<p class="qa-fix" role="alert">{fix}</p>{/if}
  </form>

  {#snippet footer()}
    <Button onclick={() => (open = false)}>{words.cancel}</Button>
    <Button weight="primary" type="submit" form="{uid}-form" disabled={busy || !held} kbd="↵">{busy ? words.adding : words.add}</Button>
  {/snippet}
</Sheet>

<style>
  /* FROM 900 UP THE SHEET IS HUNG IN THE MIDDLE OF THE WINDOW, 520 wide, as tall as what it holds, and comes in from a
     little below with a fade, rather than sliding in from the edge as a panel does. */
  @media (width >= 900px) {
    :global(.sheet:has(> .sheet-body > .qa)) {
      --sheet-off: translateY(12px);
      --sheet-from-opacity: 0;
      --sheet-gone-opacity: 0;
      inset-block: 56px auto;
      inset-inline: 0;
      margin-inline: auto;
      inline-size: min(520px, calc(100vw - 2 * var(--inset)));
      block-size: auto;
      max-block-size: calc(100dvh - 112px - var(--kb));
    }
  }

  .qa {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .qa :global(.qa-ways) {
    inline-size: 100%;
  }

  .qa :global(.qa-ways .segment) {
    flex: 1;
  }

  .qa-short {
    display: none;
  }

  .qa-amount {
    display: grid;
    gap: var(--sp-1);
  }

  .qa-big {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 68px;
    padding-inline: calc(var(--sp-4) - 1.5px);
    border: 1.5px solid var(--ink);
    border-radius: var(--r-pop);
    cursor: text;
  }

  .qa-code {
    color: var(--ink-3);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
  }

  .qa-figure {
    flex: 1;
    min-inline-size: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-hero);
    font-weight: var(--fw-semi);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .qa-figure:focus-visible {
    /* focus-ok: the box round the figure is the field, drawn in ink, and it is already the focus. */
    outline: none;
  }

  .qa-figure::placeholder {
    color: var(--ink-3);
  }

  .qa-under,
  .qa-d,
  .qa-wait {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .qa-f {
    position: relative;
    display: grid;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .qa-f .field-label {
    margin: 0;
  }

  .qa-f em {
    color: var(--ink-3);
    font-style: normal;
    font-weight: var(--fw-regular);
  }

  .qa-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .qa-chip {
    min-block-size: 32px;
    padding-inline: var(--sp-3);
    border: 0;
    border-radius: var(--r-pill, 999px);
    background: var(--soft-fill, var(--tile-2));
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .qa-drop {
    position: absolute;
    inset-block-start: 100%;
    inset-inline: 0;
    z-index: var(--z-raise);
    margin-block-start: var(--sp-1);
    overflow: hidden;
    border-radius: var(--r-pop);
    background: var(--glass-regular, var(--tile));
    -webkit-backdrop-filter: var(--glass-filter, none);
    backdrop-filter: var(--glass-filter, none);
    box-shadow: var(--glass-edge, inset 0 0 0 1px var(--rule)), var(--elev-popover, none);
    padding: 4px;
  }

  .qa-opt {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 48px;
    padding: var(--sp-1) var(--sp-3);
    cursor: pointer;
  }

  .qa-opt {
    border-radius: var(--r-menu-row, 8px);
  }

  .qa-opt[data-lit] {
    background: var(--menu-row-fill, var(--tile-2));
  }

  .qa-grow {
    flex: 1;
    display: grid;
    min-inline-size: 0;
  }

  .qa-t {
    overflow: hidden;
    color: var(--ink);
    font-weight: var(--fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .qa-plain {
    font-weight: var(--fw-regular);
  }

  .qa-kbd {
    padding-inline: 4px;
    border: 1px solid var(--rule);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font: var(--fw-medium) var(--fs-cap) var(--font-mono);
  }

  /* A CATEGORY'S CHIP: its colour at a tint behind its glyph in the colour, as on the ledger's rows. */
  .qa-chipglyph {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 30px;
    block-size: 30px;
    border-radius: var(--r-pill, 999px);
    background: var(--chip-tint, var(--tile-2));
    color: var(--chip, var(--ink-2));
  }

  .qa-cats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sp-2);
  }

  .qa-cat {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-inline-size: 0;
    padding: 9px 3px 8px;
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-cap);
  }

  .qa-cat[data-on] {
    padding: 8px 2px 7px;
    border: 2px solid var(--ink);
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  /* A NAME TOO LONG FOR ITS SQUARE TAKES A SECOND LINE, never an ellipsis (design pass, 1 Nov): "Professional…" on a
     phone hid which category it was. */
  .qa-catname {
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    text-align: center;
    text-wrap: balance;
    line-height: 1.25;
  }

  .qa-two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-3);
  }

  .qa-day {
    position: relative;
    inline-size: 100%;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  /* THE BROWSER'S OWN DATE BOX, under the words, opened by the press on them. */
  .qa-daybox {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  .qa-part {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .qa-part-cat {
    flex: 3;
  }

  .qa-part-amount {
    flex: 2;
  }

  .qa-x {
    display: grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    border: 0;
    background: none;
    color: var(--ink-3);
  }

  .qa-link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--rule-strong);
    cursor: pointer;
    justify-self: start;
  }

  .qa-more {
    display: flex;
    gap: var(--sp-4);
    margin: 0;
  }

  .qa-fix {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* ON A PHONE: the short words on the switch, the figure in the middle and bigger, the chips over the box. */
  @media (width < 900px) {
    .qa-long {
      display: none;
    }

    .qa-short {
      display: inline;
    }

    .qa-big {
      justify-content: center;
      border-color: transparent;
      min-block-size: 64px;
    }

    .qa-figure {
      flex: 0 1 auto;
      inline-size: 7ch;
      font-size: var(--fs-hero);
      text-align: center;
    }

    .qa-under {
      text-align: center;
    }
  }

  /* ON A NARROW PHONE THE ACCOUNT AND THE DAY TAKE A ROW EACH: side by side the account was cut to "Studio current
     acco" (design pass, 1 Nov). */
  @media (width < 480px) {
    .qa-two {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
