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
  import { symbolFigure } from 'braindog-render';
  import { Table, type Column, type TableRow } from 'braindog-render/svelte';
  import { display, DOM_CAP, identityFor, identityOf, labelOf } from '$lib/record/api.ts';
  import { currencyTypedIn } from '$lib/ui/money-typed.ts';
  import { isFile, isJson, isQuantity, unitOf, unitsOf } from '$lib/record/field-draft.ts';
  import { scopeFieldOf, scopeOf } from '$lib/record/scope-move.ts';
  import type { Names } from '$lib/record/remote.ts';
  import type { Entry, FieldDecl, RegisterDecl } from '$lib/record/schema.ts';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import DayBox from '$lib/ui/DayBox.svelte';
  import QuantityBox from '$lib/ui/QuantityBox.svelte';
  import JsonBox from '$lib/ui/JsonBox.svelte';
  import FileField from '$lib/ui/FileField.svelte';
  import ScopeChip from '$lib/ui/ScopeChip.svelte';
  import Face from '$lib/ui/Face.svelte';
  import { ofPeople } from '$lib/ui/RowCards.svelte';
  import { boxOf, deadlineOf, withoutGood, type Receipt } from './list.ts';

  let {
    register,
    decl,
    columns,
    rows,
    total,
    sort,
    selected,
    selectedKeys,
    focus = $bindable(),
    editing,
    editValue = $bindable(''),
    editTicked = $bindable(false),
    fresh,
    anyMark,
    names,
    onmore,
    onsort,
    onactivate,
    rowAt,
    fieldOf,
    editableHere,
    shownValue,
    listCurrency,
    receiptFor,
    toggleSelect,
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
    /** Some row in hand carries a project's mark, so every title keeps the mark's slot. */
    anyMark: boolean;
    names: Names | undefined;
    /** Absent when there is no next page, which is how `Table` knows to draw no sentinel. */
    onmore?: (() => void) | undefined;
    /** Absent when there is nothing to order, so the headers are plain labels. */
    onsort?: ((field: string) => void) | undefined;
    onactivate: (row: TableRow) => void;
    rowAt: (seq: number) => Entry | undefined;
    fieldOf: (field: string) => FieldDecl | undefined;
    editableHere: (field: string) => boolean;
    shownValue: (seq: number, field: string) => unknown;
    listCurrency: (field: string) => string | null;
    receiptFor: (seq: number) => Receipt | undefined;
    toggleSelect: (seq: number, extend: boolean) => void;
    openEditor: (seq: number, field: string) => void;
    commitEdit: () => void;
    /** Escape in a cell: the editor closes, and the blur that follows is not a commit. */
    cancelEdit: () => void;
    leftTheRow: (e: FocusEvent) => void;
    cellKeys: (e: KeyboardEvent, enterCommits: boolean) => void;
    /** Absent for a caller whose level cannot change the list, and the row's Archive is then not drawn (COL-13). */
    archive?: ((seq: number) => void) | undefined;
    openCardMenu: (seq: number, el: HTMLElement) => void;
  } = $props();

  /**
   * WHAT A DOT MEANS, AT 1440 (design DSN-7).
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
  const calm = $derived(withoutGood(rows));
  /* A LIST OF PEOPLE, whose titles each wear a face rather than a project's mark (`RowCards`' `ofPeople`). */
  const faced = $derived(ofPeople(decl));
</script>

