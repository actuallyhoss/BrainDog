<!--
  `/count`: the full-screen counter, cash by default.

  PICK THE CASH ACCOUNT, THEN COUNT IT NOTE BY NOTE. One row for each note and coin of the account's currency, each with
  a minus, the count and a plus (44 square, under a thumb), and the total sticks to the bottom of a phone or the side of
  a desk so it is in sight while the rows scroll. Beside the total are the balance the record expects and how far the
  count is from it. A currency with no set of notes is counted by typing its total.

  WHEN THE CASH IS OUT, A SECOND STEP asks how to record the difference: as lines the person describes, with whatever is
  left filed as Discrepancy, or all of it as Discrepancy. Nothing is filed here; the screen writes one `cash_counts` row
  through the usual row writer and the count script files the rest (`packs/count-cash/count.js`).

  `?account=` is the account's number, which is how an account's page and Money open it already chosen.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { money, symbolFigure } from 'braindog-render';
  import { arrive } from '$lib/motion/index.ts';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import { loadCounter, writeCount, type Counted, type Loaded } from '$lib/money/cash-count-live.ts';
  import {
    counterReady,
    countFields,
    differenceOf,
    linesOf,
    noteSet,
    stepped,
    typedTotalOf,
    totalOf,
    typedCount,
    type Line,
    type Reconcile,
  } from '$lib/money/cash-count.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { titleOf } from '$lib/title.ts';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';

  const words = {
    title: 'Count the cash',
    account: 'Account',
    notes: 'Notes and coins',
    totalOnly: 'Total counted',
    totalHelp: 'Type what the box holds.',
    total: 'Amount counted',
    expected: 'Expected',
    typedBalance: 'From the balance typed on the account.',
    out: 'Out by',
    agrees: 'Agrees',
    more: 'more than expected',
    less: 'less than expected',
    next: 'Next',
    save: 'Save count',
    saving: 'Saving the count',
    back: 'Back to the count',
    how: 'Record the difference',
    asLines: 'As lines',
    asDiscrepancy: 'As Discrepancy',
    linesHelp: 'Whatever is left is filed as Discrepancy.',
    discrepancyHelp: 'Filed as one Discrepancy line.',
    what: 'What it was',
    amount: 'Amount',
    category: 'Category',
    addLine: 'Add a line',
    left: 'Left as Discrepancy',
    /* EVERY EMPTY SAYS WHAT WILL BE HERE AND THE ONE STEP THERE (Look B; design pass, 1 Nov): "No cash account to
       count" stood alone, and a counter opened bare said it needed the add-on that was already in. */
    noCash: 'No cash account to count yet',
    noCashBody: 'Add a cash account on Accounts, then count its notes and coins here.',
    toAccounts: 'Go to Accounts',
    notSetUp: 'Needs the Count the cash add-on',
    notSetUpBody: 'It counts your cash note by note and files any difference in the Ledger.',
    bare: 'Count from an account',
    bareBody: 'Open Count the cash from Money, or from a cash account, and the count goes to that account.',
    addOn: 'See the add-on',
    saved: 'Count saved',
    savedBody: 'Filing the difference in the Ledger.',
    again: 'Count again',
    toMoney: 'Back to Money',
    reduce: (face: string) => `Take one ${face} away`,
    add: (face: string) => `Add one ${face}`,
    count: (face: string) => `How many ${face}`,
  } as const;

  const base = $derived(apiBase(page.url));
  const lists = $derived((page.data as { lists?: { id: string; kernel?: true; pack?: string }[] } | undefined)?.lists ?? []);
  /* THE LIST IS NAMED BY THE LINK THAT OPENS THE COUNTER (`?list=`), which the add-on declares, so this screen holds no list's name. */
  const into = $derived(page.url.searchParams.get('list'));
  /* A RECORD WITHOUT THE ADD-ON, OR THE COUNTER OPENED BARE, HAS NOWHERE TO WRITE A COUNT: an empty screen, asking nothing. */
  const ready = $derived(counterReady(into, lists));
  /* WHETHER THE ADD-ON IS IN, for the words alone: a counter opened bare on a record that has it is pointed back to
     Money, not told to install what it holds. Nothing is written by this. */
  const installed = $derived(lists.some((l) => l.pack === 'count-cash'));
  const counter = read(() => (lists.length === 0 || !ready ? null : `${base} ${lists.length} ${into ?? ''}`), async (): Promise<Result<Loaded>> => {
    if (into === null) return { ok: false, refusal: { code: 'UNREACHABLE', fix: 'Open the counter from Count the cash on Money.' } };
    const got = await loadCounter(base, lists, into);
    return got.ok ? { ok: true, value: got.value } : { ok: false, refusal: { code: 'UNREACHABLE', fix: got.fix } };
  });

  /* BY NAME, so the accounts keep one order whichever was written last. */
  const accounts = $derived([...(counter.value?.accounts ?? [])].sort((a, b) => a.name.localeCompare(b.name)));
  const wanted = $derived(page.url.searchParams.get('account'));
  let chosen = $state<number | null>(null);
  const account = $derived<Counted | null>(accounts.find((a) => a.seq === (chosen ?? Number(wanted))) ?? accounts[0] ?? null);

  let counts = $state<Record<string, number>>({});
  let typedTotal = $state('');
  let step = $state<'count' | 'reconcile' | 'done'>('count');
  let reconcile = $state<Reconcile>('discrepancy');
  let lines = $state<Line[]>([{ what: '', amount: '', category: '' }]);
  let saving = $state(false);
  let refused = $state<string | null>(null);

  const currency = $derived(account?.currency ?? '');
  const set = $derived(noteSet(currency));
  const byNotes = $derived(set.length > 0);
  /* A TYPED TOTAL IS IN THE MAIN UNIT; the count is whole hundredths. */
  const counted = $derived(byNotes ? totalOf(counts) : typedTotalOf(typedTotal, currency));
  const expected = $derived(account?.expected ?? null);
  const difference = $derived(expected === null ? 0 : differenceOf(counted, expected));
  const out = $derived(difference !== 0);
  const split = $derived(linesOf(lines, difference));

  /* AN AMOUNT AS EVERY OTHER MONEY SCREEN SAYS IT, "£420.00" and not "GBP 420.00" (design pass, 1 Nov); a currency
     with no sign of its own keeps its code. */
  const say = (minor: number): string => {
    const coded = money(minor, currency);
    return symbolFigure(coded) ?? coded;
  };
  /* A NOTE OR A COIN BY ITS VALUE IN MONEY, "£50" and "£0.50", never the bare "50" and "0.5" a person had to read as
     pounds or pence. Whole faces drop their pence. */
  const faceMoney = (face: string): string => {
    const said = say(Math.round(Number(face) * 100));
    return Number.isInteger(Number(face)) ? said.replace(/\.0+$/u, '') : said;
  };

  function pick(seq: number): void {
    chosen = seq;
    counts = {};
    typedTotal = '';
    step = 'count';
    refused = null;
  }

  const setCount = (face: string, n: number): void => {
    counts = { ...counts, [face]: n };
  };

  function next(): void {
    refused = null;
    if (out) step = 'reconcile';
    else void save();
  }

  async function save(): Promise<void> {
    if (!account || saving) return;
    if (out && reconcile === 'lines' && !split.ok) {
      refused = split.why;
      return;
    }
    saving = true;
    refused = null;
    const notes = byNotes ? counts : {};
    const fields = countFields({
      account: account.id,
      currency,
      counts: notes,
      day: counter.value?.today ?? '',
      out,
      reconcile,
      lines: reconcile === 'lines' && split.ok ? split.lines : [],
    });
    /* A CURRENCY WITHOUT NOTES IS COUNTED BY ITS TOTAL ALONE. */
    if (!byNotes) delete fields.denominations;
    fields.counted = { amount: counted, currency };
    const wrote = await writeCount(base, into ?? '', fields);
    saving = false;
    if (wrote.ok) {
      step = 'done';
    } else {
      refused = wrote.fix;
    }
  }

  function again(): void {
    counts = {};
    typedTotal = '';
    lines = [{ what: '', amount: '', category: '' }];
    reconcile = 'discrepancy';
    step = 'count';
    void counter.reread();
  }

  const signed = (minor: number): string => `${minor > 0 ? '+' : '−'}${say(Math.abs(minor))}`;
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="money" title={words.title} kicker="Money" back={at('/p/money', page.url.pathname)} />
<div class="cc-page">
  {#if !ready && installed && into === null}
    <Empty kind="no-data-yet" glyph="money" title={words.bare} body={words.bareBody}>
      {#snippet actions()}<Button href={at('/p/money', page.url.pathname)}>{words.toMoney}</Button>{/snippet}
    </Empty>
  {:else if !ready}
    <Empty kind="no-data-yet" glyph="money" title={words.notSetUp} body={words.notSetUpBody}>
      {#snippet actions()}<Button href={at('/addons/count-cash?kind=pack', page.url.pathname)}>{words.addOn}</Button>{/snippet}
    </Empty>
  {:else if counter.state === 'waiting' || counter.state === 'refused' || counter.state === 'offline'}
    <ReadState state={counter.state} refusal={counter.refusal} onretry={counter.reread} />
  {:else if !account}
    <Empty kind="no-data-yet" glyph="money" title={words.noCash} body={words.noCashBody}>
      {#snippet actions()}<Button href={at('/p/money-accounts', page.url.pathname)}>{words.toAccounts}</Button>{/snippet}
    </Empty>
  {:else if step === 'done'}
    <!-- A COUNT SAVED RISES INTO PLACE (design pass, 1 Nov): the one rare, finished moment on this screen, where the
         counter itself swapped for two lines with nothing between. `arrive` is still in a screen's first second and a
         fade under reduced motion. -->
    <div class="cc-done" role="status" in:arrive>
      <h2>{words.saved}</h2>
      <p>{words.savedBody}</p>
      <div class="cc-actions">
        <Button weight="primary" onclick={again}>{words.again}</Button>
        <Button href={at('/p/money', page.url.pathname)}>{words.toMoney}</Button>
      </div>
    </div>
  {:else}
    <div class="cc-board">
      <div class="cc-work">
        {#if step === 'count'}
          {#if accounts.length > 1}
            <Segmented role="group" aria-label={words.account} class="cc-accounts" full>
              {#each accounts as a (a.seq)}
                <button type="button" class="segment" data-on={a.seq === account.seq ? '' : undefined} aria-pressed={a.seq === account.seq} onclick={() => pick(a.seq)}>
                  {a.name} <span class="cc-cur">{a.currency}</span>
                </button>
              {/each}
            </Segmented>
          {:else}
            <p class="cc-one"><strong>{account.name}</strong> <span class="cc-cur">{account.currency}</span></p>
          {/if}

          {#if byNotes}
            <h2 class="cc-label">{words.notes}</h2>
            <ul class="cc-notes">
              {#each set as face (face)}
                {@const n = counts[face] ?? 0}
                <li class="cc-note" data-has={n > 0 ? '' : undefined}>
                  <span class="cc-face">{faceMoney(face)}</span>
                  <span class="cc-line-total">{n > 0 ? say(n * Math.round(Number(face) * 100)) : ''}</span>
                  <span class="cc-stepper">
                    <button type="button" class="cc-step" aria-label={words.reduce(faceMoney(face))} disabled={n === 0} onclick={() => setCount(face, stepped(n, -1))}>−</button>
                    <input
                      class="cc-n"
                      inputmode="numeric"
                      autocomplete="off"
                      aria-label={words.count(faceMoney(face))}
                      value={n}
                      onfocus={(e) => e.currentTarget.select()}
                      oninput={(e) => setCount(face, typedCount(e.currentTarget.value))}
                    />
                    <button type="button" class="cc-step" aria-label={words.add(faceMoney(face))} onclick={() => setCount(face, stepped(n, 1))}>+</button>
                  </span>
                </li>
              {/each}
            </ul>
          {:else}
            <label class="cc-label" for="cc-total">{words.totalOnly}</label>
            <input id="cc-total" class="cc-box" inputmode="decimal" autocomplete="off" bind:value={typedTotal} />
            <p class="cc-help">{words.totalHelp}</p>
          {/if}
        {:else}
          <h2 class="cc-label">{words.how}</h2>
          <p class="cc-miss">
            {words.out}
            <strong class="cc-figure" data-way={difference > 0 ? 'in' : 'out'}>{signed(difference)}</strong>
          </p>
          <Segmented role="group" aria-label={words.how} full>
            <button type="button" class="segment" data-on={reconcile === 'lines' ? '' : undefined} aria-pressed={reconcile === 'lines'} onclick={() => (reconcile = 'lines')}>{words.asLines}</button>
            <button type="button" class="segment" data-on={reconcile === 'discrepancy' ? '' : undefined} aria-pressed={reconcile === 'discrepancy'} onclick={() => (reconcile = 'discrepancy')}>{words.asDiscrepancy}</button>
          </Segmented>
          {#if reconcile === 'lines'}
            <p class="cc-help">{words.linesHelp}</p>
            <ul class="cc-lines">
              {#each lines as line, i (i)}
                <li class="cc-one-line">
                  <input class="cc-box" placeholder={words.what} aria-label={words.what} bind:value={line.what} />
                  <input class="cc-box cc-amt" inputmode="decimal" placeholder={words.amount} aria-label={words.amount} bind:value={line.amount} />
                  <input class="cc-box" list="cc-cats" placeholder={words.category} aria-label={words.category} bind:value={line.category} />
                </li>
              {/each}
            </ul>
            <datalist id="cc-cats">
              {#each counter.value?.categories ?? [] as c (c)}<option value={c}></option>{/each}
            </datalist>
            <div class="cc-actions">
              <Button onclick={() => (lines = [...lines, { what: '', amount: '', category: '' }])}>{words.addLine}</Button>
            </div>
            {#if split.ok}
              <p class="cc-help">{words.left}: <strong>{say(split.rest)}</strong></p>
            {/if}
          {:else}
            <p class="cc-help">{words.discrepancyHelp}</p>
          {/if}
        {/if}
      </div>

      <aside class="cc-sum" aria-label={words.total}>
        <dl>
          <div class="big">
            <dt>{words.total}</dt>
            <dd>{say(counted)}</dd>
          </div>
          {#if expected !== null}
            <div>
              <dt>{words.expected}</dt>
              <dd>{say(expected)}</dd>
            </div>
            <div>
              <dt>{words.out}</dt>
              <dd class:late={out && difference < 0} class:in={out && difference > 0}>
                {#if out}{signed(difference)}{:else}{words.agrees}{/if}
              </dd>
            </div>
          {/if}
        </dl>
        {#if account.typed && expected !== null}<p class="cc-help">{words.typedBalance}</p>{/if}
        {#if out}<p class="cc-help">{difference > 0 ? words.more : words.less}</p>{/if}
        {#if refused}<p class="cc-refused" role="alert">{refused}</p>{/if}
        <div class="cc-actions">
          {#if step === 'count'}
            <Button weight="primary" disabled={saving} onclick={next}>{out ? words.next : words.save}</Button>
          {:else}
            <Button onclick={() => (step = 'count')}>{words.back}</Button>
            <Button weight="primary" disabled={saving} onclick={save}>{saving ? words.saving : words.save}</Button>
          {/if}
        </div>
      </aside>
    </div>
  {/if}
</div>

<style>
  .cc-page {
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .cc-board {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: start;
  }

  .cc-work {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .cc-label {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .cc-one {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .cc-cur {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .cc-help {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* ONE ROW A NOTE: its face, what that many come to, and the stepper at the end. */
  .cc-notes,
  .cc-lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .cc-note {
    display: grid;
    grid-template-columns: 6ch minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: 56px;
    border-block-end: 1px solid var(--rule);
  }

  .cc-face {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .cc-line-total {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .cc-note[data-has] .cc-line-total {
    color: var(--ink-2);
  }

  .cc-stepper {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .cc-step {
    inline-size: 44px;
    block-size: 44px;
    border: 0;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-figure);
    line-height: 1;
    cursor: pointer;
  }

  .cc-step:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  /* A PRESS IS A FILL CHANGE, NOTHING SCALES (Look B): the stepper is tapped tens of times a count, so the answer is
     the darker fill for the press's own 70ms and no more. */
  @media (hover: hover) and (pointer: fine) {
    .cc-step:not(:disabled):hover {
      background: color-mix(in oklab, var(--tile-2) 94%, var(--ink));
    }
  }

  .cc-step:not(:disabled):active {
    background: color-mix(in oklab, var(--tile-2) 88%, var(--ink));
    transition: background-color var(--d-press, 70ms) ease-out;
  }

  .cc-step:focus-visible,
  .cc-n:focus-visible,
  .cc-box:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .cc-n {
    inline-size: 6ch;
    block-size: 44px;
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .cc-box {
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

  .cc-one-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-2);
    padding-block: var(--sp-3);
    border-block-end: 1px solid var(--rule);
  }

  .cc-lines {
    gap: 0;
  }

  /* THE TOTAL STAYS IN SIGHT: along the foot of a phone, at the side of a desk. */
  .cc-sum {
    position: sticky;
    inset-block-end: 0;
    z-index: var(--z-raise);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-4);
    /* A TILE, NOT A BOXED CARD (design pass, 1 Nov): no edge round it, its fill alone off the board. */
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .cc-sum dl {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-5);
    margin: 0;
  }

  .cc-sum dl > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cc-sum dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .cc-sum dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .cc-sum .big dd {
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    letter-spacing: -0.02em;
  }

  .cc-sum dd.late {
    color: var(--red);
  }

  .cc-sum dd.in {
    color: var(--good);
  }

  .cc-miss {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink-2);
  }

  .cc-figure[data-way='out'] {
    color: var(--red);
  }

  .cc-figure[data-way='in'] {
    color: var(--good);
  }

  .cc-refused {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .cc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .cc-done {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-inline-size: 36rem;
  }

  .cc-done h2,
  .cc-done p {
    margin: 0;
  }

  .cc-done p {
    color: var(--ink-2);
  }

  /* A PHONE AT 320 HAS NO ROOM FOR WHAT EACH NOTE COMES TO beside its stepper. */
  @media (width < 360px) {
    .cc-line-total {
      display: none;
    }
  }

  @media (width >= 900px) {
    .cc-board {
      grid-template-columns: minmax(0, 1fr) 22rem;
      gap: var(--sp-7);
    }

    .cc-sum {
      inset-block-start: var(--sp-5);
      inset-block-end: auto;
    }

    .cc-sum dl {
      flex-direction: column;
    }

    /* THE COUNT IS THE PAGE'S ONE BIG NUMBER on a desk, where the tile has the room for it. */
    .cc-sum .big dd {
      font-size: var(--fs-hero);
      line-height: 1.1;
    }

    .cc-one-line {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.4fr);
    }
  }
</style>
