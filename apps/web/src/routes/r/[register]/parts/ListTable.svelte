<!--
  The list at 640px and wider: the grid, each cell as the reader sees it, the editor a cell becomes,
  and the row's own verbs and receipt in its last cell.

  The grid is CSS grid with DECLARED column tracks, not a `<table>`, and that is a measured decision
  rather than a taste one. At 8 columns in Chrome 151, `<table>` layout scales superlinearly,
  26.9 / 59.6 / 149 / 318 / 790 ms across 500 / 1k / 2k / 5k / 10k rows, and `content-visibility`
  does not work on table rows, by spec and by measurement. Grid with chunked CV takes 5,000 rows to
  0.6 ms of layout (22 §4). `Table` draws it; this file hands it the cells.

  THE PAGE HOLDS EVERYTHING THIS DRAWS. Which cell is being edited and what is typed in it, the
  selection, the receipts and every write are `+page.svelte`'s, and reach this file as props and
  callbacks that keep the page's own names (`openEditor`, `commitEdit`, `toggleSelect`, `archive`),
  so a line here reads as it did when it was written there.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { valueSaid } from '$lib/voice.ts';
  import { dayThisYear, symbolFigure } from 'braindog-render';
  import { Table, type Column, type TableRow } from 'braindog-render/svelte';
  import { display, DOM_CAP, homeCurrency, identityOf, labelOf } from '$lib/record/api.ts';
  import { currencyTypedIn } from '$lib/ui/money-typed.ts';
  import { isFile, isJson, isQuantity, unitOf, unitsOf } from '$lib/record/field-draft.ts';
  import { page } from '$app/state';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { afterMove, movesIn, opensMove, scopeFieldOf, scopeOf, words as scopeWords, type Landed } from '$lib/record/scope-move.ts';
  import ScopeMove from '../[seq]/ScopeMove.svelte';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry, FieldDecl, RegisterDecl } from '$lib/record/schema.ts';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import DayBox from '$lib/ui/DayBox.svelte';
  import QuantityBox from '$lib/ui/QuantityBox.svelte';
  import JsonBox from '$lib/ui/JsonBox.svelte';
  import FileField from '$lib/ui/FileField.svelte';
  import RefPick from '$lib/ui/RefPick.svelte';
  import { peopleMayBe } from '$lib/ui/ref-pick.ts';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { pictureOfRow } from '$lib/picture/picture.ts';
  import { ofPeople } from '$lib/ui/RowCards.svelte';
  import StateDot from '$lib/ui/StateDot.svelte';
  import { rowIn, rowOut, settle } from '$lib/ui/motion.ts';
  import { OWN_TYPES } from '$lib/ui/own.ts';
  import { menuAt, type MenuAt } from '$lib/ui/context-menu.ts';
  import { SELECTION_MENU, boxOf, deadlineOf, dotOf, dueOf, withoutGood, withoutZeros, type Receipt } from './list.ts';

  let {
    register,
    decl,
    columns,
    rows,
    total,
    sort,
    now,
    whole,
    pickable,
    selected,
    selectedKeys,
    focus = $bindable(),
    editing,
    editValue = $bindable(''),
    editTicked = $bindable(false),
    fresh,
    names,
    onmore,
    onsort,
    onheadmenu,
    onactivate,
    rowAt,
    fieldOf,
    editableHere,
    shownValue,
    listCurrency,
    receiptFor,
    toggleSelect,
    selectAll,
    openEditor,
    commitEdit,
    cancelEdit,
    leftTheRow,
    cellKeys,
    archive,
    openCardMenu,
  }: {
    register: string;
    decl: RegisterDecl;
    columns: readonly Column[];
    rows: readonly TableRow[];
    /** `aria-rowcount`'s data rows, which the page gives three states (`rowCount`). */
    total: number;
    sort: { field: string; dir: 'asc' | 'desc' } | undefined;
    /** The record's instant, which a late row's days are counted from. */
    now: number;
    /** The money columns where every amount is whole (`wholeMoney`), drawn without their ".00". */
    whole: ReadonlySet<string>;
    /** Whether the list is long enough to pick rows from, which draws the picker among each row's verbs. */
    pickable: boolean;
    /** The picked rows by number, which the picker draws. */
    selected: ReadonlySet<number>;
    /** The same rows as the keys `Table` speaks in (`register#seq`). */
    selectedKeys: Set<string>;
    focus?: { row: number; col: number } | undefined;
    editing: { seq: number; field: string } | null;
    editValue?: string;
    editTicked?: boolean;
    /** The rows just added, marked for a moment so the eye can find them. */
    fresh: ReadonlyMap<number, number>;
    names: Names | undefined;
    /** Absent when there is no next page, which is how `Table` knows to draw no sentinel. */
    onmore?: (() => void) | undefined;
    /** Absent when there is nothing to order, so the headers are plain labels. */
    onsort?: ((field: string) => void) | undefined;
    onheadmenu?: ((field: string, point: { x: number; y: number; height: number }) => unknown) | undefined;
    onactivate: (row: TableRow) => void;
    rowAt: (seq: number) => Entry | undefined;
    fieldOf: (field: string) => FieldDecl | undefined;
    editableHere: (field: string) => boolean;
    shownValue: (seq: number, field: string) => unknown;
    listCurrency: (field: string) => string | null;
    receiptFor: (seq: number) => Receipt | undefined;
    toggleSelect: (seq: number, extend: boolean) => void;
    /** Pick every row on screen, or none: the box over the column of pickers. */
    selectAll?: ((on: boolean) => void) | undefined;
    openEditor: (seq: number, field: string) => void;
    commitEdit: () => void;
    /** Escape in a cell: the editor closes, and the blur that follows is not a commit. */
    cancelEdit: () => void;
    leftTheRow: (e: FocusEvent) => void;
    cellKeys: (e: KeyboardEvent, enterCommits: boolean) => void;
    /** Absent for a caller whose level cannot change the list, and the row's Archive is then not drawn. */
    archive?: ((seq: number) => void) | undefined;
    /** The row's menu, hung from its "…", or at the pointer when a right-click or a held thumb opened it. */
    openCardMenu: (seq: number, el: HTMLElement, point?: MenuAt) => void;
  } = $props();

  /* THE PERSON'S OWN WORDS, AS WRITTEN (`data-own`, `lib/ui/own.ts`): a text field holds what somebody typed, which the
     look's words check forgives, while a date, an amount or a choice is drawn by the app and is still read. */
  const ownWords = (field: string): boolean => OWN_TYPES.has(fieldOf(field)?.type ?? '');

  /**
   * WHAT A DOT MEANS, AT 1440.
   *
   * THE DOT SITS BESIDE THE DATE IT IS ABOUT. The row's tone is its deadline's, and it was drawn in the
   * status column, so "Open" wore a red dot that meant overdue and "Live" an amber one that meant due
   * soon. The deadline column carries the tone now, whichever column the page marked; with that column
   * hidden in Display, `Table` puts the dot at the head of the row's first value, as it does for any
   * table that names no tone column.
   *
   * AND A FINISHED ROW HAS NONE. "Cleared" and "Paid" are the calm states, and a green dot on every
   * cleared line of a ledger said nothing but that the ledger was a ledger.
   */
  const dated = $derived(deadlineOf(decl));
  const toned = $derived(columns.map((c) => ({ ...c, tone: c.field === dated })));
  /* A ROW THIS PERSON HAS JUST ADDED WEARS THE ARRIVAL WASH, as a row that landed from elsewhere does: the neutral
     `--arrived`, fading over 1.5s (motion F7.1). */
  const calm = $derived(withoutGood(rows).map((r) => (fresh.has(Number(r.key.split('#')[1])) && !r.arrived ? { ...r, arrived: true } : r)));
  /* EVERY ROW ON SCREEN IS PICKED, which the select-all box says, and some, which it says as a dash. */
  const allPicked = $derived(rows.length > 0 && rows.every((r) => selected.has(Number(r.key.split('#')[1]))));
  /* A LIST OF PEOPLE, whose titles each wear a face rather than a project's mark (`RowCards`' `ofPeople`). */
  const faced = $derived(ofPeople(decl));

  /** A value as its cell says it: an amount by its symbol, and without its ".00" where the whole column has none. */
  /* A DAY IN THE READER'S OWN YEAR IS SAID WITHOUT IT (P22), "1 Jul" and not "1 Jul 2026", as every timeline says it. */
  const figureCell = (field: string, value: string): string => {
    const drawn = symbolFigure(value) ?? value;
    return whole.has(field) ? withoutZeros(drawn) : dayThisYear(drawn, now);
  };

  /**
   * A LATE ROW SAYS SO, ON THE DATE THAT MADE IT LATE: "38 days late" before the day, in the cell's one red. The head
   * counted "4 late" over a list where a late row was told from the rest by the colour of its date alone.
   */
  const lateSaid = (row: TableRow, field: string): string | null => {
    if (field !== dated || row.tone !== 'bad') return null;
    const entry = rowAt(Number(row.key.split('#')[1]));
    const due = entry ? dueOf(decl, entry, now) : null;
    return due?.late ? due.text : null;
  };

  /**
   * WHERE A ROW APPLIES MOVES FROM ITS CELL, as it moves from the row's own page: one press on the chip opens the
   * projects, one more moves the row, and its history reads "Moved to Kiln" under the name of whoever pressed. It was a
   * screen away. A list whose rows name several projects, or a reader who may not write it, keeps the chip as words.
   *
   * ONE SHEET FOR THE WHOLE TABLE, beside it and not in a cell (`ScopeMove`'s `compact`): the chip in each cell opens it
   * for its own row. Until the list reads the row again, the cell says where the move put it (`afterMove`).
   */
  const moves = $derived.by(() => {
    const shell = page.data as unknown as Partial<Shell>;
    return shell.me !== undefined && movesIn(register, may(shell as Shell, 'write', register));
  });
  let mover = $state<ReturnType<typeof ScopeMove>>();
  let landed = $state<Record<number, Landed>>({});
  const placeOf = (seq: number) => {
    const e = rowAt(seq);
    return e ? afterMove(e, scopeOf(register, e.fields, names), landed[seq]).scope : undefined;
  };
  const titleOf = (seq: number): string => display(register, decl.title, rowAt(seq)?.fields[decl.title]) ?? copy.thisRow;
  function moveFrom(seq: number, from: HTMLElement | null) {
    const e = rowAt(seq);
    if (e) mover?.openFor(e, titleOf(seq), from);
  }

  /**
   * THE CHIP IS NOT A TAB STOP OF ITS OWN, like every control in a row: a grid has one, and the keyboard reaches the
   * cell. So Enter and Space on the cell that holds the chip open the move rather than the row, in the capture phase,
   * before the cell's own Enter (`Table`) and the list's keys hear them. Every other cell keeps Enter for the row.
   */
  const cellOpens = (seq: number) => (node: HTMLElement) => {
    const cell = node.closest<HTMLElement>('[role="gridcell"]');
    if (!cell) return;
    const keys = (e: KeyboardEvent) => {
      if (e.target !== cell || !opensMove(e)) return;
      e.preventDefault();
      e.stopPropagation();
      moveFrom(seq, cell);
    };
    cell.addEventListener('keydown', keys, true);
    return () => cell.removeEventListener('keydown', keys, true);
  };