<div class="table-slot" data-picking={selected.size > 0 ? '' : undefined}>
  <!--
    THE THING THE ROW BELONGS TO, IN FRONT OF WHAT THE ROW IS.

    `columnsFor` caps the default projection at nine fields, with no number among them, and `thing`
    is not in Money's, so the desktop grid of the first list in the rail was thirty-eight rows of
    grey with no way at all to see which project any of them was about. The mark went into `#`, the
    one column every projection had then; `#` ends the row when a reader turns it on, and the mark
    came with the title instead, because
    colour saying which project is read where the eye starts.

    The mark is a shape before it is a colour, which is `13 §5.1` met by the mark itself, and
    the label is the project's NAME because a screen reader told "black diamond" has been told
    the shape and not the thing.
  -->
  {#snippet ownMark(seq: number)}
    {@const own = identityFor(register, rowAt(seq)?.fields ?? {}, names)}
    <!-- THE MARK ON A ROW THAT HAS JUST ARRIVED, and it is drawn whether or not the register has an
         identity: `ownMark` renders on every title cell and the project's glyph only on some, so hanging
         this off that one would have marked new rows on Money and on nothing else. It is `aria-hidden`
         because the row already says what happened to it in words, in the chip one cell over; this is
         for the eye finding the row, and a second announcement of the same fact is noise. The page's
         `showRow` finds the row by this attribute, so what is scrolled to and what is marked cannot
         disagree. -->
    {#if fresh.has(seq)}<span class="fresh" data-fresh={seq} aria-hidden="true"></span>{/if}
    <!-- A PERSON IS LED BY THEIR FACE (design SYS-7), in the place a project's mark takes on any other list, drawn from
         the name the title cell prints beside it; `Face` is `aria-hidden` for that reason. -->
    {#if faced}<span class="row-face"><Face name={display(register, decl.title, rowAt(seq)?.fields[decl.title]) ?? ''} kind="person" size="s" /></span
      >{:else if own}<span
        class="row-mark thing-glyph"
        data-shape={own.mark}
        style={own.retired ? undefined : `--hue:${own.hue}`}
        data-retired={own.retired ? '' : undefined}
        role="img"
        aria-label={own.name}></span>{:else if anyMark}<span class="thing-glyph" data-shape="" aria-hidden="true"></span>{/if}
  {/snippet}
  <!-- ONE ROW HAS NOTHING TO SORT. `onsort` is optional and the table draws a plain label
       without it, so eight header buttons over a single row, each announcing
       `aria-sort="none"`, become eight headings. -->
  <Table
    columns={toned}
    rows={calm}
    {total}
    cap={DOM_CAP}
    {onmore}
    label={decl.name}
    href={at}
    {sort}
    selected={selectedKeys}
    bind:focus
    {onactivate}
    {onsort}
  >
    {#snippet cellSnippet(row, column, value)}
      {@const seq = Number(row.key.split('#')[1])}
      {@const ident = identityOf(register, column.field, rowAt(seq)?.fields[column.field], names)}
      {@const isTitle = column.field === decl.title}
      {@const isEnum = fieldOf(column.field)?.type === 'enum'}
      {#if column.field === 'select'}
        <!-- A LEADING COLUMN FOR THE SELECTION, and it is a column rather than a decoration on the id.
             The control is `tabindex="-1"` on purpose. A grid is a composite widget with exactly one
             tab stop, at 500 rows a focusable control per row is 500 tab stops, so the keyboard path
             stays `x`, which the `?` sheet already advertises, and the pointer path is this. -->
        <button
          type="button"
          class="pick tap"
          tabindex="-1"
          data-on={selected.has(seq) ? '' : undefined}
          aria-label="{selected.has(seq) ? copy.deselect : copy.select} {display(register, decl.title, rowAt(seq)?.fields[decl.title]) ?? copy.thisRow}"
          onclick={(e) => {
            /* The cell activates the row. Without this, picking one opened it. */
            e.stopPropagation();
            toggleSelect(seq, e.shiftKey);
          }}
        >
          {#if selected.has(seq)}<Icon name="check" size="s" />{/if}
        </button>
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
              if (e.key === 'Escape') cancelEdit();
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
          <!-- A DAY IN THE RECORD'S WORDS, `3 Sep 2026`, and not the browser's `mm/dd/yyyy` (MOD-22). -->
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
          <!-- A NUMBER AND THE UNIT IT COUNTS, the unit chosen from the ones the field knows (MOD-22). Moving between
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
        {:else if f && isFile(f)}
          <!-- A FILE IS CHOSEN, NEVER TYPED (OPS-20): the picker sends the bytes and the draft holds what came back,
               saved through the same commit as any other cell once the row is left. -->
          <!-- The box only keeps a click inside the cell from opening the row; the picker in it is the control. -->
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <span class="cell-box" onclick={(e) => e.stopPropagation()} onfocusout={leftTheRow}>
            <FileField bind:value={editValue} label={labelOf(f)} />
          </span>
        {:else if f && isJson(f)}
          <!-- STRUCTURED DATA KEEPS ITS LINE BREAKS, so Enter is a new line and the grid's Cmd+Enter commits, as a
               document's cell does (MOD-22). -->
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
          <span class="said">
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
              onclick={(e) => {
                e.stopPropagation();
                openCardMenu(seq, e.currentTarget);
              }}><Icon name="more" size="s" /></button>
          </span>
        {/if}
      {:else if column.field === scopeFieldOf(register)?.id && scopeOf(register, rowAt(seq)?.fields ?? {}, names) !== undefined}
        <!-- WHERE THE ROW APPLIES, AS A CHIP (agents C8): the project's mark and name, or the globe and "Everywhere", where an empty cell drew nothing. -->
        <ScopeChip scope={scopeOf(register, rowAt(seq)?.fields ?? {}, names) ?? null} />
      {:else if ident}
        <IdentityMark identity={ident} />
      {:else if column.field === 'seq'}
        <!-- EVERY ROW HERE HAS A NUMBER THE RECORD GAVE IT, and it is drawn as the number under the
             column's name, with no "#" in front (design DSN-7): the cell's text is `toRows`' spoken
             form, which is for a sentence and not for a column headed Number.
        --><span class="row-seq">{seq}</span>
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
        <span class="cell-said">{#if isTitle}{@render ownMark(seq)}{/if}{#if isEnum}<span class="enum">{copy.valueWord(value)}</span>{:else}{symbolFigure(value) ?? value}{/if}<button
            type="button"
            class="cell-pen"
            tabindex="-1"
            aria-label={copy.editValue(labelOf(fieldOf(column.field)!))}
            onclick={(e) => {
              e.stopPropagation();
              openEditor(seq, column.field);
            }}
          ><Icon name="edit" size="s" /></button></span>
      {:else}{#if isTitle}{@render ownMark(seq)}{/if}{#if isEnum}<span class="enum">{copy.valueWord(value)}</span>{:else}{symbolFigure(value) ?? value}{/if}{/if}
    {/snippet}
  </Table>
</div>

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

  .cell-unit {
    flex: none;
    color: var(--ink2);
    font-size: var(--t-ui);
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
    background: var(--s1);
    border: 1px solid var(--ink2);
    border-radius: var(--r-sm);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  /* THE THING'S HUE, AND IT IS NOT A LITERAL. `oklch(L C h)` where `h` is the row's frozen accent
     and `L`/`C` are the theme's two mark constants, generated per scheme and solved so every hue
     clears 3:1 on every surface. A retired thing keeps its mark and loses its claim on a hue, so
     `--hue` is withheld AND `--dim` is set: an unset `--hue` makes the `oklch()` invalid, and an
     invalid declaration is a dropped one, which would leave the mark the same ink as the id. */
  .row-mark {
    color: oklch(var(--mark-l) var(--mark-c) var(--hue));
  }

  .row-mark[data-retired] {
    color: var(--dim);
  }

  /* THE FACE SITS ON THE TITLE'S LINE, in the middle of it, with the gap a mark keeps before the words. */
  .row-face {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
  }

  /* THE ROW'S NUMBER, QUIET, IN THE BODY FACE with tabular figures, so a column of them lines up. It was
     the identifier face, and mono is for what a person wrote as code, never for a number (design-brief
     §11). */
  .row-seq {
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
  }

  /* ONE HAIRLINE BETWEEN ROWS AND NONE AROUND THE TABLE (design DSN-7). Every row draws the line under
     itself, so the last one drew a rule under the list that closed it like a box. The last group is the
     one with no group after it, since the paging sentinel can follow it. */
  .table-slot :global(.rowgroup:not(:has(~ .rowgroup)) > .tr:last-child) {
    border-block-end-color: transparent;
  }

  /**
   * A CLEAN TABLE ON THE GROUND (SYSTEM §6): the heads at the meta size in the quiet ink, a hairline between rows,
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

  @media (pointer: coarse) {
    .table-slot {
      --table-row-h: max(var(--row-h), var(--tap));
    }
  }

  .table-slot :global(.th) {
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .table-slot :global(.th-row) {
    min-block-size: var(--ctl-h);
  }

  /* THE KEYBOARD'S ROW IS THE WASH, as the cursor row is on every list (SYSTEM §6), and not a raised band; the focus
     ring still marks it while the grid has focus. A selected row keeps `--selected`. */
  .table-slot :global(.rowgroup .tr[data-focused]:not([aria-selected='true'])) {
    background: var(--hover-wash);
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
    color: var(--ink2);
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
   * THE ROW THAT JUST ARRIVED, MARKED FOR A MOMENT.
   *
   * A DOT AT THE HEAD OF THE TITLE AND NOT A WASH OVER THE ROW. A tinted row competes with the row's own tone, which
   * is the declared deadline state and means something; this is a dot in the info ink, never the brand's red (design
   * SYS-1), before the title where no tone is drawn, so the two cannot be confused. It fades rather than blinks: the point is to be findable for
   * the second somebody's eye takes to arrive, not to demand attention it has already got.
   *
   * IT ANIMATES ONCE BECAUSE IT IS MOUNTED ONCE. The page clears `fresh` in `$effect.pre`, before the list
   * redraws, so the element exists for one continuous stretch rather than being rebuilt mid-animation, which is
   * the failure the map's own comment records.
   */
  .fresh {
    display: inline-block;
    inline-size: var(--dot);
    block-size: var(--dot);
    margin-inline-end: var(--sp-2);
    background: var(--info-fill);
    border-radius: var(--r-pill);
    vertical-align: middle;
    animation: fresh-in var(--d-enter) var(--ease-out);
  }

  @keyframes fresh-in {
    from {
      opacity: 0;
      transform: scaleY(0.4);
    }
  }

  /* UNDER `prefers-reduced-motion` THE MARK STAYS AND THE MOVEMENT GOES. It is the thing that says which row is
     new, so deleting it would take the answer with the animation. */
  @media (prefers-reduced-motion: reduce) {
    .fresh {
      animation: none;
    }
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

  /* A ROW'S VERBS ARE PILLS (SYSTEM §6): 28 tall, the meta size at 500, and a round 28 for a verb that is its glyph.
     On a row that is already washed, the pill under the pointer takes the held wash, one step deeper. */
  .verb {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-sm);
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
    color: var(--ink2);
  }

  .verb:hover,
  .verb:focus-visible {
    background: var(--hold-wash);
    color: var(--ink);
  }

  /* UNDER A MOUSE THEY ARE NOT THERE UNTIL THE ROW IS, which the comment over `.verbs` has always
     said and no rule ever did. They come up with the row's hover, the keyboard caret and focus
     inside the row. Only where there is a hover: a finger has none, so a touch screen keeps them
     drawn, and a phone has the card's menu. The keyboard's route never went through them; they are
     `tabindex="-1"` and every verb is a key the `?` sheet lists. The picker goes the same way while
     nothing is selected, and comes back on every row once something is. */
  @media (hover: hover) and (pointer: fine) {
    .verbs,
    .table-slot:not([data-picking]) .pick:not([data-on]) {
      transition: opacity var(--d-state) var(--ease-out);
    }

    :global(.tr:not(:hover, :focus-within, [data-focused])) .verbs,
    .table-slot:not([data-picking]) :global(.tr:not(:hover, :focus-within, [data-focused]) .pick:not([data-on])) {
      opacity: 0;
    }
  }

  /* The pointer's way in. It is `tabindex="-1"`, since a grid has one tab stop, so it never takes focus
     and never needs a focus ring; the keyboard path is `x`, which the `?` sheet advertises. */
  .pick {
    display: grid;
    place-items: center;
    inline-size: 18px;
    block-size: 18px;
    padding: 0;
    background: none;
    border: 1.5px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--on-ink);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .pick[data-on] {
    background: var(--on);
    border-color: var(--on);
  }

  @media (width < 640px) {
    .table-slot {
      display: none;
    }
  }
</style>
