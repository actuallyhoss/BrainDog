<!--
  One row: a task, a project, a person, a money line.

  THE PAGE IS A DOCUMENT, and it reads top to bottom, left to right:
    - the head: the list's name as the way back, the row's title at 28, the one sentence saying where the row stands,
      when it is due and how old it is with only the late phrase in red, and the verbs on the right of the title;
    - the fields tile: the row's amount first and large, then every field it has answered as a two-column definition
      list, the label at 13 in the quiet ink and the value at 15. A field it has not answered is not drawn at all: it
      waits behind "Add a field" at the foot of the tile, which opens its box in the list;
    - tiles only where there is a figure and its chart: what came in for a project and the open work on it
      (`figures.ts`), then a person's places, the row's prose, and what points here, each a tile with a list inside;
    - on the right, one timeline tile: a single composer, then what happened and what was said, newest first
      (`Timeline.svelte`).

  A LABEL IS VISIBLE, always. A placeholder is not a label: it disappears exactly when a user needs it, and it fails
  contrast in most themes (06 §8). A set field is a fact with its label; an unset one is a name in the "Add a field"
  menu, never a dashed chip on the page.

  THE ROW'S NUMBER IS NOT PRINTED. It is per-list, which is why renaming a list's id is refused and its display name
  is free; a person reading the page reads the title, the figure and where the row stands. "Copy link" in the head's
  menu and `y` / `⇧Y` are how it leaves the page.

  TWO SHAPES. Below 640px a fact is its label above its value; from 640px the label sits in a column of its own. At
  every width the pencil that opens a field sits in one trailing column, so every pencil on the page shares an edge.
