<!--
  A saved view: `/v/obligations.overdue`.

  The up half of the two-altitude ladder. Filter a register, press ⌥V, and the filter becomes a
  NAMED PREDICATE on the register's own declaration — a first-class object with an owner and a share
  link, in one keystroke, because THE URL IS THE SERIALISATION. There is no "save this search"
  dialog and nothing to publish (19 §1).

  `order` stays URL state and is not part of the saved object: what you are looking at is the
  predicate; how it is sorted is how you happen to be looking at it today.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { page } from '$app/state';
  import { CapLine, Table } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { DOM_CAP, VIEWS, iconFor, REGISTERS, columnsFor, display, labelOf, list, toRows, whereOf, type Filter } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import RowCards from '$lib/ui/RowCards.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES } from '$lib/record/data.ts';
  import { drew } from '../../../lib/ui/screen.svelte.ts';

  /**
   * A register's named predicate, never a free-form slug.
   *
   * THE SENTENCE IS DERIVED, NOT TYPED. It used to be a `says:` string beside the filters, and the
   * two disagreed: Overdue printed "state is open or part, and due is before today" above a list
   * that only filtered on state, so 28 rows were drawn under the word Overdue and 24 of them were
   * not overdue — row four was due in four days. A printed predicate that is not the predicate is
   * worse than none, because it is checkable and wrong.
   */

  const key = $derived(page.params.view ?? '');
  const view = $derived(VIEWS[key]);
  const decl = $derived(view ? REGISTERS[view.register] : undefined);
  const columns = $derived(view ? columnsFor(view.register) : []);

  /**
   * THE REST OF THE URL, WHICH THIS ROUTE USED TO THROW AWAY WITHOUT SAYING SO.
   *
   * `/v/obligations.overdue?q=zzzzz` returned `4 of 38` — the same four rows as with no query at
   * all — while `/r/obligations?q=zzzzz` correctly drew `no-results` with the term quoted. Same
   * record, same list, two behaviours, and this is the one in the rail on day one. A parameter read
   * by one surface and silently dropped by its twin is this build's signature failure: something
   * complete-looking that reports success and does nothing.
   *
   * `19 §1` says the saved view IS the predicate and the URL is its serialisation. So an extra
   * clause in the URL is a narrower question about the same list, and the answer is the narrower
   * list — ANDed on, never replacing, because the view's own predicate is what makes it that view.
   * The way back is the view's own address, which the state and the note both offer.
   */
  const q = $derived(page.url.searchParams.get('q') ?? '');
  const extra = $derived.by((): Filter[] =>
    page.url.searchParams.getAll('f').map((raw) => {
      const [field = '', op = 'is', values = ''] = raw.split(':');
      return { field, op, values: values.split(',') };
    }),
  );
  const narrowed = $derived(Boolean(q) || extra.length > 0);

  /**
   * THE FILTER IN THE LIST'S OWN WORDS. `copy.filterClause` says why the reading line stopped being
   * the `where` sentence; this is the half that knows the register, so a field is called what its
   * column is called and an enum value is written the way its cell writes it. A date clause keeps
   * its value as typed, because `today` is already a word and `display` would read it as a day.
   */
  const readable = (filters: Filter[]): string =>
    copy.filterReads(
      filters.map((f) => {
        const field = decl?.fields.find((d) => d.id === f.field);
        const dated = f.op === 'before' || f.op === 'after';
        const values = dated || !view ? f.values : f.values.map((v) => display(view.register, f.field, v) ?? v);
        return copy.filterClause(field ? labelOf(field) : f.field, values, f.op);
      }),
    );

  const result = $derived(
    view
      ? list(view.register, { filters: [...view.filters, ...extra], ...(q ? { q } : {}) })
      : { entries: [], total: 0, matched: 0 },
  );
  /* THE SAME CAP THE REGISTER APPLIES, because this is the same list with a different filter — and
     it is the surface `13 §4.3` sends you to when a register gets big, so it was the one place a
     five-thousand-row answer was rendered whole. `Table` draws the line that says so. */
  const shown = $derived(result.entries.slice(0, DOM_CAP));
  const rows = $derived(view ? toRows(view.register, shown, columns) : []);

  let focus = $state({ row: 0, col: 1 });
  let binding = $state(false);

  /* `⌥B`, which 50 §5.2 step 9 has specified all along and nothing bound. */
  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    if (typing()) return;
    if (e.altKey && e.key.toLowerCase() === 'b' && view) {
      e.preventDefault();
      binding = true;
      return;
    }
    /* AND `o`, which does what `Open {register}` in the header does, as the same key does one
       route over on `/p/<slug>`. The button no longer prints the key; the `?` sheet lists it.

       `silenced` FIRST, because `o` is a bare letter and `Character keys: off` is what makes the
       whole bare namespace legal (19 §4). */
    if (silenced(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o' && view) {
      e.preventDefault();
      void goto(`/r/${view.register}`);
    }
  }

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(view?.name, 'View')}</title></svelte:head>

<svelte:window {onkeydown} />

