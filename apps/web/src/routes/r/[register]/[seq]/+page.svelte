<!--
  One row: a task, a project, a person, a money line.

  THE PAGE IS THE DOCKED PANEL'S BODY WITH ROOM, and it reads in the product's grammar, top to bottom:
    - the title row: the list's name as the way back, the row's title, the verbs in the toolbar, and under them one
      sentence saying where the row stands, when it is due and how old it is, with only the late phrase in red;
    - the strip of its properties: its status, its dates, who and what it points at, each a pill that opens its field,
      and a dashed pill for each one it has not answered;
    - tiles, and only where there is a figure: the row's own amount with the chart that says where it stands, and for a
      project what came in and the open work on it (`figures.ts`);
    - the body and the rest of the fields as groups on the ground, with no box round them;
    - what points here, and the history, as grouped rows.

  A label is VISIBLE, always. A placeholder is not a label: it disappears exactly when a user needs
  it, and it fails contrast in most themes (06 §8). A set field is a fact with its label; an unset
  one is a chip that says its label and opens its field.

  THE ROW'S NUMBER LIVES IN DETAILS AND NOWHERE ELSE. It is per-list, which is why
  renaming a list's id is refused and its display name is free, and it is what `y` copies; a person
  reading the page reads the title, the figure and where the row stands, never an id after them.

  TWO SHAPES. Below 640px a fact is its label above its value; from 640px the label
  sits in a column capped at 16ch. At every width the pencil that opens a field sits in one trailing
  44px column, so every pencil on the page shares an edge. The hero figure is `--t-figure`, and never wraps.
