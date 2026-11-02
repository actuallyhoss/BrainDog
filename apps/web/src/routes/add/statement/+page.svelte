<!--
  `/add/statement`: Import a statement. One account, one CSV, its columns, a preview, and one press that adds the lines.

  THE FIRST RUN'S "POINT AT AN EXPORT" MAPPER, ANY DAY AFTER. The file is read and its cells are read by the mapper in
  `lib/start/export.ts`; `lib/money/statement.ts` says which column is the date, the description, the amount (or money
  out and money in) and the balance, and turns each line into a Ledger line in the account's own currency.

  NOTHING IS WRITTEN UNTIL THE ONE PRESS. The preview marks every line the account's Ledger already holds (the same
  amount going the same way, a day apart at most, the same first words), and the press adds only the rest.

  `?account=` is the account's number, which is how an account's page opens it already chosen. Money's ⋯ menu and the
  command palette open it with none, and the first account is chosen.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase, at } from '$lib/at.ts';
  import { dayShort } from 'braindog-render';
  import Money from '$lib/ui/Money.svelte';
  import { read, type Result } from '$lib/data/read.svelte.ts';
  import { BYTES_MOST, type Export } from '$lib/start/export.ts';
  import { balancesOf, freshOf, guessRoles, linesOf, readStatement, rolesMissing, fieldsOf, ROLES, signSaid, words, type Held, type Roles, type Sign } from '$lib/money/statement.ts';
  import { addLines, fillBalances, heldFor, loadStatement, type Added, type Into, type Loaded } from '$lib/money/statement-live.ts';
  import { fileLines, filedOnArrival, filingWords, loadCategories, suggestCategory, type Offered } from '$lib/money/filing.ts';
  import { arrive } from '$lib/motion/index.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import { titleOf } from '$lib/title.ts';
  import ReadState from '$lib/ui/ReadState.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';

  const base = $derived(apiBase(page.url));
  const lists = $derived((page.data as { lists?: { id: string; kernel?: true }[] } | undefined)?.lists ?? []);
  const locale = $derived((page.data as { index?: { locale?: string } } | undefined)?.index?.locale ?? 'en');
  const home = $derived(at('/p/money', page.url.pathname));

  const loader = read(() => (lists.length === 0 ? null : `${base} ${lists.length}`), async (): Promise<Result<Loaded>> => {
    const got = await loadStatement(base, lists);
    return got.ok ? { ok: true, value: got.value } : { ok: false, refusal: { code: 'UNREACHABLE', fix: got.fix } };
  });

  const accounts = $derived(loader.value?.accounts ?? []);
  /* AN ACCOUNT'S CURRENCY IS SAID ONLY WHERE THE ACCOUNTS HOLD MORE THAN ONE, and then by its name: the picker read
     "Company card GBP", a bank code beside every account of one currency (audit of 31 October, A20). */
  const manyCurrencies = $derived(new Set(accounts.map((a) => a.currency)).size > 1);
  const currencyName = (code: string): string => {
    try {
      return new Intl.DisplayNames('en', { type: 'currency', fallback: 'none' }).of(code) ?? '';
    } catch {
      return '';
    }
  };
  const wanted = $derived(Number(page.url.searchParams.get('account') ?? ''));
  let chosen = $state<number | null>(null);
  const account = $derived<Into | null>(accounts.find((a) => a.seq === (chosen ?? wanted)) ?? accounts[0] ?? null);

  /* ── the file ── */
  let exp = $state.raw<Export | null>(null);
  let pasted = $state('');
  let why = $state<string | null>(null);
  let dragging = $state(false);
  let roles = $state<Roles>({ day: null, what: null, amount: null, out: null, in: null, balance: null });
  let sign = $state<Sign>('minus-out');
  const two = $derived(roles.out !== null || roles.in !== null);
  /* THE FILE'S OWN SIGNS ANSWER THE QUESTION WHERE THEY CAN (`signSaid`); asked only where they do not, or on "Not right?". */
  const said = $derived(exp ? signSaid(exp, roles) : null);
  let askSign = $state(false);
  $effect(() => {
    if (said !== null && !askSign) sign = said;
  });

  function take(name: string, text: string): void {
    const got = readStatement(name, text);
    if ('why' in got) {
      why = got.why;
      return;
    }
    why = null;
    exp = got;
    roles = guessRoles(got, locale);
    sign = 'minus-out';
    askSign = false;
    result = null;
  }

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    if (file.size > BYTES_MOST) {
      why = `That file is more than ${BYTES_MOST / (1024 * 1024)} MB.`;
      return;
    }
    take(file.name, await file.text());
  }

  function ondrop(e: DragEvent): void {
    e.preventDefault();
    dragging = false;
    void pick(e.dataTransfer?.files?.[0]);
  }

  function again(): void {
    exp = null;
    pasted = '';
    why = null;
    result = null;
  }

  function setTwo(on: boolean): void {
    roles = on ? { ...roles, out: roles.amount, in: null, amount: null } : { ...roles, amount: roles.out ?? roles.in, out: null, in: null };
  }

  /* ── the lines, and the ones the Ledger holds ── */
  const reading = $derived(exp && account && rolesMissing(roles) === null ? linesOf(exp, roles, { currency: account.currency, locale, sign }) : null);
  const missing = $derived(exp ? rolesMissing(roles) : null);

  let held = $state.raw<Held[] | null>(null);
  let heldKey = $state('');
  let heldFailed = $state(false);
  $effect(() => {
    const l = loader.value?.ledger;
    const a = account;
    const lines = reading?.lines ?? [];
    if (!l || !a || lines.length === 0) return;
    const key = `${a.id} ${lines[0]?.day} ${lines.at(-1)?.day} ${lines.length}`;
    if (key === heldKey) return;
    heldKey = key;
    held = null;
    heldFailed = false;
    void heldFor(base, l, a.id, lines, loader.value?.balance ?? null).then((got) => {
      if (heldKey !== key) return;
      held = got ?? [];
      heldFailed = got === null;
    });
  });

  const split = $derived(reading && held !== null ? freshOf(reading.lines, held) : null);
  const already = $derived(new Set(split?.already.map((l) => l.at) ?? []));
  /* THE BALANCE A LINE ALREADY THERE NEVER SAID, written with the same press (`balancesOf`). */
  const fills = $derived(split ? balancesOf(split.matched, loader.value?.balance ?? null) : []);
  const SHOWN = 40;
  const shown = $derived(reading?.lines.slice(0, SHOWN) ?? []);

  /* ── the press ── */
  let adding = $state<{ done: number; of: number } | null>(null);
  let result = $state<(Added & { account: string; filled: number }) | null>(null);

  async function add(): Promise<void> {
    const l = loader.value;
    if (!l || !account || !split || (split.fresh.length === 0 && fills.length === 0) || adding) return;
    /* THE LINES AS PRESSED: the Ledger is read again after the write, which empties `split` for a moment. */
    const fresh = split.fresh;
    const rows = fresh.map((line) => fieldsOf(line, l.ledger, account.id, l.balance));
    const balances = fills;
    adding = { done: 0, of: rows.length };
    const out = await addLines(base, l.ledger.list, rows, (done) => (adding = { done, of: rows.length }));
    const filled = balances.length > 0 ? await fillBalances(base, l.ledger.list, balances) : 0;
    adding = null;
    result = { ...out, account: account.name, filled };
    heldKey = '';
    /* THE LINES JUST ADDED, EACH OFFERED A CATEGORY BY ITS PAYEE (`filing.ts`), filed only on the one press. */
    offered = null;
    filed = null;
    const cats = await loadCategories(base, l.ledger);
    if (cats === null) return;
    const lines = fresh;
    /* A LINE THE KEPT CHOICES FILED AS IT LANDED (`keepAsRules` in `filing.ts`) is not offered again, and is said. */
    const self = await filedOnArrival(base, l.ledger, (out.seqs ?? []).flatMap((s) => (s === null ? [] : [s])));
    const offers: Offered[] = [];
    let unfiled = 0;
    lines.forEach((line, i) => {
      const seq = out.seqs?.[i] ?? null;
      if (seq === null || self.has(seq)) return;
      const c = suggestCategory(line.what, line.way, cats);
      if (c === null) unfiled++;
      else offers.push({ seq, what: line.what, category: c, way: line.way });
    });
    offered = { offers, unfiled, self: self.size };
  }

  let offered = $state.raw<{ offers: Offered[]; unfiled: number; self: number } | null>(null);
  let filing = $state(false);
  let filed = $state<{ filed: number; rules: number } | null>(null);
  async function fileAll(): Promise<void> {
    const l = loader.value;
    if (!l || !offered || filing) return;
    filing = true;
    filed = await fileLines(base, l.ledger, offered.offers);
    filing = false;
  }

  const sample = (column: string | null): string => (column && exp ? (exp.entries.find((e) => (e[column] ?? '').trim() !== '')?.[column] ?? '') : '');
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="upload" title={words.title} sentence={words.sentence} kicker="Money" back={home} />
<div class="st-page">
  {#if loader.state === 'waiting' || loader.state === 'refused' || loader.state === 'offline'}
    <ReadState state={loader.state} refusal={loader.refusal} onretry={loader.reread} />
  {:else if !account}
    <Empty kind="no-data-yet" glyph="money" title={words.noAccounts} body={words.noAccountsWhy}>
      {#snippet actions()}<Button weight="primary" href={home}>{words.addAccount}</Button>{/snippet}
    </Empty>
  {:else if result}
    <div class="st-done" role="status" in:arrive={{ rise: 4, from: 1 }}>
      <h2>{result.added === 0 && result.filled > 0 ? words.filled(result.filled) : words.added(result.added, result.account)}</h2>
      {#if result.added > 0 && result.filled > 0}<p class="st-quiet">{words.filled(result.filled)}</p>{/if}
      {#if result.missed > 0}<p class="st-warn">{words.missed(result.missed)} {result.why}</p>{/if}
      {#if offered && offered.self > 0}<p class="st-quiet">{filingWords.self(offered.self)}</p>{/if}
      {#if offered && offered.offers.length > 0}
        <section class="st-filing" aria-labelledby="st-file-h" in:arrive={{ rise: 4, from: 1 }}>
          {#if filed === null}
            <h3 class="st-label" id="st-file-h">{filingWords.title(offered.offers.length)}</h3>
            <p class="st-quiet">{filingWords.sentence} {filingWords.next}</p>
            <ul class="st-file-list">
              {#each offered.offers as o (o.seq)}<li><span>{o.what}</span><span class="st-quiet">{o.category.name}{o.category.id === '' ? `, ${filingWords.fresh}` : ''}</span></li>{/each}
            </ul>
            <Button weight="primary" onclick={fileAll} disabled={filing}>{filing ? filingWords.filing : filingWords.file(offered.offers.length)}</Button>
          {:else}
            <h3 class="st-label" id="st-file-h">{filingWords.filed(filed.filed)}</h3>
            {#if filed.rules > 0}<p class="st-quiet">{filingWords.kept}</p>{/if}
          {/if}
          {#if offered.unfiled > 0}<p class="st-quiet">{filingWords.left(offered.unfiled)}</p>{/if}
        </section>
      {:else if offered && offered.unfiled > 0}
        <p class="st-quiet">{filingWords.left(offered.unfiled)}</p>
      {/if}
      <div class="st-actions">
        <Button weight={offered && offered.offers.length > 0 && filed === null ? 'quiet' : 'primary'} onclick={again}>{words.again}</Button>
        <Button href={home}>Back to Money</Button>
      </div>
    </div>
  {:else}
    <section class="st-step" aria-labelledby="st-account">
      <h2 class="st-label" id="st-account">{words.account}</h2>
      {#if accounts.length > 1}
        <!-- ON A PHONE THE ACCOUNTS ARE A LIST, one to a row (verify4 #3, 2 Nov): three names in the segmented track
             wrapped two and one, the third alone under the others. A desk keeps the track. -->
        <div class="st-pick-track">
          <Segmented role="group" aria-labelledby="st-account" full>
            {#each accounts as a (a.seq)}
              <button type="button" class="segment" data-on={a.seq === account.seq ? '' : undefined} aria-pressed={a.seq === account.seq} onclick={() => (chosen = a.seq)}>
                {a.name}{#if manyCurrencies && currencyName(a.currency)}{' '}<span class="st-quiet">{currencyName(a.currency)}</span>{/if}
              </button>
            {/each}
          </Segmented>
        </div>
        <div class="st-pick-list" role="radiogroup" aria-labelledby="st-account">
          {#each accounts as a (a.seq)}
            <label class="st-pick tap" data-on={a.seq === account.seq ? '' : undefined}>
              <input type="radio" name="st-account" value={a.seq} checked={a.seq === account.seq} onchange={() => (chosen = a.seq)} />
              <span class="st-pick-name">{a.name}</span>
              {#if manyCurrencies && currencyName(a.currency)}<span class="st-quiet">{currencyName(a.currency)}</span>{/if}
            </label>
          {/each}
        </div>
      {:else}
        <p class="st-one"><strong>{account.name}</strong></p>
      {/if}
    </section>

    {#if exp === null}
      <section class="st-step" aria-labelledby="st-file">
        <h2 class="st-label" id="st-file">{words.file}</h2>
        <label
          class="st-drop"
          data-over={dragging ? '' : undefined}
          ondragover={(e) => {
            e.preventDefault();
            dragging = true;
          }}
          ondragleave={() => (dragging = false)}
          {ondrop}
        >
          <span>{words.drop}</span>
          <input class="st-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onchange={(e) => void pick(e.currentTarget.files?.[0])} />
        </label>
        <label class="st-label" for="st-paste">{words.paste}</label>
        <textarea id="st-paste" class="st-box st-paste" rows="5" placeholder={words.pasteHint} bind:value={pasted}></textarea>
        <div class="st-actions">
          <Button disabled={pasted.trim() === ''} onclick={() => take(words.pastedName, pasted)}>{words.read}</Button>
        </div>
        {#if why}<p class="st-warn" role="alert">{why}</p>{/if}
      </section>
    {:else}
      <!-- THE COLUMNS AND THE PREVIEW RISE INTO THE DROP ZONE'S PLACE (motion pass 2 Nov), so the swap reads as the file opening. -->
      <section class="st-step" aria-labelledby="st-columns" in:arrive={{ rise: 4, from: 1 }}>
        <div class="st-row">
          <h2 class="st-label" id="st-columns">{words.columns}{#if exp.file !== words.pastedName}{' '}<span class="st-quiet">{exp.file}</span>{/if}</h2>
          <Button weight="quiet" size="sm" onclick={again}>{words.other}</Button>
        </div>
        <label class="st-check"><input type="checkbox" checked={two} onchange={(e) => setTwo(e.currentTarget.checked)} /> {words.twoColumns}</label>
        <div class="st-map">
          {#each ROLES.filter((r) => (two ? r !== 'amount' : r !== 'out' && r !== 'in')) as r (r)}
            <label class="st-field">
              <span class="st-label">{words.roles[r]}</span>
              <select class="st-box" value={roles[r] ?? ''} onchange={(e) => (roles = { ...roles, [r]: e.currentTarget.value === '' ? null : e.currentTarget.value })}>
                <option value="">{words.none}</option>
                {#each exp.columns as c (c)}<option value={c}>{c}</option>{/each}
              </select>
              {#if roles[r]}<span class="st-quiet st-sample">{sample(roles[r])}</span>{/if}
            </label>
          {/each}
        </div>
        {#if !two && said !== null && !askSign}
          <p class="st-quiet st-sign-read">{words.signRead[said]} <Button weight="quiet" size="sm" onclick={() => (askSign = true)}>{words.signChange}</Button></p>
        {:else if !two}
          <span class="st-label" id="st-sign">{words.sign}</span>
          <Segmented role="group" aria-labelledby="st-sign">
            {#each ['minus-out', 'plus-out'] as const as s (s)}
              <button type="button" class="segment" data-on={sign === s ? '' : undefined} aria-pressed={sign === s} onclick={() => (sign = s)}>{words.signs[s]}</button>
            {/each}
          </Segmented>
        {/if}
        {#if missing}<p class="st-warn">{missing}</p>{/if}
      </section>

      {#if reading}
        <section class="st-step" aria-labelledby="st-preview">
          <h2 class="st-label" id="st-preview">{words.preview}</h2>
          <p class="st-sum" aria-live="polite">
            {#if split}
              <strong>{words.fresh(split.fresh.length)}</strong>{#if split.already.length > 0}<span class="st-quiet">{` · ${words.skipped(split.already.length)}`}</span>{/if}
            {:else}
              <span class="st-quiet">{words.checking}</span>
            {/if}
          </p>
          {#if reading.other > 0}<p class="st-quiet">{words.otherCurrency(reading.other)}</p>{/if}
          {#if reading.unread > 0}<p class="st-quiet">{words.unread(reading.unread)}</p>{/if}
          {#if heldFailed}<p class="st-warn">The Ledger could not be read, so no line is marked as already there.</p>{/if}
          <div class="st-table-wrap">
            <table class="st-table">
              <thead>
                <tr><th scope="col">{words.roles.day}</th><th scope="col">{words.roles.what}</th><th scope="col" class="st-num">{words.roles.amount}</th>{#if roles.balance}<th scope="col" class="st-num">{words.roles.balance}</th>{/if}</tr>
              </thead>
              <tbody>
                {#each shown as l (l.at)}
                  <tr data-already={already.has(l.at) ? '' : undefined}>
                    <td class="st-day">{dayShort(l.day)}</td>
                    <td class="st-what">{l.what}{#if already.has(l.at)}<span class="st-tag">{words.already}</span>{/if}</td>
                    <!-- IN THE MONEY EVERY OTHER SCREEN DRAWS (£2,400.00, not GBP 2,400.00), so the preview reads as the Ledger will. -->
                    <td class="st-num" data-way={l.way}>{l.way === 'in' ? '+' : '−'}<Money minor={l.amount} currency={account.currency} home={account.currency} /></td>
                    {#if roles.balance}<td class="st-num st-quiet">{#if l.balance !== null}<Money minor={l.balance} currency={account.currency} home={account.currency} />{/if}</td>{/if}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if reading.lines.length > SHOWN}<p class="st-quiet">{words.more(reading.lines.length - SHOWN)}</p>{/if}
          <div class="st-actions">
            {#if split && split.fresh.length === 0 && fills.length === 0}
              <p class="st-quiet">{words.nothingNew}</p>
            {:else if split && split.fresh.length === 0}
              <Button weight="primary" disabled={adding !== null} onclick={() => void add()}>{words.fill(fills.length)}</Button>
            {:else}
              <Button weight="primary" disabled={!split || adding !== null} onclick={() => void add()}>
                {adding ? words.adding(adding.done, adding.of) : words.add(split?.fresh.length ?? 0)}
              </Button>
            {/if}
          </div>
        </section>
      {/if}
    {/if}
  {/if}
</div>

<style>
  /* THE ACCOUNT PICK: the segmented track on a desk, a list of rows on a phone (one name a row, hairlines between). */
  .st-pick-list {
    display: none;
  }
  @media (max-width: 639px) {
    .st-pick-track {
      display: none;
    }
    .st-pick-list {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--rule-strong);
      border-radius: 12px;
      background: var(--tile);
      overflow: hidden;
    }
  }
  .st-pick {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 48px;
    padding-inline: var(--sp-4);
    color: var(--ink);
    cursor: pointer;
  }
  .st-pick + .st-pick {
    border-block-start: 1px solid var(--rule);
  }
  .st-pick[data-on] {
    background: var(--chosen);
  }
  .st-pick input {
    margin: 0;
    accent-color: var(--on);
    inline-size: 18px;
    block-size: 18px;
    flex: none;
  }
  .st-pick-name {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .st-page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .st-step {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .st-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }

  .st-label {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .st-filing {
    display: grid;
    gap: var(--sp-2);
    justify-items: start;
    margin-block: var(--sp-3);
  }
  .st-file-list {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    inline-size: 100%;
    max-inline-size: 480px;
  }
  .st-file-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .st-quiet {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
  }

  p.st-quiet,
  .st-one,
  .st-sum {
    margin: 0;
  }

  .st-one,
  .st-sum {
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .st-warn {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* THE DROP: the whole box takes a file, dropped or chosen, at a thumb's height at least. */
  .st-drop {
    position: relative;
    display: grid;
    place-items: center;
    min-block-size: 120px;
    padding: var(--sp-5);
    border: 1px dashed var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-align: center;
    cursor: pointer;
  }

  .st-drop[data-over] {
    border-color: var(--focus);
    background: var(--tile-2);
  }

  .st-drop:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .st-file {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .st-box {
    inline-size: 100%;
    min-block-size: 44px;
    padding-inline: var(--sp-3);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .st-box:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }

  .st-paste {
    padding-block: var(--sp-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    resize: vertical;
  }

  .st-check {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
  }

  /* UNDER A THUMB THE WHOLE LINE IS THE BOX'S 44PX TARGET (design pass 2 Nov): the box alone was 20. */
  @media (pointer: coarse) {
    .st-check {
      min-block-size: var(--tap);
    }
  }

  /* EACH COLUMN'S CHOICE, two to a line on a wide screen, with the first value it holds under it. */
  .st-map {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
    gap: var(--sp-3) var(--sp-4);
  }

  .st-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .st-sample {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ON A TILE, NOT IN A BOX (Look B: no border round a tile). */
  .st-table-wrap {
    overflow-x: auto;
    border-radius: var(--r-tile);
    background: var(--tile);
  }

  .st-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--fs-body);
  }

  .st-table th {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-align: start;
  }

  .st-table td {
    padding: var(--sp-2) var(--sp-3);
    border-block-end: 1px solid var(--rule);
    color: var(--ink);
    vertical-align: baseline;
  }

  .st-table tr:last-child td {
    border-block-end: 0;
  }

  .st-table tr[data-already] td {
    color: var(--ink-3);
  }

  .st-day {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .st-what {
    overflow-wrap: anywhere;
  }

  .st-table .st-num {
    text-align: end;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .st-table td[data-way='in'] {
    color: var(--good);
  }

  .st-tag {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .st-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .st-done {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-inline-size: 36rem;
  }

  .st-done h2 {
    margin: 0;
  }
</style>