{#if !view || !decl}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty
      kind="error"
      heading
      title={copy.noSuch('saved view', key)}
      body={copy.theseExist('Saved views', Object.values(VIEWS).map((v) => v.name))}
    >
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(decl.icon, 'rows')} kicker="{decl.name} · saved view" title={view.name} count={result.matched} total={result.total}>
    {#snippet actions()}
      <Button weight="bare" href="/r/{view.register}"><Icon name="external" size="s" />Open {decl.name}</Button>
      <!-- `BindBlock`'s own file header opens "THIS IS THE WHOLE WIZARD", which is what `13 §10`
           means by a page builder. It opened and worked on a phone. -->
      <span class="bind-slot">
        <Button weight="quiet" onclick={() => (binding = true)}>{copy.bindBlock}</Button>
      </span>
    {/snippet}
  </PageHead>

  <BindBlock
    bind:open={binding}
    register={view.register}
    predicate={view.name}
    says={whereOf(view.filters)}
    onbind={(target, kind) =>
      toasts.push(copy.bound(copy.kindNames[kind] ?? kind, PAGES[target]?.title ?? target), { intent: 'warn' })}
  />

  <div class="page">
    <p class="predicate">
      <span class="predicate-label">Filter</span>
      <span class="predicate-said">{readable([...view.filters, ...extra])}</span>
      {#if q}<span class="predicate-q">{copy.matching} <code>{q}</code></span>{/if}
      {#if narrowed}
        <Button weight="bare" href="/v/{key}"><Icon name="close" size="s" />{copy.backToView}</Button>
      {/if}
    </p>

    <!--
      THE FIVE STATES, WHICH THIS ROUTE HAD NONE OF.

      Its only `<Empty>` was the 404. At zero matching rows it drew a header, a `0`, the filter chip,
      a bare column-header row and about 1,200px of blank canvas — on the surface `19 §1` calls the
      up half of the two-altitude ladder, and the one thing in the rail under Obligations on day one.

      TWO DIFFERENT NOTHINGS, and this is the whole of `19 §6`'s argument. A list nobody has typed
      into yet is `no-data-yet` and the thing to do is add a row; a predicate that matched none of
      thirty-eight is `no-results` and the thing to do is widen it. The register next door has said
      both correctly for months, so the sentences come from the same place.
    -->
    {#if result.entries.length === 0}
      <Empty
        kind={result.total === 0 ? 'no-data-yet' : 'no-results'}
        title={result.total === 0
          ? copy.nothingIn(decl.name)
          : copy.noneMatching(result.total, copy.rowsWord(result.total))}
        query={result.total === 0 ? undefined : [q, whereOf([...view.filters, ...extra])].filter(Boolean).join(' · ')}
        body={result.total === 0 && decl.holds ? `${decl.name} holds ${decl.holds}.` : undefined}
      >
        {#snippet actions()}
          {#if result.total === 0}
            <Button weight="primary" href="/r/{view.register}?new=1">{copy.addOne}</Button>
          {:else if narrowed}
            <Button href="/v/{key}">{copy.backToView}</Button>
          {:else}
            <Button href="/r/{view.register}">{copy.openUnfiltered(decl.name)}</Button>
          {/if}
        {/snippet}
      </Empty>
    {/if}

    <!-- ONE BODY AT A TIME, in the document and not only in the stylesheet — the register's own
         measurement: both bodies were built at every width and one was hidden, so a list of 2,614
         rows held 4,001 rows and 102,681 nodes and took eight seconds to settle. -->
    {#if result.entries.length > 0 && rowsAsCards()}
      <RowCards register={view.register} entries={shown} />
    {:else}
    <div class="table-slot" class:gone={result.entries.length === 0}>
      <Table
        {columns}
        {rows}
        total={result.matched}
        cap={DOM_CAP}
        label={view.name}
        bind:focus
        onactivate={(row) => goto(`/r/${view.register}/${row.key.split('#')[1]}`)}
      />
    </div>
    {/if}

    <!--
      ONE CAP LINE, FOR WHICHEVER BODY IS DRAWING.

      There were two on a phone: the cards branch drew one UNCONDITIONALLY and this one drew a second
      at the cap, so at 2,000 rows on a narrow screen the same sentence appeared twice. The card one
      also carried `shown.length` where this carries `DOM_CAP`, so the two could print different
      numbers.

      And the comment that used to sit here justified itself with *"`Table` used to draw it from
      `aria-rowcount`, which is `-1` while a filtered list pages"* — true of the register, and this
      route does not page at all and passes `result.matched`, never `-1`. It was the register's
      reason, copied onto a screen it is not about.
    -->
    {#if shown.length >= DOM_CAP}
      <CapLine shown={shown.length} total={result.matched} />
    {/if}
  </div>
{/if}

<style>
  /* ONE BODY AT A TIME, and an empty state is a body. The table draws its own header row whatever
     it holds, so leaving it under the empty state gave a column strip standing over the sentence
     saying there was nothing to put in it. */
  .table-slot.gone,
  .gone :global(.cards) {
    display: none;
  }

  .predicate-q {
    color: var(--dim);
  }

  /* Authoring is a desktop surface (13 §10). */
  @media (width < 900px) {
    .bind-slot {
      display: none;
    }
  }

  /* One body at a time, and this is the other half of `RowCards`' own rule. */
  @media (width < 640px) {
    .table-slot {
      display: none;
    }
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
  }

  /* IT WRAPS, because the filter is a sentence now and a sentence is longer than the chip was. */
  .predicate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* THE BODY FACE AND NO CHIP. It was `<code>` on `--sunk` in `--font-id`: a query, set in the face
     this product keeps for ids, over a list a person came to read. The chip below is still right
     for `q`, which is text somebody typed and is quoted as typed. */
  .predicate-said {
    color: var(--ink2);
    font-size: var(--t-sm);
  }


  .predicate code {
    padding: 2px var(--sp-2);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-family: var(--font-id);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
