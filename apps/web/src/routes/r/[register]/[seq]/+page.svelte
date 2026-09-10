<!--
  One row.

  A label is VISIBLE, always. A placeholder is not a label — it disappears exactly when a user needs
  it, and it fails contrast in most themes (06 §8). Every field below carries its own label whether
  or not it has a value.

  `#125` is the number you can say out loud, and it is per-register, which is why renaming a register
  is refused: `register.obligations → register.bills` renames a spoken id, and `#125` in a note would
  stop resolving. Change the display name instead; it is free.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { amountOf, currencyOf } from '$lib/record/money.ts';
  import { holeLabel, relative, since } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import * as pending from '$lib/record/pending.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { actorOf, AUDIT, backlinks, dirOf, display, entry, iconFor, identityOf, labelOf, NOW, readableFields, REGISTERS, values } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { Table } from 'braindog-render/svelte';
  import { drew } from '../../../../lib/ui/screen.svelte.ts';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));
  const decl = $derived(REGISTERS[id]);

  /**
   * THE ROW MAY NOT BE IN THE RECORD YET, AND THIS SCREEN USED TO SAY IT DID NOT EXIST.
   *
   * `entry()` reads `ROWS`, which is what the record holds. A row somebody typed into the capture
   * line is in `pending` instead, wearing a NEGATIVE sequence so it can never collide with a real
   * one, and the list draws it with `Not saved` on it. Opening that row landed on "There is no
   * obligation #-1" - the product telling somebody the thing they had just typed, and could see one
   * screen back, was not there. The list and the detail were reading two different sets of rows.
   *
   * They are read in that order because a written row is the truth: if the same number ever
   * answered from both, the record wins.
   */
  const written = $derived(entry(id, seq));
  const unwritten = $derived(written ? undefined : pending.of(id).find((r) => r.seq === seq));
  const row = $derived(written ?? unwritten);

  /* WHAT POINTS AT THIS ROW. A `ref` declares `to:` and nothing declared the other direction, so a
     person's page could not show the invoices that are theirs — which is the half somebody opens a
     person for. Nothing was added to the data model: the inverse of every ref is already stated
     once, on the field that declares it. */
  const incoming = $derived(row ? backlinks(id, seq) : []);

  const history = $derived(AUDIT.filter((e) => e.target === `${id}#${seq}`));

  const state = $derived(decl?.state ? String(row?.fields[decl.state] ?? '') : '');
  const tone = $derived(decl?.done?.includes(state) ? ('good' as const) : undefined);

  /* A `document` is an argument, not a figure, so it never sits in the field list beside a date and
     a currency — it gets the room prose needs (05 §7.1). */
  /* `readableFields` and not `decl.fields`: a register's identity mark and its frozen hue are
     machinery, and listing them here printed "Mark  ▲" and "Hue  271" as though they were facts
     about the project rather than the reason it has a triangle beside its name. */
  const documents = $derived(readableFields(id).filter((f) => f.type === 'document'));
  const shortFields = $derived(readableFields(id).filter((f) => f.type !== 'document'));

  const resolved = values();
  const resolve = (path: string) => resolved[path] ?? null;
  /** A link the host cannot resolve is plain text, never a dead anchor (36 §13 D16). */
  /** What closing a hole would do. Named, because "nothing was written" alone says nothing. */
  const holeFix = (path: string | null): string =>
    path
      ? `${holeLabel(path)} would be opened for whoever can supply it`
      : 'The unknown would be opened for whoever can supply it';

  const link = (spoken: string) => {
    const m = /^([a-z][a-z0-9_]*)#(\d+)$/.exec(spoken);
    return m && REGISTERS[m[1]!] ? `/r/${m[1]}/${m[2]}` : null;
  };

  /**
   * `y` COPIES THE ID AND `⇧Y` THE LINK, which is what the grid does and what this page prints.
   *
   * The route had no key listener at all while its own header carried `<kbd>y</kbd>` — so the one
   * screen where somebody most wants a row's spoken id to paste into a message advertised the key
   * for it and ignored every press. `19 §4`'s whole argument for a registry is that the sheet
   * documents what is bound BY READING IT, so a printed key that does nothing is the drift the
   * registry exists to prevent.
   *
   * `silenced` first: `y` is a bare letter, and `Character keys: off` silences the namespace.
   */
  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    if (typing() || silenced(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!row) return;
    /* NOT ON A ROW THE RECORD HAS NOT GOT. `obligations#-1` is not a number anybody can say, and a
       link to it resolves for as long as this tab is open and no longer, so copying either would
       hand somebody a reference that is already wrong. The keys say why rather than doing nothing,
       because a key that is silent is the drift `19 §4` exists to prevent. */
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      if (unwritten) {
        toasts.push(copy.notWritten('This row has no number to copy'), { intent: 'warn' });
        return;
      }
      void (e.key === 'y' ? clipboard.putSpoken(id, row.seq) : clipboard.putLink(id, row.seq));
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

<svelte:window {onkeydown} />

<svelte:head><title>{titleOf(row && decl && String(row.fields[decl.title] ?? ""), decl?.name)}</title></svelte:head>

{#if !decl || !row}
  <div class="page">
    <!-- A URL NAMING A ROW THAT IS NOT THERE IS A REFUSAL. Nothing broke, so there is no request
         id to quote; no filter ran, so "nothing matched" describes something that did not happen.
         It names the number, because `19 §642` is that a row "has a number you can say" and this is
         the screen where saying it did not work. -->
    <Empty
      kind="error"
      heading
      title={decl ? (seq < 0 ? copy.neverSaved(decl.one) : copy.noSuchNumber(decl.one, seq)) : copy.noSuch('list', id)}
    >
      {#snippet actions()}<Button href="/r/{id}">Back to {decl?.name ?? id}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <PageHead
    icon={iconFor(decl?.icon, 'rows')}
    kicker={decl.name}
    title={String(row.fields[decl.title] ?? '')}
    id={unwritten ? undefined : `#${row.seq}`}
  >
    {#snippet actions()}
      <!-- THE NUMBER IS THE FIRST THING THIS HEADER SAYS, and for an unwritten row there is no
           number, so it says what the row IS instead. `#-1` is the sequence `pending` hands out to
           keep an unwritten row from colliding with a real one; it is machinery and it was never
           meant to be read out. -->
      {#if unwritten}
        <Chip label={copy.markNotWritten} tone="warn" />
      {/if}
      <!-- `Copy id` WAS THE FIRST ACTION IN THIS HEADER, AND IT LIVES BESIDE THE ID NOW. A row's page
           led with a developer verb: the first control a person saw on an invoice was the one that
           puts `obligations#1` on the clipboard, ahead of anything that does something to the
           invoice. It is in Details, next to the id it copies, and it keeps its key. -->
      <!-- `Put back` AND NOT `Archive`, because there is nothing to archive: the row is in this tab
           and nowhere else. It is the same verb the list offers on the same row, which is the point
           — a row that can be taken back in one place and not the other is two products. -->
      {#if unwritten}
        <Button
          weight="quiet"
          onclick={() => {
            /* THE NAME IS READ BEFORE THE ROW GOES, and the row goes after the navigation rather
               than before it. Dropping first makes `row` undefined on this screen for as long as
               `goto` takes, which draws "There is no obligation #-1" over the top of the press that
               was working: the error this whole change exists to remove, flashed on the way out. */
            const named = String(row.fields[decl.title] ?? decl.one.toLowerCase());
            void goto(`/r/${id}`).then(() => {
              pending.drop(id, seq);
              toasts.push(copy.undoneRow(named));
            });
          }}>{copy.undoRow}</Button
        >
      {:else}
        <Button weight="quiet" onclick={() => toasts.push(copy.notWritten('The row would open for editing'), { intent: 'warn' })}>{copy.editRow}</Button>
      {/if}
    {/snippet}
  </PageHead>

  <div class="page">
    <div class="split">
      <section class="fields">
        <dl class="field-list">
          {#each shortFields as f}
            {@const value = row.fields[f.id]}
            <div class="field">
              <dt class="field-label">{labelOf(f)}</dt>
              <dd class="field-value" data-type={f.type} dir={dirOf(id, f.id)}>
                {#if value === null || value === undefined || value === ''}
                  <span class="missing">—</span>
                {:else if f.type === 'money'}
                  <Money minor={amountOf(value) ?? 0} currency={currencyOf(value) ?? ''} weight="strong" />
                {:else if f.id === decl.state}
                  <Chip label={String(value).replace(/_/g, ' ')} {tone} />
                {:else if identityOf(id, f.id, value)}
                  <IdentityMark identity={identityOf(id, f.id, value)!} size="md" />
                {:else if f.type === 'day'}
                  {display(id, f.id, value)}
                  <span class="rel">{relative(String(value), NOW)}</span>
                {:else}
                  {display(id, f.id, value)}
                {/if}
              </dd>
            </div>
          {/each}
        </dl>

        <!-- A `document` field is the dialect, drawn by the same interpreter a declared page uses.
             The read view IS the renderer, so what you are looking at is the artefact (22 §8). -->
        {#each documents as f}
          {#if row.fields[f.id]}
            <article class="document-slot">
              <h2 class="doc-label">{labelOf(f)}</h2>
              <!-- `hole` IS WHAT MAKES A HOLE PRESSABLE. Without it the renderer draws a marked
                   span rather than a `<button>` nobody wrote a handler for; with it, this screen
                   owns what pressing one does. No `dayHref`: there is no calendar in this build,
                   and a date that links to one is an anchor to the error page. -->
              <Document
                src={String(row.fields[f.id])}
                opts={{ resolve, link, now: NOW, hole: (path) => toasts.push(copy.notWritten(holeFix(path)), { intent: 'warn' }) }}
              />
            </article>
          {/if}
        {/each}

        {#each incoming as rel}
          <!-- One section per RELATION, not per register: two fields of one register can point at
               the same place and mean different things — an update's `track` is what it is about
               and its `supersedes` is what it replaces. -->
          <section class="incoming">
            <h2 class="incoming-title">
              <Icon name={rel.icon} size="s" />
              {rel.name}
              <span class="incoming-label">{rel.label.toLowerCase()}</span>
              <span class="incoming-count num">{rel.total}</span>
            </h2>
            <Table columns={rel.columns} rows={rel.rows} total={rel.total} label="{rel.name} · {rel.label}" />
            {#if rel.total > rel.rows.length}
              <a class="incoming-more" href={rel.href}>
                All {rel.total} <Icon name="chevron" size="s" />
              </a>
            {/if}
          </section>
        {/each}
      </section>

      <aside class="side">
        <!-- "This row" said what you are already looking at, and "Spoken id" and "Version" are
             both the record's own vocabulary: one is the thing you say out loud, which is what the
             row is called, and the other is a compare-and-set counter that means nothing to a
             reader and changes on every write. The id stays, because it is the handle you paste
             into an agent. The counter goes; the History underneath is the version, in words. -->
        <h2 class="side-title"><Icon name="info" size="s" />Details</h2>
        <dl class="meta">
          <dt>Id</dt>
          <!-- IT SAID `y` AND NOTHING WAS BOUND, and the button itself had no handler either — two
               lies in one control, on the screen where somebody most wants a row's id to paste into
               a message. The button was fixed and the KEY was not, under a comment claiming both
               were: this route registered no key listener at all while its own header printed one.
               It came here from the header, beside the id it copies, and the key came with it. -->
          <dd class="id-line">
            <span class="mono">{id}#{row.seq}</span>
            {#if !unwritten}
              <button type="button" class="copy-id tap" onclick={() => clipboard.putSpoken(id, row.seq)}>
                <Icon name="copy" size="s" /><span>{copy.copyId}</span><Kbd keys="y" />
              </button>
            {/if}
          </dd>
          <dt>Added</dt>
          <!-- IN WORDS, like the other two surfaces that answer "who changed my record". `actorOf`
               moved into `api.ts` when Home and `/audit` were found spelling the same two actors two
               ways; this route reads the same `AUDIT` array and was the third. -->
          <dd>{since(row.created, NOW)} by {actorOf(row.by)}</dd>
        </dl>

        {#if history.length}
          <h2 class="side-title"><Icon name="history" size="s" />History</h2>
          <ol class="history">
            {#each history as e}
              <li>
                <span class="history-by">{actorOf(e.by)}</span>
                <span class="history-note">{e.note}</span>
                <span class="history-when">{since(e.at, NOW)}</span>
              </li>
            {/each}
          </ol>
        {/if}
      </aside>
    </div>
  </div>
{/if}

<style>
  /* THE ID AND THE ONE THING YOU DO WITH IT, ON ONE LINE. A bare button beside a value rather than
     under it, so Details stays a list of facts with one control attached to the fact it acts on. */
  .id-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .copy-id {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
  }

  .copy-id:hover {
    background: var(--hover-wash);
  }

  /* The key is advice for a keyboard, and a thumb has none. The binding stays. */
  @media (pointer: coarse) {
    .copy-id :global(kbd) {
      display: none;
    }
  }

  .incoming {
    margin-block-start: var(--sp-6);
  }

  .incoming-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* The FIELD's label, quieter than the register's name: "Obligations · party" reads as one heading
     with the relation in it, where two words of equal weight read as two headings.
     Quieter by WEIGHT AND CASE, not by colour: `faint` clears the large-text floor only, and this
     line is 11px — a rule the css-rules gate holds, and rightly, since the whole heading is small. */
  .incoming-label {
    font-weight: 400;
    letter-spacing: 0.04em;
    text-transform: none;
  }

  .incoming-count {
    margin-inline-start: auto;
    color: var(--ink2);
  }

  .incoming-more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    margin-block-start: var(--sp-2);
    color: var(--accent-text);
    font-size: var(--t-sm);
  }

  .page {
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1140px;
  }

  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--sp-5);
    align-items: start;
  }

  .field-list {
    margin: 0;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    overflow: hidden;
  }

  .field {
    display: grid;
    grid-template-columns: minmax(0, 16ch) minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: baseline;
    padding: var(--sp-3) var(--sp-4);
    border-block-end: 1px solid var(--line);
  }

  .field:last-child {
    border-block-end: 0;
  }

  /* Sentence case, at body size, at the same weight as a column header. A field label is a WORD
     YOU READ — "Direction", "Amount", "Due" — not a category stamp, and small letterspaced caps
     make eight of them in a column read as a form to be filled rather than a row to be understood.
     Same decision as the table header in blocks.css, held here so the two agree. */
  .field-label {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
    letter-spacing: 0;
  }

  .field-value {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    overflow-wrap: anywhere;
  }

  .field-value[data-type='money'],
  .field-value[data-type='day'] {
    font-variant-numeric: tabular-nums;
  }

  .rel,
  .missing {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .document-slot {
    margin-block-start: var(--sp-6);
  }

  .doc-label {
    margin-block-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  /* Prose gets a reading measure; a table, a grid and a ledger get the room. Width is a property of
     the block KIND, not of the page — the third time that family of bug was paid for (13 §4.1). */
  .document-slot :global(.document > h1) {
    margin-block: var(--sp-5) var(--sp-2);
    font-size: var(--t-xl);
    letter-spacing: -0.026em;
  }

  .document-slot :global(.document > h2) {
    margin-block: var(--sp-6) var(--sp-3);
    font-size: var(--t-md);
    letter-spacing: -0.012em;
  }

  .document-slot :global(.document > h1:first-child) {
    margin-block-start: 0;
  }

  .side-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    color: var(--ink2);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .side-title + * + .side-title {
    margin-block-start: var(--sp-5);
  }

  .meta {
    display: grid;
    grid-template-columns: minmax(0, 10ch) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .meta dt {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .meta dd {
    margin: 0;
    font-size: var(--t-xs);
  }

  .mono {
    font-family: var(--font-id);
  }

  .history {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .history li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px var(--sp-2);
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--line);
  }

  .history-by {
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .history-note {
    grid-column: 1 / -1;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .history-when {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: end;
  }

  @media (width < 1000px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
