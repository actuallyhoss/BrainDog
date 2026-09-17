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
  import { exponentOf, holeLabel, relative, since, TONES } from 'braindog-render';
  import { Document } from 'braindog-render/svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import * as pending from '$lib/record/pending.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { backlinks, currencyFor, dirOf, display, entry, iconFor, identityOf, labelOf, NOW, readableFields, REGISTERS, toneOf, values, whoDid } from '$lib/record/api.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import { Table } from 'braindog-render/svelte';
  import { readHistory, readNames, type Told } from '$lib/record/history-live.ts';
  import { rowReader, type Got, type RowReader } from '$lib/record/row-live.ts';
  import { rowWriter, type RowWriter } from '$lib/record/rows-write.ts';
  import { linkReader, type Linked, type LinkReader } from '$lib/record/links-live.ts';
  import type { FieldDecl, Fields } from '$lib/record/schema.ts';
  import { closed, drew, opened } from '../../../../lib/ui/screen.svelte.ts';

  const id = $derived(page.params.register ?? '');
  const seq = $derived(Number(page.params.seq));

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
  /* READ AGAIN ONCE THE ROW IS: a use case's own list is declared by the record, and `rowReader` learns it on the way
     (`remote.ts` `learn`), which a plain read of `REGISTERS` would not notice. */
  const decl = $derived.by(() => (void got, REGISTERS[id]));
  const live = $derived(got?.from === 'live');
  /* WHAT THIS RECORD CALLS THE ROWS THIS ONE POINTS AT. Undefined on the sample, where `display`
     names a ref out of the sample's own rows as it always has; on a record it is the only source,
     so a ref the record did not name is drawn as `<list>#<number>` and never as a sample row. */
  const names = $derived(got?.from === 'live' ? got.names : undefined);
  /* NOTHING IS DRAWN UNTIL THE ROW HAS BEEN READ, so the sample never shows over a live row. */
  const waiting = $derived(Number.isInteger(seq) && seq >= 1 && got === null);
  const written = $derived(
    got?.from === 'live' ? (got.entry ?? undefined) : got?.from === 'sample' ? entry(id, seq) : undefined,
  );
  const unwritten = $derived(written ? undefined : pending.of(id, got?.from === 'sample').find((r) => r.seq === seq));
  const row = $derived(written ?? unwritten);

  /* WHAT POINTS AT THIS ROW. A `ref` declares `to:` and nothing declared the other direction, so a
     person's page could not show the invoices that are theirs — which is the half somebody opens a
     person for. Nothing was added to the data model: the inverse of every ref is already stated
     once, on the field that declares it. */
  /* AND ON A LIVE RECORD IT IS THE RECORD'S OWN READ, which it was not: the section was left out
     entirely, because the sample's backlinks would be another record's rows pointing at this one.
     `backlinks` on the record walks the same `to:` declarations this sample walk does, so the live
     groups win wherever there are any and the sample keeps the screen it always had. */
  let linked = $state<Linked | null>(null);
  let links: LinkReader | null = null;
  /* A ROW THAT POINTS HERE LEADS WITH WHAT IT IS, NOT ITS NUMBER (DESIGN-SYSTEM rule 7, appendix C7). The
     relation arrives with `#` first; the column and every row's cell at that index move to the end. */
  const idLast = <R extends { columns: { field: string }[]; rows: { cells: (string | null)[] }[] }>(rel: R): R => {
    const at = rel.columns.findIndex((c) => c.field === 'seq');
    if (at < 0) return rel;
    const moved = <T,>(list: readonly T[]): T[] => [...list.slice(0, at), ...list.slice(at + 1), list[at]!];
    return { ...rel, columns: moved(rel.columns), rows: rel.rows.map((r) => ({ ...r, cells: moved(r.cells) })) };
  };

  const incoming = $derived(
    linked?.from === 'live' ? linked.groups : row && !live ? backlinks(id, seq) : [],
  );

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
    linked = null;
    archived = false;
    stopEdit();
    const at = opened();
    reader ??= rowReader(location.origin);
    links ??= linkReader(location.origin);
    /* THREE READS IN ONE BRACKET, for the reason the two were: `data-screen` must not appear between
       them, and what points at a row is part of the row's screen rather than a thing that arrives
       after it. */
    const [r, h, l] = await Promise.all([
      reader.read(register, n),
      readHistory(location.origin, register, n),
      links.read(register, n),
    ]);
    const current = askedFor === key;
    closed(!current || (r.from !== 'refused' && h.from !== 'refused'), at);
    if (!current) return;
    clock = r.from === 'live' ? Date.now() : NOW;
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

  /* A secret is never drawn and never edited: a credential does not go in a row (the vault is a
     different surface with different rules), and `readableFields` has already left it out. */
  const editable = (f: FieldDecl): boolean => f.type !== 'secret';

  /** The value as a box holds it: money in major units, everything else as the record stores it. */
  function draftOf(f: FieldDecl, value: unknown): string {
    if (value === null || value === undefined) return '';
    if (f.type !== 'money') return String(value);
    const minor = amountOf(value);
    if (minor === null) return '';
    return String(minor / 10 ** exponentOf(currencyOf(value) ?? currencyFor(id, f.id) ?? 'GBP'));
  }

  function startEdit(f: FieldDecl) {
    if (!row) return;
    /* ON THE SAMPLE, THE TOAST THIS SCREEN HAS ALWAYS SHOWN. There is no record to write to, and a
       box that takes what you type and drops it is worse than one that says so. */
    if (!live) {
      toasts.push(copy.notWritten('The row would open for editing'), { intent: 'warn' });
      return;
    }
    problem = null;
    editing = f.id;
    draft = draftOf(f, row.fields[f.id]);
    ticked = row.fields[f.id] === true;
    was = draft;
    wasTicked = ticked;
  }

  function stopEdit() {
    editing = null;
    draft = '';
    problem = null;
  }

  /** The header's own control: the row's title is the field somebody means by "edit the row". */
  function editTitle() {
    if (!live) {
      toasts.push(copy.notWritten('The row would open for editing'), { intent: 'warn' });
      return;
    }
    const fields = readableFields(id);
    const f = fields.find((x) => x.id === decl?.title) ?? fields.find(editable);
    if (f) startEdit(f);
  }

  const changed = (f: FieldDecl): boolean => (f.type === 'bool' ? ticked !== wasTicked : draft.trim() !== was.trim());

  /**
   * What the record would refuse about a money box, said where it was typed rather than at the save.
   *
   * THE EXPONENT IS THE CURRENCY'S: two decimals is most currencies and not all of them, and a field
   * that assumed two would refuse `KWD 1.250` and quietly mangle `JPY 1250`.
   */
  function wrongMoney(f: FieldDecl): string | null {
    if (f.type !== 'money') return null;
    const raw = draft.trim();
    if (raw === '') return null;
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return copy.moneyShape;
    const exp = exponentOf(currencyOf(row?.fields[f.id]) ?? currencyFor(id, f.id) ?? 'GBP');
    const places = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
    return places > exp ? copy.moneyPlaces(exp) : null;
  }

  /**
   * The one field, in the shape the record stores.
   *
   * A MONEY IS AN AMOUNT AND A CURRENCY and the box holds only the amount, so it is put back
   * together here, beside the exponent that took it apart. Everything else goes as it was typed and
   * `outbound` converts it: an empty box is `null`, which is how the record is told the row no
   * longer carries that field.
   */
  function patchOf(f: FieldDecl): Fields {
    if (f.type === 'bool') return { [f.id]: ticked };
    const raw = draft.trim();
    if (f.type !== 'money') return { [f.id]: raw };
    if (raw === '') return { [f.id]: null };
    const currency = currencyOf(row?.fields[f.id]) ?? currencyFor(id, f.id) ?? 'GBP';
    return { [f.id]: { amount: Math.round(Number(raw) * 10 ** exponentOf(currency)), currency } };
  }

  /** The history again, so the change somebody just made is in the list beside the row. */
  async function refreshHistory(register: string, n: number) {
    const key = `${register}#${n}`;
    const at = opened();
    const h = await readHistory(location.origin, register, n);
    const current = askedFor === key;
    closed(!current || h.from !== 'refused', at);
    if (current) told = h;
  }

  async function saveEdit(f: FieldDecl) {
    if (!row || saving || !live) return;
    const bad = wrongMoney(f);
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
    saving = true;
    problem = null;
    writer ??= rowWriter(location.origin);
    const out = await writer.update(register, n, patchOf(f), row.version);
    saving = false;
    if (askedFor !== key) return;
    if (out.ok) {
      got = { from: 'live', entry: out.entry, names: names ?? new Map() };
      stopEdit();
      toasts.push(copy.writeMarkSaved);
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

  /** Archive the row, or put it back: the same verb the list offers on the same row. */
  async function setArchived(to: boolean) {
    if (!row || saving) return;
    if (!live) {
      toasts.push(copy.notWritten(to ? copy.rowArchiveWould : copy.rowRestoreWould), { intent: 'warn' });
      return;
    }
    const named = String(row.fields[decl?.title ?? ''] ?? decl?.one.toLowerCase() ?? '');
    const register = id;
    const n = seq;
    const key = `${register}#${n}`;
    saving = true;
    writer ??= rowWriter(location.origin);
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
  let people = $state<ReadonlyMap<string, string>>(new Map());
  let namesAsked = false;
  $effect(() => {
    if (!live || namesAsked) return;
    if (!history.some((e) => /^p_/u.test(e.by) && e.by !== me)) return;
    namesAsked = true;
    void readNames(location.origin).then((m) => (people = m));
  });
  const addedWho = $derived(addedBy ? whoDid(addedBy, me || null, people) : null);

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

  /* TWO OR MORE EMPTY FIELDS FOLD INTO ONE LINE (DESIGN-SYSTEM APPENDIX C10). A person with four unset
     fields was a column of four "Not set" rows, each with a rule under it; the line names them, and on
     a record you can write to each name opens its field. */
  const unsetValue = (v: unknown) => v === null || v === undefined || v === '';
  const unsetFields = $derived(row ? listed.filter((f) => unsetValue(row.fields[f.id]) && editing !== f.id) : []);
  const shownFields = $derived(unsetFields.length >= 2 ? listed.filter((f) => !unsetFields.includes(f)) : listed);

  const resolved = values();
  /* THE SAMPLE'S VALUES ARE NOT THIS RECORD'S, so on a live row every value is a hole until pages read them. */
  const resolve = (path: string) => (live ? null : (resolved[path] ?? null));
  /** A link the host cannot resolve is plain text, never a dead anchor (36 §13 D16). */
  /** What closing a hole would do. Named, because "nothing was written" alone says nothing. */
  const holeFix = (path: string | null): string =>
    path
      ? `${holeLabel(path)} would be opened for whoever can supply it`
      : 'The unknown would be opened for whoever can supply it';
  const pressHole = (path: string | null) => toasts.push(copy.notWritten(holeFix(path)), { intent: 'warn' });

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
  <!-- Bars until the row has been read, never the sample's row. -->
  <Waiting head rows={6} />
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
        <Button weight="quiet" onclick={editTitle}>{copy.editRow}</Button>
        <!-- ARCHIVE IS THE LIST'S OWN VERB, on the row itself: a row that can be archived in one
             place and not the other is two products. `Put back` stands where `Archive` was for as
             long as this tab holds the row it just archived — see `archived` for why that moment is
             the only one it can be offered in. -->
        {#if archived}
          <Button weight="quiet" disabled={saving} onclick={() => void setArchived(false)}>{copy.rowRestore}</Button>
        {:else}
          <Button weight="quiet" disabled={saving} onclick={() => void setArchived(true)}>{copy.rowArchive}</Button>
        {/if}
      {/if}
    {/snippet}
  </PageHead>

  <div class="page">
    <!-- SAID ON THE ROW, because every list leaves an archived row out and nothing else on this
         screen would say why it has gone from them. -->
    {#if archived}
      <p class="archived-note">{copy.rowArchivedNote}</p>
    {/if}
    <!-- THE FIGURE HEADS THE LEFT COLUMN, AND DETAILS STARTS BESIDE IT. The lead sat above both
         columns, so the side column began 190px below the title it describes, beside the second
         field, and ended short of the header's right edge. -->
    <div class="split">
      <section class="fields">
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
                  <span class="lead-word">{copy.valueWord(stateValue)}</span>
                </span>
              {/if}
              {#if due && dueField}
                <span class="lead-due">{labelOf(dueField)} {display(id, dueField.id, due, clock, names)} <span class="rel">{relative(String(due), clock)}</span></span>
              {/if}
            </p>
          </section>
        {/if}
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
                        {#each f.values ?? [] as v}<option value={v}>{v.replace(/_/g, ' ')}</option>{/each}
                      </select>
                    {:else if f.type === 'day'}
                      <div class="field"><input class="field-input" type="date" bind:value={draft} /></div>
                    {:else if f.type === 'money'}
                      <div class="field">
                        {#if currencyOf(value) ?? currencyFor(id, f.id)}<span class="edit-unit">{currencyOf(value) ?? currencyFor(id, f.id)}</span>{/if}
                        <input class="field-input num" type="text" inputmode="decimal" bind:value={draft} />
                      </div>
                    {:else if f.type === 'int' || f.type === 'decimal' || f.type === 'duration'}
                      <div class="field">
                        <input class="field-input num" type="text" inputmode="decimal" bind:value={draft} />
                        {#if f.unit}<span class="edit-unit">{f.unit}</span>{/if}
                      </div>
                    {:else if f.type === 'ref'}
                      <div class="field">
                        <input class="field-input num" type="text" inputmode="numeric" bind:value={draft} />
                        {#if f.to}<span class="edit-unit">{REGISTERS[f.to]?.name ?? f.to}</span>{/if}
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
                {:else}
                  {#if value === null || value === undefined || value === ''}
                    <span class="missing">{copy.editNotSet}</span>
                  {:else if f.type === 'money'}
                    <Money minor={amountOf(value) ?? 0} currency={currencyOf(value) ?? ''} weight="strong" />
                  {:else if f.id === decl.state}
                    <Chip label={String(value).replace(/_/g, ' ')} {tone} />
                  {:else if identityOf(id, f.id, value, names)}
                    <IdentityMark identity={identityOf(id, f.id, value, names)!} size="md" />
                  {:else if f.type === 'day'}
                    {display(id, f.id, value, clock, names)}
                    <span class="rel">{relative(String(value), clock)}</span>
                  {:else if f.type === 'enum'}
                    <span class="enum-word">{copy.valueWord(display(id, f.id, value, clock, names) ?? '')}</span>
                  {:else}
                    {display(id, f.id, value, clock, names)}
                  {/if}
                  {#if live && editable(f)}
                    <button type="button" class="edit-field tap" aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>
                      <Icon name="edit" size="s" />
                    </button>
                  {/if}
                {/if}
              </dd>
            </div>
          {/each}
        </dl>
        {#if unsetFields.length >= 2}
          <p class="unset">
            <span class="unset-lead">{copy.editNotSet}</span>
            <span class="unset-names">{#each unsetFields as f, i (f.id)}{#if live && editable(f)}<button type="button" class="unset-name tap" aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>{labelOf(f)}</button>{:else}<span class="unset-name">{labelOf(f)}</span>{/if}{#if i < unsetFields.length - 1}<span class="unset-sep" aria-hidden="true">·</span>{/if}{/each}</span>
          </p>
        {/if}

        <!-- A `document` field is the dialect, drawn by the same interpreter a declared page uses.
             The read view IS the renderer, so what you are looking at is the artefact (22 §8). -->
        <!-- A DOCUMENT THE ROW DOES NOT CARRY YET IS STILL A FIELD THE REGISTER DECLARES. The slot
             was drawn only where there was already prose, so on a row with none this was the one
             field on the screen with no way in: not empty, absent, and indistinguishable from a
             register that declares no document at all. -->
        {#each documents as f}
          <article class="document-slot">
            <h2 class="doc-label">{labelOf(f)}</h2>
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
              {#if row.fields[f.id]}
                <!-- `hole` IS WHAT MAKES A HOLE PRESSABLE. Without it the renderer draws a marked
                     span rather than a `<button>` nobody wrote a handler for; with it, this screen
                     owns what pressing one does. No `dayHref`: there is no calendar in this build,
                     and a date that links to one is an anchor to the error page.
                     On a live record a value the record cannot answer is not pressable: nobody can
                     supply a declared figure from this screen, so it is marked and left alone. That
                     is the rule the page screen states beside its own `opts`, and a hole in a row's
                     prose is the same hole in the same dialect. -->
                <Document
                  src={String(row.fields[f.id])}
                  opts={{ resolve, link, now: clock, ...(live ? {} : { hole: pressHole }) }}
                />
              {:else}
                <p class="missing">{copy.editNotSet}</p>
              {/if}
              {#if live}
                <button type="button" class="edit-field tap" aria-label={copy.editValue(labelOf(f))} onclick={() => startEdit(f)}>
                  <Icon name="edit" size="s" />
                </button>
              {/if}
            {/if}
          </article>
        {/each}

        {#each incoming.map(idLast) as rel}
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
          <dd>{#if addedWho}{copy.rowAddedBy(since(row.created, clock), addedWho.you ? copy.rowByYou : addedWho.person && addedWho.name === copy.feedSomeone ? copy.rowBySomeone : addedWho.name)}{:else}{since(row.created, clock)}{/if}</dd>
        </dl>

        {#if !unwritten}
          <form class="note-form" onsubmit={addNote}>
            <label class="note-label" for="row-note">{copy.noteLabel}</label>
            <div class="note-line">
              <input id="row-note" class="note-input" type="text" maxlength="280" autocomplete="off" placeholder={copy.notePlaceholder} bind:value={noteText} />
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
              {@const who = whoDid(e.by, me || null, people)}
              <li>
                <Face name={who.name} you={who.you} size="s" />
                <span class="history-by">{who.name.charAt(0).toUpperCase() + who.name.slice(1)}</span>
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

  /* THE CONTROL THAT OPENS A FIELD, beside the value it changes. `.tap` is the invisible 44 x 44
     hit box: a 16px glyph in a padded span is a 16px target to a finger. */
  .edit-field {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--sp-1);
    background: none;
    border: 0;
    border-radius: var(--r-sm);
    color: var(--dim);
    cursor: pointer;
  }

  .edit-field:hover {
    background: var(--hover-wash);
    color: var(--ink2);
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
    border-radius: var(--r-lg);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
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
    color: var(--accent-text);
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

  /* The same two tracks a fact has, so "Not set" sits in the label column. */
  .unset {
    display: grid;
    grid-template-columns: minmax(0, 16ch) minmax(0, 1fr);
    gap: var(--sp-4);
    align-items: baseline;
    margin: 0;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .unset-lead {
    font-weight: 600;
  }

  .unset-names {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-2);
  }

  .unset-name {
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
  }

  button.unset-name {
    cursor: pointer;
  }

  button.unset-name:hover {
    color: var(--ink);
    text-decoration: underline;
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

  /* The code in front of the figure at half its size, the way every headline figure sets it — `em`
     rather than a fixed step, so it stays half of `.lead-figure` (`--t-3xl`) specifically and not
     a size that happens to look right today. Matches `.cell-figure`/`.cards-figure .amount-code`
     in blocks.css. */
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