</script>

<div class="table-slot" data-picking={selected.size > 0 ? '' : undefined}>
  <!--
    WHAT LEADS A TITLE: THE MARK OF A ROW THAT HAS JUST ARRIVED, AND ON A LIST OF PEOPLE A FACE.

    THE PROJECT'S SHAPE WENT. A diamond, a triangle or a dot started every title, and it said "some
    project" to nobody who had not learnt the shapes. The project is a column of its own now (`columnsFor`), its name
    beside a small dot of its colour, where it can be read.
  -->
  {#snippet ownMark(seq: number)}
    <!-- THE MARK ON A ROW THAT HAS JUST ARRIVED. It is `aria-hidden` because the row already says what happened to it
         in words, in the chip at the row's end; this is for the eye finding the row. The page's `showRow` finds the row
         by this attribute, so what is scrolled to and what is marked cannot disagree. -->
    {#if fresh.has(seq)}<span class="fresh" data-fresh={seq} aria-hidden="true"></span>{/if}
    <!-- A PERSON IS LED BY THEIR FACE, drawn from the name the title cell prints beside it; `Face` is `aria-hidden`. -->
    {#if faced}<span class="row-face"><Face name={display(register, decl.title, rowAt(seq)?.fields[decl.title]) ?? ''} kind="person" size="s" picture={pictureOfRow(register, rowAt(seq)?.fields ?? {})} row="{register}#{seq}" /></span>{/if}
    <!-- A LOCK ON A ROW ITS MAKER KEPT PRIVATE: only they are reading this, so it says nothing more than it is theirs. -->
    {#if rowAt(seq)?.private}<span class="row-lock" title={copy.rowPrivateLock}><Icon name="lock" size="s" /><span class="row-lock-word">{copy.rowPrivateLock}</span></span>{/if}
  {/snippet}
  <!-- A VALUE OF A CHOICE FIELD, in sentence case; the list's state also wears a small dot of where the row stands. -->
  {#snippet enumSaid(row: TableRow, field: string, value: string)}
    {#if field === decl.state}
      {@const stored = String(rowAt(Number(row.key.split('#')[1]))?.fields[field] ?? '')}
      <!-- EVERY STATE IS SAID, THE ONE A ROW IS BORN IN TOO (pages polish, 2 Nov): from 1 Nov (L9) "Open" was left blank,
           so a blank cell meant Open on a laptop while the phone's card said it, and an empty cell read as a value missing. -->
      <span class="state" data-stand={dotOf(decl, stored)}><StateDot state={dotOf(decl, stored)} /><span class="enum">{copy.valueWord(value)}</span></span>
    {:else}<span class="enum">{copy.valueWord(value)}</span>{/if}
  {/snippet}
  <!-- ANY OTHER VALUE: an amount as the column draws it, and a late row's deadline with how late it is before the day. -->
  {#snippet plainSaid(row: TableRow, field: string, value: string)}
    {@const late = lateSaid(row, field)}
    {#if late}<span class="late-dot"><StateDot state="late" /></span><span class="late-word">{late}</span><span class="late-sep" aria-hidden="true">{' · '}</span><span class="late-day">{figureCell(field, value)}</span>{:else}{figureCell(field, value)}{/if}
  {/snippet}
  <!-- THE SELECT-ALL BOX over the column of pickers: every row on screen, or none. A dash when some are picked. -->
  {#snippet selectHead()}
    <button
      type="button"
      class="pick pick-all tap"
      data-on={allPicked ? '' : selected.size > 0 ? 'some' : undefined}
      aria-label={allPicked ? copy.deselect : copy.select}
      aria-pressed={allPicked ? 'true' : selected.size > 0 ? 'mixed' : 'false'}
      onclick={() => selectAll?.(!allPicked)}
    >{#if allPicked}<Icon name="check" size="s" />{:else if selected.size > 0}<span class="pick-some" aria-hidden="true"></span>{/if}</button>
  {/snippet}
  <!-- ONE ROW HAS NOTHING TO SORT. `onsort` is optional and the table draws a plain label
       without it, so eight header buttons over a single row, each announcing
       `aria-sort="none"`, become eight headings. -->
  <Table
    columns={toned}
    rows={calm}
    home={homeCurrency()}
    {total}
    cap={DOM_CAP}
    {onmore}
    label={decl.name}
    href={at}
    {sort}
    selected={selectedKeys}
    menuHost={(key) => (selectedKeys.size > 1 && selectedKeys.has(key) ? SELECTION_MENU : '')}
    bind:focus
    {onactivate}
    {onsort}
    {onheadmenu}
    rowin={rowIn}
    rowout={rowOut}
    {settle}
    headCells={pickable ? { select: selectHead } : undefined}
  >
    {#snippet cellSnippet(row, column, value)}
      {@const seq = Number(row.key.split('#')[1])}
      {@const ident = identityOf(register, column.field, rowAt(seq)?.fields[column.field], names)}
      {@const isTitle = column.field === decl.title}
      {@const isEnum = fieldOf(column.field)?.type === 'enum'}
      {#if column.field === 'select'}
        <!-- THE PICKER, LEADING THE ROW: a 16px box, ticked in the button red. It is `tabindex="-1"`, since a grid has one
             tab stop; the keyboard path is `x`, which the `?` sheet advertises. `mousedown` keeps focus where it is. -->
        {@const name = display(register, decl.title, rowAt(seq)?.fields[decl.title]) ?? copy.thisRow}
        <button
          type="button"
          class="pick tap"
          tabindex="-1"
          data-on={selected.has(seq) ? '' : undefined}
          aria-label="{selected.has(seq) ? copy.deselect : copy.select} {name}"
          aria-pressed={selected.has(seq) ? 'true' : 'false'}
          onmousedown={(e) => e.preventDefault()}
          onclick={(e) => {
            /* The cell activates the row. Without this, picking one opened it. */
            e.stopPropagation();
            toggleSelect(seq, e.shiftKey);
          }}>{#if selected.has(seq)}<Icon name="check" size="s" />{/if}</button>
      {:else if column.field === 'seq'}
        <!-- EVERY ROW HERE HAS A NUMBER THE RECORD GAVE IT, and it is drawn as the number under the
             column's name, with no "#" in front: the cell's text is `toRows`' spoken
             form, which is for a sentence and not for a column headed Number.
        --><span class="row-seq">{seq}</span>
      {:else if editing?.seq === seq && editing.field === column.field}
        <!--
          THE CELL BECOMES THE EDITOR, in the box the value is already drawn in.

          `autofocus` IS RIGHT HERE AND WRONG ALMOST EVERYWHERE ELSE. The rule against it is
          about a caret moving on page load, before the reader has decided anything; this
          element exists only because they just asked for it, and an editor that opens without
          the caret in it is an editor that costs a second gesture to use.

          ENTER COMMITS AND ESCAPE CANCELS, and blurring commits too: a person who clicks away
          has finished with the cell, and throwing their typing away for it is the behaviour
          every spreadsheet taught them not to expect. `stopPropagation` on the keys, or the
          grid's own handler reads them as navigation and the caret leaves mid-word.

          IT COMMITS ON LEAVING THE ROW, NOT ON LEAVING THE FIELD, and the difference is a bug no screenshot
          can hold. `blur` fires when focus moves anywhere at all, including to the row's own verbs one cell
          over, so pressing `Put back` beside a cell you were editing committed the edit on the way to
          undoing it, and clicking the pencil of the next cell along wrote the first before opening the
          second. `focusout` carries where focus WENT, so focus landing inside the same row leaves the
          editor open and everything else commits, which is the rule a person already holds: you have
          finished with a row when you leave the row.
        -->
        {@const f = fieldOf(column.field)}
        {#if f?.type === 'enum'}
          <!-- svelte-ignore a11y_autofocus -->
          <select
            class="cell-edit"
            autofocus
            bind:value={editValue}
            onclick={(e) => e.stopPropagation()}
            onchange={() => commitEdit()}
            onfocusout={leftTheRow}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') cellKeys(e, false);
            }}
          >
            {#each f.values ?? [] as v}<option value={v}>{valueSaid(f, v)}</option>{/each}
          </select>
        {:else if f?.type === 'bool'}
          <!-- A YES OR NO IS A TOGGLE, and the press is the edit: it commits on change, as the menu above does,
               so there is nothing to type and nothing to confirm. Escape before the press still leaves it. -->
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="cell-tick"
            type="checkbox"
            autofocus
            aria-label={labelOf(f)}
            bind:checked={editTicked}
            onclick={(e) => e.stopPropagation()}
            onchange={() => commitEdit()}
            onfocusout={leftTheRow}
            onkeydown={(e) => cellKeys(e, true)}
          />
        {:else if f?.type === 'document'}
          <!-- A DOCUMENT KEEPS ITS LINE BREAKS. A one-line box drops every newline in the value it is handed,
               so the prose would be flattened by opening it; here Enter is a new line and ⌘Enter commits. -->
          <!-- svelte-ignore a11y_autofocus -->
          <textarea
            class="cell-edit"
            rows="1"
            autofocus
            bind:value={editValue}
            onclick={(e) => e.stopPropagation()}
            onfocusout={leftTheRow}
            onkeydown={(e) => cellKeys(e, false)}
          ></textarea>
        {:else if f?.type === 'day'}
          <!-- A DAY IN THE RECORD'S WORDS, `3 Sep 2026`, and not the browser's `mm/dd/yyyy`. -->
          <DayBox
            fit="cell"
            autofocus
            label={labelOf(f)}
            bind:value={editValue}
            onclick={(e) => e.stopPropagation()}
            onfocusout={leftTheRow}
            onkeydown={(e) => cellKeys(e, true)}
          />
        {:else if f && isQuantity(f)}
          <!-- A NUMBER AND THE UNIT IT COUNTS, the unit chosen from the ones the field knows. Moving between
               the two stays inside the row, so `leftTheRow` keeps the editor open. -->
          <QuantityBox
            fit="cell"
            autofocus
            units={unitsOf(f, shownValue(seq, column.field))}
            label={labelOf(f)}
            bind:value={editValue}
            onclick={(e) => e.stopPropagation()}
            onfocusout={leftTheRow}
            onkeydown={(e) => cellKeys(e, true)}
          />
        {:else if f?.type === 'ref' && f.to}
          <!-- A LINK IS PICKED BY NAME, as on the row page and the new-row form, and a pressed row is the edit: it
               commits at once, as the enum's menu does. The box's own keys (arrows, Enter on the list, Esc on the
               list) stop at it; past them Enter commits and Esc cancels as any cell's do. The click stays in the
               cell, or picking a row opened the row. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <span
            class="cell-box cell-pick"
            onclick={(e) => e.stopPropagation()}
            onfocusout={leftTheRow}
            onkeydown={(e) => {
              e.stopPropagation();
              if (!e.defaultPrevented) cellKeys(e, true);
            }}
          >
            <RefPick to={f.to} people={peopleMayBe(f)} label={labelOf(f)} autofocus fixed bind:value={editValue} onpick={() => commitEdit()} />
          </span>
        {:else if f && isFile(f)}
          <!-- A FILE IS CHOSEN, NEVER TYPED: the picker sends the bytes and the draft holds what came back,
               saved through the same commit as any other cell once the row is left. -->
          <!-- The box only keeps a click inside the cell from opening the row; the picker in it is the control. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <span class="cell-box" onclick={(e) => e.stopPropagation()} onfocusout={leftTheRow}>
            <FileField bind:value={editValue} label={labelOf(f)} />
          </span>
        {:else if f && isJson(f)}
          <!-- STRUCTURED DATA KEEPS ITS LINE BREAKS, so Enter is a new line and the grid's Cmd+Enter commits, as a
               document's cell does. -->
          <JsonBox
            fit="cell"
            autofocus
            label={labelOf(f)}
            bind:value={editValue}
            onclick={(e) => e.stopPropagation()}
            onfocusout={leftTheRow}
            onkeydown={(e) => cellKeys(e, false)}
          />
        {:else}
          {@const box = boxOf(f?.type)}
          <span class="cell-box">
            <!-- THE CURRENCY THE AMOUNT GOES BACK IN, drawn beside the box because the box holds the amount alone:
                 the row's own, else the field's declared one, the list's, then the record's, in the order the save
                 writes it. It ended in `'GBP'`, so an empty money cell on any record was labelled sterling; with
                 none known no code is drawn, and the save says why it wrote nothing. -->
            {#if f?.type === 'money'}
              {@const unit = currencyTypedIn(f, listCurrency(column.field), shownValue(seq, column.field))}
              {#if unit}<span class="cell-unit">{unit}</span>{/if}
            {/if}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="cell-edit"
              autofocus
              type={box.type}
              inputmode={box.inputmode}
              bind:value={editValue}
              onclick={(e) => e.stopPropagation()}
              onfocusout={leftTheRow}
              onkeydown={(e) => cellKeys(e, true)}
            />
            <!-- AND THE UNIT A DURATION IS TYPED IN, after the number as the cell draws it: `2 h` opens on `2` beside `h`. -->
            {#if f?.type === 'duration'}<span class="cell-unit">{unitOf(f)}</span>{/if}
          </span>
        {/if}
      {:else if column.field === 'act'}
        <!--
          THE ROW'S OWN VERBS, AND ITS RECEIPT, IN THE CELL THE ROW ALREADY HAS.

          `tabindex="-1"` ON EVERY CONTROL, like the picker two cells over and for the same
          reason: a grid is a composite widget with exactly one tab stop, so at five hundred
          rows a focusable control per row is fifteen hundred tab stops. The keyboard path is
          the one the `?` sheet already advertises and this is the pointer path.

          `stopPropagation` ON EVERY ONE, because the cell activates the row: without it,
          archiving a row opened it on the way out.
        -->
        {@const said = receiptFor(seq)}
        {@const name = display(register, decl.title, rowAt(seq)?.fields[decl.title]) ?? copy.thisRow}
        {#if said}
          <span class="said" data-archived={said.mark === copy.markArchived ? '' : undefined}>
            <Chip label={said.short ?? said.mark} tone={said.intent} />
            {#if said.undo}
              <!-- IT REFUSES FOCUS ON MOUSEDOWN, which is the third of the three rules and the one that
                   reads as superstition until it is measured. A press is mousedown, then focus, then
                   mouseup, then click, so the focus that a press moves happens BEFORE the click it is
                   part of. Undoing an edit from a cell you were typing in therefore committed that edit
                   first, from the focusout the press itself caused, and the undo then put back a value
                   that had just been overwritten by the gesture meant to discard it. Preventing the
                   default on mousedown keeps focus where it is; the click still fires. -->
              <button
                type="button"
                class="verb"
                tabindex="-1"
                aria-label={copy.undoRowOf(name)}
                onmousedown={(e) => e.preventDefault()}
                onclick={(e) => {
                  e.stopPropagation();
                  said.undo?.();
                }}>{copy.undoRow}</button>
            {/if}
          </span>
        {:else}
          <span class="verbs">
            {#if archive}<button
              type="button"
              class="verb icon tap"
              tabindex="-1"
              aria-label={copy.archiveRow(name)}
              onmousedown={(e) => e.preventDefault()}
              onclick={(e) => {
                e.stopPropagation();
                archive?.(seq);
              }}><Icon name="archive" size="s" /></button>{/if}
            <button
              type="button"
              class="verb icon tap"
              tabindex="-1"
              aria-label={copy.moreOn(name)}
              aria-haspopup="menu"
              aria-expanded="false"
              {@attach menuAt((p) => openCardMenu(seq, p.back ?? document.body, p))}
              onclick={(e) => {
                e.stopPropagation();
                openCardMenu(seq, e.currentTarget);
              }}><Icon name="more" size="s" /></button>
          </span>
        {/if}
      {:else if column.field === scopeFieldOf(register)?.id && scopeOf(register, rowAt(seq)?.fields ?? {}, names) !== undefined}
        <!-- WHERE THE ROW APPLIES, AS A CHIP: the project's mark and name, or the globe and "Everywhere", where an empty
             cell drew nothing. Where the row can move, the chip is the press that moves it, and the press does not open
             the row. `tabindex="-1"` as every control in a row is; its cell's Enter and Space reach it (`cellOpens`). -->
        {@const place = placeOf(seq) ?? null}
        {#if moves}
          <button
            type="button"
            class="scope-at tap"
            tabindex="-1"
            aria-label={scopeWords.moveLabel(place?.name ?? scopeWords.everywhere)}
            onclick={(e) => {
              e.stopPropagation();
              moveFrom(seq, e.currentTarget);
            }}
            {@attach cellOpens(seq)}><ScopeChip scope={place} /><span class="scope-at-open"><Icon name="chevronDown" size="s" /></span></button
          >
        {:else}
          <ScopeChip scope={place} />
        {/if}
      {:else if ident}
        <!-- A PROJECT IS ITS 8px SLOT DOT AND ITS NAME, as where a row applies reads: the lettered well in every
             row was a column of badges. A retired one is the quiet ink. -->
        <span class="ident" data-retired={ident.retired ? '' : undefined}><ScopeChip scope={{ spoken: ident.name, name: ident.name, mark: ident.mark, hue: ident.hue }} /></span>
      {:else if value === null}
        <!-- AN EMPTY CELL DRAWS NOTHING. A dash in every gap was a column of marks that meant
             nothing; only a title says so, because a row with no name needs words to be found. -->
        {#if isTitle}{@render ownMark(seq)}<span class="missing">Not set</span>{/if}
      {:else if editableHere(column.field)}
        <!--
          THE POINTER PATH, AND IT WAS KEYBOARD ONLY. `e` has been on the `?` sheet since the
          grid was written, so the capability existed for anybody who already knew it was
          there, which is nobody on their first afternoon.

          THE PENCIL IS A BUTTON AND NOT A DOUBLE CLICK. A double click is what a spreadsheet
          taught everybody and it is invisible: nothing on the screen says the gesture exists,
          and a single click on this cell already means what it means everywhere else here,
          open the row. Two meanings on one target would make the list dangerous to browse.
          A control that is drawn is a control somebody finds.

          IT APPEARS ON HOVER AND ON KEYBOARD FOCUS AND TAKES NO SPACE OTHERWISE. A permanent
          glyph in every cell of every row is a column of noise over the data somebody came to
          read, and a capability that says so nowhere is a capability nobody uses.

          `tabindex="-1"`, LIKE THE PICKER TWO CELLS OVER. A grid is a composite widget with
          exactly one tab stop; at five hundred rows and eight editable columns a focusable
          control per cell is four thousand tab stops. The keyboard path is `e`, which the `?`
          sheet has advertised since the grid was written.
        -->
        <span class="cell-said" data-own={ownWords(column.field) ? '' : undefined}>{#if isTitle}{@render ownMark(seq)}{/if}{#if isEnum}{@render enumSaid(row, column.field, value)}{:else}{@render plainSaid(row, column.field, value)}{/if}<button
            type="button"
            class="cell-pen"
            tabindex="-1"
            aria-label={copy.editValue(labelOf(fieldOf(column.field)!))}
            onclick={(e) => {
              e.stopPropagation();
              openEditor(seq, column.field);
            }}
          ><Icon name="edit" size="s" /></button></span>
      {:else}{#if isTitle}{@render ownMark(seq)}{/if}{#if isEnum}{@render enumSaid(row, column.field, value)}{:else}{@render plainSaid(row, column.field, value)}{/if}{/if}
    {/snippet}
  </Table>
</div>

{#if moves}
  <ScopeMove bind:this={mover} {register} {names} live={moves} compact onmoved={(got) => {
      if (got) landed = { ...landed, [got.seq]: got };
    }} />
{/if}

<style>
  /* Sentence case is the stylesheet's, on the first letter, so the word stays the one the record
     stores and the empty state quotes. */
  .enum {
    display: inline-block;
  }

  .enum::first-letter {
    text-transform: uppercase;
  }

  /* ── editing a value where it is drawn ────────────────────────────────── */

  /* A MONEY'S CURRENCY BESIDE ITS BOX, and the box takes what is left of the cell. */
  .cell-box {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  /* A LINK'S PICKER TAKES THE WHOLE CELL, so the name in it is not cut to its first letters. */
  .cell-pick {
    inline-size: 100%;
  }

  .cell-pick > :global(.pick) {
    flex: 1;
  }

  .cell-unit {
    flex: none;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .cell-tick {
    margin: 0;
  }

  /* THE EDITOR IS THE CELL, so it takes the cell's box and none of its own. A control that grew the
     row would push every row below it down the instant somebody started typing, which is the one
     thing a list must not do while a person is reading it. */
  .cell-edit {
    resize: none;
    inline-size: 100%;
    min-inline-size: 0;
    padding: 0 2px;
    background: var(--tile-2);
    border: 1px solid var(--ink-2);
    border-radius: var(--r-xs);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  /**
   * WHERE A ROW STANDS, AS ITS STATE'S DOT BEFORE ITS WORD (`StateDot`): a ring while it is open, half filled when part
   * of it is done, slate once finished. Never red: a late row says so on its date, in words, with the one red dot.
   */
  .state {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .state[data-stand='done'] {
    color: var(--ink-2);
  }

  .late-dot {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
  }

  /* THE FACE SITS ON THE TITLE'S LINE, in the middle of it, with the gap a mark keeps before the words. Its disc is one
     neutral tint on every row: a column of pastel hues read as decoration, and the name says who. */
  .row-face {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
  }

  .row-lock {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
    color: var(--ink-2);
  }

  .row-lock-word {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .row-face :global(.face[data-kind]) {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  /* THE ROW'S NUMBER, QUIET, IN THE BODY FACE with tabular figures, so a column of them lines up. It was
     the identifier face, and mono is for what a person wrote as code, never for a number. */
  .row-seq {
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  /* ONE HAIRLINE BETWEEN ROWS AND NONE AROUND THE TABLE. Every row draws the line under
     itself, so the last one drew a rule under the list that closed it like a box. The last group is the
     one with no group after it, since the paging sentinel can follow it. */
  .table-slot :global(.rowgroup:not(:has(~ .rowgroup)) > .tr:last-child) {
    border-block-end-color: transparent;
  }

  /**
   * A CLEAN TABLE ON THE GROUND: the heads at the meta size in the quiet ink, a hairline between rows,
   * and a rounded wash under the row a pointer is on. Only the hooks `Table` already draws are reached for here.
   *
   * THE ROW IS THE READER'S ROW HEIGHT, `--row-h`: 44 at Comfortable, and Compact and Roomy move it, which the
   * table's own `--table-row-h` does not. Under a thumb it never falls below the 44 a target needs.
   *
   * THE GRID HANGS ONE CELL'S PADDING INTO THE GUTTER, so the first column's words start on the title's edge above
   * them and a washed row has room round its words, as every list of rows on the ground does (`rows.css`).
   */
  .table-slot {
    --table-row-h: var(--row-h);
    margin-inline: calc(-1 * var(--sp-3));
  }

  /* THE HAIRLINES STOP AT THE WORDS (1 Nov, L4): the grid hangs a cell's padding into the gutter so a washed row has
     room round its words, and the row's border ran those 12px past the tile's padding at both ends. The rule is drawn
     inset by that padding instead, and goes where the border went: under a washed row and over it. */
  /* ROWS ARE SEPARATED BY THE WASH, NOT BY RULES (ops look, 3 Nov): one hairline under the header, inset to the text
     edge, and none between rows. Hover, the caret and a selection are each a rounded fill inset 3px from the row's
     neighbours, so two lit rows never touch. */
  .table-slot :global(.rowgroup .tr) {
    border-block-end-color: transparent;
    background: none;
  }

  .table-slot :global(.th-row) {
    border-block-end-color: transparent;
    background-image: linear-gradient(var(--sep, var(--rule)), var(--sep, var(--rule)));
    background-size: calc(100% - 2 * var(--sp-3)) 1px;
    background-position: 50% 100%;
    background-repeat: no-repeat;
  }

  .table-slot :global(.rowgroup .tr::before) {
    content: '';
    position: absolute;
    inset: 2px 0;
    z-index: -1;
    border-radius: var(--r-ctl);
    pointer-events: none;
    transition: background-color var(--d-state) var(--ease-out);
  }

  .table-slot :global(.rowgroup) {
    isolation: isolate;
  }

  .table-slot :global(.rowgroup .tr:hover::before),
  .table-slot :global(.rowgroup .tr[data-focused]:not([aria-selected='true'])::before) {
    background: var(--row-wash, var(--hover));
  }

  .table-slot :global(.rowgroup .tr:active::before) {
    background: var(--row-wash-press, var(--hover));
  }

  .table-slot :global(.rowgroup .tr[aria-selected='true']) {
    background: none;
  }

  .table-slot :global(.rowgroup .tr[aria-selected='true']::before) {
    background: var(--chosen);
  }

  /* HEARD AND NOT SEEN: the state a row was born in, which the column leaves out (L9). */

  /* A FINISHED ROW IS QUIETER THAN AN OPEN ONE (1 Nov, L10): Done rows stood in full ink among the open, so the eye had
     to read the state to find the work left. Every cell of one takes the third ink, which still clears 4.5 on the tile. */
  .table-slot :global(.rowgroup .tr:has(.state[data-stand='done']) .td) {
    color: var(--ink-3);
  }

  @media (pointer: coarse) {
    .table-slot {
      --table-row-h: max(var(--row-h), var(--tap));
    }
  }

  /* WHERE A ROW APPLIES READS AS THE PROJECT COLUMN DOES: its dot, or the globe, and its name in the cell's own type, with
     no pill round it. The chip keeps its shape where it is a control, on a row's page. */
  .table-slot :global(.td .scope-chip) {
    gap: var(--sp-2);
    min-block-size: 0;
    padding-inline: 0;
    background: none;
    color: var(--ink);
    font-size: inherit;
    font-weight: inherit;
  }

  .ident[data-retired] :global(.scope-chip) {
    color: var(--ink-3);
  }

  /* WHERE THE CHIP MOVES THE ROW IT IS A BUTTON, a rectangle at the control's radius round the same words, with the
     chevron that says a press opens something. Its wash shows under a mouse only, and its edge is held out by its own
     padding so the words stay on the column's edge. 28px tall, inside the 44px `.tap` grows under a thumb. */
  .scope-at {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    max-inline-size: calc(100% + 2 * var(--sp-1));
    min-block-size: var(--ctl-h-sm);
    margin-inline: calc(-1 * var(--sp-1));
    padding-inline: var(--sp-1);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    line-height: var(--lh-tight);
    vertical-align: middle;
    cursor: pointer;
  }

  .scope-at-open {
    display: inline-flex;
    flex: none;
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) {
    .scope-at:hover {
      background: var(--hover);
    }

    .scope-at:hover .scope-at-open {
      color: var(--ink);
    }
  }

  /* THE HEADS ARE QUIET: the meta size in the second ink, one hairline under them, and nothing else. */
  /* THE HEADER IS A CAPS LABEL (ops look): 11px, 500, a little tracking, in the third ink. */
  .table-slot :global(.th) {
    color: var(--ink-3);
    font-size: var(--fs-caps, 11px);
    font-weight: 500;
    line-height: var(--lead-caps, 16px);
    letter-spacing: var(--track-caps, 0.025em);
    text-transform: uppercase;
  }

  /* A FIGURE READS AS A FIGURE: right-aligned by its column (`columnsFor`) and set in tabular figures, so a column of
     amounts lines up digit under digit. */
  .table-slot :global(.td[data-align='end']) {
    font-variant-numeric: tabular-nums;
  }

  /* THE DATE THAT MADE A ROW LATE IS SAID IN RED, the one red on the row, and the date is the reason. The tone's glyph
     (`Table` draws one at the head of the cell) stays for a screen reader and leaves the eye: beside a red date and a
     red state dot it was a third mark of one fact. */
  .table-slot :global(.tr[data-intent='bad'] .td[data-tone]) {
    color: var(--red);
  }

  /* HOW LATE, BEFORE THE DAY, at the cell's weight plus one, so the words read first and the days still line up at the
     column's end. */
  /* The dot between how late and the day keeps its air where the cell lays its words out in a row. */
  .late-word {
    font-weight: var(--fw-medium);
  }

  /* THE DAY AFTER IT IS THE SECOND INK (P23): the word says it is late, and a red date beside a red word said it twice. */
  .late-day,
  .late-sep {
    color: var(--ink-2);
  }

  .table-slot :global(.table[data-toned] .td[data-glyph]) {
    padding-inline-start: var(--sp-3);
  }

  .table-slot :global(.td-glyph) {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .table-slot :global(.th-row) {
    min-block-size: var(--ctl-h);
  }

  /* THE KEYBOARD'S ROW IS THE WASH, as the cursor row is on every list, and not a raised band; the focus
     ring still marks it while the grid has focus. A selected row keeps `--red-tint`. */
  /* THE CARET'S ROW AWAY FROM THE GRID is a row like the others: the wash only while the grid has focus or under the
     pointer. */
  .table-slot:not(:focus-within) :global(.rowgroup .tr[data-focused]:not([aria-selected='true'], :hover)::before) {
    background: none;
  }

  /**
   * THE CELL IS THE BOX, AND THE PENCIL FLOATS OVER IT.
   *
   * This was an `inline-flex` holding the value and the pencil side by side, and the pencil is
   * invisible at rest rather than absent, so it took width the whole time. `.td` truncates with an
   * ellipsis, the flex row was wider than the column, and every editable cell on the busiest list
   * in the product painted a stray `..` after a value that fitted perfectly well.
   *
   * OUT OF FLOW, AND THE ROOM FOR IT IS MADE ONLY WHILE IT IS THERE. Three arrangements and each
   * costs something: in flow costs every cell a pencil's width of its own text, for ever; out of
   * flow with the room always reserved costs the same width the same way, and turned `owed to me`
   * into `owed to ...` on every row; out of flow with the room made on hover costs an ellipsis on
   * ONE cell while a pointer is on it. None of these reflows the COLUMN under the cursor: the
   * column is a grid track and its width is set by the header.
   */
  .cell-said {
    position: relative;
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The room, made when the pencil appears and not before. */
  :global(.td):hover .cell-said,
  :global(.td):focus-within .cell-said {
    padding-inline-end: var(--sp-4);
  }

  /* PRESENT IN THE TREE AND INVISIBLE UNTIL IT IS WANTED. `opacity` and not `display: none`, because
     a control removed from the box changes the cell's width the moment a pointer enters it, and a
     column that reflows under the cursor is a column you cannot click accurately. */
  .cell-pen {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    display: grid;
    flex: none;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    opacity: 0;
    cursor: pointer;
    transition: opacity var(--d-state) var(--ease-out);
  }

  /* `:global(.td)`, BECAUSE THE CELL IS DRAWN BY `Table` AND NOT BY THIS FILE. Svelte scopes a
     selector to the component that wrote it, so `.td:hover .cell-pen` matched nothing and compiled
     to an unused rule: the pencil was in the tree, at zero opacity, for ever. The child half stays
     scoped, which is what keeps this from reaching any other cell in the product. */
  :global(.td):hover .cell-pen,
  :global(.td):focus-within .cell-pen,
  .cell-pen:focus-visible {
    opacity: 0.55;
  }

  .cell-pen:hover,
  .cell-pen:focus-visible {
    color: var(--ink);
    opacity: 1;
  }

  /* A 44px HIT BOX UNDER A THUMB, ONLY ONCE THE PENCIL IS SHOWING. Measured at 768 on a tablet it
     was 12px wide. Always on, the box would lie invisibly over the cell's words and turn a tap on
     the row into an edit, so it arrives with the pencil: when the cell holds focus. */
  @media (pointer: coarse) {
    :global(.td):focus-within .cell-pen::before {
      content: '';
      position: absolute;
      inset: min(0px, calc((100% - var(--tap)) / 2));
    }
  }

  /**
   * THE ROW THAT JUST ARRIVED IS FOUND BY THIS MARK (`showRow` on the page) AND SEEN BY ITS WASH. The red dot that stood
   * before its title went: a new row wears the neutral `--arrived` wash for a second and a half (`data-arrived`), which
   * says "this one" without a colour that means late.
   */
  .fresh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* THE VERBS ARE QUIET UNTIL THE ROW IS. A column of controls at full contrast on every row of a
     list is a column that competes with the data for the reader's eye, and the data is what they
     came for. They come up on hover and on keyboard focus, and they are always in the accessibility
     tree, so nothing is hidden from anybody who is not using a pointer. */
  .verbs,
  .said {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    justify-content: flex-end;
  }

  /* A RECEIPT LAYS ITSELF OVER THE ROW'S END (1 Nov, L2): the verbs' column is as wide as its two glyphs, and "Archived"
     with its "Put back" is wider, so it stands on the row (`.tr` is the box it is placed in) on the tile's ground, over
     the last cells' ends, for as long as it is there. Nothing moves when it comes or goes. */
  .said {
    position: absolute;
    inset-block: 0;
    inset-inline-end: var(--sp-3);
    padding-inline-start: var(--sp-3);
    background: var(--tile);
    line-height: normal;
  }

  /* A ROW'S VERBS ARE SMALL RECTANGLES: 28 tall, the meta size at 500, and a 28 square for a verb that is its glyph.
     On a row that is already washed, the verb under the pointer takes the held wash, one step deeper. */
  .verb {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: calc(var(--r-ctl) - 2px);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  /* Beside a receipt the column is narrow, so the word keeps less air round it. */
  .said .verb {
    padding-inline: var(--sp-2);
  }

  .verb.icon {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h-sm);
    padding: 0;
    color: var(--ink-2);
  }

  .verb:hover,
  .verb:focus-visible {
    background: var(--tile-2);
    color: var(--ink);
  }

  /* UNDER A MOUSE THEY ARE NOT THERE UNTIL THE ROW IS, which the comment over `.verbs` has always
     said and no rule ever did. They come up with the row's hover, the keyboard caret and focus
     inside the row. Only where there is a hover: a finger has none, so a touch screen keeps them
     drawn, and a phone has the card's menu. The keyboard's route never went through them; they are
     `tabindex="-1"` and every verb is a key the `?` sheet lists. The picker goes the same way while
     nothing is selected, and comes back on every row once something is. */
  @media (hover: hover) and (pointer: fine) {
    .verbs {
      transition: opacity var(--d-state) var(--ease-out);
    }

    /* WHILE ROWS ARE PICKED THE PICKER STAYS ON EVERY ROW and the other verbs still wait for the row: the cell keeps
       its box, and only the verbs that are not the picker go. */
    .table-slot:not([data-picking]) :global(.tr:not(:hover, :focus-within, [data-focused]) .verbs),
    .table-slot:not([data-picking], :focus-within) :global(.tr[data-focused]:not(:hover) .verbs),
    .table-slot[data-picking] :global(.tr:not(:hover, :focus-within, [data-focused]) .verbs > :not(.pick)),
    .table-slot[data-picking]:not(:focus-within) :global(.tr[data-focused]:not(:hover) .verbs > :not(.pick)) {
      opacity: 0;
    }
  }

  /**
   * THE PICKER: a 16px box, radius 4, its edge 1.5px of the second ink, ticked in the button red with a white check
   * (money F7). It leads the row in its own 32px column and takes the hover wash under the pointer (motion F19).
   */
  .table-slot :global(:is(.td, .th):has(> .pick)) {
    display: grid;
    place-items: center;
    padding-inline: 0;
  }

  .pick {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 16px;
    block-size: 16px;
    padding: 0;
    background: none;
    border: 1.5px solid var(--ink-2);
    border-radius: var(--r-xs);
    color: var(--on-mark);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out),
      opacity var(--d-state) var(--ease-out);
  }

  .pick :global(svg) {
    inline-size: 12px;
    block-size: 12px;
  }

  @media (hover: hover) and (pointer: fine) {
    .pick:hover {
      background: var(--hover);
    }
  }

  .pick[data-on] {
    background: var(--on);
    border-color: var(--on);
  }

  .pick-some {
    inline-size: 8px;
    block-size: 2px;
    border-radius: 1px;
    background: currentColor;
  }

  /* UNDER A MOUSE THE BOX WAITS FOR ITS ROW, and once one is ticked every box stays, the header's too. A thumb has no
     hover, so a touch screen keeps them drawn. */
  @media (hover: hover) and (pointer: fine) {
    .table-slot:not([data-picking]) :global(.tr:not(:hover, :focus-within) .pick:not(:focus-visible)) {
      opacity: 0;
    }
  }

  /**
   * AN ARCHIVED ROW DIMS, AND ITS RECEIPT DOES NOT (motion F7.2): the cells' words go to the quiet ink over `--d-swap`
   * while "Archived" and "Put back" stay at full ink, so the press visibly did something. The page takes the row away
   * when its undo runs out, and it leaves with `rowOut`.
   *
   * THE QUIET INK AND NOT AN OPACITY. At 0.45 every word in the row read under 3 to 1 in both schemes, and the row is
   * still read (its figures, its date) until it goes; `--ink-3` is solved to clear 4.5 on the tile and on every tint
   * a cell draws on.
   */
  .table-slot :global(.tr:has(.said[data-archived]) > .td:not(:last-child)),
  .table-slot :global(.tr:has(.said[data-archived]) > .td:not(:last-child) *) {
    color: var(--ink-3);
  }

  .table-slot :global(.rowgroup .tr > .td) {
    transition: color var(--d-swap) var(--ease-standard);
  }

  @media (width < 640px) {
    .table-slot {
      display: none;
    }
  }
</style>
