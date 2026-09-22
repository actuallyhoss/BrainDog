<!--
  A saved view: `/v/obligations.overdue`.

  The up half of the two-altitude ladder. Filter a register, press ⌥V, and the filter becomes a
  NAMED PREDICATE held against that register on the record: a row of its own with an owner and a
  share link, in one keystroke, because THE URL IS THE SERIALISATION. There is no "save this
  search" dialog and nothing to publish (19 §1).

  `order` stays URL state on the sample and is part of the saved object on a record: `saveView`
  stores the sort somebody was looking at, so a live view reopens the way it was left.

  IT DREW THE SAMPLE'S TWO VIEWS ON EVERY RECORD, and it was the last data screen left that way.
  `VIEWS` at `data.ts:833` is a fictional studio's pair, and the key a person opens is matched
  against that object alone: no `createClient`, no `*-live` import, so `/v/services.lapsing` on a
  real record drew a filter somebody else wrote over rows from a register this record may not even
  declare. `views-live.ts` is the live half, built on the record's own `view` table, and the sample
  stays exactly where it was: the answer when there is no record to ask.

  AND THERE IS NO `+page.ts` IN FRONT OF IT ANY MORE, which is why any of the above runs in a
  browser. `88572488` put one here holding `redirect(307, viewMovedTo(...))`, so on a live record
  every `/v/<key>` was answered before this file loaded and the live half was exercised only by
  `views-live.test.ts`. Sixteen green tests over a module the product could not reach.

  THE REDIRECT WAS NOT A CONVERGENCE, AND THAT IS WHAT SETTLED IT. A view and a page are still two
  stores: the kernel has a `view` table (`migrations/0007_view.ts`, `VIEW_SELECT`) with `views`,
  `view`, `saveView` and `retireView` routed on the record, and `rows-write.ts` separately writes a
  view as a page declaration, which is what `⌥V` calls and why it lands on `/p/<slug>`. The redirect
  could not bridge them even in principle: `viewMovedTo` maps a key to `/p/<key>` unchanged, a view
  key is `<register>.<id>` and a view page's slug is `<register>-<base36 of Date.now()>`, so the two
  shapes never coincide and every key this route could be handed on a record landed on a page that
  cannot exist. `/p/[slug]` then said "There is no page called services.lapsing" and listed the
  record's pages: the wrong question, answered confidently, which is the thing this product must
  not do.

  What the redirect was for was the sample's fictional views appearing on a real record, and that is
  what `viewReader` now prevents by asking: `from: 'sample'` comes back for `UNREACHABLE` and
  `UNAUTHORIZED` alone. A record that holds no view of that key gets its own sentence and its own
  addresses. `views.ts` still exports `viewMovedTo` with nobody left to call it.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { page } from '$app/state';
  import { CapLine, Table } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { DOM_CAP, NOW, VIEWS, iconFor, REGISTERS, columnsFor, seqWidth, display, labelOf, list, toRows, whereOf, type Filter } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import RowCards from '$lib/ui/RowCards.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { PAGES } from '$lib/record/data.ts';
  import { keptColumns, viewReader, type ViewReader, type Viewed } from '$lib/record/views-live.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  /**
   * A register's named predicate, never a free-form slug.
   *
   * THE SENTENCE IS DERIVED, NOT TYPED. It used to be a `says:` string beside the filters, and the
   * two disagreed: Overdue printed "state is open or part, and due is before today" above a list
   * that only filtered on state, so 28 rows were drawn under the word Overdue and 24 of them were
   * not overdue — row four was due in four days. A printed predicate that is not the predicate is
   * worse than none, because it is checkable and wrong.
   *
   * WHICH IS WHY A LIVE VIEW MAY PRINT NO SENTENCE AT ALL. The record holds the predicate as a
   * tree, and `clausesOf` turns back into chips only the shapes these chips can say. An `any`
   * group, a hop through `via` or a `contains` leaf comes back `null`, and the Filter line is then
   * absent rather than short by a clause.
   */

  const key = $derived(page.params.view ?? '');

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
   * THE RECORD'S ANSWER, AND THE SAMPLE ONLY WHERE THERE IS NO RECORD.
   *
   * One read per address, bracketed by `opened()` and `closed()`, so `data-screen` is away while it
   * is out. The whole URL goes into the read: an extra clause is a narrower question about the same
   * view, so it is ANDed onto the record's own predicate rather than being applied to a second list
   * afterwards, which is what the sample path does in memory.
   *
   * AN ANSWER FOR AN ADDRESS SOMEBODY HAS ALREADY LEFT IS DROPPED, the way the row screen drops one.
   */
  let got = $state<Viewed | null>(null);
  let clock = $state(NOW);
  let reader: ViewReader | null = null;
  let askedFor = '';

  async function readView(address: string, filters: Filter[], query: string) {
    const asked = JSON.stringify([address, filters, query]);
    askedFor = asked;
    got = null;
    const at = opened();
    reader ??= viewReader(apiBase());
    const out = await reader.read(address, filters, query);
    const current = askedFor === asked;
    closed(!current || out.from !== 'refused', at);
    if (!current) return;
    /* A LIVE ROW IS READ AGAINST TODAY AND A SAMPLE ROW AGAINST THE SAMPLE'S OWN DAY, since a
       fixture date read against today is wrong by months. */
    clock = out.from === 'live' ? Date.now() : NOW;
    got = out;
  }

  $effect(() => {
    const address = key;
    const filters = extra;
    const query = q;
    untrack(() => void readView(address, filters, query));
  });

  const live = $derived(got?.from === 'live' ? got.view : undefined);
  const sample = $derived(got?.from === 'sample' ? VIEWS[key] : undefined);
  /* THE TWO REFUSALS AS VALUES, because a `{#snippet}` is a scope of its own and the narrowing a
     `{:else if got?.from === 'refused'}` gives the markup does not reach inside one. */
  const refused = $derived(got?.from === 'refused' ? got : undefined);
  const missing = $derived(got?.from === 'missing' ? got : undefined);
  const register = $derived(live?.register ?? sample?.register);
  const name = $derived(live?.name ?? sample?.name);
  /* READ AGAIN ONCE THE VIEW IS: a use case's own list is declared by the record, and `viewReader`
     learns it on the way (`remote.ts` `learn`), which a plain read of `REGISTERS` would not notice. */
  const decl = $derived.by(() => (void got, register ? REGISTERS[register] : undefined));
  const filters = $derived(live ? live.filters : (sample?.filters ?? null));
  /* THE COLUMNS THE VIEW KEPT, and the register's own where it kept none. The spoken id ends the
     row either way, as it does on the list this view narrows (DESIGN-SYSTEM rule 7). */
  const columns = $derived(register ? keptColumns(columnsFor(register), live?.columns ?? []) : []);

  const sampled = $derived(
    sample && register ? list(register, { filters: [...sample.filters, ...extra], ...(q ? { q } : {}) }) : undefined,
  );
  const entries = $derived(got?.from === 'live' ? got.entries : (sampled?.entries ?? []));
  const matched = $derived(got?.from === 'live' ? got.matched : (sampled?.matched ?? 0));
  const total = $derived(got?.from === 'live' ? got.total : (sampled?.total ?? 0));
  /* WHAT THIS RECORD CALLS THE ROWS THESE ONES POINT AT. Undefined on the sample, where `display`
     names a ref out of the sample's own rows as it always has. */
  const names = $derived(got?.from === 'live' ? got.names : undefined);
  /* NOTHING IS DRAWN UNTIL THE VIEW HAS BEEN READ, so the sample never shows over a live one. */
  const waiting = $derived(got === null);

  /**
   * THE FILTER IN THE LIST'S OWN WORDS. `copy.filterClause` says why the reading line stopped being
   * the `where` sentence; this is the half that knows the register, so a field is called what its
   * column is called and an enum value is written the way its cell writes it. A date clause keeps
   * its value as typed, because `today` is already a word and `display` would read it as a day.
   */
  const readable = (said: Filter[]): string =>
    copy.filterReads(
      said.map((f) => {
        const field = decl?.fields.find((d) => d.id === f.field);
        const dated = f.op === 'before' || f.op === 'after';
        const values = dated || !register ? f.values : f.values.map((v) => display(register, f.field, v) ?? v);
        return copy.filterClause(field ? labelOf(field) : f.field, values, f.op);
      }),
    );

  /* THE SAME CAP THE REGISTER APPLIES, because this is the same list with a different filter — and
     it is the surface `13 §4.3` sends you to when a register gets big, so it was the one place a
     five-thousand-row answer was rendered whole. `Table` draws the line that says so. */
  const shown = $derived(entries.slice(0, DOM_CAP));
  const rows = $derived(register ? toRows(register, shown, columns, clock, names) : []);
  /* The `#` column holds the digits of the highest id in hand, as on the list this view narrows. */
  const sized = $derived(columns.map((c) => (c.field === 'seq' ? { ...c, width: seqWidth(entries) } : c)));

  let focus = $state({ row: 0, col: 1 });
  let binding = $state(false);

  /* `⌥B`, which 50 §5.2 step 9 has specified all along and nothing bound. */
  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    if (typing()) return;
    if (e.altKey && e.key.toLowerCase() === 'b' && register) {
      e.preventDefault();
      binding = true;
      return;
    }
    /* AND `o`, which does what `Open {register}` in the header does, as the same key does one
       route over on `/p/<slug>`. The button no longer prints the key; the `?` sheet lists it.

       `silenced` FIRST, because `o` is a bare letter and `Character keys: off` is what makes the
       whole bare namespace legal (19 §4). */
    if (silenced(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o' && register) {
      e.preventDefault();
      void goto(at(`/r/${register}`));
    }
  }

  /**
   * DRAWN ONCE THE VIEW HAS BEEN READ, from the record or the sample.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim.
   *
   * IT USED TO READ `$effect(() => drew('ready'))` UNCONDITIONALLY, on the argument that this
   * screen computes its content synchronously. That argument was true of a screen reading a
   * fixture and is not true of this one: the read is bracketed by `opened()` and `closed()`, and
   * the attribute stays away until the answer lands.
   */
  $effect(() => {
    if (!waiting) drew('ready');
  });
