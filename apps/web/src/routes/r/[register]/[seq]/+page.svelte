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
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { amountOf, currencyOf } from '$lib/record/money.ts';
  import { holeLabel, relative, since, TONES } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import * as pending from '$lib/record/pending.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { actorOf, backlinks, dirOf, display, entry, iconFor, identityOf, labelOf, NOW, readableFields, REGISTERS, toneOf, values } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import { Table } from 'braindog-render/svelte';
  import { readHistory, type Told } from '$lib/record/history-live.ts';
  import { rowReader, type Got, type RowReader } from '$lib/record/row-live.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import { closed, drew, opened } from '../../../../lib/ui/screen.svelte.ts';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));
  const decl = $derived(REGISTERS[id]);

  /**
   * THE ROW MAY NOT BE IN THE RECORD YET, AND THIS SCREEN USED TO SAY IT DID NOT EXIST.
   *
   * A written row is the record's answer to `get`, or `entry()` over the sample when there is no
   * record here. A row somebody typed into the capture
   * line is in `pending` instead, wearing a NEGATIVE sequence so it can never collide with a real
   * one, and the list draws it with `Not saved` on it. Opening that row landed on "There is no
   * obligation #-1" - the product telling somebody the thing they had just typed, and could see one
   * screen back, was not there. The list and the detail were reading two different sets of rows.
   *
   * They are read in that order because a written row is the truth: if the same number ever
   * answered from both, the record wins.
   */
  let got = $state<Got | null>(null);
  const live = $derived(got?.from === 'live');
  /* NOTHING IS DRAWN UNTIL THE ROW HAS BEEN READ, so the sample never shows over a live row. */
  const waiting = $derived(Number.isInteger(seq) && seq >= 1 && got === null);
  const written = $derived(
    got?.from === 'live' ? (got.entry ?? undefined) : got?.from === 'sample' ? entry(id, seq) : undefined,
  );
  const unwritten = $derived(written ? undefined : pending.of(id).find((r) => r.seq === seq));
  const row = $derived(written ?? unwritten);

  /* WHAT POINTS AT THIS ROW. A `ref` declares `to:` and nothing declared the other direction, so a
     person's page could not show the invoices that are theirs — which is the half somebody opens a
     person for. Nothing was added to the data model: the inverse of every ref is already stated
     once, on the field that declares it. */
  /* NOT ON A LIVE RECORD: the record has no backlinks read yet, and the sample's would be another
     record's rows pointing at this one. The section is left out until that read exists. */
  const incoming = $derived(row && !live ? backlinks(id, seq) : []);

  /* THE ROW AND ITS HISTORY, IN ONE BRACKET, so `data-screen` never appears between the two reads. An
     answer for a row somebody has already left is dropped. `clock` is the reader's on a live record
     and the sample's own otherwise, since a sample date read against today is wrong by months. */
  let told = $state<Told | null>(null);
  let clock = $state(NOW);
  let askedFor = '';
  let reader: RowReader | null = null;

  async function readRow(register: string, n: number) {
    const key = `${register}#${n}`;
    askedFor = key;
    got = null;
    told = null;
    const at = opened();
    reader ??= rowReader(location.origin);
    const [r, h] = await Promise.all([reader.read(register, n), readHistory(location.origin, register, n)]);
    const current = askedFor === key;
    closed(!current || (r.from !== 'refused' && h.from !== 'refused'), at);
    if (!current) return;
    clock = r.from === 'live' ? Date.now() : NOW;
    got = r;
    told = h;
  }

  $effect(() => {
    const register = id;
    const n = seq;
    if (Number.isInteger(n) && n >= 1) untrack(() => void readRow(register, n));
  });

  /**
   * A NOTE ON THE ROW, which is a `log`: it changes no field and lands in the history beside the row.
   *
   * THE BOX IS EMPTIED ONLY ONCE THE RECORD HAS THE NOTE, so a refusal leaves the words where they were
   * typed. The history is read again after, and the new line in it is the answer, so there is no toast.
   * On the sample it says what would have happened, like every other write there.
   */
  let noteText = $state('');
  let noting = false;
  let writer: RowWriter | null = null;

  async function addNote(e: SubmitEvent) {
    e.preventDefault();
    const said = noteText.trim();
    if (!said || noting || !row || unwritten) return;
    if (!live) {
      toasts.push(copy.notWritten(copy.noteWouldBeAdded), { intent: 'warn' });
      return;
    }
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    noting = true;
    writer ??= rowWriter(location.origin);
    const out = await writer.note(register, n, said);
    noting = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    if (askedFor !== key) return;
    if (noteText.trim() === said) noteText = '';
    const at = opened();
    const h = await readHistory(location.origin, register, n);
    const current = askedFor === key;
    closed(!current || h.from !== 'refused', at);
    if (current) told = h;
  }

  const history = $derived(told && told.from !== 'refused' ? told.lines : []);
  /* THE RECORD'S ROW DOES NOT SAY WHO ADDED IT; its oldest event does. */
  const addedBy = $derived(live ? (history.at(-1)?.by ?? '') : (row?.by ?? ''));

  const stateValue = $derived(decl?.state ? String(row?.fields[decl.state] ?? '') : '');
  const tone = $derived(decl?.done?.includes(stateValue) ? ('good' as const) : undefined);


  /* A `document` is an argument, not a figure, so it never sits in the field list beside a date and
     a currency — it gets the room prose needs (05 §7.1). */
  /* `readableFields` and not `decl.fields`: a register's identity mark and its frozen hue are
     machinery, and listing them here printed "Mark  ▲" and "Hue  271" as though they were facts
     about the project rather than the reason it has a triangle beside its name. */
  const documents = $derived(readableFields(id).filter((f) => f.type === 'document'));
  const shortFields = $derived(readableFields(id).filter((f) => f.type !== 'document'));

  /**
   * WHAT THE ROW IS, BEFORE WHAT IT HOLDS.
   *
   * The page opened on a list of labelled fields, one per line, which is how a database shows a
   * record and not how anybody reads an invoice. A person opening one wants three things first: how
   * much, where it stands, and when. So the first money field is the page's figure, the state is a
   * word in its tone with its glyph, and the deadline sits beside it with how far off it is. The tone
   * is the list's own (`toneOf`), so a row drawn late in the list is drawn late here.
   *
   * A FIELD SHOWN HERE IS NOT SHOWN TWICE. The list below keeps everything else, and keeps these too
   * when they are empty, because "Not set" is a fact about the row that the lead has no room for.
   */
  const figureField = $derived(shortFields.find((f) => f.type === 'money'));
  const dueField = $derived(shortFields.find((f) => (f as { deadline?: boolean }).deadline === true));
  const figure = $derived(figureField && row ? amountOf(row.fields[figureField.id]) : null);
  const leadTone = $derived(row ? (toneOf(id, row, clock) ?? tone) : undefined);
  const due = $derived(dueField && row ? row.fields[dueField.id] : undefined);
  const hasLead = $derived(figure !== null || stateValue !== '');
  const leadIds = $derived(
    new Set([figure !== null ? figureField?.id : undefined, due ? dueField?.id : undefined, stateValue ? decl?.state : undefined].filter((x): x is string => Boolean(x))),
  );
  const listed = $derived(shortFields.filter((f) => !leadIds.has(f.id)));

  const resolved = values();
  /* THE SAMPLE'S VALUES ARE NOT THIS RECORD'S, so on a live row every value is a hole until pages read them. */
  const resolve = (path: string) => (live ? null : (resolved[path] ?? null));
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
   * `y` COPIES THE ID AND `⇧Y` THE LINK, which is what the grid does and what the button beside the
   * number does.
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
   * DRAWN ONCE THE ROW HAS BEEN READ, from the record or the sample.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim. The row and history reads are bracketed by `opened()` and `closed()`, so while
   * they are out the attribute is away whatever this line says.
   */
  $effect(() => {
    if (!waiting) drew('ready');
  });