-->
<script lang="ts">
  /* A FACT IS DRAWN ON THE BAR PRIMITIVE'S `.prop` ROW (`kinds/proportional.css`): its label, its value and their type. */
  import '@braindog/skin/kinds/proportional.css';
  import { apiBase, at, at as inApp } from '$lib/at.ts';
  import { tick, untrack } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import { listLine } from '$lib/record/tags.ts';
  import { amountOf, currencyOf, moneyInText, symbolText } from '$lib/record/money.ts';
  import { money, TONES } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { keepPrivate } from '$lib/record/privacy-write.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { currencyFor, dirOf, display, homeCurrency, iconFor, identityOf, labelOf, readableFields, spokenRow, toneOf } from '$lib/record/api.ts';
  import { REGISTERS, TITLES } from '$lib/record/held.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import { rowIn, rowOut } from '$lib/ui/motion.ts';
  import Face from '$lib/ui/Face.svelte';
  import AgentFace from '$lib/ui/AgentFace.svelte';
  import { faceWords, liveOf, slotOf } from '$lib/ui/face.ts';
  import { isQuiet } from '@braindog/kernel/constants';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Money from '$lib/ui/Money.svelte';
  import SplitTile from '$lib/money/SplitTile.svelte';
  import { splitAtOf, splitWords } from '$lib/record/split.ts';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import ListEditor from '$lib/ui/ListEditor.svelte';
  import { Sparkline, Stacked } from '$lib/viz/index.ts';
  import { fieldWords } from '$lib/record/field-words.ts';
  import AddValue from './AddValue.svelte';
  import ProjectBlocks from '$lib/page/ProjectBlocks.svelte';
  import { blockOf, blocksOf, isProject, shapeOf, type Figure } from '$lib/record/project.ts';
  import { workingNow } from '$lib/home/waits.svelte.ts';
  import { putBackOf, valueWords } from '$lib/record/field-write.ts';
  import { draftOf, editable, isFile, isJson, isQuantity, patchOf, unitOf, unitsOf, wrongValue } from '$lib/record/field-draft.ts';
  import FileField from '$lib/ui/FileField.svelte';
  import DayBox from '$lib/ui/DayBox.svelte';
  import QuantityBox from '$lib/ui/QuantityBox.svelte';
  import JsonBox from '$lib/ui/JsonBox.svelte';
  import RefPick from '$lib/ui/RefPick.svelte';
  import { ownsRecord, type Me } from '../../../settings/levels.ts';
  import { namedLines, readHistory, readNames, type Say, type SettledWords, type Told } from '$lib/record/history-live.ts';
  import { rowReader, type Docs, type Got, type RowReader } from '$lib/record/row-live.ts';
  import { resolverOf, shownOf } from '$lib/record/row-values.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import { chartOf, rowHref } from '$lib/record/row-href.ts';
  import { dayHref } from '$lib/record/day-href.ts';
  import Hole from '$lib/page/Hole.svelte';
  import { linkReader, type Linked, type LinkReader } from '$lib/record/links-live.ts';
  import { keepLocal, localTicket, nearLocal } from '$lib/data/local-tab.ts';
  import { painted } from '$lib/data/timing.ts';
  import type { Near } from '$lib/data/local.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { live as poll } from '$lib/data/live.svelte.ts';
  import { keptRowOf, rowFrom, rowLists, type KeptRow } from './kept-row.ts';
  import type { Entry, FieldDecl, Fields } from '$lib/record/schema.ts';
  import { closed, drew, opened } from '../../../../lib/ui/screen.svelte.ts';
  import { choicesOf, finishOf, stateSaid } from './lead.ts';
  import { addedSaid, daySaid, dueSaid, importKeysOnly, keyHeld, keySentence, localDay, rowWords, sentenceOf } from './said.ts';
  import { KEYS_REGISTER } from '$lib/record/keychain.ts';
  import { linkedCells, linkedState, pointingOrder } from './linked.ts';
  import {
    aboutOf,
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
  import { listName, personWords, rowNameSaid } from '$lib/record/names.ts';
  import { movable, scopeFieldOf } from '$lib/record/scope-move.ts';
  import ScopeMove from './ScopeMove.svelte';
  import Timeline from './Timeline.svelte';
  import NoteText from './NoteText.svelte';
  import KpiLead from './KpiLead.svelte';
  import { isMemo } from './note-text.ts';
  import { readingOf, readingSaid } from '$lib/record/reading.ts';
  import VisualStrip from '$lib/visual/VisualStrip.svelte';
  import TaskEffects from '$lib/record/TaskEffects.svelte';
  import { timelineWords } from './timeline.ts';
  import HandSheet from '$lib/ui/HandSheet.svelte';
  import SendButton from '$lib/send/SendButton.svelte';
  import SendStrip from '$lib/send/SendStrip.svelte';
  import MergeSheet from '$lib/ui/MergeSheet.svelte';
  import ShareLazy from '$lib/sharing/ShareLazy.svelte';
  import { canShare } from '$lib/sharing/may-share.ts';
  import { seeingAs } from '$lib/sharing/see-as.svelte.ts';
  import UsedBy from '$lib/page/panels/UsedBy.svelte';
  import { may } from '$lib/record/may.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { reachWords } from '../reach.ts';
  import { OWN_TYPES } from '$lib/ui/own.ts';
  import { knownOf, lastDayOf, meetsOf, orgNameSaid, orgRoleOf, orgSaid, roleFieldOf, seenOf, seenWords, timesSaid, whoParts, type Known, type Named } from '../folk.ts';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));
  /* THE IDS ARE THIS PAGE'S OWN, so the box a pencil opens is found by its id to take the caret. */
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
  /* DRAWN FROM THE LOCAL COPY, the page only reads: every control that writes waits for the record's own answer. */
  let fromCopy = $state(false);
  $effect(() => {
    if (!fromCopy) return;
    return untrack(() => holdCopyMark());
  });
  const live = $derived(got?.from === 'live' && !fromCopy);
  /**
   * WHAT THE CALLER'S LEVEL ON THIS ROW'S LIST REACHES, asked of `may()` and never worked out here.
   *
   * A CONTROL THE RECORD WOULD REFUSE IS NOT DRAWN: Edit, Archive, a field's pencil and the scope move are an `update`,
   * which asks `write` of the list. A comment asks only that the row can be read, which is what drew this page, so the
   * timeline's composer is not gated. `proposes` is the new-field box's rung, which files
   * a proposal for anyone but the owner, and a `propose` names no list.
   */
  const changes = $derived(live && may(page.data as unknown as Shell, 'write', id));
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
  /* THE LIST THE OPEN WORK IS COUNTED IN, so its tile is not drawn over that list's own tile saying the same. */
  let workList = $state<string | null>(null);
  let figures: FigureReader | null = null;
  /* A PROJECT'S THREE MONEY FIGURES, said by name of the project (`project.ts`); each is nothing until the record answers. */
  let pjMoney = $state<{ in: Figure | null; out: Figure | null; owed: Figure | null }>({ in: null, out: null, owed: null });

  /* THE ROW AND ITS HISTORY, IN ONE BRACKET, so `data-screen` never appears between the two reads. An
     answer for a row somebody has already left is dropped. `clock` is the reader's, taken again as
     each row is read. It started at the sample's frozen `NOW` for the row `pending` stamped with that
     instant; nothing is drawn before a read now. It is the RECORD'S clock (`recordNow`), as the list's is, so a row's days late are
     the list's Due cell's. */
  let told = $state<Told | null>(null);
  let clock = $state(recordNow());
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
    workList = null;
    pjMoney = { in: null, out: null, owed: null };
    archived = false;
    fromCopy = false;
    stopEdit();
    const at = opened();
    reader ??= rowReader(apiBase());
    links ??= linkReader(apiBase(), undefined, recordNow);
    /* THE LOCAL COPY'S PAGE AT ONCE, the three reads together, while the record is asked as ever (`kept-row.ts`). */
    const mark = localTicket();
    /* One later than the wait is drawn when it lands, while the record has not answered: `got` is its answer once it has. */
    const draw = (near: Near<KeptRow> | null) => {
      if (near === null || askedFor !== key || got !== null) return;
      const drawn = rowFrom(near.value);
      got = drawn.got;
      told = drawn.told;
      linked = drawn.linked;
      fromCopy = true;
      painted('row', 'copy');
    };
    void nearLocal<KeptRow>(ROW_COPY, key, apiBase(), draw).then(draw);
    /* THREE READS IN ONE BRACKET, for the reason the two were: `data-screen` must not appear between
       them, and what points at a row is part of the row's screen rather than a thing that arrives
       after it. */
    const [r, h, l] = await Promise.all([
      reader.read(register, n),
      sayOf().then((say) => readHistory(apiBase(), register, n, undefined, say)),
      links.read(register, n),
    ]);
    const current = askedFor === key;
    /* OFFLINE OVER THE COPY, THE COPY STAYS, read-only, until the record answers again. */
    const unreached = fromCopy && (r.from === 'refused' || h.from === 'refused') && ((page.data as unknown as Shell).offline === true || poll.state === 'offline');
    closed(!current || unreached || (r.from !== 'refused' && h.from !== 'refused'), at);
    if (!current || unreached) return;
    clock = recordNow();
    /* A NUMBER MERGED INTO ANOTHER ROW IS NEVER THE ADDRESS: the answer is the kept row, and the page moves to its number,
       in place of this entry in the history, so Back does not land on the folded one again. */
    if (r.from === 'live' && r.folded !== undefined && r.entry && r.entry.seq !== n) {
      /* `inApp` IS `at` HERE, since the read's own bracket is called `at` inside this function. */
      void goto(inApp(`/r/${register}/${r.entry.seq}`), { replaceState: true });
      return;
    }
    got = r;
    told = h;
    linked = l;
    fromCopy = false;
    if (r.from === 'live') painted('row', 'network');
    const kept = keptRowOf(r, h, l);
    /* `always`: the history is the log itself, so this copy is only ever drawn while the page asks again. */
    if (kept) keepLocal(ROW_COPY, key, rowLists(register, REGISTERS[register], kept.linked), kept, mark, {}, { always: true });
    if (r.from === 'live' && r.entry) void readFigures(register, n, r.entry, l.from === 'live' ? l.groups : []);
  }

  /** The name a row's page is kept under in the local copy, by `register#n`. */
  const ROW_COPY = 'RowPage';

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
    if (isProject(REGISTERS[register]) && name !== '') {
      const f = figures;
      void Promise.all([f.scalar('project-in-month', name), f.scalar('project-out-month', name), f.scalar('project-owed', name)]).then(([i, o, w]) => {
        if (askedFor === key) pjMoney = { in: i, out: o, owed: w };
      });
    }
    const [m, w] = await Promise.all([
      earns ? figures.moneyIn(name) : Promise.resolve(null),
      work && via ? figures.openWork(work, via, `${register}#${n}`, localDay(recordNow())) : Promise.resolve(null),
    ]);
    if (askedFor !== key) return;
    moneyIn = m;
    openWork = w;
    workList = w && work ? work : null;
    moneyAll = m && about ? `/r/${about.list}?f=${about.field}:is:${n}` : null;
    workAll = w && work && via ? `/r/${work}?f=${via.field}:is:${n}` : null;
  }

  $effect(() => {
    const register = id;
    const n = seq;
    if (Number.isInteger(n) && n >= 1) untrack(() => void readRow(register, n));
  });

  let writer: RowWriter | null = null;

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
   * ONE BOX, WHEREVER THE FIELD IS DRAWN: under the amount for the figure, in its line of the fields tile for the rest,
   * and in its own tile for prose. The box is the `fieldEditor` snippet in every one of them.
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
    /* THE BOX TAKES THE CARET once it is drawn, after a menu that opened it has handed focus back to its trigger. */
    void tick().then(() => document.getElementById(`${uid}-edit`)?.querySelector<HTMLElement>('input, select, textarea')?.focus());
  }

  function stopEdit() {
    editing = null;
    draft = '';
    problem = null;
  }

  /**
   * THE BOX CLOSES AND THE KEYBOARD GOES BACK TO THE PENCIL THAT OPENED IT (motion F5.2): after Save, Cancel or Esc the
   * next Tab carries on from the field, not from the top of the page. On a phone, where no pencil is drawn, the value
   * that was tapped takes it (`data-edit` is on both).
   */
  function endEdit() {
    const was = editing;
    stopEdit();
    if (was === null) return;
    void tick().then(() => {
      const at = [...document.querySelectorAll<HTMLElement>(`[data-edit="${CSS.escape(was)}"]`)].find((el) => el.offsetParent !== null);
      at?.focus();
    });
  }

  /**
   * The header's own control, "Edit": the row's title is the field somebody means by "edit the row". The title is not
   * listed as a fact while it holds a value, so opening it lists it, with its box, until the edit ends (`listed`).
   */
  function editTitle() {
    if (!live) return;
    const fields = readableFields(id);
    const f = fields.find((x) => x.id === decl?.title && editable(x, id)) ?? fields.find((x) => editable(x, id));
    if (f) startEdit(f);
  }

  /* ESC CLOSES THE BOX it was pressed in, unsaved (motion F5.4), and goes no further: a sheet or panel round the page
     closes on the next one. */
  const escCloses = (form: HTMLFormElement) => {
    const press = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      endEdit();
    };
    form.addEventListener('keydown', press);
    return () => form.removeEventListener('keydown', press);
  };

  const changed = (f: FieldDecl): boolean => (f.type === 'bool' ? ticked !== wasTicked : draft.trim() !== was.trim());

  /** The history again, so the change somebody just made is in the list beside the row. */
  async function refreshHistory(register: string, n: number) {
    const key = `${register}#${n}`;
    const at = opened();
    const h = await readHistory(apiBase(), register, n, undefined, await sayOf());
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
      endEdit();
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
      endEdit();
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
   * A LINE'S SPLIT, WRITTEN IN ONE GO: its parts, or `null` to take them off. The record refuses parts that do not add up
   * to the line, and that sentence is handed back for the tile to show under them.
   */
  async function saveSplit(parts: Record<string, unknown>[] | null): Promise<string | null> {
    if (!row || !live || !splitAt) return null;
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    writer ??= rowWriter(apiBase());
    const out = await writer.update(register, n, { [splitAt.field]: parts } as Fields, row.version);
    if (askedFor !== key) return null;
    if (out.ok) {
      got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      toasts.push(parts === null ? splitWords.removed : splitWords.saved);
      void refreshHistory(register, n);
      return null;
    }
    if (out.why === 'conflict' && out.entry) got = { from: 'live', entry: out.entry, names: names ?? new Map() };
    return out.fix;
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

  /**
   * THE HEAD'S PRIMARY: the row moved to its list's finished state in one press (`finishOf`), through the write every
   * other change on this page makes, with the same way back on its toast. Held to the version on screen, so a row
   * somebody else moved meanwhile is a conflict that is said and never a quiet overwrite.
   */
  async function finishRow(to: { value: string; done: string }) {
    if (!row || saving || !live || !decl?.state) return;
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    const before = { ...row.fields };
    const heldDecl = decl;
    const patch: Fields = { [decl.state]: to.value };
    const label = labelOf(decl.fields.find((f) => f.id === decl.state)!);
    saving = true;
    writer ??= rowWriter(apiBase());
    const out = await writer.update(register, n, patch, row.version);
    saving = false;
    if (askedFor !== key) return;
    if (!out.ok) {
      if (out.why === 'conflict' && out.entry) got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    got = { from: 'live', entry: out.entry, names: names ?? new Map() };
    if (editing === decl.state) stopEdit();
    const version = out.entry.version;
    toasts.push(to.done, {
      undo: () => void putBack(register, n, label, putBackOf(before, patch, heldDecl), version),
    });
    void refreshHistory(register, n);
    void keepFocusInHead();
  }

  /**
   * THE BUTTON PRESSED IS GONE ONCE THE ROW IS FINISHED (audit 31 Oct i, AI1), and focus fell to the page, so the next Tab
   * began again at "Skip to content". It stays in the head: on the head's next control, or on the page's name.
   */
  async function keepFocusInHead() {
    await tick();
    const was = document.activeElement as HTMLElement | null;
    if (was && was !== document.body && was.isConnected && !(was as HTMLButtonElement).disabled) return;
    const head = document.querySelector<HTMLElement>('.row-head');
    const seen = (el: HTMLElement) => el.getClientRects().length > 0;
    const next = [...(head?.querySelectorAll<HTMLElement>('.head-actions button:not([disabled]), .head-actions a[href]') ?? [])].find(seen) ?? head?.querySelector<HTMLElement>('h1');
    next?.focus();
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

  /* WHO CAN SEE THIS ROW. The record marks a row its maker kept private (`private`) and the row the reader made (`mine`) when
     it reads the row; a write's answer carries neither, so what a press settled is remembered here by the row it was for. */
  let privacy = $state<{ key: string; mine: boolean; on: boolean | null }>({ key: '', mine: false, on: null });
  const rowKey = $derived(`${id}#${seq}`);
  /* WRITTEN ONLY WHEN IT CHANGES, AND READ UNTRACKED (the scope of 24 October): the effect read `privacy` and wrote a
     new object into it every time, so on a row the reader made it ran itself until Svelte stopped it
     (`effect_update_depth_exceeded` on /r/datapoints/522, at every width). */
  $effect(() => {
    if (!row?.mine) return;
    const key = rowKey;
    untrack(() => {
      if (privacy.key === key && privacy.mine) return;
      privacy = { key, mine: true, on: privacy.key === key ? privacy.on : null };
    });
  });
  const mine = $derived(row?.mine === true || (privacy.key === rowKey && privacy.mine));
  const isPrivate = $derived(privacy.key === rowKey && privacy.on !== null ? privacy.on : row?.private === true);

  async function setPrivate(to: boolean) {
    if (!row || saving || !live) return;
    const key = rowKey;
    saving = true;
    const out = await keepPrivate(apiBase(), key, to);
    saving = false;
    if (key !== rowKey) return;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    privacy = { key, mine: true, on: to };
    void refreshHistory(id, seq);
  }

  /* WHAT HAPPENED TO THE ROW, newest first, which the timeline merges with what was said about it. Worded again with
     the names the row's read handed the page, so a list of links says the rows it gained, never their ids. */
  const history = $derived(told && told.from !== 'refused' ? namedLines(id, told.lines, names) : []);

  /* WHO, BY NAME: the reader is You, and the record's members are asked for once, only when somebody else is in the
     history or has commented, so a row only you have touched costs no read. */
  const me = $derived(String(page.data.me?.person ?? ''));
  /* WHETHER A FIELD ADDED HERE LANDS AT ONCE OR WAITS ON DECIDE: the settings screen's one predicate for owning. */
  const owner = $derived(page.data.me ? ownsRecord(page.data.me as Me) : false);
  const proposes = $derived(owner || may(page.data as unknown as Shell, 'append'));
  /* THE LIST'S FIELDS SHEET, opened from the foot of "Add a field". */
  let fieldsOpen = $state(false);
  /* "MERGE WITH ANOTHER PERSON", in the menu of a row of the list that keeps people: the other one is picked in a sheet and
     the record puts the question to Decide. Only where the caller may change the row, as Archive is. */
  let mergeOpen = $state(false);
  /* SHARING THIS ROW, an owner's or an Admin's, and never while the record is seen as somebody. */
  let sharingOpen = $state(false);
  /* "HAND TO", from the head's "…": a teammate or an agent, on a list that says who holds its rows. */
  let handOpen = $state(false);
  const sharable = $derived(seeingAs() === null && canShare((page.data as { me?: Parameters<typeof canShare>[0] }).me));
  const mergeable = $derived(changes && !archived && decl?.meets !== undefined);
  let people = $state<ReadonlyMap<string, string>>(new Map());
  let namesAsked = false;
  function askNames() {
    if (!live || namesAsked) return;
    namesAsked = true;
    void readNames(apiBase()).then((m) => {
      people = m;
      /* A LINE THAT SAYS WHO SETTLED A SUGGESTION WAS WORDED BEFORE THE NAMES CAME, so it is read once more with them. */
      if (history.some((e) => e.settled !== undefined) && Number.isInteger(seq) && seq >= 1) void refreshHistory(id, seq);
    });
  }

  /**
   * WHO READS, THE NAMES, AND THE CARD'S OWN WORDS, for a line an answered suggestion of Slash's made: "Slash suggested ·
   * Mara accepted" (`settledSaid`), the sentence Activity says. The words are the answered card's and the Slash page's,
   * fetched when a row's history is first read and never held by the entry.
   */
  let settledWords: SettledWords | null = null;
  async function sayOf(): Promise<Say> {
    if (settledWords === null) {
      const [{ cardWords }, { byLine }] = await Promise.all([import('$lib/decide/card.ts'), import('../../../slash/lines.ts')]);
      settledWords = { slash: cardWords.slash, accepted: cardWords.accepted, declined: cardWords.declined, chose: cardWords.chose, undid: cardWords.undid, drafted: byLine };
    }
    return { me: me || null, names: people, words: settledWords };
  }
  $effect(() => {
    if (history.some((e) => /^p_/u.test(e.by) && e.by !== me)) untrack(askNames);
  });

  const stateValue = $derived(decl?.state ? String(row?.fields[decl.state] ?? '') : '');
  const tone = $derived(decl?.done?.includes(stateValue) ? ('good' as const) : undefined);
  /* THE ROW IS IN ONE OF ITS LIST'S FINISHED STATES: "Paid", "Cleared", "Done". */
  const done = $derived(tone === 'good');
  /* WHAT FINISHES IT, where it is still open and the reader may change it: the head's one primary (`finishOf`). */
  /* NONE ON AN AGENT'S RUN, which ends itself or is stopped from its live row (`row-finish.ts`, audit 6g AG10). */
  const finish = $derived(changes && !archived && id !== 'session' ? finishOf(decl, stateValue) : null);
  const rareFinish = $derived(Boolean(finish && /supersed|retire/iu.test(finish.said)));
  /* WHERE ITS LIST DRAWS IT, on a list with a page of its own: that page, searched for the row's name. */
  const chartTo = $derived(row && decl ? chartOf(id, String(row.fields[decl.title] ?? '')) : null);

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
   * is a name behind "Add a field" rather than a row saying "Not set".
   */
  const unsetValue = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && listLine(v) === null);
  const figureField = $derived(shortFields.find((f) => f.type === 'money'));
  const dueField = $derived(shortFields.find((f) => (f as { deadline?: boolean }).deadline === true));
  /* A KEY NUMBER LEADS WITH ITS READING AND CHART (`KpiLead`, L25), so its target is a fact like the rest, not the figure. */
  const kpiPage = $derived(id === 'kpis');
  const figure = $derived(!kpiPage && figureField && row ? amountOf(row.fields[figureField.id]) : null);
  /**
   * PART PAID, UNDER THE FIGURE: "Paid £4,000 · £5,190 left" over a 6px track (money F9). The paid amount is the list's
   * second money field named for it ("Paid so far", which money's `settle` writes), in the figure's currency; a bill
   * with nothing paid yet, or all of it, draws no track, since its state already says so.
   */
  const paidPart = $derived.by(() => {
    if (!row || !figureField || figure === null || figure <= 0) return null;
    const field = shortFields.find((f) => f.type === 'money' && f.id !== figureField.id && /^paid/iu.test(f.id));
    const paid = field ? amountOf(row.fields[field.id]) : null;
    const currency = currencyOf(row.fields[figureField.id]) ?? '';
    if (!field || paid === null || paid <= 0 || paid >= figure) return null;
    if ((currencyOf(row.fields[field.id]) ?? currency) !== currency) return null;
    return { field: field.id, paid, left: figure - paid, share: Math.round((paid / figure) * 1000) / 10, currency };
  });
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
  /* A READING SAID WHOLE IN THE HEAD, "16.4% on 28 Sep", so its number, unit and moment are not facts as well. */
  const readings = $derived.by(() => (void got, readingOf(decl)));
  const readingLine = $derived(readings && row ? readingSaid(row.fields, readings, row.created, clock) : null);
  /* WHERE A LINE'S PARTS ARE, on a list that splits its lines across categories (`split.ts`). */
  const splitAt = $derived.by(() => (void got, splitAtOf(decl)));
  const leadIds = $derived(
    new Set(
      [
        ...(readingLine !== null && readings ? [readings.value, readings.unit, readings.at] : []),
        figure !== null ? figureField?.id : undefined,
        paidPart?.field,
        /* A LINE'S PARTS ARE ITS OWN TILE, where they are listed and changed (`SplitTile.svelte`), never a fact. */
        splitAt?.field,
        finishedOn ? decl?.finished : undefined,
        movable(scopeField) ? scopeField.id : undefined,
      ].filter(
        (x): x is string => Boolean(x),
      ),
    ),
  );
  /* THE TITLE IS THE HEAD, SO IT IS NOT A FACT AS WELL. It is listed only while it is empty, when "Add a field" is the
     way to it, or while the head's Edit has it open, when its row holds the box. */
  const titled = $derived(Boolean(decl && row && !unsetValue(row.fields[decl.title])));
  /* A LEDGER LINE IS HEADED BY WHO IT WAS PAID TO OR FROM (next-money, M38), as the Ledger draws it: its page said
     "Rent", the line's description, over "As the bank wrote it HARBOR PROPERTY MGMT". The description is still a field
     under it; a line nobody named keeps its description. */
  const lineHead = $derived.by(() => {
    if (id !== 'transactions' || !row) return null;
    const payee = row.fields.payee;
    return typeof payee === 'string' && payee.trim() !== '' ? rowNameSaid(id, payee) : null;
  });
  const listed = $derived(shortFields.filter((f) => !leadIds.has(f.id) && (f.id !== decl?.title || !titled || editing === f.id)));

  /* AN EMPTY FIELD IS NOT DRAWN. A person with four unset fields was a column of four "Not set" rows, then a row of
     dashed chips; now each is a name in the "Add a field" menu, and choosing one opens its box in the list, where it
     stays while it is open. What the record keeps about who somebody is, and nobody types, is never offered. */
  const unsetFields = $derived(row ? listed.filter((f) => unsetValue(row.fields[f.id]) && editing !== f.id && !recordKept.has(f.id)) : []);
  const shownFields = $derived(listed.filter((f) => !unsetFields.includes(f)));

  /**
   * THE FACTS, IN ONE LIST: where the row stands first, then every other field it has answered in the order its list
   * declares them. They were split in two, the status, days and links as pills in a strip under the title and the rest
   * under Details, so a reader looked in two places and in two shapes for one answer. A list of tags that holds only the
   * keys an import left is not one of them (`importKeysOnly`).
   */
  /* THE FACTS A LIST PUTS FIRST (1 Nov, L19): a field marked `lead: true`, in the list's order; where a list marks none,
     the few the web knows lead it (a key number: what it measures, which way is good, how often), then the rest. */
  const LEAD_OF: Readonly<Record<string, readonly string[]>> = { kpis: ['measures', 'good', 'every', 'thing', 'source'] };
  const leadOrder = $derived.by((): readonly string[] => {
    const marked = (decl?.fields ?? []).filter((f) => (f as { lead?: unknown }).lead === true).map((f) => f.id);
    return marked.length > 0 ? marked : (LEAD_OF[id] ?? []);
  });
  const leadRank = (field: string): number => {
    const i = leadOrder.indexOf(field);
    return i === -1 ? leadOrder.length : i;
  };
  const sameAsName = (v: unknown): boolean => {
    const name = decl && row ? row.fields[decl.title] : undefined;
    return typeof v === 'string' && typeof name === 'string' && v.trim() !== '' && v.trim().toLowerCase() === name.trim().toLowerCase();
  };
  const facts = $derived(
    shownFields
      /* "SOURCE · TYPED" SAYS NOTHING: a number somebody typed is how most readings arrive, so only another source is said. */
      .filter((f) => editing === f.id || !(f.id === 'source' && f.type === 'enum' && row?.fields[f.id] === 'typed'))
      .filter((f) => !evidence.has(f.id) && (editing === f.id || !importKeysOnly(row?.fields[f.id])))
      /* THE STATE ONCE (1 Nov, L24): where the sentence under the name says it ("Doing, due tomorrow"), its chip in the
         facts said it again. It is changed from the head's verb or the "⋯"'s Edit. */
      .filter((f) => editing === f.id || f.id !== decl?.state || !sentence.some((p) => p.kind === 'state'))
      /* A FACT THAT ONLY SAYS THE PAGE'S NAME AGAIN IS LEFT TO THE NAME (skills pass 2 Nov): "Monthly revenue" stood over
         "What it measures: Monthly revenue" and "Measure: Monthly revenue". Still changed from the "⋯"'s Edit. */
      .filter((f) => editing === f.id || f.id === decl?.title || !sameAsName(row?.fields[f.id]))
      .sort((a, b) => Number(b.id === decl?.state) - Number(a.id === decl?.state) || leadRank(a.id) - leadRank(b.id)),
  );

  /**
   * THE FIRST SIX FACTS, AND THE REST ONE PRESS AWAY (1 Nov, "row pages lead with the one thing that matters"): a key
   * number listed fourteen settings at one weight (Unit, Shape, Shown first, Order, Not kept yet, State...), so what it
   * measures and where it comes from read no louder than its sort order. The state and the fields the list puts first
   * lead; "More details" opens the rest in place. A row with eight or fewer shows them all, since a press that opens two
   * lines costs more than the lines. A field being changed is always shown.
   */
  const LEAD_FACTS = 6;
  let factsOpen = $state(false);
  const folds = $derived(facts.length > LEAD_FACTS + 2);
  const factsShown = $derived(!folds || factsOpen ? facts : facts.filter((f, i) => i < LEAD_FACTS || editing === f.id));
  const factsHidden = $derived(folds ? facts.length - LEAD_FACTS : 0);
  const foldIn = (node: Element, more: boolean) => (more ? rowIn(node) : { duration: 0 });
  const foldOut = (node: Element, more: boolean) => (more ? rowOut(node) : { duration: 0 });

  /**
   * A PERSON'S PAGE LEADS WITH WHO THEY ARE, AND AN ORGANISATION'S WITH WHAT IT IS, on a list that declares the role
   * (`people.ts`): the people `meet` writes (`meets:`) or the organisations (`org:`). Never by the list's name, so any
   * record's people read this way, whoever it belongs to.
   *
   * THE SENTENCE UNDER A PERSON'S NAME is who they are, "Contractor at Brightwell, on Kiln and Portage.", each name opening
   * its own page, then the last day they were in touch. An organisation's is its kind and how many people and projects
   * are with it. Then, on the ground, where the person was seen and what they are known by, which the lines `meet`
   * wrote said in an agent's words ("2026-08-27 · commit 8b1e4d0 in portage") and now say in a person's; then the facts,
   * then the timeline beside them. A field said in one of those places is not listed again as a fact.
   */
  const meets = $derived.by(() => (void got, meetsOf(decl)));
  const orgRole = $derived.by(() => (void got, meetsOf(decl) ? null : orgRoleOf(decl)));
  const fieldTo = (field: string | undefined): string | undefined => (field ? decl?.fields.find((f) => f.id === field)?.to : undefined);
  /** A ref as a name that opens its row, or nothing while the record has not named it: never its number. The address
   * stays record-relative and is rendered through `at()` where the line draws it. */
  const namedRef = (to: string | undefined, v: unknown): Named | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/u.test(v) ? Number(v) : NaN;
    if (!to || !Number.isInteger(n) || n < 1) return null;
    /* THE RECORD'S NAMES, else the ones this tab has learnt (`TITLES`), as `display` says the same ref: a row painted
       from the local copy said "Ada Vine" as words that opened nothing. Where the row has a page, it opens there. */
    const name = (names ? names.get(`${to}#${n}`) : TITLES.get(to)?.get(n))?.trim();
    return name ? { name, href: rowHref(`${to}#${n}`) ?? `/r/${to}/${n}` } : null;
  };
  /* WHETHER THE ROW IS THE PERSON WHOSE RECORD THIS IS, by the list's own `self` part. */
  const self = $derived(Boolean(meets?.self && row?.fields[meets.self] === true));
  /* A LIST OF PROJECTS, by what it declares: rows with a mark and a hue, or the list that says it scopes the rest. */
  const isProjects = (list: string): boolean => REGISTERS[list]?.identity !== undefined || (REGISTERS[list] as { scopes?: unknown } | undefined)?.scopes !== undefined;
  /** The projects a list-of-links field names, by name, each opening its page; one the record has not named is left out. */
  const projectsOf = (field: string | undefined): Named[] => {
    const v = field && row ? row.fields[field] : null;
    return Array.isArray(v) ? v.map((x) => namedRef(fieldTo(field), x)).filter((x): x is Named => x !== null) : [];
  };
  /**
   * THE LINE UNDER THE NAME. A person: "Contractor at Brightwell, on Kiln and Portage. Last in touch 2 Sep." An
   * organisation: "Client · 24 people, on Kiln and Portage." Each part only when the row has it.
   */
  const lastSaid = (day: string): string => {
    const at_ = meets?.met && row ? seenOf(row.fields[meets.met]).find((x) => x.last === day) : undefined;
    const when = seenWords.lastInTouch(daySaid(day, clock));
    return at_ ? `${when.replace(/\.$/u, '')}, ${seenWords.atPlace(at_.where)}.` : when;
  };
  const lead = $derived.by(() => {
    if (!row || (!meets && !orgRole)) return null;
    if (meets) {
      const role = roleFieldOf(decl);
      const projects = projectsOf(meets.projects);
      const day = lastDayOf(row.fields, meets);
      /* A ROLE OF "Other" SAYS NOTHING (29 October, "Other, on Lanternfish and Copperleaf"), as the list leaves it unsaid. */
      const roleSaid = role && row.fields[role] !== 'other' ? display(id, role, row.fields[role], clock, names) : null;
      const org = meets.org ? namedRef(fieldTo(meets.org), row.fields[meets.org]) : null;
      return {
        parts: whoParts({ role: roleSaid, org, projects }),
        named: projects.length > 0,
        /* WHEN, AND ABOUT WHAT (1 Nov, L21): "Last in touch 29 Oct, at Onboarding." where the newest place they were seen
           is that day's. Yourself, never: "Last in touch" over your own name said nothing, so your page says it is you. */
        last: self ? seenWords.isYou : day ? lastSaid(day) : null,
        /* THE FIELDS THE SENTENCE SAYS, so the facts do not say them a second time under it. */
        said: [roleSaid?.trim() || (role && row.fields[role] === 'other') ? role : null, org ? meets.org : null, day ? meets.in_touch : null].filter((x): x is string => Boolean(x)),
      };
    }
    const people = incoming.filter((g) => meetsOf(REGISTERS[g.register]) !== null).reduce((n, g) => n + g.total, 0);
    const projects = projectsOf(orgRole?.projects);
    const pointing = incoming.filter((g) => isProjects(g.register)).reduce((n, g) => n + g.total, 0);
    const kind = orgRole?.kind ? display(id, orgRole.kind, row.fields[orgRole.kind], clock, names) : null;
    const said = orgSaid({ kind, people, projects: projects.length > 0 ? 0 : pointing });
    return {
      parts: whoParts({ role: said, org: null, projects }),
      named: projects.length > 0,
      last: null,
      said: [kind?.trim() && orgRole?.kind ? orgRole.kind : null].filter((x): x is string => Boolean(x)),
    };
  });
  const seen = $derived(row && (meets?.met || orgRole?.met) ? seenOf(row.fields[(meets?.met ?? orgRole?.met)!]) : []);
  const knownParts = $derived(
    meets ? { email: meets.email, keys: meets.keys, handles: meets.handles, aliases: meets.aliases } : { keys: orgRole?.keys, domain: orgRole?.domain },
  );
  /* THE FIELDS WHAT THEY ARE KNOWN BY IS READ FROM, each changed by its own pencil. */
  const knownFields = $derived(
    meets || orgRole ? readable.filter((f) => Object.values(knownParts).includes(f.id) && row !== undefined && !unsetValue(row.fields[f.id])) : [],
  );
  /**
   * WHAT A PERSON OR AN ORGANISATION IS KNOWN BY, as facts in the same list as the rest: an address, a login, a website,
   * each by its kind ("GitHub", "Email") and not by the field that holds it. Grouped by that field, so the pencil on a
   * group's first line opens the one field its lines are read from. A line two fields both hold is said once, under the
   * first; a field all of whose lines are said already is changed from "Add a field" (`knownElsewhere`).
   */
  const knownGroups = $derived.by((): { field: FieldDecl; lines: Known[] }[] => {
    if (!row) return [];
    const said = new Set<string>();
    return knownFields.map((field) => {
      const part = Object.entries(knownParts).find(([, v]) => v === field.id)?.[0];
      const lines = (part ? knownOf(row.fields, { [part]: field.id }) : []).filter((k) => {
        const key = `${k.label}:${k.value.toLowerCase()}`;
        if (said.has(key)) return false;
        said.add(key);
        return true;
      });
      return { field, lines };
    });
  });
  /* THE KIND AN ORGANISATION HAS NOT BEEN GIVEN, offered as its own press while nobody is editing it. */
  const kindToSet = $derived(
    orgRole?.kind && changes && row && unsetValue(row.fields[orgRole.kind]) && editing !== orgRole.kind
      ? (readable.find((f) => f.id === orgRole?.kind && editable(f, id)) ?? null)
      : null,
  );
  const knownElsewhere = $derived(knownGroups.filter((g) => g.lines.length === 0 && editing !== g.field.id).map((g) => g.field));
  /* WHAT THE SENTENCE UNDER THE NAME SAYS ("Client at Halden Type Co. Last in touch 28 Aug."), and only while it is the
     sentence drawn: not listed as facts as well, and changed from "Add a field", where its box opens in the list. */
  const saidAbove = $derived(
    !archived && (lead?.parts || lead?.last) ? readable.filter((f) => lead?.said.includes(f.id) && editing !== f.id) : [],
  );
  /* WHAT "Add a field" OFFERS: every field the row has not answered that this reader can write, prose included. */
  const addable = $derived(
    changes ? [...unsetFields, ...documents.filter((f) => !writtenDocuments.includes(f)), ...knownElsewhere, ...saidAbove].filter((f) => editable(f, id)) : [],
  );
  /* WHAT THE RECORD KEEPS ABOUT WHO SOMEBODY IS, AND NOBODY TYPES: where they were met, the row they were merged into,
     and whether they are the person whose record it is. None is offered as a chip to fill in. */
  const recordKept = $derived(
    new Set([meets?.met, meets?.merged_into, meets?.self, orgRole?.met, orgRole?.merged_into].filter((x): x is string => Boolean(x))),
  );
  /* SAID ABOVE DETAILS, SO NOT AGAIN IN THEM: where they were seen, what they are known by, the projects the line under
     the name names, and the person whose record it is, which is their face's mark. */
  /* WHO THEY ARE, IN THEIR OWN WORDS, FIRST (29 October, "a person page that reads like a person"): a person's note is
     the paragraph under their name, in the page's ink, where it stood as a field labelled Note beside their email. The
     facts under it are then what they are known by. Only on a person's page, and only while nobody is editing it. */
  const about = $derived.by(() => {
    if (!meets || !row || !decl) return null;
    const f = decl.fields.find((x) => x.id === 'note' && !x.retired && x.type === 'text');
    const v = f ? row.fields[f.id] : null;
    return f && typeof v === 'string' && v.trim() !== '' && editing !== f.id ? { field: f.id, text: v } : null;
  });
  const evidence = $derived(
    new Set(
      [
        ...knownFields.map((f) => f.id),
        ...saidAbove.map((f) => f.id),
        meets?.met ?? orgRole?.met,
        meets?.self,
        about?.field,
        meets?.merged_into ?? orgRole?.merged_into,
        lead?.named ? (meets?.projects ?? orgRole?.projects) : undefined,
      ].filter((x): x is string => Boolean(x) && editing !== x),
    ),
  );
  /**
   * WHAT POINTS AT AN ORGANISATION, IN THE ORDER IT IS ASKED ABOUT: its people, then its projects, then its money, then
   * the rest (services, documents), each list in the order the record gave. Any other row keeps the record's order.
   */
  const rankOf = (g: Backlink): number =>
    meetsOf(REGISTERS[g.register]) ? 0 : isProjects(g.register) ? 1 : REGISTERS[g.register]?.fields.some((f) => f.type === 'money') ? 2 : 3;
  const related = $derived((orgRole ? [...incoming].sort((a, b) => rankOf(a) - rankOf(b)) : incoming).filter((g) => !projectPage || blockOf(REGISTERS[g.register]) === null));
  const workListed = $derived(openWork !== null && openWork.parts.length === 1 && openWork.late === 0 && workList !== null && related.some((g) => g.register === workList && g.rows.length > 0));

  /**
   * A RUN'S PAGE LEADS WITH ITS HANDOFF: what it is doing, where, the next step, what it already tried and its
   * notes, said as the next session would want them, above the same fields listed as facts.
   *
   * THE PROJECT BY ITS NAME OR NOT AT ALL. A run holds it as a spoken id, which is not for a person to read, so it is
   * said only where the record named it beside the row. What was tried is appended as it happens, so it is turned
   * round to lead with the newest, which is the one the next session is most likely to repeat.
   */
  /* A PROJECT'S PAGE TAKES ONE SHAPE (`project.ts`); every other list keeps the page it has. */
  const projectPage = $derived(isProject(decl));
  const pj = $derived.by(() => {
    if (!projectPage || !row || !decl) return null;
    return shapeOf({
      fields: row.fields,
      title: decl.title,
      incoming: incoming.map((g) => ({ decl: REGISTERS[g.register], rows: g.rows })),
      history,
      money: pjMoney,
      working: workingNow(),
    });
  });

  const handoff = $derived.by(() => {
    if (id !== 'session' || !row) return null;
    const f = row.fields;
    const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
    const lines = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
    const project = said(f.project);
    const mark = project ? names?.marks?.get(project) : undefined;
    return {
      agent: said(f.agent) || null,
      /* GONE QUIET AS THE RECORD SAYS IT (`isQuiet`): open, and not heard from in 15 minutes (`WORKING_MS`). */
      live: liveOf(f.state, isQuiet({ fields: f as never }, clock)),
      doing: said(f.doing),
      project: project ? (names?.get(project) ?? null) : null,
      mark: mark ? { mark: mark.mark, hue: mark.hue } : null,
      next: said(f.next),
      tried: lines(f.tried).reverse(),
      notes: lines(f.notes),
    };
  });
  /* A DOCUMENT WITH NO PROSE IS BEHIND "Add a field" TOO, after the short fields, and its tile is drawn only while it
     holds prose or its box is open. */
  const writtenDocuments = $derived(row ? documents.filter((f) => !unsetValue(row.fields[f.id]) || editing === f.id) : []);

  /**
   * THE SENTENCE UNDER THE TITLE, in place of the lead line of dots and words it replaced: where the row
   * stands, how late or when it is due, and how old it is. `said.ts` builds it; the state's word is drawn here, through
   * `stateSaid`, in the `lead-word` span the label tests read.
   */
  const sentence = $derived(
    row && id === KEYS_REGISTER && !archived
      ? keySentence(row.fields, clock)
      : row
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
          reading: readingLine,
        })
      : [],
  );

  /* AN AMOUNT AS A TILE WRITES ONE: the symbol where the record's currency has one, and no fraction of all zeros. */
  const moneySaid = (minor: number, currency: string): string => symbolText(money(minor, currency), homeCurrency(), true);
  /* A CHART'S VALUES, BY THE FIGURE'S RULE: a bar and a sparkline's point say what they are, where the tile's figure is a headline. */
  const figureSaid = (minor: number, currency: string): string => symbolText(money(minor, currency), homeCurrency(), 'figure');

  /* WHAT EACH DOCUMENT'S `{{path}}`s READ, the record's answer with the row as the entry they sit on, so a
     project's note prints its stage and how many things are in its way, as the project page does. A read hands them with
     the row; a write answers the row alone, and a changed field changes what a note says, so they are asked again, and
     the ones in hand stay drawn until the new ones land rather than flash a dash. */
  let docs = $state<Docs | undefined>(undefined);
  $effect(() => {
    const g = got;
    if (g?.from !== 'live' || !g.entry) {
      docs = undefined;
      return;
    }
    if (g.docs) {
      docs = g.docs;
      return;
    }
    const asked = askedFor;
    reader ??= rowReader(apiBase());
    void reader.docs(id, seq).then((d) => {
      if (askedFor === asked && got === g) docs = d;
    });
  });
  /** A link the host cannot resolve is plain text, never a dead anchor (36 §13 D16). */

  /* THE ONE HELPER A DECLARED PAGE ASKS TOO (`row-href.ts`): the row's own page where its list made one, else its screen. */
  const link = rowHref;

  /* A DATE IN A NOTE OPENS THAT DAY ON THE CALENDAR, as it does on a declared page (`BlockSlot.svelte`): the record's
     Calendar page where `boot` listed one, else `null` and the renderer draws the date plain (`day-href.ts`). */
  const dayLink = (iso: string) => dayHref((page.data as unknown as Partial<Shell>).pages, iso);

  /**
   * WHAT A PRESSED HOLE DOES (`Hole.svelte`). A value this row does not hold is filled HERE, so a path that names one
   * of its fields opens that field's box; any other hole is `Hole`'s: the place the value lives, or "Find this out".
   */
  let holes = $state<{ press: (path: string | null) => void }>();
  function fillHere(path: string): boolean {
    const head = path.trim().split('.')[0] ?? '';
    const f = readable.find((x) => x.id === head);
    if (!f || !row || !changes || !editable(f, id)) return false;
    startEdit(f);
    return true;
  }

  /**
   * `y` COPIES THE ID AND `⇧Y` THE LINK, which is what the grid does; "Copy link" in the head's "…" copies
   * the link.
   *
   * The route had no key listener at all while its own header carried `<kbd>y</kbd>`, so the one
   * screen where somebody most wants a row's spoken id to paste into a message advertised the key
   * for it and ignored every press. `19 §4`'s whole argument for a registry is that the sheet
   * documents what is bound BY READING IT, so a printed key that does nothing is the drift the
   * registry exists to prevent.
   *
   * `silenced` first: `y` is a bare letter, and `Character keys: off` silences the namespace.
   */
  /* SEND TO… (`$lib/send`): the head's split button, which `s` opens the sheet of. */
  let sender = $state<ReturnType<typeof SendButton> | null>(null);

  function onkeydown(e: KeyboardEvent) {
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard. */
    if (covered()) return;
    if (typing() || silenced(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!row) return;
    /* `s`: THIS ROW, SENT, as `s` sends what is picked in its list. */
    if (e.key === 's' && sender) {
      e.preventDefault();
      sender.openHere();
      return;
    }
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

<svelte:head><title>{titleOf(row && decl && rowNameSaid(id, String(row.fields[decl.title] ?? "")), decl?.name)}</title></svelte:head>

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

  <!-- WHO A PERSON IS, OR WHAT AN ORGANISATION IS, in place of the sentence a row of any other list leads with. -->
  {#snippet whoLine()}{#each lead?.parts ?? [] as part, i (i)}{#if part.href}<a class="who-link tap" href={at(part.href)}>{part.text}</a>{:else}{part.text}{/if}{/each}{#if lead?.parts && lead.last}{' '}{/if}{lead?.last ?? ''}{/snippet}

  <!-- A VALUE AS THE PAGE SAYS IT, in its line of the fields tile. -->
  {#snippet shown(f: FieldDecl, value: unknown)}
    {#if f.type === 'money'}
      <!-- AT THE FACT'S OWN WEIGHT: the amount the page leads with is the large one, and a second never competes. -->
      <Money minor={amountOf(value) ?? 0} currency={currencyOf(value) ?? ''} />
    {:else if f.id === decl.state}
      <Chip label={stateSaid(decl, String(value))} {tone} />
    {:else if f.type === 'ref' && namedRef(f.to, value)}
      <!-- A ROW THIS ONE POINTS AT OPENS ITS PAGE, said by its name: who an invoice is for is one press from them. A
           project wears its 8px dot in its slot before the name (money F9), the dot every list draws it with. -->
      {@const named = namedRef(f.to, value)!}
      {@const mark = identityOf(id, f.id, value, names)}
      <a class="ref-link" href={at(named.href ?? '')}
        >{#if mark}<span class="ref-dot" data-slot={slotOf(mark.hue)} aria-hidden="true"></span>{/if}{named.name}</a
      >
    {:else if identityOf(id, f.id, value, names)}
      <IdentityMark identity={identityOf(id, f.id, value, names)!} size="md" />
    {:else if f.type === 'day'}
      <!-- A DAY AS A SENTENCE SAYS IT, "2 Sep" inside this year and "2 Sep 2025" outside it, and not
           followed by a second, relative reading of the same day. -->
      {daySaid(String(value), clock)}
    {:else if id === 'session' && f.id === 'project' && spokenRow(value, names)}
      <!-- A RUN'S PROJECT IS HELD AS A SPOKEN ID. It reads as the project, and opens it, with the same thumb's target as
           any other fact that opens a row (`.ref-link`): bare, it was 61 by 23 under a thumb. -->
      <a class="ref-link" href={at(spokenRow(value, names)!.href)}>{spokenRow(value, names)!.label}</a>
    {:else if f.type === 'enum'}
      <span class="enum-word">{copy.valueWord(display(id, f.id, value, clock, names) ?? '')}</span>
    {:else if f.type === 'text' && typeof value === 'string' && isMemo(value)}
      <!-- A MEMO DRAWS AS A NOTE: its headings, bold and tables, folded past eight lines with Show all. -->
      <NoteText text={value} />
    {:else}
      {display(id, f.id, value, clock, names)}
    {/if}
  {/snippet}

  <!--
    THE BOX IS THE ONE THE NEW-ROW FORM DRAWS, BY TYPE, because which control a field takes is a
    property of its declared type and not of the screen it is on. The classes are `controls.css`'s, so
    this is the same field shape as the rest of the product rather than a second one that drifts.

    A `ref` IS PICKED BY NAME (`RefPick`), the picker the new-row form draws, from the linked list this
    page walked to name the row's links. It was a box holding the row's number, so a ledger line's
    "Change category" showed `15` and refused "Insurance". The draft is still the picked row's number,
    which goes through the same conversion the list writes through.
  -->
  {#snippet fieldEditor(f: FieldDecl, value: unknown)}
    <form
      class="editor"
      id="{uid}-edit"
      onsubmit={(e) => {
        e.preventDefault();
        void saveEdit(f);
      }}
      {@attach escCloses}
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
      {:else if f.type === 'ref' && f.to}
        <!-- A PRESSED ROW IS SAVED AT ONCE, so the open list never stands over Save. -->
        <RefPick to={f.to} label={labelOf(f)} bind:value={draft} onpick={() => void saveEdit(f)} />
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
        <Button weight="bare" onclick={endEdit}>{copy.editCancel}</Button>
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
    <button type="button" class="edit-field tap" data-edit={f.id} aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>
      <Icon name="edit" size="s" />
    </button>
  {/snippet}

  <!-- ONE FACT: its label in the first column, its value in the second, and its pencil in the trailing one. A deadline
       that has passed is said in red, the one red a fact can carry. -->
  {#snippet fact(f: FieldDecl, more = false)}
    {@const value = row.fields[f.id]}
    <!-- A FACT PAST THE FIRST SIX OPENS IN PLACE: its height grows from nothing and it fades up, and it leaves the same
         way (`rowIn`, `rowOut`; a fade alone under reduced motion). The first six are simply there. -->
    <div class="fact" in:foldIn={more} out:foldOut={more}>
      <dt class="fact-label">{labelOf(f)}</dt>
      <dd class="fact-value" data-type={f.type} data-own={OWN_TYPES.has(f.type) ? '' : undefined} data-late={f.id === dueField?.id && lateTone === 'bad' ? '' : undefined} dir={dirOf(id, f.id)}>
        {#if editing === f.id}
          {@render fieldEditor(f, value)}
        {:else}
          {@render shown(f, value)}
        {/if}
      </dd>
      <!-- THE PENCIL IS ITS OWN CELL IN THE TRAILING COLUMN, so every pencil on the page shares one edge whatever the
           value beside it holds. A `dd`, because a `dl`'s groups hold nothing else. -->
      {#if changes && editable(f, id) && editing !== f.id}
        <dd class="fact-pencil">{@render pencil(f)}</dd>
      {/if}
    </div>
  {/snippet}

  <!-- THE LIST'S NAME IS THE WAY BACK: a link above the title from 900px, and the chevron in the
       phone's bar below it. No number follows the title, here or anywhere on the page. -->
  <!-- THE HEAD'S META LINE: where the row applies, then the sentence, then who holds it. The chip and "Hand to" stood in
       the head's row beside the primary, five controls at 1440 and "Mark do…" off the edge at 390; now the row keeps its
       primary and its "…", and what is true of the row is said under its name. -->
  {#snippet headLine()}<span class="head-scope"
      ><ScopeMove register={id} {row} {names} live={changes} size="s" title={String(row.fields[decl.title] ?? '')} onmoved={() => void rowMoved(id, seq)} /></span
    >{#if !archived && (lead?.parts || lead?.last)}{@render whoLine()}{:else}{@render sentenceLine()}{/if}{#if id === KEYS_REGISTER && !archived && !keyHeld(row.fields) && !(typeof row.fields.where === 'string' && row.fields.where.trim() !== '')}{' '}<a class="who-link tap" href={at(`/keychain?reconnect=${encodeURIComponent(String(row.fields.label ?? ''))}`)}>Add it</a>{/if}{#if live && !archived}{' '}<HandSheet
        register={id}
        {row}
        {decl}
        line
      />{/if}{/snippet}

  <!-- ON A PHONE THE NAME TAKES ITS OWN ROW, three lines at most, with the "…" at its end, and the primary stands under it
       (`.row-head` below): a name, a chip, a primary and a "…" on one row cut "Chase Halden on 2026-041" to "Chase
       Halden…". -->
  <!-- A PERSON'S PAGE WEARS THEIR FACE, as every list draws them: a who is round, and the list's group glyph beside one
       person's name read as a crowd. -->
  {#snippet personWell()}<Face name={String(row?.fields[decl?.title ?? ''] ?? '')} kind="person" you={self && owner} size="l" />{/snippet}
  <div class="row-head">
  <PageHead icon={iconFor(decl?.icon, 'rows')} named kicker={listName(id)} back={`/r/${id}`} title={orgRole ? orgNameSaid(String(row.fields[decl.title] ?? '')) : (lineHead ?? rowNameSaid(id, String(row.fields[decl.title] ?? '')))} sentence={headLine} well={meets ? personWell : undefined}>
    {#snippet actions()}
      <!-- `Copy id` WAS THE FIRST ACTION IN THIS HEADER. A row's page led with a developer verb: the first control a
           person saw on an invoice was the one that puts `obligations#1` on the clipboard, ahead of anything that does
           something to the invoice. "Copy link" is in the "…", and `y` still copies the id. -->
      <!-- THE ONE PRIMARY, AND THE REST IN THE "…". A row still open on a list that says what finishes
           it leads with that: "Mark paid" on an invoice, "Mark done" on a task (`finishOf`). Anywhere else there is no
           primary: a field is edited where it stands, and "Edit" is in the "…" (money F9). Edit and Archive stood beside
           each other at one weight, and neither was what a person opens an unpaid invoice to do. -->
      {#if finish}
        <!-- A RARE ENDING IS INK, NOT RED (1 Nov, L26): "Mark superseded" on a learning is seldom what a person opens it
             for, so the red is left unspent there. -->
        <Button weight={rareFinish ? 'ink' : 'primary'} disabled={saving} data-finish data-head-primary onclick={() => void finishRow(finish)}>{finish.said}</Button>
      {/if}
      <!-- A ROW OF A LIST WITH A PAGE OF ITS OWN SAYS WHERE IT IS DRAWN: a reading opens its chart, the list's page
           searched for its name, so "CPU, bake" is one press from the line it is a point on. -->
      {#if chartTo}
        <Button href={chartTo} data-row-chart>{copy.rowSeeChart}</Button>
      {/if}
      <!-- `Put back` STANDS IN THE HEAD for as long as this tab holds the row it just archived: see `archived` for why
           that moment is the only one it can be offered in. Archive itself is in the "…", the list's own verb on the
           row itself, and neither is drawn for somebody who cannot change the list, where the foot of the fields tile
           says why. -->
      {#if changes && archived}
        <Button weight="primary" disabled={saving} data-head-primary onclick={() => void setArchived(false)}>{copy.rowRestore}</Button>
      {/if}
      <!-- SEND TO…: Slash or an agent, the last one in one press and the rest from its arrow (s). -->
      {#if live && !archived && row.seq !== null}
        <SendButton
          bind:this={sender}
          kind={id}
          attach={[{ ref: `${id}#${row.seq}`, label: rowNameSaid(id, String(row.fields[decl.title] ?? '')) || `${decl.one} ${row.seq}` }]}
          project={pj ? `${id}#${row.seq}` : null}
        />
      {/if}
      <!-- "HAND TO": a teammate or an agent in one press, from the "…"; who holds the row now is in the sentence. -->
      {#if live && !archived}
        <HandSheet bind:open={handOpen} register={id} {row} {decl} onhanded={() => void rowMoved(id, seq)} />
      {/if}
      <!-- "SHARE": this row with somebody here, a group or an email, for an owner or an Admin, from the
           head's "⋯", so the head keeps its primary and its "⋯". -->
      {#if live && !archived}
        <ShareLazy bind:open={sharingOpen} subject={{ kind: 'row', list: id, seq: row.seq, id: row.id ?? null, name: rowNameSaid(id, String(row.fields[decl.title] ?? '')) || `${decl.one} ${row.seq}` }} />
      {/if}
      <!-- THE HEAD'S "…", LAST: the row's link, Archive, and Edit where the primary is the finishing verb. A 36px square in the buttons' shape, named for a screen reader by the
           hidden words and for a pointer by its tooltip. A new field for the list is at the foot of "Add a field". -->
      <!-- NOT BEHIND `live`: a row painted from the local copy kept the whole menu away until the record answered, and a
           menu that comes and goes as the page re-reads is one that opens nothing. Every verb that writes asks `changes`. -->
      {#if row}
        <Menu label={copy.moreOn(rowNameSaid(id, String(row.fields[decl.title] ?? '')) || decl.one)} align="end">
          {#snippet trigger()}
            <span class="head-more" title={copy.moreOn(rowNameSaid(id, String(row.fields[decl.title] ?? '')) || decl.one)}
              ><Icon name="more" size="l" /><span class="head-vh">{copy.moreOn(rowNameSaid(id, String(row.fields[decl.title] ?? '')) || decl.one)}</span></span
            >
          {/snippet}
          {#if changes && !archived}<button type="button" class="mi" role="menuitem" onclick={editTitle}>{copy.editRow}</button>{/if}
          {#if changes && !archived && handFor(decl) !== null}<button type="button" class="mi" role="menuitem" data-hand-row onclick={() => (handOpen = true)}>{copy.handTo}</button>{/if}
          <button type="button" class="mi" role="menuitem" onclick={() => clipboard.putLink(id, row.seq)}>{copy.copyLink}</button>
          {#if live && !archived && sharable}<button type="button" class="mi" role="menuitem" data-share-row onclick={() => (sharingOpen = true)}>{copy.shareOpen}</button>{/if}
          <!-- ONLY THE ROW'S MAKER: the record refuses anybody else, so the verb is not offered to them. -->
          {#if mine && !archived}<button type="button" class="mi" role="menuitem" disabled={saving} onclick={() => void setPrivate(!isPrivate)}>{isPrivate ? copy.rowShareAgain : copy.rowKeepPrivate}</button>{/if}
          {#if mergeable}<button type="button" class="mi" role="menuitem" data-merge onclick={() => (mergeOpen = true)}>{copy.mergeWith}</button>{/if}
          {#if changes && !archived}<button type="button" class="mi" role="menuitem" disabled={saving} onclick={() => void setArchived(true)}>{copy.rowArchive}</button>{/if}
        </Menu>
      {/if}
    {/snippet}
  </PageHead>
  </div>
  {#if mergeable && row}<MergeSheet bind:open={mergeOpen} register={id} seq={row.seq} name={String(row.fields[decl.title] ?? '')} title={decl.title} mergedInto={decl.meets?.merged_into} />{/if}
  {#if live && proposes}<ListEditor bind:open={fieldsOpen} register={id} {owner} onchanged={() => (got = got && { ...got })} />{/if}

  <div class="page">
    <!-- SAID ON THE ROW, because every list leaves an archived row out and nothing else on this
         screen would say why it has gone from them. -->
    {#if archived}
      <p class="archived-note"><Icon name="archive" size="s" /><span>{copy.rowArchivedNote}</span></p>
    {/if}
    <!-- ONLY A ROW KEPT TO ITS MAKER SAYS WHO CAN SEE IT, with the lock: "Everyone who can open Bills and invoices can see
         this." stood over every row and said the ordinary case at the weight of an exception (money F9). -->
    {#if live && row && isPrivate}
      <p class="archived-note seen-by"><Icon name="lock" size="s" /><span>{copy.rowSeenByOnlyYou}</span></p>
    {/if}

    <!-- THE CONVERSATION: what was sent from this row and what came back, under its head, once something was. -->
    {#if live && row.seq !== null}<SendStrip ref="{id}#{row.seq}" kind={id} label={rowNameSaid(id, String(row.fields[decl.title] ?? ''))} />{/if}

    <!-- A ROW WITH LITTLE HISTORY TAKES THE WIDTH (1 Nov, L20): under three events the Activity tile was a narrow column
         beside the row with one line in it, so it goes under the row at full width instead. -->
    <div class="board" data-few={live && told && told.from !== 'refused' && history.length < 3 ? '' : undefined}>
      <div class="main">
        <!-- THE PROJECT'S ONE SHAPE leads, then the fields and whatever else the page holds. -->
        {#if pj && blocksOf(pj.facts).length > 0}
          <ProjectBlocks facts={pj.facts} data={pj.data} nextHref={pj.nextHref} format={moneySaid} />
        {/if}

        <!-- WHAT IT HOLDS TO LOOK AT: the audits, plans and designs hung on it, each a still or a quiet card until pressed. -->
        {#if live && row.seq !== null}<VisualStrip on="{id}#{row.seq}" tile />{/if}

        <!-- A RUN READS AS ITS HANDOFF, led by its face, what it is doing and where it is, then what the next
             session needs: the next step, what was already tried, newest first, and the notes it left. The one place
             `live` is used on this page, in the face's ring. -->
        {#if handoff}
          <Tile aria-label={faceWords.handoff}>
            <div class="handoff-head">
              <AgentFace agent={handoff.agent} run="S{seq}" live={handoff.live} project={handoff.mark} />
              <p class="handoff-doing">{handoff.doing || faceWords.nothingYet}</p>
              <span class="handoff-live">{faceWords.live[handoff.live]}</span>
            </div>
            {#if handoff.project || handoff.next}
              <div class="facts-box"><dl class="facts">
                {#if handoff.project}<div class="fact"><dt class="fact-label">{faceWords.project}</dt><dd class="fact-value">{handoff.project}</dd></div>{/if}
                {#if handoff.next}<div class="fact"><dt class="fact-label">{faceWords.next}</dt><dd class="fact-value" data-own>{handoff.next}</dd></div>{/if}
              </dl></div>
            {/if}
            {#if handoff.tried.length}
              <h3 class="sub-head">{faceWords.tried}</h3>
              <ol class="handoff-lines">{#each handoff.tried as t}<li>{t}</li>{/each}</ol>
            {/if}
            {#if handoff.notes.length}
              <h3 class="sub-head">{faceWords.notes}</h3>
              <ul class="handoff-lines">{#each handoff.notes as n}<li>{n}</li>{/each}</ul>
            {/if}
          </Tile>
        {/if}

        {#if kpiPage && row.seq !== null}<KpiLead register={id} seq={row.seq} fields={row.fields} {names} now={clock} />{/if}

        <!-- THE FIELDS TILE. The amount first and large, since it is what a person opens a money line for; then every
             field the row has answered, and what a person or an organisation is known by, as one definition list; then
             "Add a field" for the rest. -->
        <Tile aria-label={rowWords.details}>
          {#if self && !lead?.last}
            <!-- THE PERSON WHOSE RECORD THIS IS, MARKED: the list's `self` part, which the facts leave out because it is
                 said here, beside the face their row wears in every list. -->
            <p class="self-line"><Face name={String(row.fields[decl.title] ?? '')} kind="person" you={owner} size="m" /><span>{personWords.self}</span></p>
          {/if}
          {#if about}
            <div class="about">
              <NoteText text={about.text} />
              {#if changes && editable(decl.fields.find((x) => x.id === about.field)!, id)}<div class="about-pencil">{@render pencil(decl.fields.find((x) => x.id === about.field)!)}</div>{/if}
            </div>
          {/if}
          {#if figure !== null && figureField}
            <div class="figure">
              <p class="figure-label">{labelOf(figureField)}</p>
              {#if editing === figureField.id}
                {@render fieldEditor(figureField, row.fields[figureField.id])}
              {:else}
                <div class="figure-line">
                  <p class="figure-value num"><Money minor={figure} currency={currencyOf(row.fields[figureField.id]) ?? ''} weight="strong" /></p>
                  {#if changes && editable(figureField, id)}{@render pencil(figureField)}{/if}
                </div>
                {#if paidPart}
                  <div class="paid-part">
                    <p class="paid-said num">{rowWords.paidPart(moneySaid(paidPart.paid, paidPart.currency), moneySaid(paidPart.left, paidPart.currency))}</p>
                    <span class="paid-track" aria-hidden="true"><span class="paid-fill" style:inline-size="{paidPart.share}%"></span></span>
                  </div>
                {/if}
              {/if}
            </div>
          {/if}

          {#if facts.length > 0 || knownGroups.length > 0}
            <div class="facts-box">
            <dl class="facts">
              {#each factsShown as f, i (f.id)}{@render fact(f, i >= LEAD_FACTS)}{/each}
              <!-- WHAT THEY ARE KNOWN BY, each line by its kind; the pencil on a field's first line opens that field. -->
              {#each knownGroups as g (g.field.id)}
                {#if editing === g.field.id}
                  {@render fact(g.field)}
                {:else}
                  {#each g.lines as k, i (i)}
                    <div class="fact">
                      <dt class="fact-label">{k.label}</dt>
                      <dd class="fact-value" dir="auto" data-own>{k.value}</dd>
                      {#if i === 0 && changes && editable(g.field, id)}<dd class="fact-pencil">{@render pencil(g.field)}</dd>{/if}
                    </div>
                  {/each}
                {/if}
              {/each}
            </dl>
            {#if folds}
              <button type="button" class="facts-fold" aria-expanded={factsOpen} onclick={() => (factsOpen = !factsOpen)}>
                <span>{factsOpen ? rowWords.fewerDetails : rowWords.moreDetails(factsHidden)}</span><Icon name="chevronDown" size="s" />
              </button>
            {/if}
            </div>
          {:else if figure === null && !self && !about}
            <p class="quiet">{rowWords.nothingYet}</p>
          {/if}

          <!-- WHAT THE ROW HAS NOT ANSWERED, behind one control: each field by name, and a new field for every row of the
               list last. For somebody who cannot change the list, one sentence says why there is no Edit or Archive. -->
          {#if addable.length > 0 || (live && proposes) || (live && !changes) || kindToSet}
            <div class="facts-foot">
              <!-- AN ORGANISATION WITH NO KIND YET SAYS SO WITH ONE PRESS, where its kind was one name among the fields
                   under "Add a field": what it is to you decides how the list groups it. -->
              {#if kindToSet}
                <Button weight="quiet" size="sm" onclick={() => kindToSet && startEdit(kindToSet)}>{seenWords.setKind}</Button>
              {/if}
              {#if addable.length > 0 || (live && proposes)}
                <Menu label={fieldWords.add}>
                  {#snippet trigger()}<span class="add-field"><Icon name="plus" size="s" /><span>{fieldWords.add}</span></span>{/snippet}
                  {#each addable as f (f.id)}
                    <button type="button" class="mi" role="menuitem" onclick={() => startEdit(f)}>{labelOf(f)}</button>
                  {/each}
                  {#if live && proposes}
                    <button type="button" class="mi" role="menuitem" onclick={() => (fieldsOpen = true)}>{rowWords.newField(decl.one)}</button>
                  {/if}
                </Menu>
              {/if}
              {#if live && !changes}<p class="quiet">{reachWords.readOnly(listName(id))}</p>{/if}
            </div>
          {/if}
        </Tile>

        <!-- A LINE SPLIT ACROSS CATEGORIES: its parts, and the way to split it or change the split. -->
        {#if splitAt && row}
          <SplitTile base={apiBase()} register={id} at={splitAt} fields={row.fields} changes={Boolean(live && changes && !archived)} onsave={saveSplit} />
        {/if}

        <!-- THE TILES, ONLY WHERE THERE IS A FIGURE: each a figure, its chart, and one line saying what it means. -->
        {#if !projectPage && (moneyIn || (openWork && !workListed))}
          <div class="tiles">
            {#if moneyIn}
              <Tile icon="money" title={rowWords.moneyIn} href={moneyAll ?? undefined} hrefLabel={moneyAll ? rowWords.all : undefined}>
                <div class="stat">
                  <p class="tile-figure num">{moneySaid(moneyIn.total, moneyIn.currency)}<span class="tile-figure-note">{rowWords.months(moneyIn.months.length)}</span></p>
                  <div class="stat-line">
                    <Sparkline values={moneyIn.months.map((m) => m.value)} tone="earn" mark="high" subject={rowWords.moneyIn} format={(n) => figureSaid(n, moneyIn?.currency ?? '')} />
                  </div>
                </div>
                <p class="reading">{moneyInSaid(moneyIn, clock, moneySaid)}</p>
              </Tile>
            {/if}
            <!-- ONE KIND OF OPEN WORK IS THE LIST BELOW ALREADY (31 October, AG23): "Open work 1 open" stood over "Tasks 1"
                 listing that one task. The tile stays where it splits the work by kind or says what is late. -->
            {#if openWork && !workListed}
              <Tile icon="task" title={rowWords.openWork} href={workAll ?? undefined} hrefLabel={workAll ? rowWords.all : undefined}>
                <!-- ONE KIND OF WORK IS SAID ONCE (recheck, low notes): its number and its word, with no bar of one colour
                     across the tile and no sentence saying the number a third time. -->
                {@const single = openWork.parts.length === 1 ? openWork.parts[0]! : null}
                <p class="tile-figure num">{openWork.total.toLocaleString('en')}{#if openWork.atLeast}<span class="more-sign">+</span>{/if}{#if single}<span class="tile-figure-note">{single.label.toLowerCase()}</span>{/if}</p>
                {#if !single}<Stacked parts={openWork.parts.map((p) => ({ label: p.label, value: p.count }))} subject={rowWords.openWork} />{/if}
                {#if !single || openWork.late > 0}
                  <p class="reading">
                    {#if !single}{openWorkSaid(openWork)}{/if}{#if openWork.late > 0}{single ? '' : ' '}<span class="said-late" data-tone="bad">{figureWords.late(openWork.late)}</span>{/if}
                  </p>
                {/if}
              </Tile>
            {/if}
          </div>
        {/if}

        <!-- THE BODY: a `document` field is the dialect, drawn by the same interpreter a declared page uses, one tile
             each. The read view IS the renderer, so what you are looking at is the artefact (22 §8). -->
        {#each writtenDocuments as f (f.id)}
          <Tile title={labelOf(f)}>
            {#snippet actions()}{#if changes && editing !== f.id}{@render pencil(f)}{/if}{/snippet}
            <article class="document-slot">
              {#if editing === f.id}
                <form
                  class="editor"
                  id="{uid}-edit"
                  onsubmit={(e) => {
                    e.preventDefault();
                    void saveEdit(f);
                  }}
                  {@attach escCloses}
                >
                  <textarea class="edit-area" rows="10" aria-label={labelOf(f)} bind:value={draft}></textarea>
                  <div class="edit-actions">
                    <Button type="submit" weight="primary" size="sm" disabled={saving}>{saving ? copy.writeMarkSaving : copy.editSave}</Button>
                    <Button weight="bare" size="sm" onclick={endEdit}>{copy.editCancel}</Button>
                  </div>
                </form>
                {#if problem}<p class="edit-why">{problem}</p>{/if}
              {:else}
                <!-- `hole` IS WHAT MAKES A HOLE PRESSABLE. Without it the renderer draws a marked span rather than a
                     `<button>` nobody wrote a handler for, and with it a press goes to `Hole` below. `dayHref` IS THE
                     RECORD'S CALENDAR PAGE where it holds one; on a record without one a date stays a plain figure. -->
                <Document
                  src={shownOf(docs?.[f.id], String(row.fields[f.id]))}
                  opts={{ resolve: resolverOf(docs?.[f.id], String(row.fields[f.id])), link, dayHref: dayLink, hole: (path: string | null) => holes?.press(path), now: clock, href: at, home: homeCurrency() }}
                />
              {/if}
            </article>
          </Tile>
        {/each}

        <!-- WHERE A PERSON WAS SEEN: each place once, newest first, with how often and when, in a person's words. -->
        {#if seen.length > 0}
          <Tile icon="link" title={seenWords.seenIn}>
            <ul class="items" aria-label={seenWords.seenIn}>
              {#each seen as place (place.where)}
                <li class="item">
                  <span class="item-icon"><Icon name={place.kind === 'mail' ? 'inbox' : place.kind === 'commit' ? 'code' : 'link'} size="s" /></span>
                  <span class="item-main">
                    <span class="item-title" dir="auto">{place.where}</span>
                    {#if place.about.length > 0}<span class="item-detail" dir="auto">{place.about.slice(0, 3).join(' · ')}</span>{/if}
                  </span>
                  <span class="item-when">{timesSaid(place, (d) => daySaid(d, clock))}</span>
                </li>
              {/each}
            </ul>
          </Tile>
        {/if}

        <!-- WHO USED IT: a key's or a tool's row lists the last ten runs that opened or reached it. -->
        {#if live && (id === 'credentials' || id === 'tools')}
          <UsedBy spoken="{id}#{row.seq}" />
        {/if}

        <!-- WHAT POINTS HERE, one tile per RELATION, not per register: two fields of one register can point at the same
             place and mean different things, an update's `track` is what it is about and its `supersedes` is what it
             replaces. The list's icon heads the tile once, and each line is what it is, its other values, and the
             list's tone as a small dot. -->
        {#each related as rel}
          {@const twice = incoming.filter((r) => r.name === rel.name).length > 1}
          <Tile
            icon={rel.icon}
            title={twice ? `${rel.name} · ${copy.linkedThrough(rel.label)}` : rel.name}
            count={rel.total}
            href={rel.total > rel.rows.length ? rel.href : undefined}
            hrefLabel={rel.total > rel.rows.length ? `${rowWords.all} ${rel.total}` : undefined}
          >
            <!-- WHERE A LINE STANDS IS SAID ONCE (31 October, AG23): a task read "Open" under its name and "Open" beside it. -->
            <!-- AMOUNTS AS THE REST OF THE APP SAYS THEM, "+£3,030" in and "−£3,030" out, pence only where they are not
                 round; and THE DOT HAS A WORD, "Paid", "38 days late", "Due in 5 days", so the state is never a colour
                 alone (`linked.ts`). -->
            {@const relDecl = REGISTERS[rel.register]}
            <!-- LATE FIRST, THEN OPEN BY ITS DAY, THE FINISHED LAST (`pointingOrder`): a person's bills came in the record's order. -->
            {@const laid = pointingOrder(relDecl, rel.raw ?? [], rel.rows.length, clock)}
            <ul class="items" aria-label="{rel.name} · {rel.label}">
              {#each laid as i (rel.rows[i]!.key)}
                {@const r = rel.rows[i]!}
                {@const fields = rel.raw?.[i]}
                {@const stood = fields ? linkedState(relDecl, fields, clock, r.tone, moneySaid) : { text: null, tone: r.tone }}
                {@const rest = linkedCells(relDecl, rel.columns, r.cells, fields, (c) => moneyInText(c, homeCurrency())).filter((c) => !stood.text || c.trim().toLowerCase() !== stood.text.trim().toLowerCase())}
                {@const stands = stood.text}
                {@const tone = stood.tone}
                <li>
                  <a class="item item-link" href={at(r.href ?? '')}>
                    <span class="item-main">
                      <span class="item-title" dir="auto">{moneyInText(r.cells[0] || r.key, homeCurrency())}</span>
                      {#if rest.length > 0}<span class="item-detail">{rest.join(' · ')}</span>{/if}
                    </span>
                    {#if tone || stands}
                      <span class="item-when item-stands" data-intent={tone}
                        >{#if tone}<span class="glyph" role={stands ? undefined : 'img'} aria-hidden={stands ? 'true' : undefined} aria-label={stands ? undefined : TONES[tone].label}>{TONES[tone].glyph}</span>{/if}{#if stands}<span
                            class="stands-word">{stands}</span
                          >{/if}</span
                      >
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          </Tile>
        {/each}
        <!-- THE ONE READ ON THIS SCREEN THAT CAN BE REFUSED BY ITSELF: a caller may read this row and not the lists
             that point at it. Drawing nothing would say nothing points here, which is a different fact about the
             record. -->
        {#if linked?.from === 'refused'}
          <Tile><Empty kind="error" compact title={copy.linksRefused} /></Tile>
        {/if}
      </div>

      <!-- THE TIMELINE: one tile beside the row, a single composer and then what happened and what was said, newest
           first. The history's own refusal is said in it, above whatever comments there are. -->
      <aside class="side">
        <Tile icon="history" title={timelineWords.heading}>
          {#if told?.from === 'refused'}
            <Empty kind="error" compact title={told.fix} />
          {/if}
          {#if live && row.seq !== null && decl?.state}
            <TaskEffects register={id} seq={row.seq} stateField={decl?.state ?? null} done={decl?.done ?? []} finished={decl?.done?.includes(stateValue) ?? false} description={row.fields.description ?? row.fields.notes ?? row.fields.details ?? null} />
          {/if}
          {#if live}
            <Timeline on="{id}#{row.seq}" {history} now={clock} me={me || null} {people} onnames={askNames} />
          {/if}
        </Tile>
      </aside>
    </div>
  </div>
  <!-- NOTHING OF IT IS DRAWN UNTIL A HOLE IS PRESSED. Named by the row, for the link back a task it adds keeps. -->
  <Hole bind:this={holes} row={row.seq === null ? null : { register: id, seq: row.seq }} name={String(row.fields[decl?.title ?? ''] ?? '')} mine={fillHere} />
{/if}

<style>
  /* THE PAGE: the board, full width inside the gutters, its tiles 12 apart. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
    padding: var(--sp-4) var(--gutter) var(--sp-9);
  }

  /* ── the board ─────────────────────────────────────────────────────── */

  /* TWELVE COLUMNS: the row spans eight and its timeline four, and below 1000px they stack, the timeline under the row.
     Nothing floats on the board: every block below the head is a tile. */
  .board {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--inset);
    align-items: start;
  }

  .main {
    grid-column: span 8;
  }

  .side {
    grid-column: span 4;
  }

  .main,
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--inset);
    min-inline-size: 0;
  }

  @media (width < 1000px) {
    .main,
    .side {
      grid-column: 1 / -1;
    }
  }

  .board[data-few] > :is(.main, .side) {
    grid-column: 1 / -1;
  }

  /* THE FIGURE TILES SIDE BY SIDE, each at least 280 wide, and one a row on a phone. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: var(--inset);
    align-items: stretch;
  }

  /* ── the sentence's pieces ─────────────────────────────────────────── */

  /* A NAME IN A PERSON'S SENTENCE OPENS ITS PAGE: the sentence's own ink at 500, underlined only under a pointer, so the
     line reads as a sentence and not as a row of links. `.tap` makes it a 44px target under a thumb, as its words are a
     22px line (measured at 390, 30 Oct). */
  .who-link {
    color: inherit;
    font-weight: 500;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .who-link:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .who-link:focus-visible {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* A FACT THAT OPENS ANOTHER ROW reads as the value it is, in ink, and shows it is a way there under a pointer. */
  /* 24px TALL AT THE LEAST (audit 31 Oct i, AI5): a project's chip was 69 by 23 on a phone. */
  .ref-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-block-size: 24px;
    gap: var(--sp-2);
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    transition: text-decoration-color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .ref-link:hover {
      text-decoration-color: currentColor;
    }
  }

  /* A PROJECT'S DOT, 8px in its slot, as `ScopeChip` draws it. */
  .ref-dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    background: var(--ph, var(--ink-3));
    border-radius: var(--r-round);
  }

  .ref-dot[data-slot='blue'] {
    --ph: var(--cat-blue, var(--info));
  }

  .ref-dot[data-slot='violet'] {
    --ph: var(--cat-violet, var(--info));
  }

  .ref-dot[data-slot='pink'] {
    --ph: var(--cat-pink, var(--ink-2));
  }

  .ref-dot[data-slot='teal'] {
    --ph: var(--cat-teal, var(--good));
  }

  .ref-dot[data-slot='sky'] {
    --ph: var(--cat-sky, var(--info));
  }

  .ref-dot[data-slot='yellow'] {
    --ph: var(--cat-yellow, var(--warn));
  }

  .ref-dot[data-slot='lime'] {
    --ph: var(--cat-lime, var(--good));
  }

  .ref-dot[data-slot='slate'] {
    --ph: var(--cat-slate, var(--ink-3));
  }

  /* A THUMB'S TARGET round the one line of words, which stays the height of its text. */
  @media (pointer: coarse) {
    .ref-link::before {
      content: '';
      position: absolute;
      inset-block: calc((1lh - var(--tap)) / 2);
      inset-inline: 0;
      min-inline-size: var(--tap);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .ref-link:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .ref-link:focus-visible {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* Sentence case in the stylesheet, so the text stays the record's own word. */
  .lead-word,
  .enum-word {
    display: inline-block;
  }

  .lead-word::first-letter,
  .enum-word::first-letter {
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
    color: var(--red);
  }

  .said-late[data-tone='warn'] {
    color: var(--warn);
  }

  /* ── the fields tile ───────────────────────────────────────────────── */

  /* A PERSON'S NOTE LEADS THEIR PAGE as a paragraph in the body's ink, the pencil at its end, with the facts under it. */
  .about {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin-block-end: var(--sp-4);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .about > :global(:first-child) {
    flex: 1;
    min-inline-size: 0;
  }

  .self-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* THE AMOUNT, FIRST AND LARGE: its label at the meta size over the figure at the figure size, which never wraps, since
     a figure broken between its symbol and its digits is two figures. A container, so it answers the tile's width. */
  .figure {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    container-type: inline-size;
  }

  .figure-label {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .figure-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .figure-value {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-page);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    white-space: nowrap;
  }

  /* WHAT IS PAID OF IT, under the figure: the words at 13 in the second ink, over a 6px track whose fill is the ink. */
  .paid-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-inline-size: 360px;
    margin-block-start: var(--sp-1);
  }

  .paid-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .paid-track {
    display: block;
    overflow: hidden;
    block-size: 6px;
    background: var(--tile-2);
    border-radius: var(--r-round);
  }

  .paid-fill {
    display: block;
    block-size: 100%;
    background: var(--ink);
    border-radius: inherit;
  }

  /* A FIGURE THAT DOES NOT FIT SHRINKS ONE STEP BEFORE ANYTHING ELSE, which on the narrowest phone is what keeps a long
     foreign amount from pushing the page sideways. */
  @container (inline-size < 20rem) {
    .figure-value {
      font-size: var(--fs-figure);
    }
  }

  /* The code in front of the figure at half its size, the way every headline figure sets it. */
  .figure-value :global(.code) {
    font-size: 0.5em;
    font-weight: 600;
  }

  /* THE FACTS, A TWO-COLUMN DEFINITION LIST: no boxes and no rules between them, only the rhythm of the lines, the
     label at 13 in the quiet ink and the value at 15 in ink. Measured by the tile and not the window, so the list reads
     the same in the docked panel as on the page. The phone's shape is written first: the label over its value, since a
     label column left a value 170px to wrap in at 390. */
  .facts-box {
    container-type: inline-size;
  }

  .facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin: 0;
  }

  .fact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--tap);
    grid-template-areas:
      'label pencil'
      'value pencil';
    column-gap: var(--sp-2);
    align-items: center;
    /* A FACT STARTS AT ITS TOP: beside a long note in the two-column facts, a stretched fact spread its label to
       the middle and its value to the foot, six lines apart. */
    align-self: start;
    align-content: start;
    min-block-size: 40px;
    padding-block: 6px;
  }

  .fact-label {
    grid-area: label;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    line-height: 18px;
  }

  .fact-value {
    grid-area: value;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  .fact-value[data-type='money'],
  .fact-value[data-type='day'],
  .fact-value[data-type='int'],
  .fact-value[data-type='decimal'] {
    font-variant-numeric: tabular-nums;
  }

  /* A DEADLINE THAT HAS PASSED: the day in red, the words carrying the colour. */
  .fact-value[data-late] {
    color: var(--red);
    font-weight: 500;
  }

  /* The state's dot and word, a link's mark and a chip all take the value's size. */
  .fact-value :global(.chip) {
    color: var(--ink);
    font-size: inherit;
    line-height: inherit;
  }

  .fact-pencil {
    grid-area: pencil;
    align-self: center;
    margin: 0;
  }

  /* FROM 440px OF TILE THE LABEL HAS ITS OWN COLUMN, wide enough for "Chasing since" on one line and capped so a long
     label wraps inside it rather than pushing every value along. */
  @container (inline-size >= 440px) {
    .fact {
      grid-template-columns: minmax(0, 10rem) minmax(0, 1fr) var(--tap);
      grid-template-areas: 'label value pencil';
      column-gap: var(--sp-3);
    }
  }

  /* AND FROM 600px OF TILE THE FACTS RUN IN TWO COLUMNS (money F9: two at 1100), each a 56px pair with its label over
     its value, so a wide tile is not a long thin list with a label column and its values a hand's width away. A label
     column at that width left a value 200px and broke an address mid-word; over its value it has the column's width.
     Read across, then down. */
  @container (inline-size >= 600px) {
    .facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: var(--sp-6);
    }

    .fact {
      grid-template-columns: minmax(0, 1fr) var(--tap);
      grid-template-areas:
        'label pencil'
        'value pencil';
      column-gap: var(--sp-2);
      min-block-size: 56px;
    }
  }

  /* ON A PHONE NO PENCIL IS DRAWN, and the fact itself is what a thumb presses to edit it (money F9): the pencil's
     button lies over the whole line, its glyph hidden, still named "Edit Who" to a screen reader. A link in the value
     stays above it, so the name still opens its page. */
  @media (width < 640px) {
    .fact,
    .figure {
      position: relative;
    }

    .fact {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'label'
        'value';
    }

    /* `stretch`, since a grid's own `center` would hold the overlay at its content's height. */
    .fact-pencil {
      position: absolute;
      inset: 0;
      grid-area: auto;
      align-self: stretch;
      justify-self: stretch;
    }

    .fact .edit-field,
    .figure .edit-field {
      position: absolute;
      inset: 0;
      inline-size: auto;
      block-size: auto;
    }

    .fact .edit-field :global(svg),
    .figure .edit-field :global(svg) {
      visibility: hidden;
    }

    .fact .edit-field:active,
    .figure .edit-field:active {
      background: var(--hover);
    }

    .ref-link {
      z-index: var(--z-raise);
    }
  }

  /* UNDER A MOUSE A PENCIL SHOWS ON ITS FACT, pointed at or holding focus, so the list at rest is the facts alone. Under
     a thumb, where there is no pointing, every pencil stays. */
  @media (hover: hover) and (pointer: fine) {
    .fact .edit-field,
    .figure-line .edit-field {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    .fact:hover .edit-field,
    .fact:focus-within .edit-field,
    .figure-line:hover .edit-field,
    .edit-field:focus-visible {
      opacity: 1;
    }
  }

  /* THE TILE'S FOOT: "Add a field", and for a reader who cannot change the list, why there is no Edit. */
  /* "6 MORE DETAILS": a quiet line under the facts, its chevron turning as they open. */
  .facts-fold {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 32px;
    margin-block-start: var(--sp-2);
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .facts-fold :global(.icon) {
    transition: rotate var(--d-state, 180ms) var(--ease-out);
  }

  .facts-fold[aria-expanded='true'] :global(.icon) {
    rotate: 180deg;
  }

  @media (hover: hover) and (pointer: fine) {
    .facts-fold:hover {
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .facts-fold {
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .facts-fold :global(.icon) {
      transition: none;
    }
  }

  .facts-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* "Add a field" IS A BUTTON, a rectangle in the quiet fill like every secondary verb, with its plus. The menu's own
     button carries the hit box; this is what it looks like. */
  .add-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border-radius: 8px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger:hover > .add-field) {
      background: var(--tile-2);
      color: var(--ink);
    }
  }

  .quiet {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  /* THE CONTROL THAT OPENS A FIELD, as wide as the trailing column it sits in, so every pencil's glyph lands on one
     vertical line. `.tap` is the invisible 44 x 44 hit box. */
  .edit-field {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--tap);
    block-size: 32px;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 8px;
    color: var(--ink-3);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .edit-field:hover {
      background: var(--tile-2);
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

  /* A MENU IN THE FIELD'S SHAPE: the select filling it and its chevron at the end, which lets a press through to the
     menu under it. */
  .edit-caret {
    display: inline-flex;
    flex: none;
    color: var(--ink-3);
    pointer-events: none;
  }

  .edit-input {
    font: inherit;
    /* 16px IN EVERY BOX AT EVERY WIDTH, because a phone zooms the page when a smaller one takes focus. */
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .edit-area {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: max(var(--ctl-h), var(--tap));
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: 1.6;
    resize: vertical;
  }

  /* The currency, the unit, or the list a ref points at: printed beside the box, never typed. */
  .edit-unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .edit-check {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: max(var(--ctl-h), var(--tap));
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .edit-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* WHAT THE RECORD SAID, under the box it was typed in, with the words still in it. */
  .edit-why {
    margin: var(--sp-1) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* AN ARCHIVED ROW SAYS SO, in one quiet line with the archive glyph, and nothing about it is red. */
  .archived-note {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--hover);
    border-radius: 8px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* ── the figure tiles ──────────────────────────────────────────────── */

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
    font-size: var(--fs-figure);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.15;
    white-space: nowrap;
  }

  .tile-figure-note {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    letter-spacing: 0;
  }

  .more-sign {
    color: var(--ink-3);
  }

  /* THE ONE WRITTEN LINE UNDER A CHART, saying what it means. */
  .reading {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  /* ── the body ──────────────────────────────────────────────────────── */

  /* Prose at the body size and a reading measure. A note's own headings sit under the tile's, never over them: a
     note's first heading was set above the group's own, so the row's prose outranked the row. */
  .document-slot {
    max-inline-size: var(--measure);
    font-size: var(--fs-body);
    line-height: 1.55;
  }

  .document-slot :global(.document > h1) {
    margin-block: var(--sp-5) var(--sp-2);
    font-size: var(--fs-body);
    letter-spacing: 0;
  }

  .document-slot :global(.document > h2) {
    margin-block: var(--sp-5) var(--sp-2);
    font-size: var(--fs-body);
    letter-spacing: 0;
  }

  .document-slot :global(.document > :is(h1, h2):first-child) {
    margin-block-start: 0;
  }

  /* ── the lists inside tiles ────────────────────────────────────────── */

  /* A LIST WITHOUT BOXES: each line its title over its detail, the trailing edge for when or where it stands, and the
     tile's own heading the only icon. A line that opens its row takes a wash under a pointer, reaching to the tile's
     inside edge. */
  .items {
    display: flex;
    flex-direction: column;
    margin: 0 calc(-1 * var(--sp-2));
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    padding: 6px var(--sp-2);
    border-radius: 8px;
    color: inherit;
    text-decoration: none;
  }

  /* A place a person was seen leads with what kind of place it was, mail or a commit. */
  .item:has(.item-icon) {
    grid-template-columns: 20px minmax(0, 1fr) auto;
  }

  .item-icon {
    display: inline-flex;
    color: var(--ink-3);
  }

  .item-link {
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .item-link:hover {
      background: var(--tile-2);
    }
  }

  .item-main {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .item-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .item-detail {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .item-when {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* A POINTING ROW'S STATE: its dot, then its word, the word in the tone's ink where the tone is late or close. */
  .item-stands {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
  }

  .item-stands:is([data-intent='bad'], [data-intent='warn']) .stands-word {
    color: var(--tone);
  }

  /* ── the handoff ───────────────────────────────────────────────────── */

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
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
    overflow-wrap: anywhere;
  }

  .handoff-live {
    flex: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .sub-head {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .handoff-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.55;
    overflow-wrap: anywhere;
  }

  /* ── the toolbar's "…" ─────────────────────────────────────────────── */

  /* A SQUARE IN THE BUTTONS' SHAPE: the quiet fill and the 8 corner, as tall as the buttons beside it. */
  .head-more {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: var(--hover);
    border-radius: 8px;
    color: var(--ink);
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger:hover > .head-more) {
      background: var(--tile-2);
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

  /* ── the head's meta line ──────────────────────────────────────────── */

  /* A BOX THE HEAD IS DRAWN IN AND NOT A BOX ON THE PAGE, so the name's row still sticks from 900px up. */
  .row-head {
    display: contents;
  }

  /* WHERE THE ROW APPLIES LEADS THE LINE, the list's small chip, held level with the words. */
  .head-scope:has(:global(.scope-chip)) {
    display: inline-flex;
    margin-inline-end: var(--sp-2);
    vertical-align: middle;
  }

  /* ── the phone ─────────────────────────────────────────────────────── */

  @media (width < 900px) {
    .page {
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }

    /* THE NAME ON ITS OWN ROW, THREE LINES AT MOST, the "…" at its end and level with its first line. */
    .row-head :global(.page-head .head-main) {
      flex-wrap: wrap;
      align-items: start;
    }

    .row-head :global(.page-head .name-row) {
      margin-block-start: var(--sp-2);
    }

    .row-head :global(.page-head .name-words) {
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }

    /* THE ACTIONS' BOX GIVES WAY, so the "…" stays on the name's row and the primary takes the next one, at its own
       width under the name: a break after the "…", and the primary ordered after the break. */
    .row-head :global(.page-head .head-actions) {
      display: contents;
    }

    .row-head :global(.page-head .head-main:has([data-head-primary], [data-row-chart])::after) {
      content: '';
      flex-basis: 100%;
      order: 1;
    }

    /* SEND GOES WITH THE PRIMARY, under the name (1 Nov): beside the "…" it took 100px of the name's row and broke
       "Send Northbound invoices on the 1st, not the 15th." into four lines of two words. The name's row is the name
       and the "…"; the verbs are the row under it, the primary first. */
    .row-head :global(.page-head [data-head-primary]),
    .row-head :global(.page-head [data-row-chart]),
    .row-head :global(.page-head .head-main:has([data-head-primary], [data-row-chart]) .sb) {
      order: 2;
      margin-block-start: var(--sp-3);
    }

    /* AND WITH NO PRIMARY, SEND STAYS BESIDE THE "…" (1 Nov, L22): alone, it stood on a row of its own under the name. */
  }

  /* FORCED COLOURS DROP THE FILLS, so a control keeps an edge to be told from the ground by. */
  @media (forced-colors: active) {
    .add-field,
    .head-more {
      border: 1px solid CanvasText;
    }
  }
</style>