-->
<script lang="ts">
  /* A FACT IS DRAWN ON THE BAR PRIMITIVE'S `.prop` ROW (`kinds/proportional.css`): its label, its value and their type. */
  import '@braindog/skin/kinds/proportional.css';
  import { apiBase, at } from '$lib/at.ts';
  import { untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { listLine } from '$lib/record/tags.ts';
  import { amountOf, currencyOf, moneyInText, symbolText } from '$lib/record/money.ts';
  import { money, since, TONES } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { currencyFor, dirOf, display, homeCurrency, iconFor, identityOf, labelOf, readableFields, spokenRow, toneOf, whoDid } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Face from '$lib/ui/Face.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import { faceWords, liveOf, runOf } from '$lib/ui/face.ts';
  import { isQuiet } from '@braindog/kernel';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import ListEditor from '$lib/ui/ListEditor.svelte';
  import { ofPeople } from '$lib/ui/RowCards.svelte';
  import { Bars, Segments, Sparkline, Stacked } from '$lib/viz/index.ts';
  import { fieldWords } from '$lib/record/field-words.ts';
  import AddValue from './AddValue.svelte';
  import { putBackOf, valueWords } from '$lib/record/field-write.ts';
  import { draftOf, editable, isFile, isJson, isQuantity, patchOf, unitOf, unitsOf, wrongValue } from '$lib/record/field-draft.ts';
  import FileField from '$lib/ui/FileField.svelte';
  import DayBox from '$lib/ui/DayBox.svelte';
  import QuantityBox from '$lib/ui/QuantityBox.svelte';
  import JsonBox from '$lib/ui/JsonBox.svelte';
  import { ownsRecord, type Me } from '../../../settings/levels.ts';
  import { readHistory, readNames, type Told } from '$lib/record/history-live.ts';
  import { rowReader, type Got, type RowReader } from '$lib/record/row-live.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import { linkReader, type Linked, type LinkReader } from '$lib/record/links-live.ts';
  import type { Entry, FieldDecl, Fields } from '$lib/record/schema.ts';
  import { closed, drew, opened } from '../../../../lib/ui/screen.svelte.ts';
  import { choicesOf, stateSaid, stepsOf } from './lead.ts';
  import { addedSaid, daySaid, daysOf, dueSaid, localDay, rowWords, sentenceOf } from './said.ts';
  import {
    aboutOf,
    comparedOf,
    comparedSaid,
    figureReader,
    figureWords,
    MONEY_IN,
    moneyInSaid,
    openWorkSaid,
    viaOf,
    type FigureReader,
    type MoneyIn,
    type OpenWork,
  } from './figures.ts';
  import { METRICS } from '$lib/record/declared.ts';
  import { handFor } from '$lib/record/hand.ts';
  import type { Backlink } from '$lib/record/api.ts';
  import { actor, listName, nameWords } from '$lib/record/names.ts';
  import { movable, scopeFieldOf } from '$lib/record/scope-move.ts';
  import ScopeMove from './ScopeMove.svelte';
  import Thread from '$lib/ui/Thread.svelte';
  import HandSheet from '$lib/ui/HandSheet.svelte';
  import UsedBy from '$lib/page/panels/UsedBy.svelte';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { reachWords } from '../reach.ts';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));
  /* THE IDS ARE THIS PAGE'S OWN, so the strip's pill names the editor it opens under it. */
  const uid = $props.id();

  /**
   * THE ROW IS THE RECORD'S ANSWER TO `get`, AND NOTHING ELSE.
   *
   * It had two other sources. The sample's row of the same number was drawn here when there was no
   * record, and a row somebody typed into the capture line against the sample waited in `pending`
   * under a NEGATIVE sequence, drawn here with `Not saved` on it. The sample went, and
   * `pending` with it: the capture line writes to the record, so the
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
  /**
   * WHAT THE CALLER'S LEVEL ON THIS ROW'S LIST REACHES, asked of `may()` and never worked out here.
   *
   * A CONTROL THE RECORD WOULD REFUSE IS NOT DRAWN: Edit, Archive, a field's pencil and the scope move are an `update`,
   * which asks `write` of the list, and a note is a `log`, which asks `append`. A comment asks only that the row can be
   * read, which is what drew this page, so the thread is not gated. `proposes` is the new-field box's rung, which files
   * a proposal for anyone but the owner, and a `propose` names no list.
   */
  const changes = $derived(live && may(page.data as unknown as Shell, 'write', id));
  const notes = $derived(live && may(page.data as unknown as Shell, 'append', id));
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
     from the sample's walk everywhere else. That walk is gone with the sample. */
  let linked = $state<Linked | null>(null);
  let links: LinkReader | null = null;
  /* A ROW THAT POINTS HERE LEADS WITH WHAT IT IS AND CARRIES NO NUMBER: its columns are `columnsFor`'s, which draws
     none by default, and each row still opens by its own link. */
  const incoming = $derived(linked?.from === 'live' ? linked.groups : []);

  /**
   * THE ROW'S FIGURES, READ ONCE THE ROW IS (`figures.ts`): what came in for a project, month by month, and the open
   * work that points here. Outside the bracket below, because they are the row's figures and not the row: the page is
   * drawn without them, and each tile arrives when its read does or never, when the record has nothing to draw.
   */
  let moneyIn = $state<MoneyIn | null>(null);
  let openWork = $state<OpenWork | null>(null);
  /* WHERE EACH TILE'S "All" GOES: the list its figure was read from, filtered to this row by the field that points
     here, as a group's "All N" does. */
  let moneyAll = $state<string | null>(null);
  let workAll = $state<string | null>(null);
  let figures: FigureReader | null = null;

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
    moneyIn = null;
    openWork = null;
    moneyAll = null;
    workAll = null;
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
    if (r.from === 'live' && r.entry) void readFigures(register, n, r.entry, l.from === 'live' ? l.groups : []);
  }

  /**
   * THE FIGURES, ASKED ONLY WHERE THE RECORD HOLDS WHAT THEY READ, and found from what the record declares rather than
   * from list names written here (`tools/gates/web-lists.mjs`):
   *   - what came in is asked when the list its figure reads (its declaration's `source`) is held, and the field its
   *     parameter fills points at this row's list, so it is asked of a project's page and of nothing else;
   *   - the open work is the first list pointing here that says who holds its rows (`hand:`), counted through the field
   *     that points, and only while it has a state to count by. What points here has already been read, and each list
   *     in it learnt, so this costs one read and no schema.
   * A record without either asks nothing, so a student's page costs no refusal.
   */
  async function readFigures(register: string, n: number, entry: Entry, pointing: readonly Backlink[]) {
    const key = `${register}#${n}`;
    const shell = page.data as unknown as Partial<Shell>;
    const holds = new Set((shell.index?.registers ?? []).map((r) => r.id));
    const d = REGISTERS[register];
    const name = d ? String(entry.fields[d.title] ?? '').trim() : '';
    const about = aboutOf(METRICS[MONEY_IN]);
    const earns = about !== null && holds.has(about.list) && REGISTERS[about.list]?.fields.find((f) => f.id === about.field)?.to === register && name !== '';
    const work = pointing.map((g) => g.register).find((list) => handFor(REGISTERS[list]) !== null && viaOf(REGISTERS[list], register) !== null);
    const via = work ? viaOf(REGISTERS[work], register) : null;
    figures ??= figureReader(apiBase());
    const [m, w] = await Promise.all([
      earns ? figures.moneyIn(name) : Promise.resolve(null),
      work && via ? figures.openWork(work, via, `${register}#${n}`, localDay(Date.now())) : Promise.resolve(null),
    ]);
    if (askedFor !== key) return;
    moneyIn = m;
    openWork = w;
    moneyAll = m && about ? `/r/${about.list}?f=${about.field}:is:${n}` : null;
    workAll = w && work && via ? `/r/${work}?f=${via.field}:is:${n}` : null;
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
   *
   * ONE BOX, WHEREVER THE FIELD IS DRAWN: under the strip for a property, in the tile for the figure, in its row under
   * Details for the rest, and in its group for prose. The box is the `fieldEditor` snippet in every one of them.
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
       sample, and a row the record refused to show draws no edit control to press. */
    if (!row || !changes) return;
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
  /* THE HISTORY BY DAY, as every list on the ground is grouped: Today, Yesterday, then the day. */
  const historyDays = $derived(daysOf(history, clock));
  /* THE RECORD'S ROW DOES NOT SAY WHO ADDED IT; its oldest event does. */
  const addedBy = $derived(live ? (history.at(-1)?.by ?? '') : (row?.by ?? ''));

  /* WHO, BY NAME: the reader is You, and the record's members are asked for once, only when somebody else is in the
     history, so a row only you have touched costs no read. */
  const me = $derived(String(page.data.me?.person ?? ''));
  /* WHETHER A FIELD ADDED HERE LANDS AT ONCE OR WAITS ON DECIDE: the settings screen's one predicate for owning. */
  const owner = $derived(page.data.me ? ownsRecord(page.data.me as Me) : false);
  const proposes = $derived(owner || may(page.data as unknown as Shell, 'append'));
  /* THE LIST'S FIELDS SHEET, opened from the head's "…" menu. */
  let fieldsOpen = $state(false);
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
   * much, where it stands, and when. So the first money field is the page's figure, where it stands and
   * when it is due are the sentence under the title, and the row's age closes that sentence with its
   * label. The tone is the list's own (`toneOf`), so a row drawn late in the list is drawn late here.
   *
   * A FIELD SHOWN HERE IS NOT SHOWN TWICE. The facts below keep everything else, and an empty field
   * is a chip rather than a row saying "Not set".
   */
  const unsetValue = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && listLine(v) === null);
  const figureField = $derived(shortFields.find((f) => f.type === 'money'));
  const dueField = $derived(shortFields.find((f) => (f as { deadline?: boolean }).deadline === true));
  const figure = $derived(figureField && row ? amountOf(row.fields[figureField.id]) : null);
  const leadTone = $derived(row ? (toneOf(id, row, clock) ?? tone) : undefined);
  const due = $derived(dueField && row ? row.fields[dueField.id] : undefined);
  /* LATE OR CLOSE, IN WORDS: "Overdue by 38 days", "Due in 3 days". A finished row is never late, and a date far enough
     off to carry no tone is said as its date alone. */
  const lateTone = $derived(!done && (leadTone === 'bad' || leadTone === 'warn') ? leadTone : undefined);
  const late = $derived(lateTone && typeof due === 'string' ? dueSaid(due, clock) : null);
  /* THE DAY A FINISHED ROW FINISHED, which the record writes into the list's `finished` field: "Paid 2 Sep". A list
     that declares none says the state word alone, since any other date would be a guess at when it happened. */
  const finishedDay = $derived(done && decl?.finished && row ? row.fields[decl.finished] : undefined);
  const finishedOn = $derived(typeof finishedDay === 'string' && finishedDay !== '' ? daySaid(finishedDay, clock) : null);
  /* WHERE THE ROW APPLIES IS SAID BY THE CHIP IN THE HEAD AND MOVED FROM IT (`ScopeMove.svelte`), so a field one press
     moves is not a fact as well: empty, it was the chip "+ Where it applies" under a row that applies everywhere. */
  const scopeField = $derived.by(() => (void got, scopeFieldOf(id)));
  /* THE FIELDS THE HEAD SAYS: the figure the tile leads with, the finished day the sentence says after the state, and
     where the row applies, which is the toolbar's chip. */
  const leadIds = $derived(
    new Set(
      [figure !== null ? figureField?.id : undefined, finishedOn ? decl?.finished : undefined, movable(scopeField) ? scopeField.id : undefined].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  );
  /* THE TITLE IS THE HEAD, SO IT IS NOT A FACT AS WELL. It is listed only while it is empty, when its chip is the way
     to it, or while the head's Edit has it open, when its row holds the box. */
  const titled = $derived(Boolean(decl && row && !unsetValue(row.fields[decl.title])));
  const listed = $derived(shortFields.filter((f) => !leadIds.has(f.id) && (f.id !== decl?.title || !titled || editing === f.id)));

  /* EVERY EMPTY FIELD IS A CHIP. A person with four unset fields was a column of four "Not set" rows,
     then one line of names with a separator trailing the last; a chip names its field, wraps whole, and on a row you can
     write to it opens that field. */
  const unsetFields = $derived(row ? listed.filter((f) => unsetValue(row.fields[f.id]) && editing !== f.id) : []);
  const shownFields = $derived(listed.filter((f) => !unsetFields.includes(f)));

  /**
   * THE ROW'S PROPERTIES ARE PILLS IN ONE STRIP UNDER THE TITLE: a word or a day that says what kind of row
   * this is and where it points, which a person scans across rather than down. Its status, its dates, who holds it and
   * which project, each with its label, each a press away from its box; the rest (sums, counts, lists, sentences) are
   * facts in Details, where a value has the room to be long.
   */
  const PROPS: ReadonlySet<string> = new Set(['enum', 'ref', 'day', 'bool']);
  const isProp = (f: FieldDecl): boolean => PROPS.has(f.type);
  const pills = $derived(shownFields.filter((f) => isProp(f) && f.id !== decl?.title));
  const facts = $derived(shownFields.filter((f) => !pills.includes(f)));
  const unsetProps = $derived(unsetFields.filter(isProp));
  /* THE PROPERTY WHOSE BOX IS OPEN, drawn under the strip that holds its pill. */
  const propEditing = $derived(pills.find((f) => f.id === editing));
  /* A RUN'S PROJECT OPENS THE PROJECT, so its pill is a link to read and not a button to press. */
  const opensRow = (f: FieldDecl, value: unknown): boolean => id === 'session' && f.id === 'project' && spokenRow(value, names) !== null;

  /**
   * A RUN'S PAGE LEADS WITH ITS HANDOFF: what it is doing, where, the next step, what it already tried and its
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
      /* GONE QUIET AS THE RECORD SAYS IT (`isQuiet`): open, and not heard from in 30 minutes. */
      live: liveOf(f.state, isQuiet({ fields: f as never, updated_at: row.created }, clock)),
      doing: said(f.doing),
      project: project ? (names?.get(project) ?? null) : null,
      mark: mark ? { mark: mark.mark, hue: mark.hue } : null,
      next: said(f.next),
      tried: lines(f.tried).reverse(),
      notes: lines(f.notes),
    };
  });
  /* A DOCUMENT WITH NO PROSE IS ONE OF THOSE CHIPS TOO, after the short fields, and its group is drawn only while it
     holds prose or its box is open. */
  const writtenDocuments = $derived(row ? documents.filter((f) => !unsetValue(row.fields[f.id]) || editing === f.id) : []);
  const unset = $derived([...unsetFields.filter((f) => !isProp(f)), ...documents.filter((f) => !writtenDocuments.includes(f))]);

  /**
   * THE SENTENCE UNDER THE TITLE, in place of the lead line of dots and words it replaced: where the row
   * stands, how late or when it is due, and how old it is. `said.ts` builds it; the state's word is drawn here, through
   * `stateSaid`, in the `lead-word` span the label tests read.
   */
  const sentence = $derived(
    row
      ? sentenceOf({
          archived,
          state: stateValue !== '',
          finished: finishedOn,
          late: late && lateTone ? { text: late, tone: lateTone } : null,
          due:
            due !== undefined && due !== null && due !== '' && dueField
              ? { label: labelOf(dueField), day: dueField.type === 'day' ? daySaid(String(due), clock) : String(display(id, dueField.id, due, clock, names) ?? '') }
              : null,
          added: addedSaid(row.created, clock),
        })
      : [],
  );

  /**
   * THE LEAD TILE, AND ONLY WHEN IT HAS A CHART: the row's amount, where the row stands on its list's way
   * through its states (`Segments`), and its amounts against each other where it holds two in one currency (`Bars`). An
   * amount with nothing to chart is a figure on the ground and not a tile, since a number tile without a chart is the
   * one thing the design system forbids a tile to be.
   */
  const steps = $derived(stepsOf(decl, stateValue));
  const compared = $derived(row && figureField && figure !== null ? comparedOf(shortFields, row.fields, figureField.id, labelOf) : null);
  const charted = $derived(steps !== null || compared !== null);
  const stateField = $derived(decl ? decl.fields.find((f) => f.id === decl.state) : undefined);

  /* AN AMOUNT AS A TILE WRITES ONE: the symbol where the record's currency has one, and no fraction of all zeros. */
  const moneySaid = (minor: number, currency: string): string => symbolText(money(minor, currency), homeCurrency(), true);

  /* EVERY VALUE IN A ROW'S PROSE IS A HOLE UNTIL PAGES READ THEM. The sample's own values answered them off the
     row, and pressing one said what would have happened; neither has a record behind it. */
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
  <!-- THE SENTENCE, IN PIECES FROM `said.ts`: the state's word through `stateSaid`, and the late phrase coloured, red
       once the day has passed (`data-needs`, the title row's one red) and amber while it is close. -->
  {#snippet sentenceLine()}{#each sentence as piece, i (i)}{#if piece.kind === 'state'}<span class="lead-word">{stateSaid(decl, stateValue)}</span>{:else if piece.kind === 'late'}<span class="said-late" data-tone={piece.tone} data-needs={piece.tone === 'bad' ? '' : undefined}>{piece.text}</span>{:else}{piece.text}{/if}{/each}{/snippet}

  <!-- A VALUE AS THE PAGE SAYS IT, in a pill and in Details alike. -->
  {#snippet shown(f: FieldDecl, value: unknown)}
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
  {/snippet}

  <!--
    THE BOX IS THE ONE THE NEW-ROW FORM DRAWS, BY TYPE, because which control a field takes is a
    property of its declared type and not of the screen it is on. The classes are `controls.css`'s, so
    this is the same field shape as the rest of the product rather than a second one that drifts.

    A `ref` IS TYPED AS THE NUMBER A PERSON SAYS, beside the name of the list it points at, and not
    picked from a menu: the rows of the other register are a read this screen has not made, and a menu
    built from the sample would offer another record's rows. The number goes through the same
    conversion the list writes through, and a number with no row is refused by the record in a
    sentence that lands under the box.
  -->
  {#snippet fieldEditor(f: FieldDecl, value: unknown)}
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
        <div class="field edit-select">
          <select class="field-input edit-input" aria-label={labelOf(f)} bind:value={draft}>
            <option value="">{copy.noneChosen}</option>
            {#each choicesOf(f) as [v, said]}<option value={v}>{said}</option>{/each}
          </select>
          <!-- `.field-input` takes the browser's own drawing off the menu, so the field draws its chevron. -->
          <span class="edit-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
        </div>
      {:else if f.type === 'day'}
        <!-- A DAY IN THE RECORD'S WORDS, `3 Sep 2026`, and not the browser's `mm/dd/yyyy`. -->
        <DayBox bind:value={draft} label={labelOf(f)} />
      {:else if isQuantity(f)}
        <!-- A NUMBER AND THE UNIT IT COUNTS, the unit chosen from the ones the field knows. -->
        <QuantityBox bind:value={draft} units={unitsOf(f, value)} label={labelOf(f)} />
      {:else if isJson(f)}
        <!-- STRUCTURED DATA WRITTEN OUT, refused on the save when it does not read. -->
        <JsonBox bind:value={draft} label={labelOf(f)} />
      {:else if isFile(f)}
        <!-- A FILE IS CHOSEN, NEVER TYPED: the picker sends the bytes and the draft holds what came back. -->
        <FileField bind:value={draft} label={labelOf(f)} />
      {:else if f.type === 'money'}
        <!-- THE CURRENCY THE BOX WRITES IN, by the chain `field-draft.ts` types in: the row's, the field
             default's, the list's, then the record's, so an empty box names what it will write. -->
        {@const unit = currencyOf(value) ?? currencyOf(f.default) ?? currencyFor(id, f.id) ?? homeCurrency()}
        <div class="field">
          {#if unit}<span class="edit-unit">{unit}</span>{/if}
          <input class="field-input num" type="text" inputmode="decimal" aria-label={labelOf(f)} bind:value={draft} />
        </div>
      {:else if f.type === 'int' || f.type === 'decimal' || f.type === 'duration'}
        <div class="field">
          <input class="field-input num" type="text" inputmode="decimal" aria-label={labelOf(f)} bind:value={draft} />
          <!-- A DURATION IS TYPED IN THE UNIT IT IS SAID IN, and one that names none is said in seconds, so
               its box says `s` rather than nothing. This drew `h` beside a box holding 7200 seconds. -->
          {#if f.type === 'duration'}<span class="edit-unit">{unitOf(f)}</span>{:else if f.unit}<span class="edit-unit">{f.unit}</span>{/if}
        </div>
      {:else if f.type === 'ref'}
        <div class="field">
          <input class="field-input num" type="text" inputmode="numeric" aria-label={labelOf(f)} bind:value={draft} />
          {#if f.to}<span class="edit-unit">{listName(f.to)}</span>{/if}
        </div>
      {:else}
        <div class="field"><input class="field-input" type="text" aria-label={labelOf(f)} bind:value={draft} /></div>
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
  {/snippet}

  <!-- THE PENCIL THAT OPENS A FIELD: its own cell in a fact's trailing column, and the heading's control on a tile or a
       group of prose. -->
  {#snippet pencil(f: FieldDecl)}
    <button type="button" class="edit-field tap" aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>
      <Icon name="edit" size="s" />
    </button>
  {/snippet}

  <!-- THE ROW'S AMOUNT, as big as a figure is set (`--t-figure`), in the lead tile or, with nothing to chart, on the
       ground. A container, so the figure answers the room it has and not the width of the window. -->
  {#snippet hero()}
    {#if figure !== null && figureField}
      <div class="lead">
        {#if editing === figureField.id}
          {@render fieldEditor(figureField, row.fields[figureField.id])}
        {:else}
          <p class="lead-figure num">
            <Money minor={figure} currency={currencyOf(row.fields[figureField.id]) ?? ''} weight="strong" />
          </p>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet heroPencil()}
    {#if figureField && editing !== figureField.id}{@render pencil(figureField)}{/if}
  {/snippet}

  <!-- THE LIST'S NAME IS THE WAY BACK: a link above the title from 900px, and the chevron in the
       phone's bar below it. No number follows the title; it is in Details. -->
  <PageHead icon={iconFor(decl?.icon, 'rows')} kicker={listName(id)} back={`/r/${id}`} title={String(row.fields[decl.title] ?? '')} sentence={sentenceLine}>
    {#snippet actions()}
      <!-- `Copy id` WAS THE FIRST ACTION IN THIS HEADER, AND IT LIVES BESIDE THE NUMBER NOW. A row's
           page led with a developer verb: the first control a person saw on an invoice was the one
           that puts `obligations#1` on the clipboard, ahead of anything that does something to the
           invoice. Details holds the number and its "Copy link", and `y` still copies the id. -->
      <!-- WHERE THE ROW APPLIES, FIRST: the project's chip, or the globe and "Everywhere", which opens the move. -->
      <ScopeMove register={id} {row} {names} live={changes} title={String(row.fields[decl.title] ?? '')} onmoved={() => void rowMoved(id, seq)} />
      <!-- THE ONE PRIMARY, AND ONLY ON A LIST WITH NO STATE: where a row has a status, moving it is the verb that
           matters and it is a pill of its own; where it has none, editing it is the thing to do. -->
      {#if changes}<Button weight={decl.state ? 'quiet' : 'primary'} onclick={editTitle}>{copy.editRow}</Button>{/if}
      <!-- ARCHIVE IS THE LIST'S OWN VERB, on the row itself: a row that can be archived in one
           place and not the other is two products. `Put back` stands where `Archive` was for as
           long as this tab holds the row it just archived: see `archived` for why that moment is
           the only one it can be offered in. -->
      <!-- AND NEITHER FOR SOMEBODY WHO CANNOT CHANGE THE LIST, where the note's place says why. -->
      {#if changes && archived}
        <Button weight="quiet" disabled={saving} onclick={() => void setArchived(false)}>{copy.rowRestore}</Button>
      {:else if changes}
        <Button weight="quiet" disabled={saving} onclick={() => void setArchived(true)}>{copy.rowArchive}</Button>
      {/if}
      <!-- "HAND TO": a teammate or an agent in one press, on a list that says who holds its rows, and while an
           agent holds this one, the run working on it or whose next session it waits for. -->
      {#if live && !archived}
        <HandSheet register={id} {row} {decl} trigger onhanded={() => void rowMoved(id, seq)} />
      {/if}
      <!-- THE HEAD'S "…", LAST: what is done to the list this row is in, and the row's link. A 36px
           glass circle, named for a screen reader by the hidden words and for a pointer by its tooltip. -->
      {#if live}
        <Menu label={copy.moreOn(String(row.fields[decl.title] ?? '') || decl.one)} align="end">
          {#snippet trigger()}
            <span class="head-more" title={copy.moreOn(String(row.fields[decl.title] ?? '') || decl.one)}
              ><Icon name="more" size="l" /><span class="head-vh">{copy.moreOn(String(row.fields[decl.title] ?? '') || decl.one)}</span></span
            >
          {/snippet}
          {#if proposes}<button type="button" class="mi" role="menuitem" onclick={() => (fieldsOpen = true)}>{fieldWords.add}</button>{/if}
          <button type="button" class="mi" role="menuitem" onclick={() => clipboard.putLink(id, row.seq)}>{copy.copyLink}</button>
        </Menu>
      {/if}
    {/snippet}
  </PageHead>
  {#if live && proposes}<ListEditor bind:open={fieldsOpen} register={id} {owner} onchanged={() => (got = got && { ...got })} />{/if}

  <div class="page">
    <!-- SAID ON THE ROW, because every list leaves an archived row out and nothing else on this
         screen would say why it has gone from them. -->
    {#if archived}
      <p class="archived-note"><Icon name="archive" size="s" /><span>{copy.rowArchivedNote}</span></p>
    {/if}

    <!-- THE STRIP OF PROPERTIES. A PERSON'S PAGE LEADS IT WITH THEIR FACE, the one their row wears in the
         list, drawn from the name in the title above; `Face` is `aria-hidden` because that name is already said. Each
         pill is its label and its value, and on a row you can write to it opens its box under the strip; each dashed
         pill is a property the row has not answered. -->
    {#if ofPeople(decl) || pills.length > 0 || unsetProps.length > 0}
      <ul class="props" aria-label={rowWords.props}>
        {#if ofPeople(decl)}<li class="lead-face"><Face name={String(row.fields[decl.title] ?? '')} kind="person" size="l" /></li>{/if}
        {#each pills as f (f.id)}
          {@const value = row.fields[f.id]}
          {@const overdue = f.id === dueField?.id && lateTone === 'bad'}
          <li>
            {#if changes && editable(f) && !opensRow(f, value)}
              <button
                type="button"
                class="prop tap"
                data-late={overdue ? '' : undefined}
                aria-expanded={editing === f.id}
                aria-controls={editing === f.id ? `${uid}-edit` : undefined}
                title={copy.editValue(labelOf(f))}
                onclick={() => (editing === f.id ? stopEdit() : startEdit(f))}
              >
                <span class="prop-label">{labelOf(f)}</span>
                <span class="prop-value" dir={dirOf(id, f.id)}>{@render shown(f, value)}</span>
              </button>
            {:else}
              <!-- A VALUE THAT IS A LINK IS NOT INSIDE A BUTTON: the pill reads, and its pencil beside it opens the box. -->
              <span class="prop" data-late={overdue ? '' : undefined}>
                <span class="prop-label">{labelOf(f)}</span>
                <span class="prop-value" dir={dirOf(id, f.id)}>{@render shown(f, value)}</span>
              </span>
              {#if changes && editable(f) && editing !== f.id}{@render pencil(f)}{/if}
            {/if}
          </li>
        {/each}
        {#each unsetProps as f (f.id)}
          <li>
            {#if changes && editable(f)}
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
    {#if propEditing}
      <div class="prop-editor" id="{uid}-edit">
        <p class="prop-editor-label">{labelOf(propEditing)}</p>
        {@render fieldEditor(propEditing, row.fields[propEditing.id])}
      </div>
    {/if}

    <!-- AN AMOUNT WITH NOTHING TO CHART stands on the ground, its pencil beside it. -->
    {#if figure !== null && figureField && !charted}
      <div class="figure-ground">
        {@render hero()}
        {#if changes && editable(figureField)}{@render heroPencil()}{/if}
      </div>
    {/if}

    <!-- THE TILES, ONLY WHERE THERE IS A FIGURE: each a figure, its chart, and one line saying what it means. -->
    {#if charted || moneyIn || openWork}
      <div class="tiles">
        {#if charted}
          <Tile
            lead
            icon={iconFor(decl.icon, 'rows')}
            title={figure !== null && figureField ? labelOf(figureField) : stateField ? labelOf(stateField) : decl.one}
            actions={figure !== null && figureField && changes && editable(figureField) ? heroPencil : undefined}
          >
            {@render hero()}
            {#if compared}
              <Bars items={compared.items} format={(n) => moneySaid(n, compared.currency)} summary={comparedSaid(compared)} />
              <p class="reading">{comparedSaid(compared)}</p>
            {/if}
            {#if steps}
              <!-- THE STEP IN HAND IS OUTLINED RED ONLY ONCE THE ROW IS LATE, which is the chart's one red. -->
              <Segments total={steps.total} done={steps.done} current={steps.current} tone={lateTone === 'bad' ? 'danger' : undefined} summary={steps.said} />
              <p class="reading">{steps.said}</p>
            {/if}
          </Tile>
        {/if}
        {#if moneyIn}
          <Tile icon="money" title={rowWords.moneyIn} href={moneyAll ?? undefined} hrefLabel={moneyAll ? rowWords.all : undefined}>
            <div class="stat">
              <p class="tile-figure num">{moneySaid(moneyIn.total, moneyIn.currency)}<span class="tile-figure-note">{rowWords.months(moneyIn.months.length)}</span></p>
              <div class="stat-line">
                <Sparkline values={moneyIn.months.map((m) => m.value)} tone="earn" mark="high" subject={rowWords.moneyIn} format={(n) => moneySaid(n, moneyIn?.currency ?? '')} />
              </div>
            </div>
            <p class="reading">{moneyInSaid(moneyIn, clock, moneySaid)}</p>
          </Tile>
        {/if}
        {#if openWork}
          <Tile icon="task" title={rowWords.openWork} href={workAll ?? undefined} hrefLabel={workAll ? rowWords.all : undefined}>
            <p class="tile-figure num">{openWork.total.toLocaleString('en')}{#if openWork.atLeast}<span class="more-sign">+</span>{/if}</p>
            <Stacked parts={openWork.parts.map((p) => ({ label: p.label, value: p.count }))} subject={rowWords.openWork} />
            <p class="reading">
              {openWorkSaid(openWork)}{#if openWork.late > 0}{' '}<span class="said-late" data-tone="bad">{figureWords.late(openWork.late)}</span>{/if}
            </p>
          </Tile>
        {/if}
      </div>
    {/if}

    <div class="split">
      <div class="main">
        <!-- A RUN READS AS ITS HANDOFF, led by its face, what it is doing and where it is, then what the next
             session needs: the next step, what was already tried, newest first, and the notes it left. The one place
             `live` is used on this page, in the face's ring. -->
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

        <!-- THE BODY: a `document` field is the dialect, drawn by the same interpreter a declared page uses, one group on
             the ground each. The read view IS the renderer, so what you are looking at is the artefact (22 §8). A
             document the row does not carry yet is still a field the list declares, so it is a chip under Details, like
             every other unset field, and pressing it opens its box here. -->
        {#each writtenDocuments as f (f.id)}
          <Section title={labelOf(f)}>
            {#snippet aside()}{#if changes && editing !== f.id}{@render pencil(f)}{/if}{/snippet}
            <article class="document-slot">
              {#if editing === f.id}
                <form
                  class="editor"
                  onsubmit={(e) => {
                    e.preventDefault();
                    void saveEdit(f);
                  }}
                >
                  <textarea class="edit-area" rows="10" aria-label={labelOf(f)} bind:value={draft}></textarea>
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
          </Section>
        {/each}

        <!-- DETAILS: every fact that is not a property, its number and when it was added. "This row" said what you are
             already looking at, and "Spoken id" and "Version" are both the record's own vocabulary: one is the thing you
             say out loud, which is what the row is called, and the other is a compare-and-set counter that means nothing
             to a reader and changes on every write. The id stays, because it is the handle you paste into an agent. The
             counter goes; the History beside it is the version, in words. -->
        <Section title={rowWords.details}>
          <dl class="field-list">
            {#each facts as f (f.id)}
              {@const value = row.fields[f.id]}
              <div class="fact">
                <dt class="field-label">{labelOf(f)}</dt>
                <dd class="field-value" data-type={f.type} dir={dirOf(id, f.id)}>
                  {#if editing === f.id}
                    {@render fieldEditor(f, value)}
                  {:else}
                    <!-- ONLY A SET FIELD IS A FACT, so the value is always there: an empty one is a chip under the facts,
                         except while its box is open, when it is drawn here and never reaches this branch. -->
                    {@render shown(f, value)}
                  {/if}
                </dd>
                <!-- THE PENCIL IS ITS OWN CELL IN THE TRAILING COLUMN, so every pencil on the page shares one edge
                     whatever the value beside it holds. A `dd`, because a `dl`'s groups hold nothing else. -->
                {#if changes && editable(f) && editing !== f.id}
                  <dd class="field-pencil">{@render pencil(f)}</dd>
                {/if}
              </div>
            {/each}
            <div class="fact">
              <dt class="field-label">{nameWords.number}</dt>
              <!-- THE ROW'S NUMBER, AND THE BUTTON THAT COPIES ITS LINK. This is the one place the number is
                   printed, bare and without the `#` that made it read as an id. The link is
                   what a person pastes into a message and what opens the row for whoever follows it; `y`
                   still copies the id and `⇧Y` the link, and the `?` sheet lists both keys. -->
              <dd class="field-value id-line">
                <span class="number num">{row.seq}</span>
                <button type="button" class="copy-id tap" onclick={() => clipboard.putLink(id, row.seq)}>
                  <Icon name="copy" size="s" /><span>{copy.copyLink}</span>
                </button>
              </dd>
            </div>
            <div class="fact">
              <dt class="field-label">Added</dt>
              <!-- IN WORDS, like the other two surfaces that answer "who changed my record". `actorOf`
                   moved into `api.ts` when Home and `/audit` were found spelling the same two actors two
                   ways; this route was the third. -->
              <dd class="field-value">{#if addedWho}{copy.rowAddedBy(since(row.created, clock), addedWho.you ? copy.rowByYou : addedWho.person && addedWho.name === copy.feedSomeone ? copy.rowBySomeone : addedWho.name)}{:else}{since(row.created, clock)}{/if}</dd>
            </div>
          </dl>
          <!-- WHAT THE ROW HAS NOT ANSWERED, one pill each in one wrapping row, and on a row you can write to each opens its
               field. The list is named for a screen reader, since the pills alone do not say they are empty. -->
          {#if unset.length > 0}
            <ul class="unset" aria-label={copy.editNotSet}>
              {#each unset as f (f.id)}
                <li>
                  {#if changes && editable(f)}
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
          <!-- A FIELD THIS LIST DOES NOT HAVE YET is added from the head's "…" menu, in the list's own Fields
               sheet, so the row page and the list offer one way to add a field and not two. -->
        </Section>

        <!-- WHO USED IT: a key's or a tool's row lists the last ten runs that opened or reached it. -->
        {#if live && (id === 'credentials' || id === 'tools')}
          <UsedBy spoken="{id}#{row.seq}" />
        {/if}

        <!-- WHAT POINTS HERE, one group per RELATION, not per register: two fields of one register can point at the same
             place and mean different things — an update's `track` is what it is about and its `supersedes` is what it
             replaces. Each row leads with its list's icon and what it is, its other values as its meta line, and the
             list's tone as its dot. -->
        {#each incoming as rel}
          {@const twice = incoming.filter((r) => r.name === rel.name).length > 1}
          <Section title={rel.name} count={rel.total}>
            {#snippet aside()}
              <!-- The field only where it tells two groups apart; elsewhere it read as part of the heading. -->
              {#if twice}<span class="incoming-label">{copy.linkedThrough(rel.label)}</span>{/if}
              {#if rel.total > rel.rows.length}
                <a class="incoming-more tap" href={at(rel.href)}>All {rel.total} <Icon name="arrow" size="s" /></a>
              {/if}
            {/snippet}
            <!-- A LEDGER, SO ITS AMOUNTS ARE EXACT: a linked invoice reads '£1,200.00', to the penny, as every other ledger
                 does, not the sentence's rounded '£1,200'. -->
            <ul class="ledger ledger-lead" aria-label="{rel.name} · {rel.label}">
              {#each rel.rows as r (r.key)}
                {@const rest = r.cells.slice(1).filter((c): c is string => Boolean(c))}
                <li>
                  <a class="line line-tall" href={at(r.href ?? '')}>
                    <span class="line-mark"><IconWell name={rel.icon} size="l" /></span>
                    <span class="line-main">
                      <span class="line-title" dir="auto">{moneyInText(r.cells[0] || r.key, homeCurrency(), 'exact')}</span>
                      {#if rest.length > 0}<span class="line-detail">{rest.map((c) => moneyInText(c, homeCurrency(), 'exact')).join(' · ')}</span>{/if}
                    </span>
                    {#if r.tone}
                      <span class="line-when" data-intent={r.tone}><span class="glyph" role="img" aria-label={TONES[r.tone].label}>{TONES[r.tone].glyph}</span></span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </Section>
        {/each}
        <!-- THE ONE READ ON THIS SCREEN THAT CAN BE REFUSED BY ITSELF: a caller may read this row
             and not the lists that point at it. Drawing nothing would say nothing points here,
             which is a different fact about the record. -->
        {#if linked?.from === 'refused'}
          <section class="incoming"><Empty kind="error" compact title={copy.linksRefused} /></section>
        {/if}
      </div>

      <div class="side">
        <!-- THE ROW'S COMMENTS. A note is the row's own log line and asks to change the row; a comment is somebody
             saying something about it, which a Reads colleague may too, with replies one level deep and a resolved comment
             folded. Named as the row is spoken. -->
        {#if live}<Thread on="{id}#{row.seq}" me={me || null} {people} />{/if}

        <Section title={rowWords.history}>
          <!-- THE NOTE BOX, at the head of the history it lands in, for somebody whose level adds to the list.
               For a Reads colleague the place says in one sentence why this row has no Edit, Archive or note. -->
          {#if notes}
            <form class="note-form" onsubmit={addNote}>
              <label class="note-label" for="row-note">{copy.noteLabel}</label>
              <div class="field note-line">
                <input id="row-note" class="field-input note-input" type="text" maxlength="280" autocomplete="off" placeholder={copy.notePlaceholder} bind:value={noteText} />
                {#if noteText.trim()}<Button type="submit" size="sm">{copy.noteAdd}</Button>{/if}
              </div>
            </form>
          {:else if live}
            <p class="reach">{reachWords.readOnly(listName(id))}</p>
          {/if}

          {#if told?.from === 'refused'}
            <Empty kind="error" compact title={told.fix} />
          {:else}
            {#each historyDays as d (d.key)}
              <h3 class="day-head">{d.said}</h3>
              <ol class="history">
                {#each d.lines as e}
                  <!-- WHO, BY `actor`, SO THE FACE IS DRAWN BY KIND: a rule wears the automations glyph and BrainDog its
                       mark, never a monogram. The name is printed as `actor` says it, since "de Vries" is not a typo. -->
                  {@const who = actor(e.by, me || null, people)}
                  <li>
                    <!-- AN AGENT'S LINE WEARS ITS RUN, in the run's hue and linking to its handoff. -->
                    <Face name={who.name} kind={who.kind} run={runOf(e.by)} size="s" />
                    <p class="history-line"><span class="history-by">{who.name}</span> <span class="history-note">{e.note}</span></p>
                    <time class="history-when" datetime={e.at}>{since(e.at, clock)}</time>
                  </li>
                {/each}
              </ol>
            {/each}
          {/if}
        </Section>
      </div>
    </div>
  </div>
{/if}

<style>
  /* THE PAGE: the ground, no box. The strip, the tiles and the two columns are 24 apart, and the columns' groups 32. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* ── the sentence's pieces ─────────────────────────────────────────── */

  /* Sentence case in the stylesheet, so the text stays the record's own word. */
  .lead-word {
    display: inline-block;
  }

  .lead-word::first-letter {
    text-transform: uppercase;
  }

  /* HOW LATE, IN THE SENTENCE AND UNDER A TILE: red once the day has passed (the title row's `[data-needs]` already
     colours it there), amber while it is close. At 500, so the colour is never a hairline. It never breaks inside
     itself, so "Overdue by 38 days" is never "Overdue by" over "38 days". */
  .said-late {
    font-weight: 500;
    white-space: nowrap;
  }

  .said-late[data-tone='bad'] {
    color: var(--danger-text);
  }

  .said-late[data-tone='warn'] {
    color: var(--warn);
  }

  /* ── the strip of properties ───────────────────────────────────────── */

  .props {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .props > li {
    display: flex;
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  /* A PERSON'S FACE LEADS THE STRIP, at its own size and never stretched by the row. */
  .lead-face {
    margin-inline-end: var(--sp-1);
  }

  /* A PROPERTY IS A PILL: the wash on the ground, its label in the meta ink and its value in ink, at the
     meta size. It never grows past the strip: a long value wraps inside it rather than pushing the page sideways. */
  .prop {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-inline-size: 0;
    max-inline-size: 100%;
    min-block-size: var(--ctl-h-sm);
    padding: 2px var(--sp-3);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    line-height: 18px;
    text-align: start;
    transition: background var(--d-state) var(--ease-out);
  }

  button.prop {
    cursor: pointer;
  }

  button.prop[aria-expanded='true'] {
    background: var(--selected);
  }

  @media (hover: hover) and (pointer: fine) {
    button.prop:hover {
      background: var(--hold-wash);
    }
  }

  .prop-label {
    flex: none;
    color: var(--dim);
  }

  .prop-value {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-inline-size: 0;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  /* A DEADLINE THAT HAS PASSED: the day in red, the words carrying the colour. */
  .prop[data-late] .prop-value {
    color: var(--danger-text);
  }

  /* The value inside a pill takes the pill's size, whatever it is drawn by. */
  .prop-value :global(.chip) {
    font-size: inherit;
  }

  /* THE BOX A PROPERTY OPENS, under the strip, with the property's label over it as a field's label sits. */
  .prop-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-inline-size: 640px;
  }

  .prop-editor-label {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* ── the tiles ─────────────────────────────────────────────────────── */

  /* A GRID OF EQUAL COLUMNS, 12 apart, each at least 300 wide: one tile takes a column and not the page, so a figure
     never stretches across a window. `min` keeps one column inside a narrow phone. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: var(--inset);
    align-items: start;
  }

  /* The row's amount, above its charts. A container, so the figure can answer the room it has. */
  .lead {
    display: grid;
    gap: var(--sp-2);
    container-type: inline-size;
  }

  /* THE HERO IS `--t-figure`, and it never wraps: a figure broken between its symbol and its digits is two
     figures. */
  .lead-figure {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-figure);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    white-space: nowrap;
  }

  /* A FIGURE THAT DOES NOT FIT SHRINKS ONE STEP BEFORE ANYTHING ELSE, which on the
     narrowest phone is what keeps a long foreign amount from pushing the page sideways. */
  @container (inline-size < 20rem) {
    .lead-figure.num {
      font-size: var(--t-xl);
    }
  }

  /* The code in front of the figure at half its size, the way every headline figure sets it: `em`
     rather than a fixed step, so it stays half of `.lead-figure` at whichever step it is drawn. */
  .lead-figure :global(.code) {
    font-size: 0.5em;
    font-weight: 600;
  }

  /* AN AMOUNT WITH NOTHING TO CHART, on the ground, its pencil beside it. */
  .figure-ground {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* A tile's figure and the chart at its top right (a sparkline sits there, 120 × 32). */
  .stat {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-4);
  }

  .stat-line {
    flex: 0 1 120px;
    min-inline-size: 0;
  }

  .tile-figure {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-figure);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    white-space: nowrap;
  }

  .tile-figure-note {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    letter-spacing: 0;
  }

  .more-sign {
    color: var(--dim);
  }

  /* THE ONE WRITTEN LINE UNDER A CHART, saying what it means. */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  /* ── the two columns ───────────────────────────────────────────────── */

  /* The body, the facts and what points here keep a reading width; the history and the comments sit beside them, where a
     row's timeline sits in every tracker, and move under them below 1000px. */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    gap: var(--sp-6) var(--sp-7);
    align-items: start;
  }

  .main,
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  @media (width < 1000px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* ── facts ─────────────────────────────────────────────────────────── */

  /* UNBOXED, like every list since `rows.css`: the facts sit on the ground with a hairline between each, and a label
     starts where the heading above it starts. */
  .field-list {
    margin: 0;
  }

  /* A FACT AND NOT A FIELD. The class was field, which controls.css gives to a text-input wrapper, so
     every row of this list wore an input box: a surface, a border and a radius, eight boxes that read
     as a form to fill in. The name is the fix; nothing here fights the input style.

     TWO SHAPES, AND THE PHONE'S IS WRITTEN FIRST. Below 640px the label sits above its
     value, because a 16ch label column left a value 170px to wrap in at 390 and broke paths and
     dates mid-word. The pencil's 44px column trails at every width, so no pencil moves with its value. */
  .fact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--tap);
    grid-template-areas:
      'label pencil'
      'value pencil';
    gap: var(--sp-1) var(--sp-2);
    align-items: baseline;
    min-block-size: var(--row-h);
    padding: var(--sp-2) 0;
    border-block-end: 1px solid var(--line);
  }

  .fact:last-child {
    border-block-end: 0;
  }

  /* Sentence case, at the meta size, in the quiet ink. A field label is a WORD YOU READ ("Direction", "Amount",
     "Due"), not a category stamp. */
  .field-label {
    grid-area: label;
    margin: 0;
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
  .field-value[data-type='day'],
  .field-value[data-type='int'],
  .field-value[data-type='decimal'] {
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

  /* THE ID AND THE ONE THING YOU DO WITH IT, ON ONE LINE. A bare button beside a value rather than
     under it, so Details stays a list of facts with one control attached to the fact it acts on. */
  .id-line {
    align-items: center;
  }

  .number {
    font-variant-numeric: tabular-nums;
  }

  .copy-id {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h-sm);
    padding: 0 var(--sp-3);
    background: var(--hover-wash);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A WASH ONLY UNDER A MOUSE: on a phone a tapped control would keep it after the finger lifted. */
  @media (hover: hover) and (pointer: fine) {
    .copy-id:hover {
      background: var(--hold-wash);
      color: var(--ink);
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
    border-radius: var(--r-pill);
    color: var(--dim);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .edit-field:hover {
      background: var(--hover-wash);
      color: var(--ink2);
    }
  }

  /* THE FIELDS THE ROW HAS NOT ANSWERED, as pills that wrap whole, with no separator to trail the
     last one onto a line of its own. */
  .unset {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: var(--sp-3) 0 0;
    list-style: none;
  }

  /* A DASHED PILL: a property with nothing in it yet, and on a row you can write to, the way to it. */
  .unset-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    box-sizing: border-box;
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
    transition: background var(--d-state) var(--ease-out);
  }

  /* A FINGER NEEDS ROOM BETWEEN TWO PILLS as well as the 44px `.tap` gives each. */
  @media (pointer: coarse) {
    .unset,
    .props {
      gap: var(--sp-3);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    button.unset-chip:hover {
      background: var(--hover-wash);
      color: var(--ink);
    }
  }

  /* ── the editor ────────────────────────────────────────────────────── */

  /* The box and its two buttons: in a line where there is room, wrapped where there is not. */
  .editor {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
  }

  .editor > .field {
    flex: 1 1 14rem;
    min-inline-size: 0;
  }

  /* A MENU IN THE FIELD'S SHAPE: the `--s1` fill and the 12 corner, the select filling it and its chevron at the end,
     which lets a press through to the menu under it. */
  .edit-caret {
    display: inline-flex;
    flex: none;
    color: var(--dim);
    pointer-events: none;
  }

  .edit-input {
    font: inherit;
    /* 16px IN EVERY BOX AT EVERY WIDTH, because a phone zooms the page when a smaller one takes focus. */
    font-size: var(--t-md);
    cursor: pointer;
  }

  .edit-area {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: max(var(--ctl-h), var(--tap));
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    line-height: 1.6;
    resize: vertical;
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
    gap: 6px;
  }

  /* WHAT THE RECORD SAID, under the box it was typed in, with the words still in it. */
  .edit-why {
    margin: var(--sp-1) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* ── the ground's lines ────────────────────────────────────────────── */

  /* AN ARCHIVED ROW SAYS SO, in a quiet wash line with the archive glyph, and nothing about it is red. */
  .archived-note {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--hover-wash);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* ── the body ──────────────────────────────────────────────────────── */

  /* Prose gets a reading measure; a table, a grid and a ledger get the room. Width is a property of
     the block KIND, not of the page: the third time that family of bug was paid for (13 §4.1).

     AND A NOTE'S OWN HEADINGS SIT UNDER THE PAGE'S, never over them: a note's first heading was set above
     the group's own, so the row's prose outranked the row. */
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

  .document-slot :global(.document > h1:first-child) {
    margin-block-start: 0;
  }

  /* ── what points here ──────────────────────────────────────────────── */

  /* The FIELD's label, quieter than the list's name: "Obligations through party" reads as one heading
     with the relation in it, where two words of equal weight read as two headings. */
  .incoming-label {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .incoming-more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .incoming-more:hover {
      color: var(--ink);
    }
  }

  /* ── the handoff ───────────────────────────────────────────────────── */

  /* THE HANDOFF IS A GROUP OF READING, not a form and not a tile (it holds no figure): its head is the run's face, what
     it is doing and whether it is working, over a hairline like every group's; then the facts beside their names, and
     the lists as lists. */
  .handoff {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    max-inline-size: var(--measure);
  }

  .handoff-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding-block-end: var(--sp-3);
    border-block-end: 1px solid var(--line);
  }

  .handoff-doing {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
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
    color: var(--dim);
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

  /* ── the side: comments, the note and the history ─────────────────── */

  /* COMMENTS ARE A GROUP OF THIS COLUMN, LIKE THE HISTORY. `Thread` titles itself as a caption, small
     and in the second ink, which is right under a Decide card and read here as a fourth weight of heading; beside the
     history it takes a group's heading, over the group's hairline. */
  .side :global(.thread-title) {
    padding-block-end: var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  /* A NOTE ON THE ROW: one 44 field on the `--s1` fill, and its button inside it once there is something to add. */
  .note-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-block-end: var(--sp-3);
  }

  .note-label {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .note-line {
    min-block-size: var(--tap);
    padding-inline-end: var(--sp-1);
  }

  .note-input {
    /* 16px IN EVERY BOX AT EVERY WIDTH, because a phone zooms the page when a smaller one takes focus. */
    font-size: var(--t-md);
  }

  /* WHY THERE IS NO NOTE BOX: one sentence in the box's place, so nothing below it moves further than the box's
     own height. */
  .reach {
    margin: 0 0 var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* A DAY'S HEADING IN THE HISTORY: the meta size in the quiet ink, as the palette heads its groups. */
  .day-head {
    margin: var(--sp-3) 0 var(--sp-1);
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .history {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* WHO, AS A FACE AND A NAME, and what they did, on a 44 row: the shape of Home's feed, so a row's history reads as
     people passing through rather than as a log. A long note wraps to a second line rather than being cut. */
  .history li {
    display: grid;
    /* 24px, THE WIDTH OF AN AGENT'S RUN FACE AT ITS LINE SIZE, so a run's ring is not clipped by the column. */
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
    padding-block: var(--sp-1);
  }

  .history li + li {
    border-block-start: 1px solid var(--line);
  }

  .history-line {
    min-inline-size: 0;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  .history-by {
    color: var(--ink);
    font-weight: 500;
  }

  /* THE TIME IN THE FEED'S MONO, in the quiet ink, at the row's trailing edge. */
  .history-when {
    align-self: start;
    padding-block-start: 2px;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ── the toolbar's "…" ─────────────────────────────────────────────── */

  /* A 36px GLASS CIRCLE, and plain inside the compact bar, which is glass already: glass never holds glass.
     The glass is on this span and not on the menu's button, so the menu's panel is never placed against a filter. */
  .head-more {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: var(--glass);
    border-radius: var(--r-pill);
    box-shadow: var(--glass-edge);
    backdrop-filter: var(--glass-blur);
    color: var(--ink);
    transition: background var(--d-state) var(--ease-out);
  }

  :global(.head[data-under]) .head-more {
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }

  /* Pointed at, through the menu's own button, which this page does not draw: so the selector is the whole of it. */
  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger:hover > .head-more) {
      background: var(--glass-strong);
    }

    :global(.head[data-under] .menu-trigger:hover > .head-more) {
      background: var(--hover-wash);
    }
  }

  .head-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* A declared value in sentence case, in the stylesheet, so the text stays the record's own word. */
  .enum-word {
    display: inline-block;
  }

  .enum-word::first-letter {
    text-transform: uppercase;
  }

  /* ── the phone ─────────────────────────────────────────────────────── */

  @media (width < 900px) {
    .page {
      gap: var(--sp-4);
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }

    /* Tiles go full width. */
    .tiles {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* FORCED COLOURS DROP THE FILLS, so a pill keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .prop,
    .copy-id,
    .head-more {
      border: 1px solid CanvasText;
    }
  }
</style>
