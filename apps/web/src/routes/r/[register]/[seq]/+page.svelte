<!--
  One row.

  A label is VISIBLE, always. A placeholder is not a label: it disappears exactly when a user needs
  it, and it fails contrast in most themes (06 §8). A set field is a fact with its label; an unset
  one is a chip that says its label and opens its field.

  THE ROW'S NUMBER LIVES IN DETAILS AND NOWHERE ELSE (design SYS-3). It is per-list, which is why
  renaming a list's id is refused and its display name is free, and it is what `y` copies; a person
  reading the page reads the title, the figure and where the row stands, never an id after them.

  TWO SHAPES (design DSN-14). Below 640px a fact is its label above its value; from 640px the label
  sits in a column capped at 16ch. At every width the pencil that opens a field sits in one trailing
  44px column, so every pencil on the page shares an edge. The hero figure is `--t-2xl` and
  `--t-xl` below 900px, and never wraps.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { listLine } from '$lib/record/tags.ts';
  import { amountOf, currencyOf } from '$lib/record/money.ts';
  import { since, TONES } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { currencyFor, dirOf, display, homeCurrency, iconFor, identityOf, labelOf, readableFields, spokenRow, toneOf, whoDid } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import { faceWords, liveOf, runOf } from '$lib/ui/face.ts';
  import { isStale } from '@braindog/kernel';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import AddField from '$lib/ui/AddField.svelte';
  import AddValue from './AddValue.svelte';
  import { putBackOf, valueWords } from '$lib/record/field-write.ts';
  import { draftOf, editable, isFile, isJson, isQuantity, patchOf, unitOf, unitsOf, wrongValue } from '$lib/record/field-draft.ts';
  import FileField from '$lib/ui/FileField.svelte';
  import DayBox from '$lib/ui/DayBox.svelte';
  import QuantityBox from '$lib/ui/QuantityBox.svelte';
  import JsonBox from '$lib/ui/JsonBox.svelte';
  import { ownsRecord, type Me } from '../../../settings/levels.ts';
  import { Table } from 'braindog-render/svelte';
  import { readHistory, readNames, type Told } from '$lib/record/history-live.ts';
  import { rowReader, type Got, type RowReader } from '$lib/record/row-live.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import { linkReader, type Linked, type LinkReader } from '$lib/record/links-live.ts';
  import type { FieldDecl, Fields } from '$lib/record/schema.ts';
  import { closed, drew, opened } from '../../../../lib/ui/screen.svelte.ts';
  import { choicesOf, stateSaid } from './lead.ts';
  import { addedSaid, daySaid, dueSaid, rowWords } from './said.ts';
  import { actor, listName, nameWords } from '$lib/record/names.ts';
  import { movable, scopeFieldOf } from '$lib/record/scope-move.ts';
  import ScopeMove from './ScopeMove.svelte';
  import Thread from '$lib/ui/Thread.svelte';
  import HandSheet from '$lib/ui/HandSheet.svelte';
  import UsedBy from '$lib/page/panels/UsedBy.svelte';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));

  /**
   * THE ROW IS THE RECORD'S ANSWER TO `get`, AND NOTHING ELSE.
   *
   * It had two other sources. The sample's row of the same number was drawn here when there was no
   * record, and a row somebody typed into the capture line against the sample waited in `pending`
   * under a NEGATIVE sequence, drawn here with `Not saved` on it. The sample went in DIRECTION 26 and
   * `pending` with it (`loop/research-no-sample.md` B1): the capture line writes to the record, so the
   * row it makes has a number the record gave it and opens here like any other.
   */
  let got = $state<Got | null>(null);
  /* READ AGAIN ONCE THE ROW IS: every list is declared by the record, and `rowReader` learns it on the way
     (`remote.ts` `learn`), which a plain read of `REGISTERS` would not notice. */
  const decl = $derived.by(() => (void got, REGISTERS[id]));
  /* THE FIELDS THIS PAGE DRAWS, read again when the declaration is. A field added from this page is in `REGISTERS`
     once `addField` returns, and `REGISTERS` is a plain table, so the press hands `got` back as a new object and both
     of these read again: the field is on the row with no second read of the row. */
  const readable = $derived.by(() => (void got, readableFields(id)));
  const live = $derived(got?.from === 'live');
  /* WHAT THIS RECORD CALLS THE ROWS THIS ONE POINTS AT, and the only source, so a ref the record did
     not name is drawn as `<list>#<number>` and never as a sample row. Undefined for a row the record
     does not hold. */
  const names = $derived(got?.from === 'live' ? got.names : undefined);
  /* NOTHING IS DRAWN UNTIL THE ROW HAS BEEN READ. */
  const waiting = $derived(Number.isInteger(seq) && seq >= 1 && got === null);
  const written = $derived(got?.from === 'live' ? (got.entry ?? undefined) : undefined);
  const row = $derived(written);

  /* WHAT POINTS AT THIS ROW. A `ref` declares `to:` and nothing declared the other direction, so a
     person's page could not show the invoices that are theirs — which is the half somebody opens a
     person for. Nothing was added to the data model: the inverse of every ref is already stated
     once, on the field that declares it. */
  /* AND IT IS THE RECORD'S OWN READ, which it was not: the section was left out on a live record,
     because the sample's backlinks would be another record's rows pointing at this one, and drawn
     from the sample's walk everywhere else. That walk is gone with the sample (DIRECTION 26). */
  let linked = $state<Linked | null>(null);
  let links: LinkReader | null = null;
  /* A ROW THAT POINTS HERE LEADS WITH WHAT IT IS AND CARRIES NO NUMBER: its columns are `columnsFor`'s, which draws
     none by default (design SYS-3), and each row still opens by its own link. */
  const incoming = $derived(linked?.from === 'live' ? linked.groups : []);

  /* THE ROW AND ITS HISTORY, IN ONE BRACKET, so `data-screen` never appears between the two reads. An
     answer for a row somebody has already left is dropped. `clock` is the reader's, taken again as
     each row is read. It started at the sample's frozen `NOW` for the row `pending` stamped with that
     instant; nothing is drawn before a read now, so the wall clock is the only one it needs. */
  let told = $state<Told | null>(null);
  let clock = $state(Date.now());
  let askedFor = '';
  let reader: RowReader | null = null;

  async function readRow(register: string, n: number) {
    const key = `${register}#${n}`;
    askedFor = key;
    got = null;
    told = null;
    linked = null;
    archived = false;
    stopEdit();
    const at = opened();
    reader ??= rowReader(apiBase());
    links ??= linkReader(apiBase());
    /* THREE READS IN ONE BRACKET, for the reason the two were: `data-screen` must not appear between
       them, and what points at a row is part of the row's screen rather than a thing that arrives
       after it. */
    const [r, h, l] = await Promise.all([
      reader.read(register, n),
      readHistory(apiBase(), register, n),
      links.read(register, n),
    ]);
    const current = askedFor === key;
    closed(!current || (r.from !== 'refused' && h.from !== 'refused'), at);
    if (!current) return;
    clock = Date.now();
    got = r;
    told = h;
    linked = l;
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
   */
  let noteText = $state('');
  let noting = false;
  let writer: RowWriter | null = null;

  async function addNote(e: SubmitEvent) {
    e.preventDefault();
    const said = noteText.trim();
    if (!said || noting || !row || !live) return;
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    noting = true;
    writer ??= rowWriter(apiBase());
    const out = await writer.note(register, n, said);
    noting = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    if (askedFor !== key) return;
    if (noteText.trim() === said) noteText = '';
    const at = opened();
    const h = await readHistory(apiBase(), register, n);
    const current = askedFor === key;
    closed(!current || h.from !== 'refused', at);
    if (current) told = h;
  }

  /**
   * EDITING, ONE FIELD AT A TIME.
   *
   * THE SCREEN COULD SHOW EVERY FIELD AND CHANGE NONE OF THEM. The one control in the header opened
   * a toast saying the row "would open for editing", so the detail screen was a report and the only
   * way to change a value was the list behind it — a screen away from the row a person is reading.
   *
   * ONE FIELD AND NOT A FORM, which is the whole shape of this. A form over eight fields sends eight
   * values against one `version`, so the seven nobody touched are seven chances to write back what
   * was on screen when the page was opened, over somebody else's change. A patch of one key is the
   * smallest true statement of what somebody did, and it is the only one this screen can make
   * honestly.
   *
   * THE WRITE GOES THROUGH `rows-write.ts`, the module the list writes through, so a ref typed as a
   * number becomes its row's id and an enum goes in its declared spelling in ONE place rather than
   * two that drift.
   */
  let editing = $state<string | null>(null);
  let draft = $state('');
  let ticked = $state(false);
  /* What the box held when it opened, so a save that changes nothing is not sent as a write. */
  let was = '';
  let wasTicked = false;
  let saving = $state(false);
  /* THE RECORD'S OWN SENTENCE, under the field it is about, with the typed text left where it was. */
  let problem = $state<string | null>(null);
  /**
   * ARCHIVED IN THIS TAB.
   *
   * A row the record has archived reads back as NO ROW — `get` hides a row with `deleted_at` set,
   * and this screen answers that with "there is no obligation #12". So the moment just after
   * archiving is the only one in which `Put back` can be offered on the row itself, and it is
   * offered there rather than nowhere.
   */
  let archived = $state(false);

  /* THE CURRENCY A MONEY BOX IS TYPED IN WHEN THE ROW SAYS NONE: what the list's rows hold. The three below are
     `field-draft.ts`'s, which the grid saves through too, so a value changed in either place is the same value. */
  const listCurrency = (f: FieldDecl): string | null => currencyFor(id, f.id);

  function startEdit(f: FieldDecl) {
    /* ONLY A ROW THE RECORD HOLDS OPENS A BOX. The sample's toast, "the row would open for editing", went with the
       sample (DIRECTION 26), and a row the record refused to show draws no edit control to press. */
    if (!row || !live) return;
    problem = null;
    editing = f.id;
    draft = draftOf(f, row.fields[f.id], listCurrency(f));
    ticked = row.fields[f.id] === true;
    was = draft;
    wasTicked = ticked;
  }

  function stopEdit() {
    editing = null;
    draft = '';
    problem = null;
  }

  /**
   * The header's own control, "Edit": the row's title is the field somebody means by "edit the row". The title is not
   * listed as a fact while it holds a value, so opening it lists it, with its box, until the edit ends (`listed`).
   */
  function editTitle() {
    if (!live) return;
    const fields = readableFields(id);
    const f = fields.find((x) => x.id === decl?.title) ?? fields.find(editable);
    if (f) startEdit(f);
  }

  const changed = (f: FieldDecl): boolean => (f.type === 'bool' ? ticked !== wasTicked : draft.trim() !== was.trim());

  /** The history again, so the change somebody just made is in the list beside the row. */
  async function refreshHistory(register: string, n: number) {
    const key = `${register}#${n}`;
    const at = opened();
    const h = await readHistory(apiBase(), register, n);
    const current = askedFor === key;
    closed(!current || h.from !== 'refused', at);
    if (current) told = h;
  }

  /**
   * THE ROW AGAIN, AFTER THE HEAD'S CHIP MOVED IT, and its history, whose newest line is the move. Read in place and
   * not through `readRow`, which empties the page first: the row is still here, and only where it applies changed.
   */
  async function rowMoved(register: string, n: number) {
    const key = `${register}#${n}`;
    const at = opened();
    reader ??= rowReader(apiBase());
    const r = await reader.read(register, n);
    const current = askedFor === key;
    closed(!current || r.from !== 'refused', at);
    if (!current) return;
    got = r;
    void refreshHistory(register, n);
  }

  async function saveEdit(f: FieldDecl) {
    if (!row || saving || !live) return;
    /* WHAT THE RECORD WOULD REFUSE IS SAID UNDER THE BOX FIRST: a money's places, a quantity with no unit, structured
       data that does not read, a day that is not one. Structured data would otherwise be stored as the text typed. */
    const bad = wrongValue(f, draft, row.fields[f.id], listCurrency(f));
    if (bad) {
      problem = bad;
      return;
    }
    /* A SAVE THAT CHANGES NOTHING IS NOT A WRITE: sending it would put a line in the row's history
       saying a field went from a value to the same value, which is a fact about a press. */
    if (!changed(f)) {
      toasts.push(copy.editNoChange);
      stopEdit();
      return;
    }
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    /* THE ROW AS IT WAS, READ BEFORE THE WRITE: once it lands `row` is the answer, and the way back is built from
       what the row held when the person pressed Save. */
    const before = { ...row.fields };
    /* THE LIST AS IT WAS AT THE SAVE, so Put back names the finished day this list declared then (`putBackOf`). */
    const heldDecl = decl;
    const patch = patchOf(f, f.type === 'bool' ? ticked : draft, row.fields[f.id], listCurrency(f));
    saving = true;
    problem = null;
    writer ??= rowWriter(apiBase());
    const out = await writer.update(register, n, patch, row.version);
    saving = false;
    if (askedFor !== key) return;
    if (out.ok) {
      got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      stopEdit();
      const version = out.entry.version;
      toasts.push(copy.writeMarkSaved, { undo: () => void putBack(register, n, labelOf(f), putBackOf(before, patch, heldDecl), version) });
      void refreshHistory(register, n);
      return;
    }
    /* A CONFLICT RE-READS AND SAYS SO. What is on screen is now the record's latest rather than what
       this tab was holding, so there is nothing for the box to stay open over. */
    if (out.why === 'conflict') {
      if (out.entry) got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      else void readRow(register, n);
      stopEdit();
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    /* A REFUSAL KEEPS THE TYPED TEXT and says what the record said, under the box it was typed in.
       Clearing it would be this screen deciding the words were worthless because the record said no. */
    problem = out.fix;
  }

  /**
   * PUT BACK, FROM THE SAVED EDIT'S TOAST: the field as it was, sent at the version the edit answered with.
   *
   * A SAVED EDIT HAD NO WAY BACK. The title and every field saved from this page landed with a bare "Saved", so a slip
   * of the menu meant opening the field again and remembering what it held. Held to the answered version, a write from
   * somebody else in between is a conflict the toast says, never a quiet revert of their change
   * (`field-write.test.ts`). It runs for the row it was pressed on even after the screen has moved to another, and only
   * redraws when this is still that row.
   */
  async function putBack(register: string, n: number, label: string, patch: Fields, version: number | undefined) {
    const key = `${register}#${n}`;
    writer ??= rowWriter(apiBase());
    saving = true;
    const out = await writer.update(register, n, patch, version);
    saving = false;
    const current = askedFor === key;
    if (!out.ok) {
      if (current && out.why === 'conflict' && out.entry) got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    /* ONLY AN EDITOR ON THE FIELD PUT BACK IS CLOSED. The toast stays up for ten seconds, long enough to have opened
       another field and started typing in it, and a bare `stopEdit()` here threw that typing away for a press about a
       different field. */
    if (current) {
      got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      if (editing !== null && editing in patch) stopEdit();
    }
    toasts.push(valueWords.putBack(label));
    if (current) void refreshHistory(register, n);
  }

  /** Archive the row, or put it back: the same verb the list offers on the same row. */
  async function setArchived(to: boolean) {
    if (!row || saving || !live) return;
    const named = String(row.fields[decl?.title ?? ''] ?? decl?.one.toLowerCase() ?? '');
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    saving = true;
    writer ??= rowWriter(apiBase());
    const out = to ? await writer.archive(register, n, row.version) : await writer.restore(register, n, row.version);
    saving = false;
    if (askedFor !== key) return;
    if (!out.ok) {
      if (out.why === 'conflict' && out.entry) got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    /* A WRITE KEEPS THE NAMES THE SCREEN ALREADY HAS. The row came back from the same record, and a
       ref it now points at that nothing named draws as `<list>#<number>` rather than as a sample row. */
    got = { from: 'live', entry: out.entry, names: names ?? new Map() };
    archived = to;
    stopEdit();
    toasts.push(to ? copy.writeArchived(named) : copy.rowRestored(named));
    void refreshHistory(register, n);
  }

  const history = $derived(told && told.from !== 'refused' ? told.lines : []);
  /* THE RECORD'S ROW DOES NOT SAY WHO ADDED IT; its oldest event does. */
  const addedBy = $derived(live ? (history.at(-1)?.by ?? '') : (row?.by ?? ''));

  /* WHO, BY NAME: the reader is You, and the record's members are asked for once, only when somebody else is in the
     history, so a row only you have touched costs no read. */
  const me = $derived(String(page.data.me?.person ?? ''));
  /* WHETHER A FIELD ADDED HERE LANDS AT ONCE OR WAITS ON DECIDE: the settings screen's one predicate for owning. */
  const owner = $derived(page.data.me ? ownsRecord(page.data.me as Me) : false);
  let people = $state<ReadonlyMap<string, string>>(new Map());
  let namesAsked = false;
  $effect(() => {
    if (!live || namesAsked) return;
    if (!history.some((e) => /^p_/u.test(e.by) && e.by !== me)) return;
    namesAsked = true;
    void readNames(apiBase()).then((m) => (people = m));
  });
  const addedWho = $derived(addedBy ? whoDid(addedBy, me || null, people) : null);

  const stateValue = $derived(decl?.state ? String(row?.fields[decl.state] ?? '') : '');
  const tone = $derived(decl?.done?.includes(stateValue) ? ('good' as const) : undefined);
  /* THE ROW IS IN ONE OF ITS LIST'S FINISHED STATES: "Paid", "Cleared", "Done". */
  const done = $derived(tone === 'good');

  /* A `document` is an argument, not a figure, so it never sits in the field list beside a date and
     a currency — it gets the room prose needs (05 §7.1). */
  /* `readableFields` and not `decl.fields`: a register's identity mark and its frozen hue are
     machinery, and listing them here printed "Mark  ▲" and "Hue  271" as though they were facts
     about the project rather than the reason it has a triangle beside its name. */
  const documents = $derived(readable.filter((f) => f.type === 'document'));
  const shortFields = $derived(readable.filter((f) => f.type !== 'document'));

  /**
   * WHAT THE ROW IS, BEFORE WHAT IT HOLDS.
   *
   * The page opened on a list of labelled fields, one per line, which is how a database shows a
   * record and not how anybody reads an invoice. A person opening one wants three things first: how
   * much, where it stands, and when. So the first money field is the page's figure, the tone is said
   * in words beside its dot, the state is its word, the deadline sits after them as its date, and the
   * row's age closes the line with its label. The tone is the list's own (`toneOf`), so a row drawn
   * late in the list is drawn late here.
   *
   * A FIELD SHOWN HERE IS NOT SHOWN TWICE. The facts below keep everything else, and an empty field
   * is a chip under them rather than a row saying "Not set".
   */
  const unsetValue = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && listLine(v) === null);
  const figureField = $derived(shortFields.find((f) => f.type === 'money'));
  const dueField = $derived(shortFields.find((f) => (f as { deadline?: boolean }).deadline === true));
  const figure = $derived(figureField && row ? amountOf(row.fields[figureField.id]) : null);
  const leadTone = $derived(row ? (toneOf(id, row, clock) ?? tone) : undefined);
  const due = $derived(dueField && row ? row.fields[dueField.id] : undefined);
  /* LATE OR CLOSE, IN WORDS, beside the dot `toneOf` coloured: "Overdue by 38 days", "Due in 3 days". A finished row
     is never late, and a date far enough off to carry no tone is said as its date alone. */
  const lateTone = $derived(!done && (leadTone === 'bad' || leadTone === 'warn') ? leadTone : undefined);
  const late = $derived(lateTone && typeof due === 'string' ? dueSaid(due, clock) : null);
  /* THE DAY A FINISHED ROW FINISHED, which the record writes into the list's `finished` field: "Paid 2 Sep". A list
     that declares none says the state word alone, since any other date would be a guess at when it happened. */
  const finishedDay = $derived(done && decl?.finished && row ? row.fields[decl.finished] : undefined);
  const finishedOn = $derived(typeof finishedDay === 'string' && finishedDay !== '' ? daySaid(finishedDay, clock) : null);
  /* WHERE THE ROW APPLIES IS SAID BY THE CHIP IN THE HEAD AND MOVED FROM IT (`ScopeMove.svelte`), so a field one press
     moves is not a fact as well: empty, it was the chip "+ Where it applies" under a row that applies everywhere. */
  const scopeField = $derived.by(() => (void got, scopeFieldOf(id)));
  const leadIds = $derived(
    new Set(
      [
        figure !== null ? figureField?.id : undefined,
        due ? dueField?.id : undefined,
        stateValue ? decl?.state : undefined,
        finishedOn ? decl?.finished : undefined,
        movable(scopeField) ? scopeField.id : undefined,
      ].filter((x): x is string => Boolean(x)),
    ),
  );
  /* THE TITLE IS THE HEAD, SO IT IS NOT A FACT AS WELL. It is listed only while it is empty, when its chip is the way
     to it, or while the head's Edit has it open, when its row holds the box. */
  const titled = $derived(Boolean(decl && row && !unsetValue(row.fields[decl.title])));
  const listed = $derived(shortFields.filter((f) => !leadIds.has(f.id) && (f.id !== decl?.title || !titled || editing === f.id)));

  /* EVERY EMPTY FIELD IS A CHIP, in one wrapping row under the facts (design SYS-10). A person with four unset fields
     was a column of four "Not set" rows, then one line of names with a separator trailing the last; a chip names its
     field, wraps whole, and on a row you can write to it opens that field. */
  const unsetFields = $derived(row ? listed.filter((f) => unsetValue(row.fields[f.id]) && editing !== f.id) : []);
  const shownFields = $derived(listed.filter((f) => !unsetFields.includes(f)));

  /**
   * A RUN'S PAGE LEADS WITH ITS HANDOFF (AGT-13): what it is doing, where, the next step, what it already tried and its
   * notes, said as the next session would want them, above the same fields listed as facts.
   *
   * THE PROJECT BY ITS NAME OR NOT AT ALL. A run holds it as a spoken id, which is not for a person to read, so it is
   * said only where the record named it beside the row. What was tried is appended as it happens, so it is turned
   * round to lead with the newest, which is the one the next session is most likely to repeat.
   */
  const handoff = $derived.by(() => {
    if (id !== 'session' || !row) return null;
    const f = row.fields;
    const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const lines = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
    const project = said(f.project);
    const mark = project ? names?.marks?.get(project) : undefined;
    return {
      agent: said(f.agent) || null,
      live: liveOf(f.state, isStale({ fields: f as never, updated_at: row.created }, clock)),
      doing: said(f.doing),
      project: project ? (names?.get(project) ?? null) : null,
      mark: mark ? { mark: mark.mark, hue: mark.hue } : null,
      next: said(f.next),
      tried: lines(f.tried).reverse(),
      notes: lines(f.notes),
    };
  });
  /* A DOCUMENT WITH NO PROSE IS ONE OF THOSE CHIPS TOO, after the short fields, and its slot is drawn only while it
     holds prose or its box is open. */
  const writtenDocuments = $derived(row ? documents.filter((f) => !unsetValue(row.fields[f.id]) || editing === f.id) : []);
  const unset = $derived([...unsetFields, ...documents.filter((f) => !writtenDocuments.includes(f))]);

  /* EVERY VALUE IN A ROW'S PROSE IS A HOLE UNTIL PAGES READ THEM. The sample's own values answered them off the
     row, and pressing one said what would have happened; neither has a record behind it (DIRECTION 26). */
  const resolve = (): null => null;
  /** A link the host cannot resolve is plain text, never a dead anchor (36 §13 D16). */

  const link = (spoken: string) => {
    const m = /^([a-z][a-z0-9_]*)#(\d+)$/.exec(spoken);
    return m && REGISTERS[m[1]!] ? `/r/${m[1]}/${m[2]}` : null;
  };

  /**
   * `y` COPIES THE ID AND `⇧Y` THE LINK, which is what the grid does; the button beside the number in
   * Details copies the link.
   *
   * The route had no key listener at all while its own header carried `<kbd>y</kbd>`, so the one
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
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      void (e.key === 'y' ? clipboard.putSpoken(id, row.seq) : clipboard.putLink(id, row.seq));
    }
  }

  /**
   * DRAWN ONCE THE ROW HAS BEEN READ.
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
  <!-- Bars until the row has been read. -->
  <Waiting head rows={6} />
{:else if got?.from === 'refused'}
  <div class="page">
    <Empty kind="error" heading title={got.fix}>
      {#snippet actions()}<Button href="/r/{id}">Back to {listName(id)}</Button>{/snippet}
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
      title={decl ? copy.noSuchNumber(decl.one, seq) : copy.noSuch('list', id)}
    >
      {#snippet actions()}<Button href="/r/{id}">Back to {listName(id)}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <!-- THE LIST'S NAME IS THE WAY BACK: a link above the title from 900px, and the chevron in the
       phone's bar below it. No number follows the title (design SYS-3); it is in Details. -->
  <PageHead icon={iconFor(decl?.icon, 'rows')} kicker={listName(id)} back={`/r/${id}`} title={String(row.fields[decl.title] ?? '')}>
    {#snippet actions()}
      <!-- `Copy id` WAS THE FIRST ACTION IN THIS HEADER, AND IT LIVES BESIDE THE NUMBER NOW. A row's
           page led with a developer verb: the first control a person saw on an invoice was the one
           that puts `obligations#1` on the clipboard, ahead of anything that does something to the
           invoice. Details holds the number and its "Copy link", and `y` still copies the id. -->
      <!-- WHERE THE ROW APPLIES, FIRST: the project's chip, or the globe and "Everywhere", which opens the move. -->
      <ScopeMove register={id} {row} {names} {live} title={String(row.fields[decl.title] ?? '')} onmoved={() => void rowMoved(id, seq)} />
      <Button weight="quiet" onclick={editTitle}>{copy.editRow}</Button>
      <!-- ARCHIVE IS THE LIST'S OWN VERB, on the row itself: a row that can be archived in one
           place and not the other is two products. `Put back` stands where `Archive` was for as
           long as this tab holds the row it just archived: see `archived` for why that moment is
           the only one it can be offered in. -->
      {#if archived}
        <Button weight="quiet" disabled={saving} onclick={() => void setArchived(false)}>{copy.rowRestore}</Button>
      {:else}
        <Button weight="quiet" disabled={saving} onclick={() => void setArchived(true)}>{copy.rowArchive}</Button>
      {/if}
      <!-- "HAND TO" (GAP-11): a teammate or an agent in one press, on a list that says who holds its rows, and while an
           agent holds this one, the run working on it or whose next session it waits for. -->
      {#if live && !archived}
        <HandSheet register={id} {row} {decl} trigger onhanded={() => void rowMoved(id, seq)} />
      {/if}
    {/snippet}
  </PageHead>

  <div class="page">
    <!-- SAID ON THE ROW, because every list leaves an archived row out and nothing else on this
         screen would say why it has gone from them. -->
    {#if archived}
      <p class="archived-note">{copy.rowArchivedNote}</p>
    {/if}
    <!-- A RUN READS AS ITS HANDOFF (AGT-13), led by its face, what it is doing and where it is, then what the next
         session needs: the next step, what was already tried, newest first, and the notes it left. -->
    {#if handoff}
      <section class="handoff" aria-label={faceWords.handoff}>
        <div class="handoff-head">
          <AgentFace agent={handoff.agent} run="S{seq}" live={handoff.live} project={handoff.mark} />
          <p class="handoff-doing">{handoff.doing || faceWords.nothingYet}</p>
          <span class="handoff-live">{faceWords.live[handoff.live]}</span>
        </div>
        {#if handoff.project || handoff.next}
          <dl class="handoff-facts">
            {#if handoff.project}<div><dt>{faceWords.project}</dt><dd>{handoff.project}</dd></div>{/if}
            {#if handoff.next}<div><dt>{faceWords.next}</dt><dd>{handoff.next}</dd></div>{/if}
          </dl>
        {/if}
        {#if handoff.tried.length}
          <h2 class="handoff-title">{faceWords.tried}</h2>
          <ol class="handoff-lines">{#each handoff.tried as t}<li>{t}</li>{/each}</ol>
        {/if}
        {#if handoff.notes.length}
          <h2 class="handoff-title">{faceWords.notes}</h2>
          <ul class="handoff-lines">{#each handoff.notes as n}<li>{n}</li>{/each}</ul>
        {/if}
      </section>
    {/if}
    <!-- THE FIGURE HEADS THE LEFT COLUMN, AND DETAILS STARTS BESIDE IT. The lead sat above both
         columns, so the side column began 190px below the title it describes, beside the second
         field, and ended short of the header's right edge. -->
    <div class="split">
      <section class="fields">
        <section class="lead" aria-label={decl.one}>
          {#if figure !== null && figureField}
            <p class="lead-figure num">
              <Money minor={figure} currency={currencyOf(row.fields[figureField.id]) ?? ''} weight="strong" />
            </p>
          {/if}
          <!-- THE TONE IN WORDS BESIDE ITS DOT, THEN THE STATE, THE DATE AND THE AGE, each a whole item that wraps whole.
               A late row's dot sits beside how late it is, so a red dot is never beside "Open"; the state keeps its own
               word after it, and carries the dot itself only when nothing is late. -->
          <p class="lead-line">
            {#if late && lateTone}
              <span class="lead-state" data-intent={lateTone}>
                <span class="glyph" role="img" aria-label={TONES[lateTone].label}>{TONES[lateTone].glyph}</span>
                <span class="lead-late">{late}</span>
              </span>
            {/if}
            {#if stateValue}
              <span class="lead-state" data-intent={late ? undefined : leadTone}>
                {#if !late && leadTone}<span class="glyph" role="img" aria-label={TONES[leadTone].label}>{TONES[leadTone].glyph}</span>{/if}
                <span class="lead-word">{stateSaid(decl, stateValue)}</span>
                {#if finishedOn}<span class="lead-day">{finishedOn}</span>{/if}
              </span>
            {/if}
            {#if due && dueField}
              <span class="lead-due">{labelOf(dueField)} {dueField.type === 'day' ? daySaid(String(due), clock) : display(id, dueField.id, due, clock, names)}</span>
            {/if}
            <span class="lead-age">{addedSaid(row.created, clock)}</span>
          </p>
        </section>
        <dl class="field-list">
          {#each shownFields as f}
            {@const value = row.fields[f.id]}
            <div class="fact">
              <dt class="field-label">{labelOf(f)}</dt>
              <dd class="field-value" data-type={f.type} dir={dirOf(id, f.id)}>
                {#if editing === f.id}
                  <!-- THE BOX IS THE ONE THE NEW-ROW FORM DRAWS, BY TYPE, because which control a
                       field takes is a property of its declared type and not of the screen it is
                       on. The classes are `controls.css`'s, so this is the same field shape as the
                       rest of the product rather than a second one that drifts.

                       A `ref` IS TYPED AS THE NUMBER A PERSON SAYS, beside the name of the list it
                       points at, and not picked from a menu: the rows of the other register are a
                       read this screen has not made, and a menu built from the sample would offer
                       another record's rows. The number goes through the same conversion the list
                       writes through, and a number with no row is refused by the record in a
                       sentence that lands under the box. -->
                  <form
                    class="editor"
                    onsubmit={(e) => {
                      e.preventDefault();
                      void saveEdit(f);
                    }}
                  >
                    {#if f.type === 'bool'}
                      <label class="edit-check"><input type="checkbox" bind:checked={ticked} /> {copy.yes}</label>
                    {:else if f.type === 'enum'}
                      <select class="edit-input" bind:value={draft}>
                        <option value="">{copy.noneChosen}</option>
                        {#each choicesOf(f) as [v, said]}<option value={v}>{said}</option>{/each}
                      </select>
                    {:else if f.type === 'day'}
                      <!-- A DAY IN THE RECORD'S WORDS, `3 Sep 2026`, and not the browser's `mm/dd/yyyy` (MOD-22). -->
                      <DayBox bind:value={draft} label={labelOf(f)} />
                    {:else if isQuantity(f)}
                      <!-- A NUMBER AND THE UNIT IT COUNTS, the unit chosen from the ones the field knows (MOD-22). -->
                      <QuantityBox bind:value={draft} units={unitsOf(f, value)} label={labelOf(f)} />
                    {:else if isJson(f)}
                      <!-- STRUCTURED DATA WRITTEN OUT, refused on the save when it does not read (MOD-22). -->
                      <JsonBox bind:value={draft} label={labelOf(f)} />
                    {:else if isFile(f)}
                      <!-- A FILE IS CHOSEN, NEVER TYPED: the picker sends the bytes and the draft holds what came back (OPS-20). -->
                      <FileField bind:value={draft} label={labelOf(f)} />
                    {:else if f.type === 'money'}
                      <!-- THE CURRENCY THE BOX WRITES IN, by the chain `field-draft.ts` types in: the row's, the field
                           default's, the list's, then the record's, so an empty box names what it will write. -->
                      {@const unit = currencyOf(value) ?? currencyOf(f.default) ?? currencyFor(id, f.id) ?? homeCurrency()}
                      <div class="field">
                        {#if unit}<span class="edit-unit">{unit}</span>{/if}
                        <input class="field-input num" type="text" inputmode="decimal" bind:value={draft} />
                      </div>
                    {:else if f.type === 'int' || f.type === 'decimal' || f.type === 'duration'}
                      <div class="field">
                        <input class="field-input num" type="text" inputmode="decimal" bind:value={draft} />
                        <!-- A DURATION IS TYPED IN THE UNIT IT IS SAID IN, and one that names none is said in seconds, so
                             its box says `s` rather than nothing. This drew `h` beside a box holding 7200 seconds. -->
                        {#if f.type === 'duration'}<span class="edit-unit">{unitOf(f)}</span>{:else if f.unit}<span class="edit-unit">{f.unit}</span>{/if}
                      </div>
                    {:else if f.type === 'ref'}
                      <div class="field">
                        <input class="field-input num" type="text" inputmode="numeric" bind:value={draft} />
                        {#if f.to}<span class="edit-unit">{listName(f.to)}</span>{/if}
                      </div>
                    {:else}
                      <div class="field"><input class="field-input" type="text" bind:value={draft} /></div>
                    {/if}
                    <div class="edit-actions">
                      <Button type="submit" weight="primary" disabled={saving}>{saving ? copy.writeMarkSaving : copy.editSave}</Button>
                      <Button weight="bare" onclick={stopEdit}>{copy.editCancel}</Button>
                    </div>
                  </form>
                  {#if problem}<p class="edit-why">{problem}</p>{/if}
                  <!-- A VALUE THE MENU DOES NOT HOLD, added to the list under the menu. Once an owner's lands the list
                       is learnt again, `got` is handed back new so `f` is the field that holds it, and it is chosen in
                       the menu for the ordinary Save. -->
                  {#if f.type === 'enum'}
                    <AddValue
                      register={id}
                      field={f}
                      {owner}
                      onadded={(v) => {
                        got = got && { ...got };
                        draft = v;
                      }}
                    />
                  {/if}
                {:else}
                  <!-- ONLY A SET FIELD IS A FACT, so the value is always there: an empty one is a chip under the facts,
                       except while its box is open, when it is drawn here and never reaches this branch. -->
                  {#if f.type === 'money'}
                    <Money minor={amountOf(value) ?? 0} currency={currencyOf(value) ?? ''} weight="strong" />
                  {:else if f.id === decl.state}
                    <Chip label={stateSaid(decl, String(value))} {tone} />
                  {:else if identityOf(id, f.id, value, names)}
                    <IdentityMark identity={identityOf(id, f.id, value, names)!} size="md" />
                  {:else if f.type === 'day'}
                    <!-- A DAY AS A SENTENCE SAYS IT, "2 Sep" inside this year and "2 Sep 2025" outside it, and not
                         followed by a second, relative reading of the same day. -->
                    {daySaid(String(value), clock)}
                  {:else if id === 'session' && f.id === 'project' && spokenRow(value, names)}
                    <!-- A RUN'S PROJECT IS HELD AS A SPOKEN ID. It reads as the project, and opens it. -->
                    <a href={at(spokenRow(value, names)!.href)}>{spokenRow(value, names)!.label}</a>
                  {:else if f.type === 'enum'}
                    <span class="enum-word">{copy.valueWord(display(id, f.id, value, clock, names) ?? '')}</span>
                  {:else}
                    {display(id, f.id, value, clock, names)}
                  {/if}
                {/if}
              </dd>
              <!-- THE PENCIL IS ITS OWN CELL IN THE TRAILING COLUMN, so every pencil on the page shares one edge
                   whatever the value beside it holds. A `dd`, because a `dl`'s groups hold nothing else. -->
              {#if live && editable(f) && editing !== f.id}
                <dd class="field-pencil">
                  <button type="button" class="edit-field tap" aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>
                    <Icon name="edit" size="s" />
                  </button>
                </dd>
              {/if}
            </div>
          {/each}
        </dl>
        <!-- WHO USED IT (AGT-10): a key's or a tool's row lists the last ten runs that opened or reached it. -->
        {#if live && (id === 'credentials' || id === 'tools')}
          <UsedBy spoken="{id}#{row.seq}" />
        {/if}
        <!-- WHAT THE ROW HAS NOT ANSWERED, one pill each in one wrapping row, and on a row you can write to each opens its
             field. The list is named for a screen reader, since the pills alone do not say they are empty. -->
        {#if unset.length > 0}
          <ul class="unset" aria-label={copy.editNotSet}>
            {#each unset as f (f.id)}
              <li>
                {#if live && editable(f)}
                  <button type="button" class="unset-chip tap" aria-label="{rowWords.add} {labelOf(f).toLowerCase()}" onclick={() => startEdit(f)}>
                    <Icon name="plus" size="s" /><span>{labelOf(f)}</span>
                  </button>
                {:else}
                  <span class="unset-chip">{labelOf(f)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        <!-- A FIELD THIS LIST DOES NOT HAVE YET, added to every row of it. -->
        <AddField register={id} {live} {owner} onadded={() => (got = got && { ...got })} />

        <!-- A `document` field is the dialect, drawn by the same interpreter a declared page uses.
             The read view IS the renderer, so what you are looking at is the artefact (22 §8). -->
        <!-- A DOCUMENT THE ROW DOES NOT CARRY YET IS STILL A FIELD THE LIST DECLARES, so it is a chip in the row
             above, like every other unset field, and pressing it opens its box here. The pencil of one that holds
             prose sits at its head, beside the label it changes, and not under the prose. -->
        {#each writtenDocuments as f (f.id)}
          <article class="document-slot">
            <div class="doc-head">
              <h2 class="doc-label">{labelOf(f)}</h2>
              {#if live && editing !== f.id}
                <button type="button" class="edit-field tap" aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>
                  <Icon name="edit" size="s" />
                </button>
              {/if}
            </div>
            {#if editing === f.id}
              <form
                class="editor"
                onsubmit={(e) => {
                  e.preventDefault();
                  void saveEdit(f);
                }}
              >
                <textarea class="edit-area" rows="10" bind:value={draft}></textarea>
                <div class="edit-actions">
                  <Button type="submit" weight="primary" disabled={saving}>{saving ? copy.writeMarkSaving : copy.editSave}</Button>
                  <Button weight="bare" onclick={stopEdit}>{copy.editCancel}</Button>
                </div>
              </form>
              {#if problem}<p class="edit-why">{problem}</p>{/if}
            {:else}
              <!-- `hole` IS WHAT MAKES A HOLE PRESSABLE. Without it the renderer draws a marked
                   span rather than a `<button>` nobody wrote a handler for; with it, this screen
                   owns what pressing one does. No `dayHref`: there is no calendar in this build,
                   and a date that links to one is an anchor to the error page.
                   A value the record cannot answer is not pressable: nobody can supply a declared
                   figure from this screen, so it is marked and left alone. That is the rule the
                   page screen states beside its own `opts`, and a hole in a row's prose is the
                   same hole in the same dialect. -->
              <Document src={String(row.fields[f.id])} opts={{ resolve, link, now: clock, href: at }} />
            {/if}
          </article>
        {/each}

        {#each incoming as rel}
          {@const twice = incoming.filter((r) => r.name === rel.name).length > 1}
          <!-- One section per RELATION, not per register: two fields of one register can point at
               the same place and mean different things — an update's `track` is what it is about
               and its `supersedes` is what it replaces. -->
          <section class="incoming">
            <h2 class="incoming-title">
              {rel.name}
              <!-- The field only where it tells two sections apart; elsewhere it read as part of the heading. -->
              {#if twice}<span class="incoming-label">{copy.linkedThrough(rel.label)}</span>{/if}
              <span class="incoming-count num">{rel.total}</span>
            </h2>
            <Table columns={rel.columns} rows={rel.rows} total={rel.total} label="{rel.name} · {rel.label}" href={at} />
            {#if rel.total > rel.rows.length}
              <a class="incoming-more" href={at(rel.href)}>
                All {rel.total} <Icon name="chevron" size="s" />
              </a>
            {/if}
          </section>
        {/each}
        <!-- THE ONE READ ON THIS SCREEN THAT CAN BE REFUSED BY ITSELF: a caller may read this row
             and not the lists that point at it. Drawing nothing would say nothing points here,
             which is a different fact about the record. -->
        {#if linked?.from === 'refused'}
          <section class="incoming"><Empty kind="error" compact title={copy.linksRefused} /></section>
        {/if}
      </section>

      <aside class="side">
        <!-- "This row" said what you are already looking at, and "Spoken id" and "Version" are
             both the record's own vocabulary: one is the thing you say out loud, which is what the
             row is called, and the other is a compare-and-set counter that means nothing to a
             reader and changes on every write. The id stays, because it is the handle you paste
             into an agent. The counter goes; the History underneath is the version, in words. -->
        <h2 class="side-title">Details</h2>
        <dl class="meta">
          <dt>{nameWords.number}</dt>
          <!-- THE ROW'S NUMBER, AND THE BUTTON THAT COPIES ITS LINK. This is the one place the number is
               printed (design SYS-3), bare and without the `#` that made it read as an id. The link is
               what a person pastes into a message and what opens the row for whoever follows it; `y`
               still copies the id and `⇧Y` the link, and the `?` sheet lists both keys. -->
          <dd class="id-line">
            <span class="number num">{row.seq}</span>
            <button type="button" class="copy-id tap" onclick={() => clipboard.putLink(id, row.seq)}>
              <Icon name="copy" size="s" /><span>{copy.copyLink}</span>
            </button>
          </dd>
          <dt>Added</dt>
          <!-- IN WORDS, like the other two surfaces that answer "who changed my record". `actorOf`
               moved into `api.ts` when Home and `/audit` were found spelling the same two actors two
               ways; this route was the third. -->
          <dd>{#if addedWho}{copy.rowAddedBy(since(row.created, clock), addedWho.you ? copy.rowByYou : addedWho.person && addedWho.name === copy.feedSomeone ? copy.rowBySomeone : addedWho.name)}{:else}{since(row.created, clock)}{/if}</dd>
        </dl>

        <form class="note-form" onsubmit={addNote}>
          <label class="note-label" for="row-note">{copy.noteLabel}</label>
          <div class="note-line">
            <input id="row-note" class="note-input" type="text" maxlength="280" autocomplete="off" placeholder={copy.notePlaceholder} bind:value={noteText} />
            {#if noteText.trim()}<Button type="submit">{copy.noteAdd}</Button>{/if}
          </div>
        </form>

        <!-- THE ROW'S COMMENTS (COL-8), beside the note and above the history. A note is the row's own log line and
             asks to change the row; a comment is somebody saying something about it, which a Reads colleague may
             too, with replies one level deep and a resolved comment folded. Named as the row is spoken. -->
        {#if live}<Thread on="{id}#{row.seq}" me={me || null} {people} />{/if}

        {#if told?.from === 'refused'}
          <h2 class="side-title">History</h2>
          <Empty kind="error" compact title={told.fix} />
        {:else if history.length}
          <h2 class="side-title">History</h2>
          <ol class="history">
            {#each history as e}
              <!-- WHO, BY `actor`, SO THE FACE IS DRAWN BY KIND: a rule wears the automations glyph and BrainDog its
                   mark, never a monogram. The name is printed as `actor` says it, since "de Vries" is not a typo. -->
              {@const who = actor(e.by, me || null, people)}
              <li>
                <!-- AN AGENT'S LINE WEARS ITS RUN (AGT-13), in the run's hue and linking to its handoff. -->
                <Face name={who.name} kind={who.kind} run={runOf(e.by)} size="s" />
                <span class="history-by">{who.name}</span>
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

  /* A WASH ONLY UNDER A MOUSE: on a phone a tapped control would keep it after the finger lifted (design-brief §6). */
  @media (hover: hover) and (pointer: fine) {
    .copy-id:hover {
      background: var(--hover-wash);
    }
  }

  /* THE CONTROL THAT OPENS A FIELD, as wide as the trailing column it sits in, so every pencil's glyph
     lands on one vertical line. `.tap` is the invisible 44 x 44 hit box: a 16px glyph in a short
     button is a 16px target to a finger. */
  .edit-field {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--tap);
    block-size: var(--ctl-h-sm);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .edit-field:hover {
      background: var(--hover-wash);
      color: var(--ink2);
    }
  }

  /* The box and its two buttons: in a line where there is room, wrapped where there is not. */
  .editor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
  }

  .edit-input,
  .edit-area {
    min-block-size: max(var(--ctl-h), var(--tap));
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    /* 16px IN EVERY BOX AT EVERY WIDTH (design-brief §5), because a phone zooms the page when a smaller one takes focus. */
    font-size: var(--t-md);
  }

  .edit-area {
    inline-size: 100%;
    padding-block: var(--sp-2);
    line-height: 1.6;
    resize: vertical;
  }

  .edit-input:hover,
  .edit-area:hover {
    border-color: var(--edge);
  }

  /* The currency, the unit, or the list a ref points at: printed beside the box, never typed. */
  .edit-unit {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .edit-check {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: max(var(--ctl-h), var(--tap));
    color: var(--ink);
    font-size: var(--t-ui);
  }

  .edit-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* WHAT THE RECORD SAID, under the box it was typed in, with the words still in it. */
  .edit-why {
    margin: var(--sp-1) 0 0;
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .archived-note {
    margin: 0 0 var(--sp-4);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .incoming {
    margin-block-start: var(--sp-6);
  }

  /* THE FOUR HEADINGS ON THIS SCREEN ARE SECTION HEADINGS, and they were eyebrows: small, dim and
     led by an icon, so Details, History and each list pointing here read as captions over the
     facts. The body size at 600 in ink is what `Section` gives a heading everywhere else; at twenty
     pixels they outranked the row's own title and figure. */
  .incoming-title,
  .doc-label,
  .side-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: -0.006em;
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
    color: var(--link);
    font-size: var(--t-sm);
  }

  .page {
    padding: var(--sp-5) var(--gutter) var(--sp-9);
  }

  /* The fields keep a reading width and the side column ends where the header's actions end, so
     Archive and the column it acts beside share one edge. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 760px) 300px;
    justify-content: space-between;
    gap: var(--sp-5) var(--sp-8);
    align-items: start;
  }

  /* UNBOXED, like every list since `rows.css`: the fields sit on the page with a hairline between
     each, and a label starts where the heading above it starts. */
  .field-list {
    margin: 0;
  }

  /* A FACT AND NOT A FIELD. The class was field, which controls.css gives to a text-input wrapper, so
     every row of this list wore an input box: a surface, a border and a radius, eight boxes that read
     as a form to fill in. The name is the fix; nothing here fights the input style.

     TWO SHAPES, AND THE PHONE'S IS WRITTEN FIRST (design DSN-14). Below 640px the label sits above its
     value, because a 16ch label column left a value 170px to wrap in at 390 and broke paths and
     dates mid-word (design SYS-10). The pencil's 44px column trails at every width, so no pencil moves with its value. */
  .fact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--tap);
    grid-template-areas:
      'label pencil'
      'value pencil';
    gap: var(--sp-1) var(--sp-2);
    align-items: baseline;
    padding: var(--sp-3) 0;
    border-block-end: 1px solid var(--line);
  }

  .fact:last-child {
    border-block-end: 0;
  }

  /* Sentence case, at the size of a label above a fact. A field label is a WORD YOU READ
     ("Direction", "Amount", "Due"), not a category stamp, and small letterspaced caps make eight of
     them in a column read as a form to be filled rather than a row to be understood. */
  .field-label {
    grid-area: label;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    letter-spacing: 0;
  }

  .field-value {
    grid-area: value;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    overflow-wrap: anywhere;
  }

  .field-value[data-type='money'],
  .field-value[data-type='day'] {
    font-variant-numeric: tabular-nums;
  }

  .field-pencil {
    grid-area: pencil;
    align-self: center;
    margin: 0;
  }

  /* FROM 640px THE LABEL HAS ITS OWN COLUMN, capped at 16ch so a long label wraps inside it rather
     than pushing every value along, and the value reads at the body size the reader chose. */
  @media (width >= 640px) {
    .fact {
      grid-template-columns: minmax(0, 16ch) minmax(0, 1fr) var(--tap);
      grid-template-areas: 'label value pencil';
      gap: var(--sp-4);
    }

    .field-value {
      font-size: var(--t-ui);
    }
  }

  /* THE FIELDS THE ROW HAS NOT ANSWERED, as pills that wrap whole, with no separator to trail the
     last one onto a line of its own. */
  .unset {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-3) 0 0;
    border-block-start: 1px solid var(--line);
    list-style: none;
  }

  .unset-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: none;
    border: 1px dashed var(--edge);
    border-radius: var(--r-pill);
    color: var(--dim);
    font: inherit;
    font-size: var(--t-sm);
    text-align: start;
    /* A PILL WRAPS WHOLE onto the next line, and only a label longer than the row wraps inside it. */
    max-inline-size: 100%;
  }

  button.unset-chip {
    color: var(--ink2);
    cursor: pointer;
  }

  /* A FINGER NEEDS ROOM BETWEEN TWO PILLS as well as the 44px `.tap` gives each (design-brief §3). */
  @media (pointer: coarse) {
    .unset {
      gap: var(--sp-3);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    button.unset-chip:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  .document-slot {
    margin-block-start: var(--sp-6);
  }

  /* Prose gets a reading measure; a table, a grid and a ledger get the room. Width is a property of
     the block KIND, not of the page: the third time that family of bug was paid for (13 §4.1).

     AND A NOTE'S OWN HEADINGS SIT UNDER THE PAGE'S, never over them: a note's first heading was set at
     `--t-xl` under a head titled at `--t-lg`, so the row's prose outranked the row (design-brief §5). */
  .document-slot :global(.document > h1) {
    margin-block: var(--sp-5) var(--sp-2);
    font-size: var(--t-md);
    letter-spacing: 0;
  }

  .document-slot :global(.document > h2) {
    margin-block: var(--sp-5) var(--sp-2);
    font-size: var(--t-base);
    letter-spacing: 0;
  }

  /* The note's label and its pencil on one line, the pencil at the edge every fact's pencil shares. */
  .doc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
  }

  .doc-head .doc-label {
    margin-block-end: 0;
  }

  .document-slot :global(.document > h1:first-child) {
    margin-block-start: 0;
  }

  .meta {
    display: grid;
    grid-template-columns: minmax(0, 10ch) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-3);
    margin: 0;
  }

  .meta {
    align-items: baseline;
  }

  .meta dt {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .meta dd {
    min-inline-size: 0;
    margin: 0;
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  .number {
    font-variant-numeric: tabular-nums;
  }

  /* A NOTE ON THE ROW: one line and its button, the capture line's box at the size a finger needs. */
  .note-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block: var(--sp-5);
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
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
  }

  .note-input:hover {
    border-color: var(--edge);
  }

  /* THE HANDOFF IS A BLOCK OF READING, not a form: sentences at the measure, the facts in a short column beside their
     names, and the lists as lists. */
  .handoff {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-inline-size: var(--measure);
    margin-block-end: var(--sp-5);
    padding-block-end: var(--sp-5);
    border-block-end: 1px solid var(--line);
  }

  .handoff-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .handoff-doing {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    overflow-wrap: anywhere;
  }

  .handoff-live {
    flex: none;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .handoff-facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
  }

  .handoff-facts > div {
    display: contents;
  }

  .handoff-facts dt {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .handoff-facts dd {
    margin: 0;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .handoff-title {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .handoff-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink);
    overflow-wrap: anywhere;
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
    /* 24px, THE WIDTH OF AN AGENT'S RUN FACE AT ITS LINE SIZE, so a run's ring is not clipped by the column. */
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 2px var(--sp-2);
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--line);
  }

  .history li > :global(.face) {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  /* A NAME WRAPS RATHER THAN RUNNING UNDER THE TIME beside it: a long name, or an id nobody could name. */
  .history-by {
    grid-column: 2;
    grid-row: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
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
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* The row's figure, its state and its date, above the fields. See `figureField` for why. The lead
     is a container so the figure can answer the room it has, not the width of the window. */
  .lead {
    display: grid;
    gap: var(--sp-2);
    margin-block-end: var(--sp-6);
    container-type: inline-size;
  }

  /* THE HERO IS `--t-xl` ON A PHONE AND `--t-2xl` FROM 900px (design DSN-14), and it never wraps: a
     figure broken between its symbol and its digits is two figures. `--t-3xl` is the entry
     screens' title and nothing else's. */
  .lead-figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: var(--tr-tight);
    line-height: var(--lh-tight);
    white-space: nowrap;
  }

  @media (width >= 900px) {
    .lead-figure {
      font-size: var(--t-2xl);
    }
  }

  /* A FIGURE THAT DOES NOT FIT SHRINKS ONE STEP BEFORE ANYTHING ELSE (design-brief §6), which on the
     narrowest phone is what keeps a long foreign amount from pushing the page sideways. The selector
     carries `.num` so it outranks the 900px step above on specificity rather than on source order. */
  @container (inline-size < 20rem) {
    .lead-figure.num {
      font-size: var(--t-lg);
    }
  }

  /* The code in front of the figure at half its size, the way every headline figure sets it: `em`
     rather than a fixed step, so it stays half of `.lead-figure` at whichever step it is drawn.
     Matches `.cell-figure`/`.cards-figure .amount-code` in blocks.css. */
  .lead-figure :global(.code) {
    font-size: 0.5em;
    font-weight: 600;
  }

  /* EACH ITEM WRAPS WHOLE, with a gap and no separator, so no line below the first opens on a dot. */
  .lead-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    color: var(--ink2);
  }

  /* The state as a word in ink beside its dot: the dot carries the tone, as it does in the list this
     row came from, so a red `Open` is not the loudest thing under the figure. */
  .lead-state {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
    font-weight: 500;
  }

  /* Sentence case in the stylesheet, so the text stays the record's own word. */
  .lead-word {
    display: inline-block;
  }

  .lead-word::first-letter {
    text-transform: uppercase;
  }

  /* HOW LATE, THE DAY A FINISHED ROW FINISHED AND THE DEADLINE never break inside themselves, so
     "Overdue by 38 days" is never "Overdue by" over "38 days". */
  .lead-late,
  .lead-day,
  .lead-due {
    white-space: nowrap;
  }

  /* The age closes the line, a step quieter than the facts before it. */
  .lead-age {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A declared value in sentence case, in the stylesheet, so the text stays the record's own word. */
  .enum-word {
    display: inline-block;
  }

  .enum-word::first-letter {
    text-transform: uppercase;
  }
</style>
