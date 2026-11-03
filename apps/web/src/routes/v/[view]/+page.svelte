<!--
  A saved view: `/v/obligations.overdue`.

  The up half of the two-altitude ladder. Filter a register, press ⌥V, and the filter becomes a
  NAMED PREDICATE held against that register on the record: a row of its own with an owner and a
  share link, in one keystroke, because THE URL IS THE SERIALISATION. There is no "save this
  search" dialog and nothing to publish (19 §1).

  `order` is part of the saved object on the record: `saveView` stores the sort somebody was looking
  at, so a view reopens the way it was left.

  IT DREW THE SAMPLE'S TWO VIEWS ON EVERY RECORD, and it was the last data screen left that way.
  `VIEWS` at `data.ts:833` is a fictional studio's pair, and the key a person opens was matched
  against that object alone: no `createClient`, no `*-live` import, so `/v/services.lapsing` on a
  real record drew a filter somebody else wrote over rows from a register this record may not even
  declare. `views-live.ts` is built on the record's own `view` table. The sample then stayed on as
  the answer when no record answered, and that was removed too: a record that does not
  answer is a refusal, drawn in its own words, and nothing on this screen comes from a fixture.

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
  what `viewReader` now prevents by asking. A record that holds no view of that key gets its own
  sentence and its own addresses. `views.ts` still exports `viewMovedTo` with nobody left to call it.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { page } from '$app/state';
  import { CapLine } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { DOM_CAP, iconFor, columnsFor, seqWidth, display, labelOf, toRows, whereOf, type Filter } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import NotFound from '$lib/ui/NotFound.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import { saidPlainly } from '$lib/record/blocks.ts';
  import RowCards from '$lib/ui/RowCards.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { keptColumns, viewReader, type ViewReader, type Viewed } from '$lib/record/views-live.ts';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { deadlineOf, isLate, weighed, wholeMoney } from '../../r/[register]/parts/list.ts';
  import { amountField, signedSaid, wayField, wayOf } from '$lib/record/money-way.ts';
  import ListTable from '../../r/[register]/parts/ListTable.svelte';
  import ListSummary from '../../r/[register]/parts/ListSummary.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { Entry, FieldDecl } from '$lib/record/schema.ts';
  import type { Predicate } from '@braindog/where';
  import { chipsOf } from '$lib/record/api.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import QueryBuilder from '$lib/query/QueryBuilder.svelte';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { ADDRESS_OPS, fromChips, fromWhere, offered, toChips, toWhere, type Counted } from '$lib/query/tree.ts';
  import { describeWith, slashAnswers } from '$lib/query/slash.ts';

  /**
   * A register's named predicate, never a free-form slug.
   *
   * THE SENTENCE IS DERIVED, NOT TYPED. It used to be a `says:` string beside the filters, and the
   * two disagreed: Overdue printed "state is open or part, and due is before today" above a list
   * that only filtered on state, so 28 rows were drawn under the word Overdue and 24 of them were
   * not overdue: row four was due in four days. A printed predicate that is not the predicate is
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
   * `/v/obligations.overdue?q=zzzzz` returned `4 of 38`, the same four rows as with no query at
   * all, while `/r/obligations?q=zzzzz` correctly drew `no-results` with the term quoted. Same
   * record, same list, two behaviours, and this is the one in the rail on day one. A parameter read
   * by one surface and silently dropped by its twin is this build's signature failure: something
   * complete-looking that reports success and does nothing.
   *
   * `19 §1` says the saved view IS the predicate and the URL is its serialisation. So an extra
   * clause in the URL is a narrower question about the same list, and the answer is the narrower
   * list, ANDed on and never replacing, because the view's own predicate is what makes it that view.
   * The way back is the view's own address, which the state and the note both offer.
   */
  const q = $derived(page.url.searchParams.get('q') ?? '');
  /* THE LIST'S OWN CHIP READER (`chipsOf`), which cuts at the first two colons and keeps the rest as the value. This
     route split on every colon, so `handles:has:git:jokonkwo` narrowed the view by `git`, and the builder below writes
     the chips back the way `chipsOf` reads them. */
  const extra = $derived.by((): Filter[] => chipsOf(page.url.searchParams));
  const narrowed = $derived(Boolean(q) || extra.length > 0);

  /**
   * THE RECORD'S ANSWER, AND NOTHING ELSE.
   *
   * One read per address, bracketed by `opened()` and `closed()`, so `data-screen` is away while it
   * is out. The whole URL goes into the read: an extra clause is a narrower question about the same
   * view, so it is ANDed onto the record's own predicate rather than being applied to a second list
   * afterwards, which is what the sample path used to do in memory.
   *
   * AN ANSWER FOR AN ADDRESS SOMEBODY HAS ALREADY LEFT IS DROPPED, the way the row screen drops one.
   */
  let got = $state<Viewed | null>(null);
  let clock = $state(recordNow());
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
    /* THE ROWS ARE READ AGAINST THE MOMENT THEY ARRIVED, so a date cell's "in 3 days" is about the
       answer on screen and not about when the tab was opened. */
    clock = recordNow();
    got = out;
  }

  $effect(() => {
    const address = key;
    const filters = extra;
    const query = q;
    untrack(() => void readView(address, filters, query));
  });

  const live = $derived(got?.from === 'live' ? got.view : undefined);
  /* THE TWO REFUSALS AS VALUES, because a `{#snippet}` is a scope of its own and the narrowing a
     `{:else if got?.from === 'refused'}` gives the markup does not reach inside one. */
  const refused = $derived(got?.from === 'refused' ? got : undefined);
  const missing = $derived(got?.from === 'missing' ? got : undefined);
  const register = $derived(live?.register);
  const name = $derived(live?.name);
  /* READ AGAIN ONCE THE VIEW IS: a use case's own list is declared by the record, and `viewReader`
     learns it on the way (`remote.ts` `learn`), which a plain read of `REGISTERS` would not notice. */
  const decl = $derived.by(() => (void got, register ? REGISTERS[register] : undefined));
  const filters = $derived(live ? live.filters : null);
  /* WHETHER THE TITLE ROW HAS A LINE TO SAY: the snippet's own test, so the head draws no empty sentence. */
  const saying = $derived(Boolean(filters?.length || narrowed || live?.search));
  /* THE COLUMNS THE VIEW KEPT, and the register's own where it kept none. The spoken id ends the
     row either way, as it does on the list this view narrows. */
  const columns = $derived(register ? keptColumns(columnsFor(register, undefined, (live?.columns ?? []).includes('seq')), live?.columns ?? []) : []);

  const entries = $derived(got?.from === 'live' ? got.entries : []);
  const matched = $derived(got?.from === 'live' ? got.matched : 0);
  const total = $derived(got?.from === 'live' ? got.total : 0);
  /* WHAT THIS RECORD CALLS THE ROWS THESE ONES POINT AT, so a ref is named by this record's row. */
  const names = $derived(got?.from === 'live' ? got.names : undefined);
  /* NOTHING IS DRAWN UNTIL THE VIEW HAS BEEN READ, so no half-drawn screen stands in for the answer. */
  const waiting = $derived(got === null);

  /**
   * THE FILTER IN THE LIST'S OWN WORDS. `copy.filterClause` says why the reading line stopped being
   * the `where` sentence; this is the half that knows the register, so a field is called what its
   * column is called and an enum value is written the way its cell writes it. A date clause keeps
   * its value as typed, because `today` is already a word and `display` would read it as a day.
   *
   * AND THE LIST'S STATE SAYS ITSELF: "Open or part paid", and not "Filter
   * Status is open or part". A state's values are the words a person uses for where a row is, so
   * they need no field name in front of them; any other field keeps its name, because "Money in"
   * alone does not say it is about which way the money went.
   */
  const stateReads = (values: readonly string[]): string => {
    const said = values.map((v, i) => (i > 0 && /^[A-Z][a-z]/u.test(v) ? v.charAt(0).toLowerCase() + v.slice(1) : v)).join(' or ');
    return said.charAt(0).toUpperCase() + said.slice(1);
  };
  const readable = (said: Filter[]): string =>
    copy.filterReads(
      said.map((f) => {
        const field = decl?.fields.find((d) => d.id === f.field);
        const dated = f.op === 'before' || f.op === 'after';
        const values = dated || !register ? f.values : f.values.map((v) => display(register, f.field, v) ?? v);
        if (field?.type === 'enum' && field.id === decl?.state && (f.op === 'is' || f.op === 'in')) return stateReads(values);
        return copy.filterClause(field ? labelOf(field) : f.field, values, f.op);
      }),
    );

  /* THE SAME CAP THE REGISTER APPLIES, because this is the same list with a different filter, and
     it is the surface `13 §4.3` sends you to when a register gets big, so it was the one place a
     five-thousand-row answer was rendered whole. `Table` draws the line that says so. */
  const shown = $derived(entries.slice(0, DOM_CAP));
  /* WHAT A DOT MEANS IS WHAT IT MEANS ON THE LIST THIS VIEW NARROWS (`parts/list.ts`): a finished row
     carries none, and the deadline's column carries the rest, beside the date it is about. */
  /* AND AN AMOUNT SAYS WHICH WAY IT WENT, "−£9,190" and "+£4,800", as the list this view narrows says it. */
  const amountAt = $derived.by(() => {
    const f = wayField(decl) ? amountField(decl) : undefined;
    return f ? columns.findIndex((c) => c.field === f.id) : -1;
  });
  const rows = $derived.by(() => {
    const drawn = register ? toRows(register, shown, columns, clock, names) : [];
    if (amountAt < 0) return drawn;
    return drawn.map((r, n) => {
      const way = shown[n] ? wayOf(decl, shown[n].fields) : null;
      return way === null ? r : { ...r, cells: r.cells.map((c, i) => (i === amountAt && typeof c === 'string' ? signedSaid(c, way) : c)) };
    });
  });
  const dueField = $derived(deadlineOf(decl));
  /* The number's column holds the digits of the highest id in hand, as on the list this view narrows. */
  /* AND EACH COLUMN AS WIDE AS THE LIST DRAWS IT (`weighed`), the deadline's wide enough for "64 days late · 1 Jul 2026"
     once a row in hand is late, so the Due cell reads as it does on the list. */
  const anyLate = $derived(entries.some((e) => isLate(decl, e, clock)));
  const sized = $derived(
    columns
      .map((c) => weighed(c, c.field === decl?.title, entries))
      .map((c) => ({ ...(c.field === 'seq' ? { ...c, width: seqWidth(entries) } : anyLate && c.field === dueField ? { ...c, width: '27ch' } : c), tone: c.field === dueField })),
  );

  /* NO ROW IS MARKED UNTIL THE KEYBOARD MOVES (money F10): `{ row: 0 }` drew the first row grey for good, a selection
     nobody made. The grid's caret still starts on the first cell; `focus` is only what the page draws as chosen. */
  let focus = $state<{ row: number; col: number } | undefined>(undefined);

  /* THE LIST'S OWN TABLE, READ-ONLY HERE: a view is somewhere to read the narrowed list, and its rows open their page to
     be changed. So nothing is editable in a cell, nothing is picked, and no row wears a receipt. */
  const bySeq = $derived(new Map(entries.map((e) => [e.seq, e] as const)));
  const rowAt = (seq: number): Entry | undefined => bySeq.get(seq);
  const fieldOf = (field: string): FieldDecl | undefined => decl?.fields.find((f) => f.id === field);
  const shownValue = (seq: number, field: string): unknown => bySeq.get(seq)?.fields[field];
  const whole = $derived(wholeMoney(decl, entries));
  const none = new Set<number>();
  const noKeys = new Set<string>();
  const noFresh = new Map<number, number>();
  const nothing = (): void => {};
  /* The view's rows by name, which the summary's largest line says. */
  const titleSaid = (e: Entry): string => String((decl && e.fields[decl.title]) ?? '');
  let binding = $state(false);

  /* ── narrowing the view with the query builder ─────────────────────────── */

  /**
   * THE BUILDER EDITS THE NARROWING, NEVER THE VIEW'S OWN PREDICATE. `19 §1` makes the saved view the predicate and the
   * address a narrower question about it, ANDed on (`extra` above); saving a different predicate is the list's Save as
   * a view. So the builder is handed the address's chips, at depth 1 and with the operators a chip spells, and writes
   * them back to the address when its sheet closes, as the list's does.
   */
  let narrowing = $state(false);
  const fields = $derived(offered(decl?.fields ?? []));
  const drawn = $derived(fromChips(extra, fields));
  const narrowingValue = $derived(register ? toWhere(drawn.root, register, fields) : undefined);
  let draft = $state<{ at: string; where: Predicate | undefined } | null>(null);

  /** A tree as the address's chips, with the chips the rows cannot draw kept as they were. */
  function chipsFor(where: Predicate | undefined): Filter[] | null {
    const rows = fromWhere(where, fields);
    const chips = rows ? toChips(rows, fields) : null;
    return chips ? [...chips, ...drawn.kept] : null;
  }

  function applyNarrowing() {
    const held = draft;
    draft = null;
    if (!held || held.at !== page.url.search) return;
    const chips = chipsFor(held.where);
    if (!chips) return;
    const next = new URLSearchParams(page.url.searchParams);
    next.delete('f');
    for (const c of chips) next.append('f', `${c.field}:${c.op}:${c.values.join(',')}`);
    void goto(`?${next}`, { noScroll: true, keepFocus: true });
  }

  let wasNarrowing = false;
  $effect(() => {
    const now = narrowing;
    if (wasNarrowing && !now) untrack(applyNarrowing);
    wasNarrowing = now;
  });

  /** "Matches n of N": the record's own answer for this view with the builder's narrowing ANDed on. */
  async function countNarrowed(where: Predicate | undefined): Promise<Counted | null> {
    const chips = chipsFor(where);
    if (!chips) return null;
    reader ??= viewReader(apiBase());
    const out = await reader.read(key, chips, q);
    return out.from === 'live' ? { n: out.matched, of: out.total } : null;
  }

  /* This screen's own words. */
  const viewWords = { board: 'Board' } as const;

  const describeNarrowing = $derived(slashAnswers(page.data) && name ? describeWith(apiBase(), name) : undefined);

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
    /* AND `o`, which does what the kicker's link over the title does, as the same key does one
       route over on `/p/<slug>`. Nothing on screen prints the key; the `?` sheet lists it.

       `silenced` FIRST, because `o` is a bare letter and `Character keys: off` is what makes the
       whole bare namespace legal (19 §4). */
    if (silenced(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'o' && register) {
      e.preventDefault();
      void goto(at(`/r/${register}`));
    }
  }

  /**
   * DRAWN ONCE THE RECORD HAS ANSWERED, whatever it answered.
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
  <!-- Bars until the record answers. -->
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
        <Button href="/">{copy.today}</Button>
      {/snippet}
    </Empty>
  </div>
{:else if missing}
  <div class="page">
    <!-- A VIEW THIS RECORD DOES NOT HOLD, IN THE RECORD'S OWN WORDS AND WITH THE RECORD'S OWN
         ADDRESSES. Listing the seeded studio's two names here once answered the question with two
         links that open somebody else's list. -->
    <PageHead title={missing.said} headless />
    <NotFound title={missing.said} body={copy.theseExist('Saved views', missing.addresses)} />
  </div>
{:else if !register || !decl || !name}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing and says it is not here.

         IT LISTED THE SEEDED STUDIO'S VIEWS AS WHAT IS, from `VIEWS`, on every record. The record's
         own addresses come with `missing` above; this branch is a view the record answered over a
         list it will not describe, where there is no list of anything true to offer, so it offers
         none. -->
    <Empty kind="error" heading title={copy.noSuch('saved view', key)}>
      {#snippet actions()}<Button href="/">{copy.today}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <!-- THE TITLE ROW'S LINE IS WHAT THE VIEW SHOWS, IN WORDS: the predicate as the list says it, and what was
       typed into the box, quoted as typed. Never red: a view the record does not flag as late needs nobody.

       NO LINE AT ALL WHERE THE PREDICATE CANNOT BE WRITTEN AS CHIPS, which is the header's own rule applied to a shape
       the sample could never produce: a printed predicate that is not the predicate is worse than none.

       AND NO LINE WHERE THERE IS NO PREDICATE EITHER. `viewReader` answers `filters: []` for a view the record holds
       with `filter: null`, which the kernel's own `ViewRow` header calls a view that shows the whole register, and `[]`
       is truthy: this line drew the word Filter with an empty `.predicate-said` after it, so the whole line was the
       label. The length is what is asked, not the array, and `extra` counts too so a `?f=` clause over an unfiltered
       view is still written out. -->
  {#snippet predicateLine()}
    {#if filters?.length || narrowed || live?.search}
      <span class="predicate">
        {#if filters && filters.length + extra.length > 0}<span class="predicate-said">{readable([...filters, ...extra])}</span>{/if}
        <!-- A SAVED VIEW REMEMBERS WHAT WAS IN THE BOX, and the record has stored it all along with
             nothing reading it back. It is quoted as typed, like `q`, because it is text somebody typed. -->
        {#if live?.search}<span class="predicate-q">{copy.matching} <code>{live.search}</code></span>{/if}
        {#if q}<span class="predicate-q">{copy.matching} <code>{q}</code></span>{/if}
      </span>
    {/if}
  {/snippet}

  <PageHead
    icon={iconFor(decl.icon, 'rows')}
    kicker={decl.name}
    back={register ? `/r/${register}` : undefined}
    title={name}
    count={matched}
    {total}
    sentence={saying ? predicateLine : undefined}
  >
    {#snippet actions()}
      <!-- THE TOOLBAR IS GLASS. The list this view narrows is the kicker's link, one step up, so it is not a
           pill here as well; `o` still opens it. "Filter" wherever the list has fields to narrow by,
           and the way back to the view's own address once the address has narrowed it. -->
      {#if fields.length}
        <Button weight="glass" aria-haspopup="dialog" onclick={() => (narrowing = true)}><Icon name="filter" size="s" />{copy.filter}</Button>
      {/if}
      {#if narrowed}
        <Button weight="glass" href="/v/{key}"><Icon name="close" size="s" />{copy.backToView}</Button>
      {/if}
      <!-- `BindBlock`'s own file header opens "THIS IS THE WHOLE WIZARD", which is what `13 §10`
           means by a page builder. It says its word, "Board" (money F10): an icon alone beside "Filter" was a square
           nobody could name. The tooltip says the whole of it. -->
      <span class="bind-slot">
        <Button weight="glass" title={copy.bindBlock} aria-haspopup="dialog" onclick={() => (binding = true)}><Icon name="board" size="s" />{viewWords.board}</Button>
      </span>
    {/snippet}
  </PageHead>

  <BindBlock
    bind:open={binding}
    {register}
    predicate={filters?.length ? whereOf(filters) : copy.everything}
    says={filters?.length ? saidPlainly(register, whereOf(filters)) : copy.everything}
  />

  <div class="page">
    <!-- THE BUILDER OVER THE VIEW'S NARROWING, in the same sheet the list's filter opens in, with the count and Done
         pinned at its foot. The rows reach the address when the sheet closes. -->
    {#if fields.length && register}
      <Sheet bind:open={narrowing} title={copy.filter}>
        <QueryBuilder
          value={narrowingValue}
          {fields}
          {register}
          depth={1}
          ops={ADDRESS_OPS}
          count={countNarrowed}
          describe={describeNarrowing}
          onchange={(where) => (draft = { at: page.url.search, where })}
          ondone={() => (narrowing = false)}
        />
      </Sheet>
    {/if}

    <!--
      THE FIVE STATES, WHICH THIS ROUTE HAD NONE OF.

      Its only `<Empty>` was the 404. At zero matching rows it drew a header, a `0`, the filter chip,
      a bare column-header row and about 1,200px of blank canvas, on the surface `19 §1` calls the
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
            <Button weight="primary" href="/r/{register}?new=1">{said('add_first')}</Button>
          {:else if narrowed}
            <Button href="/v/{key}">{copy.backToView}</Button>
          {:else}
            <Button href="/r/{register}">{copy.openUnfiltered(decl.name)}</Button>
          {/if}
        {/snippet}
      </Empty>
    {/if}

    <!-- ONE BODY AT A TIME, in the document and not only in the stylesheet: the register's own
         measurement is that both bodies were built at every width and one was hidden, so a list of
         2,614 rows held 4,001 rows and 102,681 nodes and took eight seconds to settle.

         THE SAME CARDS AS THE LIST, read against the same clock and naming refs by the same record's
         names. Without them a card dated its tone by this browser's clock and named a ref by the
         titles this tab happened to have learnt. -->
    <!-- THE LIST'S FIGURES OVER THE VIEW'S ROWS, at every width and in every body, as the list draws them over its own. -->
    {#if entries.length > 1}
      <ListSummary {decl} entries={shown} now={clock} byState headSaid={saying} titleOf={titleSaid} />
    {/if}
    {#if entries.length > 0 && rowsAsCards()}
      <RowCards {register} entries={shown} now={clock} {names} />
    {:else if entries.length > 0}
      <!-- THE LIST'S OWN TABLE IN ONE TILE (money F10): its Due cell ("64 days late · 1 Jul"), its status rings, the
           project's dot, and an empty cell left empty. This drew a second table of its own on the bare board, with
           an em dash in every empty cell and a lone dot for a state. -->
      <Tile class="list-tile view-tile">
        <ListTable
          {register}
          {decl}
          columns={sized}
          {rows}
          total={matched}
          sort={undefined}
          now={clock}
          {whole}
          pickable={false}
          selected={none}
          selectedKeys={noKeys}
          bind:focus
          editing={null}
          fresh={noFresh}
          {names}
          onactivate={(row) => goto(at(`/r/${register}/${row.key.split('#')[1]}`))}
          {rowAt}
          {fieldOf}
          editableHere={() => false}
          {shownValue}
          listCurrency={() => null}
          receiptFor={() => undefined}
          toggleSelect={nothing}
          openEditor={nothing}
          commitEdit={nothing}
          cancelEdit={nothing}
          leftTheRow={nothing}
          cellKeys={nothing}
          openCardMenu={nothing}
        />
      </Tile>
    {/if}

    <!--
      ONE CAP LINE, FOR WHICHEVER BODY IS DRAWING.

      There were two on a phone: the cards branch drew one UNCONDITIONALLY and this one drew a second
      at the cap, so at 2,000 rows on a narrow screen the same sentence appeared twice. The card one
      also carried `shown.length` where this carries `DOM_CAP`, so the two could print different
      numbers.

      And the comment that used to sit here justified itself with *"`Table` used to draw it from
      `aria-rowcount`, which is `-1` while a filtered list pages"*, true of the register, and this
      route does not page at all and passes `matched`, never `-1`. It was the register's reason,
      copied onto a screen it is not about.
    -->
    {#if shown.length >= DOM_CAP}
      <CapLine shown={shown.length} total={matched} />
    {/if}
  </div>
{/if}

<style>
  /* ONE HAIRLINE BETWEEN ROWS AND NONE AROUND THE TABLE, as on the list this view narrows: the last
     row's own line closed the list like a box. */
  :global(.view-tile .rowgroup:not(:has(~ .rowgroup)) > .tr:last-child) {
    border-block-end-color: transparent;
  }

  /* THE BIND CONTROL, "Board", beside "Filter". */
  .bind-slot {
    display: inline-flex;
  }

  /* Authoring is a desktop surface (13 §10). */
  @media (width < 900px) {
    .bind-slot {
      display: none;
    }
  }

  /* THE LIST ON THE GROUND UNDER THE TITLE ROW, at the page's gutter. Nothing here is a tile: a saved view is a list. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
  }

  /* THE PREDICATE IN THE TITLE ROW'S LINE: the sentence's own size and ink, wrapping, because the filter is a sentence
     now and a sentence is longer than the chip was. */
  .predicate {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-2);
  }

  /* THE BODY FACE AND NO CHIP. It was `<code>` on `--board` in `--font-mono`: a query, set in the face
     this product keeps for ids, over a list a person came to read. The quote below is still right
     for `q`, which is text somebody typed and is quoted as typed. */
  .predicate-said,
  .predicate-q {
    color: var(--ink-2);
  }

  .predicate code {
    padding: 1px var(--sp-1);
    background: var(--hover);
    border-radius: var(--r-xs);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

</style>