</script>

<svelte:head><title>{titleOf(name, 'View')}</title></svelte:head>

<svelte:window {onkeydown} />

{#if waiting}
  <!-- Bars until the view has been read, never the sample's view of the same key. -->
  <Waiting head rows={8} />
{:else if refused}
  <div class="page">
    <!-- THE REFUSAL IS THE TEACHER, and the sentence is the record's. The case worth the branch is
         a view whose filter the record can no longer read: the view itself reads back fine, and
         `list` names the field that is gone. Without this the screen was a heading over nothing. -->
    <Empty kind="error" heading title={refused.fix}>
      {#snippet actions()}
        {#if refused.register}
          <Button href="/r/{refused.register}">{copy.openUnfiltered(REGISTERS[refused.register]?.name ?? refused.register)}</Button>
        {/if}
        <Button href="/">{copy.home}</Button>
      {/snippet}
    </Empty>
  </div>
{:else if missing}
  <div class="page">
    <!-- A VIEW THIS RECORD DOES NOT HOLD, IN THE RECORD'S OWN WORDS AND WITH THE RECORD'S OWN
         ADDRESSES. Listing the sample's two names here would answer the question with two links
         that open somebody else's list. -->
    <Empty kind="error" heading title={missing.said} body={copy.theseExist('Saved views', missing.addresses)}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if !register || !decl || !name}
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
      body={copy.theseExist('Saved views', Object.entries(VIEWS).map(([address, v]) => ({ address, title: v.name })))}
    >
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead icon={iconFor(decl.icon, 'rows')} kicker="{decl.name} · saved view" title={name} count={matched} {total}>
    {#snippet actions()}
      <Button weight="bare" href="/r/{register}"><Icon name="external" size="s" />Open {decl.name}</Button>
      <!-- `BindBlock`'s own file header opens "THIS IS THE WHOLE WIZARD", which is what `13 §10`
           means by a page builder. It opened and worked on a phone. -->
      <span class="bind-slot">
        <Button weight="quiet" onclick={() => (binding = true)}>{copy.bindBlock}</Button>
      </span>
    {/snippet}
  </PageHead>

  <BindBlock
    bind:open={binding}
    {register}
    predicate={name}
    says={filters ? whereOf(filters) : ''}
    onbind={(target, kind) =>
      toasts.push(copy.bound(copy.kindNames[kind] ?? kind, PAGES[target]?.title ?? target), { intent: 'warn' })}
  />

  <div class="page">
    <!-- NO LINE AT ALL WHERE THE PREDICATE CANNOT BE WRITTEN AS CHIPS, which is the header's own
         rule applied to a shape the sample could never produce: a printed predicate that is not the
         predicate is worse than none.

         AND NO LINE WHERE THERE IS NO PREDICATE EITHER. `viewReader` answers `filters: []` for a
         view the record holds with `filter: null`, which the kernel's own `ViewRow` header calls a
         view that shows the whole register, and `[]` is truthy: this line drew the word Filter with
         an empty `.predicate-said` after it in a flex row, so the whole line was the label. The
         sample could not reach it because every view in `VIEWS` ships at least one clause. The
         length is what is asked, not the array, and `extra` counts too so a `?f=` clause over an
         unfiltered view is still written out. -->
    {#if filters?.length || narrowed || live?.search}
      <p class="predicate">
        <span class="predicate-label">Filter</span>
        {#if filters && filters.length + extra.length > 0}<span class="predicate-said">{readable([...filters, ...extra])}</span>{/if}
        <!-- A SAVED VIEW REMEMBERS WHAT WAS IN THE BOX, and the record has stored it all along with
             nothing reading it back. It is quoted as typed, like `q`, because it is text somebody typed. -->
        {#if live?.search}<span class="predicate-q">{copy.matching} <code>{live.search}</code></span>{/if}
        {#if q}<span class="predicate-q">{copy.matching} <code>{q}</code></span>{/if}
        {#if narrowed}
          <Button weight="bare" href="/v/{key}"><Icon name="close" size="s" />{copy.backToView}</Button>
        {/if}
      </p>
    {/if}

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
    {#if entries.length === 0}
      <Empty
        kind={total === 0 ? 'no-data-yet' : 'no-results'}
        title={total === 0 ? copy.nothingIn(decl.name) : copy.noneMatching(total, copy.rowsWord(total))}
        query={total === 0 ? undefined : [q, live?.search, filters ? whereOf([...filters, ...extra]) : ''].filter(Boolean).join(' · ')}
        body={total === 0 && decl.holds ? `${decl.name} holds ${decl.holds}.` : undefined}
      >
        {#snippet actions()}
          {#if total === 0}
            <Button weight="primary" href="/r/{register}?new=1">{copy.addOne}</Button>
          {:else if narrowed}
            <Button href="/v/{key}">{copy.backToView}</Button>
          {:else}
            <Button href="/r/{register}">{copy.openUnfiltered(decl.name)}</Button>
          {/if}
        {/snippet}
      </Empty>
    {/if}

    <!-- ONE BODY AT A TIME, in the document and not only in the stylesheet — the register's own
         measurement: both bodies were built at every width and one was hidden, so a list of 2,614
         rows held 4,001 rows and 102,681 nodes and took eight seconds to settle. -->
    {#if entries.length > 0 && rowsAsCards()}
      <RowCards {register} entries={shown} />
    {:else}
    <div class="table-slot" class:gone={entries.length === 0}>
      <Table
        columns={sized}
        {rows}
        total={matched}
        cap={DOM_CAP}
        label={name}
        bind:focus
        onactivate={(row) => goto(at(`/r/${register}/${row.key.split('#')[1]}`))}
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
      route does not page at all and passes `matched`, never `-1`. It was the register's reason,
      copied onto a screen it is not about.
    -->
    {#if shown.length >= DOM_CAP}
      <CapLine shown={shown.length} total={matched} />
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
    padding: var(--sp-5) var(--gutter) var(--sp-9);
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
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