</script>

<svelte:window {onkeydown} />

<svelte:head><title>{titleOf(row && decl && String(row.fields[decl.title] ?? ""), decl?.name)}</title></svelte:head>

{#if waiting}
  <!-- Nothing until the row has been read. -->
{:else if got?.from === 'refused'}
  <div class="page">
    <Empty kind="error" heading title={got.fix}>
      {#snippet actions()}<Button href="/r/{id}">Back to {decl?.name ?? id}</Button>{/snippet}
    </Empty>
  </div>
{:else if !decl || !row}
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
    {#if hasLead && row && decl}
      <section class="lead" aria-label={decl.one}>
        {#if figure !== null && figureField}
          <p class="lead-figure num">
            <Money minor={figure} currency={currencyOf(row.fields[figureField.id]) ?? ''} weight="strong" />
          </p>
        {/if}
        <p class="lead-line">
          {#if stateValue}
            <span class="lead-state" data-intent={leadTone}>
              {#if leadTone}<span class="glyph" role="img" aria-label={TONES[leadTone].label}>{TONES[leadTone].glyph}</span>{/if}
              <span class="lead-word">{stateValue.replace(/_/g, ' ')}</span>
            </span>
          {/if}
          {#if due && dueField}
            <span class="lead-due">{labelOf(dueField)} {display(id, dueField.id, due, clock)} <span class="rel">{relative(String(due), clock)}</span></span>
          {/if}
        </p>
      </section>
    {/if}
    <div class="split">
      <section class="fields">
        <dl class="field-list">
          {#each listed as f}
            {@const value = row.fields[f.id]}
            <div class="fact">
              <dt class="field-label">{labelOf(f)}</dt>
              <dd class="field-value" data-type={f.type} dir={dirOf(id, f.id)}>
                {#if value === null || value === undefined || value === ''}
                  <span class="missing">Not set</span>
                {:else if f.type === 'money'}
                  <Money minor={amountOf(value) ?? 0} currency={currencyOf(value) ?? ''} weight="strong" />
                {:else if f.id === decl.state}
                  <Chip label={String(value).replace(/_/g, ' ')} {tone} />
                {:else if identityOf(id, f.id, value)}
                  <IdentityMark identity={identityOf(id, f.id, value)!} size="md" />
                {:else if f.type === 'day'}
                  {display(id, f.id, value, clock)}
                  <span class="rel">{relative(String(value), clock)}</span>
                {:else if f.type === 'enum'}
                  <span class="enum-word">{display(id, f.id, value, clock)}</span>
                {:else}
                  {display(id, f.id, value, clock)}
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
                opts={{ resolve, link, now: clock, hole: (path) => toasts.push(copy.notWritten(holeFix(path)), { intent: 'warn' }) }}
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
        <h2 class="side-title">Details</h2>
        <dl class="meta">
          <dt>Number</dt>
          <!-- THE NUMBER YOU SAY, AND THE BUTTON THAT COPIES THE WHOLE ID. `#12` is what the header
               prints and what a person reads out; `obligations#12` is what lands on the clipboard,
               because pasted into a message it has to name the list too. `y` still copies it, and
               the `?` sheet lists the key rather than a chip beside the button. An unsaved row has
               no number, so it says so rather than printing the `#-1` that stands in for one. -->
          <dd class="id-line">
            {#if unwritten}
              <span class="missing">{copy.markNotWritten}</span>
            {:else}
              <span class="number">#{row.seq}</span>
              <button type="button" class="copy-id tap" onclick={() => clipboard.putSpoken(id, row.seq)}>
                <Icon name="copy" size="s" /><span>{copy.copyId}</span>
              </button>
            {/if}
          </dd>
          <dt>Added</dt>
          <!-- IN WORDS, like the other two surfaces that answer "who changed my record". `actorOf`
               moved into `api.ts` when Home and `/audit` were found spelling the same two actors two
               ways; this route was the third. -->
          <dd>{since(row.created, clock)}{#if addedBy} by {actorOf(addedBy)}{/if}</dd>
        </dl>

        {#if !unwritten}
          <form class="note-form" onsubmit={addNote}>
            <label class="note-label" for="row-note">{copy.noteLabel}</label>
            <div class="note-line">
              <input id="row-note" class="note-input" type="text" maxlength="280" autocomplete="off" bind:value={noteText} />
              {#if noteText.trim()}<Button type="submit">{copy.noteAdd}</Button>{/if}
            </div>
          </form>
        {/if}

        {#if told?.from === 'refused'}
          <h2 class="side-title">History</h2>
          <Empty kind="error" compact title={told.fix} />
        {:else if history.length}
          <h2 class="side-title">History</h2>
          <ol class="history">
            {#each history as e}
              {@const who = actorOf(e.by)}
              <li>
                <Face name={who} you={who === 'you'} size="s" />
                <span class="history-by">{who.charAt(0).toUpperCase() + who.slice(1)}</span>
                <span class="history-note">{e.note}</span>
                <span class="history-when">{since(e.at, clock)}</span>
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

  .incoming {
    margin-block-start: var(--sp-6);
  }

  /* THE FOUR HEADINGS ON THIS SCREEN ARE SECTION HEADINGS, and they were eyebrows: small, dim and
     led by an icon, so Details, History and each list pointing here read as captions over the
     facts. Twenty pixels at 600 in ink is what `Section` gives a heading everywhere else. */
  .incoming-title,
  .doc-label,
  .side-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.018em;
  }

  /* The FIELD's label, quieter than the register's name: "Obligations party" reads as one heading
     with the relation in it, where two words of equal weight read as two headings. A step down in
     size and weight, and `--dim` rather than `--faint`, which clears only the large-text floor. */
  .incoming-label {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    letter-spacing: 0;
  }

  /* The count the way `Section` draws one: beside the title, in the body face, dim. */
  .incoming-count {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
    font-variant-numeric: tabular-nums;
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

  /* UNBOXED, like every list since `rows.css`: the fields sit on the page with a hairline between
     each, and a label starts where the heading above it starts. */
  .field-list {
    margin: 0;
  }

  /* A FACT AND NOT A FIELD. The class was field, which controls.css gives to a text-input wrapper, so
     every row of this list wore an input box: a surface, a border and a radius, eight boxes that read
     as a form to fill in. The name is the fix; nothing here fights the input style. */
  .fact {
    display: grid;
    grid-template-columns: minmax(0, 16ch) minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: baseline;
    padding: var(--sp-3) 0;
    border-block-end: 1px solid var(--line);
  }

  .fact:last-child {
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

  .number {
    font-variant-numeric: tabular-nums;
  }

  /* A NOTE ON THE ROW: one line and its button, the capture line's box at the size a finger needs. */
  .note-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-5);
  }

  .note-label {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .note-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .note-input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: max(var(--ctl-h), var(--tap));
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .note-input:hover {
    border-color: var(--edge);
  }

  .history {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* WHO, AS A FACE AND A NAME, the shape of Home's feed: a disc with the initial beside the name
     and the note, so a row's history reads as people passing through rather than as a log. */
  .history li {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    gap: 2px var(--sp-2);
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--line);
  }

  .history li > :global(.face) {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .history-by {
    grid-column: 2;
    grid-row: 1;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .history-note {
    grid-column: 2 / -1;
    grid-row: 2;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .history-when {
    grid-column: 3;
    grid-row: 1;
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

  /* The row's figure, its state and its date, above the fields. See `figureField` for why. */
  .lead {
    display: grid;
    gap: var(--sp-2);
    margin-block-end: var(--sp-6);
  }

  .lead-figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-3xl);
    font-weight: 600;
    letter-spacing: var(--tr-tight);
    line-height: var(--lh-3xl);
  }

  /* The code in front of the figure at half its size, the way every headline figure sets it. */
  .lead-figure :global(.code) {
    font-size: 0.5em;
    font-weight: 600;
  }

  .lead-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    color: var(--ink2);
  }

  /* The state in its tone as TEXT on the page's own ground, never over a tint of itself. */
  .lead-state {
    display: inline-flex;
    align-items: baseline;
    gap: var(--sp-1);
    color: var(--tone, var(--ink));
    font-weight: 600;
  }

  /* Sentence case in the stylesheet, so the text stays the record's own word. */
  .lead-word {
    display: inline-block;
  }

  .lead-word::first-letter {
    text-transform: uppercase;
  }

  .lead-due .rel {
    margin-inline-start: var(--sp-1);
    color: var(--dim);
  }

  /* A declared value in sentence case, in the stylesheet, so the text stays the record's own word. */
  .enum-word {
    display: inline-block;
  }

  .enum-word::first-letter {
    text-transform: uppercase;
  }
</style>
